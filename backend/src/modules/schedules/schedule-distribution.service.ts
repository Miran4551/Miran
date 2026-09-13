import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IAuthenticatedUser } from '../../common/interfaces';

export const STANDARD_SLOTS = [
  { startTime: '08:00', endTime: '10:00', label: '08:00 - 10:00' },
  { startTime: '10:00', endTime: '12:00', label: '10:00 - 12:00' },
  { startTime: '12:00', endTime: '14:00', label: '12:00 - 14:00' },
  { startTime: '14:00', endTime: '16:00', label: '14:00 - 16:00' },
] as const;

const WEEK_DAYS = [0, 1, 2, 3, 4];
const ACTIVE_ROTATIONS = ['active', 'scheduled', 'pending_acceptance'];
const dayKey = (date: Date) => date.toISOString().slice(0, 10);

@Injectable()
export class ScheduleDistributionService {
  constructor(private prisma: PrismaService) {}

  private canManage(user: IAuthenticatedUser) {
    return user.roles.some(r => ['hospital_training_admin', 'org_manager', 'platform_owner'].includes(r));
  }

  private dateOnly(value: Date | string) {
    const d = new Date(value);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  private weekIndex(start: Date, date: Date) {
    return Math.floor((this.dateOnly(date).getTime() - this.dateOnly(start).getTime()) / (7 * 86400000));
  }

  private rotationForDate(trainee: any, date: Date) {
    return (trainee.rotations ?? [])
      .filter((r: any) => ACTIVE_ROTATIONS.includes(r.status) && new Date(r.startDate) <= date && new Date(r.endDate) >= date)
      .sort((a: any, b: any) => Number(a.sequenceOrder ?? 999999) - Number(b.sequenceOrder ?? 999999) || new Date(a.startDate).getTime() - new Date(b.startDate).getTime())[0];
  }

  private trainerEligible(trainer: any, rotation: any) {
    if (!rotation || trainer.isActive === false) return false;
    if (trainer.departmentId && trainer.departmentId !== rotation.departmentId) return false;
    if (rotation.programId) {
      const qualifications: any[] = trainer.qualifiedPrograms ?? [];
      if (!qualifications.some((q: any) => q.programId === rotation.programId || q.program?.id === rotation.programId)) return false;
    }
    return true;
  }

  async distribute(
    user: IAuthenticatedUser,
    scheduleId: string,
    options?: { fromDate?: string; toDate?: string; traineeProfileIds?: string[]; preview?: boolean },
  ) {
    if (!this.canManage(user)) throw new ForbiddenException('التوزيع الذكي محصور بإدارة التدريب بالمستشفى');

    const schedule = await this.prisma.trainingSchedule.findFirst({
      where: { id: scheduleId, organizationId: user.organizationId },
      include: { participants: true, sessions: true },
    });
    if (!schedule) throw new NotFoundException('الجدول التدريبي غير موجود');

    const from = this.dateOnly(options?.fromDate || schedule.startDate);
    const to = this.dateOnly(options?.toDate || schedule.endDate);
    const requested = options?.traineeProfileIds?.length ? new Set(options.traineeProfileIds) : null;

    const trainees = await this.prisma.traineeProfile.findMany({
      where: { organizationId: user.organizationId, applicationStatus: { not: 'graduated' }, ...(requested ? { id: { in: [...requested] } } : {}) },
      include: { rotations: true, person: true, trainingRequestRow: true },
    });

    const existingParticipantIds = new Set(schedule.participants.map(p => p.traineeProfileId));
    const candidates = trainees.filter(t => {
      if (requested && !requested.has(t.id)) return false;
      if (!t.trainingRequestRow || ['rejected', 'merged', 'split'].includes(t.trainingRequestRow.status)) return false;
      return (t.rotations ?? []).some((r: any) => ACTIVE_ROTATIONS.includes(r.status) && new Date(r.endDate) >= from && new Date(r.startDate) <= to);
    });

    const trainers = await this.prisma.trainerProfile.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      include: { qualifiedPrograms: true },
    });

