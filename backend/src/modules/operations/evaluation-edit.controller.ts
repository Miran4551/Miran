import { BadRequestException, Body, Controller, ForbiddenException, NotFoundException, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { CurrentUser, RequireRoles } from '../../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { IAuthenticatedUser } from '../../common/interfaces';
import { PrismaService } from '../../prisma/prisma.service';
import { CapabilityGuard } from '../../common/authz';

@ApiTags('Production Operations — Evaluations')
@ApiBearerAuth('JWT-auth')
@Controller('operations/evaluations')
@UseGuards(JwtAuthGuard, RolesGuard, CapabilityGuard)
export class EvaluationEditController {
  constructor(private prisma: PrismaService) {}

  @Patch(':id')
  @RequireRoles('trainer', 'academic_supervisor', 'org_manager', 'platform_owner')
  @ApiOperation({ summary: 'تعديل تقييم مرسل — يسمح للمدرب بتعديل تقييمه السابق بدلاً من إنشاء سجل مكرر' })
  async updateEvaluation(
    @Param('id') id: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Body() dto: { scores?: Record<string, unknown>; totalScore?: number; comments?: string },
  ) {
    const evaluation = await this.prisma.evaluation.findUnique({
      where: { id },
      include: { form: true, rotation: { select: { trainerProfileId: true, organizationId: true } } },
    });
    if (!evaluation) throw new NotFoundException('التقييم غير موجود');
    if (evaluation.organizationId !== user.organizationId) {
      throw new ForbiddenException('هذا التقييم خارج نطاق مستشفاك التنظيمي');
    }
    if (evaluation.evaluatorId !== user.accountId) {
      throw new ForbiddenException('لا يمكنك تعديل تقييم لم ترسله أنت');
    }

    if (user.roles.includes('trainer') && !user.roles.includes('org_manager') && !user.roles.includes('platform_owner')) {
      const trainer = await this.prisma.trainerProfile.findFirst({
        where: { person: { userAccounts: { some: { id: user.accountId } } } },
        select: { id: true },
      });
      if (!trainer || evaluation.rotation?.trainerProfileId !== trainer.id) {
        throw new ForbiddenException('لا يمكنك تعديل تقييم خارج دورة تدريبية مسندة إليك');
      }
    }

    const rawScores = { ...((dto.scores ?? {}) as Record<string, unknown>) };
    const items = Array.isArray(evaluation.form?.items)
      ? (evaluation.form.items as Array<{ code?: string; nameAr?: string; max?: number }>)
      : [];
    const scored = items.filter((item) => item.code && rawScores[item.code] !== undefined && rawScores[item.code] !== '');

    let totalScore = dto.totalScore;
    let percentage: number | undefined;

    if (items.length > 0 && scored.length > 0) {
      let awarded = 0;
      let maxTotal = 0;
      for (const item of items) {
        const max = Number(item.max ?? 0);
        maxTotal += max;
        const raw = rawScores[item.code as string];
        if (raw === undefined || raw === '') {
          throw new BadRequestException(`درجة المعيار «${item.nameAr ?? item.code}» مطلوبة`);
        }
        const value = Number(raw);
        if (!Number.isFinite(value)) {
          throw new BadRequestException(`درجة المعيار «${item.nameAr ?? item.code}» يجب أن تكون رقماً`);
        }
        if (value < 0) {
          throw new BadRequestException(`درجة المعيار «${item.nameAr ?? item.code}» لا يمكن أن تكون سالبة`);
        }
        if (max > 0 && value > max) {
          throw new BadRequestException(`درجة المعيار «${item.nameAr ?? item.code}» تتجاوز الحد الأقصى (${max})`);
        }
        rawScores[item.code as string] = value;
        awarded += value;
      }
      totalScore = awarded;
      percentage = maxTotal > 0 ? Math.round((awarded / maxTotal) * 100) : undefined;
      rawScores._total = awarded;
      rawScores._maxTotal = maxTotal;
      rawScores._percentage = percentage;
    } else if (totalScore !== undefined) {
      const numericTotal = Number(totalScore);
      if (!Number.isFinite(numericTotal) || numericTotal < 0 || numericTotal > 100) {
        throw new BadRequestException('الدرجة يجب أن تكون بين 0 و100');
      }
      totalScore = numericTotal;
      rawScores._total = numericTotal;
      rawScores._percentage = numericTotal;
    } else {
      throw new BadRequestException('الدرجة مطلوبة عند تعديل التقييم');
    }

    if ((totalScore ?? 0) < 60 && !dto.comments?.trim() && !evaluation.comments?.trim()) {
      throw new BadRequestException('التقييمات المنخفضة (أقل من 60%) تستلزم تعليقاً إلزامياً يوضح السبب.');
    }

    const data = await this.prisma.evaluation.update({
      where: { id },
      data: {
        scores: rawScores as Prisma.InputJsonValue,
        totalScore,
        comments: dto.comments?.trim() || undefined,
      },
      include: { form: true, rotation: { include: { department: true } } },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.accountId,
        action: `evaluation.update.${evaluation.evaluationType}`,
        entityType: 'Evaluation',
        entityId: id,
        newValues: { totalScore, percentage } as Prisma.InputJsonValue,
      },
    });

    return { success: true, data, message: 'تم تعديل التقييم وحفظ الدرجة بنجاح' };
  }
}
