import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { toText } from '../common/text.js';
import {
  type CollectionColumnDef,
  normalizeColumns,
  sanitizeItemPayload,
  validUrl,
  validateValues,
} from './collection-validation.js';
import {
  CreateCollectionDto,
  UpdateCollectionDto,
} from './dto/collection.dto.js';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

@Injectable()
export class CollectionsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.collection.findMany({
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      include: { columns: { orderBy: { position: 'asc' } } },
    });
  }

  async get(id: number) {
    const collection = await this.prisma.collection.findUnique({
      where: { id },
      include: { columns: { orderBy: { position: 'asc' } } },
    });
    if (!collection) throw new NotFoundException('La colección no existe.');
    return collection;
  }

  async create(dto: CreateCollectionDto) {
    const columns = normalizeColumns(dto.columns ?? []);
    const last = await this.prisma.collection.aggregate({
      _max: { position: true },
    });
    const name = dto.name.trim();
    const exists = await this.prisma.collection.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
    if (exists) {
      throw new BadRequestException(
        `Ya existe una colección llamada "${name}".`,
      );
    }
    return this.prisma.collection.create({
      data: {
        name,
        description: dto.description ?? '',
        type: dto.type ?? 'generic',
        position: (last._max.position ?? -1) + 1,
        columns: {
          create: columns.map((column, position) => ({ ...column, position })),
        },
      },
      include: { columns: { orderBy: { position: 'asc' } } },
    });
  }

  async update(id: number, patch: UpdateCollectionDto) {
    const current = await this.get(id);
    const name = (patch.name ?? current.name).trim();
    if (!name) throw new BadRequestException('El nombre es obligatorio.');
    if (name.toLocaleLowerCase() !== current.name.toLocaleLowerCase()) {
      const duplicate = await this.prisma.collection.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } },
      });
      if (duplicate) {
        throw new BadRequestException(
          `Ya existe una colección llamada "${name}".`,
        );
      }
    }
    const columns =
      patch.columns !== undefined
        ? normalizeColumns(patch.columns)
        : current.columns.map((column) => ({
            name: column.name,
            label: column.label,
            type: column.type as CollectionColumnDef['type'],
            required: column.required,
          }));
    return this.prisma.$transaction(async (tx) => {
      await tx.collectionColumn.deleteMany({ where: { collectionId: id } });
      return tx.collection.update({
        where: { id },
        data: {
          name,
          description: patch.description ?? current.description,
          type: patch.type ?? current.type,
          columns: {
            create: columns.map((column, position) => ({
              ...column,
              position,
            })),
          },
        },
        include: { columns: { orderBy: { position: 'asc' } } },
      });
    });
  }

  async remove(id: number) {
    await this.get(id);
    await this.prisma.collection.delete({ where: { id } });
    return { deleted: true };
  }

  async reorder(ids: number[]) {
    const unique = new Set(ids);
    if (unique.size !== ids.length) {
      throw new BadRequestException('El orden contiene colecciones duplicadas.');
    }
    const existing = await this.prisma.collection.findMany({
      select: { id: true },
    });
    const existingIds = new Set(existing.map((row) => row.id));
    if (!ids.every((id) => existingIds.has(id))) {
      throw new BadRequestException(
        'El orden incluye colecciones que no existen.',
      );
    }
    await this.prisma.$transaction(
      ids.map((id, position) =>
        this.prisma.collection.update({
          where: { id },
          data: { position },
        }),
      ),
    );
    return this.list();
  }

  async listItems(collectionId: number, q?: string) {
    await this.get(collectionId);
    return this.prisma.collectionItem.findMany({
      where: {
        collectionId,
        ...(q?.trim()
          ? { name: { contains: q.trim(), mode: 'insensitive' } }
          : {}),
      },
      orderBy: { name: 'asc' },
    });
  }

  private async columnsOf(collectionId: number): Promise<CollectionColumnDef[]> {
    const collection = await this.get(collectionId);
    return collection.columns.map((column) => ({
      name: column.name,
      label: column.label,
      type: column.type as CollectionColumnDef['type'],
      required: column.required,
    }));
  }

  async createItem(collectionId: number, body: Record<string, unknown>) {
    const columns = await this.columnsOf(collectionId);
    const payload = sanitizeItemPayload(columns, body);
    return this.prisma.collectionItem.create({
      data: {
        collectionId,
        name: payload.name,
        imageUrl: payload.imageUrl,
        tags: payload.tags,
        values: payload.values as Prisma.InputJsonValue,
      },
    });
  }

  async updateItem(id: number, body: Record<string, unknown>) {
    const item = await this.prisma.collectionItem.findUnique({
      where: { id },
    });
    if (!item) throw new NotFoundException('El ítem no existe.');
    const columns = await this.columnsOf(item.collectionId);
    const current = {
      name: item.name,
      imageUrl: item.imageUrl,
      tags: item.tags,
      values: item.values as Record<string, unknown>,
    };
    const payload = sanitizeItemPayload(columns, body, current);
    return this.prisma.collectionItem.update({
      where: { id },
      data: {
        name: payload.name,
        imageUrl: payload.imageUrl,
        tags: payload.tags,
        values: payload.values as Prisma.InputJsonValue,
      },
    });
  }

  async removeItem(id: number) {
    const item = await this.prisma.collectionItem.findUnique({
      where: { id },
    });
    if (!item) throw new NotFoundException('El ítem no existe.');
    await this.prisma.collectionItem.delete({ where: { id } });
    return { deleted: true };
  }

  async exportCollection(id: number) {
    const collection = await this.get(id);
    const items = await this.prisma.collectionItem.findMany({
      where: { collectionId: id },
      orderBy: { name: 'asc' },
    });
    return {
      format: 'chucks-collection',
      version: 1,
      exportedAt: new Date().toISOString(),
      collection: {
        name: collection.name,
        description: collection.description,
        type: collection.type,
        columns: collection.columns.map((column) => ({
          name: column.name,
          label: column.label,
          type: column.type,
          required: column.required,
        })),
      },
      items: items.map((item) => ({
        name: item.name,
        values: item.values,
        imageUrl: item.imageUrl,
        tags: item.tags,
      })),
    };
  }

  async importCollection(payload: unknown) {
    if (
      !isPlainObject(payload) ||
      payload['format'] !== 'chucks-collection' ||
      !isPlainObject(payload['collection'])
    ) {
      throw new BadRequestException(
        'El archivo no contiene una colección válida.',
      );
    }
    const source = payload['collection'];
    const baseName = toText(source['name']).trim();
    if (!baseName) {
      throw new BadRequestException('La colección importada no tiene nombre.');
    }
    let name = baseName;
    let suffix = 2;
    while (
      await this.prisma.collection.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } },
        select: { id: true },
      })
    ) {
      name = `${baseName} (${suffix++})`;
    }
    const columns = normalizeColumns(source['columns'] ?? source['schema'] ?? []);
    const rawItems = Array.isArray(payload['items']) ? payload['items'] : [];
    const last = await this.prisma.collection.aggregate({
      _max: { position: true },
    });
    return this.prisma.$transaction(async (tx) => {
      const collection = await tx.collection.create({
        data: {
          name,
          description: toText(source['description']).slice(0, 2000),
          type: toText(source['type']).slice(0, 60) || 'generic',
          position: (last._max.position ?? -1) + 1,
          columns: {
            create: columns.map((column, position) => ({
              ...column,
              position,
            })),
          },
        },
      });
      for (const raw of rawItems) {
        if (!isPlainObject(raw)) continue;
        const values = isPlainObject(raw['values'])
          ? raw['values']
          : isPlainObject(raw['metadata'])
            ? (raw['metadata'] as Record<string, unknown>)
            : {};
        const rawImage = raw['imageUrl'] ?? raw['imagePath'];
        const imageUrl = validUrl(rawImage) ? rawImage : null;
        const tags = (Array.isArray(raw['tags']) ? raw['tags'] : [])
          .map((tag) => String(tag).trim())
          .filter(Boolean);
        await tx.collectionItem.create({
          data: {
            collectionId: collection.id,
            name: toText(raw['name']),
            imageUrl,
            tags,
            values: validateValues(columns, values) as Prisma.InputJsonValue,
          },
        });
      }
      return tx.collection.findUniqueOrThrow({
        where: { id: collection.id },
        include: { columns: { orderBy: { position: 'asc' } } },
      });
    });
  }
}
