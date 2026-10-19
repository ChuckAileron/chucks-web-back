import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { toText } from '../common/text.js';

export const EVENT_COLORS = ['teal', 'azul', 'naranja', 'rojo', 'verde', 'morado', 'amarillo'] as const;
const COLOR_SET = new Set<string>(EVENT_COLORS);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeDate(value: unknown, label: string) {
  const date = toText(value).trim();
  if (!DATE_RE.test(date)) throw new BadRequestException(`${label} inválida. Debe tener formato AAAA-MM-DD.`);
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new BadRequestException(`${label} inválida. Debe tener formato AAAA-MM-DD.`);
  }
  return date;
}

function normalizeTime(value: unknown, label: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  const time = toText(value).trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new BadRequestException(`${label} inválida. Debe tener formato HH:MM.`);
  return time;
}

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  colors() { return [...EVENT_COLORS]; }

  async list(start: string, end: string) {
    const from = normalizeDate(start, 'Fecha inicial');
    const to = normalizeDate(end, 'Fecha final');
    if (from > to) throw new BadRequestException('El rango de consulta es inválido.');
    return this.prisma.calendarEvent.findMany({
      where: { startDate: { lte: to }, endDate: { gte: from } },
      orderBy: [{ startDate: 'asc' }, { startTime: 'asc' }],
    });
  }

  private sanitize(data: Record<string, unknown>, current?: Record<string, unknown>) {
    const title = toText(data['title'] ?? current?.['title'] ?? '').trim();
    if (!title) throw new BadRequestException('El evento necesita un título.');
    const startDate = normalizeDate(data['startDate'] ?? current?.['startDate'], 'Fecha de inicio');
    const endDate = normalizeDate(data['endDate'] ?? data['startDate'] ?? current?.['endDate'] ?? current?.['startDate'], 'Fecha de fin');
    if (endDate < startDate) throw new BadRequestException('La fecha de fin no puede ser anterior a la de inicio.');
    const allDay = data['allDay'] === undefined ? Boolean(current?.['allDay'] ?? true) : Boolean(data['allDay']);
    const startTimeValue = data['startTime'] === undefined ? current?.['startTime'] : data['startTime'];
    const endTimeValue = data['endTime'] === undefined ? current?.['endTime'] : data['endTime'];
    const startTime = allDay ? null : normalizeTime(startTimeValue, 'Hora de inicio');
    const endTime = allDay ? null : normalizeTime(endTimeValue, 'Hora de fin');
    if (!allDay && !startTime) throw new BadRequestException('Un evento con hora necesita una hora de inicio.');
    const color = toText(data['color'] ?? current?.['color'] ?? 'teal');
    if (!COLOR_SET.has(color)) throw new BadRequestException(`Color no soportado: ${color}.`);
    const images = (data['images'] ?? current?.['images'] ?? []) as unknown;
    if (!Array.isArray(images) || images.some((image) => typeof image !== 'string' || !/^https?:\/\//i.test(image))) {
      throw new BadRequestException('Las imágenes deben ser URLs HTTP o HTTPS.');
    }
    return {
      title,
      label: toText(data['label'] ?? current?.['label'] ?? '').trim(),
      color,
      startDate,
      endDate,
      allDay,
      startTime,
      endTime,
      description: toText(data['description'] ?? current?.['description'] ?? ''),
      images: images as string[],
      isHoliday: Boolean(current?.['isHoliday'] ?? false),
    };
  }

  create(data: Record<string, unknown>) {
    return this.prisma.calendarEvent.create({ data: this.sanitize(data) });
  }

  async update(id: number, patch: Record<string, unknown>) {
    const current = await this.prisma.calendarEvent.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Evento no encontrado.');
    return this.prisma.calendarEvent.update({ where: { id }, data: this.sanitize(patch, current as unknown as Record<string, unknown>) });
  }

  async remove(id: number) {
    const result = await this.prisma.calendarEvent.deleteMany({ where: { id } });
    if (!result.count) throw new NotFoundException('Evento no encontrado.');
    return { deleted: true };
  }

  async updateHolidays(yearValue: number) {
    const year = Number(yearValue);
    if (!Number.isInteger(year) || year < 1900 || year > 2999) throw new BadRequestException('El año solicitado es inválido.');
    let response: Response;
    try {
      response = await fetch('https://api.roison.cl/feriados.json', { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
    } catch (error) {
      const detail = error instanceof Error && error.name === 'TimeoutError' ? 'La API de feriados tardó demasiado en responder.' : `No fue posible contactar la API de feriados: ${error instanceof Error ? error.message : String(error)}`;
      throw new BadRequestException(detail);
    }
    if (!response.ok) throw new BadRequestException(`La API de feriados respondió con ${response.status}: ${response.statusText}`);
    const result: unknown = await response.json();
    if (!result || typeof result !== 'object' || !Array.isArray((result as { data?: unknown }).data)) throw new BadRequestException('La respuesta de la API de feriados no contiene un arreglo data.');
    const holidays = ((result as { data: Array<Record<string, unknown>> }).data)
      .filter((holiday) => toText(holiday['date']).startsWith(`${year}-`))
      .sort((left, right) => toText(left['date']).localeCompare(toText(right['date'])))
      .map((holiday) => ({
        title: toText(holiday['title'] || 'Feriado'),
        startDate: toText(holiday['date'] || ''),
        endDate: toText(holiday['date'] || ''),
        label: 'Feriado',
        color: 'rojo',
        allDay: true,
        startTime: null,
        endTime: null,
        description: ['Feriado', holiday['type'] ? `Tipo: ${toText(holiday['type'])}` : null, holiday['scope'] ? `Alcance: ${toText(holiday['scope'])}` : null, holiday['is_irrenunciable'] ? 'Irrenunciable' : null].filter(Boolean).join('\n'),
        images: [],
        isHoliday: true,
      }));
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;
    await this.prisma.$transaction(async (tx) => {
      await tx.calendarEvent.deleteMany({ where: { isHoliday: true, startDate: { gte: start, lte: end } } });
      if (holidays.length) await tx.calendarEvent.createMany({ data: holidays });
    });
    return { year, total: holidays.length };
  }
}
