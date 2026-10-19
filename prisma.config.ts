import 'dotenv/config';
import { defineConfig } from 'prisma/config';
import { resolveDatabaseConfig } from './src/config/env.js';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: resolveDatabaseConfig(process.env, { strict: false }).url,
  },
});
