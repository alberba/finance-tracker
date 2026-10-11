# Arquitectura frontend

Esta app combina Astro, Vue, Tailwind y TypeScript. El objetivo es que cada capa tenga una responsabilidad clara y que el flujo de datos sea facil de seguir.

## Capas

- Astro renderiza el shell, rutas, secciones estaticas y markup que no necesita reactividad propia.
- `FinanceTrackerShell.astro` solo compone layout, sidebar y secciones; la navegacion vive en componentes de `src/components/layout`.
- Vue se usa para islas interactivas con estado local o UI compleja, siempre con Composition API y composables.
- Tailwind aporta las utilidades de la plantilla, con los tokens de `@theme` en `src/styles/global.css`. Lo que se repite entre ficheros se convierte en componente base (ADR 0004 y la nota `docs/architecture/estilos-tailwind-vs-css.md`).
- `src/styles/global.css` es la única hoja de estilos: tokens, reset, tipografía base y las variantes del shell. La hoja heredada desapareció en la 2.0.0 y `tests/unit/styles-guards.test.ts` impide recrearla.
- Las secciones son componentes Vue (`src/components/sections/*Section.vue`) que monta `FinanceWorkspace.vue`. `src/scripts/app.ts` ya no pinta secciones: la app autenticada hidrata desde sync-v2; la persistencia local y el watcher corresponden al demo aislado; el script también lleva la navegación lateral.

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
