import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { BuyeeRendererService } from '../common/buyee-renderer.service.js';
import { SitesService } from './sites.service.js';

function setup() {
  const siteContext = {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  const sitePage = {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  };
  const prisma = { siteContext, sitePage } as unknown as PrismaService;
  const captureScreenshot = vi.fn();
  const renderer = { captureScreenshot } as unknown as BuyeeRendererService;
  return { service: new SitesService(prisma, renderer), prisma, siteContext, sitePage, captureScreenshot };
}

describe('SitesService', () => {
  it('creates a context after normalizing its name', async () => {
    const { service, siteContext } = setup();
    siteContext.findFirst.mockResolvedValue(null);
    siteContext.create.mockResolvedValue({ id: 3, name: 'Diseño', createdAt: new Date() } as never);

    await service.createContext('  Diseño  ');

    expect(siteContext.create).toHaveBeenCalledWith({ data: { name: 'Diseño' } });
  });

  it('renames a context without changing its saved pages', async () => {
    const { service, siteContext, sitePage } = setup();
    siteContext.findUnique.mockResolvedValue({ id: 3, name: 'Diseño' } as never);
    siteContext.findFirst.mockResolvedValue(null);
    siteContext.update.mockResolvedValue({ id: 3, name: 'Inspiración' } as never);

    await service.updateContext(3, '  Inspiración  ');

    expect(siteContext.update).toHaveBeenCalledWith({ where: { id: 3 }, data: { name: 'Inspiración' } });
    expect(sitePage.update).not.toHaveBeenCalled();
  });

  it('rejects saving a duplicate URL without recapturing it', async () => {
    const { service, siteContext, sitePage, captureScreenshot } = setup();
    siteContext.findUnique.mockResolvedValue({ id: 3, name: 'Diseño' } as never);
    sitePage.findUnique.mockResolvedValue({ id: 7 } as never);

    await expect(service.addPage(3, 'https://example.com/')).rejects.toBeInstanceOf(ConflictException);
    expect(captureScreenshot).not.toHaveBeenCalled();
  });

  it('captures the submitted page and persists its title, host and screenshot', async () => {
    const { service, siteContext, sitePage, captureScreenshot } = setup();
    const capture = {
      title: 'Example page',
      finalUrl: 'https://www.example.com/home',
      screenshot: 'data:image/jpeg;base64,abc',
    };
    siteContext.findUnique.mockResolvedValue({ id: 3, name: 'Diseño' } as never);
    sitePage.findUnique.mockResolvedValue(null);
    captureScreenshot.mockResolvedValue(capture);
    sitePage.create.mockResolvedValue({ id: 7, ...capture } as never);

    await service.addPage(3, 'https://example.com');

    expect(captureScreenshot).toHaveBeenCalledWith('https://example.com/');
    expect(sitePage.create).toHaveBeenCalledWith({
      data: {
        contextId: 3,
        url: 'https://example.com/',
        title: 'Example page',
        hostname: 'example.com',
        screenshot: 'data:image/jpeg;base64,abc',
      },
    });
  });

  it('rejects non-http URLs', async () => {
    const { service, siteContext, captureScreenshot } = setup();
    siteContext.findUnique.mockResolvedValue({ id: 3, name: 'Diseño' } as never);

    await expect(service.addPage(3, 'file:///etc/passwd')).rejects.toThrow('Ingresa una URL HTTP o HTTPS válida.');
    expect(captureScreenshot).not.toHaveBeenCalled();
  });
});
