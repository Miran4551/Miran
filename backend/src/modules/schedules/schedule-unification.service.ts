import { Injectable, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IAuthenticatedUser } from '../../common/interfaces';

const overlaps = (a: string, b: string, c: string, d: string) => {
  const mins = (v: string) => { const [h, m] = String(v || '').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
  return Math.max(mins(a), mins(c)) < Math.min(mins(b), mins(d));
};

@Injectable()
export class ScheduleUnificationService {
  constructor(private prisma: PrismaService) {}

  async unify(user: IAuthenticatedUser, dto: { targetScheduleId?: string; confirm?: boolean }) {
    if (!user.roles.some(r => ['hospital_training_admin', 'org_manager', 'platform_owner'].includes(r))) {
      throw new ForbiddenException('توحيد الجداول محصور بإدارة التدريب بالمستشفى');
    }

    const schedules = await this.prisma.trainingSchedule.findMany({
      where: { organizationId: user.organizationId, status: { not: 'archived' } },
      include: { participants: true, sessions: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!schedules.length) throw new NotFoundException('لا توجد جداول تدريبية لتوحيدها');

    const target = dto.targetScheduleId
      ? schedules.find(s => s.id === dto.targetScheduleId)
      : schedules.find(s => s.status === 'published') ?? schedules[0];
    if (!target) throw new NotFoundException('الجدول المستهدف غير موجود أو مؤرشف');

    const allSessions = schedules.flatMap(s => s.sessions.map(session => ({ ...session, sourceScheduleId: s.id })));
    const key = (s: any) => `${s.traineeProfileId || ''}|${s.departmentId}|${new Date(s.date).toISOString().slice(0, 10)}|${s.startTime}|${s.endTime}|${s.trainerProfileId || ''}|${s.sessionType || ''}|${s.shiftType || ''}`;
    const seen = new Set<string>();
    const duplicateSessionIds: string[] = [];
    const uniqueSessions = allSessions.filter(s => {
      const k = key(s);
      if (seen.has(k)) { duplicateSessionIds.push(s.id); return false; }
      seen.add(k); return true;
    });

    const conflicts: Array<{ type: string; messageAr: string; details: any }> = [];
    for (let i = 0; i < uniqueSessions.length; i++) {
      const a: any = uniqueSessions[i];
      for (let j = i + 1; j < uniqueSessions.length; j++) {
        const b: any = uniqueSessions[j];
        if (a.sourceScheduleId === b.sourceScheduleId) continue;
        if (new Date(a.date).toISOString().slice(0, 10) !== new Date(b.date).toISOString().slice(0, 10)) continue;
        if (!overlaps(a.startTime, a.endTime, b.startTime, b.endTime)) continue;
        if (a.traineeProfileId && a.traineeProfileId === b.traineeProfileId) {
          conflicts.push({ type: 'trainee_overlap', messageAr: 'يوجد تداخل لمتدرب بين جدولين سابقين', details: { traineeId: a.traineeProfileId, date: new Date(a.date).toISOString().slice(0, 10), time: `${a.startTime} - ${a.endTime}` } });
        }
        if (a.trainerProfileId && a.trainerProfileId === b.trainerProfileId) {
          conflicts.push({ type: 'trainer_overlap', messageAr: 'يوجد تداخل لمدرب بين جدولين سابقين', details: { trainerId: a.trainerProfileId, date: new Date(a.date).toISOString().slice(0, 10), time: `${a.startTime} - ${a.endTime}` } });
        }
      }
    }
    const uniqueConflicts = conflicts.filter((c, i, all) => all.findIndex(x => JSON.stringify(x) === JSON.stringify(c)) === i);
    const participantIds = [...new Set(schedules.flatMap(s => s.participants.map(p => p.traineeProfileId)))];
    const preview = {
      targetScheduleId: target.id,
      targetTitle: target.titleAr,
      scheduleCount: schedules.length,
      schedulesToArchive: schedules.length - 1,
      currentSessionCount: target.sessions.length,
      mergedSessionCount: uniqueSessions.length,
      duplicateSessionsRemoved: duplicateSessionIds.length,
      participantCount: participantIds.length,
      conflicts: uniqueConflicts,
      hasConflicts: uniqueConflicts.length > 0,
      canUnify: uniqueConflicts.length === 0,
    };
    if (!dto.confirm) return { success: true, preview };
    if (uniqueConflicts.length) {
      throw new ConflictException({ message: 'لا يمكن توحيد الجداول قبل معالجة التعارضات الموجودة بينها', conflicts: uniqueConflicts, preview });
    }

    const minDate = uniqueSessions.reduce((v: Date, s: any) => s.date < v ? s.date : v, target.startDate);
    const maxDate = uniqueSessions.reduce((v: Date, s: any) => s.date > v ? s.date : v, target.endDate);

    await this.prisma.$transaction(async tx => {
      for (const traineeProfileId of participantIds) {
        await tx.scheduleParticipant.upsert({
          where: { scheduleId_traineeProfileId: { scheduleId: target.id, traineeProfileId } },
          update: {},
          create: { scheduleId: target.id, traineeProfileId },
        });
      }
      for (const s of uniqueSessions.filter((x: any) => x.scheduleId !== target.id)) {
        await tx.scheduleSession.update({ where: { id: s.id }, data: { scheduleId: target.id } });
      }
      if (duplicateSessionIds.length) await tx.scheduleSession.deleteMany({ where: { id: { in: duplicateSessionIds } } });
      await tx.trainingSchedule.update({ where: { id: target.id }, data: { startDate: minDate, endDate: maxDate, titleAr: target.titleAr || 'الجدول التدريبي الموحد للمستشفى', updatedById: user.accountId } });
      for (const s of schedules.filter(s => s.id !== target.id)) {
        await tx.trainingSchedule.update({ where: { id: s.id }, data: { status: 'archived', updatedById: user.accountId } });
      }
      const lastRevision = await tx.scheduleRevision.findFirst({ where: { scheduleId: target.id }, orderBy: { revision: 'desc' }, select: { revision: true } });
      await tx.scheduleRevision.create({
        data: {
          scheduleId: target.id,
          revision: (lastRevision?.revision || 0) + 1,
          snapshot: { targetScheduleId: target.id, archivedScheduleIds: schedules.filter(s => s.id !== target.id).map(s => s.id), mergedSessionIds: uniqueSessions.map((s: any) => s.id) },
          oldValues: { scheduleCount: schedules.length, sessionCount: allSessions.length },
          newValues: { scheduleCount: 1, sessionCount: uniqueSessions.length },
          changeReason: 'توحيد جميع الجداول التدريبية في جدول مستشفى موحد',
          publishedById: user.accountId,
        },
      });
    }, { maxWait: 10000, timeout: 30000 });

    return this.prisma.trainingSchedule.findUnique({ where: { id: target.id }, select: { id: true, titleAr: true, status: true } });
  }
}
