import { load } from 'cheerio';
import { requestPage, type PageResponse } from './http-page.js';
import { toText } from './text.js';

// Port a TypeScript de electron/launchboxMetadata.cjs: busca metadata de
// videojuegos (portada, fecha, publisher, developer) en el GamesDB de
// LaunchBox usando nombre + plataforma, con utilidades de CSV y de aplicación
// sobre los ítems de una colección.

const BASE_URL = 'https://gamesdb.launchbox-app.com';
const REQUEST_DELAY_MS = 500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type IsCancelled = () => boolean;

async function httpGet(url: string, isCancelled?: IsCancelled): Promise<PageResponse> {
  let current = url;
  for (let hop = 0; hop < 5; hop += 1) {
    if (isCancelled?.()) throw new Error('CANCELLED');
    const response = await requestPage(new URL(current));
    const status = response.status || 0;
    if (status >= 300 && status < 400 && response.location) {
      current = new URL(response.location, current).href;
      continue;
    }
    return response;
  }
  throw new Error('Demasiadas redirecciones.');
}

export function normalize(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[™®©]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanName(raw: string): string {
  return (raw || '').trim().split('(')[0].trim();
}

export function candidateQueries(title: string): string[] {
  const queries: string[] = [];
  const add = (query: string) => {
    const trimmed = (query || '').trim();
    if (trimmed && !queries.includes(trimmed)) queries.push(trimmed);
  };
  add(title);

  const words = title.split(' ').filter(Boolean);
  add(
    title
      .replace(/\s+(Part|Volume|Vol\.?|Chapter|Episode)\s*[ivxldcm0-9]*\s*$/i, '')
      .trim(),
  );

  if (words.length > 2) {
    const from = Math.min(words.length - 1, 3);
    for (let n = from; n >= 2 && queries.length < 4; n -= 1) {
      add(words.slice(0, n).join(' '));
    }
  }
  return queries;
}

export interface LaunchBoxSearchResult {
  href: string;
  title: string;
  platform: string;
}

export function parseSearchResults(html: string): LaunchBoxSearchResult[] {
  const $ = load(html);
  const results: LaunchBoxSearchResult[] = [];
  $('a.list-item.link-no-underline[href*="/games/details/"]').each((_, el) => {
    const card = $(el);
    const href = card.attr('href');
    const title = card.find('.cardTitle h3').first().text().trim();
    const platform = card.find('.cardTitle p').first().text().trim();
    if (!href || !title) return;
    results.push({ href, title, platform });
  });
  return results;
}

export function scoreMatch(
  result: LaunchBoxSearchResult,
  originalName: string,
  cleanTitle: string,
  platform: string,
): { nameScore: number; platformMatch: boolean; total: number } {
  const nr = normalize(result.title);
  const no = normalize(originalName);
  const nc = normalize(cleanTitle);

  let nameScore = 0;
  if (nr === no || nr === nc) {
    nameScore = 200;
  } else if (nr.includes(nc) || nc.includes(nr) || nr.includes(no) || no.includes(nr)) {
    nameScore = 80;
  } else {
    const tokens = nc.split(' ').filter((token) => token.length > 2);
    const hits = tokens.filter((token) => nr.includes(token)).length;
    if (tokens.length && hits / tokens.length >= 0.6) nameScore = 50;
  }

  let platformMatch = false;
  if (platform) {
    const np = normalize(result.platform);
    const npc = normalize(platform);
    platformMatch = np === npc || np.includes(npc) || npc.includes(np);
  }

  return { nameScore, platformMatch, total: nameScore + (platformMatch ? 40 : 0) };
}

export function pickBestResult(
  results: LaunchBoxSearchResult[],
  originalName: string,
  cleanTitle: string,
  platform: string,
): LaunchBoxSearchResult | null {
  const scored: { result: LaunchBoxSearchResult; score: ReturnType<typeof scoreMatch> }[] = [];
  for (const result of results) {
    const score = scoreMatch(result, originalName, cleanTitle, platform);
    if (score.nameScore >= 80) scored.push({ result, score });
  }
  if (!scored.length) return null;

  const withPlatform = scored.filter((entry) => entry.score.platformMatch);
  if (withPlatform.length) {
    withPlatform.sort((a, b) => b.score.total - a.score.total);
    return withPlatform[0].result;
  }

  scored.sort((a, b) => b.score.total - a.score.total);
  return scored[0].score.nameScore === 200 ? scored[0].result : null;
}

type Json = Record<string, unknown>;

// Decodifica el payload serializado de Nuxt (referencias por índice) que
// publica la ficha de detalle de LaunchBox.
function decodeNuxtPayload(raw: string): unknown {
  const payload = JSON.parse(raw) as unknown[];
  const seen = new Set<number>();

  function ref(i: number): unknown {
    if (i === -1) return null;
    if (i < 0 || i >= payload.length) return i;
    const value = payload[i];
    if (seen.has(i)) return value;
    seen.add(i);

    if (
      value === null ||
      typeof value === 'boolean' ||
      typeof value === 'number' ||
      typeof value === 'string'
    ) {
      return value;
    }

    if (Array.isArray(value)) {
      if (
        value.length === 2 &&
        typeof value[1] === 'number' &&
        ['ShallowReactive', 'Reactive', 'EmptyRef', 'GameDetailsEntity', 'Map', 'Set'].includes(
          String(value[0]),
        )
      ) {
        return ref(value[1]);
      }
      return value.map((entry) => (typeof entry === 'number' ? ref(entry) : entry));
    }

    const out: Json = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = typeof val === 'number' ? ref(val) : val;
    }
    return out;
  }

  return ref(0);
}

