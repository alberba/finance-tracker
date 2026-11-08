# Playwright

La suite de navegador se divide en recorridos funcionales, smoke y escenarios especializados de
sync v2. Cada E2E prueba un recorrido; las reglas están en los
[criterios E2E de los estándares](../CODING_STANDARDS.md#e2e). Todo cliente autenticado usa sync v2.
Funcional ejecuta el build Node + SQLite de producción; sync-v2 ejecuta el Worker compilado con D1
local, y autenticación ejecuta otro Worker compilado con proveedores simulados.
`playwright.shared.ts` configura los dos primeros runtimes. Los tres conservan usuarios aislados y
las APIs reales de inicialización/importación.

## Comandos

```bash
pnpm test:all               # Vitest + funcional + sync-v2 + auth; máximo 360 s
pnpm test:e2e:install       # instala Chromium una vez
pnpm test:e2e:smoke         # recorridos críticos etiquetados @smoke
pnpm test:e2e               # funcional
pnpm test:e2e:shuffle       # funcional, en orden aleatorio; imprime la semilla
pnpm test:e2e:install:all   # instala también Firefox y WebKit
pnpm test:e2e:cross-browser # smoke opcional en Firefox y WebKit
pnpm test:e2e:webmcp       # herramientas de la app, en Chromium experimental
pnpm test:e2e:shard 1/4    # shard funcional equilibrado por tiempos históricos
pnpm test:e2e:sync-v2       # offline, multiusuario y comandos de sync
pnpm test:e2e:headed        # navegador visible sobre el build Node
pnpm test:e2e:ui            # interfaz interactiva de Playwright
```

`test:all` ejecuta Vitest en el host y los navegadores en la imagen Linux oficial de Playwright,
con la versión instalada de `@playwright/test`. El runner y los servidores permanecen en el host,
con su Node y sus addons nativos; Playwright conecta Chromium por WebSocket y expone solo la red
loopback del cliente. Así macOS y Linux ejecutan el mismo Chromium sin sustituir el addon SQLite
del desarrollador. Requiere dependencias instaladas y Docker arrancado;
descarga la imagen la primera vez. Prepara esa imagen antes de medir (el equivalente a instalar
Chromium): `docker pull mcr.microsoft.com/playwright:v1.64.1-noble`. La descarga inicial no es una
medición de la suite. En CI usa directamente el contenedor del job.

El comando devuelve error si hay fallos o supera 360 segundos. Guarda el resultado y los tiempos
por fase en `.scratch/test-suite/last-run.json`; los tiempos de navegador están en `browser-run.json`.
También conserva un JSON fechado por invocación para demostrar ejecuciones consecutivas.
No incluye lint/typecheck: para el gate de contribución sigue aplicando `pnpm gate`.
Los comandos acotados sirven para iterar.

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
comparten los escenarios de desktop.
`pnpm test:e2e --project='*'` incluye todos los proyectos.

## Estabilidad

- Cada escenario crea un usuario aislado, inicializa su espacio por la API y carga los datos de
  prueba mediante el formato de backup v2. Los runners de CI tienen bases SQLite/D1 independientes.
- La navegación espera `html[data-finance-ready="true"]`, que señala hidratación y bindings completos.
  Para recargar, `tracker.reload()`; lint rechaza `page.reload()` en los specs.
- Funcional paraleliza escenarios sobre usuarios y contextos propios. Autenticación conserva
  un worker porque sus pruebas modifican la política global; sync-v2 conserva su planificación serial.
  Trace y vídeo conservan su función diagnóstica.
- En CI, un caso que solo pasa al reintentarlo también falla el gate (`failOnFlakyTests`).
  El reintento conserva su función diagnóstica; no convierte una carrera en un resultado verde.
- Los vídeos del runtime compartido se graban a 30 fps con cursor, resaltado del objetivo y título
  de acción. Firefox y WebKit capturan hasta 25 fps. En local, añade `--retries=1` para grabar el
  reintento de un fallo.
- `@smoke` identifica recorridos críticos.
- Desktop cubre los flujos funcionales. Pixel 5 cubre el smoke móvil una sola vez.
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

En los pushes a `main`, `Reuse validated PR` busca un run de **CI** de PR terminado en verde,
para el head de la PR que produjo ese merge. Descarga su artifact `validated-tree` (siete días)
y compara el árbol Git realmente probado con el del push: incluye código, configuración y workflows.
Un árbol idéntico reutiliza la validación y omite lint/tipos, Vitest y migraciones. Si cambió el
contenido del merge, es un push directo, caducó el artifact o falla la consulta a GitHub, se ejecutan
esos checks de respaldo. Nunca se reutiliza un run fallido o incompleto.

El build de CI se ejecuta en PR y ejecuciones manuales, nunca en push: el despliegue ya construye
la imagen Docker del commit mezclado antes de recrear el contenedor. El despliegue de Oracle espera
el CI verde del push (validación reutilizada o checks de respaldo), sin repetir navegadores.
Una ejecución manual de **CI** ejecuta calidad y build y no dispara despliegue.

**Browser regression** (`browser-regression.yml`) ejecuta Vitest, autenticación, funcional en cuatro
shards y sync-v2, los lunes a las 05:00 UTC y bajo demanda con
`workflow_dispatch` sobre la rama seleccionada. No forma parte del gate de entrega ni dispara
el despliegue. Para cambios de riesgo, ejecuta este workflow en la rama de la PR antes de mezclar;
los fallos programados quedan visibles en Actions y en las notificaciones de GitHub del workflow.

Antes de abrir la PR, aplica la [validación según el cambio](../CONTRIBUTING.md#antes-de-abrir-el-pr):
solo texto documental requiere revisión de enlaces, instrucciones, formato y diff;
código, configuración o contenido ejecutable requieren gate y smoke en secuencia.
Los jobs de navegador corren dentro de la imagen oficial de Playwright
(`mcr.microsoft.com/playwright:v1.64.1-noble`), que ya trae Chromium y sus librerías: sin
`apt-get` por ejecución. Esa etiqueta debe seguir a `@playwright/test` en `package.json`. El setup
común (pnpm, Node e install con lockfile, incluido el addon SQLite precompilado) vive en
`.github/actions/setup`. El job final comprueba el tiempo desde el inicio del workflow, incluida
la preparación y espera de runners, contra el presupuesto de 360 segundos.
La auditoría de dependencias vive en `audit.yml` (semanal y manual).

Los cuatro shards funcionales se asignan por duración, manteniendo cada spec en un runner. El historial
en `tests/e2e/functional-durations.json` viene del CI #37229326363 (commit `b40f81a`); cada entrada
contiene milisegundos totales y número de casos. `scripts/e2e-functional-shard.ts` descubre los
specs actuales con Playwright y estima los nuevos con la media por caso, de modo que añadir un
spec no requiere registrarlo para que corra. Para recalibrar, combina los blob reports con
`pnpm exec playwright merge-reports --reporter json <directorio>` y actualiza los totales por spec.

El artifact `playwright-report` combina los blob reports cuando falla funcional o sync.
Las ejecuciones anteriores de la misma rama se cancelan y los artifacts se conservan siete días.
El despliegue usa un workflow independiente: ver `docs/operations/self-hosting.md`.

## Mantener el presupuesto

Antes de añadir escenarios, aplica los [criterios E2E de los estándares](../CODING_STANDARDS.md#e2e).
El coste dominante era repetir preparación y arranque: D1 emulada añade un intercambio entre
procesos a cada consulta y la importación hace muchas. Los recorridos de producto ahora usan
SQLite transaccional del runtime de producción; Worker/D1 sigue cubierto por sync y auth.
Los runtimes de navegador corren en paralelo, con puertos, bases, builds y cachés independientes.
La suite completa detectó además una vinculación de movimientos que solo se guardaba localmente:
`market.linkExistingMovements` ahora encola el comando compartido después de confirmar la identidad
del símbolo recién creado. El round-trip comprueba el reinicio y el E2E existente verifica la recarga.
Ese E2E espera la respuesta del comando de vinculación: el estado global «Sincronizado» no confirma
una operación que otro módulo todavía está construyendo.

Después de cambiar la infraestructura, ejecuta tres veces `pnpm test:all` y tres veces Browser
regression sobre el mismo commit. Guarda resultados, duración y enlaces de CI; un retry exitoso
no cuenta como estabilidad. Si se excede el presupuesto, revisa primero los arranques repetidos,
la capa de prueba y el aislamiento antes de modificar concurrencia.

## Worktrees

- Antes de probar un worktree nuevo o después de cambiar de rama/lockfile, ejecuta
  `pnpm setup:worktree`: sincroniza dependencias con `--frozen-lockfile`, prepara `.dev.vars`
  y aplica migraciones. El setup también sincroniza un `node_modules` que ya exista.
  Sin `TEST_AUTH_ENABLED`, las llamadas de autenticación de test no inicializan el usuario aislado.
  Las identidades de prueba no tienen privilegios especiales de propietario.
- `pnpm test:e2e` arranca su propio servidor (`reuseExistingServer: false`) en un puerto derivado
  de la ruta del worktree. En CI usa 4321 (4322 para sync-v2). Para un servidor ya arrancado,
  pásalo con `PLAYWRIGHT_BASE_URL`.
- Las compilaciones y las cachés Vite de los tests viven en `.scratch/`, separadas de `dist/` y
  del dev server del usuario. Las bases de datos son temporales por invocación y se borran al salir.
  D1 usa tmpfs en Linux para evitar fsync por fila al preparar datos; los contenedores reservan 1 GiB
  de memoria compartida. `PLAYWRIGHT_STORAGE_DIR` permite elegir otro directorio temporal.
- El Worker de auth tiene su propia caché y compilación. No pares el `pnpm dev` del usuario.

Para saber si un fallo ya existía, lanza el spec en un worktree de `main`; `git stash` usa una
pila compartida entre worktrees y no se toca:

```bash
git worktree add ../baseline main && cd ../baseline && pnpm setup:worktree
pnpm test:e2e tests/e2e/<spec>.spec.ts
```

Playwright comprueba que `node_modules/.pnpm/lock.yaml` coincide con el lockfile del repositorio
antes de lanzar tests. `pnpm check:deps` permite comprobarlo sin abrir un navegador; si falla,
ejecuta `pnpm install --frozen-lockfile`.

## WebMCP

La app registra tres herramientas de consulta mediante `document.modelContext` después de cargar
la sesión o el demo. Leen la proyección actual del cliente, incluidos los cambios locales pendientes
de sincronizar. No modifican datos ni cambian filtros de la interfaz:

- `get_budget`: presupuesto del año configurado, con los mismos cálculos que la interfaz.
- `get_month_totals`: ingresos, gastos, inversión y neto de un año y mes contable.
- `search_movements`: búsqueda por descripción o categoría, con filtros opcionales de año contable,
  mes y tipo; paginación mediante `offset` y `limit` (25 por defecto, máximo 100).

Los parámetros y los resultados usan meses de 1 a 12 (enero = 1), también en las celdas de
`get_budget` (ADR 0008). Las monedas no se convierten; la búsqueda devuelve la moneda de cada
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
