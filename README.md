# Finance Tracker (Astro + pnpm)

Tracker financiero web para presupuestos, patrimonio, inversiones y objetivos.

## Qué incluye

- Dashboard mensual/anual (ingresos, gastos, inversión, patrimonio, crecimiento)
- Registro de movimientos por mes (ingreso/gasto/inversión)
- Presupuesto por categoría y comparación contra real
- Patrimonio total con snapshots mensuales (liquidez, inversión, pasivos)
- Módulo de inversión con distribución de activos y aportes
- Objetivos con barra de progreso y ritmo mensual necesario
- Configuración editable de cuentas, activos y categorías
- Exportación/importación JSON + exportación CSV de movimientos
- Persistencia local en `localStorage` + backend (`/api/state`) para mantener datos entre sesiones/dispositivos
- Cotizaciones server-side para instrumentos configurados y movimientos recurrentes con revisión explícita

## Estructura principal

- `src/pages/index.astro`: página principal de Astro
- `src/scripts/app.ts`: runtime del tracker (TypeScript)
- `src/lib/finance-core.ts`: lógica financiera tipada (TypeScript)
- `src/data/seed.json`: datos semilla sintéticos y neutros
- `src/data/seed.ts`: wrapper TypeScript para importar el seed desde cliente y servidor
- `src/styles/global.css`: entrada global de Tailwind y estilos de la app
- `src/styles/legacy.css`: estilos legacy globales pendientes de migracion gradual
- `scripts/extract_excel_seed.py`: script para regenerar el seed desde un `.xlsx`

## Ejecutar en local (Astro)

```bash
pnpm install
pnpm setup:worktree
pnpm dev
```

`pnpm setup:worktree` crea `.dev.vars` (con el atajo de autenticación de test) y aplica las
migraciones D1 locales de v1 y v2. Sirve igual en el checkout principal que en un worktree.

En local no hay Cloudflare Access: `http://localhost:4321` carga, pero sus llamadas a `/api/*`
responden 401 («Falta la cabecera Cf-Access-Jwt-Assertion»). Para entrar:

- `http://localhost:4321/?demo=1`: la demo con datos sintéticos.
- Con la cabecera `X-Test-User-Email: legacy-owner@e2e.test`: tus datos locales, como en los E2E.
  Por ejemplo, `agent-browser open http://localhost:4321 --headers '{"X-Test-User-Email":"legacy-owner@e2e.test"}'`.

### Mercado y reglas recurrentes

Configura instrumentos desde `Configuración`. La ruta `/api/market/quotes` consulta el proveedor en el servidor, mantiene la última cotización válida como fallback y usa Cache API en Cloudflare cuando está disponible. Define las claves como secretos, nunca en el navegador:

```bash
wrangler secret put TWELVE_DATA_API_KEY
wrangler secret put COINGECKO_API_KEY
```

`MARKET_DATA_PROVIDER`, `MARKET_QUOTE_STALE_MINUTES` y `MARKET_QUOTE_CACHE_SECONDS` son variables públicas de runtime definidas en `wrangler.toml`. La caché local está en 300 segundos para no consumir créditos innecesariamente en el plan gratuito. Los vencimientos de reglas se generan al abrir la aplicación y permanecen fuera de balances hasta confirmarlos.

Para probarlo en local, ejecuta `pnpm setup:worktree`, añade `TWELVE_DATA_API_KEY` a `.dev.vars` y arranca `pnpm dev`.

