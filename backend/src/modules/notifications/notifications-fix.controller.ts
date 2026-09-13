import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators';
import { IAuthenticatedUser } from '../../common/interfaces';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * User-scoped notification feed used by the header bell.
 *
 * Workflow notifications are already addressed to an exact account. Filtering
 * that feed by organisation context made a valid acceptance notification
 * disappear when the account's current scope did not match the frozen
 * notification organisation. The feed is therefore keyed by the recipient
 * account only; it cannot expose another user's rows.
 */
@ApiTags('Notifications workflow fix')
@ApiBearerAuth('JWT-auth')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsFixController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reconcile older cluster training requests that were created before the
   * capability-based notification path existed. This is idempotent per account
   * and request, so simply opening the bell can safely repair a missing notice
   * without creating duplicates.
   */
  private async reconcileClusterRequestNotifications(user: IAuthenticatedUser) {
    const clusterRoles = ['cluster_manager', 'cluster_administrator', 'training_director'];
    if (!user.roles?.some((role) => clusterRoles.includes(role))) return;

    const requests = await this.prisma.trainingRequest.findMany({
      where: {
        targetOrgId: user.organizationId,
        status: { in: ['submitted', 'resubmitted', 'under_cluster_review'] },
      },
      select: {
        id: true,
        requestNumber: true,
        studentCount: true,
        sourceOrg: { select: { nameAr: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    for (const request of requests) {
      const existing = await this.prisma.notification.findFirst({
        where: {
          userId: user.accountId,
          type: 'training_request',
          referenceType: 'TrainingRequest',
          referenceId: request.id,
        },
        select: { id: true },
      });
      if (existing) continue;

      await this.prisma.notification.create({
        data: {
          organizationId: user.organizationId,
          userId: user.accountId,
          titleAr: 'طلب تدريب جديد وارد',
          bodyAr: `تم استلام طلب تدريب جديد (${request.requestNumber}) من ${request.sourceOrg?.nameAr || 'جامعة'} — عدد المتدربين: ${request.studentCount}`,
          type: 'training_request',
          referenceType: 'TrainingRequest',
          referenceId: request.id,
          sentVia: 'in_app',
        },
      });
    }
  }

  @Get('my-feed')
  @ApiOperation({ summary: 'إشعارات الحساب الحالي — بدون خلط نطاق الجهات' })
  async myFeed(@CurrentUser() user: IAuthenticatedUser) {
    await this.reconcileClusterRequestNotifications(user);

    const data = await this.prisma.notification.findMany({
      where: { userId: user.accountId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { data };
  }

  @Get('my-unread-count')
  @ApiOperation({ summary: 'عدد الإشعارات غير المقروءة للحساب الحالي' })
  async myUnreadCount(@CurrentUser() user: IAuthenticatedUser) {
    await this.reconcileClusterRequestNotifications(user);

    const count = await this.prisma.notification.count({
      where: { userId: user.accountId, isRead: false },
    });
    return { data: { count } };
  }
}
