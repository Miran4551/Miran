import { Body, Controller, Get, Param, Patch, Post, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DeclarationsService } from './declarations.service';
import { CreateDeclarationDto, AcceptDeclarationDto } from './dto/declaration.dto';
import { JwtAuthGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators';
import { IAuthenticatedUser } from '../../common/interfaces';
import { CapabilityGuard, CAPABILITIES, RequireCapability, ScopeContextService } from '../../common/authz';

@ApiTags('Declarations & Compliance (الإقرارات والتعهدات)')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, CapabilityGuard)
@Controller('declarations')
export class DeclarationsController {
  constructor(
    private readonly service: DeclarationsService,
    private readonly scopeContext: ScopeContextService,
  ) {}

  @Post()
  @RequireCapability(CAPABILITIES.DECLARATION_MANAGE)
  @ApiOperation({ summary: 'إنشاء إقرار وتعهد جديد (إدارة التدريب)' })
  async create(@Body() dto: CreateDeclarationDto, @CurrentUser() user: IAuthenticatedUser) {
    const scope = await this.scopeContext.resolve(user);
    return this.service.createDeclaration(scope.organizationId, dto, user.accountId);
  }

  @Get()
  @RequireCapability(CAPABILITIES.DECLARATION_MANAGE)
  @ApiOperation({ summary: 'إدارة إقرارات الجهة' })
  async getByOrg(@CurrentUser() user: IAuthenticatedUser) {
    const scope = await this.scopeContext.resolve(user);
    return this.service.getDeclarationsByOrg(scope.organizationId);
  }

  @Get('pending')
  @ApiOperation({ summary: 'استرجاع الإقرارات المطلوبة والمعلقة للمستخدم الحالي' })
  async getPending(@CurrentUser() user: IAuthenticatedUser) {
    const scope = await this.scopeContext.resolve(user);
    return this.service.getPendingDeclarationsForUser(user.accountId, scope.organizationId);
  }

  @Post('accept')
  @ApiOperation({ summary: 'الموافقة والتوقيع الرقمي على إقرار وتعهد' })
  async accept(@Body() dto: AcceptDeclarationDto, @CurrentUser() user: IAuthenticatedUser, @Req() req: any) {
    const scope = await this.scopeContext.resolve(user);
    const ip = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
    return this.service.acceptDeclaration(user.accountId, scope.organizationId, dto, ip);
  }

  @Patch(':id/status')
  @RequireCapability(CAPABILITIES.DECLARATION_MANAGE)
  @ApiOperation({ summary: 'تفعيل أو إيقاف إقرار' })
  async setStatus(
    @Param('id') id: string,
    @Body() body: { isActive: boolean },
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    const scope = await this.scopeContext.resolve(user);
    return this.service.setDeclarationStatus(scope.organizationId, id, Boolean(body.isActive), user.accountId);
  }

  @Post(':id/version')
  @RequireCapability(CAPABILITIES.DECLARATION_MANAGE)
  @ApiOperation({ summary: 'إنشاء إصدار جديد من إقرار معتمد' })
  async createVersion(
    @Param('id') id: string,
    @Body() body: { titleAr?: string; contentAr?: string; isMandatory?: boolean; activate?: boolean },
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    const scope = await this.scopeContext.resolve(user);
    return this.service.createDeclarationVersion(scope.organizationId, id, body, user.accountId);
  }

  @Get('statistics')
  @RequireCapability(CAPABILITIES.DECLARATION_MANAGE)
  @ApiOperation({ summary: 'استرجاع إحصائيات الموافقة ونسبة انضباط الإقرارات' })
  async getStatistics(@CurrentUser() user: IAuthenticatedUser) {
    const scope = await this.scopeContext.resolve(user);
    return this.service.getAcceptanceStatistics(scope.organizationId);
  }
}
