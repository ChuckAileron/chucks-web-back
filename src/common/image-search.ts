import { requestPage, type PageResponse } from './http-page.js';
import { toText } from './text.js';

// Port a TypeScript de electron/imageSearch.cjs: buscadores de imágenes por
// HTML/JSON con motores Google, Bing, DuckDuckGo, Wikimedia y Openverse.

export const IMAGE_ENGINES = [
  'google',
  'bing',
  'duckduckgo',
  'wikimedia',
  'openverse',
] as const;

export type ImageSearchEngine = (typeof IMAGE_ENGINES)[number];

const RESULTS_PER_PAGE = 24;
const MAX_PAGE = 10;

export interface ImageSearchResult {
  imageUrl: string;
  thumbnailUrl: string;
  title: string;
  source: string;
  pageUrl: string;
  width?: number;
  height?: number;
}

const cleanText = (value: unknown): string =>
  toText(value)
    .replace(/\\u([\dA-Fa-f]{4})/g, (_, code: string) =>
      String.fromCharCode(Number.parseInt(code, 16)),
    )
    .replace(/\\"/g, '"')
    .replace(/\\\//g, '/')
    .replace(/\s+/g, ' ')
    .trim();

const isImageUrl = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^https?:\/\//i.test(value) &&
  !/google\.com|gstatic\.com\/og|favicon|logo/i.test(value);

const safeHostname = (value: string): string => {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

const canonicalImageUrl = (value: string): string => {
  const text = toText(value);
  const cut = text.search(/[?#]/);
  return cut < 0 ? text : text.slice(0, cut);
};

const uniqueImages = (results: ImageSearchResult[]): ImageSearchResult[] => {
  const seen = new Set<string>();
  return results.filter((result) => {
    if (!result || !isImageUrl(result.imageUrl)) return false;
    if (seen.has(result.imageUrl)) return false;
    seen.add(result.imageUrl);
    return true;
  });
};

export const extractGoogleImages = (body: string): ImageSearchResult[] => {
  if (!body) return [];
  const found: ImageSearchResult[] = [];
  const pattern = /"ou"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) && found.length < 60) {
    const imageUrl = cleanText(match[1]);
    if (!isImageUrl(imageUrl)) continue;
    const ahead = body.slice(match.index, match.index + 4000);
    const thumbnail = cleanText(ahead.match(/"tu"\s*:\s*"((?:[^"\\]|\\.)*)"/)?.[1]);
    const pageUrl = cleanText(ahead.match(/"ru"\s*:\s*"((?:[^"\\]|\\.)*)"/)?.[1]);
    const title = cleanText(ahead.match(/"pt"\s*:\s*"((?:[^"\\]|\\.)*)"/)?.[1]);
    found.push({
      imageUrl,
      thumbnailUrl: /^https?:\/\//i.test(thumbnail) ? thumbnail : imageUrl,
      title: title || '',
      source: pageUrl ? safeHostname(pageUrl) : 'Google',
      pageUrl: /^https?:\/\//i.test(pageUrl) ? pageUrl : '',
    });
  }
  return uniqueImages(found).slice(0, RESULTS_PER_PAGE);
};

const extractDuckDuckGoToken = (body: string): string | null => {
  if (!body) return null;
  return (
    body.match(/vqd\s*=\s*['"]([^'"]+)['"]/)?.[1] ??
    body.match(/vqd=([\d-]+)/)?.[1] ??
    null
  );
};

const extractDuckDuckGoImages = (body: string): ImageSearchResult[] => {
  if (!body) return [];
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return [];
  }
  const results =
    (payload as { results?: unknown }).results &&
    Array.isArray((payload as { results: unknown[] }).results)
      ? (payload as { results: Record<string, unknown>[] }).results
      : [];
  return uniqueImages(
    results.map((item) => ({
      imageUrl: toText(item['image']),
      thumbnailUrl: toText(item['thumbnail'] ?? item['image']),
      title: toText(item['title']),
      source:
        toText(item['source']) ||
        safeHostname(toText(item['url'])) ||
        'DuckDuckGo',
      pageUrl: toText(item['url']),
      width: Number(item['width']) || undefined,
      height: Number(item['height']) || undefined,
    })),
  ).slice(0, RESULTS_PER_PAGE);
};

