import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateWikiPageDto, UpdateWikiPageDto } from './dto/wiki.dto.js';

const DEFAULT_ICONS: Record<string, string> = {
  Guías: '📖',
  Procesos: '⚙️',
  Proyectos: '📊',
  Recursos: '🧰',
};
const BANNER_POSITIONS = new Set(['top', 'center', 'bottom']);

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'pagina';
}

@Injectable()
export class WikiService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query = '') {
    const term = query.trim();
    return this.prisma.wikiPage.findMany({
      where: term
        ? {
            OR: [
              { title: { contains: term, mode: 'insensitive' } },
              { summary: { contains: term, mode: 'insensitive' } },
              { content: { contains: term, mode: 'insensitive' } },
              { category: { contains: term, mode: 'insensitive' } },
              { tag: { contains: term, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
  }

  async get(id: number) {
    const page = await this.prisma.wikiPage.findUnique({ where: { id } });
    if (!page) throw new NotFoundException('La página no existe.');
    return page;
  }

  async categories() {
    const [groups, banners] = await Promise.all([
      this.prisma.wikiPage.groupBy({
        by: ['category'],
        _count: { _all: true },
        _max: { icon: true },
        orderBy: { category: 'asc' },
      }),
      this.prisma.wikiCategoryBanner.findMany(),
    ]);
    const bannerByCategory = new Map(banners.map((item) => [item.category, item.banner]));
    return groups.map((group) => ({
      name: group.category,
      total: group._count._all,
      icon: group._max.icon || DEFAULT_ICONS[group.category] || '📄',
      banner: bannerByCategory.get(group.category) ?? '',
    }));
  }

  async stats() {
    const [total, authors, last] = await Promise.all([
      this.prisma.wikiPage.count(),
      this.prisma.wikiPage.findMany({
        where: { author: { not: '' } },
        distinct: ['author'],
        select: { author: true },
      }),
      this.prisma.wikiPage.aggregate({ _max: { updatedAt: true } }),
    ]);
    return {
      total,
      contributors: authors.length,
      lastUpdated: last._max.updatedAt?.toISOString() ?? null,
    };
  }

  async setCategoryBanner(category: string, banner: string) {
    const name = category.trim();
    const value = banner.trim();
    if (!name) throw new BadRequestException('La categoría es obligatoria.');
    if (!value) {
      await this.prisma.wikiCategoryBanner.deleteMany({ where: { category: name } });
      return { category: name, banner: '' };
    }
    return this.prisma.wikiCategoryBanner.upsert({
      where: { category: name },
      create: { category: name, banner: value },
      update: { banner: value },
    });
  }

  private async uniqueSlug(title: string, ignoreId?: number) {
    const base = slugify(title);
    let slug = base;
    let suffix = 2;
    while (
      await this.prisma.wikiPage.findFirst({
        where: { slug, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
        select: { id: true },
      })
    ) slug = `${base}-${suffix++}`;
    return slug;
  }

  private async validateParent(parentId: number | null | undefined, currentId?: number) {
    if (parentId === null || parentId === undefined) return;
    if (!Number.isInteger(parentId)) throw new BadRequestException('La página padre no es válida.');
    let cursor: number | null = parentId;
    const seen = new Set<number>();
    while (cursor !== null) {
      if (cursor === currentId || seen.has(cursor)) {
        throw new BadRequestException('No puedes mover una página dentro de sí misma o de una subpágina suya.');
      }
      seen.add(cursor);
      const parent: { parentId: number | null } | null = await this.prisma.wikiPage.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      });
      if (!parent) throw new BadRequestException('La página padre no existe.');
      cursor = parent.parentId;
    }
  }

  async create(dto: CreateWikiPageDto) {
    const title = dto.title.trim();
    if (!title) throw new BadRequestException('El título es obligatorio.');
    await this.validateParent(dto.parentId);
    const category = dto.category?.trim() || 'General';
    const bannerPosition = BANNER_POSITIONS.has(dto.bannerPosition ?? '')
      ? dto.bannerPosition!
      : 'center';
    return this.prisma.wikiPage.create({
      data: {
        title,
        slug: await this.uniqueSlug(title),
        category,
        icon: dto.icon ?? DEFAULT_ICONS[category] ?? '📄',
        summary: dto.summary?.trim() ?? '',
        content: dto.content ?? '',
        tag: dto.tag?.trim() ?? '',
        pinned: dto.pinned ?? false,
        author: '',
        banner: dto.banner?.trim() ?? '',
        bannerPosition,
        parentId: dto.parentId ?? null,
      },
    });
  }

  async update(id: number, dto: UpdateWikiPageDto) {
    const current = await this.get(id);
    const title = dto.title?.trim() ?? current.title;
    if (!title) throw new BadRequestException('El título es obligatorio.');
    const parentId = dto.parentId === undefined ? current.parentId : dto.parentId;
    await this.validateParent(parentId, id);
    return this.prisma.wikiPage.update({
      where: { id },
      data: {
        title,
        ...(dto.title !== undefined && title !== current.title
          ? { slug: await this.uniqueSlug(title, id) }
          : {}),
        category: dto.category?.trim() || current.category,
        icon: dto.icon ?? current.icon,
        summary: dto.summary?.trim() ?? current.summary,
        content: dto.content ?? current.content,
        tag: dto.tag?.trim() ?? current.tag,
        pinned: dto.pinned ?? current.pinned,
        banner: dto.banner?.trim() ?? current.banner,
        bannerPosition: dto.bannerPosition && BANNER_POSITIONS.has(dto.bannerPosition)
          ? dto.bannerPosition
          : current.bannerPosition,
        parentId,
      },
    });
  }

  async remove(id: number) {
    await this.get(id);
    await this.prisma.wikiPage.delete({ where: { id } });
    return { deleted: true };
  }
}
