import { load, type CheerioAPI } from 'cheerio';
import { requestPage, validatePublicUrl } from './http-page.js';
import { toText } from './text.js';

// Port a TypeScript de electron/priceScraper.cjs: extrae precio, moneda,
// imagen y título de fichas de producto a partir de datos estructurados
// (JSON-LD, meta tags) con fallbacks por tienda (Amazon y Buyee).

const PRICE_META = [
  'meta[property="product:price:amount"]',
  'meta[property="og:price:amount"]',
  'meta[itemprop="price"]',
  '[itemprop="price"][content]',
];

const CURRENCY_META = [
  'meta[property="product:price:currency"]',
  'meta[property="og:price:currency"]',
  'meta[itemprop="priceCurrency"]',
  '[itemprop="priceCurrency"][content]',
];

// Monedas sin fracciones decimales: los separadores intermedios del número
// (comas o puntos) son siempre separadores de miles (p. ej. "CLP 189,018").
const NO_DECIMAL_CURRENCIES = new Set([
  'ARS',
  'BRL',
  'CLP',
  'COP',
  'HUF',
  'IDR',
  'JPY',
  'KRW',
  'VND',
]);

export interface ProductResult {
  price: number | null;
  currency: string | null;
  imageUrl: string | null;
  title: string | null;
  condition: string | null;
  usdPrice: number | null;
  store: string | null;
  error: string | null;
}

export const numberFromPrice = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const match = toText(value).match(/\d[\d.,\s]*/);
  if (!match) return null;
  let normalized = match[0].replace(/\s/g, '');
  const comma = normalized.lastIndexOf(',');
  const dot = normalized.lastIndexOf('.');
  if (comma > dot) normalized = normalized.replace(/\./g, '').replace(',', '.');
  else normalized = normalized.replace(/,/g, '');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
};

export const currencyFromText = (value: unknown): string | null => {
  const text = toText(value).toUpperCase();
  // El código puede ir pegado a la cifra (p. ej. "CLP189,018" en Amazon).
  const code =
    text.match(/\b(USD|EUR|GBP|JPY|CAD|AUD|MXN|BRL|CLP|ARS|COP|PEN)\b/)?.[1] ??
    text.match(
      /(?:^|[^A-Z])(USD|EUR|GBP|JPY|CAD|AUD|MXN|BRL|CLP|ARS|COP|PEN)(?=\d)/,
    )?.[1];
  if (code) return code;
  if (text.includes('€')) return 'EUR';
  if (text.includes('£')) return 'GBP';
  if (text.includes('¥')) return 'JPY';
  if (text.includes('$')) return 'USD';
  return null;
};

type Json = Record<string, unknown>;

const isJson = (value: unknown): value is Json =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const findOffer = (
  value: unknown,
): { price: number; currency: string | null } | null => {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const offer = findOffer(entry);
      if (offer) return offer;
    }
    return null;
  }
  const record = value as Json;
  if (record['price'] !== undefined || record['lowPrice'] !== undefined) {
    const rawPrice = record['price'] ?? record['lowPrice'];
    const price = numberFromPrice(rawPrice);
    if (price !== null) {
      return {
        price,
        currency:
          (record['priceCurrency'] as string | undefined) ??
          currencyFromText(rawPrice) ??
          null,
      };
    }
  }
  for (const entry of Object.values(record)) {
    const offer = findOffer(entry);
    if (offer) return offer;
  }
  return null;
};

const priceNumberFromText = (text: string, currency: string): number | null => {
  const numericTokens = text
    .split(/\s+/)
    .filter((token) => /\d/.test(token));
  // Con más de una cifra el texto es agregado (p. ej. contenedor "a-price"
  // de Amazon con "189,018 189,018") y no es un precio fiable.
  if (numericTokens.length !== 1) return null;
  const raw = numericTokens[0].match(/\d[\d.,\u202f]*/);
  if (!raw) return null;
  if (NO_DECIMAL_CURRENCIES.has(currency)) {
    if ((raw[0].match(/[.,\u202f]/g) ?? []).length > 1) return null;
    const value = Number(raw[0].replace(/[\s.,\u202f]/g, ''));
    return Number.isFinite(value) ? value : null;
  }
  return numberFromPrice(raw[0]);
};

const parsePriceFromTexts = (
  texts: string[],
): { price: number; currency: string | null } | null => {
  for (const text of texts) {
    const currency = currencyFromText(text);
    if (!currency) continue;
    const price = priceNumberFromText(text, currency);
    if (price !== null) return { price, currency };
  }
  for (const text of texts) {
    const price = numberFromPrice(text);
    if (price !== null) return { price, currency: null };
  }
  return null;
};

