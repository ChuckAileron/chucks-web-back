import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { BuyeeRendererService } from '../common/buyee-renderer.service.js';

const isUniqueError = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';

@Injectable()
export class SitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly renderer: BuyeeRendererService,
  ) {}

  async listContexts() {
    const contexts = await this.prisma.siteContext.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { pages: true } } },
    });
    return contexts.map(({ _count, ...context }) => ({ ...context, total: _count.pages }));
  }

  async createContext(name: string) {
    const normalized = name.trim();
    if (!normalized) throw new BadRequestException('El nombre del contexto es obligatorio.');
    const duplicate = await this.prisma.siteContext.findFirst({
      where: { name: { equals: normalized, mode: 'insensitive' } },
    });
    if (duplicate) throw new ConflictException(`Ya existe un contexto llamado “${normalized}”.`);
    return this.prisma.siteContext.create({ data: { name: normalized } });
  }

  private async requireContext(id: number) {
    const context = await this.prisma.siteContext.findUnique({ where: { id } });
    if (!context) throw new NotFoundException('El contexto no existe.');
    return context;
  }

  async deleteContext(id: number) {
    await this.requireContext(id);
    await this.prisma.siteContext.delete({ where: { id } });
    return { deleted: true };
  }

  async updateContext(id: number, name: string) {
    const current = await this.requireContext(id);
    const normalized = name.trim();
    if (!normalized) throw new BadRequestException('El nombre del contexto es obligatorio.');
    const duplicate = await this.prisma.siteContext.findFirst({
      where: { id: { not: id }, name: { equals: normalized, mode: 'insensitive' } },
    });
    if (duplicate) throw new ConflictException(`Ya existe un contexto llamado “${normalized}”.`);
    return this.prisma.siteContext.update({ where: { id: current.id }, data: { name: normalized } });
  }

  async listPages(contextId: number) {
    await this.requireContext(contextId);
    return this.prisma.sitePage.findMany({
      where: { contextId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async addPage(contextId: number, rawUrl: string) {
    await this.requireContext(contextId);
    let url: string;
    try {
      const parsed = new URL(rawUrl.trim());
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error();
      if (parsed.username || parsed.password) throw new Error();
      url = parsed.href;
    } catch {
      throw new BadRequestException('Ingresa una URL HTTP o HTTPS válida.');
    }
    const existing = await this.prisma.sitePage.findUnique({
      where: { contextId_url: { contextId, url } },
      select: { id: true },
    });
    if (existing) throw new ConflictException('Ese sitio ya está guardado en este contexto.');

    let capture: Awaited<ReturnType<BuyeeRendererService['captureScreenshot']>>;
    try {
      capture = await this.renderer.captureScreenshot(url);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'No se pudo capturar el sitio.';
      throw new BadRequestException(`No se pudo guardar el sitio: ${detail}`);
    }
    const hostname = new URL(capture.finalUrl || url).hostname.replace(/^www\./i, '');
    try {
      return await this.prisma.sitePage.create({
        data: {
          contextId,
          url,
          title: capture.title || hostname,
          hostname,
          screenshot: capture.screenshot,
        },
      });
    } catch (error) {
      if (isUniqueError(error)) throw new ConflictException('Ese sitio ya está guardado en este contexto.');
      throw error;
    }
  }

  async recapturePage(id: number) {
    const page = await this.prisma.sitePage.findUnique({ where: { id } });
    if (!page) throw new NotFoundException('El sitio guardado no existe.');
    let capture: Awaited<ReturnType<BuyeeRendererService['captureScreenshot']>>;
    try {
      capture = await this.renderer.captureScreenshot(page.url);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'No se pudo capturar el sitio.';
      throw new BadRequestException(`No se pudo actualizar la captura: ${detail}`);
    }
    const hostname = new URL(capture.finalUrl || page.url).hostname.replace(/^www\./i, '');
    return this.prisma.sitePage.update({
      where: { id },
      data: {
        title: capture.title || hostname,
        hostname,
        screenshot: capture.screenshot,
        capturedAt: new Date(),
      },
    });
  }

  async deletePage(id: number) {
    const result = await this.prisma.sitePage.deleteMany({ where: { id } });
    if (!result.count) throw new NotFoundException('El sitio guardado no existe.');
    return { deleted: true };
  }
}
