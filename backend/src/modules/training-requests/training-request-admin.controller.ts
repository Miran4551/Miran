import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  UseGuards,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUser } from '../../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import {
  CAPABILITIES,
  CapabilityGuard,
  RequireCapability,
  Scope,
  ScopeContext,
  ScopedResource,
  ScopeGuard,
} from '../../common/authz';
import { IAuthenticatedUser } from '../../common/interfaces';

const EDITABLE_STATUSES = new Set([
  'draft',
  'submitted',
  'resubmitted',
  'under_cluster_review',
  'returned_to_university',
]);

@ApiTags('Training Requests Administration')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard, CapabilityGuard, ScopeGuard)
@Controller('training-requests')
export class TrainingRequestAdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Patch(':id/manage')
  @RequireCapability(CAPABILITIES.TRAINING_REQUEST_CREATE, CAPABILITIES.TRAINING_REQUEST_REVIEW)
  @ScopedResource('trainingRequest', 'id')
  @ApiOperation({ summary: 'تعديل بيانات طلب تدريب غير مفعل' })
  async manage(
    @Param('id') id: string,
    @Body()
    body: {
      specialty?: string;
      trainingStartDate?: string;
      trainingEndDate?: string;
      expectedGraduationDate?: string;
      priority?: string;
      notes?: string;
    },
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    const existing = await this.prisma.trainingRequest.findUnique({
      where: { id },
      include: { trainees: { select: { id: true } } },
    });
    if (!existing) throw new NotFoundException('طلب التدريب غير موجود');
    if (!EDITABLE_STATUSES.has(existing.status)) {
      throw new BadRequestException(
        `لا يمكن تعديل طلب التدريب بالحالة الحالية «${existing.status}». التعديل متاح للطلبات غير المفعلة فقط.`,
      );
    }

    const parseDate = (value?: string) => {
      if (value === undefined || value === '') return undefined;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) throw new BadRequestException('صيغة التاريخ غير صحيحة');
      return date;
    };

    const startDate = parseDate(body.trainingStartDate);
    const endDate = parseDate(body.trainingEndDate);
    const graduationDate = parseDate(body.expectedGraduationDate);
    if (startDate && endDate && endDate < startDate) {
      throw new BadRequestException('تاريخ نهاية التدريب يجب أن يكون بعد تاريخ البداية');
    }

    const updated = await this.prisma.trainingRequest.update({
      where: { id },
      data: {
        specialty: body.specialty !== undefined ? body.specialty.trim() || null : undefined,
        trainingStartDate: startDate,
        trainingEndDate: endDate,
        expectedGraduationDate: graduationDate,
        priority: body.priority !== undefined ? body.priority : undefined,
        notes: body.notes !== undefined ? body.notes : undefined,
        updatedById: user?.accountId,
      },
      include: {
        sourceOrg: true,
        targetOrg: true,
        program: true,
        academicIntake: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: existing.targetOrgId,
        actorId: user?.accountId,
        action: 'edit_training_request_before_activation',
        entityType: 'TrainingRequest',
        entityId: id,
        oldValues: {
          specialty: existing.specialty,
          trainingStartDate: existing.trainingStartDate,
          trainingEndDate: existing.trainingEndDate,
          expectedGraduationDate: existing.expectedGraduationDate,
          priority: existing.priority,
          notes: existing.notes,
        },
        newValues: {
          specialty: updated.specialty,
          trainingStartDate: updated.trainingStartDate,
          trainingEndDate: updated.trainingEndDate,
          expectedGraduationDate: updated.expectedGraduationDate,
          priority: updated.priority,
          notes: updated.notes,
        },
      },
    });

    return { data: updated, success: true, message: 'تم تعديل طلب التدريب بنجاح' };
  }

  @Delete(':id')
  @RequireCapability(CAPABILITIES.TRAINING_REQUEST_CREATE, CAPABILITIES.TRAINING_REQUEST_REVIEW)
  @ScopedResource('trainingRequest', 'id')
  @ApiOperation({ summary: 'حذف طلب تدريب غير مفعل مع سجلاته المؤقتة' })
  async remove(@Param('id') id: string, @CurrentUser() user: IAuthenticatedUser, @Scope() _scope: ScopeContext) {
    const existing = await this.prisma.trainingRequest.findUnique({
      where: { id },
      include: {
        trainees: {
          select: { id: true, traineeProfileId: true },
        },
        producedBatch: { select: { id: true, code: true } },
      },
    });
    if (!existing) throw new NotFoundException('طلب التدريب غير موجود');

    if (!EDITABLE_STATUSES.has(existing.status)) {
      throw new BadRequestException(
        `لا يمكن حذف طلب التدريب بالحالة الحالية «${existing.status}». الحذف متاح للطلبات غير المفعلة فقط.`,
      );
    }
    if (existing.producedBatch) {
      throw new BadRequestException(
        `لا يمكن حذف الطلب لأنه مرتبط بدفعة أكاديمية (${existing.producedBatch.code}). احذف/أرشِف الدفعة أولاً.`,
      );
    }
    if (existing.trainees.some((row) => !!row.traineeProfileId)) {
      throw new BadRequestException(
        'لا يمكن حذف الطلب لأن أحد المتدربين تم تحويله بالفعل إلى ملف تدريبي. استخدم مسار الإلغاء الإداري بدلاً من الحذف.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const rowIds = existing.trainees.map((row) => row.id);

      if (rowIds.length > 0) {
        await tx.document.deleteMany({ where: { trainingRequestTraineeId: { in: rowIds } } });
        await tx.traineeAllocation.deleteMany({ where: { traineeRowId: { in: rowIds } } });
        await tx.trainingRequestTrainee.deleteMany({ where: { id: { in: rowIds } } });
      }

      await tx.trainingRequest.delete({ where: { id } });

      await tx.auditLog.create({
        data: {
          organizationId: existing.targetOrgId,
          actorId: user?.accountId,
          action: 'delete_inactive_training_request',
          entityType: 'TrainingRequest',
          entityId: id,
          oldValues: {
            requestNumber: existing.requestNumber,
            status: existing.status,
            studentCount: existing.studentCount,
          },
          newValues: { deleted: true },
        },
      });
    });

    return {
      success: true,
      message: `تم حذف طلب التدريب ${existing.requestNumber} وسجلات المتدربين المؤقتة المرتبطة به`,
    };
  }
}
