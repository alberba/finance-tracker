# Playwright

La suite de navegador se divide en recorridos funcionales, smoke, regresión visual y sync-v2. Las
ejecuciones completas prueban el build Cloudflare real servido por Wrangler; smoke, headed y UI usan
Astro dev para arrancar antes.

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
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4321 pnpm test:e2e:smoke
```

## Estabilidad

- Cada prueba recibe un namespace único y no comparte estado con otras pruebas.
- La navegación espera `html[data-finance-ready="true"]`, que señala hidratación y bindings completos.
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

En pull requests, GitHub Actions ejecuta los once recorridos `@smoke` junto al gate de calidad. Los
pushes a `main` y las ejecuciones manuales lanzan la suite completa en dos shards, seguida de las
suites visual y sync-v2 dentro de un mismo job. Los blob reports solo se combinan en el artifact
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

El script (`scripts/e2e-visual-linux.sh`) arranca un dev server propio de este worktree en
`VISUAL_PORT` (4398 por defecto; su log queda en `.wrangler/visual-dev-server.log`) y lo para al
terminar. `pnpm test:e2e:visual` sin `:linux` en macOS compara contra snapshots de otra
plataforma.

## Worktrees

- Un worktree nuevo no tiene `.dev.vars` (está en `.gitignore`): ejecuta `pnpm setup:worktree`.
  Sin `TEST_AUTH_ENABLED` y `LEGACY_OWNER_EMAIL`, cada spec falla en `reset-legacy` con 401/403.
- `pnpm test:e2e` arranca su propio servidor en 4321 (`reuseExistingServer: false`) y falla si ese
  puerto ya está ocupado. Para usar un servidor ya arrancado, pásalo con `PLAYWRIGHT_BASE_URL`.
- Varios worktrees a la vez necesitan puertos distintos: `pnpm dev --port <n>` y
  `PLAYWRIGHT_BASE_URL=http://127.0.0.1:<n>`.
