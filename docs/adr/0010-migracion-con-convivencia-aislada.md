# Migración con convivencia aislada

El rediseño «neón de garaje» (épica #419) toca ocho secciones, `/reportes`, el login, el
onboarding, el marco y las hojas compartidas. Hacerlo de golpe no es viable, y hacerlo por partes
sin red tiene dos riesgos: pantallas a medio rehacer sin vuelta atrás, y lo nuevo enredado con lo
antiguo hasta que ya no se puede borrar lo antiguo sin romper algo.

Decidimos migrar con los dos diseños conviviendo, aislados, y borrar el antiguo al final de un
solo golpe:

- **Toggle «Diseño nuevo / antiguo» por cookie.** La cookie la lee el servidor, así que la página
  llega ya con el diseño elegido y sin parpadeo. El interruptor es el mismo en escritorio y móvil;
  desaparece cuando termina la migración. Es una preferencia del navegador, no de la cuenta.
- **Frontera física.** Todo lo nuevo (componentes, secciones, view-models, stores de presentación y
  estilos) vive en `src/neon/`. Lo antiguo se queda donde está, `src/components/` y `src/styles/`,
  y se trata como legacy en bloque.
- **Frontera vigilada por lint.** `pnpm lint` falla si el árbol nuevo importa del antiguo o al
  revés, y si el código compartido (dominio, sync, stores, configuración, libs, tipos) importa de
  cualquiera de los dos. La regla vive en `scripts/lib/eslint-design-boundary.ts`.
- **Puntos de unión con nombre.** Solo cuatro sitios pueden cruzar, y están listados en esa misma
  regla: el _shell_ que elige marco, el _selector_ que monta la versión de cada sección, la
  _decisión de diseño por sección_ y el _toggle_. Un punto de unión nuevo exige una línea en la
  lista y otra en esta ADR.
- **CSS en tres partes.** `common.css` (fuentes, reset y la variante `neon:`, sin tokens),
  `legacy.css` (tokens y `@theme` del diseño antiguo) y `src/neon/styles/neon.css` (tokens nuevos
  con los nombres finales de `DESIGN.md`, todos bajo `[data-ui="neon"]`). `global.css` solo las
  importa, y las nuevas van al final para ganar a los nombres que comparten con el `@theme`
  antiguo. `tests/unit/style-isolation.test.ts` falla si una regla nueva queda fuera del ámbito o
  si lo común define tokens.
- **Código compartido que solo crece.** Un ticket del diseño nuevo puede añadir a `src/domain`,
  `src/lib` o `src/stores`, nunca cambiar lo que ya hay de forma que afecte al diseño antiguo.
- **Diseño antiguo congelado.** Solo recibe correcciones de errores. Las funciones nuevas van al
  diseño nuevo; lo que llegue a `main` mientras tanto en una sección ya migrada se porta también.
- **Borrado final mecánico.** El último ticket borra `src/components/`, `legacy.css`, el toggle, la
  cookie, `data-ui` y la lista de secciones migradas, y simplifica los puntos de unión. Tras
  borrar, tipos, build, lint y tests pasan sin tocar nada de `src/neon/`.

Descartamos una rama larga sin toggle, porque nadie puede volver a lo que funcionaba y la mezcla
final acumula todos los conflictos. Descartamos editar los componentes antiguos en sitio, porque
es justo la mezcla irreversible. Descartamos decidir el diseño por user-agent o por detección de
dispositivo: el marco cambia por ancho de ventana y la cookie elige el diseño, nada más.

Consecuencias que no se ven en el código:

- Un componente se duplica entre árboles en vez de compartirse. Es deliberado: compartirlo ataría
  el diseño antiguo, que hay que borrar, al nuevo. Solo lo que no tiene aspecto (lógica, cálculo,
  formato, tipos) se comparte, y entonces va a código compartido. Ejemplo: el tipo `Tone` salió de
  `components/ui/tone.ts` a `src/lib/tone.ts` porque dos view-models lo usaban.
- Un nombre de token que ya existe en el `@theme` antiguo (`--color-panel`, `--color-line`,
  `--color-accent`, `--color-gain`, `--color-loss`, `--font-*`) se redefine dentro de
  `[data-ui="neon"]`: la utilidad `bg-panel` pinta el valor nuevo ahí y el antiguo en el resto.
  Una utilidad de nombre nuevo (`bg-panel2`) se registra con `@theme` en el primer ticket que la
  use, y el guard exige que ese nombre no exista ya en el diseño antiguo.
- Los dos diseños se distribuyen en el mismo bundle de CSS. Los tokens nuevos pesan unos pocos KB
  y mientras no haya `data-ui` en `<html>` no aplican a nada.
- La ADR [0004](0004-estilos-hibridos-tailwind-y-componentes-base.md) sigue vigente (utilidades en
  la plantilla, componentes base, `scoped` solo estructural) para cada árbol. Solo cambia que el
  CSS global ya no es una hoja, sino tres.
- La regla de lint solo mira imports relativos dentro de `src/`; el proyecto no usa alias de
  rutas. Si se añadiera uno, hay que enseñárselo a la regla.
- Los E2E del diseño antiguo se reducen a una prueba de humo por sección, y los del nuevo prueban
  recorridos, no forma (épica #419).
