# Arquitectura frontend

Esta app combina Astro, Vue, Tailwind y TypeScript. El objetivo es que cada capa tenga una responsabilidad clara y que el flujo de datos sea facil de seguir.

## Capas

- Astro renderiza el shell, rutas, secciones estaticas y markup que no necesita reactividad propia.
- `FinanceTrackerShell.astro` solo compone layout, sidebar y secciones; la navegacion vive en componentes de `src/components/layout`.
- Vue se usa para islas interactivas con estado local o UI compleja, siempre con Composition API y composables.
- Tailwind aporta las utilidades de la plantilla, con los tokens de `@theme` en `src/styles/global.css`. Lo que se repite entre ficheros se convierte en componente base (ADR 0004 y la nota `docs/architecture/estilos-tailwind-vs-css.md`).
- `src/styles/legacy.css` está congelada en la capa `legacy`, por debajo de Tailwind, y se vacía por zonas hasta desaparecer.
- `src/scripts/app.ts` mantiene el runtime imperativo legacy hasta que las secciones puedan migrarse por dominio.

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

Pinia no es obligatorio mientras Vue solo consuma una parte del estado global legacy. Se introducira cuando el estado reactivo sea compartido por varias islas Vue o cuando una seccion completa pase a Vue y necesite acciones, getters y persistencia tipadas.

Hasta entonces, el patron preferido es:

1. Runtime legacy publica snapshots o acciones desde adaptadores.
2. Composables Vue encapsulan esos adaptadores.
3. Componentes Vue consumen composables y renderizan sin conocer el bus global.

## Verificacion

- Cambios funcionales de frontend deben tener cobertura E2E nueva o actualizada.
- Refactors sin cambio visible deben mantener al menos `pnpm check` y lint acotado sobre archivos tocados.
- Si se toca una interaccion existente, ejecutar la spec E2E que la cubre.
