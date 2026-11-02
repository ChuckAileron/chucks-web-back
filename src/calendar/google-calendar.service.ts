import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { toText } from '../common/text.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const GOOGLE_EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars';
const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.readonly',
];
const STATE_TTL_SECONDS = 10 * 60;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const GOOGLE_COLOR_MAP: Record<string, string> = {
  '1': 'azul',
  '2': 'verde',
  '3': 'morado',
  '4': 'rojo',
  '5': 'amarillo',
  '6': 'naranja',
  '7': 'teal',
  '8': 'azul',
  '9': 'azul',
  '10': 'verde',
  '11': 'rojo',
};

interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface GoogleEventDateTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

interface GoogleEvent {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  colorId?: string;
  start?: GoogleEventDateTime;
  end?: GoogleEventDateTime;
}

interface GoogleEventsResponse {
  items?: GoogleEvent[];
  nextPageToken?: string;
  error?: { message?: string };
}

interface StoredConnection {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string;
  calendarId: string;
}

interface CalendarRecord {
  googleEventId: string;
  googleCalendarId: string;
  title: string;
  label: string;
  color: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
  description: string;
  images: string[];
  isHoliday: boolean;
}

@Injectable()
export class GoogleCalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async connect() {
    const credentials = this.credentials();
    const url = new URL(GOOGLE_AUTH_URL);
    url.searchParams.set('client_id', credentials.clientId);
    url.searchParams.set('redirect_uri', credentials.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', GOOGLE_SCOPES.join(' '));
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('include_granted_scopes', 'true');
    url.searchParams.set('state', this.createState());
    return { url: url.toString() };
  }

  async status() {
    const connection = await this.prisma.googleCalendarConnection.findUnique({
      where: { id: 1 },
      select: { email: true, calendarId: true, lastSyncAt: true },
    });
    if (!connection) {
      return {
        connected: false,
        email: '',
        calendarId: '',
        lastSyncAt: null as Date | null,
      };
    }
    return { connected: true, ...connection };
  }

  async callback(code: string, state: string, error: string) {
    try {
      if (error) {
        throw new Error('No se autorizó el acceso a Google Calendar.');
      }
      if (!code) {
        throw new Error('Google no devolvió un código de autorización.');
      }
      if (!this.verifyState(state)) {
        throw new Error(
          'La solicitud de conexión no es válida o venció. Inténtalo de nuevo.',
        );
      }

      const credentials = this.credentials();
      const tokens = await this.requestToken({
        code,
        grant_type: 'authorization_code',
        redirect_uri: credentials.redirectUri,
      });
      const existing = await this.prisma.googleCalendarConnection.findUnique({
        where: { id: 1 },
        select: { refreshToken: true },
      });
      const refreshToken = tokens.refresh_token ?? existing?.refreshToken;
      if (!tokens.access_token || !refreshToken) {
        throw new Error(
          'Google no entregó los tokens necesarios. Vuelve a intentarlo.',
        );
      }

      const email = await this.fetchEmail(tokens.access_token);
      const expiresAt = this.expirationDate(tokens.expires_in);
      const calendarId = this.value('GOOGLE_CALENDAR_ID') || 'primary';
      await this.prisma.googleCalendarConnection.upsert({
        where: { id: 1 },
        create: {
          id: 1,
          email,
          accessToken: tokens.access_token,
          refreshToken,
          expiresAt,
          scope: tokens.scope ?? '',
          calendarId,
        },
        update: {
          email,
          accessToken: tokens.access_token,
          refreshToken,
          expiresAt,
          scope: tokens.scope ?? '',
          calendarId,
        },
      });
      return { redirectUrl: this.resultUrl('connected') };
    } catch (caught) {
      return {
        redirectUrl: this.resultUrl('error', this.errorMessage(caught)),
      };
    }
  }

