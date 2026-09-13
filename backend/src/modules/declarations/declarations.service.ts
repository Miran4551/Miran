import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDeclarationDto, AcceptDeclarationDto } from './dto/declaration.dto';

@Injectable()
export class DeclarationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createDeclaration(orgId: string, dto: CreateDeclarationDto, userId?: string) {
    return this.prisma.declaration.create({ data: { organizationId: orgId, type: dto.type, titleAr: dto.titleAr, titleEn: dto.titleEn, contentAr: dto.contentAr, contentEn: dto.contentEn, isMandatory: dto.isMandatory ?? true, isActive: dto.isActive ?? false, createdById: userId } });
  }
  async getDeclarationsByOrg(orgId: string) { return this.prisma.declaration.findMany({ where: { organizationId: orgId }, include: { _count: { select: { acceptances: true } } }, orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }] }); }
  async getPendingDeclarationsForUser(userId: string, orgId: string) {
    const activeDeclarations = await this.prisma.declaration.findMany({ where: { organizationId: orgId, isActive: true, isMandatory: true }, orderBy: { createdAt: 'desc' } });
    const userAcceptances = await this.prisma.declarationAcceptance.findMany({ where: { userId, organizationId: orgId } });
    const acceptedMap = new Set(userAcceptances.map((a) => `${a.declarationId}_${a.version}`));
    return activeDeclarations.filter((d) => !acceptedMap.has(`${d.id}_${d.version}`));
  }
  async acceptDeclaration(userId: string, orgId: string, dto: AcceptDeclarationDto, ipAddress?: string) {
    const dec = await this.prisma.declaration.findFirst({ where: { id: dto.declarationId, organizationId: orgId, isActive: true } });
    if (!dec) throw new NotFoundException('الإقرار غير موجود أو غير متاح لحسابك');
    if (Number(dto.version) !== Number(dec.version)) throw new BadRequestException('إصدار الإقرار لم يعد محدثًا، يرجى إعادة تحميل الصفحة');
    return this.prisma.declarationAcceptance.upsert({ where: { declarationId_userId_version: { declarationId: dto.declarationId, userId, version: dto.version } }, update: { acceptedAt: new Date(), ipAddress, deviceInfo: dto.deviceInfo, organizationId: orgId }, create: { declarationId: dto.declarationId, userId, organizationId: orgId, version: dto.version, ipAddress, deviceInfo: dto.deviceInfo } });
  }
  async setDeclarationStatus(orgId: string, declarationId: string, isActive: boolean, userId?: string) {
    const dec = await this.prisma.declaration.findFirst({ where: { id: declarationId, organizationId: orgId } });
    if (!dec) throw new NotFoundException('الإقرار غير موجود');
    return this.prisma.declaration.update({ where: { id: declarationId }, data: { isActive, updatedAt: new Date() } });
  }
  async createDeclarationVersion(orgId: string, declarationId: string, body: { titleAr?: string; contentAr?: string; isMandatory?: boolean; activate?: boolean }, userId?: string) {
    const current = await this.prisma.declaration.findFirst({ where: { id: declarationId, organizationId: orgId } });
    if (!current) throw new NotFoundException('الإقرار غير موجود');
    const nextVersion = current.version + 1;
    return this.prisma.$transaction(async (tx) => {
      if (body.activate !== false) await tx.declaration.updateMany({ where: { organizationId: orgId, type: current.type, isActive: true }, data: { isActive: false } });
      return tx.declaration.create({ data: { organizationId: orgId, type: current.type, titleAr: body.titleAr ?? current.titleAr, titleEn: current.titleEn, contentAr: body.contentAr ?? current.contentAr, contentEn: current.contentEn, version: nextVersion, isMandatory: body.isMandatory ?? current.isMandatory, isActive: body.activate !== false, createdById: userId } });
    });
  }
  async getAcceptanceStatistics(orgId: string) {
    const totalDeclarations = await this.prisma.declaration.count({ where: { organizationId: orgId } });
    const totalAcceptances = await this.prisma.declarationAcceptance.count({ where: { organizationId: orgId } });
    const acceptancesList = await this.prisma.declarationAcceptance.findMany({ where: { organizationId: orgId }, include: { declaration: true, user: { include: { person: true } } }, orderBy: { acceptedAt: 'desc' }, take: 100 });
    return { totalDeclarations, totalAcceptances, recentAcceptances: acceptancesList };
  }
}
