import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Read-model projections for trainee endpoints.
 *
 * The training-request row is the provenance boundary for operational trainee
 * lists. Profiles created outside the canonical workflow are normally excluded
 * from the incoming roster. An exception is made for an already active trainee
 * with an active Rotation: these are legitimate operational trainees (including
 * historical/manual records) and must remain visible to hospital training teams.
 */
@Injectable()
export class TraineeProfileProjectionInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const handler = context.getHandler();
    const controller = context.getClass();
    const request = context.switchToHttp().getRequest<any>();
    const user = request?.user;

    if (controller?.name === 'TraineesController' && handler?.name === 'getMyProfile') {
      if (request?.method !== 'GET' || !user?.roles?.includes('trainee')) {
        return next.handle();
      }

      return next.handle().pipe(
        switchMap((body: any) =>
          from(this.projectOpenAllocation(body)).pipe(
            switchMap((projected) => from(Promise.resolve(projected))),
          ),
        ),
      );
    }

    if (controller?.name === 'TraineesController' && handler?.name === 'getIncomingTrainees') {
      return next.handle().pipe(
        switchMap((body: any) => from(this.filterCanonicalIncoming(body))),
      );
    }

    return next.handle();
  }

  private async filterCanonicalIncoming(body: any) {
    if (!body || !Array.isArray(body.data)) return body;

    const operationalStatuses = new Set([
      'submitted',
      'duplicate_flagged',
      'cluster_approved',
      'allocated',
      'on_hold',
      'hospital_review',
      'hospital_accepted',
      'hospital_returned_to_cluster',
      'active',
    ]);

    // Legacy/manual active profiles have no TRT provenance row, but if they have
    // an active Rotation they are operationally present and must be visible.
    // Do not expose arbitrary orphan profiles: only profiles with a currently
    // active rotation qualify for this compatibility path.
    const legacyActiveProfileIds = new Set<string>();
    const legacyCandidates = body.data.filter((trainee: any) => !trainee?.trainingRequestRow);
    if (legacyCandidates.length > 0) {
      const ids = legacyCandidates.map((trainee: any) => trainee?.id).filter(Boolean);
      const activeRotations = await this.prisma.rotation.findMany({
        where: {
          traineeProfileId: { in: ids },
          status: 'active',
        },
        select: { traineeProfileId: true },
        distinct: ['traineeProfileId'],
      });
      for (const rotation of activeRotations) {
        legacyActiveProfileIds.add(rotation.traineeProfileId);
      }
    }

    return {
      ...body,
      data: body.data.filter((trainee: any) => {
        const row = trainee?.trainingRequestRow;
        if (row?.status && operationalStatuses.has(row.status)) return true;
        return !row && legacyActiveProfileIds.has(trainee?.id);
      }),
    };
  }

  private async projectOpenAllocation(body: any) {
    if (!body || !body.id || (Array.isArray(body.rotations) && body.rotations.length > 0)) {
      return body;
    }

    const latestRow = await this.prisma.trainingRequestTrainee.findFirst({
      where: { traineeProfileId: body.id },
      select: { id: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (!latestRow) return body;

    const allocation = await this.prisma.traineeAllocation.findFirst({
      where: { traineeRowId: latestRow.id, status: 'open' },
      include: {
        hospital: { select: { id: true, nameAr: true, nameEn: true } },
        department: { select: { id: true, nameAr: true, nameEn: true } },
        trainerProfile: {
          include: {
            person: { select: { id: true, nameAr: true, nameEn: true } },
          },
        },
      },
      orderBy: { performedAt: 'desc' },
    });
    if (!allocation) return body;

    return {
      ...body,
      rotations: [
        {
          id: `allocation:${allocation.id}`,
          status: 'active',
          startDate: allocation.startDate,
          endDate: allocation.endDate,
          organization: allocation.hospital,
          department: allocation.department,
          trainerProfile: allocation.trainerProfile,
          _projectedFromAllocation: true,
        },
      ],
    };
  }
}
