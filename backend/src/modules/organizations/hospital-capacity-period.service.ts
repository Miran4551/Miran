import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const OCCUPYING_STAGING_STATUSES = ['allocated', 'hospital_review', 'on_hold', 'active'];

/**
 * Period-scoped department capacity is a real operational rule, not a display
 * label. This service calculates the occupied seats against the same department
 * + training-period allocation that the hospital configured.
 *
 * A trainee is counted once even when an allocation, rotation and staging row
 * all describe the same person. The training period is resolved from the
 * academic intake for live rotations/allocations and from trainingPeriod on the
 * staging row, which keeps legacy rows usable without inventing a second period
 * field on Rotation.
 */
@Injectable()
export class HospitalCapacityPeriodService {
  constructor(private prisma: PrismaService) {}

  async getDepartmentPeriods(hospitalId: string) {
    const hospital = await this.prisma.organization.findFirst({
      where: { id: hospitalId, deletedAt: null },
      select: { id: true },
    });
    if (!hospital) throw new NotFoundException('المستشفى غير موجود');

    const [departments, allocations] = await Promise.all([
      this.prisma.department.findMany({
        where: { organizationId: hospitalId, isActive: true, deletedAt: null },
        select: { id: true, nameAr: true },
      }),
      this.prisma.capacityAllocation.findMany({
        where: { organizationId: hospitalId, scopeType: 'department' },
        orderBy: [{ trainingPeriod: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);

    const departmentNames = new Map(departments.map((d) => [d.id, d.nameAr]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const data = await Promise.all(
      allocations.map(async (allocation) => {
        const period = allocation.trainingPeriod || '';
        const [traineeAllocations, rotations, stagingRows] = await Promise.all([
          this.prisma.traineeAllocation.findMany({
            where: {
              hospitalId,
              departmentId: allocation.scopeId,
              status: 'open',
              OR: [{ endDate: null }, { endDate: { gte: today } }],
              ...(period
                ? {
                    traineeRow: {
                      trainingPeriod: period,
                    },
                  }
                : {}),
            },
            select: { traineeProfileId: true, traineeRowId: true },
          }),
          this.prisma.rotation.findMany({
            where: {
              organizationId: hospitalId,
              departmentId: allocation.scopeId,
              status: 'active',
              endDate: { gte: today },
              ...(period
                ? {
                    traineeProfile: {
                      academicIntake: { academicYear: period },
                    },
                  }
                : {}),
            },
            select: { traineeProfileId: true },
          }),
          this.prisma.trainingRequestTrainee.findMany({
            where: {
              assignedHospitalId: hospitalId,
              assignedDepartmentId: allocation.scopeId,
              status: { in: OCCUPYING_STAGING_STATUSES },
              OR: [{ endDate: null }, { endDate: { gte: today } }],
              ...(period ? { trainingPeriod: period } : {}),
            },
            select: { id: true, traineeProfileId: true },
          }),
        ]);

        const occupants = new Set<string>();
        for (const row of traineeAllocations) {
          occupants.add(row.traineeProfileId ? `profile:${row.traineeProfileId}` : `row:${row.traineeRowId}`);
        }
        for (const row of rotations) occupants.add(`profile:${row.traineeProfileId}`);
        for (const row of stagingRows) occupants.add(row.traineeProfileId ? `profile:${row.traineeProfileId}` : `row:${row.id}`);

        const occupied = occupants.size;
        const capacity = allocation.totalCapacity;
        return {
          allocation,
          departmentName: departmentNames.get(allocation.scopeId) || 'القسم',
          occupancy: {
            capacity,
            occupied,
            available: Math.max(0, capacity - occupied),
            occupancyPercentage: capacity > 0 ? Math.min(100, Math.round((occupied / capacity) * 100)) : 0,
          },
        };
      }),
    );

    return { data };
  }
}
