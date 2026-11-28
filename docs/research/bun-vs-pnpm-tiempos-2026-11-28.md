# Tiempos de bun frente a pnpm (#536)

Medido el 2026-11-28, justo antes y después de sustituir pnpm 10.26.0 por bun 1.4.2 como gestor
de paquetes. Mismo lockfile (bun migró `pnpm-lock.yaml` y resolvió las mismas 909 versiones), mismo
Node 24 como runtime. MacBook Pro M1 Pro, sin otra carga durante cada medición salvo donde se indica.
Mediana de N ejecuciones cronometradas desde fuera del proceso.

## Local

| Operación                                                      |   pnpm |     bun |     N | Factor |
| -------------------------------------------------------------- | -----: | ------: | ----: | -----: |
| Instalación en frío (caché vacía, sin `node_modules`)          | 31,7 s |  16,8 s |     2 |   1,9× |
| Instalación con caché caliente, sin `node_modules`             | 10,3 s |   2,5 s |   3+3 |     4× |
| Instalación sin cambios (`--frozen-lockfile`)                  |  3,5 s |  0,08 s |   5+5 |    45× |
| Sobrecoste de `run` (`check:deps` menos `node` directo, 48 ms) | 0,20 s | 0,009 s | 10+10 |    22× |
| `gate` (dependencias, lint, tipos, 1996 tests)                 | 62,8 s |  59,9 s |     1 |      ≈ |
| Tamaño de `node_modules` (`du`)                                | 2,5 GB |  1,0 GB |     — |      — |

pnpm se midió dos veces (antes de migrar y en una copia de `HEAD`); las dos rondas difieren menos de un 4 %. El `gate` sigue dominado por Node (ESLint,
`astro check`, Vitest): solo ahorra el sobrecoste de las cuatro invocaciones de `run`, que entra
en el ruido de una ejecución. El tamaño de pnpm incluía los binarios Linux de
`supportedArchitectures`, que ya no hacen falta: desde #420 la imagen Linux de Playwright solo
ejecuta el servidor de Playwright, que es JavaScript puro.

Lo que se nota en el día a día es la instalación sin cambios: `setup:worktree`, el `postinstall`
y cualquier `install` tras cambiar de rama pasan de 3,5 s a menos de una décima.

## Imagen Docker de producción

`docker build --no-cache` de la imagen final (Docker 29.8 en macOS, arm64, como el servidor
Oracle). «Frío» usa una caché de paquetes nueva; «caliente», la que dejó la ejecución anterior,
que es el caso de un despliegue que cambia dependencias.

| Escenario                  |   pnpm (2 rondas) |     bun | Imagen                         |
| -------------------------- | ----------------: | ------: | ------------------------------ |
| Caché de paquetes fría     | 243,6 s / 240,9 s | 228,5 s | —                              |
| Caché de paquetes caliente | 268,1 s / 334,8 s | 118,6 s | —                              |
| Tamaño de la imagen final  |           2,00 GB | 1,51 GB | `node_modules` 1,3 GB → 895 MB |

Las mediciones de Docker tienen mucha varianza (en pnpm la ronda caliente salió más lenta que la
fría, sin causa identificada) y bun tiene una sola ronda: la tendencia es clara, la cifra exacta
no. La imagen adelgaza porque `bun install --production` parte de cero, mientras que
`pnpm prune --prod` dejaba restos en el almacén virtual. El build de Astro pesa lo mismo con los
dos.

## No medido

- CI: el job de setup se ahorra el `npm install --global pnpm` y la instalación sin cambios, pero
  su tiempo real solo se verá en los primeros runs de la PR.
- Arranque del dev server y E2E: los ejecuta Node igual que antes.
