import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DeclarationsService } from './declarations.service';

describe('DeclarationsService acceptance', () => {
  const prisma = {
    declaration: {
      findFirst: jest.fn(),
    },
    declarationAcceptance: {
      upsert: jest.fn(),
    },
  } as any;

  beforeEach(() => jest.clearAllMocks());

  it('only accepts an active declaration belonging to the current organization', async () => {
    const declaration = { id: 'dec-1', organizationId: 'org-1', version: 2, isActive: true };
    prisma.declaration.findFirst.mockResolvedValue(declaration);
    prisma.declarationAcceptance.upsert.mockResolvedValue({ id: 'acc-1' });
    const service = new DeclarationsService(prisma);

    await service.acceptDeclaration('user-1', 'org-1', { declarationId: 'dec-1', version: 2 } as any);

    expect(prisma.declaration.findFirst).toHaveBeenCalledWith({
      where: { id: 'dec-1', organizationId: 'org-1', isActive: true },
    });
    expect(prisma.declarationAcceptance.upsert).toHaveBeenCalled();
  });

  it('rejects an outdated declaration version', async () => {
    prisma.declaration.findFirst.mockResolvedValue({ id: 'dec-1', organizationId: 'org-1', version: 2, isActive: true });
    const service = new DeclarationsService(prisma);

    await expect(
      service.acceptDeclaration('user-1', 'org-1', { declarationId: 'dec-1', version: 1 } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.declarationAcceptance.upsert).not.toHaveBeenCalled();
  });

  it('rejects declarations outside the current organization or inactive declarations', async () => {
    prisma.declaration.findFirst.mockResolvedValue(null);
    const service = new DeclarationsService(prisma);

    await expect(
      service.acceptDeclaration('user-1', 'org-1', { declarationId: 'dec-other', version: 1 } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.declarationAcceptance.upsert).not.toHaveBeenCalled();
  });
});
