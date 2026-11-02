import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { BuyeeRendererService } from '../common/buyee-renderer.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ShoppingService } from './shopping.service.js';

function setup() {
  const shopContext = { findUnique: vi.fn() };
  const shopItem = { deleteMany: vi.fn() };
  const prisma = { shopContext, shopItem } as unknown as PrismaService;
  const service = new ShoppingService(prisma, {} as BuyeeRendererService);
  return { service, shopContext, shopItem };
}

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
