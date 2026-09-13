import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface ProposedSession {
  date: string;
  startTime: string;
  endTime: string;
  departmentId: string;
  trainerProfileId?: string | null;
  traineeProfileIds?: string[];
  sessionType?: string;
  shiftType?: string;
}

export interface ConflictResult {
  hasConflict: boolean;
  conflicts: Array<{
    type: 'trainee_overlap' | 'trainer_overlap' | 'capacity_exceeded' | 'shift_conflict' | 'outside_rotation' | 'trainer_leave';
    messageAr: string;
    details: {
      traineeId?: string;
      traineeName?: string;
      trainerId?: string;
      trainerName?: string;
      departmentId?: string;
      departmentName?: string;
      date?: string;
      time?: string;
    };
  }>;
}

const mins = (v: string) => {
  const [h, m] = v.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const overlap = (a: string, b: string, c: string, d: string) =>
  Math.max(mins(a), mins(c)) < Math.min(mins(b), mins(d));

const day = (value: string | Date) => {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? String(value).slice(0, 10) : d.toISOString().slice(0, 10);
};

@Injectable()
export class ConflictEngineService {
  constructor(private prisma: PrismaService) {}

  async validateSessions(
    orgId: string,
    sessions: ProposedSession[],
    tx?: Prisma.TransactionClient,
    excludeScheduleId?: string,
  ): Promise<ConflictResult> {
    const db = tx || this.prisma;
    const result: ConflictResult = { hasConflict: false, conflicts: [] };
    if (!sessions?.length) return result;

    // Normalize the exact payload used by both pre-check and final save.
    const normalized = sessions
      .map((s) => ({
        ...s,
        date: day(s.date),
        startTime: String(s.startTime || '').slice(0, 5),
        endTime: String(s.endTime || '').slice(0, 5),
        departmentId: String(s.departmentId || ''),
        traineeProfileIds: [...new Set((s.traineeProfileIds || []).filter(Boolean))],
      }))
      .filter((s) => s.startTime && s.endTime && s.departmentId);

    const dates = [...new Set(normalized.map((s) => s.date))].map((d) => new Date(`${d}T00:00:00.000Z`));
    const deptIds = [...new Set(normalized.map((s) => s.departmentId))];
    const trainerIds = [...new Set(normalized.map((s) => s.trainerProfileId).filter(Boolean))] as string[];
    const traineeIds = [...new Set(normalized.flatMap((s) => s.traineeProfileIds).filter(Boolean))];

    const [existing, depts, leaves, trainers, trainees, rotations] = await Promise.all([
      db.scheduleSession.findMany({
        where: {
          organizationId: orgId,
          date: { in: dates },
          ...(excludeScheduleId ? { scheduleId: { not: excludeScheduleId } } : {}),
          status: { not: 'cancelled' },
        },
        include: { schedule: { include: { participants: true } } },
      }),
      db.department.findMany({
        where: { id: { in: deptIds } },
        select: { id: true, nameAr: true, capacity: true },
      }),
      trainerIds.length
        ? db.trainerLeave.findMany({
            where: { trainerProfileId: { in: trainerIds }, status: { in: ['approved', 'active'] } },
          })
        : [],
      trainerIds.length
        ? db.trainerProfile.findMany({ where: { id: { in: trainerIds } }, include: { person: true } })
        : [],
      traineeIds.length
        ? db.traineeProfile.findMany({ where: { id: { in: traineeIds } }, include: { person: true } })
        : [],
      traineeIds.length
        ? db.rotation.findMany({
            where: { traineeProfileId: { in: traineeIds }, status: { in: ['scheduled', 'active'] } },
          })
        : [],
    ]);

    const dm = new Map<string, any>(depts.map((d: any) => [d.id, d] as [string, any]));
    const tm = new Map<string, any>(trainers.map((t: any) => [t.id, t] as [string, any]));
    const um = new Map<string, any>(trainees.map((t: any) => [t.id, t] as [string, any]));

    const add = (type: any, messageAr: string, details: any) => {
      result.hasConflict = true;
      result.conflicts.push({ type, messageAr, details });
    };

    const trainerCapacity = (id: string) => tm.get(id)?.maxTrainees || 5;

    // Trainee conflicts: compare with other schedules and with the new batch.
    for (let i = 0; i < normalized.length; i++) {
      const s = normalized[i];
      const sd = s.date;
      const trainer = s.trainerProfileId ? tm.get(s.trainerProfileId) : null;

      if (s.trainerProfileId) {
        const leave = (leaves as any[]).find(
          (l) =>
            l.trainerProfileId === s.trainerProfileId &&
            day(l.startDate) <= sd &&
            day(l.endDate) >= sd,
        );
        if (leave) {
          add('trainer_leave', `المدرب ${trainer?.person?.nameAr || ''} في إجازة بتاريخ ${sd}`, {
            trainerId: s.trainerProfileId,
            trainerName: trainer?.person?.nameAr,
            date: sd,
          });
        }
      }

      for (const tid of s.traineeProfileIds) {
        const u = um.get(tid);
        const rs = (rotations as any[]).filter((r) => r.traineeProfileId === tid);

        if (
          rs.length &&
          !rs.some(
            (r) =>
              day(r.startDate) <= sd &&
              day(r.endDate) >= sd &&
              (!s.departmentId || r.departmentId === s.departmentId),
          )
        ) {
          add(
            'outside_rotation',
            `المتدرب ${u?.person?.nameAr || ''} ليس لديه روتيشن مؤهل في هذا القسم بتاريخ ${sd}`,
            { traineeId: tid, traineeName: u?.person?.nameAr, date: sd, departmentId: s.departmentId },
          );
        }

        const dbOverlap = (existing as any[]).some(
          (es) =>
            day(es.date) === sd &&
            (es.traineeProfileId === tid ||
              (!es.traineeProfileId && es.schedule?.participants?.some((p: any) => p.traineeProfileId === tid))) &&
            overlap(s.startTime, s.endTime, es.startTime, es.endTime),
        );

        const batchOverlap = normalized.some(
          (o, j) =>
            j !== i &&
            o.date === sd &&
            o.traineeProfileIds.includes(tid) &&
            overlap(s.startTime, s.endTime, o.startTime, o.endTime),
        );

        if (dbOverlap || batchOverlap) {
          add(
            'trainee_overlap',
            `المتدرب ${u?.person?.nameAr || ''} لديه جلسة متداخلة بتاريخ ${sd} (${s.startTime} - ${s.endTime})`,
            { traineeId: tid, traineeName: u?.person?.nameAr, date: sd, time: `${s.startTime} - ${s.endTime}` },
          );
        }
      }
    }

    /**
     * Trainer capacity is concurrent capacity, not daily distinct-trainee
     * capacity. The old implementation merged every trainee for a trainer
     * across the whole day, so separate morning/afternoon groups could be
     * rejected incorrectly. Only overlapping sessions count toward capacity.
     */
    const trainerSessions = new Map<string, ProposedSession[]>();
    normalized.forEach((s) => {
      if (!s.trainerProfileId) return;
      const key = `${s.trainerProfileId}|${s.date}`;
      if (!trainerSessions.has(key)) trainerSessions.set(key, []);
      trainerSessions.get(key)!.push(s);
    });

    for (const [key, proposedRows] of trainerSessions) {
      const [trainerId, date] = key.split('|');
      const trainer = tm.get(trainerId);
      const capacity = trainerCapacity(trainerId);

      for (const s of proposedRows) {
        const load = new Set<string>();
        proposedRows
          .filter((o) => overlap(s.startTime, s.endTime, o.startTime, o.endTime))
          .forEach((o) => (o.traineeProfileIds ?? []).forEach((id) => load.add(id)));

        (existing as any[])
          .filter(
            (es) =>
              day(es.date) === date &&
              es.trainerProfileId === trainerId &&
              overlap(s.startTime, s.endTime, es.startTime, es.endTime),
          )
          .forEach((es) => {
            if (es.traineeProfileId) load.add(es.traineeProfileId);
            else es.schedule?.participants?.forEach((p: any) => load.add(p.traineeProfileId));
          });

        if (load.size > capacity) {
          add(
            'capacity_exceeded',
            `المدرب ${trainer?.person?.nameAr || ''} سيتجاوز سعته المتزامنة (${load.size} من ${capacity}) بتاريخ ${date}`,
            { trainerId, trainerName: trainer?.person?.nameAr, date, time: `${s.startTime} - ${s.endTime}` },
          );
        }
      }
    }

    // Department capacity is concurrent too; sessions in separate periods do not stack.
    const deptRows = new Map<string, ProposedSession[]>();
    normalized.forEach((s) => {
      const key = `${s.departmentId}|${s.date}`;
      if (!deptRows.has(key)) deptRows.set(key, []);
      deptRows.get(key)!.push(s);
    });

    for (const [key, proposedRows] of deptRows) {
      const [departmentId, date] = key.split('|');
      const department = dm.get(departmentId);
      if (!department) continue;
      const capacity = department.capacity || 10;

      for (const s of proposedRows) {
        const load = new Set<string>();
        proposedRows
          .filter((o) => overlap(s.startTime, s.endTime, o.startTime, o.endTime))
          .forEach((o) => (o.traineeProfileIds ?? []).forEach((id) => load.add(id)));

        (existing as any[])
          .filter(
            (es) =>
              es.departmentId === departmentId &&
              day(es.date) === date &&
              overlap(s.startTime, s.endTime, es.startTime, es.endTime),
          )
          .forEach((es) => {
            if (es.traineeProfileId) load.add(es.traineeProfileId);
            else es.schedule?.participants?.forEach((p: any) => load.add(p.traineeProfileId));
          });

        if (load.size > capacity) {
          add(
            'capacity_exceeded',
            `القسم «${department.nameAr}» يتجاوز السعة المتزامنة (${load.size} من ${capacity}) بتاريخ ${date}`,
            { departmentId, departmentName: department.nameAr, date, time: `${s.startTime} - ${s.endTime}` },
          );
        }
      }
    }

    result.conflicts = result.conflicts.filter((conflict, index, all) => {
      const key = JSON.stringify([conflict.type, conflict.messageAr, conflict.details]);
      return all.findIndex((item) => JSON.stringify([item.type, item.messageAr, item.details]) === key) === index;
    });
    result.hasConflict = result.conflicts.length > 0;
    return result;
  }
}
