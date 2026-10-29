# El informe es un PDF generado en el cliente con pdfmake

El informe (#400) debía descargarse como PDF con plantilla, un gráfico y la lista de movimientos,
sin servidor y funcionando offline y en la demo. Decidimos generarlo en el navegador con
pdfmake, cargado con `import()` al pulsar «Descargar PDF», con las mismas familias que la web
(Syne, DM Sans y DM Mono) empaquetadas solo para el PDF. Es la única candidata con cabecera de
tabla repetida, filas que no se parten, numeración de páginas y cifras tabulares (`tnum`), que
el lenguaje visual v2 exige para todas las cifras.

Descartamos imprimir desde el navegador (`window.print()`): da una plantilla poco controlable,
no admite gráficos fiables y es torpe en móvil. Descartamos generarlo en el servidor, porque
rompe el modo offline y la demo y exige endpoints nuevos. Descartamos jsPDF, porque pesa menos
pero no tiene cifras tabulares y la numeración y el gráfico son manuales. Quedaron fuera
pdf-lib (sin tablas ni releases desde 2021) y `@react-pdf/renderer` (exige React).

Consecuencias que no se ven en el código:

- pdfmake no admite fuentes variables: Syne, que solo se publica como variable, se genera una
  vez en instancias estáticas con fontTools y se guardan con su licencia OFL. DM Sans y DM Mono
  son estáticas.
- Con las fuentes, el chunk diferido pesa unos 525–584 KB gzip. Solo se descarga al usar el
  informe y se precarga en el service worker tras el arranque para que funcione offline.
- `tagged: true` de pdfmake no genera un PDF accesible: el árbol de estructura queda vacío.
  Aceptamos esa limitación; ninguna candidata la resuelve.
- Los emojis y los alfabetos no latinos no se representan con estas fuentes.

La comparación completa y sus fuentes están en
[pdf-cliente-informe-2026-10-29](../research/pdf-cliente-informe-2026-10-29.md).