const extractPrice = (
  html: string,
): { price: number; currency: string | null } | null => {
  const $ = load(html);
  for (const script of $('script[type="application/ld+json"]').toArray()) {
    try {
      const offer = findOffer(JSON.parse($(script).text()));
      if (offer) return offer;
    } catch {
      // Algunas tiendas emiten JSON-LD inválido; se sigue con los metadatos.
    }
  }
  for (const selector of PRICE_META) {
    const element = $(selector).first();
    const rawPrice =
      element.attr('content') ?? element.attr('value') ?? element.text();
    const price = numberFromPrice(rawPrice);
    if (price !== null) {
      let currency: string | null = null;
      for (const currencySelector of CURRENCY_META) {
        const currencyElement = $(currencySelector).first();
        const rawCurrency =
          currencyElement.attr('content') ?? currencyElement.text();
        if (rawCurrency) {
          currency = rawCurrency.trim().toUpperCase();
          break;
        }
      }
      return { price, currency: currency ?? currencyFromText(rawPrice) };
    }
  }
  // Amazon esconde el precio del buybox en un "a-offscreen" que no matchea
  // por clase "price"; su contenedor "a-price" sí, pero con texto duplicado.
  const offscreen = $('.a-price .a-offscreen')
    .first()
    .text()
    .replace(/\s+/g, ' ')
    .trim();
  if (offscreen) {
    const amazon = parsePriceFromTexts([offscreen]);
    if (amazon) return amazon;
  }
  const fallback = parsePriceFromTexts(
    $('[class*="price"], [id*="price"]')
      .toArray()
      .map((element) => $(element).text().replace(/\s+/g, ' ').trim()),
  );
  return fallback === null ? null : fallback;
};

const imageValue = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return imageValue(value[0]);
  if (isJson(value)) return imageValue(value['url'] ?? value['contentUrl']);
  return '';
};

const findProductImage = (value: unknown): string => {
  if (!value || typeof value !== 'object') return '';
  if (Array.isArray(value)) {
    for (const entry of value) {
      const image = findProductImage(entry);
      if (image) return image;
    }
    return '';
  }
  const record = value as Json;
  const rawType = record['@type'];
  const types = Array.isArray(rawType) ? rawType : [rawType];
  if (types.some((type) => String(type).toLowerCase() === 'product')) {
    const image = imageValue(record['image']);
    if (image) return image;
  }
  for (const entry of Object.values(record)) {
    const image = findProductImage(entry);
    if (image) return image;
  }
  return '';
};

const amazonProductImage = ($: CheerioAPI): string => {
  const image = $('#landingImage, #imgBlkFront, #ebooksImgBlkFront, .a-dynamic-image').first();
  const highResolution = image.attr('data-old-hires');
  if (highResolution) return highResolution;
  const dynamic = image.attr('data-a-dynamic-image');
  if (dynamic) {
    try {
      const variants = Object.entries(
        JSON.parse(dynamic) as Record<string, [number, number]>,
      );
      variants.sort((a, b) => {
        const [aw, ah] = a[1];
        const [bw, bh] = b[1];
        return bw * bh - aw * ah;
      });
      if (variants[0]?.[0]) return variants[0][0];
    } catch {
      // Continúa con los demás atributos de la imagen de Amazon.
    }
  }
  return image.attr('src') ?? '';
};

const extractProductImage = (html: string, baseUrl: string): string | null => {
  const $ = load(html);
  let candidate = '';
  for (const script of $('script[type="application/ld+json"]').toArray()) {
    try {
      candidate = findProductImage(JSON.parse($(script).text()));
    } catch {
      // Tiendas con JSON-LD inválido publican la imagen en metadatos HTML.
    }
    if (candidate) break;
  }
  if (!candidate) candidate = amazonProductImage($);
  if (!candidate) {
    candidate =
      $(
        'meta[property="og:image"], meta[property="og:image:url"], meta[name="twitter:image"], meta[name="twitter:image:src"], [itemprop="image"]',
      )
        .toArray()
        .map(
          (element) =>
            $(element).attr('content') ??
            $(element).attr('src') ??
            $(element).attr('href'),
        )
        .find(Boolean) ?? '';
  }
  if (!candidate) return null;
  try {
    const url = new URL(candidate, baseUrl);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
};

const findProductName = (value: unknown): string => {
  if (!value || typeof value !== 'object') return '';
  if (Array.isArray(value)) {
    for (const entry of value) {
      const name = findProductName(entry);
      if (name) return name;
    }
    return '';
  }
  const record = value as Json;
  const rawType = record['@type'];
  const types = Array.isArray(rawType) ? rawType : [rawType];
  if (
    types.some((type) => String(type).toLowerCase() === 'product') &&
    record['name']
  ) {
    const name = toText(record['name']).trim();
    if (name) return name;
  }
  for (const entry of Object.values(record)) {
    const name = findProductName(entry);
    if (name) return name;
  }
  return '';
};

const extractProductTitle = (html: string): string | null => {
  const $ = load(html);
  let title = '';
  for (const script of $('script[type="application/ld+json"]').toArray()) {
    try {
      title = findProductName(JSON.parse($(script).text()));
    } catch {
      // Tiendas con JSON-LD inválido publican el título en metadatos HTML.
    }
    if (title) break;
  }
  if (!title) title = ($('meta[property="og:title"]').attr('content') ?? '').trim();
  if (!title) title = $('title').first().text().replace(/\s+/g, ' ').trim();
  return title || null;
};

export const isBuyeeUrl = (value: string): boolean => {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === 'buyee.jp' || host.endsWith('.buyee.jp');
  } catch {
    return false;
  }
};

