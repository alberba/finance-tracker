# Lenguaje visual v2

Referencia para diseñar (`/design`) o maquetar una pantalla del rediseño v2 (épica #211). Los
valores viven en el código; aquí está lo que el código no cuenta: qué piezas hay, cuándo se usa
cada una y las reglas que el usuario ha corregido en lienzos anteriores.

## Fuentes de verdad

- **Tokens:** `src/styles/global.css`, claro y oscuro. Se usan como utilidades de `@theme`
  (`bg-panel`, `bg-ink`, `text-gain`, `border-line`, `rounded-md`, `shadow-soft`…), no con hex.
- **Tipografía:** Syne (`font-display`) para títulos y todas las cifras (importes, porcentajes,
  cantidades), siempre con `tabular-nums`; DM Sans (`font-sans`) para el texto; DM Mono
  (`font-mono`) solo para símbolos de activos, kickers y numeración. Las cifras salen de
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