  async sync(startValue: unknown, endValue: unknown) {
    const start = this.normalizeDate(startValue, 'Fecha inicial');
    const end = this.normalizeDate(endValue, 'Fecha final');
    if (start > end) {
      throw new BadRequestException('El rango de sincronización es inválido.');
    }

    const connection = await this.prisma.googleCalendarConnection.findUnique({
      where: { id: 1 },
    });
    if (!connection) {
      throw new BadRequestException(
        'Conecta Google Calendar antes de sincronizar.',
      );
    }

    const accessToken = await this.ensureAccessToken(connection);
    const events = await this.fetchEvents(
      accessToken,
      connection.calendarId,
      start,
      end,
    );
    const records = events
      .map((event) => this.toCalendarRecord(event, connection.calendarId))
      .filter((record): record is CalendarRecord => record !== null);
    const ids = records.map((record) => record.googleEventId);
    const syncedAt = new Date();

    const removed = await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.calendarEvent.deleteMany({
        where: {
          source: 'google',
          googleCalendarId: connection.calendarId,
          startDate: { lte: end },
          endDate: { gte: start },
          ...(ids.length ? { googleEventId: { notIn: ids } } : {}),
        },
      });

      for (const record of records) {
        const { googleCalendarId, googleEventId, ...fields } = record;
        await tx.calendarEvent.upsert({
          where: {
            googleCalendarId_googleEventId: {
              googleCalendarId,
              googleEventId,
            },
          },
          create: { ...record, source: 'google' },
          update: { ...fields, source: 'google' },
        });
      }

      await tx.googleCalendarConnection.update({
        where: { id: 1 },
        data: { lastSyncAt: syncedAt },
      });
      return deleted.count;
    });

    return {
      imported: records.length,
      removed,
      lastSyncAt: syncedAt,
    };
  }

  async disconnect() {
    const connection = await this.prisma.googleCalendarConnection.findUnique({
      where: { id: 1 },
    });
    if (!connection) return { disconnected: true, removed: 0 };

    await this.revokeToken(connection.refreshToken);
    const removed = await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.calendarEvent.deleteMany({
        where: { source: 'google' },
      });
      await tx.googleCalendarConnection.deleteMany({ where: { id: 1 } });
      return deleted.count;
    });
    return { disconnected: true, removed };
  }

  private async ensureAccessToken(connection: StoredConnection) {
    if (connection.expiresAt.getTime() > Date.now() + 30_000) {
      return connection.accessToken;
    }
    let tokens: GoogleTokenResponse;
    try {
      tokens = await this.requestToken({
        grant_type: 'refresh_token',
        refresh_token: connection.refreshToken,
      });
    } catch (caught) {
      throw new BadRequestException(
        `No se pudo renovar el acceso a Google Calendar. Vuelve a conectar la cuenta. ${this.errorMessage(caught)}`,
      );
    }
    if (!tokens.access_token) {
      throw new BadRequestException(
        'La conexión con Google Calendar caducó. Vuelve a conectar la cuenta.',
      );
    }
    const expiresAt = this.expirationDate(tokens.expires_in);
    await this.prisma.googleCalendarConnection.update({
      where: { id: 1 },
      data: {
        accessToken: tokens.access_token,
        expiresAt,
        scope: tokens.scope ?? connection.scope,
      },
    });
    return tokens.access_token;
  }

  private async requestToken(params: Record<string, string>) {
    const credentials = this.credentials();
    const body = new URLSearchParams({
      ...params,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
    });
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const data = await this.readJson<GoogleTokenResponse>(response);
    if (!response.ok || !data.access_token) {
      throw new Error(
        data.error_description ||
          data.error ||
          `Google respondió con ${response.status}.`,
      );
    }
    return data;
  }

  private async fetchEmail(accessToken: string) {
    try {
      const response = await fetch(GOOGLE_USERINFO_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) return '';
      const data = await this.readJson<{ email?: unknown }>(response);
      return toText(data.email).trim();
    } catch {
      return '';
    }
  }

  private async fetchEvents(
    accessToken: string,
    calendarId: string,
    start: string,
    end: string,
  ) {
    const events: GoogleEvent[] = [];
    let pageToken: string | undefined;
    let page = 0;

    do {
      const url = new URL(
        `${GOOGLE_EVENTS_URL}/${encodeURIComponent(calendarId)}/events`,
      );
      url.searchParams.set(
        'timeMin',
        `${this.shiftDate(start, -1)}T00:00:00Z`,
      );
      url.searchParams.set('timeMax', `${this.shiftDate(end, 1)}T23:59:59Z`);
      url.searchParams.set('singleEvents', 'true');
      url.searchParams.set('orderBy', 'startTime');
      url.searchParams.set('maxResults', '2500');
      url.searchParams.set('showDeleted', 'false');
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      let response: Response;
      try {
        response = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(20_000),
        });
      } catch (caught) {
        throw new BadRequestException(
          `No fue posible contactar Google Calendar: ${this.errorMessage(caught)}`,
        );
      }
      const data = await this.readJson<GoogleEventsResponse>(response);
      if (!response.ok) {
        throw new BadRequestException(
          data.error?.message ||
            `Google Calendar respondió con ${response.status}.`,
        );
      }
      events.push(...(data.items ?? []));
      pageToken =
        typeof data.nextPageToken === 'string'
          ? data.nextPageToken
          : undefined;
      page += 1;
      if (page >= 20) break;
    } while (pageToken);

    return events.filter(
      (event) => event.id && event.status !== 'cancelled',
    );
  }

  private toCalendarRecord(
    event: GoogleEvent,
    calendarId: string,
  ): CalendarRecord | null {
    if (!event.id || !event.start || event.status === 'cancelled') return null;

    const allDay = Boolean(event.start.date);
    let startDate: string;
    let endDate: string;
    let startTime: string | null = null;
    let endTime: string | null = null;

    if (allDay) {
      const rawStart = toText(event.start.date).slice(0, 10);
      if (!DATE_RE.test(rawStart)) return null;
      const rawEnd = toText(event.end?.date).slice(0, 10);
      const exclusiveEnd = DATE_RE.test(rawEnd)
        ? this.shiftDate(rawEnd, -1)
        : rawStart;
      startDate = rawStart;
      endDate = exclusiveEnd < rawStart ? rawStart : exclusiveEnd;
    } else {
      if (!event.start.dateTime) return null;
      const starts = this.localDateTime(
        event.start.dateTime,
        event.start.timeZone,
      );
      if (!starts) return null;
      const ends = event.end?.dateTime
        ? this.localDateTime(event.end.dateTime, event.end.timeZone)
        : null;
      startDate = starts.date;
      startTime = starts.time;
      endDate = ends?.date ?? starts.date;
      endTime = ends?.time ?? starts.time;
      if (endDate < startDate) {
        endDate = startDate;
        endTime = starts.time;
      } else if (endDate > startDate && endTime === '00:00') {
        endDate = this.shiftDate(endDate, -1);
        endTime = '23:59';
      }
    }

    const location = toText(event.location).trim();
    const description = [
      toText(event.description).trim(),
      location ? `Ubicación: ${location}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    return {
      googleEventId: event.id,
      googleCalendarId: calendarId,
      title: toText(event.summary).trim() || '(Sin título)',
      label: 'Google Calendar',
      color: GOOGLE_COLOR_MAP[toText(event.colorId)] ?? 'teal',
      startDate,
      endDate,
      allDay,
      startTime,
      endTime,
      description,
      images: [],
      isHoliday: false,
    };
  }

  private localDateTime(value: string, timeZone?: string) {
    const date = value.slice(0, 10);
    const time = value.slice(11, 16);
    if (!DATE_RE.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      return null;
    }
    if (/[+-]\d{2}:\d{2}$/.test(value)) return { date, time };

    const zone =
      timeZone ||
      this.value('GOOGLE_CALENDAR_TIMEZONE') ||
      'America/Santiago';
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(new Date(value));
      const pick = (type: string) =>
        parts.find((part) => part.type === type)?.value ?? '';
      const localDate = `${pick('year')}-${pick('month')}-${pick('day')}`;
      const localTime = `${pick('hour')}:${pick('minute')}`;
      if (!DATE_RE.test(localDate)) return { date, time };
      return { date: localDate, time: localTime };
    } catch {
      return { date, time };
    }
  }

  private async revokeToken(token: string) {
    try {
      await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // El token igual se elimina localmente.
    }
  }

  private credentials(): GoogleCredentials {
    const clientId = this.value('GOOGLE_CLIENT_ID');
    const clientSecret = this.value('GOOGLE_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableException(
        'Google Calendar no está configurado. Define GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET.',
      );
    }
    const redirectUri =
      this.value('GOOGLE_REDIRECT_URI') ||
      'http://localhost:3000/calendar/google/callback';
    return { clientId, clientSecret, redirectUri };
  }

  private createState() {
    const payload = Buffer.from(
      JSON.stringify({
        exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS,
        nonce: randomBytes(16).toString('base64url'),
      }),
    ).toString('base64url');
    return `${payload}.${this.signState(payload)}`;
  }

  private verifyState(state: string) {
    const [payload, signature, extra] = state.split('.');
    if (!payload || !signature || extra !== undefined) return false;
    const expected = Buffer.from(this.signState(payload));
    const actual = Buffer.from(signature);
    if (
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      return false;
    }
    try {
      const data = JSON.parse(
        Buffer.from(payload, 'base64url').toString(),
      ) as { exp?: number };
      return (
        typeof data.exp === 'number' && data.exp > Date.now() / 1000
      );
    } catch {
      return false;
    }
  }

  private signState(payload: string) {
    return createHmac('sha256', this.value('AUTH_SECRET'))
      .update(payload)
      .digest('base64url');
  }

  private resultUrl(result: 'connected' | 'error', reason?: string) {
    const target = new URL(this.frontendUrl());
    target.searchParams.set('google', result);
    if (reason) target.searchParams.set('reason', reason.slice(0, 300));
    target.hash = '/calendar';
    return target.toString();
  }

  private frontendUrl() {
    return (this.value('FRONTEND_URL') || 'http://localhost:5177').replace(
      /\/+$/,
      '',
    );
  }

  private expirationDate(seconds: unknown) {
    const value = Number(seconds);
    const ttl = Number.isFinite(value) && value > 0 ? value : 3600;
    return new Date(Date.now() + ttl * 1000 - 60_000);
  }

  private normalizeDate(value: unknown, label: string) {
    const date = toText(value).trim();
    if (!DATE_RE.test(date)) {
      throw new BadRequestException(
        `${label} inválida. Debe tener formato AAAA-MM-DD.`,
      );
    }
    const [year, month, day] = date.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) {
      throw new BadRequestException(
        `${label} inválida. Debe tener formato AAAA-MM-DD.`,
      );
    }
    return date;
  }

  private shiftDate(value: string, days: number) {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + days));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }

  private async readJson<T>(response: Response): Promise<T> {
    try {
      return (await response.json()) as T;
    } catch {
      return {} as T;
    }
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }

  private value(key: string) {
    return this.config.get<string>(key)?.trim() ?? '';
  }
}
