# Playwright

La suite de navegador se divide en recorridos funcionales, smoke, regresión visual y sync-v2. Todas
corren sobre Astro dev (`playwright.shared.ts`), en local y en CI; ninguna sirve el build de
Wrangler.

## Comandos

```bash
pnpm test:e2e:install       # instala Chromium una vez
pnpm test:e2e:smoke         # recorridos críticos etiquetados @smoke
pnpm test:e2e               # funcional, sin snapshots visuales
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

- Cada prueba recibe un namespace único y no comparte estado con otras pruebas.
- La navegación espera `html[data-finance-ready="true"]`, que señala hidratación y bindings completos.
  Para recargar, `tracker.reload()`; lint rechaza `page.reload()` en los specs.
- Se usan dos workers locales y cuatro en CI, con corte temprano y trace/vídeo únicamente en el
  primer retry.
- `@smoke` identifica recorridos críticos. `@visual` se ejecuta como gate independiente.
- Desktop cubre los flujos funcionales. Pixel 5 cubre móvil, layout y snapshots una sola vez.
- No uses `waitForTimeout`; espera una respuesta, URL, locator o señal explícita de la aplicación.

Si una prueba falla, abre `playwright-report/index.html`. Las trazas se inspeccionan con:

```bash
pnpm exec playwright show-trace test-results/ruta-a-trace.zip
```

## CI

En pull requests, GitHub Actions ejecuta los recorridos `@smoke` junto al gate de calidad. Los
pushes a `main` y a `v2` y las ejecuciones manuales lanzan la suite completa en dos shards, seguida
de las suites visual y sync-v2 dentro de un mismo job. Los blob reports solo se combinan en el artifact
`playwright-report` cuando falla alguna suite completa. Las ejecuciones anteriores de la misma rama
se cancelan y los artifacts se conservan siete días.

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

Los snapshots fuerzan Arial a propósito (`tests/e2e/screenshot-stable.css`). El resto de capturas
(fallos, comparaciones con un diseño) usa las fuentes reales de Google Fonts: el fixture `context`
de `tests/e2e/fixtures.ts` quita la cabecera `X-Test-User-Email` a esas peticiones, porque con ella
el preflight CORS falla y salen fuentes del sistema.

## Worktrees

- Un worktree nuevo no tiene `.dev.vars` (está en `.gitignore`): ejecuta `pnpm setup:worktree`.
  Sin `TEST_AUTH_ENABLED` y `LEGACY_OWNER_EMAIL`, cada spec falla en `reset-legacy` con 401/403.
- `pnpm test:e2e` arranca su propio servidor (`reuseExistingServer: false`) en un puerto derivado
  de la ruta del worktree, así que varios worktrees no chocan. En CI usa 4321 (4322 para sync-v2).
  Para usar un servidor ya arrancado, pásalo con `PLAYWRIGHT_BASE_URL`.
- Astro admite un solo dev server por worktree, sea cual sea el puerto. Los servidores de test
  arrancan con `--ignore-lock` para convivir con el `pnpm dev` del usuario; para uno propio a mano,
  `pnpm dev --port <n> --ignore-lock`. No pares el `pnpm dev` del usuario.
