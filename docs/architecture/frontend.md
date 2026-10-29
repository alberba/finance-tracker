# Arquitectura frontend

Esta app combina Astro, Vue, Tailwind y TypeScript. El objetivo es que cada capa tenga una responsabilidad clara y que el flujo de datos sea facil de seguir.

## Capas

- Astro renderiza el shell, rutas, secciones estaticas y markup que no necesita reactividad propia.
- `FinanceTrackerShell.astro` solo compone layout, sidebar y secciones; la navegacion vive en componentes de `src/components/layout`.
- Vue se usa para islas interactivas con estado local o UI compleja, siempre con Composition API y composables.
- Tailwind aporta las utilidades de la plantilla, con los tokens de `@theme` en `src/styles/global.css`. Lo que se repite entre ficheros se convierte en componente base (ADR 0004).
- `src/styles/global.css` es la única hoja de estilos: tokens, reset, tipografía base y las variantes del shell. La hoja heredada desapareció en la 2.0.0 y `tests/unit/styles-guards.test.ts` impide recrearla.
- Las secciones son componentes Vue (`src/components/sections/*Section.vue`); el mapa siguiente distingue su montaje, el arranque y la navegación.

## Puntos de entrada por responsabilidad

| Cambio                                          | Dónde empezar                                                                                               |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Montaje de secciones                            | `src/components/FinanceWorkspace.vue`; layout en `src/components/FinanceTrackerShell.astro`.                |
| Arranque y sesión del cliente                   | `src/scripts/app.ts`: inicia sync autenticado o persistencia local del demo y publica `data-finance-ready`. |
| Navegar desde Vue                               | `src/composables/useSectionNavigation.ts`.                                                                  |
| Clicks del shell y atrás/adelante               | `src/scripts/app/shell-navigation.ts`.                                                                      |
| Convertir rutas a secciones                     | `src/scripts/app/dashboard-section-routing.ts`.                                                             |
| Año, mes y rango del dashboard                  | `src/stores/dashboard.ts`; mes y sección activa en `src/stores/ui.ts`.                                      |
| Edición y cálculos de Presupuesto               | [Guía de Presupuesto](../context/tabs/presupuesto.md).                                                      |
| Persistencia autenticada y recuperación offline | [Sync v2](sync-v2.md).                                                                                      |
| Importación y conexión de Bitvavo               | [Bitvavo](bitvavo.md).                                                                                      |

## Secciones: nombre en la UI → ficheros

El `id` y la etiqueta salen de `src/config/app-sections.ts`. El código usa el `id` en inglés; «Resumen» no es una sección: es una pestaña de Inversión y un bloque de Presupuesto.

| UI (`id`)                    | Componente en `src/components/sections/` | Componentes, dominio y store                                                                                                                     | Tests                                                                                                                       |
| ---------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Dashboard (`dashboard`)      | `DashboardSection.vue`                   | `components/dashboard`, `components/charts`; `domain/dashboard`; `stores/dashboard.ts`                                                           | `unit/dashboard-view-model`; `e2e/dashboard-section`, `e2e/dashboard-flows`                                                 |
| Movimientos (`transactions`) | `TransactionsSection.vue`                | `components/transactions`, `components/recurring`; `domain/transactions`, `domain/subscriptions`, `domain/monthly-report`; `stores/movements.ts` | `unit/transactions-registry`, `unit/subscriptions`, `unit/monthly-report-*`; `e2e/movement-commands`, `e2e/finance-tracker` |
| Presupuesto (`budget`)       | `BudgetSection.vue`                      | `components/budget`; `domain/budget`; `stores/budget.ts`                                                                                         | [Guía de Presupuesto](../context/tabs/presupuesto.md)                                                                       |
| Patrimonio (`wealth`)        | `WealthSection.vue`                      | `components/wealth`; `domain/wealth`; `stores/wealth.ts`                                                                                         | `unit/wealth-view-model`; `component/WealthCalcPanel`; `e2e/wealth`                                                         |
| Inversión (`investment`)     | `InvestmentSection.vue`                  | `components/investment`; `domain/investment`, `domain/stockevents`; `stores/investment.ts`, `market.ts`, `stockevents.ts`                        | `unit/investment-*`; `e2e/investment-*`, `e2e/contribution-*`                                                               |
| Objetivos (`goals`)          | `GoalsSection.vue`                       | `components/goals`; `domain/goals`; `stores/goals.ts`                                                                                            | `unit/goals-view-model`; `e2e/goals`                                                                                        |
| Configuración (`settings`)   | `SettingsSection.vue`                    | `components/settings`; `domain/settings`; `stores/settings.ts`, `recurring.ts`                                                                   | `unit/settings-view-model`; `e2e/settings`                                                                                  |
| Datos (`data`)               | `DataSection.vue`                        | `domain/data`; `stores/data.ts`                                                                                                                  | `unit/data-store-*`; `e2e/data`                                                                                             |

