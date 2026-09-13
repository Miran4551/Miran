import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Query,
  ConflictException,
  GoneException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AdminChangeTraineePasswordDto } from './dto/admin-change-trainee-password.dto';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { CurrentUser, Public, RequireRoles } from '../../common/decorators';
import { IAuthenticatedUser } from '../../common/interfaces';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { CapacityService } from '../organizations/capacity.service';
import { TraineeAllocationService } from '../training-requests/trainee-allocation.service';
import {
  CAPABILITIES,
  CapabilityGuard,
  RequireCapability,
  Scope,
  ScopeContext,
  ScopeContextService,
} from '../../common/authz';

@ApiTags('Trainees (المتدربون)')
@Controller('trainees')
@UseGuards(JwtAuthGuard, RolesGuard, CapabilityGuard)
@ApiBearerAuth('JWT-auth')
export class TraineesController {
  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
    private capacityService: CapacityService,
    private allocationService: TraineeAllocationService,
    private cardJwt: JwtService,
    private scopeContext: ScopeContextService,
  ) {}

  @Get('me')
  @RequireRoles('trainee', 'platform_owner', 'org_manager')
  async getMyProfile(@CurrentUser() user: IAuthenticatedUser) {
    let profile = await this.prisma.traineeProfile.findFirst({
      where: { person: { userAccounts: { some: { id: user.accountId } } } },
      include: { person: true, organization: true, program: true, rotations: { orderBy: { startDate: 'asc' }, include: { department: true, trainerProfile: { include: { person: true } } } } },
    });
    if (!profile && (user.roles.includes('platform_owner') || user.roles.includes('org_manager'))) {
      profile = await this.prisma.traineeProfile.findFirst({
        include: { person: true, organization: true, program: true, rotations: { orderBy: { startDate: 'asc' }, include: { department: true, trainerProfile: { include: { person: true } } } } },
      });
    }
    if (!profile) return { message: 'لا يوجد ملف متدرب لهذا الحساب' };
    const totalObjectives = await this.prisma.objectiveProgress.count({ where: { traineeProfileId: profile.id } });
    const completedObjectives = await this.prisma.objectiveProgress.count({ where: { traineeProfileId: profile.id, status: 'completed' } });
    const completionPercentage = totalObjectives > 0 ? Math.round((completedObjectives / totalObjectives) * 100) : 0;
    const competencies = await this.prisma.competencyProgress.findMany({ where: { traineeProfileId: profile.id }, include: { procedure: true } });
    return { ...profile, certifications: [], skills: competencies.map((c) => ({ nameAr: c.procedure.titleAr, level: c.requiredCount > 0 ? Math.min(100, Math.round((c.completedCount / c.requiredCount) * 100)) : 0, category: c.procedure.category })), completionPercentage, qrCodeData: `MIRAN-DIGITAL-ID-${profile.traineeNumber}-${profile.cardUuid || profile.id}` };
  }

  @Get('my-colleagues')
  @RequireRoles('trainee', 'platform_owner', 'org_manager')
  async getMyColleagues(@CurrentUser() user: IAuthenticatedUser) {
    const profile = await this.prisma.traineeProfile.findFirst({ where: { person: { userAccounts: { some: { id: user.accountId } } } } });
    if (!profile) return { data: [] };
    const myRotation = await this.prisma.rotation.findFirst({ where: { traineeProfileId: profile.id, status: 'active' } });
    if (!myRotation) return { data: [] };
    const overlapping = myRotation.startDate && myRotation.endDate ? { startDate: { lte: myRotation.endDate }, endDate: { gte: myRotation.startDate } } : {};
    const rotations = await this.prisma.rotation.findMany({ where: { status: 'active', trainerProfileId: myRotation.trainerProfileId, departmentId: myRotation.departmentId, organizationId: myRotation.organizationId, traineeProfileId: { not: profile.id }, ...overlapping }, include: { traineeProfile: { include: { person: true, program: true } }, department: true }, distinct: ['traineeProfileId'] });
    return { data: rotations.map((r) => ({ traineeProfileId: r.traineeProfileId, nameAr: r.traineeProfile.person.nameAr, nameEn: r.traineeProfile.person.nameEn, specialty: r.traineeProfile.program?.nameAr ?? null, departmentNameAr: r.department.nameAr, trainingStatus: r.traineeProfile.applicationStatus, academicNumber: r.traineeProfile.traineeNumber })) };
  }

  @Get('card/qr-token')
  @RequireRoles('trainee', 'platform_owner', 'org_manager')
  async getCardQrToken(@CurrentUser() user: IAuthenticatedUser) {
    const profile = await this.prisma.traineeProfile.findFirst({ where: { person: { userAccounts: { some: { id: user.accountId } } } } });
    if (!profile) throw new BadRequestException('لا يوجد ملف متدرب لهذا الحساب');
    if (!profile.cardUuid) throw new BadRequestException('لم يتم إصدار بطاقة لهذا المتدرب بعد');
    const token = await this.cardJwt.signAsync({ sub: profile.id, cuid: profile.cardUuid }, { expiresIn: '365d' });
    return { data: { token } };
  }

  @Public()
  @Get('card/verify')
  async verifyCard(@Query('token') token: string) {
    if (!token) throw new BadRequestException('الرمز مطلوب');
    let payload: { sub: string; cuid: string };
    try { payload = await this.cardJwt.verifyAsync(token); } catch { return { data: { valid: false, reason: 'رمز غير صالح أو منتهي الصلاحية' } }; }
    const profile = await this.prisma.traineeProfile.findUnique({ where: { id: payload.sub }, include: { person: true, program: true, organization: true, sponsorOrganization: true, rotations: { where: { status: 'active' }, take: 1, include: { department: true, trainerProfile: { include: { person: true } } } } } });
    if (!profile || profile.cardUuid !== payload.cuid) return { data: { valid: false, reason: 'البطاقة غير مرتبطة بأي متدرب فعلي' } };
    if (profile.cardStatus !== 'active') return { data: { valid: false, reason: 'البطاقة ملغاة أو منتهية الصلاحية', cardStatus: profile.cardStatus } };
    const rotation = profile.rotations[0];
    return { data: { valid: true, nameAr: profile.person.nameAr, specialty: profile.program?.nameAr ?? null, university: profile.sponsorOrganization?.nameAr ?? null, hospital: profile.organization?.nameAr ?? null, department: rotation?.department?.nameAr ?? null, trainer: rotation?.trainerProfile?.person?.nameAr ?? null, cardStatus: profile.cardStatus } };
  }

  @Get('dashboard-summary')
  @RequireRoles('trainee', 'platform_owner', 'org_manager')
  async getDashboardSummary(@CurrentUser() user: IAuthenticatedUser) {
    const profile = await this.prisma.traineeProfile.findFirst({ where: { person: { userAccounts: { some: { id: user.accountId } } } } });
    if (!profile) return { message: 'لا يوجد ملف متدرب' };
    const activeRotation = await this.prisma.rotation.findFirst({ where: { traineeProfileId: profile.id, status: 'active' }, include: { department: true, trainerProfile: { include: { person: true } } } });
    let remainingDays = 0;
    if (activeRotation) remainingDays = Math.max(0, Math.ceil((new Date(activeRotation.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
    const todayShift = await this.prisma.shift.findFirst({ where: { traineeProfileId: profile.id, date: new Date() }, include: { department: true } });
    const totalObjs = await this.prisma.objectiveProgress.count({ where: { traineeProfileId: profile.id } });
    const completedObjs = await this.prisma.objectiveProgress.count({ where: { traineeProfileId: profile.id, status: 'completed' } });
    const attendanceRecords = await this.prisma.attendance.findMany({ where: { traineeProfileId: profile.id }, take: 7, orderBy: { date: 'desc' } });
    const presentCount = attendanceRecords.filter((a) => a.status === 'present').length;
    const userAcc = await this.prisma.userAccount.findFirst({ where: { personId: profile.personId } });
    const lastEvaluation = userAcc ? await this.prisma.evaluation.findFirst({ where: { evaluateeId: userAcc.id }, orderBy: { submittedAt: 'desc' } }) : null;
    const lastNotification = await this.prisma.notification.findFirst({ where: { userId: user.accountId }, orderBy: { createdAt: 'desc' } });
    return { remainingDays, activeRotation: activeRotation ? { id: activeRotation.id, departmentName: activeRotation.department.nameAr, trainerName: activeRotation.trainerProfile.person.nameAr, startDate: activeRotation.startDate, endDate: activeRotation.endDate, progressPercentage: Math.min(100, Math.max(10, 100 - Math.round((remainingDays / 30) * 100))) } : null, currentShift: todayShift ? { shiftType: todayShift.shiftType, departmentName: todayShift.department.nameAr, startTime: todayShift.startTime, endTime: todayShift.endTime } : null, upcomingEvent: null, objectivePercentage: totalObjs > 0 ? Math.round((completedObjs / totalObjs) * 100) : 0, weeklyAttendanceRate: attendanceRecords.length > 0 ? Math.round((presentCount / attendanceRecords.length) * 100) : 0, lastEvaluation: lastEvaluation ? { score: lastEvaluation.totalScore, comments: lastEvaluation.comments, submittedAt: lastEvaluation.submittedAt } : null, lastNotification: lastNotification ? { titleAr: lastNotification.titleAr, bodyAr: lastNotification.bodyAr, createdAt: lastNotification.createdAt } : null };
  }

  @Get('performance')
  @RequireRoles('trainee', 'platform_owner', 'org_manager', 'academic_supervisor', 'trainer')
  async getPerformanceMetrics(@CurrentUser() user: IAuthenticatedUser) {
    const profile = await this.prisma.traineeProfile.findFirst({ where: { person: { userAccounts: { some: { id: user.accountId } } } } });
    if (!profile) return { commitmentRate: 0, attendanceRate: 0, callResponseSpeedMinutes: 0, averageEvaluation: 0 };
    const attendances = await this.prisma.attendance.findMany({ where: { traineeProfileId: profile.id } });
    const totalCount = attendances.length;
    const presentCount = attendances.filter((a) => a.status === 'present').length;
    const onTimeCount = attendances.filter((a) => a.status === 'present' && !a.isLate).length;
    const callParticipations = await this.prisma.callParticipant.findMany({ where: { traineeProfileId: profile.id, ackAt: { not: null } } });
    let totalDiffMinutes = 0, countResponded = 0;
    for (const p of callParticipations) if (p.ackAt && p.notifiedAt) { totalDiffMinutes += (new Date(p.ackAt).getTime() - new Date(p.notifiedAt).getTime()) / (1000 * 60); countResponded++; }
    const userAcc = await this.prisma.userAccount.findFirst({ where: { personId: profile.personId } });
    let averageEvaluation = 0;
    if (userAcc) { const evals = await this.prisma.evaluation.findMany({ where: { evaluateeId: userAcc.id } }); if (evals.length) averageEvaluation = parseFloat((evals.reduce((acc, curr) => acc + Number(curr.totalScore || 0), 0) / evals.length).toFixed(2)); }
    return { commitmentRate: totalCount ? Math.round((onTimeCount / totalCount) * 100) : 0, attendanceRate: totalCount ? Math.round((presentCount / totalCount) * 100) : 0, callResponseSpeedMinutes: countResponded ? parseFloat((totalDiffMinutes / countResponded).toFixed(1)) : 0, averageEvaluation };
  }

  @Get('timeline')
  @RequireRoles('trainee', 'platform_owner', 'org_manager', 'academic_supervisor', 'trainer')
  async getTimeline(@CurrentUser() user: IAuthenticatedUser) {
    const profile = await this.prisma.traineeProfile.findFirst({ where: { person: { userAccounts: { some: { id: user.accountId } } } } });
    const events: any[] = [];
    if (profile) {
      const attendances = await this.prisma.attendance.findMany({ where: { traineeProfileId: profile.id }, take: 5, orderBy: { date: 'desc' } });
      for (const a of attendances) events.push({ id: `att-${a.id}`, type: 'attendance', titleAr: a.isLate ? 'تسجيل حضور متأخر' : 'تسجيل حضور منتظم', subtitleAr: `تاريخ ${a.date.toISOString().split('T')[0]}`, timestamp: a.checkIn || a.createdAt, status: a.status, icon: 'calendar.badge.clock' });
      const callParts = await this.prisma.callParticipant.findMany({ where: { traineeProfileId: profile.id }, include: { call: true }, take: 5, orderBy: { createdAt: 'desc' } });
      for (const cp of callParts) events.push({ id: `call-${cp.id}`, type: 'call', titleAr: cp.call.customTitle || 'استجابة لنداء سريري', subtitleAr: `الحالة: ${cp.state}`, timestamp: cp.ackAt || cp.notifiedAt, status: cp.state, icon: 'bell.and.waves.left.and.right.fill' });
      const userAcc = await this.prisma.userAccount.findFirst({ where: { personId: profile.personId } });
      if (userAcc) { const evals = await this.prisma.evaluation.findMany({ where: { evaluateeId: userAcc.id }, take: 5, orderBy: { submittedAt: 'desc' } }); for (const e of evals) events.push({ id: `eval-${e.id}`, type: 'evaluation', titleAr: 'تقييم جديد مكتمل', subtitleAr: `الدرجة: ${e.totalScore || 5}/5`, timestamp: e.submittedAt, status: 'completed', icon: 'star.fill' }); }
    }
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return { data: events };
  }

  @Get('incoming')
  @RequireRoles('cluster_administrator', 'cluster_manager', 'training_director', 'platform_owner', 'hospital_training_admin', 'hospital_administrator', 'org_manager')
  async getIncomingTrainees(@CurrentUser() user: IAuthenticatedUser) {
    const scope = await this.scopeContext.resolve(user);
    const filter = this.scopeContext.orgFilter(scope);
    if (scope.visibleOrgIds !== null) {
      const pendingRows = await this.prisma.trainingRequestTrainee.findMany({ where: { assignedHospitalId: { in: scope.visibleOrgIds }, status: { in: ['allocated', 'hospital_review', 'hospital_accepted', 'active'] }, traineeProfileId: null } });
      for (const row of pendingRows) {
        try { const person = await this.prisma.person.findUnique({ where: { nationalId: row.nationalId }, include: { traineeProfile: true } }); if (person?.traineeProfile) await this.prisma.trainingRequestTrainee.update({ where: { id: row.id }, data: { traineeProfileId: person.traineeProfile.id, personId: person.id } }); } catch {}
      }
    }
    const whereClause: any = scope.visibleOrgIds !== null ? { OR: [filter, { trainingRequestRow: { assignedHospitalId: { in: scope.visibleOrgIds }, status: { notIn: ['rejected', 'merged', 'split'] } } }] } : filter;
    const trainees = await this.prisma.traineeProfile.findMany({ where: whereClause, include: { person: { include: { userAccounts: { where: { deletedAt: null }, select: { id: true, username: true, email: true, isActive: true, isEmailVerified: true, activatedAt: true, activationToken: true, activationTokenExpiresAt: true, lastLoginAt: true, createdAt: true, updatedAt: true } } } }, organization: true, sponsorOrganization: true, program: true, academicIntake: true, graduationApprovals: true, rotations: { orderBy: { startDate: 'desc' }, include: { department: true, trainerProfile: { include: { person: true } } } }, competencies: { include: { procedure: true } }, caseLogs: { take: 10, orderBy: { createdAt: 'desc' } }, trainingRequestRow: { select: { status: true, assignedHospitalId: true } } }, orderBy: { createdAt: 'desc' } });
    return { data: trainees };
  }

  @Get()
  @RequireRoles('platform_owner', 'org_manager', 'academic_supervisor', 'trainer')
  async findAll(@CurrentUser() user: IAuthenticatedUser, @Query('trainerId') trainerId?: string) {
    if (user.roles.includes('platform_owner')) {
      const trainees = await this.prisma.traineeProfile.findMany({ include: { person: true, organization: true, sponsorOrganization: true, program: true, rotations: { orderBy: { startDate: 'desc' }, include: { department: true, trainerProfile: { include: { person: true } } } }, graduationApprovals: true, competencies: { include: { procedure: true } }, caseLogs: { take: 10, orderBy: { createdAt: 'desc' } } } });
      return { data: trainees };
    }

    const isTrainerOnly = user.roles.includes('trainer') && !user.roles.includes('org_manager') && !user.roles.includes('academic_supervisor');
    if (isTrainerOnly) {
      const trainerProfile = await this.prisma.trainerProfile.findFirst({ where: { person: { userAccounts: { some: { id: user.accountId } } } } });
      if (!trainerProfile) return { data: [] };
      const rotations = await this.prisma.rotation.findMany({ where: { trainerProfileId: trainerProfile.id, organizationId: user.organizationId }, include: { traineeProfile: { include: { person: true, organization: true, sponsorOrganization: true, program: true, rotations: { orderBy: { startDate: 'desc' }, include: { department: true, trainerProfile: { include: { person: true } } } }, graduationApprovals: true, competencies: { include: { procedure: true } }, caseLogs: { take: 10, orderBy: { createdAt: 'desc' } } } } }, distinct: ['traineeProfileId'] });
      return { data: rotations.map((r) => r.traineeProfile) };
    }

    // A university academic supervisor owns the academic relationship, while
    // the hospital owns the operational profile. Scope by sponsorOrganizationId
    // rather than organizationId, then expose the active rotations/trainers as
    // read-only placement context. Trainer accounts remain hospital accounts;
    // they are not moved into the university organization.
    const where = user.roles.includes('academic_supervisor')
      ? { sponsorOrganizationId: user.organizationId, deletedAt: null }
      : { organizationId: user.organizationId, deletedAt: null };

    const trainees = await this.prisma.traineeProfile.findMany({
      where,
      include: {
        person: { include: { userAccounts: { where: { deletedAt: null }, select: { id: true, username: true, email: true, isActive: true, isEmailVerified: true, activatedAt: true, lastLoginAt: true, createdAt: true, updatedAt: true } } } },
        organization: true,
        sponsorOrganization: true,
        program: true,
        academicIntake: true,
        graduationApprovals: true,
        rotations: { orderBy: { startDate: 'desc' }, include: { department: true, trainerProfile: { include: { person: true } } } },
        competencies: { include: { procedure: true } },
        caseLogs: { take: 10, orderBy: { createdAt: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return { data: trainees };
  }

  @Post('reallocate')
  @RequireCapability(CAPABILITIES.ALLOCATION_CLUSTER_REASSIGN)
  async reallocateTrainee(@Body() body: { traineeProfileId: string; targetHospitalId: string; departmentId?: string; trainerProfileId?: string; startDate?: string; endDate?: string; reason?: string; notes?: string }, @CurrentUser() user: IAuthenticatedUser, @Scope() scope: ScopeContext) {
    const row = await this.prisma.trainingRequestTrainee.findFirst({ where: { traineeProfileId: body.traineeProfileId }, select: { id: true } });
    if (!row) throw new ConflictException('هذا المتدرب غير مرتبط بطلب تدريب — لا يمكن إعادة توزيعه عبر سجل التخصيص. المتدربون الذين أُنشئوا خارج دورة العمل (طلب تدريب ← دفعة أكاديمية) لا مصدر لهم، ويحتاجون ربطاً بدفعة قبل إعادة التوزيع.');
    return this.allocationService.allocateToHospital(row.id, { hospitalId: body.targetHospitalId, departmentId: body.departmentId ?? null, trainerProfileId: body.trainerProfileId ?? null, startDate: body.startDate ? new Date(body.startDate) : null, endDate: body.endDate ? new Date(body.endDate) : null }, 'cluster_reassign', user, scope, body.reason ?? body.notes);
  }

  @Post('bulk-import')
  async bulkImportTrainees() { throw new GoneException('الاستيراد الجماعي المباشر متوقف — الاستيراد يتم عبر طلب التدريب والدفعة الأكاديمية.'); }

  @Patch(':id/password')
  @RequireRoles('platform_owner','system_admin','cluster_manager','cluster_administrator','training_director','hospital_training_admin','org_manager')
  async changeTraineePassword(@Param('id') id: string, @Body() dto: AdminChangeTraineePasswordDto, @CurrentUser() user: IAuthenticatedUser) {
    if (!dto?.password || dto.password.trim().length < 8) throw new BadRequestException('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
    const scope = await this.scopeContext.resolve(user);
    let profile = await this.prisma.traineeProfile.findUnique({ where: { id }, include: { person: true, organization: true, sponsorOrganization: true } });
    let personId: string;
    if (profile) personId = profile.personId;
    else { const person = await this.prisma.person.findFirst({ where: { OR: [{ id }, { nationalId: id }] }, include: { traineeProfile: { include: { organization: true, sponsorOrganization: true, person: true } } } }); if (!person) throw new NotFoundException('لم يتم العثور على المتدرب'); personId = person.id; profile = person.traineeProfile ?? null; }
    if (scope.visibleOrgIds !== null && profile) { const orgIds = [profile.organizationId, profile.sponsorOrganizationId].filter(Boolean) as string[]; if (!orgIds.some((orgId) => scope.visibleOrgIds!.includes(orgId)) && !user?.roles?.includes('platform_owner') && !user?.roles?.includes('system_admin')) throw new ForbiddenException('هذا المتدرب خارج نطاق صلاحياتك التنظيمية'); }
    const account = await this.prisma.userAccount.findFirst({ where: { personId, deletedAt: null } });
    if (!account) throw new NotFoundException('لا يوجد حساب مستخدم مسجل لهذا المتدرب');
    const passwordHash = await bcrypt.hash(dto.password, 10);
    await this.prisma.userAccount.update({ where: { id: account.id }, data: { passwordHash, updatedById: user?.accountId, activationToken: null, activationTokenExpiresAt: null, isEmailVerified: true, activatedAt: account.activatedAt ?? new Date() } });
    await this.prisma.auditLog.create({ data: { organizationId: user?.organizationId || profile?.organizationId || null, actorId: user?.accountId, action: 'trainee_password_reset', entityType: 'UserAccount', entityId: account.id, newValues: { traineeProfileId: profile?.id, personId, nationalId: profile?.person?.nationalId, description: 'Administrator changed trainee password' } } });
    return { success: true, message: 'تم تغيير كلمة المرور بنجاح', data: { accountId: account.id, traineeProfileId: profile?.id, updatedAt: new Date() } };
  }
}
