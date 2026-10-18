import { BadRequestException } from '@nestjs/common';
import { toText } from '../common/text.js';

export const COLUMN_TYPES = [
  'string',
  'number',
  'boolean',
  'date',
  'url',
  'tags',
] as const;

export type CollectionColumnType = (typeof COLUMN_TYPES)[number];

export interface CollectionColumnDef {
  name: string;
  label: string;
  type: CollectionColumnType;
  required: boolean;
}

const TYPE_SET = new Set<string>(COLUMN_TYPES);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const validUrl = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

const normalizeColumn = (column: unknown): CollectionColumnDef => {
  if (!isPlainObject(column)) {
    throw new BadRequestException('Definición de columna inválida.');
  }
  const name = toText(column['name']).trim();
  const type = toText(column['type']) || 'string';
  if (!name) {
    throw new BadRequestException('Toda columna necesita un nombre.');
  }
  if (!TYPE_SET.has(type)) {
    throw new BadRequestException(`Tipo de columna no soportado: ${type}.`);
  }
  return {
    name,
    type: type as CollectionColumnType,
    required: Boolean(column['required']),
    label: toText(column['label']).trim() || name,
  };
};

export const normalizeColumns = (columns: unknown): CollectionColumnDef[] => {
  const list = Array.isArray(columns)
    ? columns.map(normalizeColumn)
    : isPlainObject(columns)
      ? Object.entries(columns).map(([name, type]) =>
          normalizeColumn({ name, type }),
        )
      : [];
  const names = new Set<string>();
  for (const column of list) {
    if (names.has(column.name)) {
      throw new BadRequestException(`Columna duplicada: ${column.name}.`);
    }
    names.add(column.name);
  }
  return list;
};

const sanitizeValue = (
  column: CollectionColumnDef,
  value: unknown,
): unknown => {
  if (value === '' || value === null || value === undefined) {
    if (column.type === 'boolean') return false;
    if (column.required) {
      throw new BadRequestException(
        `La columna "${column.label}" es obligatoria.`,
      );
    }
    return undefined;
  }
  if (column.type === 'string') return toText(value);
  if (column.type === 'number') {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      throw new BadRequestException(`"${column.label}" debe ser un número.`);
    }
    return number;
  }
  if (column.type === 'boolean') {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    throw new BadRequestException(
      `"${column.label}" debe ser verdadero o falso.`,
    );
  }
  if (column.type === 'date') {
    const date = new Date(toText(value));
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`"${column.label}" debe ser una fecha.`);
    }
    return date.toISOString();
  }
  if (column.type === 'url') {
    if (!validUrl(value)) {
      throw new BadRequestException(
        `"${column.label}" debe ser una URL HTTP válida.`,
      );
    }
    return value;
  }
  const tags = Array.isArray(value) ? value : toText(value).split(',');
  return tags.map((tag) => toText(tag).trim()).filter(Boolean);
};

export const validateValues = (
  columns: CollectionColumnDef[],
  values: unknown,
): Record<string, unknown> => {
  if (!isPlainObject(values)) {
    throw new BadRequestException('Los valores del ítem deben ser un objeto.');
  }
  const result: Record<string, unknown> = {};
  for (const column of columns) {
    const value = sanitizeValue(column, values[column.name]);
    if (value !== undefined) result[column.name] = value;
  }
  return result;
};

export const sanitizeItemPayload = (
  columns: CollectionColumnDef[],
  data: Record<string, unknown>,
  current?: { name: string; imageUrl: string | null; tags: string[]; values: Record<string, unknown> },
) => {
  const name = toText(data['name'] ?? current?.name ?? '').trim();
  if (!name) {
    throw new BadRequestException('El nombre del ítem es obligatorio.');
  }
  const imageUrl =
    data['imageUrl'] !== undefined ? data['imageUrl'] : current?.imageUrl;
  if (imageUrl && !validUrl(imageUrl)) {
    throw new BadRequestException('La imagen debe ser una URL HTTP válida.');
  }
  const tags = (data['tags'] ?? current?.tags ?? []) as unknown;
  if (!Array.isArray(tags)) {
    throw new BadRequestException('Las etiquetas deben ser un arreglo.');
  }
  return {
    name,
    imageUrl: (imageUrl as string | null) || null,
    tags: tags.map((tag) => toText(tag).trim()).filter(Boolean),
    values: validateValues(
      columns,
      data['values'] ?? current?.values ?? {},
    ),
  };
};