export const extractWikimediaImages = (body: string): ImageSearchResult[] => {
  if (!body) return [];
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return [];
  }
  const pages = (payload as { query?: { pages?: unknown } })?.query?.pages;
  if (!Array.isArray(pages)) return [];
  return uniqueImages(
    (pages as Record<string, unknown>[]).flatMap((page) => {
      const info = (page['imageinfo'] as Record<string, unknown>[] | undefined)?.[0];
      if (!info?.['url']) return [];
      return [
        {
          imageUrl: canonicalImageUrl(toText(info['url'])),
          thumbnailUrl: canonicalImageUrl(
            toText(info['thumburl'] ?? info['url']),
          ),
          title: cleanText(
            toText(page['title'])
              .replace(/^File:/, '')
              .replace(/\.[a-z]+$/i, ''),
          ),
          source: 'Wikimedia Commons',
          pageUrl: toText(info['descriptionurl']),
          width: Number(info['width']) || undefined,
          height: Number(info['height']) || undefined,
        },
      ];
    }),
  ).slice(0, RESULTS_PER_PAGE);
};

const extractOpenverseImages = (body: string): ImageSearchResult[] => {
  if (!body) return [];
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return [];
  }
  const raw = (payload as { results?: unknown }).results;
  const results = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
  return uniqueImages(
    results.map((item) => ({
      imageUrl: toText(item['url']),
      thumbnailUrl: toText(item['thumbnail'] ?? item['url']),
      title: cleanText(toText(item['title'])),
      source:
        toText(item['creator'] ?? item['provider']).trim() ||
        safeHostname(toText(item['foreign_landing_url'])) ||
        'Openverse',
      pageUrl: toText(item['foreign_landing_url']),
      width: Number(item['width']) || undefined,
      height: Number(item['height']) || undefined,
    })),
  ).slice(0, RESULTS_PER_PAGE);
};

export const extractBingImages = (body: string): ImageSearchResult[] => {
  if (!body) return [];
  const found: ImageSearchResult[] = [];
  const pattern = /m="(\{&quot;.*?\})"/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) && found.length < 60) {
    let data: Record<string, unknown> | null;
    try {
      data = JSON.parse(
        match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'),
      ) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (!data || typeof data['murl'] !== 'string') continue;
    found.push({
      imageUrl: data['murl'],
      thumbnailUrl:
        typeof data['turl'] === 'string' && data['turl']
          ? data['turl']
          : data['murl'],
      title: typeof data['t'] === 'string' ? data['t'] : '',
      source:
        safeHostname(typeof data['purl'] === 'string' ? data['purl'] : '') ||
        'Bing',
      pageUrl: typeof data['purl'] === 'string' ? data['purl'] : '',
    });
  }
  return uniqueImages(found).slice(0, RESULTS_PER_PAGE);
};

const fetchRaw = async (
  url: string,
  maxBytes = 3 * 1024 * 1024,
  options: { headers?: Record<string, string> } = {},
): Promise<PageResponse> => {
  const target = new URL(url);
  const response = await requestPage(target, maxBytes, options);
  if (response.status >= 300 && response.status < 400 && response.location) {
    return fetchRaw(new URL(response.location, target).href, maxBytes, options);
  }
  if (response.status < 200 || response.status >= 400) {
    throw new Error(`El buscador respondió con estado HTTP ${response.status}.`);
  }
  if (!response.body) throw new Error('El buscador no devolvió resultados.');
  return response;
};

const fetchText = async (
  url: string,
  maxBytes?: number,
  options?: { headers?: Record<string, string> },
): Promise<string> => (await fetchRaw(url, maxBytes, options)).body;

const responseCookies = (response: PageResponse): string => {
  const raw = response?.headers?.['set-cookie'];
  if (!raw) return '';
  return (Array.isArray(raw) ? raw : [raw])
    .map((entry) => String(entry).split(';')[0])
    .join('; ');
};

const searchGoogle = async (
  query: string,
  page: number,
): Promise<ImageSearchResult[]> => {
  const start = (page - 1) * RESULTS_PER_PAGE;
  const url =
    `https://www.google.com/search?q=${encodeURIComponent(query)}` +
    `&tbm=isch&hl=es&safe=active&start=${start}`;
  const body = await fetchText(new URL(url).href);
  if (/enablejs|\/httpservice\/retry/i.test(body)) {
    throw new Error(
      'Google bloqueó la búsqueda automatizada (exige JavaScript). Prueba con otro motor.',
    );
  }
  const results = extractGoogleImages(body);
  if (!results.length) {
    throw new Error('Google no devolvió imágenes (posible bloqueo temporal).');
  }
  return results;
};

