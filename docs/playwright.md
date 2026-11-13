# Playwright

Las reglas de test y E2E están en [TESTING_STANDARDS.md](../TESTING_STANDARDS.md);
este documento es el runbook de la suite de navegador. Si hay contradicción, manda el estándar.

La suite de navegador se divide en recorridos funcionales, smoke, regresión visual y escenarios
especializados de sync v2. Todo cliente autenticado usa sync v2. Funcional y visual ejecutan el
build Node + SQLite de producción; sync-v2 ejecuta el Worker compilado con D1 local, y autenticación
ejecuta otro Worker compilado con proveedores simulados. `playwright.shared.ts` configura los dos primeros
runtimes. Los tres conservan usuarios aislados y las APIs reales de inicialización/importación.

## Comandos

```bash
pnpm test:all               # Vitest + funcional + visual + sync-v2 + auth; máximo 360 s
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
pnpm test:e2e:headed        # navegador visible sobre el build Node
pnpm test:e2e:ui            # interfaz interactiva de Playwright
```

`test:all` ejecuta Vitest en el host y los navegadores en la imagen Linux oficial de Playwright,
con la versión instalada de `@playwright/test`. El runner y los servidores permanecen en el host,
con su Node y sus addons nativos; Playwright conecta Chromium por WebSocket y expone solo la red
loopback del cliente. Así macOS y Linux comparan los mismos píxeles sin sustituir el addon SQLite
del desarrollador. Requiere dependencias instaladas y Docker arrancado;
descarga la imagen la primera vez. Prepara esa imagen antes de medir (el equivalente a instalar
Chromium) con la etiqueta que deriva el script de la versión instalada:

`docker pull mcr.microsoft.com/playwright:v$(node -p 'require("@playwright/test/package.json").version')-noble`

La descarga inicial no es una medición de la suite. En CI cada job instala el Chromium de la versión
de `@playwright/test` del lockfile y lo restaura de una caché cuya clave es esa versión.

El comando devuelve error si hay fallos o supera 360 segundos. Guarda el resultado y los tiempos
por fase en `.scratch/test-suite/last-run.json`; los tiempos de navegador están en `browser-run.json`.
También conserva un JSON fechado por invocación para demostrar ejecuciones consecutivas.
No incluye lint/typecheck: para el gate de contribución sigue aplicando `pnpm gate`.
Los comandos acotados sirven para iterar; la comparación de píxeles usa la imagen Linux para fijar
fuentes y controles de fecha nativos, también en distribuciones Linux distintas de Ubuntu.

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
  prueba mediante el formato de backup v2. Los runners de CI tienen bases SQLite/D1 independientes.
- La navegación espera `html[data-finance-ready="true"]`, que señala hidratación y bindings completos.
  Para recargar, `tracker.reload()`; lint rechaza `page.reload()` en los specs.
- Funcional/visual paralelizan escenarios sobre usuarios y contextos propios. Autenticación conserva
  un worker porque sus pruebas modifican la política global; sync-v2 conserva su planificación serial.
  Trace y vídeo conservan su función diagnóstica. Los shards visuales distribuyen casos con Playwright.
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

## Fixture y excepciones

Cada escenario autenticado importa `test` de `tests/e2e/fixtures.ts`: el fixture crea un usuario
aislado (`testUserEmail`, cabecera `X-Test-User-Email`) y `tracker` inicializa su espacio por la API
antes de abrir la app. Para fijar «hoy», `test.use({ fixedTime: '...' })` antes del primer render.
Un escenario sin `tracker` sigue usando ese `test` y toma la identidad de `testUserEmail`:

- **Varios contextos o dispositivos** (`multi-user-isolation`, `offline-sync`, `bitvavo`): `tracker`
  enlaza un usuario a la página por defecto, así que cada contexto se abre con `browser.newContext`,
  deriva su identidad de `testUserEmail` (`testUserEmail.replace(/^pw-/, 'pw-<etiqueta>-')`) y se
  inicializa por la API.
- **Primera presentación de un usuario sin tocar** (`onboarding`): `tracker` completa la bienvenida
  antes del primer render, así que el spec usa `testUserEmail` e inicializa por la API sin `tracker`.

Excepción real a la regla 15: `authentication.spec.ts` importa `test` de `@playwright/test`. Prueba el
registro, el acceso y las sesiones de Better Auth sin sesión previa y el fixture inyectaría
`X-Test-User-Email` en todo contexto, lo que sustituiría el flujo bajo prueba. Su cabecera lo declara.

Los selectores de estructura viven en `tests/e2e/pages/` (regla 14). Un locator que un spec solo usa
en una aserción puntual puede ser user-facing (rol, etiqueta, texto); los `focus` de los visuales son
cadenas CSS de configuración, no locators de aserción.

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
shards, sync-v2 y visual en tres shards, los lunes a las 05:00 UTC y bajo demanda con
`workflow_dispatch` sobre la rama seleccionada. No forma parte del gate de entrega ni dispara
el despliegue. Para cambios de riesgo, ejecuta este workflow en la rama de la PR antes de mezclar;
los fallos programados quedan visibles en Actions y en las notificaciones de GitHub del workflow.
Los snapshots siguen requiriendo inspección visual antes de actualizarse.

