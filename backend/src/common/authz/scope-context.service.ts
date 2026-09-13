// ============================================================================
// ScopeContext — one resolver for "who is asking, from where, and what may they
// see". Every training service filters through this and nothing else.
// ============================================================================

import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IAuthenticatedUser } from '../interfaces';
import { Capability, ContextType, capabilitiesForRoles, capabilityAllowedInContext } from './capabilities';

export type ScopeLevel = 'PLATFORM' | 'ORGANIZATION' | 'HOSPITAL' | 'DEPARTMENT';

export interface ScopeContext {
  accountId: string;
  personId: string;
  email: string;
  roles: string[];
  capabilities: Set<Capability>;
  contextType: ContextType;
  level: ScopeLevel;
  organizationId: string;
  clusterId: string | null;
  hospitalId: string | null;
  departmentIds: string[];
  visibleOrgIds: string[] | null;
}

const PLATFORM_ROLES = ['platform_owner', 'system_admin', 'holding_administrator'];
const HOSPITAL_ROLES = ['hospital_training_admin', 'hospital_administrator', 'trainer', 'trainee'];
const KNOWN_ROLES = [...PLATFORM_ROLES, ...HOSPITAL_ROLES, 'cluster_manager', 'cluster_administrator', 'training_director', 'university_administrator', 'academic_supervisor', 'academic_affairs', 'org_manager'];

@Injectable()
export class ScopeContextService {
  constructor(private prisma: PrismaService) {}

