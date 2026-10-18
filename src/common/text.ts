// Convierte cualquier valor a texto sin caer en "[object Object]": los
// objetos se serializan como JSON y null/undefined como cadena vacía.
export const toText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
};
