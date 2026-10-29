# Fuentes

Syne, DM Sans y DM Mono se sirven desde este directorio, no desde Google Fonts. Se descargaron
el 2026-10-29 del subconjunto **latin** de Google Fonts (woff2), con los pesos que usa el tema:

| Familia | Fichero                           | Pesos              |
| ------- | --------------------------------- | ------------------ |
| Syne    | `syne-latin-wght.woff2`           | 400–800 (variable) |
| DM Sans | `dm-sans-latin-wght.woff2`        | 400–700 (variable) |
| DM Sans | `dm-sans-latin-wght-italic.woff2` | 400 (cursiva)      |
| DM Mono | `dm-mono-latin-400.woff2`         | 400                |
| DM Mono | `dm-mono-latin-500.woff2`         | 500                |

Origen (Google Fonts, versión servida por `fonts.gstatic.com` en esa fecha):

- `https://fonts.gstatic.com/s/syne/v24/8vIH7w4qzmVxm2BL9A.woff2`
- `https://fonts.gstatic.com/s/dmsans/v17/rP2Hp2ywxg089UriCZOIHQ.woff2`
- `https://fonts.gstatic.com/s/dmsans/v17/rP2Wp2ywxg089UriCZaSExdy3sGt9zz86GPwyKy58Q.woff2`
- `https://fonts.gstatic.com/s/dmmono/v16/aFTU7PB1QTsUX8KYthqQBA.woff2`
- `https://fonts.gstatic.com/s/dmmono/v16/aFTR7PB1QTsUX8KYvumzEYOtbQ.woff2`

Las tres familias se distribuyen bajo la **SIL Open Font License 1.1**; el texto de cada licencia
y su aviso de copyright están en `OFL-Syne.txt`, `OFL-DM-Sans.txt` y `OFL-DM-Mono.txt`, junto a
los ficheros que cubren.

Los `@font-face` viven en `src/styles/global.css`, los precarga
`src/components/layout/FontPreloads.astro` y el service worker los guarda en la caché del shell
(`public/sw.js`). `tests/unit/fonts.test.ts` comprueba que las tres listas coinciden.
