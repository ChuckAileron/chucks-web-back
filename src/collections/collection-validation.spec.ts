import { BadRequestException } from '@nestjs/common';
import {
  normalizeColumns,
  sanitizeItemPayload,
  validateValues,
} from './collection-validation.js';

describe('collection-validation', () => {
  const columns = normalizeColumns([
    { name: 'plataforma', label: 'Plataforma', type: 'string', required: false },
    { name: 'anio', label: 'Año', type: 'number', required: false },
    { name: 'completado', label: 'Completado', type: 'boolean', required: false },
    { name: 'estreno', label: 'Estreno', type: 'date', required: false },
  ]);

  it('normalizeColumns rejects duplicates', () => {
    expect(() =>
      normalizeColumns([
        { name: 'x', label: 'X', type: 'string' },
        { name: 'x', label: 'X2', type: 'number' },
      ]),
    ).toThrow(BadRequestException);
  });

  it('normalizeColumns rejects unknown types', () => {
    expect(() =>
      normalizeColumns([{ name: 'x', label: 'X', type: 'emoji' }]),
    ).toThrow(BadRequestException);
  });

  it('validateValues coerces numbers and booleans, drops empty optionals', () => {
    const values = validateValues(columns, {
      anio: '1995',
      completado: 'true',
      estreno: '',
    });
    expect(values).toEqual({ anio: 1995, completado: true });
  });

  it('validateValues rejects non-numeric numbers', () => {
    expect(() => validateValues(columns, { anio: 'abc' })).toThrow(
      BadRequestException,
    );
  });

  it('validateValues normalizes dates to ISO', () => {
    const values = validateValues(columns, { estreno: '2017-10-06' });
    expect(String(values['estreno'])).toBe('2017-10-06T00:00:00.000Z');
  });

  it('sanitizeItemPayload validates name, tags and image url', () => {
    const payload = sanitizeItemPayload(columns, {
      name: '  Celeste  ',
      imageUrl: 'https://example.com/celeste.png',
      tags: [' indie ', '', 'platformer'],
      values: { plataforma: 'Switch', completado: true },
    });
    expect(payload).toEqual({
      name: 'Celeste',
      imageUrl: 'https://example.com/celeste.png',
      tags: ['indie', 'platformer'],
      values: { plataforma: 'Switch', completado: true },
    });
  });

  it('sanitizeItemPayload rejects invalid image urls', () => {
    expect(() =>
      sanitizeItemPayload(columns, { name: 'x', imageUrl: 'ftp://nope' }),
    ).toThrow(BadRequestException);
  });
});
