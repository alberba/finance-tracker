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
- Persistencia local en `localStorage`

## Estructura principal

- `src/pages/index.astro`: página principal de Astro
- `src/scripts/app.ts`: runtime del tracker (TypeScript)
- `src/lib/finance-core.ts`: lógica financiera tipada (TypeScript)
- `src/data/seed.ts`: datos semilla extraídos de tu Excel (TypeScript)
- `public/styles.css`: estilos
- `scripts/extract_excel_seed.py`: script para regenerar el seed desde un `.xlsx`

## Ejecutar en local (Astro)

```bash
cd /home/albert/proyectos/finance-tracker
pnpm install
pnpm dev
```

Luego abre `http://localhost:4321`.

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

## Regenerar datos semilla desde Excel

```bash
python3 scripts/extract_excel_seed.py \
  --input "/home/albert/Descargas/FINANZAS PERSONALES 2026.xlsx" \
  --output "src/data/seed.ts"
```
