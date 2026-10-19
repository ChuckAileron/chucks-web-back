import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { isBuyeeUrl, parseProductHtml, scrapeProduct } from '../common/price-scraper.js';
import type { ProductResult } from '../common/price-scraper.js';
import { BuyeeRendererService } from '../common/buyee-renderer.service.js';
import type { SHOP_SORTS } from './dto/shopping.dto.js';

type ShopSort = (typeof SHOP_SORTS)[number];

function extractShopLinks(text: string) {
  const matches = text.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
  const seen = new Set<string>();
  return matches.flatMap((raw) => {
    const url = raw.replace(/[.,;:)\]}]+$/, '');
    if (seen.has(url)) return [];
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) return [];
    } catch {
      return [];
    }
    seen.add(url);
    return [url];
  });
}

const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

@Injectable()
export class ShoppingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly buyeeRenderer: BuyeeRendererService,
  ) {}

  private async scrapeShopProduct(url: string): Promise<ProductResult> {
    if (!isBuyeeUrl(url)) return scrapeProduct(url);
    const rendered = await this.buyeeRenderer.renderProductHtml(url);
    if (!rendered.html.trim()) throw new Error('Buyee no devolvió el contenido renderizado del artículo.');
    return parseProductHtml(rendered.html, rendered.finalUrl || url);
  }

  async listContexts() {
    const contexts = await this.prisma.shopContext.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { items: true } } },
    });
    return contexts.map(({ _count, ...context }) => ({ ...context, total: _count.items }));
  }

  async createContext(name: string) {
    const normalized = name.trim();
    if (!normalized) throw new BadRequestException('El nombre del contexto es obligatorio.');
    const duplicate = await this.prisma.shopContext.findFirst({
      where: { name: { equals: normalized, mode: 'insensitive' } },
    });
    if (duplicate) throw new BadRequestException(`Ya existe una pestaña llamada "${normalized}".`);
    return this.prisma.shopContext.create({ data: { name: normalized } });
  }

  private async requireContext(id: number) {
    const context = await this.prisma.shopContext.findUnique({ where: { id } });
    if (!context) throw new NotFoundException('La pestaña de contexto no existe.');
    return context;
  }

  async deleteContext(id: number) {
    await this.requireContext(id);
    await this.prisma.shopContext.delete({ where: { id } });
    return { deleted: true };
  }

  async listItems(contextId: number, sort: ShopSort = 'date-desc') {
    await this.requireContext(contextId);
    const items = await this.prisma.shopItem.findMany({ where: { contextId } });
    const compareText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
    const byDate = (a: Date, b: Date) => a.getTime() - b.getTime();
    const byPrice = (a: number | null, b: number | null, direction: number) => {
      if (a === null && b === null) return 0;
      if (a === null) return 1;
      if (b === null) return -1;
      return (a - b) * direction;
    };
    return items.sort((left, right) => {
      if (sort === 'name-asc') return compareText(left.name, right.name) || left.id - right.id;
      if (sort === 'name-desc') return compareText(right.name, left.name) || right.id - left.id;
      if (sort === 'price-asc') return byPrice(left.price, right.price, 1) || left.id - right.id;
      if (sort === 'price-desc') return byPrice(left.price, right.price, -1) || right.id - left.id;
      const date = byDate(left.createdAt, right.createdAt);
      return sort === 'date-asc' ? date || left.id - right.id : -date || right.id - left.id;
    });
  }

  async addLinks(contextId: number, text: string) {
    await this.requireContext(contextId);
    const urls = extractShopLinks(text);
    if (!urls.length) throw new BadRequestException('No se reconocieron enlaces HTTP en el texto.');
    let added = 0;
    let skipped = 0;
    let failed = 0;
    for (const url of urls) {
      const existing = await this.prisma.shopItem.findUnique({
        where: { contextId_url: { contextId, url } },
        select: { id: true },
      });
      if (existing) { skipped += 1; continue; }
      let page: string;
      try { page = new URL(url).hostname.replace(/^www\./, ''); }
      catch { failed += 1; continue; }
      const item = await this.prisma.shopItem.create({
        data: { contextId, url, name: page, page },
      });
      added += 1;
      try {
        const scraped = await this.scrapeShopProduct(url);
        await this.updateScrapedItem(item.id, scraped, true);
      } catch (error) {
        await this.updateScrapedItem(item.id, { error: errorText(error) }, false);
      }
    }
    return { added, skipped, failed };
  }

  private updateScrapedItem(id: number, result: Partial<ProductResult>, active: boolean) {
    return this.prisma.shopItem.update({
      where: { id },
      data: {
        ...(result.price != null && Number.isFinite(result.price) ? { price: result.price } : {}),
        ...(result.usdPrice != null && Number.isFinite(result.usdPrice) ? { usdPrice: result.usdPrice } : {}),
        ...(result.currency ? { currency: result.currency } : {}),
        ...(result.condition ? { condition: result.condition } : {}),
        ...(result.store ? { store: result.store } : {}),
        ...(result.imageUrl ? { imageUrl: result.imageUrl } : {}),
        ...(result.title?.trim() ? { name: result.title.trim() } : {}),
        active,
        error: result.error ?? null,
        checkedAt: new Date(),
      },
    });
  }

  async refreshItems(contextId: number) {
    await this.requireContext(contextId);
    const items = await this.prisma.shopItem.findMany({ where: { contextId } });
    let updated = 0;
    let failed = 0;
    for (const item of items) {
      try {
        const result = await this.scrapeShopProduct(item.url);
        await this.updateScrapedItem(item.id, result, true);
        if (result.error) failed += 1;
        else updated += 1;
      } catch (error) {
        await this.updateScrapedItem(item.id, { error: errorText(error) }, false);
        failed += 1;
      }
    }
    return { updated, failed };
  }

  async clearInactiveItems(contextId: number) {
    await this.requireContext(contextId);
    const result = await this.prisma.shopItem.deleteMany({
      where: { contextId, OR: [{ active: false }, { error: { not: null } }] },
    });
    return { removed: result.count };
  }
}
