import { AllocationEngineService } from './allocation-engine.service';

describe('AllocationEngineService regression invariants', () => {
  function makeService() {
    return new AllocationEngineService({} as any, {} as any);
  }

  it('keeps a cluster target hospital in the candidate set via id OR parentId', async () => {
    const service = makeService();
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'hospital-1',
        nameAr: 'مستشفى الاختبار',
        status: 'active',
        cityAr: null,
        regionAr: null,
        capacity: 10,
        departments: [],
      },
    ]);
    (service as any).prisma = { organization: { findMany } };

    const result = await (service as any).fetchHospitalCandidates('hospital-1');

    expect(result).toHaveLength(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          OR: [{ id: 'hospital-1' }, { parentId: 'hospital-1' }],
        },
      }),
    );
  });

  it('preserves the same OR candidate rule when the request target is a cluster', async () => {
    const service = makeService();
    const findMany = jest.fn().mockResolvedValue([]);
    (service as any).prisma = { organization: { findMany } };

    await (service as any).fetchHospitalCandidates('cluster-1');

    expect(findMany.mock.calls[0][0].where.OR).toEqual([
      { id: 'cluster-1' },
      { parentId: 'cluster-1' },
    ]);
  });
});
