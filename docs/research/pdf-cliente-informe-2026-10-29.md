# Generación de PDF en el cliente para el informe mensual (#400)

Estado: **investigación cerrada el 2026-10-29; recomendación: pdfmake con fuentes estándar y carga diferida**.
Se compararon librerías para generar en el navegador, sin servidor y con funcionamiento offline, un PDF
con cabecera, pie con numeración, tablas paginadas (cabeceras repetidas y filas sin partir) y un gráfico
de barras horizontales legible sin color. Generarlo en servidor está descartado.

## Metodología y límites

- Versiones, fechas, licencias y dependencias: registro npm (`https://registry.npmjs.org/<paquete>`).
- Actividad del repo, releases y avisos de seguridad: API de GitHub (`https://api.github.com/repos/<repo>`).
- **Tamaños medidos por mí, no copiados de bundlephobia.** Instalé las versiones citadas en un directorio
  temporal fuera del repo (el proyecto no se tocó) y empaqueté un punto de entrada mínimo por librería con
  esbuild 0.28.2 (`--bundle --minify --format=esm --platform=browser --splitting`), midiendo `gzip -9`.
  Son tamaños de un bundle mínimo, no de Vite 8 con tree-shaking real del proyecto; el orden de magnitud
  es fiable, la cifra exacta no.
- Comprobaciones funcionales: generé PDFs con las librerías en Node y los inspeccioné con `pdffonts`,
  `pdfinfo`, `pdftotext` y `qpdf`. **No se probó en un navegador real ni con Astro/Vite del proyecto.**
- No consulté bundlephobia (no era necesario al medir directamente). Los números de la sección
  «Resultados medidos» son reproducibles con los comandos anteriores.

## Candidatas