export interface LaunchBoxGamePayload extends Json {
  name: string;
  gameImages?: unknown;
  gamePublishers?: unknown;
  gameDevelopers?: unknown;
  releaseDate?: string;
}

function extractGamePayload(html: string): LaunchBoxGamePayload | null {
  const marker = html.indexOf('<script type="application/json" data-nuxt-data="nuxt-app"');
  const startSrc = marker >= 0 ? marker : html.indexOf('id="__NUXT_DATA__"');
  if (startSrc < 0) return null;

  const contentStart = html.indexOf('>', startSrc) + 1;
  const endIdx = html.indexOf('</script>', contentStart);
  if (contentStart <= 0 || endIdx < 0) return null;

  const root = decodeNuxtPayload(html.slice(contentStart, endIdx)) as Json;

  const resources =
    root && typeof root['data'] === 'object' && root['data'] !== null
      ? (root['data'] as Json)
      : {};
  for (const [key, value] of Object.entries(resources)) {
    if (
      key.startsWith('game/details/') &&
      !key.endsWith('lockfields') &&
      value &&
      typeof value === 'object' &&
      typeof (value as Json)['name'] === 'string'
    ) {
      return value as LaunchBoxGamePayload;
    }
  }
  return null;
}

function pickBoxart(images: unknown): { imageFileName?: string } | null {
  if (!Array.isArray(images)) return null;

  const fronts = (images as Json[]).filter(
    (img) => img && /^Box - Front/i.test(toText(img['imageTypeName'])),
  );
  if (!fronts.length) return null;

  const regionOrder = ['North America', 'World', 'Europe', 'Japan'];
  const regionRank = (region: unknown) => {
    const idx = regionOrder.indexOf(toText(region));
    return idx === -1 ? regionOrder.length : idx;
  };
  const typeRank = (img: Json) =>
    /reconstructed/i.test(toText(img['imageTypeName'])) ? 1 : 0;

  fronts.sort(
    (a, b) =>
      regionRank(a['regionName']) - regionRank(b['regionName']) ||
      typeRank(a) - typeRank(b) ||
      Number(b['height'] ?? 0) * Number(b['width'] ?? 0) -
        Number(a['height'] ?? 0) * Number(a['width'] ?? 0),
  );

  return fronts[0];
}

export interface LaunchBoxMetadata {
  boxartUrl: string;
  releaseDate: string;
  publisher: string;
  developer: string;
}

function extractDetails(game: LaunchBoxGamePayload): LaunchBoxMetadata {
  const boxart = pickBoxart(game['gameImages']);
  const publishers = (Array.isArray(game['gamePublishers']) ? (game['gamePublishers'] as Json[]) : [])
    .map((entry) => entry && (entry['name'] as string | undefined))
    .filter(Boolean);
  const developers = (Array.isArray(game['gameDevelopers']) ? (game['gameDevelopers'] as Json[]) : [])
    .map((entry) => entry && (entry['name'] as string | undefined))
    .filter(Boolean);

  return {
    boxartUrl:
      boxart && boxart.imageFileName
        ? `https://images.launchbox-app.com//${boxart.imageFileName}`
        : '',
    releaseDate: String(game['releaseDate'] ?? ''),
    publisher: publishers.join(', '),
    developer: developers.join(', '),
  };
}

