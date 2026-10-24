import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { toText } from '../common/text.js';

const TRACKS = [{ slug: 'izumi', name: 'Izumi' }, { slug: 'pepita', name: 'Pepita' }];
const PRIORITIES = new Set(['bajo', 'medio', 'alto']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const clampPosition = (value: unknown, fallback: number) => {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(500, Math.max(-500, Math.round(number))) : fallback;
};

@Injectable()
export class HijitosService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureTracks() {
    for (const track of TRACKS) await this.prisma.hijitoTrack.upsert({ where: { slug: track.slug }, create: track, update: {} });
  }

  async listTracks() {
    await this.ensureTracks();
    const tracks = await this.prisma.hijitoTrack.findMany({
      orderBy: { slug: 'asc' },
      include: { tasks: { orderBy: { id: 'asc' }, include: { subtasks: { orderBy: { id: 'asc' } } } } },
    });
    return tracks.map((track) => {
      const done = track.tasks.filter((task) => task.done).length;
      const total = track.tasks.length;
      return { ...track, tasks: track.tasks, stats: { total, done, pending: total - done, percent: total ? Math.round(done / total * 100) : 0 } };
    });
  }

  async getBanner() {
    return (await this.prisma.hijitoSetting.findUnique({ where: { key: 'banner' } }))?.value ?? '';
  }

  async setBanner(value: unknown) {
    const banner = toText(value).trim();
    if (banner.length > 2000) throw new BadRequestException('El banner no puede superar los 2000 caracteres.');
    if (!banner) {
      await this.prisma.hijitoSetting.deleteMany({ where: { key: 'banner' } });
      return '';
    }
    await this.prisma.hijitoSetting.upsert({ where: { key: 'banner' }, create: { key: 'banner', value: banner }, update: { value: banner } });
    return banner;
  }

  async updateTrack(slug: string, patch: Record<string, unknown>) {
    const current = await this.prisma.hijitoTrack.findUnique({ where: { slug } });
    if (!current) throw new NotFoundException('El contexto no existe.');
    const name = toText(patch['name'] ?? current.name).trim() || current.name;
    const banner = toText(patch['banner'] ?? current.banner).trim();
    if (banner.length > 2000) throw new BadRequestException('El banner no puede superar los 2000 caracteres.');
    return this.prisma.hijitoTrack.update({ where: { slug }, data: { name, banner, bannerX: clampPosition(patch['bannerX'], current.bannerX), bannerY: clampPosition(patch['bannerY'], current.bannerY) } });
  }

  private async validateTask(data: Record<string, unknown>, current?: { trackSlug: string; description: string; dueDate: string; priority: string }) {
    const description = toText(data['description'] ?? current?.description ?? '').trim();
    if (!description) throw new BadRequestException('La descripción de la tarea es obligatoria.');
    const trackSlug = toText(data['trackSlug'] ?? current?.trackSlug ?? '');
    if (!await this.prisma.hijitoTrack.findUnique({ where: { slug: trackSlug }, select: { slug: true } })) throw new BadRequestException('El gatito no existe.');
    const dueDate = toText(data['dueDate'] ?? current?.dueDate ?? '').trim();
    if (dueDate && !DATE_RE.test(dueDate)) throw new BadRequestException('La fecha de compromiso debe estar en formato YYYY-MM-DD.');
    const priority = toText(data['priority'] ?? current?.priority ?? 'medio');
    if (!PRIORITIES.has(priority)) throw new BadRequestException('La prioridad debe ser bajo, medio o alto.');
    return { description, trackSlug, dueDate, priority };
  }

  async createTask(data: Record<string, unknown>) {
    const clean = await this.validateTask(data);
    return this.prisma.hijitoTask.create({ data: clean, include: { subtasks: true } });
  }

  async updateTask(id: number, patch: Record<string, unknown>) {
    const current = await this.prisma.hijitoTask.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('La tarea no existe.');
    const clean = await this.validateTask(patch, current);
    return this.prisma.hijitoTask.update({ where: { id }, data: { ...clean, done: patch['done'] === undefined ? current.done : Boolean(patch['done']) }, include: { subtasks: true } });
  }

  async deleteTask(id: number) {
    const result = await this.prisma.hijitoTask.deleteMany({ where: { id } });
    if (!result.count) throw new NotFoundException('La tarea no existe.');
    return { deleted: true };
  }

  async createSubtask(taskId: number, value: unknown) {
    if (!await this.prisma.hijitoTask.findUnique({ where: { id: taskId }, select: { id: true } })) throw new NotFoundException('La tarea no existe.');
    const description = toText(value).trim();
    if (!description) throw new BadRequestException('La descripción de la subtarea es obligatoria.');
    return this.prisma.hijitoSubtask.create({ data: { taskId, description } });
  }

  async updateSubtask(id: number, patch: Record<string, unknown>) {
    const current = await this.prisma.hijitoSubtask.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('La subtarea no existe.');
    const description = toText(patch['description'] ?? current.description).trim();
    if (!description) throw new BadRequestException('La descripción de la subtarea es obligatoria.');
    return this.prisma.hijitoSubtask.update({ where: { id }, data: { description, done: patch['done'] === undefined ? current.done : Boolean(patch['done']) } });
  }

  async deleteSubtask(id: number) {
    const result = await this.prisma.hijitoSubtask.deleteMany({ where: { id } });
    if (!result.count) throw new NotFoundException('La subtarea no existe.');
    return { deleted: true };
  }
}
