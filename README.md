# Finance Tracker (Astro + pnpm)

Tracker financiero web inspirado en tu archivo `FINANZAS PERSONALES 2026.xlsx`.

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

## Estructura principal

- `src/pages/index.astro`: página principal de Astro
- `src/scripts/app.ts`: runtime del tracker (TypeScript)
- `src/lib/finance-core.ts`: lógica financiera tipada (TypeScript)
- `src/data/seed.json`: datos semilla extraidos de tu Excel
- `src/data/seed.ts`: wrapper TypeScript para importar el seed desde cliente y servidor
- `src/styles/global.css`: entrada global de Tailwind y estilos de la app
- `src/styles/legacy.css`: estilos legacy globales pendientes de migracion gradual
- `scripts/extract_excel_seed.py`: script para regenerar el seed desde un `.xlsx`

## Ejecutar en local (Astro)

```bash
cd /home/albert/proyectos/finance-tracker
pnpm install
pnpm dev
```

Luego abre `http://localhost:4321`.

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
# Unit tests con coverage
pnpm test:unit

# Instalar navegador E2E (una vez)
pnpm test:e2e:install

# E2E tests
pnpm test:e2e

# Suite completa
pnpm test
```

Estructura de tests:

- `src/lib/finance-core.ts`: lógica financiera pura (unit testing)
- `tests/unit/finance-core.test.ts`: pruebas unitarias de cálculos
- `tests/e2e/pages/FinanceTrackerPage.ts`: Page Object Model
- `tests/e2e/finance-tracker.spec.ts`: flujos E2E principales
- `playwright.config.ts`: configuración de E2E y `webServer`

## Reportes web y automatización opcional

Este repo permite enviar reportes desde la web y convertirlos en issues de GitHub:

1. Desde la sección **Reportes** puedes enviar un reporte (`error` o `mejora`).
2. El backend crea una issue en GitHub con labels base:
   - `source:web-report`
   - `status:triage`
   - `type:bug` o `type:enhancement`
3. Si activas la automatización opcional, el reporte añade mención `@claude` y se activa:
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
- `type:bug`, `type:enhancement`
- `priority:low`, `priority:med`, `priority:high`
- `area:frontend`, `area:backend`, `area:infra`, `area:data`
- `enriched:haiku`
- `autofix-attempted`, `autofix-opened-pr`, `autofix-nochange`, `autofix-failed`, `autofix:skip`

## Regenerar datos semilla desde Excel

```bash
python3 scripts/extract_excel_seed.py \
  --input "/home/albert/Descargas/FINANZAS PERSONALES 2026.xlsx" \
  --output "src/data/seed.json"
```
