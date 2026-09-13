import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators';
import { IAuthenticatedUser } from '../../common/interfaces';
import { CAPABILITIES, CapabilityGuard, RequireCapability } from '../../common/authz';
import { ScheduleUnificationService } from './schedule-unification.service';
import { ScheduleTraineeSyncService } from './schedule-trainee-sync.service';

@ApiTags('Training Schedule Unification')
@Controller('schedules')
@UseGuards(JwtAuthGuard, RolesGuard, CapabilityGuard)
@ApiBearerAuth('JWT-auth')
export class ScheduleUnificationController {
  constructor(
    private readonly service: ScheduleUnificationService,
    private readonly traineeSync: ScheduleTraineeSyncService,
  ) {}

  @Post('unify')
  @RequireCapability(CAPABILITIES.SCHEDULE_UPDATE)
  @ApiOperation({ summary: 'معاينة/توحيد جميع جداول المستشفى في جدول تدريبي موحد واحد' })
  async unify(@CurrentUser() user: IAuthenticatedUser, @Body() body: { targetScheduleId?: string; confirm?: boolean }) {
    return this.service.unify(user, body || {});
  }

  @Post('sync-trainees')
  @RequireCapability(CAPABILITIES.SCHEDULE_UPDATE)
  @ApiOperation({ summary: 'معاينة/مزامنة المتدربين الجدد مع الجدول الموحد دون إعادة بناء جلسات المتدربين الحاليين' })
  async syncTrainees(@CurrentUser() user: IAuthenticatedUser, @Body() body: { scheduleId?: string; confirm?: boolean }) {
    return this.traineeSync.sync(user, body || {});
  }
}
