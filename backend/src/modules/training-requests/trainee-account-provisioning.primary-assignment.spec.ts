import { TraineeAccountProvisioningService } from './trainee-account-provisioning.service';

describe('TraineeAccountProvisioningService primary organization assignment', () => {
  const ACCOUNT_ID = 'account-1';
  const HOSPITAL_ID = 'hospital-1';
  const CLUSTER_ID = 'cluster-1';

  function createTx(seed: {
    assignments?: Array<{ id: string; organizationId: string; roleId?: string | null; isPrimary: boolean; isActive: boolean; userAccountId?: string }>;
  } = {}) {
    const assignments = [...(seed.assignments ?? [])];

    return {
      role: {
        findUnique: jest.fn().mockResolvedValue({ id: 'role-trainee' }),
      },
      userRole: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      userOrganization: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      organizationAssignment: {
        findFirst: jest.fn().mockImplementation(({ where }: any) => {
          if (where.isPrimary === true && where.isActive === true && !where.organizationId) {
            return Promise.resolve(
              assignments.find((row) => row.userAccountId === ACCOUNT_ID && row.isPrimary && row.isActive) ?? null,
            );
          }
          return Promise.resolve(
            assignments.find(
              (row) =>
                row.userAccountId === ACCOUNT_ID &&
                row.organizationId === where.organizationId &&
                row.isActive,
            ) ?? null,
          );
        }),
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          const created = { id: `assignment-${assignments.length + 1}`, ...data };
          assignments.push(created);
          return created;
        }),
        update: jest.fn().mockImplementation(async ({ where, data }: any) => {
          const row = assignments.find((item) => item.id === where.id);
          if (row) Object.assign(row, data);
          return row;
        }),
      },
    } as any;
  }

  it('preserves an existing primary assignment when adding hospital membership', async () => {
    const tx = createTx({
      assignments: [
        {
          id: 'cluster-assignment',
          organizationId: CLUSTER_ID,
          roleId: 'role-trainee',
          isPrimary: true,
          isActive: true,
          userAccountId: ACCOUNT_ID,
        },
      ],
    });
    const service = new TraineeAccountProvisioningService({} as any, {} as any);

    await (service as any).ensureTraineeRoleAndAssignments(
      ACCOUNT_ID,
      [HOSPITAL_ID, CLUSTER_ID],
      { accountId: 'actor-1' },
      tx,
    );

    const createdHospital = tx.organizationAssignment.create.mock.calls[0][0].data;
    expect(createdHospital.organizationId).toBe(HOSPITAL_ID);
    expect(createdHospital.isPrimary).toBe(false);
    expect(tx.organizationAssignment.create).toHaveBeenCalledTimes(1);
  });

  it('chooses the first organization as primary when the account has no primary', async () => {
    const tx = createTx();
    const service = new TraineeAccountProvisioningService({} as any, {} as any);

    await (service as any).ensureTraineeRoleAndAssignments(
      ACCOUNT_ID,
      [HOSPITAL_ID, CLUSTER_ID],
      { accountId: 'actor-1' },
      tx,
    );

    const created = tx.organizationAssignment.create.mock.calls.map((call: any[]) => call[0].data);
    expect(created).toHaveLength(2);
    expect(created.find((row: any) => row.organizationId === HOSPITAL_ID).isPrimary).toBe(true);
    expect(created.find((row: any) => row.organizationId === CLUSTER_ID).isPrimary).toBe(false);
  });
});