    const departmentIds = [...new Set(candidates.flatMap((t: any) => (t.rotations ?? []).map((r: any) => r.departmentId).filter(Boolean)))];
    const departments = await this.prisma.department.findMany({
      where: { id: { in: departmentIds }, organizationId: user.organizationId, isActive: true },
    });
    const departmentById = new Map(departments.map(d => [d.id, d]));

    const leaves = trainers.length
      ? await this.prisma.trainerLeave.findMany({
          where: { trainerProfileId: { in: trainers.map(t => t.id) }, status: { in: ['approved', 'active'] }, startDate: { lte: to }, endDate: { gte: from } },
          select: { trainerProfileId: true, startDate: true, endDate: true },
        })
      : [];
    const trainerLeaves = new Map<string, Array<{ startDate: Date; endDate: Date }>>();
    for (const leave of leaves) {
      const list = trainerLeaves.get(leave.trainerProfileId) ?? [];
      list.push({ startDate: leave.startDate, endDate: leave.endDate });
      trainerLeaves.set(leave.trainerProfileId, list);
    }
    const trainerOnLeave = (trainerId: string, date: Date) => (trainerLeaves.get(trainerId) ?? []).some(l => l.startDate <= date && l.endDate >= date);

    const existingKeys = new Set<string>();
    const trainerDailyLoad = new Map<string, Set<string>>();
    const trainerSlotLoad = new Map<string, number>();
    const departmentSlotLoad = new Map<string, number>();
    const traineeSlotHistory = new Map<string, Set<string>>();

    for (const s of schedule.sessions) {
      if (!s.traineeProfileId) continue;
      const date = dayKey(s.date);
      existingKeys.add(`${s.traineeProfileId}|${date}|${s.startTime}|${s.endTime}|${s.departmentId}`);
      if (s.trainerProfileId) {
        const dailyKey = `${s.trainerProfileId}|${date}`;
        const dailySet = trainerDailyLoad.get(dailyKey) ?? new Set<string>();
        dailySet.add(s.traineeProfileId);
        trainerDailyLoad.set(dailyKey, dailySet);
        const tk = `${s.trainerProfileId}|${date}|${s.startTime}|${s.endTime}`;
        trainerSlotLoad.set(tk, (trainerSlotLoad.get(tk) ?? 0) + 1);
      }
      const dk = `${s.departmentId}|${date}|${s.startTime}|${s.endTime}`;
      departmentSlotLoad.set(dk, (departmentSlotLoad.get(dk) ?? 0) + 1);
      const historyKey = `${s.traineeProfileId}`;
      if (!traineeSlotHistory.has(historyKey)) traineeSlotHistory.set(historyKey, new Set());
      traineeSlotHistory.get(historyKey)!.add(`${s.startTime}-${s.endTime}`);
    }

    const planned: any[] = [];
    type UnresolvedTrainee = { traineeId: string; traineeName?: string; dates: string[]; reasons: Set<string> };
    const unresolvedByTrainee = new Map<string, UnresolvedTrainee>();
    const participantIds = new Set<string>(existingParticipantIds);

    const addUnresolved = (trainee: any, date: Date | null, reason: string) => {
      let current = unresolvedByTrainee.get(trainee.id);
      if (!current) {
        current = { traineeId: trainee.id, traineeName: trainee.person?.nameAr, dates: [], reasons: new Set<string>() };
        unresolvedByTrainee.set(trainee.id, current);
      }
      if (date) current.dates.push(dayKey(date));
      current.reasons.add(reason);
    };

