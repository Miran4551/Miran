import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { TrainingRequestsService } from './training-requests.service';
import { TraineeAllocationService } from './trainee-allocation.service';
import { TrainingRequestTraineesService } from './training-request-trainees.service';
import { GraduationService } from './graduation.service';
import { RequestCompositionService } from './request-composition.service';
import { ArarSyncService } from './arar-sync.service';
import {
  CreateTrainingRequestDto,
  PreviewTrainingRequestDto,
  UpdateTrainingRequestDto,
} from './dto/training-request.dto';
import {
  ChangeAssignmentDto,
  HospitalRejectDto,
  HospitalReturnDto,
  ImportTraineesDto,
  MergeTraineesDto,
  PutOnHoldDto,
  RejectTraineeDto,
  RequestDataCorrectionDto,
  RequestMissingDocsDto,
  ReturnTraineeDto,
  SplitTraineeDto,
  UpdateTraineeRowDto,
} from './dto/training-request-trainee.dto';
import { CurrentUser, OrgContext, RequireRoles } from '../../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { IAuthenticatedUser } from '../../common/interfaces';
import {
  CAPABILITIES,
  CapabilityGuard,
  RequireCapability,
  Scope,
  ScopeContext,
  ScopeGuard,
  ScopedResource,
} from '../../common/authz';

const CLUSTER_ROLES = ['cluster_administrator', 'cluster_manager', 'training_director', 'platform_owner'] as const;
const UNIVERSITY_ROLES = ['university_administrator', 'academic_affairs', 'platform_owner'] as const;
const HOSPITAL_ROLES = ['hospital_training_admin', 'platform_owner'] as const;
const ACADEMIC_ROLES = ['academic_supervisor'] as const;

@ApiTags('Training Requests (طلبات التدريب التشغيلية الواردة للتجمع)')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard, CapabilityGuard, ScopeGuard)
@Controller('training-requests')
export class TrainingRequestsController {
  constructor(
    private trainingRequestsService: TrainingRequestsService,
    private traineesService: TrainingRequestTraineesService,
    private graduationService: GraduationService,
    private compositionService: RequestCompositionService,
    private allocationService: TraineeAllocationService,
    private ararSyncService: ArarSyncService,
  ) {}

  @Post('admin/sync-arar-dataset')
  @RequireRoles('platform_owner', 'cluster_administrator')
  @ApiOperation({ summary: 'مزامنة بيانات مستشفى عرعر المركزي التشغيلية وسلسلة القبول' })
  async syncArarDataset() { return this.ararSyncService.syncArarDataset(); }

  @Get('plan-options')
  @RequireRoles(...UNIVERSITY_ROLES, ...CLUSTER_ROLES)
  @ApiOperation({ summary: 'قوالب الخطط المتاحة لبرنامج تدريبي مع اقتراح الإصدار المعتمد' })
  async planOptions(@Query('programId') programId: string) { return this.compositionService.getPlanOptions(programId); }

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @RequireRoles(...UNIVERSITY_ROLES, ...CLUSTER_ROLES)
  @ApiOperation({ summary: 'التحقق من الطلب قبل الإرسال وعرض ملخصه' })
  async preview(@Body() dto: PreviewTrainingRequestDto) { return this.compositionService.previewRequest(dto); }

  @Get()
  @RequireCapability(CAPABILITIES.TRAINING_REQUEST_VIEW)
  @ApiOperation({ summary: 'قائمة طلبات التدريب الواردة للتجمع الصحي أو الصادرة من الجامعة' })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(@Scope() scope: ScopeContext, @Query('status') status?: string, @Query('page') page = 1, @Query('limit') limit = 20) {
    return this.trainingRequestsService.findAll(scope, { status, page: +page, limit: +limit });
  }

  @Get('hospital-review')
  @RequireCapability(CAPABILITIES.TRAINING_REQUEST_VIEW)
  @ApiOperation({ summary: 'قائمة المتدربين الموزَّعين على المستشفى لمراجعتها' })
  async findForHospitalReview(@Scope() scope: ScopeContext, @OrgContext() orgId: string, @Query('hospitalId') hospitalIdQuery?: string, @CurrentUser() user?: IAuthenticatedUser) {
    const targetOrgId = hospitalIdQuery || orgId || user?.organizationId;
    if (!targetOrgId) return { data: [] };
    if (scope.visibleOrgIds !== null && !scope.visibleOrgIds.includes(targetOrgId)) throw new ForbiddenException('هذا المستشفى خارج نطاق صلاحياتك التنظيمية');
    return this.traineesService.findForHospitalReview(targetOrgId);
  }

