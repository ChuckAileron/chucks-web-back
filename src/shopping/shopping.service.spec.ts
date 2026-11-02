import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { BuyeeRendererService } from '../common/buyee-renderer.service.js';
import type { ProductResult } from '../common/price-scraper.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ShoppingService } from './shopping.service.js';

function setup(renderer: Partial<BuyeeRendererService> = {}) {
  const shopContext = { findUnique: vi.fn() };
  const shopItem = { deleteMany: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() };
  const prisma = { shopContext, shopItem } as unknown as PrismaService;
  const service = new ShoppingService(prisma, renderer as BuyeeRendererService);
  return { service, shopContext, shopItem };
}

describe('ShoppingService.scrapeShopProduct', () => {
  it('uses the visible AliExpress HTML price when the product API is challenged', async () => {
    const url = 'https://es.aliexpress.com/item/1005009801028580.html';
    const renderer = {
      renderAliExpressProductHtml: vi.fn().mockResolvedValue({
        html: `<html><body>
          <button class="ship-to--text">CLP</button>
          <h1>Consola AYN Thor</h1>
          <span class="price-default--current--example">$519.900</span>
          <span class="price-default--original--example">$742.714</span>
        </body></html>`,
        finalUrl: url,
        apiResponses: ['mtopjsonp1({"ret":["FAIL_SYS_USER_VALIDATE"],"data":{}})'],
      }),
    };
    const { service } = setup(renderer);
    const scrapeShopProduct = Reflect.get(service, 'scrapeShopProduct') as (
      this: ShoppingService,
      target: string,
    ) => Promise<ProductResult>;

    await expect(scrapeShopProduct.call(service, url)).resolves.toMatchObject({
      price: 519900,
      currency: 'CLP',
      title: 'Consola AYN Thor',
      store: 'AliExpress',
      error: null,
    });
  });

  it('uses AliExpress search results as a clearly marked approximate fallback', async () => {
    const url = 'https://es.aliexpress.com/item/1005009801028580.html';
    const renderer = {
      renderAliExpressProductHtml: vi.fn().mockResolvedValue({
        html: `<html><head><meta property="og:title" content="AYN Thor OLED Handheld"></head><body>
          <button class="ship-to--text">CLP</button>
          <meta property="og:image" content="https://ae-pic-a1.aliexpress-media.com/kf/Sb1e173aa16514b60a05eb15f263369c7z.png">
        </body></html>`,
        finalUrl: url,
        apiResponses: ['mtopjsonp1({"ret":["FAIL_SYS_USER_VALIDATE"],"data":{}})'],
      }),
      searchAliExpressProducts: vi.fn().mockResolvedValue([
        {
          productId: '1005010000000002',
          title: 'AYN Thor OLED portable gaming console',
          imageUrl: '//ae-pic-a1.aliexpress-media.com/kf/Sb1e173aa16514b60a05eb15f263369c7z.png_220x220.jpg',
          price: 519900,
          currency: 'CLP',
        },
      ]),
    };
    const { service } = setup(renderer);
    const scrapeShopProduct = Reflect.get(service, 'scrapeShopProduct') as (
      this: ShoppingService,
      target: string,
    ) => Promise<ProductResult>;

    await expect(scrapeShopProduct.call(service, url)).resolves.toMatchObject({
      price: 519900,
      currency: 'CLP',
      priceSource: 'search',
      error: null,
    });
    expect(renderer.searchAliExpressProducts).toHaveBeenCalledWith(url, 'ayn thor oled');
  });
});

describe('ShoppingService.deleteItem', () => {
  it('deletes only an item belonging to the selected context', async () => {
    const { service, shopContext, shopItem } = setup();
    shopContext.findUnique.mockResolvedValue({ id: 5, name: 'Libros' });
    shopItem.deleteMany.mockResolvedValue({ count: 1 });

    await expect(service.deleteItem(5, 27)).resolves.toEqual({ deleted: true });
    expect(shopItem.deleteMany).toHaveBeenCalledWith({ where: { id: 27, contextId: 5 } });
  });

  it('returns not found if the item is not in the selected context', async () => {
    const { service, shopContext, shopItem } = setup();
    shopContext.findUnique.mockResolvedValue({ id: 5, name: 'Libros' });
    shopItem.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.deleteItem(5, 27)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ShoppingService.updateItemTags', () => {
  it('normalizes tags and updates only an item belonging to the selected context', async () => {
    const { service, shopContext, shopItem } = setup();
    const updated = { id: 27, contextId: 5, tags: ['ofertas', 'PC'] };
    shopContext.findUnique.mockResolvedValue({ id: 5, name: 'Libros' });
    shopItem.updateMany.mockResolvedValue({ count: 1 });
    shopItem.findUniqueOrThrow.mockResolvedValue(updated);

    await expect(service.updateItemTags(5, 27, [' ofertas ', '#PC', 'OFERTAS', ''])).resolves.toEqual(updated);
    expect(shopItem.updateMany).toHaveBeenCalledWith({
      where: { id: 27, contextId: 5 },
      data: { tags: ['ofertas', 'PC'] },
    });
  });

  it('returns not found if the item is not in the selected context', async () => {
    const { service, shopContext, shopItem } = setup();
    shopContext.findUnique.mockResolvedValue({ id: 5, name: 'Libros' });
    shopItem.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.updateItemTags(5, 27, ['ofertas'])).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ShoppingService.updateItem manual price', () => {
  it('saves a manual price and currency for the selected context item', async () => {
    const { service, shopContext, shopItem } = setup();
    const updated = { id: 27, contextId: 5, manualPrice: 519900, manualCurrency: 'CLP' };
    shopContext.findUnique.mockResolvedValue({ id: 5, name: 'Electrónica' });
    shopItem.updateMany.mockResolvedValue({ count: 1 });
    shopItem.findUniqueOrThrow.mockResolvedValue(updated);

    await expect(service.updateItem(5, 27, { manualPrice: 519900, manualCurrency: 'clp' })).resolves.toEqual(updated);
    expect(shopItem.updateMany).toHaveBeenCalledWith({
      where: { id: 27, contextId: 5 },
      data: { manualPrice: 519900, manualCurrency: 'CLP' },
    });
  });

  it('clears both manual override fields together', async () => {
    const { service, shopContext, shopItem } = setup();
    shopContext.findUnique.mockResolvedValue({ id: 5, name: 'Electrónica' });
    shopItem.updateMany.mockResolvedValue({ count: 1 });
    shopItem.findUniqueOrThrow.mockResolvedValue({ id: 27, manualPrice: null, manualCurrency: null });

    await service.updateItem(5, 27, { manualPrice: null, manualCurrency: null });
    expect(shopItem.updateMany).toHaveBeenCalledWith({
      where: { id: 27, contextId: 5 },
      data: { manualPrice: null, manualCurrency: null },
    });
  });

  it('requires a currency for a non-null manual price', async () => {
    const { service, shopContext, shopItem } = setup();
    shopContext.findUnique.mockResolvedValue({ id: 5, name: 'Electrónica' });

    await expect(service.updateItem(5, 27, { manualPrice: 519900 })).rejects.toBeInstanceOf(BadRequestException);
    expect(shopItem.updateMany).not.toHaveBeenCalled();
  });
});
