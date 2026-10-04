# TypeScript 6 y 7

El proyecto usa TypeScript 6.0.3 para Astro/Volar y ESLint, y TypeScript 7.0.2
para comprobar los archivos TypeScript con el compilador nativo. El paquete
`typescript-native` es un alias npm de `typescript`, no una versión preview.

TypeScript 7 todavía no ofrece la API programática que necesitan Astro y Vue.
Por eso se conserva `typescript` en la serie 6.0 y se invocan los compiladores
por su ruta explícita: ambos paquetes publican un ejecutable llamado `tsc`.
No se debe sustituir `astro check` por la comprobación nativa.

- `pnpm check`: ejecuta las dos comprobaciones; también se usa en CI.
- `pnpm check:astro`: validación completa de Astro/Vue mediante TypeScript 6.
- `pnpm check:native`: genera los tipos de Astro y comprueba los archivos `.ts`
  con TypeScript 7, usando `tsconfig.native.json`.
- `pnpm benchmark:types`: compara los dos compiladores sobre esa misma configuración.

La configuración nativa incluye código de aplicación, scripts, configuración y
tests de unidad, integración y E2E. Los componentes `.astro` y `.vue`, y los tests
de componentes que importan `.vue`, permanecen bajo `astro check`; el compilador
nativo no puede comprobar esas plantillas. No se añaden declaraciones genéricas
para ocultar imports de componentes.

La migración a 6 mantiene `types: ["node"]` y la resolución `bundler` heredada
de Astro, sin `ignoreDeprecations`. También se comprobó con `--stableTypeOrdering`
para detectar diferencias respecto al orden de tipos del compilador nativo.
La lectura de `HTMLElement.hidden` del menú de usuario se convierte a booleano
porque los tipos DOM ahora admiten también el valor `"until-found"`.

## Rendimiento medido

Medición local del 4 de octubre de 2026, Apple M1 Pro (8 núcleos), macOS arm64,
Node 24.21.0. Cinco procesos nuevos por compilador, tras un calentamiento para
cada uno, alternando el orden. Sin ejecución concurrente de tests o builds.
Ambos usan `--noEmit --incremental false --extendedDiagnostics` sobre
`tsconfig.native.json`. TypeScript 7 usa su paralelismo predeterminado.

| Compilador       | Mediana de tiempo real | Muestras (s)                      |
| ---------------- | ---------------------: | --------------------------------- |
| TypeScript 6.0.3 |                4,186 s | 4,326; 4,362; 4,176; 4,186; 4,179 |
| TypeScript 7.0.2 |                1,191 s | 1,206; 1,151; 1,295; 1,171; 1,191 |

El compilador nativo tarda un 71,6 % menos: **3,52×** más rápido en esta carga.
Los tiempos incluyen el arranque del proceso, pero no `astro sync`, instalaciones
ni descargas. Son comprobaciones completas con caché de archivos caliente, no
compilaciones incrementales ni mediciones del editor.

El script imprime todas las muestras y la memoria reportada por cada compilador.
Esta última no equivale al pico RSS y la contabilidad de JavaScript y Go difiere;
no permite concluir una reducción real de memoria del proceso.

Para repetir con más muestras: `BENCHMARK_ITERATIONS=10 pnpm benchmark:types`.
No se activa `stableTypeOrdering` en la medición de 6 porque Microsoft advierte
que añade coste y lo recomienda como herramienta de diagnóstico de migración.

Este resultado no mide `astro check`, la build Vite/Astro, el tiempo de CI completo
ni el rendimiento de la aplicación en el navegador. Como `pnpm check` mantiene
Astro y añade la validación nativa, su tiempo total no se reduce por este cambio.
La mejora se aprovecha al ejecutar `pnpm check:native` para obtener feedback rápido
sobre los archivos TypeScript.

## Fuentes

- [Anuncio de TypeScript 6.0](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/): cambios de configuración y `stableTypeOrdering`.
- [Anuncio de TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/): compilador nativo y limitaciones de lenguajes embebidos.
- [TypeScript en Astro](https://docs.astro.build/en/guides/typescript/): validación de plantillas con `astro check`.
