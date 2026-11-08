# Lenguaje visual del diseño antiguo (v2)

> **Este documento describe el diseño antiguo y está congelado.** Vale para lo que vive en
> `src/components/` y `src/styles/`: se mantiene mientras ese código exista y se borra con él al
> final de la migración ([ADR 0010](../adr/0010-migracion-con-convivencia-aislada.md)). Syne,
> DM Sans y DM Mono son las fuentes de este diseño; **no se usan en código nuevo**. Todo lo nuevo
> (componentes, secciones, tokens, tipografía, temas, marco, responsive) sigue [DESIGN.md](../../DESIGN.md)
> y vive en `src/neon/`.

Referencia para tocar una pantalla del rediseño v2 (épica #211) que todavía no se ha migrado. Los
valores viven en el código; aquí está lo que el código no cuenta: qué piezas hay, cuándo se usa
cada una y las reglas que el usuario ha corregido en lienzos anteriores.

## Qué documento manda en cada árbol

| Árbol                                      | Manda                                                           |
| ------------------------------------------ | --------------------------------------------------------------- |
| `src/neon/` (diseño nuevo)                 | [DESIGN.md](../../DESIGN.md), con ADR 0010 y `CODING_STANDARDS` |
| `src/components/`, `src/styles/` (antiguo) | Este documento, congelado; solo correcciones de errores         |
| Código compartido (`domain`, `lib`, …)     | `CODING_STANDARDS.md` y las ADR; no importa de ningún diseño    |

## Cómo se migra una sección

1. **Parte del lienzo.** El artboard final de la sección, escritorio y móvil por separado, y
   `DESIGN.md` para tokens, piezas y medidas. No copies el aspecto del componente antiguo.
2. **Crea todo en `src/neon/`:** la sección, sus componentes, su view-model y su store de
   presentación. No edites nada de `src/components/` ni de `src/styles/`, ni siquiera «un poco».
3. **Importa solo de lo compartido.** `src/domain`, `src/lib`, `src/stores` de datos,
   `src/config`, tipos. Si necesitas algo que hoy está en el árbol antiguo (como pasó con `Tone`),
   no lo importes: muévelo a código compartido sin cambiar su comportamiento y que lo usen los dos.
   Código compartido solo crece. `pnpm lint` falla ante un import cruzado.
4. **Estila con utilidades y la variante `neon:`.** Los tokens nuevos viven en
   `src/neon/styles/neon.css`, bajo `[data-ui="neon"]`. Una utilidad de nombre nuevo se registra
   con `@theme` en ese mismo ticket, con un nombre que no exista en el diseño antiguo. Ninguna
   regla de CSS nuevo queda fuera del ámbito (`tests/unit/style-isolation.test.ts`).
5. **Monta la sección por los puntos de unión.** Solo el selector de secciones y la decisión de
   diseño por sección saben que hay dos versiones; marca la sección como migrada ahí.
6. **Prueba comportamiento, no forma.** View-models con test unitario; E2E de recorridos contra
   el diseño nuevo. Sin capturas de píxel, sin geometría y sin aserciones de clases o fuentes.
7. **Revisa contra el artboard** en escritorio y móvil, en un tema oscuro y uno claro.

## Fuentes de verdad

- **Tokens:** `src/styles/legacy.css`, claro y oscuro. Se usan como utilidades de `@theme`
  (`bg-panel`, `bg-ink`, `text-gain`, `border-line`, `rounded-md`, `shadow-soft`…), no con hex.
- **Tipografía:** Syne (`font-display`) para títulos y todas las cifras (importes, porcentajes,
  cantidades), siempre con `tabular-nums`; DM Sans (`font-sans`) para el texto; DM Mono
  (`font-mono`) solo para símbolos de activos, kickers y numeración. Las tres se sirven desde
  `public/fonts` (OFL) y se declaran en `src/styles/common.css`. Las cifras salen de
  `src/lib/format.ts`: miles siempre agrupados y signo menos tipográfico (−).
- **Componentes base:** `src/components/ui/`. Cada fichero abre con un comentario que dice cuándo
  usarlo. Un patrón que ya existe ahí no se redibuja con otra forma.
- **Reglas de estilo del código:** ADR 0004 y la sección «Estilos» de `CODING_STANDARDS.md`.
- **Lienzos:** la tabla «Diseños» de #211. **Inversión** (#209) es el lienzo de referencia del
  lenguaje; los demás lo aplican a su contenido.

## Piezas

| Pieza              | Componente                                      | Para qué                                                                      |
| ------------------ | ----------------------------------------------- | ----------------------------------------------------------------------------- |
| Cabecera           | `PageHeader`, `KickerLabel`                     | Kicker en mono, título en Syne, una línea de entradilla                       |
| Franja tinta       | `InkBand`                                       | La cifra titular de la pantalla sobre la superficie oscura                    |
| Cifras             | `FigureStrip`                                   | Cifras resumen separadas por filetes                                          |
| Documento numerado | `DocumentSurface`, `NumberedBlock`              | Bloques «01 Título» con filetes entre ellos                                   |
| Libro mayor        | `LedgerTable`                                   | Listas de datos: cabecera en versalitas, filetes finos, importes a la derecha |
| Panel lateral      | `SidePanel`                                     | Alta y edición; los flujos de varios pasos siguen siendo varios pasos         |
| Navegación interna | `SectionTabs`, `SegmentedControl`, `FilterChip` | Subpestañas, opciones excluyentes, filtros                                    |
| Marcas             | `PillTag`, `StatusDot`, `AllocationBar`         | Operación o divisa, estado, reparto                                           |

## Reglas de diseño

- **Estilo no es estructura.** Se copia el lenguaje (tokens, tipografías, piezas), no la
  maquetación de otro lienzo. Antes del primer artboard, di qué composición sale del contenido de
  la sección (p. ej. Patrimonio: ecuación de balance, cierre de mes, balance por meses).
- **No repetir el Dashboard.** Patrimonio neto con su variación, la evolución del neto y el donut
  de distribución ya están allí. La sección es la pantalla de trabajo de su contenido.
- **Tono de informe financiero.** Cifras, comparaciones en texto, mini-barras neutras y filetes.
  Las tiras de días, las barras de progreso y los marcadores llamativos se leen como un juego.
- **Partir de lo que hay.** Antes de dibujar, lee los componentes actuales de la zona en
  `src/components/<zona>/`, diálogos y asistentes incluidos, para conservar sus pasos y campos.
- Contenido centrado con ancho máximo en pantallas anchas; espacio en blanco intencional, sin
  mosaicos de tarjetas de alturas dispares.

## Lienzos `/design`

- Cada pantalla lleva sus variantes como artboards: `<Pantalla>`, `<Pantalla>Oscuro`,
  `<Pantalla>Movil` y `<Pantalla>MovilOscuro` (p. ej. `Aportes`, `AportesOscuro`…; la vista
  principal de una sección es `Main`).
- El HTML de un artboard pesa decenas de KB: busca con grep o `sed -n` el que necesites en vez
  de leer el fichero entero.
- Tras abrir el lienzo en el editor, `canvas.json` cambia en el servidor. Antes de volver a
  publicar, relee `project/canvas.json` y parte de esa versión, u omítelo si no lo has tocado.
- Al publicar un lienzo nuevo, añádelo a la tabla «Diseños» de #211.
