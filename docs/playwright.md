# Playwright

La suite de navegador se divide en recorridos funcionales, smoke, regresión visual y sync-v2. Todas
corren sobre Astro dev (`playwright.shared.ts`), en local y en CI; ninguna sirve el build de
Wrangler.

## Comandos

```bash
pnpm test:e2e:install       # instala Chromium una vez
pnpm test:e2e:smoke         # recorridos críticos etiquetados @smoke
pnpm test:e2e               # funcional, sin snapshots visuales
pnpm test:e2e:shard 1/2    # shard funcional equilibrado por tiempos históricos
pnpm test:e2e:visual        # layout y regresión visual
pnpm test:e2e:sync-v2       # PUBLIC_SYNC_V2=true
pnpm test:e2e:headed        # navegador visible sobre Astro dev
pnpm test:e2e:ui            # interfaz interactiva de Playwright
```

Para probar una URL ya arrancada:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:<puerto> pnpm test:e2e:smoke
```

## Estabilidad

- Las pruebas legacy reinician el blob del propietario antes de cada caso. Un runner usa un
  worker; los runners de CI tienen bases D1 independientes. Sync-v2 prueba usuarios separados.
- La navegación espera `html[data-finance-ready="true"]`, que señala hidratación y bindings completos.
  Para recargar, `tracker.reload()`; lint rechaza `page.reload()` en los specs.
- Cada runner usa un worker, con corte temprano y trace/vídeo únicamente en el primer retry.
  `fullyParallel` en la configuración legacy permite repartir los casos visuales entre shards;
  `workers: 1` mantiene secuencial el acceso al blob dentro de cada runner.
- `@smoke` identifica recorridos críticos. `@visual` se ejecuta como gate independiente.
- Desktop cubre los flujos funcionales. Pixel 5 cubre móvil, layout y snapshots una sola vez.
- No uses `waitForTimeout`; espera una respuesta, URL, locator o señal explícita de la aplicación.

Si una prueba falla, abre `playwright-report/index.html`. Las trazas se inspeccionan con:

```bash
pnpm exec playwright show-trace test-results/ruta-a-trace.zip
```

## CI

Las PR normales ejecutan calidad y smoke. La PR cuya rama es `v2` ejecuta calidad, dos shards
funcionales y sync-v2 en paralelo. Los pushes a `main` o `master` y las ejecuciones manuales añaden
dos shards visuales: los visuales no puntúan en PRs, porque su ruido de antialiasing cuesta más que
lo que aporta; en una PR de rediseño, `pnpm test:e2e:visual:linux` en local o una ejecución manual. Un push a `v2` se valida a través de su PR: no dispara otra ejecución.
La auditoría de dependencias vive en `audit.yml` (semanal y manual).

Los shards funcionales se asignan por duración, manteniendo cada spec en un runner. El historial
en `tests/e2e/functional-durations.json` viene del CI #37229326363 (commit `b40f81a`); cada entrada
contiene milisegundos totales y número de casos. `scripts/e2e-functional-shard.ts` descubre los
specs actuales con Playwright y estima los nuevos con la media por caso, de modo que añadir un
spec no requiere registrarlo para que corra. Para recalibrar, combina los blob reports con
`pnpm exec playwright merge-reports --reporter json <directorio>` y actualiza los totales por spec.

Los visuales se reparten por caso (106 por shard en el momento de este cambio), cada uno en una
D1 independiente. Los casos `@snapshot` fijan `snapshotTime` en el fixture antes de la primera
navegación; los controles de layout mantienen su propio `fixedTime` y las fuentes reales.
El fixture de captura aplica Arial (también al token que lee canvas) antes del primer render y
responde localmente a Google Fonts. El helper espera fuentes/scroll sin volver a abrir la app.

El artifact `playwright-report` combina los blob reports cuando falla funcional, visual o sync.
Las ejecuciones anteriores de la misma rama se cancelan y los artifacts se conservan siete días.
Una ejecución manual con `update_snapshots` solo regenera y commitea los snapshots Linux; no
vuelve a ejecutar calidad, funcional ni sync-v2.

Cloudflare Workers Builds es el despliegue activo. Los builds automáticos y comentarios de PR
del proyecto Pages antiguo `finance-tracker` están desactivados; su sitio `pages.dev` existente
se conserva. Estos ajustes viven en Cloudflare, fuera del workflow de GitHub.

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
`pnpm test:e2e:visual` sin `:linux` en macOS compara contra snapshots de otra plataforma y genera
`*-darwin.png`, que no se versionan.

Sin Docker, los snapshots se regeneran en CI: Actions → CI → _Run workflow_ sobre la rama, con
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
  Sin `TEST_AUTH_ENABLED` y `LEGACY_OWNER_EMAIL`, cada spec falla en `reset-legacy` con 401/403.
- `pnpm test:e2e` arranca su propio servidor (`reuseExistingServer: false`) en un puerto derivado
  de la ruta del worktree, así que varios worktrees no chocan. En CI usa 4321 (4322 para sync-v2).
  Para usar un servidor ya arrancado, pásalo con `PLAYWRIGHT_BASE_URL`.
- Astro admite un solo dev server por worktree, sea cual sea el puerto. Los servidores de test
  arrancan con `--ignore-lock` para convivir con el `pnpm dev` del usuario; para uno propio a mano,
  `pnpm dev --port <n> --ignore-lock`. No pares el `pnpm dev` del usuario.

Playwright comprueba que `node_modules/.pnpm/lock.yaml` coincide con el lockfile del repositorio
antes de lanzar tests. `pnpm check:deps` permite comprobarlo sin abrir un navegador; si falla,
ejecuta `pnpm install --frozen-lockfile`. El script Linux sincroniza dependencias antes de elegir
la imagen de Playwright, para que Chromium coincida con CI.