// Buyee reúne varias tiendas japonesas bajo su propio dominio; la tienda de
// origen se deduce de la ruta de la URL. "rakuma" se revisa antes que
// "rakuten" porque las fichas de Rakuma incluyen ambos nombres.
const BUYEE_STORES = [
  { keyword: 'mercari', name: 'Mercari' },
  { keyword: 'auction', name: 'JDirectItems Auction' },
  { keyword: 'fleamarket', name: 'JDirectItems Fleamarket' },
  { keyword: 'shopping', name: 'JDirectItems Shopping' },
  { keyword: 'rakuma', name: 'Rakuten Rakuma' },
  { keyword: 'rakuten', name: 'Rakuten' },
];

const buyeeStoreName = (value: string): string | null => {
  if (!isBuyeeUrl(value)) return null;
  const url = value.toLowerCase();
  const store = BUYEE_STORES.find((entry) => url.includes(entry.keyword));
  return store ? store.name : null;
};

// Buyee renderiza el nombre traducido en el encabezado de la ficha; sus
// metadatos JSON-LD conservan el nombre original en japonés.
const extractBuyeeTitle = (html: string): string | null => {
  const $ = load(html);
  const title = $('h1.m-goodsName')
    .first()
    .text()
    .replace(/\s+/g, ' ')
    .trim();
  return title || null;
};

// Etiqueta "Item Condition" de Buyee (en inglés o en los idiomas que sirve).
const CONDITION_LABELS = new Set([
  'item condition',
  'condition',
  'estado del artículo',
  'estado del articulo',
  "état de l'article",
  '商品の状態',
  '商品状態',
]);

const extractBuyeeCondition = (html: string): string | null => {
  const $ = load(html);
  let condition = '';
  $('dt').each((_, element) => {
    if (condition) return;
    const label = $(element)
      .text()
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    if (!CONDITION_LABELS.has(label)) return;
    const value = $(element)
      .next('dd')
      .text()
      .replace(/\s+/g, ' ')
      .trim();
    if (value) condition = value;
  });
  if (!condition) {
    const fallback = $('[class*="condition"]')
      .first()
      .text()
      .replace(/\s+/g, ' ')
      .trim();
    if (fallback) condition = fallback;
  }
  return condition || null;
};

// Buyee muestra el precio en yenes junto a su estimación en dólares
// (p. ej. "2,500 YEN (US$16.60)").
const extractUsdPrice = (html: string): number | null => {
  const $ = load(html);
  const direct = $('.m-goodsDetail__priceFX').first().text();
  for (const text of [direct, $.root().text()]) {
    const match = String(text ?? '').match(/US\$\s?([0-9][0-9.,]*)/i);
    if (!match) continue;
    const value = numberFromPrice(match[1]);
    if (value !== null) return value;
  }
  return null;
};

// Analiza el HTML ya descargado de una ficha de producto. Además del precio,
// imagen y título genéricos extrae la condición y la estimación en dólares
// que publica Buyee.
export const parseProductHtml = (
  html: string,
  baseUrl: string,
): ProductResult => {
  const price = extractPrice(html);
  return {
    price: price?.price ?? null,
    currency: price?.currency ?? null,
    imageUrl: extractProductImage(html, baseUrl),
    title: extractBuyeeTitle(html) ?? extractProductTitle(html),
    condition: extractBuyeeCondition(html),
    usdPrice: extractUsdPrice(html),
    store: buyeeStoreName(baseUrl),
    error: price ? null : 'No se encontró un precio reconocible en la página.',
  };
};

export const scrapeProduct = async (value: string): Promise<ProductResult> => {
  let url = await validatePublicUrl(value);
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const response = await requestPage(url, 5 * 1024 * 1024);
    if (response.status >= 300 && response.status < 400 && response.location) {
      url = await validatePublicUrl(new URL(response.location, url).href);
      continue;
    }
    if (response.status < 200 || response.status >= 400) {
      throw new Error(`La tienda respondió con estado HTTP ${response.status}.`);
    }
    if (!response.contentType.includes('html')) {
      throw new Error('La página no devolvió contenido HTML.');
    }
    return parseProductHtml(response.body, url.href);
  }
  throw new Error('La página superó el máximo de redirecciones.');
};
