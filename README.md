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
cd /ruta/al/finance-tracker
pnpm install
pnpm dev
```

Luego abre `http://localhost:4321`.

### Mercado y reglas recurrentes

Configura instrumentos desde `Configuración`. La ruta `/api/market/quotes` consulta el proveedor en el servidor, mantiene la última cotización válida como fallback y usa Cache API en Cloudflare cuando está disponible. Define las claves como secretos, nunca en el navegador:

```bash
wrangler secret put TWELVE_DATA_API_KEY
wrangler secret put COINGECKO_API_KEY
```

`MARKET_DATA_PROVIDER`, `MARKET_QUOTE_STALE_MINUTES` y `MARKET_QUOTE_CACHE_SECONDS` son variables públicas de runtime definidas en `wrangler.toml`. La caché local está en 300 segundos para no consumir créditos innecesariamente en el plan gratuito. Los vencimientos de reglas se generan al abrir la aplicación y permanecen fuera de balances hasta confirmarlos.

Para probarlo en local:

```bash
cp .dev.vars.example .dev.vars
# Edita .dev.vars y añade TWELVE_DATA_API_KEY
pnpm dev
```

Twelve Data documenta el endpoint `/quote` y permite autenticarlo con la clave de API. Yahoo Finance está disponible como proveedor sin clave para símbolos como `AGED.MI`, pero su endpoint de gráficos no es una API pública oficial y puede responder con HTTP 429. Las peticiones se cachean, se deduplican y, cuando Yahoo está limitado, los instrumentos Yahoo usan Twelve Data como respaldo si `TWELVE_DATA_API_KEY` está configurada. La búsqueda de símbolos aplica el mismo respaldo. CoinGecko puede quedar como respaldo opcional para cripto. [Documentación de Twelve Data](https://twelvedata.com/docs/advanced/api-usage) · [Chart de Yahoo Finance](https://query1.finance.yahoo.com/v8/finance/chart/AGED.MI?range=5d&interval=1d) · [Simple Price de CoinGecko](https://docs.coingecko.com/reference/simple-price)

Para una clave CoinGecko Demo usa `COINGECKO_API_PLAN=demo`; para una clave Pro usa `COINGECKO_API_PLAN=pro`. Los instrumentos existentes se pueden cambiar de proveedor desde Configuración.

El campo editable `Títulos` de `Valoración actual de cartera` fija el saldo real en ese momento; los movimientos anteriores quedan fuera y las compras y ventas posteriores de ese símbolo actualizan automáticamente la tenencia, sin crear movimientos históricos ficticios.

Para producción en Cloudflare, configura las claves como secretos:

```bash
wrangler secret put TWELVE_DATA_API_KEY
wrangler secret put COINGECKO_API_KEY
```

## Deploy en Cloudflare Pages + D1

### 1) Configuración D1

Este repo ya incluye:

- `wrangler.toml` con binding `finance_tracker_db`
- `migrations/0001_create_app_state.sql`
- `migrations/0002_import_seeded_state.sql` (import de namespaces persistentes)

Aplicar migraciones:

```bash
pnpm d1:migrate:local
pnpm d1:migrate:remote
```

Si cambias `wrangler.toml`, regenera tipos:

```bash
pnpm cf:types
```

### 2) Build/Deploy en Pages

- Build command: `pnpm build`
- Output directory: `dist`
- Binding D1 en Pages: `finance_tracker_db` (mismo nombre que `wrangler.toml`)

### 3) Proteger acceso con Cloudflare Access

- Crear app Access tipo **Self-hosted** sobre tu dominio de producción (`*.pages.dev` o custom).
- Política `Allow` solo para tu email (OTP por email).
- Sin reglas `Allow` adicionales (deny implícito al resto).

## Validación

```bash
pnpm build
pnpm astro check
```

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