Rutas de tests relativas a `tests/`.

**Reportes no es una sección.** El lanzador `components/reports/GlobalReportLauncher.vue` abre el
panel de alta, pero el seguimiento vive en la página `/reportes` (fuera de `APP_SECTIONS`):
`FinanceTrackerShell` recibe `page="reports"`, `FinanceWorkspace` monta
`components/reports/ReportsPage.vue` en lugar de la sección y `stores/ui.ts` guarda
`page: 'section' | 'reports'`. Ver la [guía de reportes](../context/tabs/reportes.md).

El informe mensual tampoco es una sección ni una página: «Exportar» en los filtros de Movimientos abre `components/transactions/MonthlyReportPanel.vue`. El periodo se filtra por la fecha del movimiento, no por el mes contable, y hereda la búsqueda, el tipo y la cuenta del registro, pero no el año. El PDF lo construye `domain/monthly-report/pdf-document.ts` y lo genera `lib/client/monthly-report-pdf.ts` con pdfmake y las fuentes de `assets/fonts/report`, cargados al descargar y precargados por el service worker ([ADR 0009](../adr/0009-el-informe-es-un-pdf-generado-en-el-cliente-con-pdfmake.md)).

## Reglas de integracion

- Una isla Vue no debe hablar directamente con `window` salvo dentro de un adaptador o composable dedicado.
- Los componentes Vue deben recibir datos via props/composables y emitir acciones explicitas.
- La lista de secciones navegables vive en `src/config/app-sections.ts`; no se duplican labels ni orden en el shell.
- Los scripts de comportamiento global del shell viven en `src/scripts`, no en bloques inline grandes dentro de Astro.
- Solo se mantiene inline el codigo critico necesario antes del primer render, como la seleccion inicial del tema.
- Las dependencias cliente deben entrar por npm y Vite. Evitar CDN en el shell salvo recursos externos inevitables, como fuentes.
- Tailwind debe entrar por `src/styles/global.css` con `@import "tailwindcss"` y por el plugin Vite `@tailwindcss/vite`.
- Los estilos globales existentes se migran por zona tocada, evitando reescrituras masivas sin cobertura visual.

## Datos semilla

- Los datos generados desde Excel viven en `src/data/seed.json`.
- `src/data/seed.ts` es solo un wrapper tipado para mantener imports estables desde runtime cliente y servidor.
- El extractor debe regenerar JSON cuando el volumen de datos sea grande; no conviene versionar payloads generados como TypeScript largo.

## Store compartido

Pinia es la fuente de verdad del estado en cliente. `useFinancialStateStore` (`src/stores/financial-state.ts`) guarda el estado completo, y cada sección sigue el mismo patrón:

1. Selectores puros en `src/domain/<sección>/view-model.ts`.
2. Un store en `src/stores/<sección>.ts` que expone el view-model como `computed` sobre `useFinancialStateStore().state` y muta con `financialStateStore.commitState((draft) => …)`.
3. El componente de la sección lee el store con `storeToRefs` y emite acciones explícitas.

Es una guía para organizar estado y comportamiento de sección, no una obligación de añadir las tres
capas a cada operación. Una acción sencilla puede vivir donde ya se entiende y modifica ese estado;
un composable o adaptador se justifica cuando asume una responsabilidad propia, como gestionar el
ciclo de vida de una integración o traducir la navegación del navegador. Pasar una llamada a otro
archivo o cambiar el nombre de sus métodos no crea por sí solo esa responsabilidad.

## Verificacion

- Cambios funcionales de frontend deben tener cobertura E2E nueva o actualizada.
- Refactors sin cambio visible deben mantener al menos `pnpm check` y lint acotado sobre archivos tocados.
- Si se toca una interaccion existente, ejecutar la spec E2E que la cubre.
