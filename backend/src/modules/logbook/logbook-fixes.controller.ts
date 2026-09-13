import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUser, RequireRoles } from '../../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { IAuthenticatedUser } from '../../common/interfaces';

@ApiTags('Logbook workflow fixes')
@ApiBearerAuth('JWT-auth')
@Controller('logbook')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LogbookFixesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('trainer-trainees')
  @RequireRoles('trainer')
  @ApiOperation({ summary: 'المتدربون المسندون إلى المدرب الحالي' })
  async trainerTrainees(@CurrentUser() user: IAuthenticatedUser) {
    const trainer = await this.findTrainer(user);
    if (!trainer) return { data: [] };

    const rows = await this.prisma.rotation.findMany({
      where: { trainerProfileId: trainer.id, status: { in: ['scheduled', 'active'] } },
      orderBy: { startDate: 'asc' },
      include: {
        traineeProfile: { include: { person: true } },
        department: true,
      },
    });

    const unique = new Map<string, any>();
    for (const row of rows) {
      if (!unique.has(row.traineeProfileId)) {
        unique.set(row.traineeProfileId, {
          traineeProfileId: row.traineeProfileId,
          nameAr: row.traineeProfile.person.nameAr,
          traineeNumber: row.traineeProfile.traineeNumber,
          rotationId: row.id,
          departmentNameAr: row.department.nameAr,
          startDate: row.startDate,
          endDate: row.endDate,
        });
      }
    }
    return { data: [...unique.values()] };
  }

  @Get('trainer-options')
  @RequireRoles('trainee')
  @ApiOperation({ summary: 'المدربون المتاحون للمتدرب الحالي حسب الروتيشن النشط' })
  async trainerOptions(@CurrentUser() user: IAuthenticatedUser) {
    const profile = await this.findTrainee(user);
    if (!profile) return { data: [] };

    const rotations = await this.prisma.rotation.findMany({
      where: { traineeProfileId: profile.id, status: { in: ['scheduled', 'active'] } },
      orderBy: { startDate: 'asc' },
      include: {
        trainerProfile: { include: { person: true, department: true } },
        department: true,
      },
    });

    return {
      data: rotations.map((r) => ({
        rotationId: r.id,
        trainerProfileId: r.trainerProfileId,
        trainerNameAr: r.trainerProfile.person.nameAr,
        departmentNameAr: r.department.nameAr,
        startDate: r.startDate,
        endDate: r.endDate,
      })),
    };
  }

  @Post('trainee-entry')
  @RequireRoles('trainee')
  @ApiOperation({ summary: 'تسجيل حالة/إجراء سريري من حساب المتدرب مع تحديد المدرب' })
  async createTraineeEntry(
    @CurrentUser() user: IAuthenticatedUser,
    @Body() dto: {
      diagnosis: string;
      procedureId?: string;
      rotationId: string;
      participationLevel?: string;
      complexity?: string;
      notes?: string;
    },
  ) {
    const profile = await this.findTrainee(user);
    if (!profile) throw new BadRequestException('لا يوجد ملف متدرب مرتبط بهذا الحساب');
    if (!dto.diagnosis?.trim()) throw new BadRequestException('التشخيص أو وصف الحالة إلزامي');
    if (!dto.rotationId) throw new BadRequestException('يجب اختيار الروتيشن والمدرب المشرف');

    const rotation = await this.prisma.rotation.findFirst({
      where: { id: dto.rotationId, traineeProfileId: profile.id, status: { in: ['scheduled', 'active'] } },
    });
    if (!rotation) throw new ForbiddenException('الروتيشن المحدد غير مرتبط بك');
    if (profile.isLocked) throw new ForbiddenException('ملف المتدرب مغلق بعد التخرج');

    const entry = await this.prisma.clinicalCaseLog.create({
      data: {
        organizationId: profile.organizationId,
        traineeProfileId: profile.id,
        trainerProfileId: rotation.trainerProfileId,
        rotationId: rotation.id,
        departmentId: rotation.departmentId,
        procedureId: dto.procedureId || null,
        diagnosis: dto.diagnosis.trim(),
        participationLevel: dto.participationLevel || 'performed',
        complexity: dto.complexity || 'medium',
        notes: dto.notes || null,
        status: 'submitted',
        performedAt: new Date(),
      },
    });

    if (dto.procedureId) {
      const proc = await this.prisma.procedureCatalog.findUnique({ where: { id: dto.procedureId } });
      if (!proc) throw new NotFoundException('الإجراء المحدد غير موجود');
      const existing = await this.prisma.competencyProgress.findUnique({
        where: { traineeProfileId_procedureId: { traineeProfileId: profile.id, procedureId: dto.procedureId } },
      });
      if (existing) {
        const completedCount = existing.completedCount + 1;
        await this.prisma.competencyProgress.update({
          where: { id: existing.id },
          data: { completedCount, status: completedCount >= existing.requiredCount ? 'completed' : 'in_progress', lastUpdated: new Date() },
        });
      } else {
        await this.prisma.competencyProgress.create({
          data: {
            traineeProfileId: profile.id,
            procedureId: dto.procedureId,
            requiredCount: proc.minRequired,
            completedCount: 1,
            status: 1 >= proc.minRequired ? 'completed' : 'in_progress',
          },
        });
      }
    }

    await this.prisma.notification.create({
      data: {
        organizationId: profile.organizationId,
        userId: (await this.prisma.trainerProfile.findUnique({ where: { id: rotation.trainerProfileId }, include: { person: { include: { userAccounts: { select: { id: true }, take: 1 } } } } }))?.person.userAccounts[0]?.id || user.accountId,
        titleAr: 'إجراء سريري جديد بانتظار اعتمادك',
        bodyAr: `قام ${profile.person.nameAr} بتسجيل: ${dto.diagnosis.trim()}`,
        type: 'logbook_approval_required',
        referenceType: 'ClinicalCaseLog',
        referenceId: entry.id,
        sentVia: 'in_app',
      },
    }).catch(() => undefined);

    return { success: true, data: entry };
  }

  @Post('entries/:id/sign')
  @RequireRoles('trainer')
  @ApiOperation({ summary: 'توقيع واعتماد سجل سريري للمتدرب المسند' })
  async signEntry(
    @Param('id') id: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Body() dto: { signatureHash?: string; feedback?: string },
  ) {
    const trainer = await this.findTrainer(user);
    if (!trainer) throw new ForbiddenException('لا يوجد ملف مدرب مرتبط بالحساب');

    const entry = await this.prisma.clinicalCaseLog.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('السجل غير موجود');
    if (entry.trainerProfileId !== trainer.id) throw new ForbiddenException('السجل غير مسند إليك');
    if (entry.status !== 'submitted') throw new BadRequestException('السجل ليس بانتظار اعتماد المدرب');

    const rotation = await this.prisma.rotation.findFirst({
      where: { id: entry.rotationId || undefined, traineeProfileId: entry.traineeProfileId, trainerProfileId: trainer.id, status: { in: ['scheduled', 'active', 'completed'] } },
    });
    if (!rotation) throw new ForbiddenException('الروتيشن غير مرتبط بهذا المدرب');

    const updated = await this.prisma.clinicalCaseLog.update({
      where: { id },
      data: { status: 'trainer_approved' },
    });

    const signoff = await this.prisma.logbookSignoff.create({
      data: {
        caseLogId: id,
        signerId: user.accountId,
        signerRole: 'trainer',
        signatureUrl: dto.signatureHash ? `signature-sha256:${dto.signatureHash.slice(0, 128)}` : null,
        feedback: dto.feedback,
        signedAt: new Date(),
      },
    });

    const trainee = await this.prisma.traineeProfile.findUnique({
      where: { id: entry.traineeProfileId },
      include: { person: { include: { userAccounts: { select: { id: true }, take: 1 } } } },
    });
    const traineeAccountId = trainee?.person.userAccounts[0]?.id;
    if (traineeAccountId) {
      await this.prisma.notification.create({
        data: {
          organizationId: entry.organizationId,
          userId: traineeAccountId,
          titleAr: 'تم توقيع واعتماد السجل السريري',
          bodyAr: `تم اعتماد السجل: ${entry.diagnosis}`,
          type: 'logbook_approved',
          referenceType: 'ClinicalCaseLog',
          referenceId: id,
          sentVia: 'in_app',
        },
      }).catch(() => undefined);
    }
    return { success: true, data: { entry: updated, signoff } };
  }

  @Post('procedures-admin')
  @RequireRoles('trainer', 'hospital_training_admin', 'academic_supervisor', 'org_manager', 'platform_owner', 'cluster_administrator', 'training_director')
  @ApiOperation({ summary: 'إضافة إجراء إلى مكتبة الإجراءات' })
  async createProcedure(@CurrentUser() user: IAuthenticatedUser, @Body() dto: { code: string; titleAr: string; titleEn?: string; category: string; minRequired?: number; descriptionAr?: string }) {
    if (!dto.code?.trim() || !dto.titleAr?.trim() || !dto.category?.trim()) throw new BadRequestException('الرمز والاسم والفئة حقول إلزامية');
    const proc = await this.prisma.procedureCatalog.create({ data: { code: dto.code.trim(), titleAr: dto.titleAr.trim(), titleEn: dto.titleEn?.trim() || dto.titleAr.trim(), category: dto.category.trim(), minRequired: dto.minRequired && dto.minRequired > 0 ? dto.minRequired : 5, descriptionAr: dto.descriptionAr } });
    return { success: true, data: proc };
  }

  @Patch('procedures-admin/:id')
  @RequireRoles('trainer', 'hospital_training_admin', 'academic_supervisor', 'org_manager', 'platform_owner', 'cluster_administrator', 'training_director')
  async updateProcedure(@Param('id') id: string, @Body() dto: { code?: string; titleAr?: string; titleEn?: string; category?: string; minRequired?: number; descriptionAr?: string; isActive?: boolean }) {
    const proc = await this.prisma.procedureCatalog.findUnique({ where: { id } });
    if (!proc) throw new NotFoundException('الإجراء غير موجود');
    const data: any = {};
    for (const key of ['code', 'titleAr', 'titleEn', 'category', 'descriptionAr', 'isActive']) {
      if ((dto as any)[key] !== undefined) data[key] = (dto as any)[key];
    }
    if (dto.minRequired !== undefined) data.minRequired = Math.max(1, Number(dto.minRequired));
    return { success: true, data: await this.prisma.procedureCatalog.update({ where: { id }, data }) };
  }

  @Delete('procedures-admin/:id')
  @RequireRoles('trainer', 'hospital_training_admin', 'academic_supervisor', 'org_manager', 'platform_owner', 'cluster_administrator', 'training_director')
  async deleteProcedure(@Param('id') id: string) {
    const proc = await this.prisma.procedureCatalog.findUnique({ where: { id } });
    if (!proc) throw new NotFoundException('الإجراء غير موجود');
    const usage = await this.prisma.clinicalCaseLog.count({ where: { procedureId: id } });
    if (usage > 0) {
      const data = await this.prisma.procedureCatalog.update({ where: { id }, data: { isActive: false } });
      return { success: true, data, softDeleted: true, message: 'للإجراء سجلات سريرية سابقة، لذلك تم تعطيله بدل الحذف النهائي.' };
    }
    await this.prisma.procedureCatalog.delete({ where: { id } });
    return { success: true, deleted: true };
  }

  private async findTrainer(user: IAuthenticatedUser) {
    return this.prisma.trainerProfile.findFirst({
      where: { OR: [ { person: { userAccounts: { some: { id: user.accountId } } } }, ...(user.personId ? [{ personId: user.personId }] : []) ] },
      include: { person: true, department: true },
    });
  }

  private async findTrainee(user: IAuthenticatedUser) {
    return this.prisma.traineeProfile.findFirst({
      where: { OR: [ { person: { userAccounts: { some: { id: user.accountId } } } }, ...(user.personId ? [{ personId: user.personId }] : []) ] },
      include: { person: true, organization: true },
    });
  }
}