    for (const trainee of candidates) {
      let addedForTrainee = 0;
      for (let cursor = new Date(from); cursor <= to; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
        if (!WEEK_DAYS.includes(cursor.getUTCDay())) continue;
        const date = new Date(cursor);
        const rotation = this.rotationForDate(trainee, date);
        if (!rotation) continue;

        const department = departmentById.get(rotation.departmentId);
        if (!department) {
          addUnresolved(trainee, date, 'القسم المرتبط بالـRotation غير متاح أو غير نشط');
          continue;
        }

        const week = this.weekIndex(from, date);
        const slotOrder = STANDARD_SLOTS.map((_, i) => (i + (week % STANDARD_SLOTS.length)) % STANDARD_SLOTS.length);
        const history = traineeSlotHistory.get(trainee.id) ?? new Set<string>();
        const slotCandidates = [...slotOrder].sort((a, b) => {
          const sa = STANDARD_SLOTS[a]; const sb = STANDARD_SLOTS[b];
          const aDept = departmentSlotLoad.get(`${department.id}|${dayKey(date)}|${sa.startTime}|${sa.endTime}`) ?? 0;
          const bDept = departmentSlotLoad.get(`${department.id}|${dayKey(date)}|${sb.startTime}|${sb.endTime}`) ?? 0;
          const aHistory = history.has(`${sa.startTime}-${sa.endTime}`) ? 1 : 0;
          const bHistory = history.has(`${sb.startTime}-${sb.endTime}`) ? 1 : 0;
          return (aDept * 10 + aHistory) - (bDept * 10 + bHistory);
        });

        let placed = false;
        for (const slotIndex of slotCandidates) {
          const slot = STANDARD_SLOTS[slotIndex];
          const deptKey = `${department.id}|${dayKey(date)}|${slot.startTime}|${slot.endTime}`;
          const departmentCapacity = Number(department.capacity ?? 0);
          if (departmentCapacity > 0 && (departmentSlotLoad.get(deptKey) ?? 0) >= departmentCapacity) continue;

          const key = `${trainee.id}|${dayKey(date)}|${slot.startTime}|${slot.endTime}|${department.id}`;
          if (existingKeys.has(key)) { placed = true; break; }

          const eligibleTrainers = trainers
            .filter(t => this.trainerEligible(t, rotation))
            .filter(t => !t.departmentId || t.departmentId === department.id);
          const availableTrainers: any[] = [];
          for (const trainer of eligibleTrainers) {
            if (trainerOnLeave(trainer.id, date)) continue;
            const dailyKey = `${trainer.id}|${dayKey(date)}`;
            const assignedTrainees = trainerDailyLoad.get(dailyKey) ?? new Set<string>();
            const programQualification = trainer.qualifiedPrograms?.some((q: any) => q.programId === rotation.programId || q.program?.id === rotation.programId);
            const max = Number(trainer.maxTrainees ?? 5);
            if (assignedTrainees.size >= max) continue;
            const slotLoad = trainerSlotLoad.get(`${trainer.id}|${dayKey(date)}|${slot.startTime}|${slot.endTime}`) ?? 0;
            if (slotLoad >= max) continue;
            availableTrainers.push({ trainer, load: assignedTrainees.size, preferred: trainer.id === rotation.trainerProfileId ? 0 : 1, programQualification: programQualification ? 0 : 1, slotLoad });
          }
          availableTrainers.sort((a, b) => a.load - b.load || a.slotLoad - b.slotLoad || a.preferred - b.preferred || a.programQualification - b.programQualification || a.trainer.id.localeCompare(b.trainer.id));
          const selected = availableTrainers[0]?.trainer;
          if (!selected) continue;

          const row = {
            organizationId: user.organizationId,
            scheduleId: schedule.id,
            departmentId: department.id,
            trainerProfileId: selected.id,
            traineeProfileId: trainee.id,
            date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            durationHours: 2,
            sessionType: 'clinical_round',
            shiftType: 'morning',
            capacity: 1,
            notes: 'تم توزيعها تلقائيًا وفق Rotation + سعة القسم + توازن الفترات + أهلية المدرب',
          };
          planned.push(row);
          existingKeys.add(key);
          participantIds.add(trainee.id);
          addedForTrainee++;
          departmentSlotLoad.set(deptKey, (departmentSlotLoad.get(deptKey) ?? 0) + 1);
          const dailyKey = `${selected.id}|${dayKey(date)}`;
          const trainerSet = trainerDailyLoad.get(dailyKey) ?? new Set<string>();
          trainerSet.add(trainee.id);
          trainerDailyLoad.set(dailyKey, trainerSet);
          const trainerSlotKey = `${selected.id}|${dayKey(date)}|${slot.startTime}|${slot.endTime}`;
          trainerSlotLoad.set(trainerSlotKey, (trainerSlotLoad.get(trainerSlotKey) ?? 0) + 1);
          history.add(`${slot.startTime}-${slot.endTime}`);
          traineeSlotHistory.set(trainee.id, history);
          placed = true;
          break;
        }
        if (!placed) addUnresolved(trainee, date, 'لا توجد سعة ومدرب مؤهل متاح في أي من الفترات الأربع');
      }
      if (addedForTrainee > 0) participantIds.add(trainee.id);
      else if (!existingParticipantIds.has(trainee.id)) addUnresolved(trainee, null, 'لم يتم العثور على جلسة قابلة للإضافة ضمن فترة الـRotation');
    }

