import { EvaluationService } from './evaluation.service';

describe('EvaluationService Mini-CEX repeatability', () => {
  it('does not run the duplicate guard for Mini-CEX', async () => {
    const prisma = {
      rotation: { findUnique: jest.fn().mockResolvedValue({ midpointMeetingDone: false, trainerProfileId: 'tp-1', traineeProfileId: 'tr-1' }) },
      trainerProfile: { findFirst: jest.fn().mockResolvedValue({ id: 'tp-1' }) },
      traineeProfile: {
        findFirst: jest.fn()
          .mockResolvedValueOnce({ id: 'tr-1' })
          .mockResolvedValueOnce({ isLocked: false }),
      },
      evaluationForm: { findUnique: jest.fn().mockResolvedValue({ id: 'form-1', items: [] }) },
      evaluation: {
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'new-mini', form: { nameAr: 'Mini-CEX' } }),
      },
      notification: { create: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    } as any;
    const service = new EvaluationService(prisma);
    const result = await service.submitTrainerEvaluation({ rotationId: 'rot-1', evaluateeId: 'trainee-account', formId: 'form-1', evaluationType: 'mini_cex', scores: { overall: 90 }, totalScore: 90, comments: 'ملاحظة' }, { accountId: 'trainer-account', organizationId: 'org-1', roles: ['trainer'] } as any);
    expect(result.success).toBe(true);
    expect(prisma.evaluation.findFirst).not.toHaveBeenCalled();
    expect(prisma.evaluation.create).toHaveBeenCalled();
  });
});
