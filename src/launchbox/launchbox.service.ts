import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { CollectionsService } from '../collections/collections.service.js';
import {
  buildItemPatch,
  detectCsvKeyColumns,
  detectMetadataColumns,
  matchRowsToItems,
  parseCsv,
  searchGameMetadata,
  type BulkResultEntry,
  type CollectionItemLike,
  type LaunchBoxMapping,
} from '../common/launchbox-metadata.js';
import {
  ApplyBulkDto,
  ApplyOneDto,
  ApplyResultsCsvDto,
  BulkSearchDto,
  MatchRowsDto,
  SearchSingleDto,
} from './dto/launchbox.dto.js';

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const MISSING_CSV_KEYS =
  'El CSV debe tener columnas de "nombre" y "plataforma" (p. ej. "Name" y "Platform").';

// Estado del trabajo masivo en memoria (no se persiste: el frontend consulta
// el progreso por polling hasta que termina o se cancela).
interface LaunchBoxJob {
  id: string;
  status: 'running' | 'done' | 'cancelled';
  cancelled: boolean;
  current: number;
  total: number;
  name: string;
  message: string;
  results: BulkResultEntry[];
}

@Injectable()
export class LaunchboxService {
  private readonly jobs = new Map<string, LaunchBoxJob>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly collections: CollectionsService,
  ) {}

  private async itemsOf(collectionId: number): Promise<CollectionItemLike[]> {
    await this.collections.get(collectionId);
    const items = await this.prisma.collectionItem.findMany({
      where: { collectionId },
      orderBy: { name: 'asc' },
    });
    return items.map((item) => ({
      id: item.id,
      name: item.name,
      values: item.values as Record<string, unknown>,
    }));
  }

  private toItemPatch(
    current: { values: unknown },
    mapping: Partial<LaunchBoxMapping>,
    metadata: Record<string, unknown>,
  ) {
    const patch = buildItemPatch({
      current: { values: current.values as Record<string, unknown> },
      mapping,
      metadata,
    });
    return {
      values: patch.values,
      ...(patch.imageUrl ? { imageUrl: patch.imageUrl } : {}),
    };
  }

  async single(dto: SearchSingleDto) {
    const items = await this.itemsOf(dto.collectionId);
    const { matched } = matchRowsToItems({
      items,
      rows: [{ name: dto.name, platform: dto.platform ?? '' }],
      platformColumn: dto.platformColumn,
    });
    const item = matched[0] ?? null;
    const search = await searchGameMetadata({
      name: dto.name,
      platform: dto.platform,
    });
    return {
      inCollection: Boolean(item),
      itemId: item ? item.itemId : null,
      found: search.found,
      title: search.title ?? '',
      platformLabel: search.platform ?? '',
      metadata: search.metadata ?? null,
    };
  }

  async applyOne(dto: ApplyOneDto) {
    const current = await this.prisma.collectionItem.findUnique({
      where: { id: dto.itemId },
    });
    if (!current) throw new NotFoundException(`No existe el ítem ${dto.itemId}`);
    const patch = this.toItemPatch(
      current,
      dto.mapping,
      (dto.metadata ?? {}) as Record<string, unknown>,
    );
    return this.collections.updateItem(dto.itemId, patch);
  }

  parseCsvText(csvText: string) {
    const parsed = parseCsv(csvText);
    const keys = detectCsvKeyColumns(parsed.headers);
    if (!keys) throw new BadRequestException(MISSING_CSV_KEYS);
    const rows = parsed.rows
      .map((row) => ({
        name: row[keys.nameColumn] ?? '',
        platform: row[keys.platformColumn] ?? '',
      }))
      .filter((row) => row.name.trim() !== '');
    if (!rows.length) throw new BadRequestException('El CSV no contiene filas con nombre.');
    return { headers: parsed.headers, rows };
  }

  async matchRows(dto: MatchRowsDto) {
    const items = await this.itemsOf(dto.collectionId);
    const { matched, missing } = matchRowsToItems({
      items,
      rows: dto.rows.map((row) => ({
        name: row.name,
        platform: row.platform ?? '',
      })),
      platformColumn: dto.platformColumn,
    });
    return {
      matched: matched.map(({ name, platform, itemId }) => ({
        name,
        platform,
        itemId,
      })),
      missing: missing.map(({ name, platform }) => ({ name, platform })),
    };
  }

  startBulk(dto: BulkSearchDto) {
    const job: LaunchBoxJob = {
      id: randomUUID(),
      status: 'running',
      cancelled: false,
      current: 0,
      total: dto.rows.length,
      name: '',
      message: '',
      results: [],
    };
    this.jobs.set(job.id, job);
    void this.runBulk(job, dto.rows);
    return { jobId: job.id };
  }

  private async runBulk(
    job: LaunchBoxJob,
    rows: { name: string; platform?: string; itemId?: number }[],
  ) {
    try {
      for (const row of rows) {
        if (job.cancelled) break;
        job.name = row.name;
        job.message = `Consultando "${row.name}"`;
        let entry: BulkResultEntry = {
          name: row.name,
          platform: row.platform ?? '',
          itemId: row.itemId ?? null,
          found: false,
        };
        try {
          const search = await searchGameMetadata(
            { name: row.name, platform: row.platform },
            () => job.cancelled,
          );
          entry = {
            ...entry,
            found: search.found,
            title: search.title ?? '',
            platformLabel: search.platform ?? '',
            metadata: search.metadata ?? null,
          };
        } catch (error) {
          if (errorMessage(error) === 'CANCELLED') break;
          entry.error = errorMessage(error);
        }
        job.results.push(entry);
        job.current += 1;
        if (!job.cancelled && job.current < job.total) await sleep(300);
      }
      job.status = job.cancelled ? 'cancelled' : 'done';
      job.message = job.cancelled ? 'Búsqueda cancelada' : 'Búsqueda finalizada';
    } catch (error) {
      job.status = 'done';
      job.message = errorMessage(error);
    }
  }

  private requireJob(jobId: string) {
    const job = this.jobs.get(jobId);
    if (!job) throw new NotFoundException('La búsqueda no existe.');
    return job;
  }

  getJob(jobId: string) {
    const job = this.requireJob(jobId);
    return {
      jobId: job.id,
      status: job.status,
      current: job.current,
      total: job.total,
      name: job.name,
      message: job.message,
    };
  }

  getJobResults(jobId: string) {
    const job = this.requireJob(jobId);
    return { status: job.status, results: job.results };
  }

  cancelJob(jobId: string) {
    this.requireJob(jobId).cancelled = true;
    return { cancelled: true };
  }

  async applyBulk(dto: ApplyBulkDto) {
    let applied = 0;
    let missing = 0;
    let skipped = 0;
    let failed = 0;
    for (const entry of dto.results) {
      if (!entry.found || !entry.itemId) {
        skipped += 1;
        continue;
      }
      const current = await this.prisma.collectionItem.findUnique({
        where: { id: entry.itemId },
      });
      if (!current) {
        missing += 1;
        continue;
      }
      try {
        await this.collections.updateItem(
          entry.itemId,
          this.toItemPatch(
            current,
            dto.mapping,
            (entry.metadata ?? {}) as Record<string, unknown>,
          ),
        );
        applied += 1;
      } catch {
        failed += 1;
      }
    }
    return { applied, missing, skipped, failed };
  }

  async applyResultsCsv(dto: ApplyResultsCsvDto) {
    const parsed = parseCsv(dto.csvText);
    const keys = detectCsvKeyColumns(parsed.headers);
    if (!keys) throw new BadRequestException(MISSING_CSV_KEYS);
    const metadataCols = detectMetadataColumns(parsed.headers);
    const rows = parsed.rows.map((row) => ({
      name: row[keys.nameColumn] ?? '',
      platform: row[keys.platformColumn] ?? '',
      metadata: {
        boxartUrl: metadataCols.boxartColumn
          ? row[metadataCols.boxartColumn] || ''
          : '',
        releaseDate: metadataCols.releaseDateColumn
          ? row[metadataCols.releaseDateColumn] || ''
          : '',
        publisher: metadataCols.publisherColumn
          ? row[metadataCols.publisherColumn] || ''
          : '',
        developer: metadataCols.developerColumn
          ? row[metadataCols.developerColumn] || ''
          : '',
      },
    }));
    const items = await this.itemsOf(dto.collectionId);
    let applied = 0;
    let missing = 0;
    let skipped = 0;
    let failed = 0;
    for (const row of rows) {
      if (row.name.trim() === '') continue;
      const { matched } = matchRowsToItems({
        items,
        rows: [{ name: row.name, platform: row.platform }],
        platformColumn: dto.mapping.platformColumn,
      });
      const item = matched[0];
      if (!item) {
        missing += 1;
        continue;
      }
      const metadata = row.metadata;
      if (
        !metadata.boxartUrl &&
        !metadata.releaseDate &&
        !metadata.publisher &&
        !metadata.developer
      ) {
        skipped += 1;
        continue;
      }
      try {
        await this.collections.updateItem(
          item.itemId,
          this.toItemPatch(item.item, dto.mapping, metadata),
        );
        applied += 1;
      } catch {
        failed += 1;
      }
    }
    return {
      fileName: dto.fileName ?? '',
      applied,
      missing,
      skipped,
      failed,
    };
  }
}