  @Get(':id/summary') @RequireCapability(CAPABILITIES.TRAINING_REQUEST_VIEW) @ScopedResource('trainingRequest', 'id')
  async summary(@Param('id') id: string) { return this.compositionService.getRequestSummary(id); }
  @Get(':id') @RequireCapability(CAPABILITIES.TRAINING_REQUEST_VIEW) @ScopedResource('trainingRequest', 'id')
  async findOne(@Param('id') id: string) { return this.trainingRequestsService.findOne(id); }
  @Post() @RequireCapability(CAPABILITIES.TRAINING_REQUEST_CREATE)
  async create(@Body() dto: CreateTrainingRequestDto, @CurrentUser() user: IAuthenticatedUser) { return this.trainingRequestsService.create(dto, user); }
  @Patch(':id') @RequireCapability(CAPABILITIES.TRAINING_REQUEST_REVIEW, CAPABILITIES.TRAINING_REQUEST_CREATE) @ScopedResource('trainingRequest', 'id')
  async update(@Param('id') id: string, @Body() dto: UpdateTrainingRequestDto, @CurrentUser() user: IAuthenticatedUser) { return this.trainingRequestsService.update(id, dto, user); }
  @Post(':id/auto-allocate') @RequireCapability(CAPABILITIES.ALLOCATION_CLUSTER_AUTO) @ScopedResource('trainingRequest', 'id')
  async autoAllocate(@Param('id') id: string, @CurrentUser() user: IAuthenticatedUser) { return this.trainingRequestsService.autoAllocate(id, user); }
  @Get(':id/validate-capacity') @RequireCapability(CAPABILITIES.CAPACITY_VIEW) @ScopedResource('trainingRequest', 'id')
  async validateCapacity(@Param('id') id: string) { return this.trainingRequestsService.validateCapacity(id); }
  @Post(':id/approve') @RequireCapability(CAPABILITIES.TRAINING_REQUEST_APPROVE) @ScopedResource('trainingRequest', 'id')
  async approve(@Param('id') id: string, @CurrentUser() user: IAuthenticatedUser) { return this.trainingRequestsService.approve(id, user); }
  @Post(':id/finalize-approvals') @RequireCapability(CAPABILITIES.TRAINING_REQUEST_APPROVE) @ScopedResource('trainingRequest', 'id')
  async finalizeApprovals(@Param('id') id: string, @CurrentUser() user: IAuthenticatedUser) { return this.trainingRequestsService.finalizeApprovals(id, user); }
  @Post(':id/reject') @RequireRoles(...CLUSTER_ROLES, ...HOSPITAL_ROLES, 'trainer') @ScopedResource('trainingRequest', 'id')
  async reject(@Param('id') id: string, @Body() body: { reason?: string; notes?: string }, @CurrentUser() user: IAuthenticatedUser) { const isCluster = user.roles?.some((r) => (CLUSTER_ROLES as readonly string[]).includes(r)); return isCluster ? this.trainingRequestsService.reject(id, body.reason, user) : this.trainingRequestsService.advanceAcceptanceChain(id, 'reject', body.notes ?? body.reason, user); }
  @Post(':id/return-to-university') @RequireCapability(CAPABILITIES.TRAINING_REQUEST_RETURN) @ScopedResource('trainingRequest', 'id')
  async returnToUniversity(@Param('id') id: string, @Body() body: { notes?: string }, @CurrentUser() user: IAuthenticatedUser) { return this.trainingRequestsService.returnToUniversity(id, body.notes, user); }
  @Post(':id/clone') @RequireRoles(...CLUSTER_ROLES, ...UNIVERSITY_ROLES) async cloneRequest(@Param('id') id: string, @CurrentUser() user: IAuthenticatedUser) { return this.trainingRequestsService.cloneRequest(id, user); }
  @Post(':id/reset') @RequireRoles(...CLUSTER_ROLES) async resetRequest(@Param('id') id: string, @CurrentUser() user: IAuthenticatedUser) { return this.trainingRequestsService.resetRequest(id, user); }
  @Post(':id/accept-hospital-director') @RequireRoles(...HOSPITAL_ROLES) @ScopedResource('trainingRequest', 'id')
  async acceptByHospitalDirector(@Param('id') id: string, @Body() body: { notes?: string }, @CurrentUser() user: IAuthenticatedUser) { return this.trainingRequestsService.acceptByHospitalDirector(id, body.notes, user); }
  @Post(':id/accept-supervisor') @RequireRoles('hospital_training_admin', 'academic_supervisor', 'platform_owner') @ScopedResource('trainingRequest', 'id')
  async acceptBySupervisor(@Param('id') id: string, @Body() body: { notes?: string }, @CurrentUser() user: IAuthenticatedUser) { return this.trainingRequestsService.acceptBySupervisor(id, body.notes, user); }
  @Post(':id/accept-trainer') @RequireRoles('trainer', 'platform_owner') @ScopedResource('trainingRequest', 'id')
  async acceptByTrainer(@Param('id') id: string, @Body() body: { notes?: string }, @CurrentUser() user: IAuthenticatedUser) { return this.trainingRequestsService.acceptByTrainer(id, body.notes, user); }
  @Post(':id/accept-intern') @RequireRoles('trainee', 'platform_owner') @ScopedResource('trainingRequest', 'id')
  async acceptByIntern(@Param('id') id: string, @CurrentUser() user: IAuthenticatedUser) { return this.trainingRequestsService.acceptByIntern(id, user); }
  @Get(':id/trainees') @RequireCapability(CAPABILITIES.TRAINING_REQUEST_VIEW, CAPABILITIES.TRAINEE_VIEW_SCOPE, CAPABILITIES.TRAINEE_VIEW_HOSPITAL) @ScopedResource('trainingRequest', 'id')
  async findTrainees(@Param('id') id: string) { return this.traineesService.findByRequest(id); }
  @Post(':id/trainees/import') @RequireRoles(...UNIVERSITY_ROLES, ...CLUSTER_ROLES)
  async importTrainees(@Param('id') id: string, @Body() dto: ImportTraineesDto, @CurrentUser() user: IAuthenticatedUser) { return this.traineesService.importTrainees(id, dto.rows, user); }
  @Post(':id/trainees/submit') @RequireRoles(...UNIVERSITY_ROLES, ...CLUSTER_ROLES)
  async submitBatch(@Param('id') id: string, @CurrentUser() user: IAuthenticatedUser) { return this.traineesService.submitBatch(id, user); }
  @Post(':id/trainees/validate') @RequireRoles(...CLUSTER_ROLES) async validateBatch(@Param('id') id: string) { return this.traineesService.runValidation(id); }

