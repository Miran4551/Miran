import { ForbiddenException } from '@nestjs/common';
import { EvaluationEditController } from './evaluation-edit.controller';

describe('EvaluationEditController', () => {
  const user = {
    accountId: 'trainer-account-1',
    organizationId: 'hospital-1',
    personId: 'person-1',
    roles: ['trainer'],
  } as any;

  function makeController(overrides: any = {}) {
    const prisma = {
      evaluation: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'evaluation-1',
          organizationId: 'hospital-1',
          evaluatorId: 'trainer-account-1',
          evaluateeId: 'trainee-account-1',
          evaluationType: 'mid_rotation',
          comments: 'تعليق سابق',
          form: { items: [] },
          rotation: { trainerProfileId: 'trainer-profile-1', organizationId: 'hospital-1' },
          ...overrides.evaluation,
        }),
        update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'evaluation-1', ...data })),
      },
      trainerProfile: {
        findFirst: jest.fn().mockResolvedValue({ id: 'trainer-profile-1' }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    } as any;
    return { controller: new EvaluationEditController(prisma), prisma };
  }

  it('updates the trainer\'s own evaluation instead of creating a duplicate', async () => {
    const { controller, prisma } = makeController();
    const result = await controller.updateEvaluation('evaluation-1', user, {
      scores: { overall: 92 },
      totalScore: 92,
      comments: 'تمت المراجعة والتحديث',
    });

    expect(result.success).toBe(true);
    expect(prisma.evaluation.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'evaluation-1' },
      data: expect.objectContaining({ totalScore: 92, comments: 'تمت المراجعة والتحديث' }),
    }));
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it('refuses to edit another evaluator\'s evaluation', async () => {
    const { controller } = makeController({ evaluation: { evaluatorId: 'other-trainer' } });
    await expect(controller.updateEvaluation('evaluation-1', user, { totalScore: 90 })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('recalculates criterion-based totals from the form', async () => {
    const { controller, prisma } = makeController({
      evaluation: {
        form: {
          items: [
            { code: 'professionalism', nameAr: 'المهنية', max: 30 },
            { code: 'communication', nameAr: 'التواصل', max: 70 },
          ],
        },
      },
    });

    await controller.updateEvaluation('evaluation-1', user, {
      scores: { professionalism: 27, communication: 63 },
      totalScore: 1,
    });

    const call = prisma.evaluation.update.mock.calls[0][0];
    expect(call.data.totalScore).toBe(90);
    expect(call.data.scores._percentage).toBe(90);
  });
});
