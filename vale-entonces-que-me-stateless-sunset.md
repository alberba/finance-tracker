# Plan: migración completa de estilos a componentes + tokens (toda la app)

## Contexto

El worktree actual intentó "reducir CSS" mal: creó `ui/tailwindClasses.ts` (strings de utilidades
en TS = anti-patrón), tests E2E que solo hacían grep sobre los `.css`, y dejó "soup" de valores
arbitrarios inline/duplicado. Además el repo está *split-brain*: `dashboard/` (15 componentes) ya usa
el patrón profesional (utilidades + componentes tipados + tokens), pero el resto (`sections/`,
`transactions/`, `budget/`, diálogos, sidebar) usa CSS semántico en `legacy.css`.

**Objetivo:** unificar **toda la aplicación** bajo el patrón del `dashboard/` — tokens en `@theme`,
utilidades en el markup, y una librería de primitivos en `ui/` para todo lo repetido. Guía oficial
de Tailwind (reutilizar = componente, no `@apply` ni strings). Resultado: `legacy.css` pasa de
~2206 líneas a una capa pequeña de tokens+resets+keyframes+singletons; el estilo vive en componentes
tipados; diffs pequeños y semánticos.

Superficie real (medida a HEAD): **148 clases de componente**, 35 tokens, ~70 líneas de resets,
**15 ítems irreducibles**, y un set que **debe seguir en JS** (charts, tooltip, descarga, toggles).

## Decisiones tomadas

- **Revertir** el worktree a HEAD antes de empezar. `legacy.css` original es la *spec* de cada estilo.
- **Sin dependencias nuevas.** Variantes con `Record<Variant,string>` + fallthrough de atributos
  (patrón de `DashboardStatCard.vue`). Nada de `cva`/`tailwind-variants`.
- **Una sola convención: utilidades dentro de componentes** (como el dashboard). NO `<style scoped>`.
- **Paridad visual exacta** (es refactor, no rediseño): se conservan valores que no tienen escala
  limpia (`p-[18px]`, `gap-[14px]`) como arbitrarios; escala (`p-4`, `text-sm`) donde calza exacto.
- **Pseudo-elementos** (`kpi-card::after`, bullets, barras de acento) → utilidades `after:`/`before:`
  (Tailwind v4 las expresa: `after:content-[''] after:h-[3px]…`). Solo quedan en CSS los que usan
  `content-[attr(...)]` raros si dan problemas.
- **Se queda en CSS (capa residual mínima):** `@theme` tokens, resets/typography base, `.skip-link`,
  `.bg-layer` (aurora), `@media prefers-reduced-motion`, los 3 `@keyframes`, sticky thead helper,
  `.progress-ring` (conic-gradient), y los **singletons dirigidos por JS**: `.toast`, `.chart-tooltip`,
  `[data-investment-progress-item]`. Forzar estos a utilidades exigiría strings de clases en JS = feo
  y sin valor (no se repiten). Se quedan como CSS pequeño.
- **Sigue imperativo en JS (no se toca):** render de chart.js a canvas (`scripts/charts.ts`),
  posicionado del tooltip (`scripts/app.ts`), descarga de fichero (`stores/data.ts`), toggle de clase
  en `<body>` para sidebar/tema (`scripts/shell.ts`). Los componentes Vue ya envuelven los canvas.
- **Dark mode debe seguir funcionando:** los tokens tienen pares claro/oscuro y hay theme-toggle. Se
  promueven tokens base a `@theme` y se conservan los overrides de tema en su selector. Verificar.

## Fases (ordenadas por valor; verificar tras cada una)

### Fase 0 — Reset + fundación de tokens
- `git checkout -- .`; `rm` de `ui/tailwindClasses.ts`, `tests/e2e/legacy-css-budget.spec.ts`,
  `scripts/inline-tw-consts.mjs`. Baseline limpio (verificar verde).
- Promover los **35 tokens** a `@theme` en `global.css`: `--color-*` (todas las superficies/semánticos/
  marca/texto/ink/line), `--radius-sm/md/lg`, `--shadow-soft/card/raised/pop`, `--font-*` (ya están).
  Esto genera utilidades `bg-primary`, `text-income`, `rounded-lg`, `shadow-soft`…
- Conservar overrides de dark theme en su bloque. Confirmar que el theme-toggle sigue OK.
- Añadir los 3 `@keyframes` como `--animate-*` en `@theme` (`panelIn` ya está) → `animate-*`.

### Fase 1 — Primitivos núcleo (`ui/`)
Crear, mirando `DashboardStatCard.vue` para el estilo:
- **`Button.vue`** — `variant: 'primary'|'secondary'|'danger'`. Atributos por fallthrough. ~20+ usos.
- **`IconButton.vue`** — `variant: 'edit'|'delete'|'save'|'cancel'`, `ariaLabel`, slot icono. (`.icon-btn`,
  `.edit-btn`, `.delete-btn`, `.inline-save/cancel-btn`, `.icon-action-btn`, `.action-icon`).
