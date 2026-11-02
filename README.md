# CHUCK's Web â€” Backend

![NestJS](https://img.shields.io/badge/NestJS-12-E0234E?logo=nestjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white)
![Postgres](https://img.shields.io/badge/PostgreSQL-16-316192?logo=postgresql&logoColor=white)
![Vitest](https://img.shields.io/badge/testing-Vitest-6E9F18?logo=vitest&logoColor=white)

API real de **CHUCK's Web**: backend NestJS que persiste la aplicaciÃ³n en **PostgreSQL 16** vÃ­a **Prisma 7**. Implementa la lÃ³gica de negocio (colecciones flexibles, wishlist con seguimiento de precios vÃ­a scraping, lista de compras con extracciÃ³n de links, wiki, cuentas/movimientos, calendario, peso, "hijitos", LaunchBox, bÃºsqueda de imÃ¡genes) y sirve de destino al [BFF](../chucks-web-bff).

> **Arquitectura:** [`chucks-web-frontend`](../chucks-web-frontend) (`:5177`) â†’ [`chucks-web-bff`](../chucks-web-bff) (`:3000`) â†’ **este repo** (`:3001` + PostgreSQL)

## Funcionalidades

- **Tareas** â€” CRUD simple
- **Colecciones personalizadas** â€” estructura de columnas definida por el usuario (nombre/label/tipo/requerido/posiciÃ³n), items con `values` JSON, tags, ordenaciÃ³n, import/export
- **Wishlist** â€” items de deseos + histÃ³rico de `precios` por tienda (url Ãºnica), refresco masivo/individual
- **Lista de compras (Shopping)** â€” `ShopContext` + `ShopItem`, extracciÃ³n de links desde texto, scraping de producto (precio/moneda/condiciÃ³n/imagen), limpieza de inactivos
- **Sitios de interÃ©s** â€” contextos y pÃ¡ginas guardadas con captura de pantalla JPEG
- **Wiki** â€” pÃ¡ginas con categorÃ­a, padre/hijos, banners por categorÃ­a, pinned, stats
- **LaunchBox** â€” importaciÃ³n/matching de CSV, obtenciÃ³n de metadatos (portada, fecha, dev/publisher) vÃ­a scraping de LaunchBox GamesDB. Procesos masivos en memoria (jobs) con polling
- **BÃºsqueda de imÃ¡genes** â€” multi-motor (Google, Bing, DuckDuckGo, Wikimedia, Openverse), paginado (mÃ¡x. 10 pÃ¡ginas)
- **Hijitos** â€” tracks (Izumi, Pepita...), tareas/subtareas, prioridades, banners configurables
- **Cuentas** â€” cuentas con `columns` JSON + `AccountRegister` (`values` JSON), totales mensuales, aÃ±os registrados, reordenaciÃ³n
- **Calendario** â€” eventos (all-day + horario), colores, refresco de festivos por aÃ±o e importaciÃ³n de eventos desde Google Calendar mediante OAuth
- **Peso** â€” objetivo (`target`) + historial de `WeightEntry` (fecha Ãºnica)

## Stack

| Ãrea | TecnologÃ­a |
|---|---|
| Framework | NestJS 12 (ESM, `"type": "module"`) |
| BD | PostgreSQL 16 + Prisma 7 (`@prisma/client`, `@prisma/adapter-pg`, `pg`) |
| ValidaciÃ³n | `class-validator` + `class-transformer` + `@nestjs/mapped-types` (DTOs parciales) + `@nestjs/config` (variables de entorno) |
| Scraping | `cheerio` + `puppeteer` (solo pÃ¡ginas Buyee con renderizado JS) |
| HTTP | cliente propio en `src/common/http-page.ts` (con protecciones SSRF) |
| Tests | **Vitest** + Supertest (no Jest) |
| Lint/Format | Oxlint (`--type-aware`) + Prettier |
| Tooling | Prisma CLI, `tsx` (seed), `docker compose` (Postgres local)

## Requisitos

- Node.js 20+
- Docker / Docker Desktop (para PostgreSQL local) o PostgreSQL 16 disponible
- Al menos 200â€“500 MB libres (Puppeteer descarga Chromium si no estÃ¡ cacheado)

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

# Alternativa: URL completa (opcional si DB_* estÃ¡ definido)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/chucks_web?schema=public

# RecuperaciÃ³n de contraseÃ±a por correo (Resend; requiere dominio verificado)
RESEND_API_KEY=re_xxxxxxxxx
PASSWORD_RESET_FROM=CHUCK's Web <no-reply@tu-dominio.com>
FRONTEND_URL=http://localhost:5177

# Google Calendar (OAuth)
GOOGLE_CLIENT_ID=xxxxxxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxx
GOOGLE_REDIRECT_URI=http://localhost:3000/calendar/google/callback
GOOGLE_CALENDAR_ID=primary
GOOGLE_CALENDAR_TIMEZONE=America/Santiago

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

Backend en **http://localhost:3001** â€” health: `GET http://localhost:3001/health` â†’ `{ "status": "ok", "service": "chucks-web-backend" }`.

## Variables de entorno

| Variable | Default | DescripciÃ³n |
|---|---|---|
| `DB_HOST` | â€” | Host de PostgreSQL. Obligatoria salvo que venga en `DATABASE_URL` |
| `DB_PORT` | `5432` | Puerto de PostgreSQL |
| `DB_USER` | â€” | Usuario. Obligatorio salvo que venga en `DATABASE_URL` |
| `DB_PASSWORD` | â€” | ContraseÃ±a. Obligatoria si `NODE_ENV=production` |
| `DB_NAME` | â€” | Base de datos. Obligatoria salvo que venga en `DATABASE_URL` |
| `DB_SSL` | `disable` | TLS con el servidor PG: `disable` \| `require` \| `verify-full` |
| `DATABASE_URL` | â€” | URL completa. Opcional si `DB_*` estÃ¡ definido (las partes sueltas tienen prioridad) |
| `PORT` | `3001` | Puerto HTTP â€” `src/main.ts` |
| `NODE_ENV` | â€” | En `production` se rechazan host localhost y contraseÃ±a vacÃ­a |
| `AUTH_SECRET` | â€” | Obligatorio, mÃ­nimo 32 caracteres aleatorios; firma los tokens de sesiÃ³n |
| `INTERNAL_API_KEY` | â€” | Clave privada compartida con el BFF para las llamadas internas; usa el mismo valor en ambos servicios |
| `RESEND_API_KEY` | â€” | API key de Resend para enviar los correos de recuperaciÃ³n |
| `PASSWORD_RESET_FROM` | â€” | Remitente verificado en Resend (p. ej. `CHUCK's Web <no-reply@tu-dominio.com>`) |
| `FRONTEND_URL` | `http://localhost:5177` | URL base del frontend a la que apunta el enlace de recuperaciÃ³n y el retorno de Google Calendar |
| `GOOGLE_CLIENT_ID` | â€” | Client ID de OAuth 2.0 para importar Google Calendar |
| `GOOGLE_CLIENT_SECRET` | â€” | Client secret de OAuth 2.0 para importar Google Calendar |
| `GOOGLE_REDIRECT_URI` | `http://localhost:3000/calendar/google/callback` | URI registrada en Google Cloud Console; debe coincidir exactamente |
| `GOOGLE_CALENDAR_ID` | `primary` | Calendario de Google a importar (`primary` o su ID) |
| `GOOGLE_CALENDAR_TIMEZONE` | `America/Santiago` | Zona usada para interpretar fechas de Google entregadas en UTC |
| `SHOP_CHROME_PROFILE` | opcional | `userDataDir` de Puppeteer para `buyee-renderer.service.ts`. Si no se define, usa `os.tmpdir()` |

La recuperaciÃ³n usa enlaces aleatorios de un solo uso que vencen en una hora. Configura las tres variables de Resend/frontend, ejecuta `npm run db:deploy` para aplicar la migraciÃ³n y vuelve a desplegar el backend y el BFF.

La validaciÃ³n (formato, rangos y config mÃ­nima de BD) vive en `src/config/env.ts` y se aplica al arrancar con `@nestjs/config` (`ConfigModule` en `src/app.module.ts`). Prisma (`prisma.config.ts`, `PrismaService`, `seed.ts`) resuelve la conexiÃ³n con las mismas variables.

## Scripts

| Script | DescripciÃ³n |
|---|---|
| `npm run dev` / `npm run start:dev` | Nest con watch |
| `npm run start:debug` | Debug |
| `npm run start` / `start:prod` | Arranque / producciÃ³n (`prisma migrate deploy && node dist/main`) |
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

Rutas de autenticaciÃ³n: `POST /auth/register` crea el Ãºnico usuario permitido (correo y contraseÃ±a de al menos 12 caracteres); `POST /auth/login` valida credenciales y devuelve un token Bearer de 7 dÃ­as; `GET /auth/me` valida la sesiÃ³n actual; `POST /auth/password-reset/request` envÃ­a un enlace de recuperaciÃ³n y `POST /auth/password-reset/confirm` consume el token para actualizar la contraseÃ±a. El primer registro debe hacerse de forma privada. El resto de rutas requiere `Authorization: Bearer <accessToken>`; `GET /health` permanece pÃºblico.

~83 endpoints sin prefijo global, todos debajo de `/`.

| MÃ³dulo | Rutas |
|---|---|
| **App** | `GET /health` |
| **auth** | `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `POST /auth/password-reset/request`, `POST /auth/password-reset/confirm` |
| **sites** | `GET/POST /sites/contexts`, `PATCH/DELETE /sites/contexts/:id`, `GET/POST /sites/contexts/:id/pages`, `POST /sites/pages/:id/capture`, `DELETE /sites/pages/:id` |
| **tasks** | `GET/POST /tasks`, `GET/PATCH/DELETE /tasks/:id` |
| **collections** | `GET/POST /collections`, `GET/PATCH/DELETE /collections/:id`, `PUT /collections/reorder`, `POST /collections/import`, `GET /collections/:id/export`, `GET/POST /collections/:id/items`, `PATCH/DELETE /collections/items/:itemId` |
| **wishlist** | `GET/POST /wishlist`, `POST /wishlist/refresh`, `POST /wishlist/:id/prices`, `POST /wishlist/prices/:priceId/refresh`, `DELETE /wishlist/prices/:priceId`, `PATCH/DELETE /wishlist/:id` |
| **wiki** | `GET/POST /wiki/pages`, `GET/PATCH/DELETE /wiki/pages/:id`, `GET /wiki/categories`, `POST /wiki/categories/banner`, `GET /wiki/stats` |
| **shopping** | `GET/POST /shopping/contexts`, `PATCH/DELETE /shopping/contexts/:id`, `GET /shopping/contexts/:id/items`, `DELETE /shopping/contexts/:contextId/items/:itemId`, `POST /shopping/contexts/:id/links`, `POST /shopping/contexts/:id/refresh`, `DELETE /shopping/contexts/:id/inactive` |
| **launchbox** | `POST /launchbox/single`, `/apply-one`, `/csv/parse`, `/match-rows`, `/bulk`, `/apply-bulk`, `/apply-results-csv`, `GET /launchbox/bulk/:jobId`, `/bulk/:jobId/results`, `POST /launchbox/bulk/:jobId/cancel` |
| **images** | `POST /images/search` |
| **hijitos** | `GET /hijitos`, `GET/PUT /hijitos/banner`, `PATCH /hijitos/tracks/:slug`, `POST /hijitos/tasks`, `PATCH/DELETE /hijitos/tasks/:id`, `POST /hijitos/tasks/:id/subtasks`, `PATCH/DELETE /hijitos/subtasks/:id` |
| **accounts** | `GET/POST /accounts`, `PUT /accounts/reorder`, `GET/PATCH/DELETE /accounts/:id`, `GET /accounts/:id/registers`, `GET /accounts/:id/years`, `GET /accounts/:id/monthly`, `POST /accounts/registers`, `PATCH/DELETE /accounts/registers/:id` |
| **calendar** | `GET /calendar/colors`, `GET /calendar/events`, `POST /calendar/events`, `PATCH/DELETE /calendar/events/:id`, `POST /calendar/holidays/:year/refresh`, `GET /calendar/google/status`, `GET /calendar/google/connect`, `GET /calendar/google/callback`, `POST /calendar/google/sync`, `DELETE /calendar/google` |
| **weight** | `GET /weight`, `PUT /weight/target`, `POST /weight/entries`, `DELETE /weight/entries/:date` |

## Modelo de datos (Prisma)

Entidad resumen â€” ver `prisma/schema.prisma` para los tipos completos.

| Modelo | Notas |
|---|---|
| `Task` | Tarea bÃ¡sica (title/project/due/completed) |
| `AuthUser` | Ãšnica cuenta permitida, contraseÃ±a almacenada con scrypt |
| `Collection`/`CollectionColumn`/`CollectionItem` | Colecciones flexibles. `CollectionItem.values` es `Json` |
| `WishlistItem`/`WishlistPrice` | Deseos + seguimiento de precios (Ãºnico `[wishlistId,url]`) |
| `WikiPage`/`WikiCategoryBanner` | Ãrbol auto-referenciado (`parentId â†’ children`), slug Ãºnico |
| `ShopContext`/`ShopItem` | Contextos de compra + items con scraping (precio, usdPrice, currency, store, active, checkedAt) |
| `SiteContext`/`SitePage` | Sitios guardados por contexto con capturas de pantalla web |
| `HijitoTrack`/`HijitoTask`/`HijitoSubtask`/`HijitoSetting` | Seguimiento diario con prioridades y subtareas |
| `Account`/`AccountRegister` | `Account.columns` y `AccountRegister.values` JSON |
| `CalendarEvent` | Fechas/horas + `images[]` + `isHoliday` + origen y IDs de Google Calendar |
| `GoogleCalendarConnection` | Tokens OAuth, cuenta, calendario y Ãºltima sincronizaciÃ³n (fila Ãºnica) |
| `WeightSetting`/`WeightEntry` | Objetivo + entradas por fecha Ãºnica |

## Arquitectura interna

- **MÃ³dulos NestJS** por dominio. `PrismaModule` `@Global` expone `PrismaService` (extiende `PrismaClient` con `PrismaPg`, `onModuleDestroy`).
- **Controladores** delgados: validaciÃ³n de params con `ParseIntPipe`, cuerpos tipados como `Record<string, unknown>` en varios casos â€” validaciÃ³n/normalizaciÃ³n detallada vive en los **servicios** (fechas ISO `YYYY-MM-DD`, horas `HH:MM`, prioridades vÃ¡lidas, rangos de peso, etc.).
- **`src/common/` (integraciones sin estado):** `http-page.ts` (HTTP + SSRF guard + compresiÃ³n), `price-scraper.ts` (JSON-LD + meta, fallbacks), `image-search.ts` (multi-motor), `launchbox-metadata.ts` (scraping LaunchBox GamesDB, CSV, rate-limit 500 ms), `buyee-renderer.service.ts` (Puppeteer headless, timeout 45 s), `text.ts` (normalizaciÃ³n).
- **Jobs en memoria**: `LaunchboxService` mantiene `Map` con estados `running|done|cancelled` (no persiste entre reinicios).
- **ValidaciÃ³n global:** `ValidationPipe({ whitelist: true, transform: true })`.
- **Mensajes de error:** mayormente en **espaÃ±ol** (`BadRequestException`, `NotFoundException`).
- **Tests:** unitarios (`app.controller.spec.ts`, `tasks.service.spec.ts`, `launchbox-metadata.spec.ts`, `collection-validation.spec.ts`) + e2e (`test/app.e2e-spec.ts`).

## Migraciones

10 migraciones en `prisma/migrations/` (incluye autenticaciÃ³n de usuario Ãºnico, recuperaciÃ³n de contraseÃ±a y sitios de interÃ©s). Genera cliente en `src/generated/prisma` (ignorado por git). `prisma.config.ts` define `seed: tsx prisma/seed.ts`.

## CORS

Solo permite el frontend dev: `http://localhost:5177`, `http://127.0.0.1:5177` (definido en `src/main.ts`).

## Notas

- **AutenticaciÃ³n de usuario Ãºnico:** `AuthGuard` valida tokens Bearer para todas las rutas privadas. El BFF usa `INTERNAL_API_KEY` para el salto interno despuÃ©s de validar el token de usuario.
- Puppeteer usa Chromium. En CI o entornos sin GUI puede requerir flags extra; aquÃ­ se usa headless.
- El cÃ³digo es un **port a TypeScript** desde una versiÃ³n Electron: hay referencias a `electron/priceScraper.cjs`, `electron/imageSearch.cjs`, `electron/launchboxMetadata.cjs`, `electron/urlResolver.cjs`.
- `src/generated/` estÃ¡ en `.gitignore` (cliente Prisma generado).
- Licencia: `UNLICENSED` (propietario).
