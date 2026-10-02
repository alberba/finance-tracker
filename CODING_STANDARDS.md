# Estándares de código

Las reglas que debe cumplir el código de este repo, reunidas en un solo sitio. Es la fuente que
revisa el eje **Standards** de `/code-review`, y la lista contra la que se contrasta un diff.

Los documentos de `docs/` siguen siendo la narrativa y el porqué: `docs/architecture/frontend.md`
explica las capas, `docs/testing.md` la estrategia de Vitest y `docs/playwright.md` la suite de
navegador. Este fichero extrae de ellos lo que es una **regla**. Si alguno contradice a este, es
deriva que hay que corregir, no una excepción: manda este fichero y se actualiza el otro.

## Lo que ya aplica el tooling

No revises a mano nada de esto; falla solo en CI.

- Formato: `.prettierrc` (sin punto y coma, comillas simples, ancho 100, `trailingComma: all`).
- Lint: `eslint.config.ts` (TypeScript, Vue, Astro, CSS con tokens Tailwind 4).
- Tipos: `pnpm check` (`astro check`).

Una observación de revisión sobre comillas, indentación o import order es ruido.

## Arquitectura frontend

Fuente: `docs/architecture/frontend.md`.

- Astro renderiza shell, rutas y markup sin reactividad propia. Vue queda para islas interactivas,
  siempre con Composition API y composables.
- `FinanceTrackerShell.astro` solo compone layout, sidebar y secciones. La navegación vive en
  `src/components/layout`.
- Una isla Vue no habla directamente con `window` salvo dentro de un adaptador o composable dedicado.
- Los componentes Vue reciben datos por props/composables y emiten acciones explícitas. No leen el
  bus global.
- La lista de secciones navegables vive en `src/config/app-sections.ts`. No se duplican labels ni
  orden en el shell.
- El comportamiento global del shell vive en `src/scripts`, no en bloques inline grandes dentro de
  Astro. Solo queda inline lo crítico antes del primer render, como la selección inicial del tema.
- Las dependencias cliente entran por npm y Vite. Nada de CDN en el shell salvo recursos externos
  inevitables, como fuentes.
- Tailwind entra por `src/styles/global.css` con `@import "tailwindcss"` y el plugin Vite
  `@tailwindcss/vite`.
- `src/styles/legacy.css` se migra por zona tocada. No se reescribe en masa sin cobertura visual.
- Los datos semilla generados desde Excel viven en `src/data/seed.json`; `src/data/seed.ts` es solo
  un wrapper tipado. No se versionan payloads generados como TypeScript largo.

## Tests

Fuente: `docs/testing.md`.

- Tres capas, cada una en su sitio: `tests/unit/` (Node, dominio/servicios/stores/utilidades puras),
  `tests/component/` (happy-dom, props/eventos/estados visibles de componentes Vue),
  `tests/integration/` (Node + SQLite real, repositorios/migraciones/restricciones/aislamiento).
- Prueba la regla en la capa más baja que pueda representarla de forma fiable.
- Un test falla por una sola razón observable.
- Datos y nombres deterministas. Nada que dependa del orden global de la suite.
- Mockea límites externos, no la unidad que intentas validar.
- Una regresión corregida incluye el test que la reproduce.
- No subas timeouts ni workers para tapar una carrera: corrige el aislamiento.
- Los umbrales de coverage representan el mínimo actual y suben con código nuevo. No se excluyen
  módulos para mejorar el porcentaje.

## E2E

Fuente: `docs/playwright.md`.

- Cada prueba recibe un namespace único y no comparte estado con otras.
- La navegación espera `html[data-finance-ready="true"]`, no un tiempo.
- Nunca `waitForTimeout`: espera una respuesta, una URL, un locator o una señal explícita de la app.
- `@smoke` marca recorridos críticos; `@visual` corre como gate independiente.
- Los snapshots Linux se actualizan a mano tras revisar el resultado:
  `pnpm test:e2e:visual --update-snapshots`.

## Verificación de un cambio

Fuente: `docs/architecture/frontend.md`.

- Un cambio funcional de frontend lleva cobertura E2E nueva o actualizada.
- Un refactor sin cambio visible mantiene al menos `pnpm check` y lint acotado a los ficheros
  tocados.
- Si tocas una interacción existente, ejecuta la spec E2E que la cubre.

## Baseline de smells

Por encima de lo anterior, una revisión marca los smells de Fowler (_Refactoring_, cap. 3):
nombre misterioso, código duplicado, envidia de funcionalidad, grupos de datos, obsesión por
primitivos, switches repetidos, cirugía a escopeta, cambio divergente, generalidad especulativa,
cadenas de mensajes, intermediario, herencia rechazada.

Son siempre juicios, nunca violaciones duras, y **una regla documentada aquí gana al baseline**.
