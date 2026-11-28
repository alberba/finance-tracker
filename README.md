# Finance Tracker (Astro + bun)

Tracker financiero web para presupuestos, patrimonio, inversiones y objetivos.

## Qué incluye

- Dashboard mensual/anual (ingresos, gastos, inversión, patrimonio, crecimiento)
- Registro de movimientos por mes (ingreso/gasto/inversión)
- Presupuesto por categoría y comparación contra real
- Patrimonio total con snapshots mensuales (liquidez, inversión, pasivos)
- Módulo de inversión con distribución de activos y aportes
- Objetivos con barra de progreso y ritmo mensual necesario
- Configuración editable de cuentas, activos y categorías
- Exportación/importación JSON + exportación CSV de movimientos
- Informe mensual de movimientos por periodo, en PDF y CSV, desde Movimientos → Exportar
- Persistencia autenticada en sync v2; la demo conserva su estado local aislado
- Cotizaciones server-side para instrumentos configurados y movimientos recurrentes con revisión explícita

## Estructura principal

- `src/pages/index.astro`: página principal de Astro
- `src/scripts/app.ts`: runtime del tracker (TypeScript)
- `src/lib/finance-core.ts`: lógica financiera tipada (TypeScript)
- `src/data/seed.json`: datos semilla sintéticos y neutros
- `src/data/seed.ts`: wrapper TypeScript para importar el seed desde cliente y servidor
- `src/styles/`: `global.css` (entrada) y `common.css` (fuentes, reset); los tokens, en `src/neon/styles/neon.css`
- `scripts/extract_excel_seed.py`: script para regenerar el seed desde un `.xlsx`

## Ejecutar en OrbStack (Docker)

```sh
bun run local:setup
bun run local:up
```

`local:up` usa Astro en desarrollo con hot reload; `bun run local:up:prod` prueba la compilación de producción.
Abre la URL que muestra `local:up` y usa el correo y la contraseña de `.env.selfhost`.
Cada worktree usa su propio puerto y volumen; el checkout principal usa el puerto 4321.
SQLite se guarda en un volumen persistente. `local:up` usa el target `development`; `local:up:prod` usa la imagen de producción (Oracle).
Consulta [la guía de ejecución local y self-hosting](docs/operations/self-hosting.md).

## Ejecutar en local (Astro)

```bash
bun install
bun run setup:worktree
bun run dev
```

`bun run setup:worktree` crea `.dev.vars` (con el atajo de autenticación de test) y aplica las
migraciones D1 locales de v2. Sirve igual en el checkout principal que en un worktree.

En local `http://localhost:4321` carga, pero sus llamadas a `/api/*` responden 401 sin sesión de
Better Auth (los contratos están en [autenticación](docs/operations/authentication.md)). Para entrar:

- `http://localhost:4321/?demo=1`: la demo con datos sintéticos.
- Con la cabecera `X-Test-User-Email: developer@e2e.test`: tus datos locales, como en los E2E.
  Por ejemplo, `agent-browser open http://localhost:4321 --headers '{"X-Test-User-Email":"developer@e2e.test"}'`.

### Mercado y reglas recurrentes