  @Get('trainees/returned')
  @RequireRoles(...UNIVERSITY_ROLES, ...ACADEMIC_ROLES)
  @ApiOperation({ summary: 'الصفوف المُعادة للجامعة للتصحيح — للجامعة والمتابعة الأكاديمية' })
  async findReturned(@OrgContext() orgId: string) { return this.traineesService.findReturnedForUniversity(orgId); }

  @Patch('trainees/:rowId') @RequireRoles(...CLUSTER_ROLES) @ScopedResource('trainingRequestTrainee', 'rowId')
  async editTrainee(@Param('rowId') rowId: string, @Body() dto: UpdateTraineeRowDto, @CurrentUser() user: IAuthenticatedUser) { return this.traineesService.editTrainee(rowId, dto, user); }
  @Post('trainees/:rowId/merge') @RequireRoles(...CLUSTER_ROLES) @ScopedResource('trainingRequestTrainee', 'rowId')
  async mergeTrainees(@Param('rowId') rowId: string, @Body() dto: MergeTraineesDto, @CurrentUser() user: IAuthenticatedUser) { return this.traineesService.mergeTrainees(rowId, dto, user); }
  @Post('trainees/:rowId/split') @RequireRoles(...CLUSTER_ROLES) @ScopedResource('trainingRequestTrainee', 'rowId')
  async splitTrainee(@Param('rowId') rowId: string, @Body() dto: SplitTraineeDto, @CurrentUser() user: IAuthenticatedUser) { return this.traineesService.splitTrainee(rowId, dto, user); }
  @Post('trainees/:rowId/approve') @RequireRoles(...CLUSTER_ROLES) @ScopedResource('trainingRequestTrainee', 'rowId')
  async approveTrainee(@Param('rowId') rowId: string, @CurrentUser() user: IAuthenticatedUser) { return this.traineesService.approveTrainee(rowId, user); }
  @Post('trainees/:rowId/reject') @RequireRoles(...CLUSTER_ROLES) @ScopedResource('trainingRequestTrainee', 'rowId')
  async rejectTrainee(@Param('rowId') rowId: string, @Body() dto: RejectTraineeDto, @CurrentUser() user: IAuthenticatedUser) { return this.traineesService.rejectTrainee(rowId, dto, user); }
  @Post('trainees/:rowId/return') @RequireRoles(...CLUSTER_ROLES) @ScopedResource('trainingRequestTrainee', 'rowId')
  async returnTrainee(@Param('rowId') rowId: string, @Body() dto: ReturnTraineeDto, @CurrentUser() user: IAuthenticatedUser) { return this.traineesService.returnTraineeToUniversity(rowId, dto, user); }
  @Post('trainees/:rowId/resubmit') @RequireRoles(...UNIVERSITY_ROLES) @ScopedResource('trainingRequestTrainee', 'rowId')
  async resubmitTrainee(@Param('rowId') rowId: string, @Body() dto: UpdateTraineeRowDto, @CurrentUser() user: IAuthenticatedUser) { return this.traineesService.resubmitTrainee(rowId, dto, user); }
  @Patch('trainees/:rowId/allocation') @RequireCapability(CAPABILITIES.ALLOCATION_CLUSTER_MANUAL, CAPABILITIES.ALLOCATION_CLUSTER_REASSIGN) @ScopedResource('trainingRequestTrainee', 'rowId')
  async allocateRow(@Param('rowId') rowId: string, @Body() body: { hospitalId?: string }, @CurrentUser() user: IAuthenticatedUser) { return this.trainingRequestsService.allocateTraineeRow(rowId, body.hospitalId, user); }
  @Post('trainees/:rowId/hospital-review/start') @RequireRoles(...HOSPITAL_ROLES) @ScopedResource('trainingRequestTrainee', 'rowId')
  async startHospitalReview(@Param('rowId') rowId: string, @CurrentUser() user: IAuthenticatedUser) { return this.traineesService.startHospitalReview(rowId, user); }
  @Post('trainees/:rowId/hospital-review/accept') @RequireRoles(...HOSPITAL_ROLES) @ScopedResource('trainingRequestTrainee', 'rowId')
  async hospitalAcceptIntern(@Param('rowId') rowId: string, @Body() body: { notes?: string }, @CurrentUser() user: IAuthenticatedUser) { return this.traineesService.hospitalAcceptIntern(rowId, user, body?.notes); }
  @Post('trainees/:rowId/hospital-review/reject') @RequireRoles(...HOSPITAL_ROLES) @ScopedResource('trainingRequestTrainee', 'rowId')
  async hospitalRejectIntern(@Param('rowId') rowId: string, @Body() dto: HospitalRejectDto, @CurrentUser() user: IAuthenticatedUser) { return this.traineesService.hospitalRejectIntern(rowId, dto, user); }
  @Post('trainees/:rowId/hospital-review/return-to-cluster') @RequireRoles(...HOSPITAL_ROLES) @ScopedResource('trainingRequestTrainee', 'rowId')
  async hospitalReturnToCluster(@Param('rowId') rowId: string, @Body() dto: HospitalReturnDto, @CurrentUser() user: IAuthenticatedUser) { return this.traineesService.hospitalReturnToCluster(rowId, dto, user); }
  @Post('trainees/:rowId/hospital-review/request-documents') @RequireRoles(...HOSPITAL_ROLES) @ScopedResource('trainingRequestTrainee', 'rowId')
  async requestMissingDocuments(@Param('rowId') rowId: string, @Body() dto: RequestMissingDocsDto, @CurrentUser() user: IAuthenticatedUser) { return this.traineesService.requestMissingDocuments(rowId, dto, user); }
  @Post('trainees/:rowId/hospital-review/request-correction') @RequireRoles(...HOSPITAL_ROLES) @ScopedResource('trainingRequestTrainee', 'rowId')
  async requestDataCorrection(@Param('rowId') rowId: string, @Body() dto: RequestDataCorrectionDto, @CurrentUser() user: IAuthenticatedUser) { return this.traineesService.requestDataCorrection(rowId, dto, user); }
  @Patch('trainees/:rowId/hospital-review/assignment') @RequireCapability(CAPABILITIES.ALLOCATION_HOSPITAL_ASSIGN, CAPABILITIES.ALLOCATION_HOSPITAL_REASSIGN) @ScopedResource('trainingRequestTrainee', 'rowId')
  async changeAssignment(@Param('rowId') rowId: string, @Body() dto: ChangeAssignmentDto, @CurrentUser() user: IAuthenticatedUser, @Scope() scope: ScopeContext) { return this.traineesService.changeAssignment(rowId, dto, user, scope); }
  @Post('trainees/:rowId/hospital-review/hold') @RequireRoles(...HOSPITAL_ROLES) @ScopedResource('trainingRequestTrainee', 'rowId')
  async putOnHold(@Param('rowId') rowId: string, @Body() dto: PutOnHoldDto, @CurrentUser() user: IAuthenticatedUser) { return this.traineesService.putOnHold(rowId, dto, user); }
  @Post('trainees/:rowId/hospital-review/resume') @RequireRoles(...HOSPITAL_ROLES) @ScopedResource('trainingRequestTrainee', 'rowId')
  async resumeFromHold(@Param('rowId') rowId: string, @CurrentUser() user: IAuthenticatedUser) { return this.traineesService.resumeFromHold(rowId, user); }
  @Post(':id/accept') @RequireRoles(...HOSPITAL_ROLES, 'trainer') @ScopedResource('trainingRequest', 'id')
  async acceptRequest(@Param('id') id: string, @Body('notes') notes?: string, @CurrentUser() user?: IAuthenticatedUser) { return this.trainingRequestsService.advanceAcceptanceChain(id, 'approve', notes, user); }
  @Post(':id/return-to-cluster') @RequireRoles(...HOSPITAL_ROLES, 'trainer') @ScopedResource('trainingRequest', 'id')
  async returnToCluster(@Param('id') id: string, @Body('notes') notes?: string, @CurrentUser() user?: IAuthenticatedUser) { return this.trainingRequestsService.advanceAcceptanceChain(id, 'return_to_cluster', notes, user); }
  @Get('trainees/:profileId/graduation/eligibility') @RequireCapability(CAPABILITIES.GRADUATION_APPROVE, CAPABILITIES.TRAINEE_VIEW_SCOPE, CAPABILITIES.TRAINEE_VIEW_HOSPITAL, CAPABILITIES.TRAINEE_VIEW_ASSIGNED, CAPABILITIES.SELF_VIEW)
  async checkGraduationEligibility(@Param('profileId') profileId: string) { return this.graduationService.checkEligibility(profileId); }
  @Post('trainees/:profileId/graduation/approve') @RequireRoles('trainer', ...HOSPITAL_ROLES, 'university_administrator')
  async submitGraduationApproval(@Param('profileId') profileId: string, @CurrentUser() user: IAuthenticatedUser, @Body('notes') notes?: string) { return this.graduationService.submitApproval(profileId, user, notes); }
  @Get('trainees/:rowId/allocations') @RequireCapability(CAPABILITIES.TRAINEE_VIEW_SCOPE, CAPABILITIES.TRAINEE_VIEW_HOSPITAL, CAPABILITIES.TIMELINE_VIEW) @ScopedResource('trainingRequestTrainee', 'rowId')
  async allocationHistory(@Param('rowId') rowId: string, @Scope() scope: ScopeContext) { const data = await this.allocationService.findHistory(rowId, scope); return { data }; }
  @Post('trainees/:rowId/allocations/hospital') @RequireCapability(CAPABILITIES.ALLOCATION_CLUSTER_MANUAL, CAPABILITIES.ALLOCATION_CLUSTER_REASSIGN) @ScopedResource('trainingRequestTrainee', 'rowId')
  async allocateToHospital(@Param('rowId') rowId: string, @Body() body: { hospitalId: string; reason?: string; startDate?: string; endDate?: string }, @CurrentUser() user: IAuthenticatedUser, @Scope() scope: ScopeContext) { const open = await this.allocationService.findOpen(rowId); return this.allocationService.allocateToHospital(rowId, { hospitalId: body.hospitalId, startDate: body.startDate ? new Date(body.startDate) : null, endDate: body.endDate ? new Date(body.endDate) : null }, open ? 'cluster_reassign' : 'manual', user, scope, body.reason); }
  @Post('trainees/:rowId/allocations/department') @RequireCapability(CAPABILITIES.ALLOCATION_HOSPITAL_ASSIGN, CAPABILITIES.ALLOCATION_HOSPITAL_REASSIGN) @ScopedResource('trainingRequestTrainee', 'rowId')
  async assignWithinHospital(@Param('rowId') rowId: string, @Body() body: { departmentId?: string; trainerProfileId?: string; supervisorAccountId?: string; reason?: string; startDate?: string; endDate?: string }, @CurrentUser() user: IAuthenticatedUser, @Scope() scope: ScopeContext) { return this.allocationService.assignWithinHospital(rowId, { departmentId: body.departmentId, trainerProfileId: body.trainerProfileId, supervisorAccountId: body.supervisorAccountId, startDate: body.startDate ? new Date(body.startDate) : null, endDate: body.endDate ? new Date(body.endDate) : null }, user, scope); }
}
