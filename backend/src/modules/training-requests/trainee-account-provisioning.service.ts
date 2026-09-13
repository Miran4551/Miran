import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { IAuthenticatedUser } from '../../common/interfaces';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { TRAINEE_PROFILE_STATUS } from '../../common/status-constants';

export interface ProvisionTraineeResult {
  personId: string;
  profileId: string;
  accountId: string;
  accountEmail: string;
  activationToken: string | null;
  isNewToken: boolean;
  isNewAccount: boolean;
}

@Injectable()
export class TraineeAccountProvisioningService {
  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
  ) {}

  async provisionForHospitalApproval(
    row: Prisma.TrainingRequestTraineeGetPayload<Record<string, never>>,
    request: { targetOrgId: string; academicIntakeId: string | null; programId: string | null },
    hospitalId: string,
    user: IAuthenticatedUser,
    tx: Prisma.TransactionClient,
  ): Promise<ProvisionTraineeResult> {
    const cleanNationalId = (row.nationalId || '').trim();
    const cleanEmail = row.email ? row.email.trim().toLowerCase() : null;
    const person = await this.ensureAndLockPerson(cleanNationalId, row, cleanEmail, user, tx);
    const profile = await this.ensureTraineeProfile(person.id, row, request, hospitalId, user, tx);
    const accountResult = await this.ensureUserAccount(
      person.id,
      cleanNationalId,
      cleanEmail,
      hospitalId,
      request.targetOrgId,
      user,
      tx,
    );

    await tx.document.updateMany({
      where: { trainingRequestTraineeId: row.id },
      data: { traineeProfileId: profile.id, userId: accountResult.account.id },
    });

    await tx.auditLog.create({
      data: {
        organizationId: hospitalId || request.targetOrgId,
        actorId: user?.accountId,
        action: 'trainee_account_provisioned',
        entityType: 'UserAccount',
        entityId: accountResult.account.id,
        newValues: {
          personId: person.id,
          profileId: profile.id,
          hospitalId,
          isNewAccount: accountResult.isNewAccount,
          hasActiveToken: Boolean(accountResult.activationToken),
        },
      },
    });

    return {
      personId: person.id,
      profileId: profile.id,
      accountId: accountResult.account.id,
      accountEmail: accountResult.account.email,
      activationToken: accountResult.activationToken,
      isNewToken: accountResult.isNewToken,
      isNewAccount: accountResult.isNewAccount,
    };
  }

  private async ensureAndLockPerson(
    nationalId: string,
    row: Prisma.TrainingRequestTraineeGetPayload<Record<string, never>>,
    cleanEmail: string | null,
    user: IAuthenticatedUser,
    tx: Prisma.TransactionClient,
  ) {
    let person: { id: string };
    const defaultEmail = cleanEmail || `${nationalId}@trainee.miran.health`;
    try {
      person = await tx.person.upsert({
        where: { nationalId },
        create: {
          nationalId,
          nameAr: row.nameAr,
          nameEn: row.nameEn,
          gender: row.gender,
          phone: row.mobile || null,
          email: defaultEmail,
          createdById: user?.accountId,
        },
        update: {
          nameAr: row.nameAr,
          nameEn: row.nameEn,
          gender: row.gender,
          phone: row.mobile || undefined,
          ...(cleanEmail ? { email: cleanEmail } : {}),
        },
        select: { id: true },
      });
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const found = await tx.person.findUnique({ where: { nationalId }, select: { id: true } });
        if (!found) throw err;
        person = found;
      } else throw err;
    }
    try {
      await tx.$executeRaw`SELECT id FROM "persons" WHERE id = ${person.id}::uuid FOR UPDATE`;
    } catch {}
    return person;
  }

  private async ensureTraineeProfile(
    personId: string,
    row: Prisma.TrainingRequestTraineeGetPayload<Record<string, never>>,
    request: { targetOrgId: string; academicIntakeId: string | null; programId: string | null },
    hospitalId: string,
    user: IAuthenticatedUser,
    tx: Prisma.TransactionClient,
  ) {
    const existing = await tx.traineeProfile.findUnique({ where: { personId } });
    const updateData = {
      organizationId: hospitalId || row.assignedHospitalId || request.targetOrgId,
      sponsorOrganizationId: row.universityOrgId || undefined,
      programId: request.programId || undefined,
      academicIntakeId: request.academicIntakeId || undefined,
      applicationStatus: TRAINEE_PROFILE_STATUS.APPROVED,
      accessStartDate: row.startDate,
      accessEndDate: row.endDate,
      updatedById: user?.accountId,
    };

    if (existing) {
      if (typeof (tx.traineeProfile as any).update === 'function') {
        return tx.traineeProfile.update({ where: { personId }, data: updateData });
      }
      return tx.traineeProfile.upsert({
        where: { personId },
        create: { ...existing, ...updateData },
        update: updateData,
      });
    }

    const baseTraineeNumber = row.academicNumber?.trim() || `TRN-${personId.slice(0, 8)}`;
    const conflicting = await tx.traineeProfile.findUnique({
      where: { traineeNumber: baseTraineeNumber },
      select: { id: true, personId: true },
    });
    const traineeNumber =
      !conflicting || conflicting.personId === personId
        ? baseTraineeNumber
        : `TRN-${baseTraineeNumber}-${personId.slice(0, 8)}`;

    const createData = {
      personId,
      organizationId: hospitalId || row.assignedHospitalId || request.targetOrgId,
      sponsorOrganizationId: row.universityOrgId,
      traineeNumber,
      level: 'intern',
      specialtyEn: row.specialty,
      programId: request.programId,
      academicIntakeId: request.academicIntakeId,
      applicationStatus: TRAINEE_PROFILE_STATUS.APPROVED,
      accessStartDate: row.startDate,
      accessEndDate: row.endDate,
      createdById: user?.accountId,
    };

    if (typeof (tx.traineeProfile as any).create === 'function') {
      return tx.traineeProfile.create({ data: createData });
    }
    return tx.traineeProfile.upsert({
      where: { personId },
      create: createData,
      update: updateData,
    });
  }

  private async ensureUserAccount(
    personId: string,
    nationalId: string,
    preferredEmail: string | null,
    hospitalId: string,
    clusterOrgId: string,
    user: IAuthenticatedUser,
    tx: Prisma.TransactionClient,
  ) {
    let account = await tx.userAccount.findFirst({
      where: { personId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    });
    let isNewAccount = false;
    let isNewToken = false;
    let activationToken: string | null = null;

    if (!account) {
      const deletedAccount = await tx.userAccount.findFirst({
        where: { personId, deletedAt: { not: null } },
        orderBy: { updatedAt: 'desc' },
      });
      if (deletedAccount) {
        const accountIdentity = await this.resolveUniqueAccountIdentity(personId, nationalId, preferredEmail, tx);
        isNewToken = !deletedAccount.activatedAt;
        activationToken = isNewToken ? randomUUID() : null;
        const activationTokenExpiresAt = activationToken ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : null;
        if (isNewToken) {
          const unusableRandomHash = await bcrypt.hash(randomUUID(), 10);
          account = await tx.userAccount.update({
            where: { id: deletedAccount.id },
            data: {
              deletedAt: null,
              deletedById: null,
              isActive: true,
              isEmailVerified: false,
              username: accountIdentity.username,
              email: accountIdentity.email,
              passwordHash: unusableRandomHash,
              activationToken,
              activationTokenExpiresAt,
              updatedById: user?.accountId,
            },
          });
        } else {
          account = await tx.userAccount.update({
            where: { id: deletedAccount.id },
            data: {
              deletedAt: null,
              deletedById: null,
              isActive: true,
              username: accountIdentity.username,
              email: accountIdentity.email,
              updatedById: user?.accountId,
            },
          });
        }
      }
    }

    if (!account) {
      isNewAccount = true;
      isNewToken = true;
      activationToken = randomUUID();
      const activationTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const unusableRandomHash = await bcrypt.hash(randomUUID(), 10);
      const accountIdentity = await this.resolveUniqueAccountIdentity(personId, nationalId, preferredEmail, tx);
      try {
        account = await tx.userAccount.create({
          data: {
            personId,
            username: accountIdentity.username,
            email: accountIdentity.email,
            passwordHash: unusableRandomHash,
            isActive: true,
            isEmailVerified: false,
            activationToken,
            activationTokenExpiresAt,
            createdById: user?.accountId,
          },
        });
      } catch (err: any) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          const recovered = await tx.userAccount.findFirst({ where: { personId, deletedAt: null } });
          if (recovered) {
            account = recovered;
            isNewAccount = false;
            isNewToken = false;
            activationToken = recovered.activationToken;
          } else throw err;
        } else throw err;
      }
    } else if (!isNewToken) {
      activationToken = account.activationToken || null;
    }

    await this.ensureTraineeRoleAndAssignments(
      account.id,
      Array.from(new Set([hospitalId, clusterOrgId].filter(Boolean) as string[])),
      user,
      tx,
    );
    return { account, isNewAccount, isNewToken, activationToken };
  }

  private async resolveUniqueAccountIdentity(
    personId: string,
    nationalId: string,
    preferredEmail: string | null,
    tx: Prisma.TransactionClient,
  ): Promise<{ username: string; email: string }> {
    const baseUsername = nationalId || `trainee-${personId.slice(0, 8)}`;
    const baseEmail = preferredEmail || `${nationalId}@trainee.miran.health`;
    const usernameOwner = await tx.userAccount.findFirst({ where: { username: baseUsername }, select: { personId: true } });
    const emailOwner = await tx.userAccount.findFirst({ where: { email: baseEmail }, select: { personId: true } });
    const usernameAvailable = !usernameOwner || usernameOwner.personId === personId;
    const emailAvailable = !emailOwner || emailOwner.personId === personId;
    const suffix = personId.replace(/-/g, '').slice(0, 8);
    const fallbackUsername = `${baseUsername}-${suffix}`.slice(0, 100);
    const fallbackEmail = `trainee-${suffix}@trainee.miran.health`;
    let username = usernameAvailable ? baseUsername : fallbackUsername;
    let email = emailAvailable ? baseEmail : fallbackEmail;
    const fallbackCollision = await tx.userAccount.findFirst({
      where: { OR: [{ username }, { email }], NOT: { personId } },
      select: { id: true },
    });
    if (fallbackCollision) {
      const stable = personId.replace(/-/g, '');
      username = `${baseUsername}-${stable}`.slice(0, 100);
      email = `trainee-${stable}@trainee.miran.health`;
    }
    return { username, email };
  }

  private async ensureTraineeRoleAndAssignments(accountId: string, orgIds: string[], user: IAuthenticatedUser, tx: Prisma.TransactionClient) {
    const traineeRole = await tx.role.findUnique({ where: { code: 'trainee' } });

    // OrganizationAssignment is the authoritative membership model. The database
    // enforces one active primary assignment per account, so preserve that primary
    // and only choose the first organization when the account has none.
    const activePrimaryAssignment = await tx.organizationAssignment.findFirst({
      where: { userAccountId: accountId, isPrimary: true, isActive: true },
      select: { organizationId: true },
    });
    const primaryOrgId = activePrimaryAssignment?.organizationId ?? orgIds[0] ?? null;

    for (const orgId of orgIds) {
      const shouldBePrimary = primaryOrgId === orgId;

      if (traineeRole) {
        await tx.userRole.upsert({
          where: { userAccountId_roleId_organizationId: { userAccountId: accountId, roleId: traineeRole.id, organizationId: orgId } },
          create: { userAccountId: accountId, roleId: traineeRole.id, organizationId: orgId },
          update: {},
        });
      }
      await tx.userOrganization.upsert({
        where: { userAccountId_organizationId: { userAccountId: accountId, organizationId: orgId } },
        create: { userAccountId: accountId, organizationId: orgId, isPrimary: shouldBePrimary, isActive: true },
        update: { isActive: true, isPrimary: shouldBePrimary },
      });
      const existingAssignment = await tx.organizationAssignment.findFirst({
        where: { userAccountId: accountId, organizationId: orgId, sourceType: { in: ['user_organization', 'user_role', 'manual'] } },
      });
      if (!existingAssignment) {
        await tx.organizationAssignment.create({
          data: {
            userAccountId: accountId,
            organizationId: orgId,
            roleId: traineeRole?.id ?? null,
            assignmentType: 'permanent',
            isPrimary: shouldBePrimary,
            isActive: true,
            sourceType: 'user_organization',
            createdById: user?.accountId,
          },
        });
      } else if (!existingAssignment.roleId && traineeRole) {
        await tx.organizationAssignment.update({ where: { id: existingAssignment.id }, data: { roleId: traineeRole.id, isActive: true } });
      }
    }
  }

  async sendActivationNotification(accountId: string, orgId: string, profileId: string, accountEmail: string, isNewToken: boolean): Promise<void> {
    if (!isNewToken) return;
    try {
      await this.notificationService.create({
        organizationId: orgId,
        userId: accountId,
        titleAr: 'تم اعتماد طلب تدريبك من المستشفى',
        bodyAr: `تم اعتماد ملفك التدريبي وإنشاء حسابك في منصة Miran (${accountEmail}). استخدم رابط التفعيل لإعداد كلمة المرور الخاصة بك.`,
        type: 'trainee_approved',
        referenceType: 'TraineeProfile',
        referenceId: profileId,
        channels: ['in_app', 'email'],
      });
    } catch {}
  }
}
