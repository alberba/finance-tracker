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
  Ningún gate lo comprueba y parte del repo está sin formatear: el diff formatea solo los ficheros
  que toca (`pnpm exec prettier --write <rutas>`), nunca un directorio entero.
- Lint: `eslint.config.ts` (TypeScript, Vue, Astro, CSS con tokens Tailwind 4, también en los
  bloques `<style>` de Vue).
- Tipos: `pnpm check` (`astro check`).

Una observación de revisión sobre comillas, indentación o import order es ruido.

## Arquitectura frontend

Fuente: `docs/architecture/frontend.md`.

- Astro renderiza shell, rutas y markup sin reactividad propia. Vue queda para islas interactivas,
  con Composition API. El patrón por sección de `docs/architecture/frontend.md` orienta la
  organización; un composable o adaptador debe tener una responsabilidad propia, como gestionar
  ciclo de vida o traducir una integración. Delegar una llamada o renombrar métodos, por sí solo,
  no justifica otra capa.
- `FinanceTrackerShell.astro` solo compone layout, sidebar y secciones. La navegación vive en
  `src/components/layout`.
- Una isla Vue no habla directamente con `window` salvo dentro de un adaptador o composable dedicado.
- Los componentes Vue reciben datos por props/composables y emiten acciones explícitas. No leen el
  bus global.
- La lista de secciones navegables vive en `src/config/app-sections.ts`. No se duplican labels ni
  orden en el shell.
- El comportamiento global del shell vive en `src/scripts`, no en bloques inline grandes dentro de
  Astro. Solo queda inline lo crítico antes del primer render, como la selección inicial del tema.
- Las dependencias cliente entran por npm y Vite. Nada de CDN en el shell: las fuentes (Syne, DM
  Sans y DM Mono) viven en `public/fonts` y se sirven desde el propio dominio.
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
  `text-gain`, `rounded-md`, `shadow-soft`…). Un valor arbitrario (`p-[22px]`, `bg-(--x)`) solo
  cuando no exista token.
- Un estilo que se repite entre ficheros se convierte en componente base. No en clase global ni en
  `@apply`.
- `<style scoped>` solo para animaciones, selectores estructurales o pseudo-elementos,
  `::backdrop`, internos de gráficos o librerías y `v-bind()`. Siempre con variables de tema
  (`var(--…)`) y sin `@apply`.
- El CSS global (`src/styles/global.css`) solo lleva tokens claro y oscuro, reset, tipografía base
  y shell, sin clases. Es la única hoja de estilos: ni hojas nuevas ni capas propias, solo las de
  Tailwind. `tests/unit/styles-guards.test.ts` lo comprueba.
- El tema oscuro va por tokens: los colores de `@theme` apuntan a variables que cambian con
  `[data-theme=dark]`. Cuando haga falta una variante, `dark:` está ligada a ese atributo, no a
  `prefers-color-scheme`.
- Texto sobre superficie cumple AA (4,5:1) en claro y en oscuro. Para ganancias y pérdidas se usan
  `text-gain` / `text-loss`, siempre con signo; `--income` / `--expense` son rellenos. `text-faint`
  es para placeholders y decoración, no para texto que haya que leer. Un token de texto nuevo entra
  en los pares del test de contraste. Los pares heredados por debajo de AA están listados en ese
  test; la lista solo encoge y no admite entradas nuevas.
- Nada de `style="…"` en línea salvo valores de datos dinámicos (anchos de barra, colores de serie).
- Los tests localizan por rol, etiqueta, texto o `data-*`, nunca por clases de estilo.

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

- Cada escenario autenticado usa un usuario aislado, inicializa su espacio por la API y persiste
  mediante sync v2; cada shard de CI tiene su propia D1.
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
