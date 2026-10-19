# CHUCK's Web — Backend

![NestJS](https://img.shields.io/badge/NestJS-12-E0234E?logo=nestjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white)
![Postgres](https://img.shields.io/badge/PostgreSQL-16-316192?logo=postgresql&logoColor=white)
![Vitest](https://img.shields.io/badge/testing-Vitest-6E9F18?logo=vitest&logoColor=white)

API real de **CHUCK's Web**: backend NestJS que persiste la aplicación en **PostgreSQL 16** vía **Prisma 7**. Implementa la lógica de negocio (colecciones flexibles, wishlist con seguimiento de precios vía scraping, lista de compras con extracción de links, wiki, cuentas/movimientos, calendario, peso, "hijitos", LaunchBox, búsqueda de imágenes) y sirve de destino al [BFF](../chucks-web-bff).

> **Arquitectura:** [`chucks-web-frontend`](../chucks-web-frontend) (`:5177`) → [`chucks-web-bff`](../chucks-web-bff) (`:3000`) → **este repo** (`:3001` + PostgreSQL)

## Funcionalidades

- **Tareas** — CRUD simple
- **Colecciones personalizadas** — estructura de columnas definida por el usuario (nombre/label/tipo/requerido/posición), items con `values` JSON, tags, ordenación, import/export
- **Wishlist** — items de deseos + histórico de `precios` por tienda (url única), refresco masivo/individual
- **Lista de compras (Shopping)** — `ShopContext` + `ShopItem`, extracción de links desde texto, scraping de producto (precio/moneda/condición/imagen), limpieza de inactivos
- **Wiki** — páginas con categoría, padre/hijos, banners por categoría, pinned, stats
- **LaunchBox** — importación/matching de CSV, obtención de metadatos (portada, fecha, dev/publisher) vía scraping de LaunchBox GamesDB. Procesos masivos en memoria (jobs) con polling
- **Búsqueda de imágenes** — multi-motor (Google, Bing, DuckDuckGo, Wikimedia, Openverse), paginado (máx. 10 páginas)
- **Hijitos** — tracks (Izumi, Pepita...), tareas/subtareas, prioridades, banners configurables
- **Cuentas** — cuentas con `columns` JSON + `AccountRegister` (`values` JSON), totales mensuales, años registrados, reordenación
- **Calendario** — eventos (all-day + horario), colores, refresco de festivos por año
- **Peso** — objetivo (`target`) + historial de `WeightEntry` (fecha única)

## Stack

| Área | Tecnología |
|---|---|
| Framework | NestJS 12 (ESM, `"type": "module"`) |
| BD | PostgreSQL 16 + Prisma 7 (`@prisma/client`, `@prisma/adapter-pg`, `pg`) |
| Validación | `class-validator` + `class-transformer` + `@nestjs/mapped-types` (DTOs parciales) + `@nestjs/config` (variables de entorno) |
| Scraping | `cheerio` + `puppeteer` (solo páginas Buyee con renderizado JS) |
| HTTP | cliente propio en `src/common/http-page.ts` (con protecciones SSRF) |
| Tests | **Vitest** + Supertest (no Jest) |
| Lint/Format | Oxlint (`--type-aware`) + Prettier |
| Tooling | Prisma CLI, `tsx` (seed), `docker compose` (Postgres local)

## Requisitos

- Node.js 20+
- Docker / Docker Desktop (para PostgreSQL local) o PostgreSQL 16 disponible
- Al menos 200–500 MB libres (Puppeteer descarga Chromium si no está cacheado)

## Puesta en marcha

1. Instalar dependencias

```bash
npm install  # tras instalar, ejecuta "prisma generate" (postinstall)
```

2. Levantar base de datos (Postgres 16)

```bash
npm run db:up  # docker compose up -d
```

Datos por defecto: `postgres:postgres@localhost:5432/chucks_web`. Ver `docker-compose.yml`.

3. Configurar variables de entorno

```bash
cp .env.example .env
```

Edita `.env`:

```env
PORT=3001
NODE_ENV=development

# PostgreSQL por partes (tienen prioridad sobre DATABASE_URL)
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=chucks_web
DB_SSL=disable

# Alternativa: URL completa (opcional si DB_* está definido)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/chucks_web?schema=public

# OPCIONAL: directorio perfil Chrome para Puppeteer (evita cookies/login conflictos)
# SHOP_CHROME_PROFILE=C:/Users/TECH/AppData/Local/Google/Chrome/User Data/chucks-web-buyee-profile
```

4. Aplicar migraciones y seed

```bash
npm run db:migrate  # crea/aplica migraciones en dev
npm run db:seed     # upsert de 2 tareas de ejemplo
```

5. Levantar en modo desarrollo

```bash
npm run start:dev
```

Backend en **http://localhost:3001** — health: `GET http://localhost:3001/health` → `{ "status": "ok", "service": "chucks-web-backend" }`.

## Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `DB_HOST` | — | Host de PostgreSQL. Obligatoria salvo que venga en `DATABASE_URL` |
| `DB_PORT` | `5432` | Puerto de PostgreSQL |
| `DB_USER` | — | Usuario. Obligatorio salvo que venga en `DATABASE_URL` |
| `DB_PASSWORD` | — | Contraseña. Obligatoria si `NODE_ENV=production` |
| `DB_NAME` | — | Base de datos. Obligatoria salvo que venga en `DATABASE_URL` |
| `DB_SSL` | `disable` | TLS con el servidor PG: `disable` \| `require` \| `verify-full` |
| `DATABASE_URL` | — | URL completa. Opcional si `DB_*` está definido (las partes sueltas tienen prioridad) |
| `PORT` | `3001` | Puerto HTTP — `src/main.ts` |
| `NODE_ENV` | — | En `production` se rechazan host localhost y contraseña vacía |
| `SHOP_CHROME_PROFILE` | opcional | `userDataDir` de Puppeteer para `buyee-renderer.service.ts`. Si no se define, usa `os.tmpdir()` |

La validación (formato, rangos y config mínima de BD) vive en `src/config/env.ts` y se aplica al arrancar con `@nestjs/config` (`ConfigModule` en `src/app.module.ts`). Prisma (`prisma.config.ts`, `PrismaService`, `seed.ts`) resuelve la conexión con las mismas variables.

## Scripts

| Script | Descripción |
|---|---|
| `npm run dev` / `npm run start:dev` | Nest con watch |
| `npm run start:debug` | Debug |
| `npm run start` / `start:prod` | Arranque / producción (`node dist/main`) |
| `npm run build` | Build |
| `npm run lint` | Oxlint type-aware sobre `src/` y `test/` |
| `npm run format` | Prettier |
| `npm test` / `test:watch` / `test:cov` | Vitest unitarios |
| `npm run test:e2e` | E2E con `vitest.config.e2e.ts` |
| `npm run postinstall` | `prisma generate` (autoejecutado tras `npm install`) |
| `npm run db:up` | `docker compose up -d` (Postgres) |
| `npm run db:down` | `docker compose down` |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:deploy` | `prisma migrate deploy` |
| `npm run db:seed` | `prisma db seed` (`tsx prisma/seed.ts`) |
| `npm run db:studio` | `prisma studio` |

## Endpoints

~75 endpoints sin prefijo global, todos debajo de `/`.

| Módulo | Rutas |
|---|---|
| **App** | `GET /health` |
| **tasks** | `GET/POST /tasks`, `GET/PATCH/DELETE /tasks/:id` |
| **collections** | `GET/POST /collections`, `GET/PATCH/DELETE /collections/:id`, `PUT /collections/reorder`, `POST /collections/import`, `GET /collections/:id/export`, `GET/POST /collections/:id/items`, `PATCH/DELETE /collections/items/:itemId` |
| **wishlist** | `GET/POST /wishlist`, `POST /wishlist/refresh`, `POST /wishlist/:id/prices`, `POST /wishlist/prices/:priceId/refresh`, `DELETE /wishlist/prices/:priceId`, `PATCH/DELETE /wishlist/:id` |
| **wiki** | `GET/POST /wiki/pages`, `GET/PATCH/DELETE /wiki/pages/:id`, `GET /wiki/categories`, `POST /wiki/categories/banner`, `GET /wiki/stats` |
| **shopping** | `GET/POST /shopping/contexts`, `DELETE /shopping/contexts/:id`, `GET /shopping/contexts/:id/items`, `POST /shopping/contexts/:id/links`, `POST /shopping/contexts/:id/refresh`, `DELETE /shopping/contexts/:id/inactive` |
| **launchbox** | `POST /launchbox/single`, `/apply-one`, `/csv/parse`, `/match-rows`, `/bulk`, `/apply-bulk`, `/apply-results-csv`, `GET /launchbox/bulk/:jobId`, `/bulk/:jobId/results`, `POST /launchbox/bulk/:jobId/cancel` |
| **images** | `POST /images/search` |
| **hijitos** | `GET /hijitos`, `GET/PUT /hijitos/banner`, `PATCH /hijitos/tracks/:slug`, `POST /hijitos/tasks`, `PATCH/DELETE /hijitos/tasks/:id`, `POST /hijitos/tasks/:id/subtasks`, `PATCH/DELETE /hijitos/subtasks/:id` |
| **accounts** | `GET/POST /accounts`, `PUT /accounts/reorder`, `GET/PATCH/DELETE /accounts/:id`, `GET /accounts/:id/registers`, `GET /accounts/:id/years`, `GET /accounts/:id/monthly`, `POST /accounts/registers`, `PATCH/DELETE /accounts/registers/:id` |
| **calendar** | `GET /calendar/colors`, `GET /calendar/events`, `POST /calendar/events`, `PATCH/DELETE /calendar/events/:id`, `POST /calendar/holidays/:year/refresh` |
| **weight** | `GET /weight`, `PUT /weight/target`, `POST /weight/entries`, `DELETE /weight/entries/:date` |

## Modelo de datos (Prisma)

Entidad resumen — ver `prisma/schema.prisma` para los tipos completos.

| Modelo | Notas |
|---|---|
| `Task` | Tarea básica (title/project/due/completed) |
| `Collection`/`CollectionColumn`/`CollectionItem` | Colecciones flexibles. `CollectionItem.values` es `Json` |
| `WishlistItem`/`WishlistPrice` | Deseos + seguimiento de precios (único `[wishlistId,url]`) |
| `WikiPage`/`WikiCategoryBanner` | Árbol auto-referenciado (`parentId → children`), slug único |
| `ShopContext`/`ShopItem` | Contextos de compra + items con scraping (precio, usdPrice, currency, store, active, checkedAt) |
| `HijitoTrack`/`HijitoTask`/`HijitoSubtask`/`HijitoSetting` | Seguimiento diario con prioridades y subtareas |
| `Account`/`AccountRegister` | `Account.columns` y `AccountRegister.values` JSON |
| `CalendarEvent` | Fechas/horas + `images[]` + `isHoliday` |
| `WeightSetting`/`WeightEntry` | Objetivo + entradas por fecha única |

## Arquitectura interna

- **Módulos NestJS** por dominio. `PrismaModule` `@Global` expone `PrismaService` (extiende `PrismaClient` con `PrismaPg`, `onModuleDestroy`).
- **Controladores** delgados: validación de params con `ParseIntPipe`, cuerpos tipados como `Record<string, unknown>` en varios casos — validación/normalización detallada vive en los **servicios** (fechas ISO `YYYY-MM-DD`, horas `HH:MM`, prioridades válidas, rangos de peso, etc.).
- **`src/common/` (integraciones sin estado):** `http-page.ts` (HTTP + SSRF guard + compresión), `price-scraper.ts` (JSON-LD + meta, fallbacks), `image-search.ts` (multi-motor), `launchbox-metadata.ts` (scraping LaunchBox GamesDB, CSV, rate-limit 500 ms), `buyee-renderer.service.ts` (Puppeteer headless, timeout 45 s), `text.ts` (normalización).
- **Jobs en memoria**: `LaunchboxService` mantiene `Map` con estados `running|done|cancelled` (no persiste entre reinicios).
- **Validación global:** `ValidationPipe({ whitelist: true, transform: true })`.
- **Mensajes de error:** mayormente en **español** (`BadRequestException`, `NotFoundException`).
- **Tests:** unitarios (`app.controller.spec.ts`, `tasks.service.spec.ts`, `launchbox-metadata.spec.ts`, `collection-validation.spec.ts`) + e2e (`test/app.e2e-spec.ts`).

## Migraciones

6 migraciones en `prisma/migrations/` (init, collections, wishlist, wiki, shopping_wishlist, hijitos_accounts_calendar_weight). Genera cliente en `src/generated/prisma` (ignorado por git). `prisma.config.ts` define `seed: tsx prisma/seed.ts`.

## CORS

Solo permite el frontend dev: `http://localhost:5177`, `http://127.0.0.1:5177` (definido en `src/main.ts`).

## Notas

- **Sin autenticación.** Pensado para uso en red local (único cliente frontend). Si se expone públicamente, añadir auth (JWT) es recomendable.
- Puppeteer usa Chromium. En CI o entornos sin GUI puede requerir flags extra; aquí se usa headless.
- El código es un **port a TypeScript** desde una versión Electron: hay referencias a `electron/priceScraper.cjs`, `electron/imageSearch.cjs`, `electron/launchboxMetadata.cjs`, `electron/urlResolver.cjs`.
- `src/generated/` está en `.gitignore` (cliente Prisma generado).
- Licencia: `UNLICENSED` (propietario).