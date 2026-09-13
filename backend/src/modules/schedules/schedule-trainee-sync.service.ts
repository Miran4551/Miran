import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IAuthenticatedUser } from '../../common/interfaces';
import { ScheduleDistributionService } from './schedule-distribution.service';

@Injectable()
export class ScheduleTraineeSyncService {
  constructor(private prisma: PrismaService, private distribution: ScheduleDistributionService) {}

  async sync(user: IAuthenticatedUser, dto: { scheduleId?: string; confirm?: boolean }) {
    if (!user.roles.some(r => ['hospital_training_admin', 'org_manager', 'platform_owner'].includes(r))) {
      throw new ForbiddenException('مزامنة المتدربين محصورة بإدارة التدريب بالمستشفى');
    }
    const schedules = await this.prisma.trainingSchedule.findMany({
      where: { organizationId: user.organizationId, status: { not: 'archived' } },
      include: { participants: true },
      orderBy: { createdAt: 'asc' },
    });
    const schedule = dto.scheduleId
      ? schedules.find(s => s.id === dto.scheduleId)
      : schedules.find(s => s.status === 'published') ?? schedules[0];
    if (!schedule) throw new NotFoundException('لا يوجد جدول موحد للمستشفى');

    const participants = new Set(schedule.participants.map(p => p.traineeProfileId));
    const eligible = await this.prisma.traineeProfile.findMany({
      where: { organizationId: user.organizationId, applicationStatus: { not: 'graduated' } },
      include: { rotations: true, person: true },
    });
    const newTrainees = eligible.filter(t => !participants.has(t.id) && t.rotations.some(r => ['active', 'scheduled', 'pending_acceptance'].includes(r.status)));

    if (!newTrainees.length) {
      return {
        success: true,
        preview: { scheduleId: schedule.id, currentTrainees: participants.size, newTrainees: 0, sessionsToAdd: 0, traineesToAdd: 0, unresolved: [], canSync: true },
        message: 'لا يوجد متدربون جدد يحتاجون إلى مزامنة.',
      };
    }

    const previewResult = await this.distribution.distribute(user, schedule.id, {
      traineeProfileIds: newTrainees.map(t => t.id),
      fromDate: schedule.startDate.toISOString().slice(0, 10),
      toDate: schedule.endDate.toISOString().slice(0, 10),
      preview: true,
    });

    const preview = previewResult.preview;
    if (!dto.confirm) {
      return { success: true, preview };
    }

    if (!preview.sessionsToAdd && preview.unresolved?.length) {
      throw new ForbiddenException({
        message: 'يوجد متدربون جدد لا يمكن جدولتُهم تلقائيًا. عالجهم يدويًا ثم أعد المزامنة.',
        unresolved: preview.unresolved,
        preview,
      });
    }

    const result = await this.distribution.distribute(user, schedule.id, {
      traineeProfileIds: newTrainees.map(t => t.id),
      fromDate: schedule.startDate.toISOString().slice(0, 10),
      toDate: schedule.endDate.toISOString().slice(0, 10),
      preview: false,
    });

    return {
      success: true,
      preview: result.preview,
      message: `تمت مزامنة ${result.preview.traineesToAdd} متدرب جديد وإضافة ${result.preview.sessionsToAdd} جلسة على الفترات الأربع.${result.preview.unresolved?.length ? ` بقي ${result.preview.unresolved.length} حالة تحتاج معالجة يدوية.` : ''}`,
    };
  }
}
