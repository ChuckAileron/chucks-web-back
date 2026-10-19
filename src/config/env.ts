import { plainToInstance, Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  validateSync,
} from 'class-validator';
import type { PoolConfig } from 'pg';

export type SslMode = 'disable' | 'require' | 'verify-full';

const optionalNumber = ({ value }: TransformFnParams): unknown => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? value : parsed;
};

const optionalString = ({ value }: TransformFnParams): unknown =>
  value === undefined || value === null || value === ''
    ? undefined
    : String(value);

export class EnvironmentVariables {
  @Transform(optionalNumber)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT?: number;

  @IsOptional()
  @IsString()
  NODE_ENV?: string;

  @Transform(optionalString)
  @IsOptional()
  @IsString()
  DB_HOST?: string;

  @Transform(optionalNumber)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  DB_PORT?: number;

  @Transform(optionalString)
  @IsOptional()
  @IsString()
  DB_USER?: string;

  @Transform(optionalString)
  @IsOptional()
  @IsString()
  DB_PASSWORD?: string;

  @Transform(optionalString)
  @IsOptional()
  @IsString()
  DB_NAME?: string;

  @Transform(optionalString)
  @IsOptional()
  @IsIn(['disable', 'require', 'verify-full'])
  DB_SSL?: SslMode;

  @Transform(optionalString)
  @IsOptional()
  @Matches(/^postgres(ql)?:\/\//, {
    message: 'DATABASE_URL debe empezar por postgresql://',
  })
  DATABASE_URL?: string;
}

export interface DatabaseEnv {
  DATABASE_URL?: string | number | null;
  DB_HOST?: string | number | null;
  DB_PORT?: string | number | null;
  DB_USER?: string | number | null;
  DB_PASSWORD?: string | number | null;
  DB_NAME?: string | number | null;
  DB_SSL?: string | number | null;
  NODE_ENV?: string | number | null;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl: SslMode;
  schema?: string;
  url: string;
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

const SSL_MODES: SslMode[] = ['disable', 'require', 'verify-full'];

const asString = (
  value: string | number | null | undefined,
): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  const str = String(value);
  return str === '' ? undefined : str;
};

const sslFromSslmode = (sslmode: string | null | undefined): SslMode | undefined => {
  switch (sslmode) {
    case 'disable':
      return 'disable';
    case 'require':
    case 'allow':
    case 'prefer':
      return 'require';
    case 'verify-ca':
    case 'verify-full':
      return 'verify-full';
    default:
      return undefined;
  }
};

export function buildDatabaseUrl(
  config: Omit<DatabaseConfig, 'url'>,
): string {
  const credentials = `${encodeURIComponent(config.user)}:${encodeURIComponent(config.password)}`;
  const params = new URLSearchParams();
  if (config.schema) {
    params.set('schema', config.schema);
  }
  if (config.ssl !== 'disable') {
    params.set('sslmode', config.ssl);
  }
  const query = params.toString();
  return `postgresql://${credentials}@${config.host}:${config.port}/${encodeURIComponent(config.database)}${query ? `?${query}` : ''}`;
}

/**
 * Resuelve la configuración de PostgreSQL priorizando las variables sueltas
 * (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL`) sobre
 * `DATABASE_URL`. Si la URL viene completa, sus partes ausentes se reutilizan.
 * Lanza un error claro si falta configuración o si producción apunta a localhost.
 */
export function resolveDatabaseConfig(env: DatabaseEnv): DatabaseConfig {
  const rawUrl = asString(env.DATABASE_URL);
  let parsed: URL | undefined;
  if (rawUrl !== undefined) {
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new Error('DATABASE_URL no es una URL PostgreSQL válida.');
    }
    if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
      throw new Error('DATABASE_URL debe usar el esquema postgresql://');
    }
  }

  const host = asString(env.DB_HOST) ?? parsed?.hostname;
  const database =
    asString(env.DB_NAME) ??
    (parsed?.pathname.startsWith('/')
      ? decodeURIComponent(parsed.pathname.slice(1))
      : undefined);
  const user =
    asString(env.DB_USER) ??
    (parsed?.username ? decodeURIComponent(parsed.username) : undefined);
  const password =
    asString(env.DB_PASSWORD) ??
    (parsed?.password ? decodeURIComponent(parsed.password) : undefined);
  const rawPort = asString(env.DB_PORT) ?? parsed?.port;
  const port = rawPort === undefined ? 5432 : Number(rawPort);
  const schema = parsed?.searchParams.get('schema') ?? undefined;
  const ssl =
    (asString(env.DB_SSL) as SslMode | undefined) ??
    sslFromSslmode(parsed?.searchParams.get('sslmode')) ??
    'disable';

  if (!host || !user || !database) {
    const missing: string[] = [];
    if (!host) missing.push('DB_HOST');
    if (!user) missing.push('DB_USER');
    if (!database) missing.push('DB_NAME');
    throw new Error(
      `Falta configuración de PostgreSQL: ${missing.join(', ')} (o define DATABASE_URL completa).`,
    );
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`DB_PORT inválido: ${rawPort ?? ''}`);
  }
  if (!SSL_MODES.includes(ssl)) {
    throw new Error(`DB_SSL inválido: ${String(env.DB_SSL)} (usa disable | require | verify-full)`);
  }

  const isProduction = asString(env.NODE_ENV)?.toLowerCase() === 'production';
  if (isProduction) {
    if (LOOPBACK_HOSTS.has(host.toLowerCase())) {
      throw new Error(
        'En producción DB_HOST no puede ser localhost/127.0.0.1/::1: define la instancia real de PostgreSQL.',
      );
    }
    if (!password) {
      throw new Error('En producción DB_PASSWORD es obligatorio.');
    }
  }

  const config: Omit<DatabaseConfig, 'url'> = {
    host,
    port,
    user,
    password: password ?? '',
    database,
    ssl,
    schema,
  };

  return { ...config, url: buildDatabaseUrl(config) };
}

/**
 * `pg.PoolConfig` equivalente. `require` cifra sin verificar el certificado
 * (certificados autofirmados); `verify-full` exige cadena de confianza válida.
 */
export function toPoolConfig(config: DatabaseConfig): PoolConfig {
  const pool: PoolConfig = {
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    connectionTimeoutMillis: 10_000,
  };
  if (config.ssl === 'require') {
    pool.ssl = { rejectUnauthorized: false };
  } else if (config.ssl === 'verify-full') {
    pool.ssl = { rejectUnauthorized: true };
  }
  return pool;
}

/**
 * Validación para `@nestjs/config`: formato de las variables conocidas y
 * configuración mínima de base de datos (falla al arrancar, no en runtime).
 */
export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const variables = plainToInstance(EnvironmentVariables, config);
  const errors = validateSync(variables, { stopAtFirstError: false });
  if (errors.length > 0) {
    const details = errors
      .map(
        (error) =>
          `${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`,
      )
      .join('; ');
    throw new Error(`Variables de entorno inválidas — ${details}`);
  }
  resolveDatabaseConfig(variables);
  return Object.assign(new EnvironmentVariables(), config, variables);
}
