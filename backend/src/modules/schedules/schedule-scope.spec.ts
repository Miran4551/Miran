import { ForbiddenException } from '@nestjs/common';
import { SchedulesService } from './schedules.service';

describe('SchedulesService resource scoping', () => {
  const HOSPITAL_A = 'hospital-A';

  function makeService(present: { trainees?: string[]; trainers?: string[]; departments?: string[] }) {
    const countIn = (known: string[] = []) => jest.fn().mockImplementation(({ where }) => {
      const asked: string[] = where.id.in;
      if (where.organizationId !== HOSPITAL_A) return 0;
      return asked.filter((id) => known.includes(id)).length;
    });
    const prisma = {
      traineeProfile: { count: countIn(present.trainees) },
      trainerProfile: { count: countIn(present.trainers) },
      department: { count: countIn(present.departments) },
    } as any;
    return new SchedulesService(prisma, {} as any);
  }

  const assertResources = (s: SchedulesService, resources: any, org = HOSPITAL_A) =>
    (s as any).assertScheduleResourcesInOrg(org, resources);

  it('accepts trainees, trainers and departments that all belong to the hospital', async () => {
    const service = makeService({ trainees: ['trainee-A'], trainers: ['trainer-A'], departments: ['dept-A'] });
    await expect(assertResources(service, { traineeProfileIds: ['trainee-A'], trainerProfileIds: ['trainer-A'], departmentIds: ['dept-A'] })).resolves.toBeUndefined();
  });

  it('refuses a trainee from another hospital', async () => {
    const service = makeService({ trainees: ['trainee-A'] });
    await expect(assertResources(service, { traineeProfileIds: ['trainee-A', 'trainee-of-hospital-B'] })).rejects.toThrow(/المتدربين المحددين لا يتبع/);
  });

  it('refuses a trainer from another hospital', async () => {
    const service = makeService({ trainers: ['trainer-A'] });
    await expect(assertResources(service, { trainerProfileIds: ['trainer-of-hospital-B'] })).rejects.toThrow(/المدربين المحددين لا يتبع/);
  });

  it('refuses a department from another hospital', async () => {
    const service = makeService({ departments: ['dept-A'] });
    await expect(assertResources(service, { departmentIds: ['dept-of-hospital-B'] })).rejects.toThrow(/الأقسام المحددة لا يتبع/);
  });

  it('refuses ids that do not exist at all', async () => {
    const service = makeService({ trainees: [] });
    await expect(assertResources(service, { traineeProfileIds: ['ghost'] })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('ignores undefined entries rather than counting them', async () => {
    const service = makeService({ departments: ['dept-A'] });
    await expect(assertResources(service, { departmentIds: [undefined, 'dept-A', undefined] })).resolves.toBeUndefined();
  });

  it('passes trivially when nothing is named', async () => {
    const service = makeService({});
    await expect(assertResources(service, {})).resolves.toBeUndefined();
  });

  const buildUpdateFixture = (scheduleId: string, participants: string[]) => {
    const conflictEngine = { validateSessions: jest.fn().mockResolvedValue({ hasConflict: false, conflicts: [] }) };
    const sessions = participants.map((traineeProfileId, index) => ({
      id: `sess-${index + 1}`,
      traineeProfileId,
      trainerProfileId: 'trainer-A',
      departmentId: 'dept-A',
      date: new Date('2026-09-08'),
      startTime: '10:00',
      endTime: '12:00',
      sessionType: 'clinical_round',
      shiftType: 'morning',
    }));
    const prisma = {
      trainingSchedule: {
        findFirst: jest.fn().mockResolvedValue({ id: scheduleId, organizationId: HOSPITAL_A, departmentId: 'dept-A', participants: participants.map((traineeProfileId) => ({ traineeProfileId })), sessions }),
        update: jest.fn().mockResolvedValue({ id: scheduleId }),
      },
      scheduleSession: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue(sessions),
        create: jest.fn().mockResolvedValue({ id: 'sess-new' }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({ id: 'sess-updated' }),
      },
      scheduleParticipant: {
        deleteMany: jest.fn().mockResolvedValue({ count: Math.max(0, participants.length - 1) }),
        findFirst: jest.fn().mockResolvedValue({ id: 'part-1' }),
        findMany: jest.fn().mockResolvedValue(participants.map((traineeProfileId) => ({ traineeProfileId }))),
        create: jest.fn().mockResolvedValue({ id: 'part-new' }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      traineeProfile: { count: jest.fn().mockResolvedValue(1) },
      trainerProfile: { count: jest.fn().mockResolvedValue(1) },
      department: { count: jest.fn().mockResolvedValue(1) },
    } as any;
    prisma.$transaction = jest.fn().mockImplementation(async (cb: (tx: any) => unknown) => cb(prisma));
    return { prisma, conflictEngine };
  };

  it('excludes self schedule sessions when checking conflicts during update', async () => {
    const { prisma, conflictEngine } = buildUpdateFixture('sched-1', ['trainee-A']);
    const service = new SchedulesService(prisma, conflictEngine as any);
    service.findOne = jest.fn().mockResolvedValue({ id: 'sched-1', titleAr: 'جدول معدل' });
    const user = { accountId: 'acc-1', organizationId: HOSPITAL_A, roles: ['hospital_training_admin'] } as any;
    await service.update('sched-1', user, { titleAr: 'جدول معدل', sessions: [{ date: '2026-09-08', startTime: '10:00', endTime: '12:00', departmentId: 'dept-A', trainerProfileId: 'trainer-A', traineeProfileId: 'trainee-A' }] });
    expect(conflictEngine.validateSessions).toHaveBeenCalledWith(HOSPITAL_A, expect.any(Array), expect.any(Object), 'sched-1');
  });

  it('preserves exact single trainee identity and does not blanket-assign other schedule participants', async () => {
    const { prisma, conflictEngine } = buildUpdateFixture('sched-multi', ['trainee-A', 'trainee-B', 'trainee-C']);
    const service = new SchedulesService(prisma, conflictEngine as any);
    service.findOne = jest.fn().mockResolvedValue({ id: 'sched-multi', titleAr: 'جدول متعدد' });
    const user = { accountId: 'acc-1', organizationId: HOSPITAL_A, roles: ['hospital_training_admin'] } as any;
    await service.update('sched-multi', user, { titleAr: 'جدول متعدد', sessions: [{ date: '2026-09-08', startTime: '10:00', endTime: '12:00', departmentId: 'dept-A', trainerProfileId: 'trainer-A', traineeProfileId: 'trainee-A' }] });
    expect(conflictEngine.validateSessions).toHaveBeenCalledWith(
      HOSPITAL_A,
      [expect.objectContaining({ traineeProfileIds: ['trainee-A'], trainerProfileId: 'trainer-A' })],
      expect.any(Object),
      'sched-multi',
    );
  });
});
