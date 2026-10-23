# Playwright

La suite de navegador se divide en recorridos funcionales, smoke, regresión visual y escenarios
especializados de sync v2. Todo cliente autenticado usa sync v2; todos los grupos corren sobre Astro
dev (`playwright.shared.ts`), en local y en CI; ninguno sirve el build de Wrangler.

## Comandos

```bash
pnpm test:e2e:install       # instala Chromium una vez
pnpm test:e2e:smoke         # recorridos críticos etiquetados @smoke
pnpm test:e2e               # funcional, sin snapshots visuales
pnpm test:e2e:shuffle       # funcional, en orden aleatorio; imprime la semilla
pnpm test:e2e:install:all   # instala también Firefox y WebKit
pnpm test:e2e:cross-browser # smoke opcional en Firefox y WebKit
pnpm test:e2e:webmcp       # herramientas de la app, en Chromium experimental
pnpm test:e2e:shard 1/4    # shard funcional equilibrado por tiempos históricos
pnpm test:e2e:visual        # layout y regresión visual
pnpm test:e2e:sync-v2       # offline, multiusuario y comandos de sync
pnpm test:e2e:headed        # navegador visible sobre Astro dev
pnpm test:e2e:ui            # interfaz interactiva de Playwright
```

Para probar una URL ya arrancada:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:<puerto> pnpm test:e2e:smoke
```

Para buscar dependencias accidentales entre escenarios, usa `pnpm test:e2e:shuffle`. Repite el
orden pasando la semilla que imprime Playwright: `pnpm test:e2e:shuffle 271828182`. También puedes
acotar la comprobación a smoke: `pnpm test:e2e:smoke --shuffle 271828182`.

Firefox y WebKit están configurados con `default: false`: las ejecuciones habituales conservan
Chromium y Pixel 5. Tras instalar los navegadores con `pnpm test:e2e:install:all`, selecciona uno
con `pnpm test:e2e --project=firefox` o `pnpm test:e2e --project=webkit`. Los proyectos opcionales
comparten los escenarios de desktop; los visuales solo mantienen baselines de Chromium y Pixel 5.
`pnpm test:e2e --project='*'` incluye todos los proyectos.

## Estabilidad

- Cada escenario crea un usuario aislado, inicializa su espacio por la API y carga los datos de
  prueba mediante el formato de backup v2. Los runners de CI tienen bases D1 independientes.
- La navegación espera `html[data-finance-ready="true"]`, que señala hidratación y bindings completos.
  Para recargar, `tracker.reload()`; lint rechaza `page.reload()` en los specs.
- Cada runner usa un worker, con corte temprano, trace del primer fallo y vídeo en el primer retry.
  Los shards visuales reparten escenarios por duración.
- En CI, un caso que solo pasa al reintentarlo también falla el gate (`failOnFlakyTests`).
  El reintento conserva su función diagnóstica; no convierte una carrera en un resultado verde.
- Los vídeos del runtime compartido se graban a 30 fps con cursor, resaltado del objetivo y título
  de acción. Firefox y WebKit capturan hasta 25 fps. En local, añade `--retries=1` para grabar el
  reintento de un fallo.
- `@smoke` identifica recorridos críticos. `@visual` se ejecuta como gate independiente.
- Desktop cubre los flujos funcionales. Pixel 5 cubre móvil, layout y snapshots una sola vez.
- No uses `waitForTimeout`; espera una respuesta, URL, locator o señal explícita de la aplicación.

Si una prueba falla, abre `playwright-report/index.html`. Las trazas se inspeccionan con:

```bash
pnpm exec playwright show-trace test-results/ruta-a-trace.zip
```

## CI

Una PR ejecuta calidad en tres jobs paralelos (lint y typecheck, Vitest sin cobertura,
y migraciones D1 más build) y un único job de navegador: `@smoke` de la app y `@smoke` de
autenticación. No necesita labels. Los cambios que solo modifican Markdown no disparan CI;
los scripts y la configuración dentro de `docs/` sí lo hacen. Añadir un label no repite el CI.

Los pushes a `main` ejecutan solo los tres jobs de calidad sobre el merge real. Esto conserva
la validación de cambios combinados y de pushes directos, porque `main` no tiene protección.
El despliegue de Oracle espera ese CI verde, sin repetir ningún navegador. Una ejecución manual
de **CI** ejecuta calidad y no dispara despliegue.

**Browser regression** (`browser-regression.yml`) ejecuta auth completa, funcional en cuatro
shards, sync-v2 y visual en tres shards, los lunes a las 05:00 UTC y bajo demanda con
`workflow_dispatch` sobre la rama seleccionada. No forma parte del gate de entrega ni dispara
el despliegue. Para cambios de riesgo, ejecuta este workflow en la rama de la PR antes de mezclar;
los fallos programados quedan visibles en Actions y en las notificaciones de GitHub del workflow.
Los snapshots siguen requiriendo inspección visual antes de actualizarse.

Antes de abrir la PR, aplica la [validación según el cambio](../CONTRIBUTING.md#antes-de-abrir-el-pr):
solo texto documental requiere revisión de enlaces, instrucciones, formato y diff;
código, configuración o contenido ejecutable requieren gate y smoke en secuencia.
Los jobs de navegador corren dentro de la imagen oficial de Playwright
(`mcr.microsoft.com/playwright:v1.64.0-noble`), que ya trae Chromium y sus librerías: sin
`apt-get` por ejecución. Esa etiqueta debe seguir a `@playwright/test` en `package.json`. El setup
común (pnpm, Node e install con lockfile) vive en `.github/actions/setup`.
La auditoría de dependencias vive en `audit.yml` (semanal y manual).

Los cuatro shards funcionales se asignan por duración, manteniendo cada spec en un runner. El historial
en `tests/e2e/functional-durations.json` viene del CI #37229326363 (commit `b40f81a`); cada entrada
contiene milisegundos totales y número de casos. `scripts/e2e-functional-shard.ts` descubre los
specs actuales con Playwright y estima los nuevos con la media por caso, de modo que añadir un
spec no requiere registrarlo para que corra. Para recalibrar, combina los blob reports con
`pnpm exec playwright merge-reports --reporter json <directorio>` y actualiza los totales por spec.

Los visuales se reparten por caso entre tres shards, cada uno en una D1 independiente. Los casos
`@snapshot` fijan `snapshotTime` en el fixture antes de la primera navegación; los controles de
layout mantienen su propio `fixedTime` y las fuentes reales.
El fixture de captura aplica Arial (también al token que lee canvas) antes del primer render y
responde localmente a Google Fonts. El helper espera fuentes/scroll sin volver a abrir la app.

El artifact `playwright-report` combina los blob reports cuando falla funcional, visual o sync.
Las ejecuciones anteriores de la misma rama se cancelan y los artifacts se conservan siete días.
Una ejecución manual con `update_snapshots` solo regenera y commitea los snapshots Linux; no
vuelve a ejecutar calidad, funcional ni sync-v2.

El despliegue usa un workflow independiente: ver `docs/operations/self-hosting.md`.

Los snapshots versionados son `*-linux.png`, la plataforma de CI. En macOS se comparan y
actualizan dentro de la imagen Linux de Playwright con Docker, después de revisar el resultado
visual:

```bash
pnpm test:e2e:visual:linux                      # compara
pnpm test:e2e:visual:linux --update-snapshots   # regenera
pnpm test:e2e:visual:linux tests/e2e/layout-visual.spec.ts --project=mobile-chrome
```

El script (`scripts/e2e-visual-linux.sh`) necesita Docker en marcha y falla al principio si no
responde. Arranca un dev server propio de este worktree en `VISUAL_PORT` (por defecto, uno derivado
de la ruta del worktree; el log queda en `.wrangler/visual-dev-server.log`) y lo para al terminar.
`pnpm-workspace.yaml` instala también los binarios nativos de Linux
(`supportedArchitectures`) para que `node_modules` funcione dentro del contenedor.
`pnpm test:e2e:visual` sin `:linux` en macOS compara contra snapshots de otra plataforma y genera
`*-darwin.png`, que no se versionan.

Sin Docker, los snapshots se regeneran en CI: Actions → Browser regression → _Run workflow_ sobre la rama, con
`update_snapshots` marcado. El job visual regenera los `*-linux.png` y los commitea en esa rama.

Los snapshots fuerzan Arial a propósito (`tests/e2e/screenshot-stable.css`), desde el primer
render, y no dependen de descargas de Google Fonts. El resto de capturas
(fallos, comparaciones con un diseño) usa las fuentes reales de Google Fonts: el fixture `context`
de `tests/e2e/fixtures.ts` quita la cabecera `X-Test-User-Email` a esas peticiones, porque con ella
el preflight CORS falla y salen fuentes del sistema.

## Worktrees

- Antes de probar un worktree nuevo o después de cambiar de rama/lockfile, ejecuta
  `pnpm setup:worktree`: sincroniza dependencias con `--frozen-lockfile`, prepara `.dev.vars`
  y aplica migraciones. El setup también sincroniza un `node_modules` que ya exista.
  Sin `TEST_AUTH_ENABLED`, las llamadas de autenticación de test no inicializan el usuario aislado.
  Las identidades de prueba no tienen privilegios especiales de propietario.
- `pnpm test:e2e` arranca su propio servidor (`reuseExistingServer: false`) en un puerto derivado
  de la ruta del worktree, así que varios worktrees no chocan. En CI usa 4321 (4322 para sync-v2).
  Para usar un servidor ya arrancado, pásalo con `PLAYWRIGHT_BASE_URL`.
- Astro admite un solo dev server por worktree, sea cual sea el puerto. Los servidores de test
  arrancan con `--ignore-lock` para convivir con el `pnpm dev` del usuario; para uno propio a mano,
  `pnpm dev --port <n> --ignore-lock`. No pares el `pnpm dev` del usuario.

Para saber si un fallo ya existía, lanza el spec en un worktree de `main`; `git stash` usa una
pila compartida entre worktrees y no se toca:

```bash
git worktree add ../baseline main && cd ../baseline && pnpm setup:worktree
pnpm test:e2e tests/e2e/<spec>.spec.ts
```

Playwright comprueba que `node_modules/.pnpm/lock.yaml` coincide con el lockfile del repositorio
antes de lanzar tests. `pnpm check:deps` permite comprobarlo sin abrir un navegador; si falla,
ejecuta `pnpm install --frozen-lockfile`. El script Linux sincroniza dependencias antes de elegir
la imagen de Playwright, para que Chromium coincida con CI.

## WebMCP

La app registra tres herramientas de consulta mediante `document.modelContext` después de cargar
la sesión o el demo. Leen la proyección actual del cliente, incluidos los cambios locales pendientes
de sincronizar. No modifican datos ni cambian filtros de la interfaz:

- `get_budget`: presupuesto del año configurado, con los mismos cálculos que la interfaz.
- `get_month_totals`: ingresos, gastos, inversión y neto de un año y mes contable.
- `search_movements`: búsqueda por descripción o categoría, con filtros opcionales de año contable,
  mes y tipo; paginación mediante `offset` y `limit` (25 por defecto, máximo 100).

Los parámetros de mes usan 1–12. Las celdas del resultado de `get_budget` conservan los índices
0–11 del view-model. Las monedas no se convierten; la búsqueda devuelve la moneda de cada
movimiento y los totales siguen el comportamiento del registro.

El navegador debe tener abierta la app con una sesión autenticada o el demo y soporte WebMCP
experimental. Sin esa API, la app funciona igual y omite el registro de herramientas. Al cerrar
sesión, la navegación al login elimina las herramientas del documento anterior.

Con el CLI incluido en Playwright, abre la app y luego consulta sus herramientas:

```bash
pnpm exec playwright cli open 'http://127.0.0.1:4321/dashboard?demo=1'
pnpm exec playwright cli webmcp-list
pnpm exec playwright cli webmcp-call search_movements --params '{"query":"comida","limit":10}'
pnpm exec playwright cli webmcp-call get_month_totals --params '{"year":2026,"month":1}'
pnpm exec playwright cli webmcp-call get_budget
```

Usa el puerto real de tu dev server. El MCP y CLI de Playwright habilitan WebMCP por defecto.
La spec `webmcp.spec.ts` activa `--enable-features=WebMCP` en Chromium y comprueba consultas,
cambios desde la UI y cierre de sesión con la API real de Playwright. La referencia es la
[documentación oficial de WebMCP de Playwright](https://playwright.dev/docs/api/class-webmcp).
