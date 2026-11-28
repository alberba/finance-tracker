# El informe es un PDF generado en el cliente con pdfmake

El informe (#400) debía descargarse como PDF con plantilla, un gráfico y la lista de movimientos,
sin servidor y funcionando offline y en la demo. Decidimos generarlo en el navegador con
pdfmake, cargado con `import()` al pulsar «Descargar PDF», con las mismas familias que la web
(Unbounded y Manrope) empaquetadas solo para el PDF. Es la única candidata con cabecera de
tabla repetida, filas que no se parten, numeración de páginas y cifras tabulares (`tnum`), que
[DESIGN.md](../../DESIGN.md) exige para todas las cifras.

Descartamos imprimir desde el navegador (`window.print()`): da una plantilla poco controlable,
no admite gráficos fiables y es torpe en móvil. Descartamos generarlo en el servidor, porque
rompe el modo offline y la demo y exige endpoints nuevos. Descartamos jsPDF, porque pesa menos
pero no tiene cifras tabulares y la numeración y el gráfico son manuales. Quedaron fuera
pdf-lib (sin tablas ni releases desde 2021) y `@react-pdf/renderer` (exige React).

Consecuencias que no se ven en el código:

- pdfmake no admite fuentes variables y Unbounded y Manrope solo se publican como variables: las
  instancias estáticas (Unbounded 600 y 700, Manrope 400, 700 y 800) se generan una vez a partir
  de los TTF variables de Google Fonts con fontkit y se guardan con su licencia OFL. Solo
  conservan los glifos del juego latino (con sus cifras tabulares) y el kerning de esos pares en
  una tabla `kern`, para que pesen lo mismo que las fuentes del diseño anterior.
- Con las fuentes, el chunk diferido pesa unos 525–584 KB gzip. Solo se descarga al usar el
  informe y se precarga en el service worker tras el arranque para que funcione offline.
- `tagged: true` de pdfmake no genera un PDF accesible: el árbol de estructura queda vacío.
  Aceptamos esa limitación; ninguna candidata la resuelve.
- Los emojis y los caracteres fuera del juego latino no se representan con estas fuentes.

La comparación completa y sus fuentes están en
[pdf-cliente-informe-2026-10-29](../research/pdf-cliente-informe-2026-10-29.md).