Antes de abrir la PR, aplica la [validación según el cambio](../CONTRIBUTING.md#antes-de-abrir-el-pr):
solo texto documental requiere revisión de enlaces, instrucciones, formato y diff;
código, configuración o contenido ejecutable requieren gate y smoke en secuencia.
Los jobs de navegador corren en `ubuntu-latest` e instalan con `playwright install --with-deps` el
Chromium que corresponde a `@playwright/test` en el lockfile: no hay etiqueta de imagen que
actualizar, así que un bump del paquete trae su navegador solo. Las fuentes de la interfaz se sirven
desde `public/fonts`, así que el render no depende de las fuentes del sistema; los snapshots de la
paleta de emoji toleran unos píxeles porque cada glifo lo dibuja la fuente de emoji del sistema y
cambia entre versiones. El setup común (pnpm,
Node, install con lockfile, incluido el addon SQLite precompilado, y la caché de Chromium por
versión de Playwright) vive en `.github/actions/setup`. El job final comprueba el tiempo desde el
inicio del workflow, incluida la preparación y espera de runners, contra el presupuesto de
360 segundos.
La auditoría de dependencias vive en `audit.yml` (semanal y manual).

Los cuatro shards funcionales se asignan por duración, manteniendo cada spec en un runner. El historial
en `tests/e2e/functional-durations.json` viene del CI #37229326363 (commit `b40f81a`); cada entrada
contiene milisegundos totales y número de casos. `scripts/e2e-functional-shard.ts` descubre los
specs actuales con Playwright y estima los nuevos con la media por caso, de modo que añadir un
spec no requiere registrarlo para que corra. Para recalibrar, combina los blob reports con
`pnpm exec playwright merge-reports --reporter json <directorio>` y actualiza los totales por spec.

Los visuales se reparten por caso entre tres shards, cada uno con SQLite temporal independiente. Los casos
`@snapshot` fijan `snapshotTime` en el fixture antes de la primera navegación; los controles de
layout mantienen su propio `fixedTime` y las fuentes reales.
El fixture de captura aplica Arial (también al token que lee canvas) antes del primer render. Las
fuentes se sirven desde el propio dominio y el helper espera fuentes/scroll sin volver a abrir la app.
Los rails de pestañas fijan su posición antes de capturar; no heredan el scroll del clic ni del
cambio de fuente. Los visuales conservan diff y trace, con vídeo desactivado para que el cursor
de diagnóstico no contamine los píxeles del retry.

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

El script (`scripts/e2e-visual-linux.sh`) necesita Docker en marcha y conecta al mismo Chromium
Linux que `test:all`. El servidor de la app corre en el host; no modifica `dist/`, `.dev.vars` ni
las dependencias nativas del desarrollador.
`pnpm test:e2e:visual` sin `:linux` en macOS compara contra snapshots de otra plataforma y genera
`*-darwin.png`, que no se versionan.

Sin Docker, los snapshots se regeneran en CI: Actions → Browser regression → _Run workflow_ sobre la rama, con
`update_snapshots` marcado. El job visual regenera los `*-linux.png` y los commitea en esa rama.

Los snapshots fuerzan Arial a propósito (`tests/e2e/screenshot-stable.css`), desde el primer
render, y no dependen de la descarga de fuentes. El resto de capturas (fallos, comparaciones con
un diseño) usa las fuentes reales, servidas desde el propio dominio: el fixture ya no necesita
interceptar Google Fonts.

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

Las fusiones de #416 conservan esta cobertura:

- 51 chequeos de layout móvil pasan al escenario que ya abre esa misma vista para capturarla.
  Se escanea con las fuentes reales antes de hacer scroll de captura; para los píxeles se restaura
  Arial. Las geometrías de escritorio mantienen casos propios. Las capturas mantienen fecha e
  identidad. Solo se corrigen los dos baselines de «Más», desfasados respecto a «Mis reportes».
- Las 48 parejas claro/oscuro de vistas de producto se capturan en el mismo escenario. Cambiar el
  medio de color no exige importar datos ni abrir otra app. Los menús del shell conservan casos
  separados porque muestran la identidad del usuario.
- El panel de edición recurrente conserva geometría móvil y desktop. Su formulario comparte
  estructura con el panel de creación, cuyo snapshot claro/oscuro sigue activo; editar y persistir
  se comprueba en `investment-recurring.spec.ts`. Se retiran sus dos capturas redundantes,
  que además retenían el scroll anterior al arreglo #382.
- Los diez contratos de autenticación sin variación responsive se ejecutan en desktop. Móvil
  conserva los tres smoke: acceso protegido, fuentes y alta por invitación. Política, sesiones,
  recuperación, OAuth y passkeys no necesitan repetir la misma prueba por viewport.

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
ejecuta `pnpm install --frozen-lockfile`. El script Linux comprueba dependencias antes de arrancar
Chromium y deriva la etiqueta de la imagen de la versión instalada de `@playwright/test`, así que no
hay que actualizarla a mano cuando sube el paquete.

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
