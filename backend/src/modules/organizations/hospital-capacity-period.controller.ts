import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HospitalCapacityPeriodService } from './hospital-capacity-period.service';
import { JwtAuthGuard } from '../../common/guards';
import { CAPABILITIES, CapabilityGuard, RequireCapability, ScopeGuard, ScopedResource } from '../../common/authz';

@ApiTags('Hospital Capacity (سعة المستشفى التفصيلية)')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, CapabilityGuard, ScopeGuard)
@Controller('organizations')
export class HospitalCapacityPeriodController {
  constructor(private periodService: HospitalCapacityPeriodService) {}

  @Get(':id/capacity/department-periods')
  @RequireCapability(CAPABILITIES.CAPACITY_VIEW)
  @ScopedResource('organization', 'id')
  @ApiOperation({ summary: 'إشغال سعات الأقسام بحسب فترة التدريب المحددة فعلياً' })
  async getDepartmentPeriods(@Param('id') id: string) {
    return this.periodService.getDepartmentPeriods(id);
  }
}
