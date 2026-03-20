# Contexto de la pestaña Presupuesto

## Resumen

La pestaña `Presupuesto` muestra el presupuesto anual editable por categoría.
La vista actual está organizada en tres tablas fijas:

- `Ingresos`
- `Gastos`
- `Inversión`

Cada tabla muestra los 12 meses del año en columnas y permite editar el valor presupuestado de cada celda.

Ruta pública:

- `/presupuesto`

Identificadores clave:

- sección raíz: `#budget`
- total anual presupuestado: `#budget-total-planned`
- total anual real: `#budget-total-actual`
- diferencia anual: `#budget-total-diff`
- contenedor de tablas: `#budget-tables`

## Objetivo funcional actual

- Ver todo el presupuesto anual sin cambiar de mes.
- Editar el presupuesto mensual por categoría directamente en la tabla.
- Comparar cada celda con su valor real del mes.
- Mantener separados ingresos, gastos e inversión en tres bloques visuales estables.

## Archivos principales

### UI Astro

- `src/components/sections/BudgetSection.astro`
- `src/components/FinanceTrackerShell.astro`

### Lógica frontend

- `src/scripts/app/dashboard-budget-goals-section.ts`
- `src/scripts/app.ts`
- `src/scripts/app/calculation-helpers.ts`
- `src/scripts/category-emoji.ts`
- `src/scripts/types.ts`
- `src/scripts/state.ts`

### Estilos

- `public/styles.css`

### Tests relacionados

- `tests/e2e/budget.spec.ts`
- `tests/e2e/finance-tracker.spec.ts`
- `tests/e2e/pages/FinanceTrackerPage.ts`

## Estructura de la vista

La pestaña contiene:

1. Cabecera
   - título `Presupuesto`
   - copy explicativo de vista anual
2. KPIs anuales
   - presupuestado anual
   - real anual
   - diferencia anual
3. Tres bloques de tabla
   - `income`
   - `expense`
   - `investment`

Cada fila representa una categoría.
Cada columna mensual contiene:

- input editable del presupuesto
- valor real del mes
- diferencia del mes

La última columna resume el total anual de esa categoría.

## Modelo de datos

El presupuesto se guarda en:

- `state.budget[type][category][month]`

Donde:

- `type` es `income`, `expense` o `investment`
- `category` es el nombre de la categoría
- `month` es índice `0..11`

Los valores reales se calculan desde transacciones con:

- `getCategoryActuals(type, month)`

## Flujo técnico

1. `BudgetSection.astro` define el contenedor de la pestaña.
2. `app.ts` registra referencias DOM y delega la lógica a `setupDashboardBudgetGoalsSection`.
3. `renderBudget()` construye el HTML anual de las tres tablas.
4. Los inputs usan:
   - `data-type`
   - `data-category`
   - `data-month`
5. `bindBudgetEvents()` escucha `input` en `#budget-tables`.
6. Al editar una celda:
   - se actualiza `state.budget[type][category][month]`
   - se persiste con `saveState()`
   - se vuelve a renderizar la vista

## Issue #29: origen de este rediseño

Issue revisada:

- `#29`
- título: `Mejorar vista de Presupuesto`

Petición original:

- dejar de trabajar mes a mes
- ver todos los meses a la vez en columnas
- evitar el selector por tipo y mostrar tres tablas

La implementación actual de `Presupuesto` responde a esa dirección.

## Comportamiento importante

- Los inputs de presupuesto aceptan importes con decimales.
- Los datos se persisten y sobreviven a recargas.
- La diferencia se interpreta distinto según el tipo:
  - `income`: más real que planificado es positivo
  - `expense` e `investment`: más real que planificado es desfavorable

## Riesgos y puntos sensibles

- `renderBudget()` genera bastante HTML; cualquier cambio de estructura puede romper locators E2E.
- Si cambian los atributos `data-type`, `data-category` o `data-month`, hay que actualizar Page Objects y tests.
- La tabla anual depende de scroll horizontal en pantallas estrechas; cualquier cambio visual debe comprobar desktop y móvil.
- La vista usa re-render completo al editar una celda. Si se busca edición muy intensiva, puede merecer una optimización futura.

## Tests que protegen esta pestaña

`tests/e2e/budget.spec.ts` cubre:

- render de las tres tablas anuales
- persistencia de edición por categoría y mes

`tests/e2e/pages/FinanceTrackerPage.ts` expone helpers para:

- editar una celda concreta
- leer una celda concreta

## Checklist para futuros cambios

Antes de tocar esta pestaña, revisar:

1. `src/components/sections/BudgetSection.astro`
2. `src/scripts/app/dashboard-budget-goals-section.ts`
3. `src/scripts/app/calculation-helpers.ts`
4. `src/scripts/state.ts`
5. `public/styles.css`
6. `tests/e2e/budget.spec.ts`
7. `tests/e2e/pages/FinanceTrackerPage.ts`