- **`Card.vue`** — slot-wrapper con utilidades de `.card` (incluye `[&>h3]`,`[&>svg]`). 13+ usos.
- **`KpiCard.vue`** — props `label`, `value`, `tone?: 'good'|'bad'`, `after:` barra acento.
  `BudgetSummaryCard.vue` se reescribe como esto.
- **`ListItem.vue`** + **`Badge.vue`** (`type: income|expense|investment`) + **`Tag.vue`**.

### Fase 2 — Primitivos de formulario y diálogo
- **`Dialog.vue`** — envuelve `<dialog>`; slots `head`/`body`/`actions`; `::backdrop` vía variante
  `backdrop:bg-(--overlay)` + `animate-*`. Base para `TransactionFormDialog`, `ContributionWorkflowDialog`,
  `ContributionDeleteDialog`, `wealth-calc`.
- **`FormField.vue`** — `label`, `type: text|number|date|select|textarea`, soporte prefijo (campo importe
  con símbolo moneda), `:focus-visible` con `--ring`. Cubre los grids de formulario de toda la app.
- **`WarningBanner.vue`** + **`Checkbox.vue`**.

### Fase 3 — Tabla
- **`TableWrap.vue`** — borde/overflow/sticky thead + estilos `th/td` base. `TransactionsTable`,
  `BudgetBlock`, tablas de contribución y `tx-summary` lo usan; el resto (popover de filtro, sort,
  `tx-summary-*`) con utilidades + `IconButton`/`Badge` dentro de cada componente.

### Fase 4 — Migrar áreas (aplicar primitivos, borrar reglas absorbidas de `legacy.css`)
Por área, de mayor a menor valor:
- **4a. Sections + cards/editores:** `sections/*.vue` (Budget, Data, Goals, Investment, Settings,
  Wealth), `budget/BudgetBlock.vue`+`BudgetSummaryCard.vue`, `goals/*`, `settings/EntityEditorCard.vue`+
  `CategoryEditorBlock.vue`. Grids (`dual-grid`,`goal-edit-grid`,`cards-grid slim`,`form-grid`,`mini-form`)
  → utilidades inline.
- **4b. Investment:** subtabs + return-mode toggle (`.is-active` → `:class` reactivo), `InvestmentMovementForm/Tab`,
  `InvestmentContributionsTab`, diálogos de contribución (usar `Dialog`).
- **4c. Transactions:** `TransactionsTable` (filtros/sort/badges/acciones), `TransactionSummary`,
  `TransactionBulkCard`, `TransactionFormDialog` (usar `Dialog`+`FormField`).
- **4d. Reports:** `IssueReportFormCard` (consts locales → `FormField`), `ReportsGuideCard`, `ReportsSection`.
- **4e. Shell/sidebar (último, menor valor):** `layout/AppSidebar.astro`, `SidebarNav.astro`, panel-head/
  kicker, app-shell/content. Es chrome de render único (no repetido); migrar a utilidades pero los
  `::after` de tooltip colapsado / transiciones complejas pueden quedarse como CSS pequeño si no aportan.

### Fase 5 — Capa CSS residual
Tras 4, `legacy.css`/`global.css` deben contener SOLO: `@theme` tokens, resets/typography, `.skip-link`,
`.bg-layer`, `@media prefers-reduced-motion`, `@keyframes`, sticky-thead helper, `.progress-ring`,
`.toast`, `.chart-tooltip`, `[data-investment-progress-item]`. Objetivo: ~300–400 líneas (desde 2367).
Borrar lo que quede sin referencias (grep cada clase antes de eliminar).

## Ficheros clave
- Nuevos en `src/components/ui/`: `Button`, `IconButton`, `Card`, `KpiCard`, `ListItem`, `Badge`, `Tag`,
  `Dialog`, `FormField`, `WarningBanner`, `Checkbox`, `TableWrap`.
- Referencia de convención: `dashboard/DashboardStatCard.vue`, `ui/AppSection.vue`.
- Estilos: `src/styles/global.css` (`@theme`+keyframes+singletons), `src/styles/legacy.css` (encoge a
  tokens+resets; `:root`/dark overrides se quedan).
- NO tocar (imperativo): `scripts/charts.ts`, `scripts/app.ts`, `scripts/shell.ts`, `stores/data.ts`.
- Borrar: `ui/tailwindClasses.ts`, `tests/e2e/legacy-css-budget.spec.ts`, `scripts/inline-tw-consts.mjs`.

## Verificación (tras cada fase + final)
- `pnpm check` (vue-tsc/astro) · `pnpm lint` (eslint+prettier ordena clases) · `pnpm build`.
- `pnpm test:e2e` (Playwright). **Refactor visual: la apariencia NO debe cambiar.** Apoyarse en
  snapshots visuales existentes; los visual-snapshot son flaky (memoria) → reintentar/comparar a mano.
- Manual: `pnpm dev` + screenshots de cada sección (Dashboard, Datos, Presupuesto, Objetivos,
  Inversión, Patrimonio, Transacciones, Ajustes, Reportes) antes/después + **probar el theme-toggle**
  (claro/oscuro) y el colapso de sidebar.
- Antes de borrar cada regla CSS: `grep` de la clase en `src/` para confirmar 0 referencias.