const searchDuckDuckGo = async (
  query: string,
  page: number,
): Promise<ImageSearchResult[]> => {
  const tokenResponse = await fetchRaw(
    new URL(
      `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iar=images&iax=images&ia=images`,
    ).href,
  );
  const token = extractDuckDuckGoToken(tokenResponse.body);
  if (!token) throw new Error('No se pudo iniciar la búsqueda en DuckDuckGo.');
  const cookies = responseCookies(tokenResponse);
  const offset = (page - 1) * 100;
  const url =
    `https://duckduckgo.com/i.js?l=es-es&o=json&q=${encodeURIComponent(query)}` +
    `&vqd=${encodeURIComponent(token)}&f=,,,,,&p=${page}&s=${offset}`;
  let body: string;
  try {
    body = await fetchText(new URL(url).href, undefined, {
      headers: {
        ...(cookies ? { cookie: cookies } : {}),
        referer: 'https://duckduckgo.com/',
        accept: 'application/json, text/javascript, */*; q=0.01',
        'x-requested-with': 'XMLHttpRequest',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/HTTP 403/.test(message)) {
      throw new Error(
        'DuckDuckGo bloqueó la búsqueda automatizada. Prueba con otro motor de búsqueda.',
      );
    }
    throw new Error(`${message} Prueba con otro motor de búsqueda.`);
  }
  const results = extractDuckDuckGoImages(body);
  if (!results.length) {
    throw new Error('DuckDuckGo no devolvió imágenes para esta búsqueda.');
  }
  return results;
};

const searchBing = async (
  query: string,
  page: number,
): Promise<ImageSearchResult[]> => {
  const first = (page - 1) * 35 + 1;
  const url =
    `https://www.bing.com/images/search?q=${encodeURIComponent(query)}` +
    `&FORM=HDRSC2&first=${first}`;
  const body = await fetchText(new URL(url).href);
  const results = extractBingImages(body);
  if (!results.length) {
    throw new Error('Bing no devolvió imágenes para esta búsqueda.');
  }
  return results;
};

const searchWikimedia = async (
  query: string,
  page: number,
): Promise<ImageSearchResult[]> => {
  const offset = (page - 1) * RESULTS_PER_PAGE;
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    generator: 'search',
    gsrsearch: query,
    gsrnamespace: '6',
    gsrlimit: String(RESULTS_PER_PAGE),
    gsroffset: String(offset),
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata',
    iiurlwidth: '320',
  });
  const body = await fetchText(
    `https://commons.wikimedia.org/w/api.php?${params.toString()}`,
  );
  const results = extractWikimediaImages(body);
  if (!results.length) {
    throw new Error(
      'Wikimedia Commons no tiene imágenes libres para esta búsqueda (solo aloja contenido libre, sin pósters ni portadas con derechos).',
    );
  }
  return results;
};

const searchOpenverse = async (
  query: string,
  page: number,
): Promise<ImageSearchResult[]> => {
  // Openverse limita page_size a 20 en peticiones anónimas (sin API key).
  const params = new URLSearchParams({
    q: query,
    page_size: String(Math.min(RESULTS_PER_PAGE, 20)),
    page: String(page),
  });
  const body = await fetchText(
    `https://api.openverse.org/v1/images/?${params.toString()}`,
    undefined,
    { headers: { accept: 'application/json' } },
  );
  const results = extractOpenverseImages(body);
  if (!results.length) {
    throw new Error('Openverse no devolvió imágenes para esta búsqueda.');
  }
  return results;
};

export const searchImages = async ({
  query,
  engine = 'bing',
  page = 1,
}: {
  query: string;
  engine?: string;
  page?: number;
}): Promise<ImageSearchResult[]> => {
  const text = String(query ?? '').trim();
  if (!text) throw new Error('Escribe un término para buscar imágenes.');
  if (!IMAGE_ENGINES.includes(engine as ImageSearchEngine)) {
    throw new Error('Motor de búsqueda no soportado.');
  }
  const safePage = Math.min(Math.max(Number(page) || 1, 1), MAX_PAGE);
  if (engine === 'google') return searchGoogle(text, safePage);
  if (engine === 'duckduckgo') return searchDuckDuckGo(text, safePage);
  if (engine === 'wikimedia') return searchWikimedia(text, safePage);
  if (engine === 'openverse') return searchOpenverse(text, safePage);
  return searchBing(text, safePage);
};