Configura el símbolo de cada activo en la columna «Cotización» de `Configuración → Activos`. Si sus movimientos llevan símbolo y el activo aún no tiene uno, la columna propone el de Yahoo («Usar XDWH.DE», «Usar BTC-EUR»): la misma acción en una bolsa en euros antes que en EE. UU. o Londres, y una criptomoneda en euros. Yahoo Finance es el proveedor por defecto y no necesita clave: usa símbolos de Yahoo como `VWCE.DE`, `AGED.MI` o `BTC-EUR`. Un fondo también se puede enlazar por su ISIN o su código de Morningstar (`0P…`): si Yahoo no lo cotiza, el valor liquidativo diario sale de Morningstar, también sin clave. Las cotizaciones y la búsqueda se consultan en el servidor mediante `yahoo-finance2`; la librería no se envía al navegador. CoinGecko, opcional, requiere `COINGECKO_API_KEY` en el `.env` de producción ([self-hosting](docs/operations/self-hosting.md#producción-en-oracle)) o en `.dev.vars` en local.

`MARKET_DATA_PROVIDER`, `MARKET_QUOTE_STALE_MINUTES` y `MARKET_QUOTE_CACHE_SECONDS` son variables públicas de runtime (en producción, del `.env`; en desarrollo, de `wrangler.toml`). La caché local está en 300 segundos para no consumir créditos innecesariamente en el plan gratuito. Los vencimientos de reglas se generan al abrir la aplicación y permanecen fuera de balances hasta confirmarlos.

Para probar Yahoo en local, ejecuta `bun run setup:worktree` y arranca `bun run dev`; no hace falta configurar una API key. El símbolo visible y el ticker de consulta son independientes: puedes mostrar `BTC` y consultar `BTC-EUR`. Cada resultado y el ticker elegido tienen un enlace a su ficha de Yahoo para comprobar el activo, el mercado y la moneda antes de guardarlo. Ambos símbolos, el proveedor y los títulos manuales se sincronizan por usuario y sobreviven a las recargas.

Los precios se refrescan cada cinco minutos mientras la aplicación está visible y conectada. Las peticiones se cachean y deduplican, y se conserva el último precio válido si falla el proveedor. La fecha mostrada corresponde al dato de mercado; se marca como retrasado si Yahoo declara retraso o el precio es antiguo. Yahoo es una fuente no oficial y su disponibilidad, cobertura y retraso dependen del mercado: actualizar el panel no convierte un dato retrasado en tiempo real. La licencia MIT de la librería no sustituye las condiciones de uso de los datos de Yahoo.

El detalle de un activo con símbolo dibuja su cotización de 1 día (cada 5 minutos, unos 15 minutos tarde) a 5 años (`/api/market/history`); un fondo empieza en una semana, porque solo tiene un precio al día. Twelve Data ya no se usa: su plan gratuito no permite mostrar sus precios a personas, y los instrumentos guardados con él se cotizan desde Yahoo. CoinGecko es otra opción para instrumentos cripto. Las fuentes estudiadas están en [cotizaciones gratuitas](docs/research/cotizaciones-gratuitas-2026-11-28.md). [yahoo-finance2](https://github.com/gadicc/yahoo-finance2) · [Simple Price de CoinGecko](https://docs.coingecko.com/reference/simple-price)

Para una clave CoinGecko Demo usa `COINGECKO_API_PLAN=demo`; para una clave Pro usa `COINGECKO_API_PLAN=pro`. Los instrumentos existentes se pueden cambiar de proveedor desde Configuración.

El campo editable `Títulos` de `Valoración actual de cartera` fija el saldo real en ese momento; los movimientos anteriores quedan fuera y las compras y ventas posteriores de ese símbolo actualizan automáticamente la tenencia, sin crear movimientos históricos ficticios.

## Deploy en Cloudflare Workers + D1 (anterior)

> **Ya no es producción.** Producción corre la imagen Docker (Node + SQLite) en un servidor
> Oracle ARM, detrás de un proxy inverso; ver [self-hosting](docs/operations/self-hosting.md).
> Esta sección y `wrangler.toml` describen el destino Cloudflare, que el código aún admite.

### 1) Configuración D1

`wrangler.toml` declara únicamente la base D1 relacional:

| Binding                 | Base                    | Migraciones      | Contenido                                        |
| ----------------------- | ----------------------- | ---------------- | ------------------------------------------------ |
| `finance_tracker_db_v2` | `finance-tracker-db-v2` | `migrations-v2/` | Modelo relacional (_sync v2_), el que usa la app |

Al cambiar `src/db/schema/`, la migración v2 se escribe a mano en `migrations-v2/` con el siguiente número libre (`meta/` solo guarda el snapshot inicial de Drizzle); wrangler las aplica por orden de nombre.

Aplicar migraciones:

```bash
bun run d1:migrate:local:v2    # v2, local (tests y E2E)
```

Si cambias `wrangler.toml`, regenera tipos:

```bash
bun run cf:types
```

### 2) Despliegue

Producción corre en un servidor propio (Oracle ARM) con Docker, detrás de Nginx Proxy
Manager; la base es SQLite en un volumen. Cloudflare Workers y D1 ya no se usan en
producción: los pasos están en [self-hosting](docs/operations/self-hosting.md#producción-en-oracle).
El `wrangler.toml` de la raíz solo sirve ya para desarrollo, `bun run preview` y los tests
(workerd + D1 local); `.node-version` y `packageManager` fijan Node y bun (gestor de paquetes; el runtime es Node).

### 3) Autenticación integrada

La aplicación usa Better Auth y roles persistidos en D1. Configura las claves y proveedores según
[autenticación](docs/operations/authentication.md). Las cabeceras de Cloudflare Access no autorizan
peticiones y no existe un selector de protocolo de persistencia.

## Validación

```bash
bun run build
bun run check
```

## Sentry

Los errores llegan a Sentry por dos caminos independientes:

- Cliente: `@sentry/astro` inyecta `sentry.client.config.js`. La pieza
  compartida de cliente (`src/lib/client/error-reporting.ts`) marca cada fallo
  de API que no provocó quien usa la app con `api.endpoint` (sin query string),
  `api.category` y `api.status`.
- Servidor (destino Cloudflare/workerd; el servidor Node de producción no pasa por este entry): `wrangler.toml` apunta `main` a `sentry.server.config.ts`, que
  envuelve el handler de `@astrojs/cloudflare` con `Sentry.withSentry()` de
  `@sentry/cloudflare`. `withApiErrorHandling`
  (`src/lib/server/api-auth.ts`) marca los fallos de ruta no controlados con
  `api.route` y `http.response.status_code`.

La entrada del Worker se cablea a mano en lugar de apoyarse en la integración de
`@sentry/astro` (que en `astro.config.ts` queda con `server: false`): con
`@astrojs/cloudflare` v14 esa integración ya no aplica su envoltorio automático
a la entrada emitida
([getsentry/sentry-javascript#21901](https://github.com/getsentry/sentry-javascript/issues/21901)),
así que el Worker se desplegaría con Sentry del lado servidor desactivado en
silencio.

El DSN vive en `[vars] SENTRY_DSN` de `wrangler.toml` y no es un secreto: el
mismo valor ya viaja en el bundle de cliente.

Contrato de privacidad: con `dataCollection.userInfo` desactivado y sin cuerpos
HTTP en ninguno de los dos SDK —y con la integración `Console` fuera del SDK
del servidor, así sus eventos tampoco llevan los argumentos de `console.*`—,
ningún evento lleva credenciales, cuerpos de petición ni datos financieros; los
eventos de servidor llevan solo nuestros tags (`api.route` y
`http.response.status_code`) y la excepción, cuyo mensaje nunca repite el cuerpo
de una respuesta de proveedor aunque su stack sí viaje.

## Testing (Vitest + Playwright)

```bash
# Bucle local rápido: unitarias, componentes e integración
bun run test

# Capas individuales
bun run test:unit
bun run test:component
bun run test:integration

# Instalar navegador E2E (una vez)
bun run test:e2e:install

# E2E tests
bun run test:e2e

# Smoke rápido durante desarrollo
bun run test:e2e:smoke

# Sincronización v2
bun run test:e2e:sync-v2
```

Estructura de tests:

- `src/lib/finance-core.ts`: lógica financiera pura (unit testing)
- `tests/unit/finance-core.test.ts`: pruebas unitarias de cálculos
- `tests/component/`: contratos y estados visibles de componentes Vue
- `tests/integration/`: repositorios, migraciones y SQLite real
- `tests/e2e/pages/FinanceTrackerPage.ts`: Page Object Model
- `tests/e2e/`: recorridos E2E de cada sección (`neon-*.spec.ts`, escritorio y móvil)
- `playwright.config.ts`: configuración de E2E y `webServer`

La estrategia de Vitest y sus comandos están documentados en
[`docs/testing.md`](docs/testing.md). La configuración y el diagnóstico de los
flujos de navegador están en [`docs/playwright.md`](docs/playwright.md).

## Reportes web

Desde **Reportar** o desde la hoja «Más» en móvil se puede enviar un error o una mejora y
revisar un diagnóstico opcional. GitHub recibe el tipo, el resumen técnico mostrado y una
referencia opaca. El título, la descripción, las capturas y las aclaraciones se guardan en la
app.

**Mis reportes** (`/reportes`) conserva el seguimiento del estado de GitHub y permite retirar un
diagnóstico. Las capturas caducan a los 30 días. El equipo de soporte consulta el caso por número
desde `/soporte/reportes`, con un permiso explícito y registro de acceso. Consulta el
[flujo y las operaciones de soporte](docs/context/tabs/reportes.md).

El workflow **Analyze web report** se conserva para las issues históricas con texto público.
Las issues privadas quedan fuera de su análisis y publicación.

La skill `create-issue` se instala con `npx skills` en `.agents/skills/create-issue/` (fijada en
`skills-lock.json`) y OpenCode la descubre desde ahí. Para adoptar cambios de la skill, actualízala
con `npx skills`. La configuración restringida de `.github/opencode-issue-enricher.json` fija el
modelo, no concede shell y limita la lectura al checkout (`/*` deny, `{GITHUB_WORKSPACE}*` allow,
`..`, `~`, `.git`, `.env` y `.dev.vars` denegados); `grep`/`glob` rechazan `/*`, `~*` y `*..*`, y la
escritura solo permite `.scratch/enricher/`. El prompt fija `body.md`, `comment.md` y `labels.txt`.
El token de GitHub solo se expone a los pasos previo y posterior; el paso de OpenCode únicamente
recibe `OPENCODE_GO_API_KEY`. `issue.json` elimina los marcadores
`<!-- finance-tracker:reporter-comment user=... -->` y los logins de los comentarios. La tabla
ALLOW/DENY vive en `tests/unit/opencode-permissions.test.ts` y la publicación en
`.github/scripts/publish-web-report.mjs` con sus pruebas; el workflow se comprueba en
`tests/unit/enrich-workflow.test.ts`.

Riesgo residual: `OPENCODE_GO_API_KEY` está en el proceso de OpenCode; sin shell y sin lectura fuera
del checkout no hay una vía conocida para leerla. El `GH_TOKEN` solo existe en los pasos previo y
posterior, es efímero y tiene `issues:write` en este repositorio. El cuerpo original (incluido
`### Reportero`) se guarda fuera del workspace y solo lo usa el script de publicación; el agente no
lo ve. Si el agente escribe `body.md`, el script elimina cualquier `### Reportero` inyectado, añade
al final el bloque auténtico y completa los adjuntos, imágenes y contexto que falten, de modo que
`bun run reports:backfill` sigue leyendo el identificador correcto. El script escapa imágenes y HTML
en todo el texto, también en código; solo reinserta imágenes inline exactas del cuerpo original con
URL `user-attachments` o `assets` del repositorio, nunca referencias, y no reescribe los enlaces
normales (incluidos `localhost`, enlaces del reportero y `user-attachments`). Las menciones se
neutralizan en todo el texto, también en código: el coste es un U+200B invisible en identificadores
como `@types/node`, mientras correos y URLs con host válido se respetan. `<details>` y
`<https://...>` se muestran como texto. Los labels se limitan a la allowlist de triage, tipo y
`ui-change`; `ready-for-agent` se mantiene porque es el resultado esperado del flujo, y el
estado/tipo anterior del mismo eje se sustituye. El código del repositorio y el contenido del
reporte se envían al proveedor al leerlos durante el análisis.

### Variables y secrets requeridos

En el runtime (`locals.runtime.env`; en producción, el `.env` del servidor):

- `GITHUB_ISSUE_TOKEN` o `GITHUB_TOKEN`: token personal o de una GitHub App con acceso de escritura
  a issues.
- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_BOT_LOGIN` (opcional): login de la cuenta que publicó las aclaraciones históricas.
  Necesario con un token de GitHub App, porque `/user` no está disponible para ellas.

En GitHub → Settings → Secrets and variables → Actions:

- `OPENCODE_GO_API_KEY`: clave de OpenCode Go usada por el análisis con DeepSeek en Actions. El
  servidor ya no la usa; solo se configura como secret del workflow.
- El token para publicar lo proporciona GitHub con `issues: write`; no requiere otro secret.

El workflow tiene que estar en la rama por defecto para recibir `issues.opened`. Para reintentar un
fallo o procesar un reporte anterior, ejecuta **Analyze web report** con `issue_number` desde Actions,
o `gh workflow run enrich-web-issue.yml --repo alberba/finance-tracker -f issue_number=123`.
Cada ejecución vuelve a analizar la issue con la skill; no hay un estado de «ya enriquecida» que
omita el análisis. La versión de OpenCode está fijada en el workflow.

### Labels recomendadas en GitHub

- `source:web-report`, `needs-triage`
- `bug`, `feature`
- `priority:low`, `priority:med`, `priority:high`
- `area:frontend`, `area:backend`, `area:infra`, `area:data`

## Extraer datos desde Excel para uso local

```bash
python3 scripts/extract_excel_seed.py \
  --input "/ruta/al/archivo.xlsx" \
  --output "/tmp/finance-seed.json"
```

El resultado puede contener información financiera sensible. No sustituyas con
él `src/data/seed.json` ni lo añadas al repositorio.
