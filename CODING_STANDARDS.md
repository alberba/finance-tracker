# Estándares de código

Las reglas que debe cumplir el código de este repo, reunidas en un solo sitio. Es la fuente que
revisa el eje **Standards** de `/code-review`, y la lista contra la que se contrasta un diff.

Los documentos de `docs/` siguen siendo la narrativa y el porqué: `docs/architecture/frontend.md`
explica las capas y los ADR, las decisiones. Este fichero extrae de ellos lo que es una **regla**.
Si alguno contradice a este, es deriva que hay que corregir, no una excepción: manda este fichero y se actualiza el otro.

## Lo que ya aplica el tooling

No revises a mano nada de esto; falla solo en CI.

- Formato: `.prettierrc` (sin punto y coma, comillas simples, ancho 100, `trailingComma: all`).
  Ningún gate lo comprueba y parte del repo está sin formatear: el diff formatea solo los ficheros
  que toca (`bunx prettier --write <rutas>`), nunca un directorio entero.
- Lint: `eslint.config.ts` (TypeScript, Vue, Astro, CSS con tokens Tailwind 4, también en los
  bloques `<style>` de Vue).
- Tipos: `bun run check` (`astro check` + `vue-tsc --noEmit`, incluidos los SFC Vue).

Una observación de revisión sobre comillas, indentación o import order es ruido.

## Arquitectura frontend

Fuente: `docs/architecture/frontend.md`.

- Astro renderiza shell, rutas y markup sin reactividad propia. Vue queda para islas interactivas,
  con Composition API. El patrón por sección de `docs/architecture/frontend.md` orienta la
  organización; un composable o adaptador debe tener una responsabilidad propia, como gestionar
  ciclo de vida o traducir una integración. Delegar una llamada o renombrar métodos, por sí solo,
  no justifica otra capa.
- `src/neon/app/AppShell.astro` solo compone documento, marco y secciones. El marco y la navegación
  viven en `src/neon/layout`.
- Una isla Vue no habla directamente con `window` salvo dentro de un adaptador o composable dedicado.
- Los componentes Vue reciben datos por props/composables y emiten acciones explícitas. No leen el
  bus global.
- La lista de secciones navegables vive en `src/config/app-sections.ts`. No se duplican labels ni
  orden en el shell.
- El comportamiento global del shell vive en `src/scripts`, no en bloques inline grandes dentro de
  Astro. Solo queda inline lo crítico antes del primer render, como la selección inicial del tema.
- Las dependencias cliente entran por npm y Vite. Nada de CDN en el shell: las fuentes
  autoalojadas viven en `public/fonts` y se sirven desde el propio dominio.
- Tailwind entra por `src/styles/global.css` con `@import "tailwindcss"` y el plugin Vite
  `@tailwindcss/vite`.
- Los datos semilla generados desde Excel viven en `src/data/seed.json`; `src/data/seed.ts` es solo
  un wrapper tipado. No se versionan payloads generados como TypeScript largo.

## Effect

Fuente: `docs/adr/0006-effect-de-punta-a-punta.md`.

- El código con efectos (E/S, fallo, concurrencia, tiempo) devuelve `Effect<A, E, R>`; no hay
  frontera `Promise` entre módulos. Los errores son `Data.TaggedError` y las dependencias entran
  por `Context.Service` y `Layer`.
- `runPromise` y `runFork` solo aparecen en los bordes: endpoints y middleware de Astro,
  manejadores de eventos de Vue, acciones de Pinia y tests.
- Las funciones puras y síncronas, como `src/domain/**`, no se envuelven en Effect.
- `effect` se fija en versión exacta, sin `^`.

## Estilos

Fuente: `docs/adr/0004-estilos-hibridos-tailwind-y-componentes-base.md`.

- Utilidades Tailwind en la plantilla por defecto, solo con tokens de `@theme` (`bg-panel`,
  `text-gain`, `rounded-card`, `shadow-float`…). Un valor arbitrario (`p-[22px]`, `bg-(--x)`) solo
  cuando no exista token.
- Un estilo que se repite entre ficheros se convierte en componente base. No en clase global ni en
  `@apply`.
- `<style scoped>` solo para animaciones, selectores estructurales o pseudo-elementos,
  `::backdrop`, internos de gráficos o librerías y `v-bind()`. Siempre con variables de tema
  (`var(--…)`) y sin `@apply`.
- El CSS global son dos partes que importa `src/styles/global.css`: `common.css` (fuentes y reset;
  sin tokens) y `src/neon/styles/neon.css` (los tokens de `DESIGN.md`, sus cuatro temas y las
  utilidades que registran). Sin clases, sin hojas nuevas ni capas propias, solo las de Tailwind.
  `tests/unit/styles-guards.test.ts` lo comprueba.
- La interfaz vive en `src/neon/` y manda `DESIGN.md`. El código compartido (`domain`, `lib`,
  `stores`, `config`) no importa de `src/neon/`; lo vigila `scripts/lib/eslint-design-boundary.ts`.
- Los temas van por tokens: los colores de `@theme` se redefinen por tema con `[data-theme]`, que
  fija el script previo al primer pintado. No se usa `prefers-color-scheme` en las plantillas.
- Texto sobre superficie cumple AA (4,5:1) en los cuatro temas. Para ganancias y pérdidas se usan
  `text-gain` / `text-loss`, siempre con signo. Un token de texto nuevo entra en los pares del test
  de contraste.
- Nada de `style="…"` en línea salvo valores de datos dinámicos (anchos de barra, colores de serie).

## Tests y verificación

Las reglas de los tests (Vitest y Playwright) y los comandos para verificar un cambio viven en
[`TESTING_STANDARDS.md`](TESTING_STANDARDS.md); el eje Standards revisa los tests contra ese
fichero.

## Baseline de smells

Por encima de lo anterior, una revisión marca los smells de Fowler (_Refactoring_, cap. 3):
nombre misterioso, código duplicado, envidia de funcionalidad, grupos de datos, obsesión por
primitivos, switches repetidos, cirugía a escopeta, cambio divergente, generalidad especulativa,
cadenas de mensajes, intermediario, herencia rechazada.

Son siempre juicios, nunca violaciones duras, y **una regla documentada aquí gana al baseline**.