| Librería | Versión (fecha) | Licencia | Veredicto |
| --- | --- | --- | --- |
| [pdfmake](https://www.npmjs.com/package/pdfmake) | 0.3.13 (2026-10-25) | MIT | Finalista |
| [jsPDF](https://www.npmjs.com/package/jspdf) + [jspdf-autotable](https://www.npmjs.com/package/jspdf-autotable) | 4.2.1 (2026-03-17) + 5.0.9 (2026-10-15) | MIT | Finalista |
| [pdf-lib](https://www.npmjs.com/package/pdf-lib) | 1.17.1 (2021-11-06) | MIT | Descartada |
| [@react-pdf/renderer](https://www.npmjs.com/package/@react-pdf/renderer) | 4.9.0 (2026-08-27) | MIT | Descartada |
| [@pdfme/generator](https://www.npmjs.com/package/@pdfme/generator) | 6.2.8 (2026-10-21) | MIT | Descartada |
| [@libpdf/core](https://www.npmjs.com/package/@libpdf/core) | 0.5.3 (2026-10-16) | MIT | Descartada |
| [typst.ts](https://www.npmjs.com/package/@myriaddreamin/typst.ts) | 0.7.0 (2026-06-01) | Apache-2.0 | Descartada |
| [PDFKit](https://www.npmjs.com/package/pdfkit) | 0.20.2 (2026-08-30) | MIT | Base de pdfmake; no se evalúa sola |

## Resultados medidos (bundle mínimo, min+gzip)

| Escenario | min | gzip |
| --- | ---: | ---: |
| pdfmake sin fuentes | 819 KB | 303 KB |
| pdfmake + fuente estándar Helvetica (`build/standard-fonts/Helvetica.js`) | 843 KB | 306 KB |
| pdfmake + `vfs_fonts` (Roboto 4 variantes incluidas) | 1,67 MB | 772 KB |
| jsPDF (chunk de entrada; `html2canvas`, `canvg` y `dompurify` salen como chunks aparte) | 420 KB | 135 KB |
| jsPDF + jspdf-autotable | 451 KB | 145 KB |
| jsPDF + svg2pdf.js | 508 KB | 161 KB |
| pdf-lib (fuentes estándar) | 524 KB | 208 KB |
| pdf-lib + `@pdf-lib/fontkit` (para fuentes propias) | 1,51 MB | 591 KB |
| @pdfme/generator + schemas (text, table, line, rectangle) | 3,43 MB | 1,07 MB |

Notas:

- jsPDF declara `html2canvas`, `canvg`, `core-js` y `dompurify` como `optionalDependencies`
  ([package.json de jsPDF](https://github.com/parallax/jsPDF/blob/master/package.json)) y los carga con
  import dinámico; con `--splitting` quedan fuera del chunk principal (html2canvas 47 KB gz, canvg
  54 KB gz, dompurify 12 KB gz). Solo se descargan si se usan `html()` o `addSvgAsImage`; el informe no los
  necesita. No verifiqué qué hace exactamente Vite con ellos; hay que comprobarlo con `vite build`.
- La mejora «Reduced browser bundle size by over 20%» de pdfmake 0.3.12 está en su
  [CHANGELOG](https://github.com/bpampuch/pdfmake/blob/master/CHANGELOG.md); mi medición ya parte de 0.3.13.
- Las fuentes Roboto de pdfmake pesan 157-163 KB cada TTF
  ([build/fonts/Roboto](https://unpkg.com/pdfmake@0.3.13/build/fonts/Roboto/)); `vfs_fonts.js` las incluye en base64.

## Análisis por criterio

### 1. Peso y carga diferida

Todas son ESM/UMD sin acceso a DOM al importar (ver criterio 6), por lo que `await import('pdfmake/build/pdfmake')`
al pulsar «Descargar informe» es viable en todas. pdfmake paga más peso inicial (303 KB gz frente a 145 KB
de jsPDF+autotable), pero ese peso solo se descarga bajo demanda y, si la app es offline/PWA, hay que
precachear el chunk (ver riesgos). La diferencia de ~160 KB gz entre ambas no es decisiva para una descarga
puntual; sí lo sería si se cargara en el arranque.

### 2. Tablas con paginación, cabeceras repetidas y filas sin partir

- **pdfmake**: soporte nativo. La [documentación de tablas](https://pdfmake.github.io/docs/0.3/document-definition-object/tables/)
  documenta `headerRows`; `dontBreakRows` no aparece en esa página (lo encontré solo en el código):
  en
  [`LayoutBuilder.js`](https://github.com/bpampuch/pdfmake/blob/master/src/LayoutBuilder.js)
  (`processRow`, `dontBreakRows`, `rowsWithoutPageBreak`) y hay `keepWithHeaderRows`. **Verificado**: una tabla de 121 filas con
  `headerRows: 1` y `dontBreakRows: true` generó 3 páginas y la cabecera «Categoría» se repitió en la
  página 2. Pie con `footer: (currentPage, pageCount) => ...` funcionó («Página n de N»).
- **jsPDF + jspdf-autotable**: soporte nativo en el plugin. Su [`index.d.ts`](https://github.com/simonbengtsson/jsPDF-AutoTable/blob/master/src/config.ts)
  /tipos publicados incluyen `showHead: "everyPage" | "firstPage" | "never"` y `rowPageBreak: "auto" | "avoid"`.
  **Verificado** en Node: 121 filas, 4 páginas, cabecera repetida. La numeración de páginas no es
  declarativa: hay que recorrer `getNumberOfPages()` y `setPage(i)` al final (probado); la cabecera de
  página se dibuja en el hook `didDrawPage`. Es más imperativo que pdfmake.
- **pdf-lib**: no tiene tablas; habría que calcular alturas, saltos y cabeceras a mano (README de
  [pdf-lib](https://github.com/Hopding/pdf-lib)). Descartada por el criterio 2.
- **@pdfme/generator**: orientado a plantillas JSON con diseñador visual
  ([README](https://github.com/pdfme/pdfme)) y tiene plugin `table`; **no verifiqué** si repite cabeceras
  ni si evita partir filas. Su peso medido (1,07 MB gz) la descarta por sí solo.

### 3. Gráfico de barras horizontales

- **pdfmake**: dos vías vectoriales en el propio documento. El preprocesador reconoce los nodos `canvas`
  (rectángulos, líneas, etc.) y `svg` ([`DocMeasure.js`](https://github.com/bpampuch/pdfmake/blob/master/src/DocMeasure.js),
  [`SVGMeasure.js`](https://github.com/bpampuch/pdfmake/blob/master/src/SVGMeasure.js); referencia:
  [SVG](https://pdfmake.github.io/docs/0.3/document-definition-object/svgs/); la URL de la página de `canvas`
  que intenté no existe, así que ese nodo lo cito solo desde el código). Para el informe lo más
  robusto es una tabla de 3 columnas (etiqueta | barra `canvas` | importe y %) con una barra por fila: así las
  etiquetas son texto real, las barras salen vectoriales y se paginan con el resto. Legible sin color:
  barras de un gris oscuro con borde, valores numéricos junto a cada barra y orden descendente. **No probé**
  el renderizado del nodo `svg` con texto y fuentes embebidas.
- **jsPDF**: primitivas vectoriales (`rect`, `line`, `text`) dibujadas con coordenadas manuales; hay que
  calcular el layout y, si el gráfico queda entre dos páginas, el salto lo decide el código. Alternativa:
  [svg2pdf.js](https://github.com/yWorks/svg2pdf.js) (2.9.0, 2026-10-29, MIT) para pasar un SVG a vectores,
  +26 KB gz (161 vs 135 KB) medidos; requiere un elemento DOM SVG, que no existe en un worker.
- **Rasterizada** (html2canvas/canvas a PNG): funciona con ambas, pero el gráfico pierde nitidez,
  el texto deja de ser seleccionable y es lo que más pesa. No recomendada.

### 4. Tipografías, acentos, ñ y €

- **Fuentes estándar (Helvetica, codificación WinAnsi)**: no se incrustan, no cuestan peso, y WinAnsi
  incluye `á é í ó ú ñ €`. **Verificado en ambas**: `Niño café año … 1.234,56 €` se generó y `pdftotext`
  lo recuperó íntegro (pdfmake, 3 páginas; jsPDF, 120 apariciones de `€` extraídas). Límite: cualquier carácter fuera
  de WinAnsi (p. ej. emojis o alfabetos no latinos en descripciones de movimientos) no se representará. La
  [página de fuentes estándar de pdfmake](https://pdfmake.github.io/docs/0.3/fonts/standard-14-fonts/)
  advierte «only ANSI code page (only english characters)»; mi prueba contradice la parte de acentos y €, así
  que prima el resultado, pero conviene una prueba con los textos reales. Esta verificación se hizo en Node, no en el
  navegador (en navegador se cargan `build/standard-fonts/Helvetica.js`, 24 KB sin comprimir).
- **Fuentes incrustadas**: pdfmake subsetea TrueType (verificado: `Roboto-Regular` quedó como
  `BZZZZZ+Roboto-Regular`, subset, 7,9 KB el PDF). jsPDF con `addFileToVFS`/`addFont` (Identity-H) embebe
  Roboto (PDF de 20,8 KB; `pdffonts` marca `sub: no`, es decir sin subset nombrado). En ambos el TTF
  (157 KB sin comprimir) debe enviarse al cliente; cargarlo con `fetch` desde `/public` y cachearlo
  evita meterlo en el JS. Con pdf-lib hace falta además `@pdf-lib/fontkit` (+383 KB gz medidos).
- Coste de usar Roboto con `vfs_fonts` en pdfmake: +469 KB gz medidos sobre la base. Evitable cargando solo
  la variante necesaria.

### 5. Mantenimiento y licencia

| Librería | Último push | Última release | Licencia | Notas |
| --- | --- | --- | --- | --- |
| pdfmake | 2026-10-29 | 0.3.13 (2026-10-25) | MIT (fichero LICENSE; GitHub la marca `NOASSERTION`) | 12,4 k estrellas; activo ([repo](https://github.com/bpampuch/pdfmake)) |
| jsPDF | 2026-10-28 | 4.2.1 (2026-03-17) | MIT | 31,3 k estrellas; ver avisos de seguridad ([repo](https://github.com/parallax/jsPDF)) |
| jspdf-autotable | 2026-10-15 | 5.0.9 (2026-10-15) | MIT | peer `jspdf ^2 \|\| ^3 \|\| ^4`; ([repo](https://github.com/simonbengtsson/jsPDF-AutoTable)) |
| pdf-lib | 2024-07-17 | 1.17.1 (2021-11-06) | MIT | Sin release en casi 5 años; 318 issues abiertos ([repo](https://github.com/Hopding/pdf-lib)) |
| @react-pdf/renderer | 2026-10-29 | 4.9.0 (2026-08-27) | MIT | Activo ([repo](https://github.com/diegomura/react-pdf)) |
| pdfme | 2026-10-23 | 6.2.8 (2026-10-21) | MIT | Activo ([repo](https://github.com/pdfme/pdfme)) |
| @libpdf/core | 2026-10-26 | 0.5.3 (2026-10-16) | MIT | Versión 0.x ([repo](https://github.com/LibPDF-js/core)) |

Seguridad de jsPDF: los [avisos de seguridad del repo](https://github.com/parallax/jsPDF/security/advisories)
listan al menos 8 publicados entre 2026-02-02 y 2026-03-17 (dos críticos: inyección de objetos PDF en `addJS` y
inyección HTML en métodos de salida; varios altos: inyección en AcroForm, DoS por GIF), todos con parche
en 4.2.0/4.2.1. El informe no usa `addJS`, AcroForm ni GIF, pero concatena texto del usuario (categorías,
descripciones), así que conviene fijar `jspdf >= 4.2.1`. No encontré avisos publicados en
[pdfmake](https://github.com/bpampuch/pdfmake/security/advisories) (la consulta devolvió lista vacía; esto no
garantiza ausencia de vulnerabilidades). No revisé los avisos de las demás.

### 6. Vite, Astro y SSR

- Importar sin `window`/`document` **verificado en Node**: `jspdf` (build ESM), `jspdf-autotable`,
  `pdf-lib` y el build de navegador de pdfmake (`build/pdfmake.js`) se importan sin error.
  Aun así, usar `await import(...)` dentro del manejador de clic dentro de un componente Vue con
  `client:*` evita cualquier análisis SSR.
- pdfmake: `package.json` declara `"main": "js/index.js"` y `"browser": "build/pdfmake.js"`. Vite 8 resuelve
  el campo `browser`, pero **no probé** qué entrada elige Astro en SSR con este proyecto. Hay que
  importar explícitamente `pdfmake/build/pdfmake` para el cliente (patrón de su
  [guía de inicio](https://pdfmake.github.io/docs/0.3/getting-started/client-side/)).
- jsPDF: define `exports.browser` → `dist/jspdf.es.min.js` ([package.json](https://github.com/parallax/jsPDF/blob/master/package.json)).
- @react-pdf/renderer: `peerDependencies: react ^16.8 || … || ^19` (registro npm). Exige un renderizador React
  y su reconciliador (`@react-pdf/reconciler`); con Vue implicaría añadir React al bundle y escribir
  el documento en JSX. **Descartada** por esa razón (no por calidad: está activa y tiene pdfkit debajo).
- typst.ts: compila Typst a PDF con WASM; el compilador pesa 28,4 MB desempaquetado
  (`@myriaddreamin/typst-ts-web-compiler`, registro npm) y el renderer 1,1 MB. Es 0.x y desproporcionado
  para este informe. **Descartada**.

### 7. Texto seleccionable y accesibilidad

- **Texto seleccionable**: con fuentes estándar o incrustadas, el texto sale como texto, no como imagen.
  **Verificado** con `pdftotext` en pdfmake y jsPDF (tablas, cabecera con «ñ», `€`). Con un gráfico
  rasterizado el texto del gráfico no lo sería.
- **PDF etiquetado**: pdfmake expone `tagged` y `subset` (PDF/A, PDF/UA) en el documento
  ([`Printer.js`](https://github.com/bpampuch/pdfmake/blob/master/src/Printer.js)), delegando en PDFKit.
  **Hallazgo importante**: con `tagged: true`, `pdfinfo` marca `Tagged: yes` y el PDF contiene `/StructTreeRoot`, pero
  `qpdf --qdf` no mostró ningún elemento de estructura (`/S /Table`, `/P`, …) y el código de pdfmake no
  llama a `markContent`/`struct` de PDFKit (búsqueda en `src/`). Es decir, la bandera crea un árbol
  de estructura vacío: **no hay PDF accesible real**. No verifiqué si PDF/UA (`subset: 'PDF/UA'`) cambia
  esto. jsPDF no escribe `StructTreeRoot` ni `MarkInfo` (búsqueda en `dist/jspdf.es.js`, sin resultados):
  sin etiquetado. De pdf-lib, pdfme y libpdf no lo comprobé.
- Consecuencia: ninguna de las dos finalistas ofrece accesibilidad completa verificada. Mitigaciones
  baratas: texto real (no imagen), orden de lectura lógico, valores numéricos junto a cada barra para que el
  gráfico no dependa de lo visual, título y metadatos del documento (`info.title`, `info.author`, idioma).
  Si hace falta cumplimiento formal habría que ofrecer además CSV/HTML.

## Tabla comparativa

| Criterio | pdfmake 0.3.13 | jsPDF 4.2.1 + autotable 5.0.9 | pdf-lib 1.17.1 | @react-pdf/renderer 4.9.0 | pdfme 6.2.8 |
| --- | --- | --- | --- | --- | --- |
| 1. Peso min+gzip (medido) | 306 KB (std) / 772 KB (Roboto vfs) | 145 KB (+ chunks opcionales no usados) | 208 KB / 591 KB con fontkit | no medido (necesita React) | 1,07 MB |
| 1. Carga diferida | Sí (import dinámico) | Sí | Sí | Sí, con React incluido | Sí |
| 2. Cabeceras repetidas | Sí, nativo, verificado | Sí, `showHead: "everyPage"`, verificado | No (manual) | No verificado | No verificado |
| 2. Filas sin partir | `dontBreakRows` | `rowPageBreak: "avoid"` | No (manual) | No verificado | No verificado |
| 2. Cabecera/pie con n.º de página | Declarativo, verificado | Manual (bucle `setPage`), verificado | Manual | No verificado | No verificado |
| 3. Gráfico vectorial | `canvas` y `svg` en el documento | `rect`/`line` manual o svg2pdf | Primitivas manuales | Componentes SVG (React) | Plugins de forma |
| 4. á ñ € sin incrustar | Sí (WinAnsi), verificado en Node | Sí (WinAnsi), verificado en Node | Sí (WinAnsi; no probado) | No evaluado | No evaluado |
| 4. Fuente incrustada | TTF con subset | TTF (`addFont`) | Con fontkit | No evaluado | No evaluado |
| 5. Última release | 2026-10-25 | 2026-03-17 / 2026-10-15 | 2021-11-06 | 2026-08-27 | 2026-10-21 |
| 5. Licencia | MIT | MIT | MIT | MIT | MIT |
| 6. Import sin window | Sí (Node) | Sí (Node) | Sí (Node) | No evaluado | No evaluado |
| 7. Texto seleccionable | Sí | Sí | Sí (esperable, no probado) | No evaluado | No evaluado |
| 7. PDF etiquetado | Bandera sin estructura real | No | No verificado | No verificado | No verificado |
| Encaje con Vue | Neutro | Neutro | Neutro | Requiere React | Neutro |

## Recomendación

**pdfmake 0.3.x con fuentes estándar (Helvetica) y carga diferida mediante `import()` al pulsar el botón.**

Motivos:

1. Es la única candidata que cubre de forma declarativa y verificada los tres requisitos de tabla más
   delicados: cabecera repetida (`headerRows`), filas sin partir (`dontBreakRows`) y pie con `currentPage`/`pageCount`.
   Con jsPDF todo se logra, pero con más código imperativo (bucle de numeración, coordenadas del gráfico).
2. Permite colocar el gráfico dentro del flujo del documento (barras `canvas` por fila de tabla), con
   paginación automática y texto real.
3. Con Helvetica estándar el coste es ~306 KB gz, descargados solo al exportar, y los acentos, ñ y € funcionaron
   en la prueba sin incrustar fuentes. Roboto (+469 KB gz) solo se justificaría si aparecen caracteres
   fuera de WinAnsi.
4. Mantenimiento activo (release hace 4 días, 12 k estrellas, MIT) y sin avisos de seguridad publicados.

Alternativa razonable: **jsPDF + jspdf-autotable** si el peso inicial (≈145 KB gz frente a ≈306 KB) pesara más que la
simplicidad del código; exige fijar `jspdf >= 4.2.1`, numeración de páginas manual y dibujar el gráfico
a mano. Descartadas: pdf-lib (sin tablas, sin releases desde 2021), @react-pdf/renderer (requiere React), pdfme
(1,07 MB gz, pensada para plantillas), @libpdf/core (0.x, centrada en manipular PDFs) y typst.ts (WASM de 28 MB).

## Riesgos

- **Accesibilidad**: ninguna opción produce PDF etiquetado de verdad. `tagged: true` de pdfmake daría una falsa
  sensación de cumplimiento. Mitigar con texto real y valores junto al gráfico (ver criterio 7); no declarar el
  PDF como accesible.
- **Juego de caracteres**: Helvetica solo cubre WinAnsi. Descripciones con emojis o caracteres no latinos
  saldrían mal o con huecos. Hay que sanear/sustituir o recurrir a Roboto/Noto con coste de peso.
  Probar con datos reales.
- **Pruebas solo en Node**: no se verificó la carga en navegador, la entrada que Vite/Astro resuelven para
  pdfmake (`browser` frente a `main`) ni el comportamiento del chunk diferido. Verificarlo con `pnpm build`
  y una prueba E2E que descargue el PDF.
- **Offline/PWA**: el chunk cargado dinámicamente debe quedar precacheado por el service worker si la app es
  instalable (no revisé la configuración de caché del proyecto).
- **Rendimiento**: la generación se ejecuta en el hilo principal; un listado de miles de movimientos puede bloquear
  la UI. No medí tiempos. Mitigar con límite de filas, indicador de progreso o un worker (pdfmake 0.3 no
  necesita DOM, pero no lo probé en un worker).
- **Exactitud de la paginación**: `dontBreakRows` evita partir filas, pero una fila más alta que una página no
  cabrá; limitar la longitud de las descripciones.
- **Versiones fijas**: pdfmake sigue en 0.x (API puede cambiar entre menores); fijar versión exacta y probar el
  PDF con una prueba que compare número de páginas y texto extraído.
- **Medición aproximada**: los pesos salen de un bundle esbuild mínimo; el bundle real con Vite puede variar
  un 5-10 % (estimación mía, no verificada).
- **jsPDF y datos del usuario**: si se elige jsPDF, no pasar texto no confiable a APIs con interpretación
  (`addJS`, AcroForm, HTML) y mantener `>= 4.2.1`.

## Ampliación: tipografías de la web en el PDF (Syne, DM Sans, DM Mono)

Contexto nuevo: el PDF debe usar las mismas familias que la web y funcionar offline. Hoy se cargan desde
Google Fonts en `src/components/FinanceTrackerShell.astro:88-91` (Syne `wght 400..800`; DM Sans
`opsz 9..40`, pesos 400/500/600/700 y cursiva 400; DM Mono 400/500), de modo que no están en el repo. Los
`docs/architecture/design-language.md` fijan Syne para títulos **y todas las cifras, siempre con
`tabular-nums`**, DM Sans para el texto y DM Mono para etiquetas.

Metodología: descargué los archivos reales de los repos oficiales a un directorio temporal (fuera del repo), los
inspeccioné con fontTools (venv temporal), generé PDFs de prueba en Node con pdfmake 0.3.13 y jsPDF 4.2.1 y
medí bundles con esbuild 0.28.2 como en la sección anterior. **No se probó en navegador** ni con el
service worker real.

### 1. TTF disponibles, origen y peso

| Corte | Origen | Sin comprimir | gzip -9 |
| --- | --- | ---: | ---: |
| Syne Bold (700) | **Derivado**: instancia `wght=700` de la variable | 70.040 B | 37.315 B |
| Syne SemiBold (600) | **Derivado**: instancia `wght=600` de la variable | 70.060 B | 37.583 B |
| DM Sans Regular (400) | Estático oficial | 78.256 B | 40.747 B |
| DM Sans Medium (500) | Estático oficial | 78.124 B | 40.916 B |
| DM Sans Bold (700) | Estático oficial | 78.356 B | 40.691 B |
| DM Mono Regular (400) | Estático oficial | 49.744 B | 26.363 B |
| DM Mono Medium (500) (por si se usa, la web lo carga) | Estático oficial | 50.360 B | 26.532 B |
| **Total de los 6 cortes pedidos (sin DM Mono Medium)** | | **424.580 B** | **222.345 B** |

Fuentes y matices:

- **Syne no publica TTF estáticos.** El repo de Google Fonts solo tiene la variable `Syne[wght].ttf`
  (146.980 B; [ofl/syne](https://github.com/google/fonts/tree/main/ofl/syne)). Su
  [upstream_info.md](https://github.com/google/fonts/blob/main/ofl/syne/upstream_info.md) la describe como
  variable con eje `wght` y apunta al repo del autor en
  [GitLab](https://gitlab.com/bonjour-monde/fonderie/syne-typeface) (no lo consulté, así que **no verifiqué**
  si allí hay estáticos). Los dos cortes de Syne los obtuve con `fontTools.varLib.instancer` sobre la variable
  (eje `wght` 400-800, instancias con nombre Regular/Medium/SemiBold/Bold/ExtraBold). Quedan con el
  nombre PostScript `Syne-Regular` (las comprobaciones con `pdffonts` lo muestran), cosmético pero
  conviene renombrar al empaquetar.
- **DM Sans**: estáticos en [googlefonts/dm-fonts, `Sans/fonts/ttf/`](https://github.com/googlefonts/dm-fonts/tree/main/Sans/fonts/ttf)
  (`DMSans-Regular/Medium/Bold.ttf`; también hay `Sans/Exports/` con archivos de ~73 KB; no los descargué ni comparé). El repo no tiene commits desde 2024-07-03
  ([API](https://api.github.com/repos/googlefonts/dm-fonts)); la variable de Google Fonts está en
  [ofl/dmsans](https://github.com/google/fonts/tree/main/ofl/dmsans) (240.164 B, ejes `opsz 9..40` y
  `wght 100..1000`). Ambas son «Version 4.004» según la tabla `name`.
- **Diferencia con la web**: el estático `DMSans-Regular` equivale a `opsz=14` (advances de `a`,`1`,`0`
  = 544/312/684, idénticos a la variable instanciada con `opsz=14`). La web usa la variable con óptico
  automático, de modo que a tamaños distintos de ~14 px las formas y anchos difieren ligeramente
  (p. ej. el `1` mide 342 en `opsz=9` y 258 en `opsz=40`). Aceptable para un PDF; **no comparé visualmente** web y PDF.
- **DM Mono**: estáticos oficiales en [ofl/dmmono](https://github.com/google/fonts/tree/main/ofl/dmmono)
  (Regular 49.744 B, Medium 50.360 B, más Light y cursivas).
- **Google Fonts (sitio)**: no verifiqué si su botón «Download family» incluye una carpeta `static/` con los
  cortes; el repositorio es la fuente que sí pude comprobar.

### 2. Fuentes variables en pdfmake y jsPDF

**Ninguna las soporta; hay que usar instancias estáticas.**

- pdfmake delega en PDFKit/fontkit y el código no hace referencia a variaciones (búsqueda de `variation`/`fvar`
  en `pdfmake/src` y `pdfkit/js/pdfkit.js` sin resultados). Prueba: registré `Syne[wght].ttf` como `normal`
  y `bold`; ambos salieron con el trazo del peso por defecto (400, sin negrita), distinto de la instancia
  estática Bold (anchos de `1111111`: 31,56 pt frente a 38,22 pt a 14 pt). El PDF se generó sin error, así que el
  fallo es silencioso.
- jsPDF: mismo resultado con `addFont` (31,56 pt frente a 38,22 pt). Sin API de variaciones (el `.d.ts` no la menciona).
- Recomendación: empaquetar solo las instancias estáticas ya generadas (lista de la sección 1).

### 3. Cobertura de caracteres (comprobada con fontTools sobre los archivos)

Se comprobó que están en el `cmap` U+2212 (−), U+20AC (€), ñ, Ñ, á, é, í, ó, ú, ü, ¿, ¡, ·, –, — y %.
Resultado: **no falta ninguno** en `Syne-SemiBold`, `Syne-Bold`, `DMSans-Regular/Medium/Bold`,
`DMMono-Regular/Medium` (ni en las variables de Syne y DM Sans). Además, un PDF de prueba con `−1.234,56 €`
y `Niño` en cada familia se generó con pdfmake y jsPDF, y `pdftotext` recuperó el texto íntegro; el
renderizado a PNG muestra el signo menos y el euro. Caracteres fuera de esa lista (emojis, otros alfabetos) no se
comprobaron; las fuentes traen latín, latín extendido y, Syne, griego (según su `upstream_info.md`).

### 4. Cifras tabulares (`tnum`)

- Las tres familias de texto traen la característica en GSUB: Syne y DM Sans tienen `tnum` (y `pnum`);
  **DM Mono no tiene `tnum`**, pero al ser monoespaciada ya tiene ancho fijo (verificado: `1111111` y
  `0000000` miden 58,80 pt en 14 pt). La variable de DM Sans que sirve Google Fonts **no** incluye `tnum`
  en GSUB (sí los estáticos de dm-fonts); hay que usar los estáticos para el PDF.
- **pdfmake: sí.** El nodo de texto acepta `fontFeatures: ['tnum']` (código en `TextInlines.js` y `Renderer.js`,
  que lo pasa a PDFKit/fontkit). Verificado: con Syne Bold a 14 pt, `1111111` y `0000000` pasan de 38,22 y
  72,32 pt (proporcionales) a 69,38 pt ambos; con DM Sans pasan de 30,58 y 67,03 a 58,80. Funciona también en
  el cálculo de anchos, no solo en el dibujo. Se puede fijar como estilo (`style: { fontFeatures: ['tnum'] }`).
  Aviso de diseño: en Syne los dígitos tabulares son bastante más anchos que los proporcionales (el `1` pasa de 38 a 69 pt por 7 dígitos),
  así que el ancho de las columnas de importes debe calcularse con `tnum` activo.
- **jsPDF: no.** No hay API de características OpenType (sin `fontFeatures` en `types/index.d.ts` ni
  tratamiento de GSUB; sus anchos salieron proporcionales: `1111111` 38,22 pt frente a `0000000` 72,32 pt). Alternativas:
  alinear importes a la derecha (alinea la última cifra pero no los separadores) o usar DM Mono para los
  importes, lo que contradice la regla de diseño «cifras en Syne».

### 5. Crecimiento del bundle diferido y cómo incluirlas

Medido con los 6 cortes (el bundle base es el de la sección anterior sin fuentes):

| Escenario | min | gzip |
| --- | ---: | ---: |
| pdfmake sin fuentes (referencia) | 819 KB | 303 KB |
| pdfmake + 6 cortes como **base64 en el JS** (`--loader:.ttf=base64`) | 1,38 MB | **584 KB** (+281 KB) |
| pdfmake + 6 cortes como **archivos aparte** (`--loader:.ttf=file`, equivale a `?url`) | 819 KB JS | 303 KB JS + 222 KB de TTF gzip = **525 KB** (si el servidor los comprime) |
| jsPDF (sin autotable) + 6 cortes base64 | 986 KB | **417 KB** (+282 KB, ya sin los chunks opcionales) |

Observaciones:

- El base64 gzip pesa +26 % respecto al TTF gzip (280 KB frente a 222 KB) por la expansión 4/3.
- PDF resultante: con subsetting pdfmake generó un PDF de 21,5 KB con 4 fuentes; jsPDF, con 3 fuentes
  (Identity-H), 54,8 KB (`pdffonts` marca `sub: no`, es decir, sin subset). Es coste en la descarga del
  usuario, no en el bundle.
- **Formas de incluirlas con Vite**:
  1. *base64 dentro del chunk diferido*: un único archivo JS con hash, una sola petición, cacheable por el service
     worker. Es el modo menos frágil para offline, pero hay que decodificar y no se comprime tanto.
  2. *`import fontUrl from './Syne-Bold.ttf?url'` + `fetch()` al generar*: JS más pequeño y los TTF se
     cachean aparte; cada TTF es una petición más (6) que el service worker debe haber guardado. Para entregárselos a pdfmake
     en navegador hay que pasar los bytes por `addVirtualFileSystem` (`{ data, encoding }`; el código admite
     base64 y también tipos que `Buffer` acepta). **No verifiqué en navegador** que `data` pueda ser un `Uint8Array`;
     la vía segura es base64.
  3. *Archivos fijos en `public/`* (p. ej. `/fonts/pdf/Syne-Bold.ttf`): URLs estables, que sí se pueden añadir a
     `APP_SHELL` de `public/sw.js`; el chunk JS seguiría con hash.
  4. Compresión: los TTF no van comprimidos por sí mismos; el 222 KB solo se logra si el servidor
     comprime `font/ttf` (**no comprobé la configuración de producción**). Convertir a WOFF2 reduciría más, pero
     no verifiqué que pdfmake/fontkit lo acepte en navegador y la conversión cuenta como modificación (ver sección 6).
- **Service worker actual** (`public/sw.js`, `src/scripts/shell.ts:141-158`): solo se registra en producción.
  Al instalar precachea unos pocos iconos y el manifiesto (`APP_SHELL`). Para el resto aplica
  `staleWhileRevalidate` a todo GET del **mismo origen** (excepto `/api/` y `/login`), de modo que un recurso se guarda
  en caché **solo después de pedirse una vez**. Además, al cargar, la página envía al SW las URLs de
  `performance.getEntriesByType('resource')` (máx. 100) para cachearlas.
  Consecuencias:
  - Un chunk cargado con `import()` al pulsar «Descargar PDF» **no está en la caché hasta que se haya usado
    online una vez**. Sin más, la primera vez que alguien pulsa el botón sin conexión, falla.
  - Para que funcione offline desde el principio hay que **precargar el chunk (y los TTF si van aparte)
    tras el arranque** (por ejemplo `import()` en `requestIdleCallback`, o `<link rel="prefetch">`) y
    comprobar que acaba en caché; o añadir las URLs a la lista que se envía al SW. **No lo probé**; hay que
    verificarlo con la app construida y el SW activo, en modo sin conexión de DevTools.
  - **Hallazgo colateral**: las fuentes web actuales vienen de `fonts.googleapis.com` y `fonts.gstatic.com`
    (otro origen) y el SW ignora lo que no sea del mismo origen (`url.origin !== self.location.origin`), así que
    la propia web depende de la caché HTTP del navegador para sus tipografías sin conexión; **no verifiqué** qué
    hace el navegador en ese caso. Empaquetar las fuentes de forma local para el PDF abre la posibilidad
    de servirlas también para la web (decisión aparte).
  - Si se sube la versión de los archivos conviene subir `CACHE_VERSION` (`finance-tracker-v3`); los chunks con hash
    ya cambian de URL por sí solos.

### 6. Licencia (SIL OFL 1.1)

Las tres familias son OFL 1.1: sus archivos
[`OFL.txt` de Syne](https://github.com/google/fonts/blob/main/ofl/syne/OFL.txt),
[de DM Sans](https://github.com/google/fonts/blob/main/ofl/dmsans/OFL.txt) y
[de DM Mono](https://github.com/google/fonts/blob/main/ofl/dmmono/OFL.txt) lo indican, y
`METADATA.pb` de Syne dice `license: "OFL"`. Avisos de copyright (en `OFL.txt` y en la tabla `name` de los TTF):
«Copyright 2017 The Syne Project Authors (https://gitlab.com/bonjour-monde/fonderie/syne-typeface)»
(el `METADATA.pb` y el nombre dentro del TTF dicen 2019; hay incongruencia entre archivos, **conservar el texto del
`OFL.txt` y del TTF tal cual**), «Copyright 2014 The DM Sans Project Authors
(https://github.com/googlefonts/dm-fonts)» y «Copyright 2020 The DM Mono Project Authors
(https://www.github.com/googlefonts/dm-mono)». Ninguno de los tres `OFL.txt` declara Reserved Font Name concreto (la
cláusula aparece solo como definición genérica; leída por mí, no validada jurídicamente).

Obligaciones, según el [texto oficial](https://openfontlicense.org/open-font-license-official-text/) y las
[FAQ](https://openfontlicense.org/ofl-faq/):

1. **Conservar aviso de copyright y licencia en cada copia distribuida** del software de fuente (condición 2):
   puede ser un archivo de texto, una cabecera legible o metadatos. Al empaquetar los TTF en la app hay que incluir
   los tres `OFL.txt` (p. ej. junto a los TTF o en una página de licencias) y no borrar los campos de copyright/licencia
   de la tabla `name`. FAQ 1.20: basta con los textos de las fuentes que se usan.
2. **No vender las fuentes por sí solas** (condición 1) y distribuirlas bajo OFL, no bajo otra licencia
   (condición 5). Esto no afecta al código de la app ni a los PDFs generados.
3. **Los PDFs no heredan OFL**: incrustar una fuente OFL, completa o en subset, no cambia la licencia del documento
   (FAQ 1.12 y 1.13); en ese caso no hay que adjuntar la licencia dentro del PDF (FAQ 1.10).
4. **Nombres**: una versión modificada no puede usar un Reserved Font Name sin permiso (condición 3) y no se puede usar el
   nombre de los autores para promocionarla (condición 4). Como no hay RFN declarado, conservar el nombre es lícito.
5. **Modificaciones**: instanciar la variable de Syne en estática, convertir a WOFF2 o hacer subsetting se considera
   modificación según las FAQ (2.2, 2.6; sobre instanciar a estática la FAQ no dice nada explícito, es mi
   inferencia). Es permitido bajo OFL siempre que se mantengan aviso y licencia (más cualquier RFN declarado,
   que aquí no hay). El subsetting que hace pdfmake dentro del PDF es *embedding*, no redistribución del TTF.

Recomendación práctica: guardar los TTF en una carpeta del repo con los tres `OFL.txt` y un README breve que indique
origen y, para Syne, cómo se generaron las instancias (comando de fontTools).

### 7. ¿Sigue siendo pdfmake la recomendación?

**Sí, pdfmake se mantiene.** Con estas fuentes la decisión se refuerza:

- Las cifras de la web son Syne con `tabular-nums`. pdfmake lo ofrece con `fontFeatures: ['tnum']`
  (verificado); jsPDF no tiene mecanismo. Con jsPDF habría que renunciar a la regla de diseño o cambiar las cifras
  a DM Mono, y las columnas de importes quedarían con separadores desalineados.
- pdfmake subsetea las fuentes (PDF de 21,5 KB con 4 familias frente a 54,8 KB con 3 en jsPDF) y las tablas siguen siendo
  declarativas.
- jsPDF conserva su ventaja de peso, ahora 417 KB gzip frente a 525-584 KB (≈110-170 KB de diferencia, similar a la
  de antes) y es una descarga bajo demanda, por lo que no inclina la balanza. Sí lo haría si se renunciara a `tnum`.
- Ni una ni otra soportan variables: ambas necesitan los mismos 6 TTF estáticos, así que las fuentes no
  cambian la comparación salvo en `tnum` y subsetting.

Riesgos y puntos **no verificados** de esta ampliación:

- Syne en estático es un derivado mío (instancer); revisar visualmente que el PDF coincide con la web, también DM Sans por el
  `opsz` fijo en 14 (sección 1).
- No se probó nada en navegador: ni la carga de bytes de TTF en el VFS de pdfmake, ni el chunk diferido, ni el
  comportamiento del service worker sin conexión (sección 5). Hay que probar con build de producción y el SW activo.
- Si las fuentes se cargan con `fetch()`, la primera descarga online debe haber ocurrido antes de estar sin conexión;
  el precalentamiento tras el arranque añade tráfico en segundo plano (~525-584 KB gzip) en cada dispositivo,
  incluidos los móviles con datos.
- Syne con `tnum` tiene dígitos muy anchos: probar que los importes largos caben en las columnas.
- OFL: archivar los tres `OFL.txt`; la fecha de copyright de Syne es incongruente entre archivos (2017, 2019).