    const unresolved = [...unresolvedByTrainee.values()].map(item => ({
      traineeId: item.traineeId,
      traineeName: item.traineeName,
      unresolvedDays: item.dates.length,
      dates: item.dates,
      reason: [...item.reasons].join('؛ '),
    }));

    const preview = {
      scheduleId,
      standardSlots: STANDARD_SLOTS,
      fromDate: dayKey(from),
      toDate: dayKey(to),
      eligibleTrainees: candidates.length,
      existingParticipants: existingParticipantIds.size,
      traineesToAdd: [...participantIds].filter(id => !existingParticipantIds.has(id)).length,
      sessionsToAdd: planned.length,
      unresolved,
      unresolvedTrainees: unresolved.length,
      unresolvedDays: unresolved.reduce((sum, item) => sum + item.unresolvedDays, 0),
      canApply: planned.length > 0 || candidates.length === 0,
    };

    if (options?.preview !== false) return { success: true, preview, plannedSessions: planned };

    if (planned.length) {
      await this.prisma.$transaction(async tx => {
        const missingParticipants = [...participantIds].filter(id => !existingParticipantIds.has(id));
        if (missingParticipants.length) {
          await tx.scheduleParticipant.createMany({ data: missingParticipants.map(traineeProfileId => ({ scheduleId, traineeProfileId })), skipDuplicates: true });
        }
        await tx.scheduleSession.createMany({ data: planned });
        const last = await tx.scheduleRevision.findFirst({ where: { scheduleId }, orderBy: { revision: 'desc' }, select: { revision: true } });
        await tx.scheduleRevision.create({ data: {
          scheduleId,
          revision: (last?.revision ?? 0) + 1,
          snapshot: { standardSlots: STANDARD_SLOTS, addedSessions: planned.length, traineeIds: [...participantIds], unresolved },
          oldValues: { participantCount: existingParticipantIds.size, sessionCount: schedule.sessions.length },
          newValues: { participantCount: participantIds.size, sessionCount: schedule.sessions.length + planned.length },
          changeReason: 'توزيع ذكي وفق الروتيشن على الفترات الأربع مع الحفاظ على الجلسات القائمة',
          publishedById: user.accountId,
        }});
      }, { maxWait: 10000, timeout: 60000 });
    }

    return { success: true, preview, message: `تمت إضافة ${planned.length} جلسة موزعة على الفترات الأربع.${unresolved.length ? ` بقي ${unresolved.length} متدرب يحتاج معالجة يدوية.` : ''}` };
  }
}