Twelve Data documenta el endpoint `/quote` y permite autenticarlo con la clave de API. Yahoo Finance está disponible como proveedor sin clave para símbolos como `AGED.MI`, pero su endpoint de gráficos no es una API pública oficial y puede responder con HTTP 429. Las peticiones se cachean, se deduplican y, cuando Yahoo está limitado, los instrumentos Yahoo usan Twelve Data como respaldo si `TWELVE_DATA_API_KEY` está configurada. La búsqueda de símbolos aplica el mismo respaldo. CoinGecko puede quedar como respaldo opcional para cripto. [Documentación de Twelve Data](https://twelvedata.com/docs/advanced/api-usage) · [Chart de Yahoo Finance](https://query1.finance.yahoo.com/v8/finance/chart/AGED.MI?range=5d&interval=1d) · [Simple Price de CoinGecko](https://docs.coingecko.com/reference/simple-price)

Para una clave CoinGecko Demo usa `COINGECKO_API_PLAN=demo`; para una clave Pro usa `COINGECKO_API_PLAN=pro`. Los instrumentos existentes se pueden cambiar de proveedor desde Configuración.

El campo editable `Títulos` de `Valoración actual de cartera` fija el saldo real en ese momento; los movimientos anteriores quedan fuera y las compras y ventas posteriores de ese símbolo actualizan automáticamente la tenencia, sin crear movimientos históricos ficticios.

Para producción en Cloudflare, configura las claves como secretos:

```bash
wrangler secret put TWELVE_DATA_API_KEY
wrangler secret put COINGECKO_API_KEY
```

## Deploy en Cloudflare Workers + D1

### 1) Configuración D1

`wrangler.toml` declara dos bases D1, cada una con su carpeta de migraciones:

| Binding | Base | Migraciones | Contenido |
|---|---|---|---|
| `finance_tracker_db_v2` | `finance-tracker-db-v2` | `migrations-v2/` | Modelo relacional (*sync v2*), el que usa la app |
| `finance_tracker_db` | `finance-tracker-db` | `migrations/` | Blob legacy v1 |

Al cambiar `src/db/schema/`, la migración v2 se escribe a mano en `migrations-v2/` con el siguiente número libre (`meta/` solo guarda el snapshot inicial de Drizzle); wrangler las aplica por orden de nombre.

Aplicar migraciones:

```bash
pnpm d1:migrate:local:v2    # v2, local
pnpm d1:migrate:remote:v2   # v2, producción
pnpm d1:migrate:local       # v1, local
pnpm d1:migrate:remote      # v1, producción
```

Si cambias `wrangler.toml`, regenera tipos:

```bash
pnpm cf:types
```

### 2) Build/Deploy con Workers Builds

El deploy lo hace **Workers Builds** (integración Git del Worker `finance-tracker`),
no GitHub Actions. Configuración en el dashboard (Workers → finance-tracker →
Settings → Build):

| Campo | Valor |
|---|---|
| Build command | `pnpm build` |
| Deploy command | `pnpm deploy:cf` |
| Production branch | `main` |

`pnpm deploy:cf` usa `--config dist/server/wrangler.json`: el adapter de Astro
genera ese fichero en el build a partir de `wrangler.toml`, y es el que lleva
`main`, `assets` y los bindings. El `wrangler.toml` de raíz ahora sí declara
`main` (la entrada de Sentry, que el build compila a `dist/server/entry.mjs`) y
las `[vars]`; `assets` y los bindings se materializan en ese fichero generado,
que sigue siendo el que se despliega.

A diferencia de Pages, aquí **los bindings y las `[vars]` de `wrangler.toml`
son la fuente de verdad en runtime**: se aplican en cada deploy. Los secretos
(`DATA_ENCRYPTION_KEY`, `TWELVE_DATA_API_KEY`, …) siguen viviendo en
`wrangler secret put` y no se tocan en el deploy.

`PUBLIC_SYNC_V2=true` viene de `.env.production` (versionado), así que no hay
que declararlo como variable de build.

Toolchain del build: `.node-version` (24.16.0) y el campo `packageManager` de
`package.json` fijan Node y pnpm para Workers Builds. El CI usa la rama Node 24.

El deploy ocurre en el push a `main`, **en paralelo al CI y sin esperarlo**: si
los E2E fallan, el deploy sale igual. Compensación aceptada a cambio de
latencia de deploy.

### 3) Proteger acceso con Cloudflare Access

- Crear app Access tipo **Self-hosted** sobre tu dominio de producción (`*.workers.dev` o custom).
- Política `Allow` solo para tu email (OTP por email).
- Sin reglas `Allow` adicionales (deny implícito al resto).

## Validación

```bash
pnpm build
pnpm astro check
```

## Sentry

Los errores llegan a Sentry por dos caminos independientes:

- Cliente: `@sentry/astro` inyecta `sentry.client.config.js`. La pieza
  compartida de cliente (`src/lib/client/error-reporting.ts`) marca cada fallo
  de API que no provocó quien usa la app con `api.endpoint` (sin query string),
  `api.category` y `api.status`.
- Servidor: `wrangler.toml` apunta `main` a `sentry.server.config.ts`, que
  envuelve el handler de `@astrojs/cloudflare` con `Sentry.withSentry()` de
  `@sentry/cloudflare`. `withApiErrorHandling`
  (`src/lib/server/api-auth.ts`) marca los fallos de ruta no controlados con
  `api.route` y `http.response.status_code`.

La entrada del Worker se cablea a mano en lugar de apoyarse en la integración de
`@sentry/astro` (que en `astro.config.ts` queda con `server: false`): con
`@astrojs/cloudflare` v14 esa integración ya no aplica su envoltorio automático
a la entrada emitida
([getsentry/sentry-javascript#21901](https://github.com/getsentry/sentry-javascript/issues/21901)),
así que el Worker se desplegaría con Sentry del lado servidor desactivado en
silencio.

El DSN vive en `[vars] SENTRY_DSN` de `wrangler.toml` y no es un secreto: el
mismo valor ya viaja en el bundle de cliente.

Contrato de privacidad: con `dataCollection.userInfo` desactivado y sin cuerpos
HTTP en ninguno de los dos SDK —y con la integración `Console` fuera del SDK
del servidor, así sus eventos tampoco llevan los argumentos de `console.*`—,
ningún evento lleva credenciales, cuerpos de petición ni datos financieros; los
eventos de servidor llevan solo nuestros tags (`api.route` y
`http.response.status_code`) y la excepción, cuyo mensaje nunca repite el cuerpo
de una respuesta de proveedor aunque su stack sí viaje.

## Testing (Vitest + Playwright)

```bash
# Bucle local rápido: unitarias, componentes e integración
pnpm test

# Capas individuales
pnpm test:unit
pnpm test:component
pnpm test:integration

# Coverage conjunto
pnpm test:coverage

# Instalar navegador E2E (una vez)
pnpm test:e2e:install

# E2E tests
pnpm test:e2e

# Smoke rápido durante desarrollo
pnpm test:e2e:smoke

# Regresión visual y sincronización v2
pnpm test:e2e:visual
pnpm test:e2e:sync-v2
```

Estructura de tests:

- `src/lib/finance-core.ts`: lógica financiera pura (unit testing)
- `tests/unit/finance-core.test.ts`: pruebas unitarias de cálculos
- `tests/component/`: contratos y estados visibles de componentes Vue
- `tests/integration/`: repositorios, migraciones y SQLite real
- `tests/e2e/pages/FinanceTrackerPage.ts`: Page Object Model
- `tests/e2e/finance-tracker.spec.ts`: flujos E2E principales
- `playwright.config.ts`: configuración de E2E y `webServer`

La estrategia de Vitest y sus comandos están documentados en
[`docs/testing.md`](docs/testing.md). La configuración y el diagnóstico de los
flujos de navegador están en [`docs/playwright.md`](docs/playwright.md).

## Reportes web y automatización opcional

Este repo permite enviar reportes desde la web y convertirlos en issues de GitHub:

1. Desde la sección **Reportes** puedes enviar un reporte (`error` o `mejora`).
2. El backend crea una issue en GitHub con labels base:
   - `source:web-report`
   - `status:triage`
   - `bug` o `feature`
3. El backend intenta asignar también el tipo estructurado de GitHub (`Bug` o `Feature`).
   Si el repositorio no lo admite, la issue se crea igualmente con sus labels.
4. Si activas la automatización opcional, el reporte añade mención `@claude` y se activa:
   - `.github/workflows/issue-enrich-claude.yml` (Haiku): enriquece la issue.
   - `.github/workflows/issue-fix-claude.yml` (Sonnet): intenta resolver y abrir PR.

### Variables y secrets requeridos

En Cloudflare runtime (`locals.runtime.env`):

- `GITHUB_ISSUE_TOKEN` o `GITHUB_TOKEN`
- `GITHUB_OWNER`
- `GITHUB_REPO`

En GitHub Actions:

- `ANTHROPIC_API_KEY`
- `GITHUB_ISSUE_TOKEN` (opcional si no quieres usar `GITHUB_TOKEN` para PR)

Opcional (GitHub Variables):

- `CLAUDE_HAIKU_MODEL`
- `CLAUDE_SONNET_MODEL`

### Labels recomendadas en GitHub

- `source:web-report`, `status:triage`
- `bug`, `feature`
- `priority:low`, `priority:med`, `priority:high`
- `area:frontend`, `area:backend`, `area:infra`, `area:data`
- `enriched:haiku`
- `autofix-attempted`, `autofix-opened-pr`, `autofix-nochange`, `autofix-failed`, `autofix:skip`

## Extraer datos desde Excel para uso local

```bash
python3 scripts/extract_excel_seed.py \
  --input "/ruta/al/archivo.xlsx" \
  --output "/tmp/finance-seed.json"
```

El resultado puede contener información financiera sensible. No sustituyas con
él `src/data/seed.json` ni lo añadas al repositorio.