  async resolve(user: IAuthenticatedUser): Promise<ScopeContext> {
    const roles = user.roles ?? [];
    if (!roles.some((r) => KNOWN_ROLES.includes(r))) {
      throw new ForbiddenException('الدور الوظيفي للمستخدم غير معروف أو غير معتمد في المنصة');
    }

    const capabilities = new Set<Capability>(capabilitiesForRoles(roles));
    const isPlatform = roles.some((r) => PLATFORM_ROLES.includes(r));
    const org = await this.prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { id: true, parentId: true, organizationType: { select: { code: true } } },
    });

    const orgTypeCode = org?.organizationType?.code ?? null;
    const contextType = this.contextTypeFor(orgTypeCode, isPlatform);
    const clusterId = await this.resolveClusterId(org?.id ?? null, orgTypeCode, org?.parentId ?? null);
    const isHospitalContext = orgTypeCode === 'hospital';
    const level: ScopeLevel = isPlatform
      ? 'PLATFORM'
      : isHospitalContext && roles.some((r) => HOSPITAL_ROLES.includes(r))
        ? 'HOSPITAL'
        : 'ORGANIZATION';

    let visibleOrgIds: string[] | null = null;
    if (!isPlatform) {
      visibleOrgIds = await this.resolveVisibleOrgIds(user.organizationId, orgTypeCode, contextType);
      if (contextType === 'cluster' && clusterId) {
        visibleOrgIds = [...new Set([...visibleOrgIds, clusterId])];
      }
    }

    return {
      accountId: user.accountId,
      personId: user.personId,
      email: user.email,
      roles,
      capabilities,
      contextType,
      level,
      organizationId: user.organizationId,
      clusterId,
      hospitalId: isHospitalContext ? user.organizationId : null,
      departmentIds: [],
      visibleOrgIds,
    };
  }

  private contextTypeFor(orgTypeCode: string | null, isPlatform: boolean): ContextType {
    if (orgTypeCode === 'hospital') return 'hospital';
    if (orgTypeCode === 'cluster') return 'cluster';
    if (orgTypeCode === 'university' || orgTypeCode === 'college') return 'university';
    return isPlatform ? 'platform' : 'cluster';
  }

  private async resolveClusterId(orgId: string | null, orgTypeCode: string | null, parentId: string | null): Promise<string | null> {
    if (!orgId) return null;
    if (orgTypeCode === 'cluster') {
      let root = orgId;
      let cursor = parentId;
      for (let hops = 0; cursor && hops < 8; hops++) {
        const parent = await this.prisma.organization.findUnique({
          where: { id: cursor },
          select: { id: true, parentId: true, organizationType: { select: { code: true } } },
        });
        if (!parent || parent.organizationType?.code !== 'cluster') break;
        root = parent.id;
        cursor = parent.parentId;
      }
      return root;
    }
    let cursor = parentId;
    for (let hops = 0; cursor && hops < 8; hops++) {
      const parent = await this.prisma.organization.findUnique({
        where: { id: cursor },
        select: { id: true, parentId: true, organizationType: { select: { code: true } } },
      });
      if (!parent) return null;
      if (parent.organizationType?.code === 'cluster') return parent.id;
      cursor = parent.parentId;
    }
    return null;
  }

  private async resolveVisibleOrgIds(orgId: string, orgTypeCode: string | null, contextType: ContextType): Promise<string[]> {
    if (contextType !== 'cluster') return [orgId];
    const root = orgTypeCode === 'cluster' ? await this.findRootCluster(orgId) : orgId;
    const ids = new Set<string>([root, orgId]);
    const queue = [root, ...(root === orgId ? [] : [orgId])];
    for (let hops = 0; queue.length > 0 && hops < 500; hops++) {
      const parentId = queue.shift()!;
      const children = await this.prisma.organization.findMany({
        where: { parentId, deletedAt: null },
        select: { id: true },
      });
      for (const child of children) {
        if (!ids.has(child.id)) {
          ids.add(child.id);
          queue.push(child.id);
        }
      }
    }
    return [...ids];
  }

  private async findRootCluster(orgId: string): Promise<string> {
    let root = orgId;
    let cursor: string | null = orgId;
    for (let hops = 0; cursor && hops < 8; hops++) {
      const current = await this.prisma.organization.findUnique({
        where: { id: cursor },
        select: { id: true, parentId: true, organizationType: { select: { code: true } } },
      });
      if (!current || current.organizationType?.code !== 'cluster') break;
      root = current.id;
      cursor = current.parentId;
      if (!cursor) break;
      const parent = await this.prisma.organization.findUnique({
        where: { id: cursor },
        select: { id: true, parentId: true, organizationType: { select: { code: true } } },
      });
      if (!parent || parent.organizationType?.code !== 'cluster') break;
      root = parent.id;
      cursor = parent.id;
    }
    return root;
  }

  private async resolveDepartmentIds(accountId: string, organizationId: string): Promise<string[]> {
    const assignments = await this.prisma.organizationAssignment.findMany({
      where: { userAccountId: accountId, organizationId, isActive: true, departmentId: { not: null } },
      select: { departmentId: true },
    });
    return assignments.map((a) => a.departmentId).filter((d): d is string => !!d);
  }

  hasCapability(ctx: ScopeContext, cap: Capability): boolean {
    return ctx.capabilities.has(cap) && capabilityAllowedInContext(cap, ctx.contextType);
  }

  assertCapability(ctx: ScopeContext, cap: Capability): void {
    if (!ctx.capabilities.has(cap)) throw new ForbiddenException(`لا تملك الصلاحية المطلوبة لهذا الإجراء (${cap})`);
    if (!capabilityAllowedInContext(cap, ctx.contextType)) throw new ForbiddenException(`هذا الإجراء غير متاح من سياق العمل الحالي — بدّل إلى السياق المناسب (${cap})`);
  }

  assertOrgInScope(ctx: ScopeContext, organizationId: string | null | undefined): void {
    if (ctx.visibleOrgIds === null) return;
    if (!organizationId || !ctx.visibleOrgIds.includes(organizationId)) throw new ForbiddenException('هذا السجل خارج نطاق صلاحياتك التنظيمية');
  }

  assertActiveHospital(ctx: ScopeContext, hospitalId: string | null | undefined): void {
    if (ctx.visibleOrgIds === null) return;
    if (!ctx.hospitalId || hospitalId !== ctx.hospitalId) throw new ForbiddenException('لا يمكنك تنفيذ هذا الإجراء على مستشفى غير مستشفاك');
  }

  assertDepartmentInScope(ctx: ScopeContext, departmentId: string | null | undefined): void {
    if (ctx.level !== 'DEPARTMENT') return;
    if (!departmentId || !ctx.departmentIds.includes(departmentId)) throw new ForbiddenException('هذا القسم خارج نطاق صلاحياتك');
  }

  orgFilter(ctx: ScopeContext): Record<string, unknown> {
    return ctx.visibleOrgIds === null ? {} : { organizationId: { in: ctx.visibleOrgIds } };
  }
}
