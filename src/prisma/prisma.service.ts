import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { PrismaClient } from '../generated/prisma/client.js';
import type { EnvironmentVariables } from '../config/env.js';
import { resolveDatabaseConfig, toPoolConfig } from '../config/env.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService<EnvironmentVariables>) {
    const db = resolveDatabaseConfig({
      DATABASE_URL: config.get('DATABASE_URL'),
      DB_HOST: config.get('DB_HOST'),
      DB_PORT: config.get('DB_PORT'),
      DB_USER: config.get('DB_USER'),
      DB_PASSWORD: config.get('DB_PASSWORD'),
      DB_NAME: config.get('DB_NAME'),
      DB_SSL: config.get('DB_SSL'),
      NODE_ENV: config.get('NODE_ENV'),
    }, { strict: true });

    const pool = new pg.Pool(toPoolConfig(db));
    super({
      adapter: new PrismaPg(pool, {
        schema: db.schema,
        disposeExternalPool: true,
      }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