async function searchGame(
  cleanGameTitle: string,
  originalName: string,
  platform: string,
  isCancelled?: IsCancelled,
): Promise<LaunchBoxSearchResult | null> {
  for (const query of candidateQueries(cleanGameTitle)) {
    if (isCancelled?.()) throw new Error('CANCELLED');
    const searchResponse = await httpGet(
      `${BASE_URL}/games/results?title=${encodeURIComponent(query)}`,
      isCancelled,
    );
    if (searchResponse.status === 200) {
      const results = parseSearchResults(searchResponse.body);
      const best = pickBestResult(results, originalName, cleanGameTitle, platform);
      if (best) return best;
    }
    await sleep(REQUEST_DELAY_MS);
  }
  return null;
}

async function fetchGameDetails(
  href: string,
  isCancelled?: IsCancelled,
): Promise<LaunchBoxMetadata | null> {
  const detailsUrl = href.startsWith('http') ? href : BASE_URL + href;
  const detailsResponse = await httpGet(detailsUrl, isCancelled);
  if (detailsResponse.status !== 200) return null;

  const game = extractGamePayload(detailsResponse.body);
  if (!game) return null;

  return extractDetails(game);
}

export interface GameMetadataSearch {
  found: boolean;
  title?: string;
  platform?: string;
  metadata?: LaunchBoxMetadata;
}

export async function searchGameMetadata(
  { name, platform }: { name: string; platform?: string },
  isCancelled?: IsCancelled,
): Promise<GameMetadataSearch> {
  const originalName = String(name ?? '').trim();
  const cleanGameTitle = cleanName(originalName);
  if (!cleanGameTitle) return { found: false };

  const best = await searchGame(cleanGameTitle, originalName, platform ?? '', isCancelled);
  if (!best) return { found: false };

  const details = await fetchGameDetails(best.href, isCancelled);
  if (!details) return { found: false };

  return { found: true, title: best.title, platform: best.platform, metadata: details };
}

// --- CSV ---------------------------------------------------------------------

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

