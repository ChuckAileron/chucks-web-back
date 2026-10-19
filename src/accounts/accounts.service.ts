import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toText } from '../common/text.js';

export const ACCOUNT_COLUMN_TYPES = ['string', 'number', 'boolean', 'date', 'url', 'tags'] as const;
type AccountColumnType = (typeof ACCOUNT_COLUMN_TYPES)[number];
type AccountColumn = { name: string; label: string; type: AccountColumnType; required: boolean };
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

function normalizeColumns(value: unknown): AccountColumn[] {
  const columns = Array.isArray(value) ? value : [];
  const names = new Set<string>();
  return columns.map((entry) => {
    if (!isObject(entry)) throw new BadRequestException('Definición de columna inválida.');
    const name = toText(entry['name']).trim();
    const type = toText(entry['type'] ?? 'string') as AccountColumnType;
    const label = toText(entry['label'] ?? name).trim() || name;
    if (!name) throw new BadRequestException('Toda columna necesita un nombre.');
    if (!ACCOUNT_COLUMN_TYPES.includes(type)) throw new BadRequestException(`Tipo de columna no soportado: ${type}.`);
    if (names.has(name)) throw new BadRequestException(`Columna duplicada: ${name}.`);
    names.add(name);
    return { name, label, type, required: Boolean(entry['required']) };
  });
}

