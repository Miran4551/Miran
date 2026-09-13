describe('DeclarationsService lifecycle', () => {
  const prisma: any = {
    declaration: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    declarationAcceptance: { findMany: jest.fn() },
    $transaction: jest.fn(async (callback: any) => callback(prisma)),
  };

  it('creates declarations as drafts unless explicitly activated', async () => {
    const { DeclarationsService } = require('./declarations.service');
    prisma.declaration.create.mockResolvedValue({ id: 'd1', isActive: false });
    const service = new DeclarationsService(prisma);
    await service.createDeclaration('org', { type: 'academic_affairs', titleAr: 't', contentAr: 'c' } as any, 'user');
    expect(prisma.declaration.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ organizationId: 'org', isActive: false, createdById: 'user' }) }));
  });

  it('creates a new active version and deactivates the previous active version of the same type', async () => {
    prisma.declaration.findFirst.mockResolvedValue({ id: 'd1', organizationId: 'org', type: 'academic_affairs', version: 1, titleAr: 'old', contentAr: 'old', isMandatory: true });
    prisma.declaration.updateMany.mockResolvedValue({ count: 1 });
    prisma.declaration.create.mockResolvedValue({ id: 'd2', version: 2, isActive: true });
    const { DeclarationsService } = require('./declarations.service');
    const service = new DeclarationsService(prisma);
    await service.createDeclarationVersion('org', 'd1', { contentAr: 'new', activate: true }, 'user');
    expect(prisma.declaration.updateMany).toHaveBeenCalledWith({ where: { organizationId: 'org', type: 'academic_affairs', isActive: true }, data: { isActive: false } });
    expect(prisma.declaration.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ version: 2, contentAr: 'new', isActive: true, createdById: 'user' }) }));
  });
});