// Parseo RFC-4180 básico: comillas, comas y saltos de línea dentro de campos
// entrecomillados, BOM y CRLF. Devuelve objetos clave-valor por fila.
export function parseCsv(text: string): ParsedCsv {
  const buffer = String(text ?? '').replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let quoted = false;
  let i = 0;
  const length = buffer.length;
  const flushField = () => {
    row.push(field);
    field = '';
  };
  while (i < length) {
    const ch = buffer[i];
    if (quoted) {
      if (ch === '"') {
        if (buffer[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      flushField();
      i += 1;
      continue;
    }
    if (ch === '\r') {
      i += 1;
      continue;
    }
    if (ch === '\n') {
      flushField();
      rows.push(row);
      row = [];
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) {
    flushField();
    rows.push(row);
  }

  const nonEmpty = rows.filter((entry) => entry.some((value) => value.trim() !== ''));
  const headers = (nonEmpty.shift() ?? []).map((header) => header.trim());
  return {
    headers,
    rows: nonEmpty.map((cells) => {
      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        record[header] = cells[index] ?? '';
      });
      return record;
    }),
  };
}

export function stringifyCsv(
  rows: Record<string, unknown>[],
  headers: string[],
): string {
  const escape = (value: unknown) => {
    const text = toText(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [headers.map(escape).join(',')];
  for (const row of rows) {
    lines.push(
      headers.map((header) => escape(row[header] === undefined ? '' : row[header])).join(','),
    );
  }
  return lines.join('\r\n');
}

const NAME_COLUMN_RE = /^(nombre|name|título|titulo|title|juego|game)$/i;
const PLATFORM_COLUMN_RE = /^(plataforma|platform)$/i;

export function detectCsvKeyColumns(
  headers: string[],
): { nameColumn: string; platformColumn: string } | null {
  const nameColumn = headers.find((header) => NAME_COLUMN_RE.test(header));
  const platformColumn = headers.find((header) => PLATFORM_COLUMN_RE.test(header));
  if (!nameColumn || !platformColumn) return null;
  return { nameColumn, platformColumn };
}

// Detecta las columnas de metadatos en un CSV de resultados (el generado por
// esta misma herramienta o uno manual con esos campos).
const BOXART_COLUMN_RE = /^(boxart|imagen|image|portada|caratula)/i;
const RELEASE_COLUMN_RE =
  /^(release[ _-]?(date|day)|fecha(?:[ _-]+de)?[ _-]+(lanzamiento|estreno)|lanzamiento)/i;
const PUBLISHER_COLUMN_RE = /^(publisher|editor|public[ae]dora)/i;
const DEVELOPER_COLUMN_RE = /^(developer|desarrollador|desarrollos?|estudio)|^(developer)/i;

export interface MetadataColumns {
  boxartColumn: string | null;
  releaseDateColumn: string | null;
  publisherColumn: string | null;
  developerColumn: string | null;
}

export function detectMetadataColumns(headers: string[]): MetadataColumns {
  const boxartColumn = headers.find((header) => BOXART_COLUMN_RE.test(header));
  const releaseDateColumn = headers.find((header) => RELEASE_COLUMN_RE.test(header));
  const publisherColumn = headers.find((header) => PUBLISHER_COLUMN_RE.test(header));
  const developerColumn = headers.find((header) => DEVELOPER_COLUMN_RE.test(header));
  return {
    boxartColumn: boxartColumn ?? null,
    releaseDateColumn: releaseDateColumn ?? null,
    publisherColumn: publisherColumn ?? null,
    developerColumn: developerColumn ?? null,
  };
}

// --- Coincidencia con los ítems de la colección -------------------------------

export interface CollectionItemLike {
  id: number;
  name: string;
  values: Record<string, unknown>;
}

export interface MatchedRow {
  name: string;
  platform: string;
  itemId: number;
  item: CollectionItemLike;
}

// La llave es "nombre + plataforma" con valores exactos (tras recortar
// espacios), tal como los guarda la base de datos de la sección Colección.
export function matchRowsToItems({
  items,
  rows,
  platformColumn,
}: {
  items: CollectionItemLike[];
  rows: { name: string; platform: string }[];
  platformColumn: string;
}): { matched: MatchedRow[]; missing: { name: string; platform: string }[] } {
  const norm = (value: unknown) => toText(value).trim();
  const matched: MatchedRow[] = [];
  const missing: { name: string; platform: string }[] = [];
  for (const row of rows) {
    const name = norm(row.name);
    const platform = norm(row.platform);
    const item = items.find(
      (candidate) =>
        norm(candidate.name) === name &&
        norm(candidate.values?.[platformColumn] ?? '') === platform,
    );
    if (item) matched.push({ name, platform, itemId: item.id, item });
    else missing.push({ name, platform });
  }
  return { matched, missing };
}

export interface LaunchBoxMapping {
  platformColumn: string;
  releaseDateColumn: string;
  publisherColumn: string;
  developerColumn: string;
}

// Genera el "parche" para actualizar un ítem con la metadata de LaunchBox,
// conservando el resto de columnas de la colección.
export function buildItemPatch({
  current,
  mapping,
  metadata,
}: {
  current: CollectionItemLike | { values: Record<string, unknown> } | null;
  mapping: Partial<LaunchBoxMapping>;
  metadata: Partial<LaunchBoxMetadata>;
}): { values: Record<string, unknown>; imageUrl?: string } {
  const values = { ...current?.values };
  if (mapping.releaseDateColumn && metadata.releaseDate) {
    values[mapping.releaseDateColumn] = metadata.releaseDate.slice(0, 10);
  }
  if (mapping.publisherColumn && metadata.publisher) {
    values[mapping.publisherColumn] = metadata.publisher;
  }
  if (mapping.developerColumn && metadata.developer) {
    values[mapping.developerColumn] = metadata.developer;
  }
  const patch: { values: Record<string, unknown>; imageUrl?: string } = { values };
  if (metadata.boxartUrl) patch.imageUrl = metadata.boxartUrl;
  return patch;
}

// --- Construcción del CSV de resultados ---------------------------------------

export const RESULT_CSV_HEADERS = [
  'Name',
  'Platform',
  'Found',
  'LaunchBox Title',
  'Boxart_URL',
  'Release_Date',
  'Publisher',
  'Developer',
];

export interface BulkResultEntry {
  name: string;
  platform: string;
  itemId?: number | null;
  found: boolean;
  title?: string;
  platformLabel?: string;
  metadata?: LaunchBoxMetadata | null;
  error?: string;
}

export function buildResultCsvRows(results: BulkResultEntry[]): Record<string, string>[] {
  return results.map((entry) => ({
    Name: entry.name,
    Platform: entry.platform,
    Found: entry.found ? 'Sí' : 'No',
    'LaunchBox Title': entry.title ?? '',
    Boxart_URL: entry.metadata?.boxartUrl ?? '',
    Release_Date: entry.metadata?.releaseDate ?? '',
    Publisher: entry.metadata?.publisher ?? '',
    Developer: entry.metadata?.developer ?? '',
  }));
}
