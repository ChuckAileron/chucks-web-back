import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { validUrl } from '../collections/collection-validation.js';
import { scrapeProduct, type ProductResult } from '../common/price-scraper.js';
import {
  CreateWishlistItemDto,
  CreateWishlistPriceDto,
  UpdateWishlistItemDto,
} from './dto/wishlist.dto.js';

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

@Injectable()
export class WishlistService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q?: string) {
    const text = q?.trim();
    return this.prisma.wishlistItem.findMany({
      where: text
        ? {
            OR: [
              { name: { contains: text, mode: 'insensitive' } },
              { manufacturer: { contains: text, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { name: 'asc' },
      include: { prices: { orderBy: { id: 'asc' } } },
    });
  }

  private sanitize(
    data: Partial<CreateWishlistItemDto>,
    current?: {
      name: string;
      manufacturer: string;
      year: number | null;
      imageUrl: string | null;
    },
  ) {
    const name = String(data.name ?? current?.name ?? '').trim();
    if (!name) {
      throw new BadRequestException('El nombre del artículo es obligatorio.');
    }
    const manufacturer = String(
      data.manufacturer ?? current?.manufacturer ?? '',
    ).trim();
    const rawYear: unknown = data.year ?? current?.year ?? null;
    const year =
      rawYear === '' || rawYear === null || rawYear === undefined
        ? null
        : Number(rawYear);
    if (year !== null && (!Number.isInteger(year) || year < 1000 || year > 9999)) {
      throw new BadRequestException('El año debe contener cuatro dígitos.');
    }
    const imageUrl =
      data.imageUrl !== undefined ? data.imageUrl : current?.imageUrl;
    if (imageUrl && !validUrl(imageUrl)) {
      throw new BadRequestException('La imagen debe ser una URL HTTP válida.');
    }
    return { name, manufacturer, year, imageUrl: imageUrl || null };
  }

  private async require(id: number) {
    const item = await this.prisma.wishlistItem.findUnique({
      where: { id },
      include: { prices: { orderBy: { id: 'asc' } } },
    });
    if (!item) throw new NotFoundException('El artículo de wishlist no existe.');
    return item;
  }

  async create(dto: CreateWishlistItemDto) {
    const item = this.sanitize(dto);
    return this.prisma.wishlistItem.create({
      data: item,
      include: { prices: { orderBy: { id: 'asc' } } },
    });
  }

  async update(id: number, patch: UpdateWishlistItemDto) {
    const current = await this.require(id);
    const item = this.sanitize(patch, current);
    return this.prisma.wishlistItem.update({
      where: { id },
      data: item,
      include: { prices: { orderBy: { id: 'asc' } } },
    });
  }

  async remove(id: number) {
    await this.require(id);
    await this.prisma.wishlistItem.delete({ where: { id } });
    return { deleted: true };
  }

  private async requirePrice(id: number) {
    const price = await this.prisma.wishlistPrice.findUnique({
      where: { id },
    });
    if (!price) throw new NotFoundException('La página de tienda no existe.');
    return price;
  }

  // Guarda el resultado del scraping. price/currency usan semántica COALESCE
  // (si el scrape no los trae se conservan los anteriores), checkedAt siempre
  // se actualiza y error se limpia cuando el scrape tuvo éxito.
  private async applyPriceResult(id: number, result: Partial<ProductResult>) {
    const source = await this.requirePrice(id);
    const price =
      result.price === null || result.price === undefined
        ? NaN
        : Number(result.price);
    if (result.imageUrl) {
      const first = await this.prisma.wishlistPrice.findFirst({
        where: { wishlistId: source.wishlistId },
        orderBy: { id: 'asc' },
      });
      if (first && first.id === source.id) {
        await this.prisma.wishlistItem.updateMany({
          where: {
            id: source.wishlistId,
            OR: [{ imageUrl: null }, { imageUrl: '' }],
          },
          data: { imageUrl: result.imageUrl },
        });
      }
    }
    return this.prisma.wishlistPrice.update({
      where: { id },
      data: {
        price: Number.isFinite(price) ? price : undefined,
        currency: result.currency || undefined,
        checkedAt: new Date(),
        error: result.error || null,
      },
    });
  }

  async addPrice(wishlistId: number, dto: CreateWishlistPriceDto) {
    await this.require(wishlistId);
    const url = String(dto.url ?? '').trim();
    if (!validUrl(url)) {
      throw new BadRequestException(
        'La página de tienda debe ser una URL HTTP válida.',
      );
    }
    const store =
      String(dto.store ?? '').trim() ||
      new URL(url).hostname.replace(/^www\./, '');
    const duplicate = await this.prisma.wishlistPrice.findFirst({
      where: { wishlistId, url },
    });
    if (duplicate) {
      throw new BadRequestException('Esa página ya está agregada al artículo.');
    }
    const source = await this.prisma.wishlistPrice.create({
      data: { wishlistId, store, url },
    });
    try {
      return await this.applyPriceResult(source.id, await scrapeProduct(url));
    } catch (error) {
      return await this.applyPriceResult(source.id, {
        error: errorMessage(error),
      });
    }
  }

  async removePrice(priceId: number) {
    await this.requirePrice(priceId);
    await this.prisma.wishlistPrice.delete({ where: { id: priceId } });
    return { deleted: true };
  }

  async refreshPrice(priceId: number) {
    const source = await this.requirePrice(priceId);
    let result: ProductResult;
    try {
      result = await scrapeProduct(source.url);
    } catch (error) {
      await this.applyPriceResult(priceId, { error: errorMessage(error) });
      throw new BadRequestException(errorMessage(error));
    }
    await this.applyPriceResult(priceId, result);
    if (result.error) throw new BadRequestException(result.error);
    return this.requirePrice(priceId);
  }

  async refreshAll() {
    const items = await this.list();
    let updated = 0;
    let failed = 0;
    for (const price of items.flatMap((item) => item.prices)) {
      try {
        const result = await scrapeProduct(price.url);
        await this.applyPriceResult(price.id, result);
        if (result.error) failed += 1;
        else updated += 1;
      } catch (error) {
        await this.applyPriceResult(price.id, { error: errorMessage(error) });
        failed += 1;
      }
    }
    return { updated, failed, items: await this.list() };
  }
}
