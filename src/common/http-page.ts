import * as dnsModule from 'node:dns';
import * as http from 'node:http';
import * as https from 'node:https';
import * as net from 'node:net';
import * as zlib from 'node:zlib';

// Cliente HTTP mínimo inspirado en electron/urlResolver.cjs: solo trae páginas
// públicas (sin direcciones privadas) con cookies y compresión, ya que los
// scrapers de precios, imágenes y LaunchBox comparten este comportamiento.

export interface PageResponse {
  status: number;
  location: string | null;
  contentType: string;
  body: string;
  binary: boolean;
  headers: http.IncomingHttpHeaders;
  cookies: string;
}

export interface RequestOptions {
  headers?: Record<string, string>;
}

export const isPrivateAddress = (address: string): boolean => {
  const normalized = address.toLowerCase().replace(/^::ffff:/, '');
  if (net.isIPv4(normalized)) {
    const [a, b] = normalized.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb')
  );
};

export const validatePublicUrl = async (value: string): Promise<URL> => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Ingresa una URL válida y completa.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Solo se admiten URLs HTTP o HTTPS.');
  }
  if (url.username || url.password) {
    throw new Error('No se admiten credenciales dentro de la URL.');
  }
  if (url.hostname === 'localhost' || url.hostname.endsWith('.local')) {
    throw new Error('No se admiten direcciones locales.');
  }
  const addresses = await dnsModule.promises.lookup(url.hostname, {
    all: true,
    verbatim: true,
  });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error('La URL apunta a una red privada o reservada.');
  }
  return url;
};

const extractCookies = (response: http.IncomingMessage): string => {
  const values = response.headers['set-cookie'];
  if (!values) return '';
  return (Array.isArray(values) ? values : [values])
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
};

const isTextualContentType = (contentType: string): boolean =>
  /text\/(?:html|css|plain)|application\/(?:xhtml\+xml|json|xml|javascript|x-javascript)/i.test(
    contentType,
  );

// La mayoría de las tiendas sirven HTML comprimido aunque no anuncien
// accept-encoding; sin descomprimir el body queda binario y no se puede parsear.
const decodeBody = (buffer: Buffer, encoding?: string): Buffer => {
  if (!encoding) return buffer;
  try {
    switch (encoding.toLowerCase()) {
      case 'gzip':
      case 'x-gzip':
        return zlib.gunzipSync(buffer);
      case 'deflate':
        try {
          return zlib.inflateSync(buffer);
        } catch {
          return zlib.inflateRawSync(buffer);
        }
      case 'br':
        return zlib.brotliDecompressSync(buffer);
      case 'zstd':
        return zlib.zstdDecompressSync(buffer);
      default:
        return buffer;
    }
  } catch {
    return buffer;
  }
};

export const requestPage = (
  url: URL,
  maxBytes = 1024 * 1024,
  options: RequestOptions = {},
): Promise<PageResponse> =>
  new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const request = client.get(
      url,
      {
        headers: {
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36',
          accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
          'accept-language': 'es,en;q=0.8',
          ...options.headers,
        },
        lookup: (
          hostname: string,
          lookupOptions: dnsModule.LookupOptions,
          callback: (
            error: NodeJS.ErrnoException | null,
            address: string | dnsModule.LookupAddress[],
            family?: number,
          ) => void,
        ) => {
          void dnsModule.promises
            .lookup(hostname, { ...lookupOptions, all: true })
            .then((addresses) => {
              if (addresses.some(({ address }) => isPrivateAddress(address))) {
                callback(
                  new Error('La conexión intentó acceder a una red privada.'),
                  '',
                  0,
                );
                return;
              }
              if (lookupOptions.all) {
                callback(null, addresses);
                return;
              }
              callback(null, addresses[0].address, addresses[0].family);
            })
            .catch((error: NodeJS.ErrnoException) => callback(error, '', 0));
        },
      },
      (response) => {
        const contentType = String(response.headers['content-type'] ?? '');
        const isText = isTextualContentType(contentType);
        const status = response.statusCode ?? 0;
        if (status >= 200 && status < 300 && !isText) {
          response.resume();
          resolve({
            status,
            location: null,
            contentType,
            body: '',
            binary: true,
            headers: response.headers,
            cookies: extractCookies(response),
          });
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            request.destroy(
              new Error('La respuesta supera el límite de tamaño permitido.'),
            );
          } else {
            chunks.push(chunk);
          }
        });
        response.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const body = decodeBody(buffer, response.headers['content-encoding']);
          resolve({
            status: response.statusCode ?? 0,
            location: response.headers.location ?? null,
            contentType,
            body: body.toString('utf8'),
            headers: response.headers,
            cookies: extractCookies(response),
            binary: false,
          });
        });
      },
    );
    request.setTimeout(12000, () =>
      request.destroy(new Error('La solicitud agotó el tiempo de espera.')),
    );
    request.once('error', reject);
  });