function sanitizeValues(columns: AccountColumn[], value: unknown) {
  const source = isObject(value) ? value : {};
  const clean: Record<string, unknown> = {};
  for (const column of columns) {
    const item = source[column.name];
    if (item === '' || item === null || item === undefined) {
      if (column.required && column.type !== 'boolean') throw new BadRequestException(`El campo "${column.label}" es obligatorio.`);
      if (column.type === 'boolean') clean[column.name] = false;
      continue;
    }
    if (column.type === 'number') {
      const number = Number(item);
      if (!Number.isFinite(number)) throw new BadRequestException(`El campo "${column.label}" debe ser un número.`);
      clean[column.name] = number;
    } else if (column.type === 'boolean') clean[column.name] = Boolean(item);
    else if (column.type === 'url') {
      const url = toText(item);
      if (!/^https?:\/\//i.test(url)) throw new BadRequestException(`El campo "${column.label}" debe ser una URL válida.`);
      clean[column.name] = url;
    } else if (column.type === 'date') {
      const date = new Date(toText(item));
      if (Number.isNaN(date.getTime())) throw new BadRequestException(`El campo "${column.label}" debe ser una fecha válida.`);
      clean[column.name] = date.toISOString();
    } else if (column.type === 'tags') {
      const tags = Array.isArray(item) ? item : toText(item).split(',');
      clean[column.name] = tags.map((tag) => toText(tag).trim()).filter(Boolean);
    } else clean[column.name] = toText(item);
  }
  return clean;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  list() { return this.prisma.account.findMany({ orderBy: [{ position: 'asc' }, { name: 'asc' }] }); }

  async get(id: number) {
    const account = await this.prisma.account.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('Cuenta no encontrada.');
    return account;
  }

  async create(body: Record<string, unknown>) {
    const name = toText(body['name']).trim();
    if (!name) throw new BadRequestException('La cuenta necesita un nombre.');
    if (await this.prisma.account.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } })) throw new BadRequestException(`Ya existe una cuenta llamada "${name}".`);
    const columns = normalizeColumns(body['columns']);
    const max = await this.prisma.account.aggregate({ _max: { position: true } });
    return this.prisma.account.create({ data: { name, description: toText(body['description'] ?? ''), columns: columns as Prisma.InputJsonValue, position: (max._max.position ?? -1) + 1 } });
  }

  async update(id: number, patch: Record<string, unknown>) {
    const current = await this.get(id);
    const name = patch['name'] === undefined ? current.name : toText(patch['name']).trim();
    if (!name) throw new BadRequestException('La cuenta necesita un nombre.');
    const duplicate = await this.prisma.account.findFirst({ where: { name: { equals: name, mode: 'insensitive' }, id: { not: id } } });
    if (duplicate) throw new BadRequestException(`Ya existe una cuenta llamada "${name}".`);
    const columns = patch['columns'] === undefined ? current.columns as AccountColumn[] : normalizeColumns(patch['columns']);
    return this.prisma.account.update({ where: { id }, data: { name, description: patch['description'] === undefined ? current.description : toText(patch['description'] ?? ''), columns: columns as Prisma.InputJsonValue } });
  }

  async remove(id: number) { await this.get(id); await this.prisma.account.delete({ where: { id } }); return { deleted: true }; }

  async reorder(ids: number[]) {
    if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) throw new BadRequestException('Lista de cuentas inválida o duplicada.');
    const existing = await this.prisma.account.findMany({ select: { id: true } });
    const valid = new Set(existing.map((account) => account.id));
    if (ids.some((id) => !valid.has(id)) || ids.length !== valid.size) throw new BadRequestException('La lista debe incluir todas las cuentas existentes.');
    await this.prisma.$transaction(ids.map((id, position) => this.prisma.account.update({ where: { id }, data: { position } })));
    return this.list();
  }

  async listRegisters(accountId: number, query = '') {
    await this.get(accountId);
    return this.prisma.accountRegister.findMany({
      where: { accountId, ...(query.trim() ? { name: { contains: query.trim(), mode: 'insensitive' } } : {}) },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
    });
  }

  private async cleanRegister(accountId: number, input: Record<string, unknown>, current?: { name: string; date: string; amount: number; values: unknown }) {
    const account = await this.get(accountId);
    const name = toText(input['name'] ?? current?.name ?? '').trim() || 'Sin concepto';
    const date = toText(input['date'] ?? current?.date ?? '').trim();
    if (!validDate(date)) throw new BadRequestException('La fecha del movimiento debe tener formato AAAA-MM-DD.');
    const amount = Number(input['amount'] ?? current?.amount);
    if (!Number.isFinite(amount)) throw new BadRequestException('El monto debe ser un número válido.');
    const columns = normalizeColumns(account.columns);
    return { name, date, amount, values: sanitizeValues(columns, input['values'] ?? current?.values) };
  }

  async createRegister(body: Record<string, unknown>) {
    const accountId = Number(body['accountId']);
    if (!Number.isInteger(accountId)) throw new BadRequestException('El accountId debe ser un entero.');
    const clean = await this.cleanRegister(accountId, body);
    return this.prisma.accountRegister.create({ data: { accountId, ...clean, values: clean.values as Prisma.InputJsonValue } });
  }

  async updateRegister(id: number, patch: Record<string, unknown>) {
    const current = await this.prisma.accountRegister.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Movimiento no encontrado.');
    const clean = await this.cleanRegister(current.accountId, patch, { ...current, values: current.values });
    return this.prisma.accountRegister.update({ where: { id }, data: { ...clean, values: clean.values as Prisma.InputJsonValue } });
  }

  async removeRegister(id: number) {
    const result = await this.prisma.accountRegister.deleteMany({ where: { id } });
    if (!result.count) throw new NotFoundException('Movimiento no encontrado.');
    return { deleted: true };
  }

  async registeredYears(accountId: number) {
    await this.get(accountId);
    const rows = await this.prisma.accountRegister.findMany({ where: { accountId }, select: { date: true }, distinct: ['date'] });
    return [...new Set(rows.map((row) => Number(row.date.slice(0, 4))))].sort((a, b) => b - a);
  }

  async monthlyTotals(accountId: number, year: number) {
    await this.get(accountId);
    if (!Number.isInteger(year) || year < 1900 || year > 2999) throw new BadRequestException('Año inválido.');
    const rows = await this.prisma.accountRegister.findMany({ where: { accountId, date: { startsWith: String(year) } }, select: { date: true, amount: true } });
    const totals = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, total: 0, count: 0 }));
    for (const row of rows) {
      const month = Number(row.date.slice(5, 7));
      if (month < 1 || month > 12) continue;
      totals[month - 1].total += row.amount;
      totals[month - 1].count += 1;
    }
    return totals;
  }
}
