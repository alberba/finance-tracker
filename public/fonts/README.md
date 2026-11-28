# Fuentes

Unbounded y Manrope (ver `DESIGN.md`) se sirven desde este directorio, no desde Google Fonts. Se
descargaron el 2026-11-08 del subconjunto **latin** (woff2), con los pesos que usa el tema:

| Familia   | Fichero                      | Pesos              |
| --------- | ---------------------------- | ------------------ |
| Unbounded | `unbounded-latin-wght.woff2` | 200–900 (variable) |
| Manrope   | `manrope-latin-wght.woff2`   | 200–800 (variable) |

Salen del paquete `@fontsource-variable/{unbounded,manrope}@5.3.0`
(`files/*-latin-wght-normal.woff2`, el subconjunto latin de Google Fonts).

Las dos familias se distribuyen bajo la **SIL Open Font License 1.1**; el texto de cada licencia y
su aviso de copyright están en `OFL-Unbounded.txt` y `OFL-Manrope.txt`, junto a los ficheros que
cubren.

Los `@font-face` viven en `src/styles/common.css`, los precarga
`src/neon/layout/NeonFontPreloads.astro` y el service worker los guarda en la caché del shell
(`public/sw.js`). `tests/unit/fonts.test.ts` comprueba que las listas coinciden.
