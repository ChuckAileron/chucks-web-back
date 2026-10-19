import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

const TARGET_KEY = 'target_weight';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: string) {
  if (!DATE_RE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function sanitizeWeight(value: unknown, label: string) {
  const weight = Number(value);
  if (!Number.isFinite(weight) || weight <= 0 || weight >= 1000) throw new BadRequestException(`${label} debe ser un número mayor que 0 y menor que 1000.`);
  return Math.round(weight * 100) / 100;
}

@Injectable()
export class WeightService {
  constructor(private readonly prisma: PrismaService) {}

  async state() {
    const [setting, entries] = await Promise.all([
      this.prisma.weightSetting.findUnique({ where: { key: TARGET_KEY } }),
      this.prisma.weightEntry.findMany({ orderBy: { date: 'asc' } }),
    ]);
    const target = setting ? Number(setting.value) : null;
    return { target: Number.isFinite(target) ? target : null, entries };
  }

  async setTarget(value: unknown) {
    if (value === null || value === undefined || value === '') {
      await this.prisma.weightSetting.deleteMany({ where: { key: TARGET_KEY } });
      return null;
    }
    const target = sanitizeWeight(value, 'El peso ideal objetivo');
    await this.prisma.weightSetting.upsert({ where: { key: TARGET_KEY }, create: { key: TARGET_KEY, value: String(target) }, update: { value: String(target) } });
    return target;
  }

  async addEntry(data: { date: string; weight: unknown }) {
    const date = String(data.date ?? '').trim();
    if (!validDate(date)) throw new BadRequestException('La fecha debe estar en formato YYYY-MM-DD y ser un día real del calendario.');
    const weight = sanitizeWeight(data.weight, 'El peso');
    return this.prisma.weightEntry.upsert({ where: { date }, create: { date, weight }, update: { weight } });
  }

  async deleteEntry(date: string) {
    const result = await this.prisma.weightEntry.deleteMany({ where: { date } });
    if (!result.count) throw new NotFoundException('No existe una pesada para esa fecha.');
    return { deleted: true };
  }
}
