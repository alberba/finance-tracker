# Effect TS en finance-tracker: viabilidad y mejora

> **Pregunta.** ¿Es viable adoptar Effect (`effect` y su ecosistema) en este repo y qué mejoraría
> de verdad?
>
> **Fecha de corte.** 2026-10-02. Effect 4.0.0 estable salió el 2026-10-01, el día anterior.
>
> **Método.** Lectura del código (`fichero:línea`) y contraste con fuentes primarias: registro
> npm, el monorepo `Effect-TS/effect` (README, `MIGRATION.md`, notas de la release, código
> fuente, issues), los `.d.ts` publicados de `effect@4.0.0`, `effect.website` y la documentación
> de Cloudflare Workers. Los tamaños de bundle son **mediciones propias**, reproducibles con el
> apéndice A. Los bocetos de código del §4 **typecheckean** contra `effect@4.0.0` con
> TypeScript 5.9.3 en modo `strict`, y el del flush se ha ejecutado además con una red simulada.
> No se ha usado ninguna fuente secundaria.

## 1. Resumen ejecutivo

**Recomendación: adoptar de forma incremental y acotada, empezando solo en servidor, sin tocar
zod, Drizzle ni el contrato de sync.** Todavía no conviene adoptarlo en el cliente.

Por qué:

1. **El encaje técnico existe, y es mejor en v4 que en v3.** Effect 4.0.0 es LTS, con al menos
   tres años de correcciones ([README][effect-readme]). No tiene dependencias de runtime
   ([release 4.0.0][rel-400]). Además, `Effect.runPromise` rechaza con la **misma instancia de
   error** que falló. En v3 la envolvía en `FiberFailureImpl` (medido, apéndice A.3). Por eso
   convive con los `instanceof` que ya usa el repo, como `withApiErrorHandling` en
   `src/lib/server/api-auth.ts:44-61`.
2. **Los puntos de dolor reales del repo son justo los que Effect modela bien.** Son
   concurrencia hecha a mano (`flushing`, `flushAgainRequested` y `retryTimer` en
   `src/stores/sync.ts:102-106`), reintento con backoff a mano (`sync.ts:304-314`), timeouts con
   `AbortController` repetidos (`src/lib/server/stockevents.ts:60-92` y
   `src/lib/server/market-data.ts:320-332`), deduplicación en vuelo, caché y enfriamiento por
   rate limit con tres `Map` globales (`market-data.ts:20-22`), y promesas sin esperar que hoy
   rompen tests (cuarentena #233, `docs/testing.md:52-63`).
3. **Pero ninguna de esas mejoras exige Effect.** Todas se pueden resolver con TypeScript
   normal. zod ya es dependencia y ya va al cliente. Lo que aporta Effect es _uniformidad y
   composición_: un mismo vocabulario para timeout, reintento, cancelación, errores tipados e
   inyección. No aporta capacidades que hoy sean imposibles.
4. **En el cliente el coste es medible y la app vigila el bundle.** Un programa mínimo de Effect
   v4 ocupa **8,0 KB gzip** con Vite 8, la herramienta del repo. Effect + Schema + reintento +
   timeout ocupa **28,9 KB gzip**. El arranque actual transfiere 200,29 KB de JS
   (`docs/performance-report.md:48`), así que meter Effect en la ruta crítica de `sync.ts` supone
   un +4 % a +14 % sobre esa cifra, y **se suma** a los ~22 KB gzip que ya cuesta zod en
   `command-schemas.ts` (medido). En el Worker el tamaño no es problema: el límite son 64 MiB sin
   comprimir ([CF limits][cf-limits]).
5. **El calendario es inmaduro y hay fricción con el tooling.** v4 estable tiene un día de vida.
   `effect/http` (el `HttpClient`) y `effect/sql` siguen marcados como `@stability unstable`
   y pueden romper en versiones menores ([MIGRATION][migration]). `@effect/vitest@4.0.0` exige
   Vitest 5 y el repo usa Vitest 4.1.11 ([release 4.0.0][rel-400], `package.json:79`).
   `@effect/sql-drizzle` no existe para v4 (§5.3).

El mejor punto de entrada es la **integración Bitvavo (#190/#191)**. Es código nuevo de
servidor, y su issue pide literalmente lo que Effect da hecho: «se impiden sincronizaciones
concurrentes […] y se respetan rate limits, `Retry-After`/reset, bac[koff]» y un cursor que
«solo avanza después de completar el rango; un fallo entre lotes es reanudable». Si el piloto
convence, el siguiente paso es migrar `stockevents.ts` y `market-data.ts`. El motor de sync del
cliente se deja para el final, y solo con una medición de `pnpm benchmark:performance` delante.

## 2. Estado actual del repo relevante para la pregunta

### 2.1 Stack

- Astro 7 con salida `server` en Cloudflare Workers (`astro.config.ts:12-20`), Vue 3.5.41 en
  islas, Pinia 4 y Tailwind 4 (`package.json:83-98`). La entrada del Worker la envuelve Sentry
  (`wrangler.toml:3-4`) con `nodejs_compat` (`wrangler.toml:6`).
- D1 con dos bases (v1 y v2, `wrangler.toml:8-21`) a través de Drizzle 0.45.2 (`src/db/client.ts`).
  Las rutas API solo pasan por repositorios (`src/db/client.ts:7-10`).
- Validación: **zod 4.4.3**, usado en 3 ficheros. El principal es
  `src/lib/server/sync/command-schemas.ts` (430 líneas, objetos `.strict()`, unión discriminada
  en la línea 415). **Lo comparten cliente y servidor**: el outbox valida al encolar con el mismo
  esquema (`src/lib/client/outbox.ts:15-21,117-134`).
- Tests: Vitest 4.1.11 en tres capas (`docs/testing.md:9-13`) más Playwright. TypeScript 5.9.3
  instalado (el rango declarado es `^5.0.0`), con `astro/tsconfigs/strict` (`tsconfig.json:2`).
- Equipo: en la práctica, una persona más agentes (git log: alberba / Albert Salom ≈ 297 de 314
  commits). El código lo escriben agentes en gran parte; esto pesa en el §5.4.

### 2.2 Dónde duele (con evidencia)

| Zona                                    | Qué hay hoy                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Síntoma                                                                                                                                                                                                                                                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Flush de la cola (`src/stores/sync.ts`) | Banderas mutables `flushing`, `flushAgainRequested`, `retryAttempt` y `retryTimer` (102-106). `scheduleRetry` con `2 ** n` limitado a 30 s (304-314). `flush()` de 175 líneas que mezcla red, decisión por estado, caché, toasts y reprogramación (346-520).                                                                                                                                                                                                              | El propio comentario documenta un bug de concurrencia ya corregido: un `flush()` en vuelo «used to just no-op and be forgotten» (328-345). Respuestas sin validar: `(await response.json()) as {…}` (380-384, 565-568, 200).                                                                                     |
| Fire-and-forget                         | 59 llamadas `void f(...)` en `src/`. Los stores lanzan `void syncListDiff(...)` (p. ej. `src/stores/investment.ts:278,350,391`), y `enqueueCommand` hace `void flush()` (`sync.ts:300`).                                                                                                                                                                                                                                                                                  | Tests en cuarentena (#233). El harness espera «cinco ticks» con `setTimeout(0)` (`tests/integration/d1-v2/round-trip/harness.ts:70-74`) y no basta: «las mutaciones lanzan comandos con promesas no esperadas» (`docs/testing.md:58-63`). Hay dos casos con `it.skip` (`round-trip/investment.test.ts:147,177`). |
| Clientes HTTP externos (servidor)       | `stockEventsFetch` con `AbortController` + `setTimeout` + clasificación de errores en `catch` (`stockevents.ts:54-93`). `fetchJsonWithTimeout` duplica el patrón (`market-data.ts:320-332`). Proveedor de respaldo con `try/catch` (`market-data.ts:100-121`). Deduplicación en vuelo, caché en memoria y enfriamiento por 429 con tres `Map` de módulo (`market-data.ts:20-22,44-65,340-345`). GitHub con su propio cliente (`src/lib/server/github-issues.ts:129-160`). | Cada cliente reinventa timeout, error y reintento. Las respuestas externas se leen con `as Record<string, unknown>` y `String(raw.x \|\| '')` (`stockevents.ts:111-118,252-256`) en lugar de con un esquema.                                                                                                     |
| Errores                                 | Ya hay errores con categoría: `ApiClientError` con `category` (`src/lib/client/api-error.ts:10-20,58-70`), `StockEventsApiError` con `status` (`stockevents.ts:44-52`), `UnauthorizedError`/`ForbiddenError` (`api-auth.ts:17-18`) y `RejectedCommandError` (`src/db/repositories/shared.ts:200`).                                                                                                                                                                        | Lo que falla no aparece en el tipo: un `Promise<T>` no dice qué puede fallar, y la clasificación se hace con `instanceof` en cada `catch` (p. ej. `stockevents.ts:212-223`).                                                                                                                                     |
| Inyección / seams de test               | DI manual por parámetro: `fetchImpl: typeof fetch = fetch` (52 apariciones en `stockevents.ts`, `market-data.ts` y `market-search.ts`). `GithubIssueClient` (`github-issues.ts:9-10,132`). En tests, 24 ficheros usan `vi.mock` y el harness hace `vi.stubGlobal("fetch", …)`.                                                                                                                                                                                            | **Funciona.** Es simple y los tests lo aprovechan. No es un dolor fuerte.                                                                                                                                                                                                                                        |
| Transacciones D1                        | `runInTransaction` degrada a escritura no atómica cuando D1 rechaza `BEGIN` (`shared.ts:163-193`).                                                                                                                                                                                                                                                                                                                                                                        | Es una limitación de D1, no de la librería. Effect no la resuelve (§5.3).                                                                                                                                                                                                                                        |

## 3. Qué es Effect hoy (2026-10-02)

- **Versión.** `effect@4.0.0` es `latest` en npm desde el 2026-10-01T03:11Z. La última v3 es
  3.22.2 (2026-09-09). La serie beta de v4 empezó el 2026-02-18 (`npm view effect time`). La
  release oficial dice: «Effect 4.0 is the first stable release of Effect v4. It replaces the
  4.0.0 beta and release-candidate series» ([release 4.0.0][rel-400]).
- **LTS.** «Effect 4.x is a long-term support (LTS) release, with at least three years of bug
  and security fixes» ([README][effect-readme]).
- **Consolidación.** `@effect/platform`, `@effect/sql`, `@effect/rpc`, `@effect/schema` y otros
  pasan a vivir dentro de `effect` (`effect/http`, `effect/sql`, `effect/Schema`…). Siguen
  separados solo los paquetes de plataforma, los drivers SQL, los bindings de framework,
  OpenTelemetry y `@effect/vitest`. Todos comparten número de versión ([MIGRATION][migration]).
  En npm, `@effect/platform` y `@effect/schema` siguen en `latest` 0.97.2 y 0.75.5: son las
  líneas v3, a evitar.
- **Estabilidad por módulo.** Los módulos `ai`, `cli`, `http`, `http-api`, `rpc`, `schema` (el
  subárbol `effect/schema/*`), `sql`, `reactivity` y `workflow` son _unstable_: «may receive
  breaking changes in minor releases» ([MIGRATION][migration]). En los `.d.ts` publicados,
  `effect/http/HttpClient` lleva `@stability unstable`. El núcleo (`Effect`, `Schedule`,
  `Queue`, `Latch`, `Data`, `Context`, `Layer`) y el grueso de `effect/Schema` (`Struct`,
  `decodeUnknownEffect`…) no llevan esa marca. Las 120 marcas `unstable` de `Schema.d.ts` son
  sobre todo esquemas de red (`Ipv4Address`, `Cookie`, `Headers`…).
- **Requisitos.** «TypeScript 5.9 or newer» y `strict: true` ([README][effect-readme]). El repo
  los cumple: 5.9.3 instalado y `astro/tsconfigs/strict`.
- **Rendimiento declarado.** «a minimal Effect program bundles to ~6.3 KB (minified + gzipped).
  With Schema, ~15 KB» ([MIGRATION][migration]). Lo he contrastado en el §5.1.

## 4. Mejoras concretas, módulo a módulo

En orden de valor/coste para este repo:

| #   | Módulo                                                     | Qué aporta Effect                                                                                                                                                                                                                                                                                                                  | Alternativa sin Effect                                                                                          |
| --- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1   | **Bitvavo (#190/#191, nuevo)**                             | `Semaphore`/`FiberHandle` para impedir sincronizaciones concurrentes. `Schedule` para el backoff y para respetar `Retry-After`. `HttpClient.withRateLimiter` y `retryTransient` (unstable). Errores tipados por motivo (credencial, rate limit, divisa no EUR). Cursor que avanza solo dentro de un `Effect.gen` que termina bien. | Escribirlo a mano, otra vez, como `stockevents.ts` y `market-data.ts`.                                          |
| 2   | `src/lib/server/stockevents.ts`                            | Timeout con cancelación real (`Effect.tryPromise` pasa un `AbortSignal` que se aborta al interrumpir, según el JSDoc de `Effect.d.ts:1193-1195`). Error tipado con `reason`. Decodificación con Schema en lugar de `String(raw.x \|\| '')`. Boceto 4.1.                                                                            | Un helper `fetchWithTimeout` común y `zod.safeParse` sobre la respuesta.                                        |
| 3   | `src/lib/server/market-data.ts`                            | `Effect.cachedWithTTL` / `Cache` en lugar de `memoryCache` + `inFlightQuotes` (deduplicación incluida). `Effect.catchIf` para el proveedor de respaldo (en v4 no existe `orElse`; sí `catchIf` y `orElseSucceed`). `Schedule` para el enfriamiento por 429.                                                                        | Ya funciona y está aislado. Ganancia moderada.                                                                  |
| 4   | Motor de flush (`src/stores/sync.ts:304-520`)              | Un único worker con `Queue.dropping(1)` como «timbre» en lugar de las cuatro banderas. Reintento declarativo. `Latch` para un `whenIdle()` que el harness pueda esperar en lugar de `settle()`. Boceto 4.2.                                                                                                                        | Un `Promise` de «drenaje en curso» + un `Set` de promesas pendientes + `whenIdle()`: unas 30 líneas.            |
| 5   | Respuestas sin validar del cliente (`sync.ts:200,380,565`) | `Schema.decodeUnknownEffect` integrado en la tubería.                                                                                                                                                                                                                                                                              | **zod, que ya está en el cliente**: coste extra cero.                                                           |
| 6   | Fire-and-forget en stores (59 `void …`)                    | `FiberSet.makeRuntimePromise` + `FiberSet.awaitEmpty`: todo lo lanzado queda trazado y se puede esperar.                                                                                                                                                                                                                           | Un registro `track(promise)` + `awaitAll()`. Es lo que pide #233, y la causa es el aislamiento, no la librería. |

### 4.1 Boceto: `stockEventsFetch` (servidor)

**Antes** (`src/lib/server/stockevents.ts:54-93`, resumido):

```ts
async function stockEventsFetch(apiKey, path, init = {}, fetchImpl = fetch): Promise<unknown> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
  try {
    const response = await fetchImpl(`${STOCK_EVENTS_BASE_URL}${path}`, { /* … */ signal: controller.signal })
    if (response.status === 204) return null
    const body = (await response.json().catch(() => null)) as { data?: unknown; error?: {…} } | null
    if (!response.ok) throw new StockEventsApiError(describeApiError(response.status, body?.error), response.status)
    return body?.data ?? null
  } catch (error) {
    if (error instanceof StockEventsApiError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') throw new StockEventsApiError('…a tiempo', 504)
    throw new StockEventsApiError('No se pudo conectar con Stock Events', 502)
  } finally {
    clearTimeout(timeout)
  }
}
```

**Después** (typecheckea contra `effect@4.0.0`):

```ts
import { Context, Data, Duration, Effect, Layer, Schema } from 'effect'

export class StockEventsError extends Data.TaggedError('StockEventsError')<{
  readonly reason:
    'unauthorized' | 'forbidden' | 'timeout' | 'unreachable' | 'api' | 'invalid-response'
  readonly status: number
  readonly message: string
}> {}

// Seam de test: sustituye a `fetchImpl` por parámetro (Layer.succeed con un fake en tests).
export class StockEventsHttp extends Context.Service<
  StockEventsHttp,
  {
    readonly fetch: (input: string, init: RequestInit) => Promise<Response>
  }
>()('StockEventsHttp') {}
export const StockEventsHttpLive = Layer.succeed(StockEventsHttp, {
  fetch: (i, init) => fetch(i, init),
})

const Envelope = Schema.Struct({
  data: Schema.optional(Schema.Unknown),
  error: Schema.optional(Schema.Struct({ message: Schema.optional(Schema.String) })),
})
const Watchlist = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.String,
  currency: Schema.optional(Schema.String),
})

const stockEventsFetch = Effect.fn('stockEventsFetch')(function* (
  apiKey: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
) {
  const http = yield* StockEventsHttp
  const response = yield* Effect.tryPromise({
    try: (signal) => http.fetch(`https://stockevents.app/api/v1${path}`, { /* … */ signal }),
    catch: () =>
      new StockEventsError({
        reason: 'unreachable',
        status: 502,
        message: 'No se pudo conectar con Stock Events',
      }),
  }).pipe(
    Effect.timeoutOrElse({
      duration: Duration.seconds(8),
      orElse: () =>
        Effect.fail(
          new StockEventsError({
            reason: 'timeout',
            status: 504,
            message: 'Stock Events no respondió a tiempo',
          }),
        ),
    }),
  )
  if (response.status === 204) return null
  const json = yield* Effect.promise(() => response.json().catch(() => null))
  const body = yield* Schema.decodeUnknownEffect(Schema.NullOr(Envelope))(json).pipe(
    Effect.mapError(
      () =>
        new StockEventsError({
          reason: 'invalid-response',
          status: 502,
          message: 'Respuesta no interpretable',
        }),
    ),
  )
  if (!response.ok) {
    return yield* new StockEventsError({
      reason:
        response.status === 401 ? 'unauthorized' : response.status === 403 ? 'forbidden' : 'api',
      status: response.status,
      message: body?.error?.message ?? `Stock Events respondió con estado ${response.status}`,
    })
  }
  return body?.data ?? null
})

export const listStockEventsWatchlists = (apiKey: string) =>
  stockEventsFetch(apiKey, '/watchlists').pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(Watchlist))),
    Effect.catchTag('SchemaError', () => Effect.succeed([])),
  )

// Frontera con la ruta Astro: devuelve Promise y rechaza con la propia StockEventsError (A.3).
export const runListWatchlists = (apiKey: string) =>
  Effect.runPromise(listStockEventsWatchlists(apiKey).pipe(Effect.provide(StockEventsHttpLive)))
```

Qué se gana: el tipo de `listStockEventsWatchlists` declara `Effect<…, StockEventsError,
StockEventsHttp>`, así que el fallo y la dependencia quedan visibles. Al interrumpir se cancela el
`fetch` de verdad. Desaparecen el `finally` y la reclasificación en el `catch`. La ruta sigue
recibiendo una `Promise`.

Qué no se gana: el código no es más corto, y `fetchImpl` ya era un seam suficiente para los tests.

### 4.2 Boceto: el motor de flush (cliente)

**Antes** (`src/stores/sync.ts`): banderas mutables (102-106). `flush()` sale pronto si
`flushing` y marca `flushAgainRequested` (350-353). El `finally` relanza `void flush()` (513-518).
`scheduleRetry` lleva un `setTimeout` propio (304-314). El harness no puede saber cuándo ha
terminado todo y espera cinco `setTimeout(0)` (`harness.ts:70-74`).

**Después** (typecheckea; ejecutado con 12 comandos encolados y 2 fallos de red simulados:
reintenta a 1 s y 2 s, envía 3 lotes de ≤5 y `whenIdle()` resuelve al vaciarse, a los ~3,0 s):

```ts
import { Data, Effect, Exit, Latch, Queue, Schedule, Schema, Scope } from 'effect'

class NetworkError extends Data.TaggedError('NetworkError')<{}> {}
class ServerError extends Data.TaggedError('ServerError')<{ readonly status: number }> {}

const SyncResponse = Schema.Struct({
  results: Schema.Array(
    Schema.Struct({
      commandId: Schema.String,
      status: Schema.Literals([
        'applied',
        'conflict',
        'not_found',
        'noop',
        'rejected',
        'in_progress',
      ]),
      entity: Schema.optional(Schema.Unknown),
      currentVersion: Schema.optional(Schema.Number),
      message: Schema.optional(Schema.String),
    }),
  ),
  revision: Schema.Number,
  halted: Schema.Boolean,
})

const postBatch = (commands: ReadonlyArray<unknown>) =>
  Effect.tryPromise({
    try: (signal) =>
      fetch('/api/sync', { method: 'POST', body: JSON.stringify({ commands }), signal }),
    catch: () => new NetworkError(),
  }).pipe(
    Effect.flatMap((r) =>
      r.ok || r.status === 409
        ? Effect.promise(() => r.json())
        : Effect.fail(new ServerError({ status: r.status })),
    ),
    Effect.flatMap(Schema.decodeUnknownEffect(SyncResponse)), // sustituye al `as {…}` de sync.ts:380
  )

const drain = Effect.gen(function* () {
  while (true) {
    const batch = yield* Effect.promise(peekBatch) // outbox.ts, sin cambios
    if (batch.length === 0) return
    const body = yield* postBatch(batch.map((e) => e.command)).pipe(
      Effect.retry({
        schedule: Schedule.min([Schedule.exponential('1 second'), Schedule.spaced('30 seconds')]), // = sync.ts:308
        while: (e) => e._tag === 'NetworkError', // «Network failures never count» (sync.ts:501)
      }),
    )
    if (!(yield* Effect.promise(() => applyResults(body)))) return // la lógica de ADR 0003 se queda igual
  }
})

export const makeFlusher = Effect.gen(function* () {
  const wake = yield* Queue.dropping<void>(1) // N flush() mientras drena => 1 vuelta extra
  const quiet = yield* Latch.make(true)
  yield* Queue.take(wake).pipe(
    Effect.andThen(drain),
    Effect.catch((error) => Effect.logWarning('flush', error)),
    Effect.ensuring(Effect.flatMap(Queue.size(wake), (n) => (n === 0 ? quiet.open : Effect.void))),
    Effect.forever,
    Effect.forkScoped,
  )
  return {
    flush: quiet.close.pipe(Effect.andThen(Queue.offer(wake, undefined)), Effect.asVoid),
    idle: quiet.await,
  } as const
})

// Frontera con el setup store de Pinia:
export const boot = async () => {
  const scope = Effect.runSync(Scope.make())
  const flusher = await Effect.runPromise(makeFlusher.pipe(Scope.provide(scope)))
  return {
    flush: () => Effect.runSync(flusher.flush), // síncrono: cierra el latch antes de volver
    whenIdle: () => Effect.runPromise(flusher.idle), // lo que el harness necesita en vez de settle()
    dispose: () => Effect.runPromise(Scope.close(scope, Exit.void)), // logout / cambio de usuario
  }
}
```

Lectura honesta del boceto:

- Elimina las cuatro banderas y la clase de bug que documentan `sync.ts:328-345`, porque la
  coalescencia la da la cola. Da un `dispose` claro para `logout()` y `init()` con otro usuario
  (`sync.ts:163-169,747-761`). Hoy `init()` añade listeners `online`/`offline` en cada
  inicialización y no los quita nunca (`sync.ts:180-183`).
- **No arregla por sí solo #233.** Las promesas sin esperar nacen antes, en
  `void syncListDiff(...)` de los stores. Para que el harness espere de verdad, hay que trazar
  esas llamadas también, con `FiberSet` o con un `track()` casero. Effect lo hace posible, pero
  la causa es de diseño.
- El tamaño del flush no baja mucho: casi todo el cuerpo de `flush()` es lógica de dominio
  (ADR 0003, `MAX_SEND_ATTEMPTS`, caché), y esa lógica se queda.

### 4.3 Dónde _no_ aporta (dejarlo como está)

- **zod en `command-schemas.ts`.** Es el contrato que comparten cliente y servidor, con 430
  líneas y regresiones conocidas (#138, #143, #205). Migrarlo a `Schema` duplicaría el riesgo sin
  ganancia funcional, y en el cliente costaría más bytes (§5.1). Ambos implementan Standard
  Schema: zod expone `~standard` (`node_modules/zod/v4/core/schemas.js:118`) y Effect,
  `Schema.toStandardSchemaV1` (`effect/dist/Schema.d.ts:1046`). Si alguna vez hace falta
  interoperar, ese es el puente.
- **Drizzle y los repositorios.** Ver §5.3.
- **Vue y Pinia.** No hay integración con Pinia en el monorepo: `packages/atom` solo tiene
  `react`, `solid` y `vue`. La de Vue es `@effect/atom-vue`, otro modelo de estado (Atom) que
  pide `vue >=3.5.39 <4.0.0` (`npm view @effect/atom-vue peerDependencies`). Adoptarla sería un
  segundo gestor de estado junto a Pinia. Se descarta. Si se usa Effect en el cliente, debe vivir
  _detrás_ de las acciones de los stores, con `runPromise`/`runFork` en la frontera, como en 4.2.
- **`src/domain/**`.** Son cálculos puros (valoración, presupuesto). Effect no les añade nada.

## 5. Costes y riesgos

### 5.1 Tamaño de bundle (mediciones propias, apéndice A)

Gzip nivel 9 sobre la salida minificada. Las fixtures Rollup replican la herramienta oficial de
Effect: Rollup + terser + gzip-9 ([bundle tool][bundle-readme], [Plugins.ts][bundle-plugins]).
Vite 8.2.2 es la versión del repo (`package.json:77`).

| Fixture                                                                    | Rollup+terser (min / gzip) | Vite 8 (min / gzip)    |
| -------------------------------------------------------------------------- | -------------------------- | ---------------------- |
| v4 `Effect.succeed(123).pipe(Effect.runFork)` (fixture oficial `basic.ts`) | 19,5 KB / **6,9 KB**       | 26,2 KB / **8,0 KB**   |
| v4 `tryPromise` + `timeout` + `retry(Schedule.exponential)` + `catchTag`   | 37,0 KB / 12,6 KB          | 50,2 KB / 14,5 KB      |
| v4 `Schema.Struct` + `decodeUnknownEffect`                                 | 56,3 KB / 18,5 KB          | —                      |
| v4 Schema + reintento + timeout (perfil del boceto 4.2)                    | 68,8 KB / 22,6 KB          | 104,8 KB / **28,9 KB** |
| v4 `effect/http` `FetchHttpClient` (fixture oficial `http-client.ts`)      | 66,5 KB / 22,0 KB          | 89,6 KB / 25,1 KB      |
| v3.22.2 `basic`                                                            | 111,8 KB / 35,2 KB         | —                      |
| v3.22.2 Schema struct                                                      | 150,2 KB / 46,3 KB         | —                      |
| zod 4.4.3 clásico, struct equivalente                                      | 64,0 KB / 16,7 KB          | 83,9 KB / 19,0 KB      |
| zod/mini, struct equivalente                                               | 12,8 KB / 4,4 KB           | 17,4 KB / 5,0 KB       |
| **Lo que ya va al cliente:** `command-schemas.ts` real (zod)               | —                          | 100,4 KB / **22,3 KB** |

Conclusiones:

- La cifra oficial de ~6,3 KB se reproduce (6,9 KB). La de «with Schema, ~15 KB» depende de qué
  se use: con un struct real salen 18,5 KB. Con la herramienta del repo (Vite 8) todo sale entre
  un 15 y un 30 % más grande.
- **v4 es unas 5 veces más ligero que v3** en el caso mínimo (6,9 frente a 35,2 KB gzip). Antes
  de v4, adoptarlo en el cliente era difícil de justificar.
- En el cliente, Effect **no sustituiría** a zod: `outbox.ts` seguiría validando con
  `command-schemas.ts`. El coste sería aditivo, unos 14,5 KB gzip solo con
  reintento/timeout y unos 29 KB con Schema, sobre 200,29 KB de JS de arranque
  (`docs/performance-report.md:48`). Si el código de Effect cae en un chunk diferido (las
  secciones ya se cargan bajo demanda, `docs/performance-report.md:11`), el coste de arranque
  baja. Pero `sync.ts` se inicializa al arrancar, así que su motor caería en la ruta crítica.
- **Worker:** el límite es «64 MiB» sin comprimir en ambos planes ([CF limits][cf-limits]).
  Decenas de KB no importan.

### 5.2 Arranque en Workers

Cloudflare limita la evaluación del ámbito global a «1 second» y avisa: «generating or consuming
a large schema at the top level is a common cause of exceeding this limit» ([CF
limits][cf-limits]). Hay un caso documentado en Effect: `Effect.fn` construía un `Error` por
definición, y «an application with about 1,600 definitions spends more than its entire 400 ms
startup CPU budget» ([#8038][i8038]). Lo cerró la PR #8114 (fusionada el 2026-09-07), que omite
la captura de stack **solo si `Error.stackTraceLimit` es 0** ([#8114][pr8114]). Por defecto el
coste sigue ahí, y poner el límite a 0 en el Worker degradaría las trazas que recibe Sentry.
Con una adopción acotada (decenas de definiciones, no miles) es irrelevante, pero conviene
medirlo con `wrangler check startup` en el piloto.

### 5.3 Compatibilidad con la pila

- **D1.** `@effect/sql-d1@4.0.0` existe, pero «Transactions, streaming queries, and
  `updateValues` are not supported by this [driver]». `transactionAcquirer` es
  `Effect.die("transactions are not supported in D1")`, y `batch` «intentionally cannot
  participate in SqlClient transactions» ([D1Client.ts][d1client]). Es la misma limitación que
  `runInTransaction` ya rodea (`shared.ts:163-193`). No aporta nada sobre Drizzle.
- **Drizzle.** `@effect/sql-drizzle` no tiene versión v4: su `latest` es 0.51.0 y pide
  `effect ^3.22.0` y `drizzle-orm >=0.43.1 <0.50` (`npm view`). El repo usa drizzle-orm 0.45.2,
  y el paquete no existe en `packages/sql/` del monorepo v4 (listado: clickhouse, d1, libsql,
  mssql, mysql2, pg, pglite, sqlite-*). **Conclusión: Drizzle se queda. Los repositorios se
  envuelven con `Effect.tryPromise` si hace falta, no se reescriben.**
- **Plataforma Workers.** No hay `@effect/platform-cloudflare`: `packages/platform` solo tiene
  browser, bun, deno, node y node-shared. En Workers se usa el núcleo + `effect/http`
  (`FetchHttpClient`), y para cada binding hay que escribir la capa a mano. Hay issues abiertas
  propias de workerd, aunque afectan a piezas que este repo no usaría:
  [#6319][i6319] (`toWebHandler` en v3) y [#8205][i8205] (streams de `FetchHttpClient`).
- **Vitest.** `@effect/vitest@4.0.0` pide `vitest >=5.0.0 <6.0.0`; la línea v3
  (`0.30.0`) pide `vitest ^3.2.0`. El repo está en **4.1.11** (`npm view … peerDependencies`). La
  release lo confirma: «`@effect/vitest` and `@effect/doctest` require Vitest 5» ([release
  4.0.0][rel-400]). Hay dos salidas: subir a Vitest 5 (5.0.3 es `latest`), que es un cambio
  aparte, o probar el código Effect con `Effect.runPromise` dentro de Vitest 4, que no necesita
  ninguna dependencia nueva. Para el piloto, la segunda.
- **Sentry.** Encaja en la frontera: `runPromise` rechaza con el error original (A.3), así que
  `reportApiRouteFailure` (`api-auth.ts:57`) sigue recibiendo el objeto de siempre.

### 5.4 Curva de aprendizaje y coste de equipo

- La propia documentación admite el coste: «Effect's concepts may be new to you, and might not
  completely make sense at first» ([Why Effect][why-effect]). También anima a empezar por partes:
  «You don't have to use all aspects of Effect at once» ([Why Effect][why-effect]).
- **Riesgo concreto para un repo escrito con agentes:** v4 renombró APIs centrales.
  `Context.Tag` pasa a `Context.Service` ([services.md][mig-services]), hay renombres en
  `catch*`, `Runtime<R>` desaparece y `FiberRef` pasa a `Context.Reference`
  ([MIGRATION][migration]). Un agente entrenado sobre todo con v3 tenderá a escribir v3, y
  fallará en `pnpm check`. Lo mitiga el `AGENTS.md` de 409 líneas que trae el propio paquete
  (`node_modules/effect/AGENTS.md`): «use this documentation and the Effect source code available
  in your environment». Habría que enlazarlo desde `AGENTS.md`/`CODING_STANDARDS.md`.
- Dos dialectos en el mismo repo (Promise/async y Effect) suben la carga de revisión. Por eso la
  propuesta limita Effect a módulos concretos con frontera Promise y prohíbe que los tipos
  `Effect<…>` salgan de ellos.

### 5.5 Lock-in y churn de versiones

- El paso de v3 a v4 fue una ruptura amplia (paquetes fusionados, imports nuevos, APIs
  renombradas; [MIGRATION][migration]). La promesa LTS de v4 reduce ese riesgo hacia delante,
  pero **solo para las APIs estables**. `effect/http` y `effect/sql` pueden romper en versiones
  menores, y el changelog de 4.0.0 ya trae cambios incompatibles de última hora (p. ej. el orden
  de las tuplas de `partition`, [#8583][rel-400]). Hay que fijar la versión exacta, no `^4`.
- 4.0.0 tiene un día. Lo prudente es esperar a los primeros parches (4.0.x) antes de llevarlo a
  producción.
- El lock-in es local si se respeta la frontera: un módulo Effect que exporta funciones
  `Promise` se puede reescribir en async/await sin tocar a quien lo llama.

## 6. Ruta de adopción incremental

0. **Decidir la frontera** con un ADR corto en `docs/adr/0004-…`: Effect solo en
   `src/lib/server/integrations/**` (o similar). Funciones exportadas con `Promise`. Errores
   `Data.TaggedError` que no salen del módulo sin pasar por `runPromise`. Versión exacta fijada.
   Sin `@effect/vitest` mientras el repo siga en Vitest 4.
1. **Piloto: el cliente Bitvavo (#190/#191)**, en servidor y como código nuevo. Rate limit con
   `Retry-After`, exclusión de sincronizaciones concurrentes por conexión y cursor reanudable.
   Para darlo por bueno: tests en `tests/unit` con `Effect.runPromise` y una capa HTTP falsa,
   `wrangler check startup` sin regresión, y comparar el código con lo que habría sido a mano.
2. **Si el piloto convence:** migrar `stockevents.ts` (boceto 4.1) y después `market-data.ts`
   (la caché y la deduplicación en vuelo con `Cache`/`cachedWithTTL`). Son módulos aislados y con
   tests (`tests/unit/stockevents.test.ts`, `tests/unit/market-data.test.ts`).
3. **Cliente: solo con datos.** Antes de tocar `sync.ts`, resolver #233 con la herramienta más
   barata (un `track()` + `whenIdle()` sin Effect) y validar las respuestas con zod, que ya está.
   Después, si el motor de flush sigue dando guerra, prototipar el boceto 4.2 en una rama y medir
   con `pnpm benchmark:performance`. Solo entra si el delta de arranque es aceptable (orientativo:
   ≤10 KB gzip en la ruta crítica, o el motor en un chunk diferido).
4. **No tocar:** `command-schemas.ts` (zod), Drizzle y repositorios, `apply-command.ts`, Pinia y
   los componentes Vue, ni `src/domain/**`.

Si después del paso 1 la conclusión es que «a mano habría salido igual», se para ahí. La
pérdida es un módulo, y su interfaz Promise permite reescribirlo.

## 7. Preguntas abiertas

1. ¿Va Bitvavo antes que el resto del rediseño v2 (#211-#228)? Si se retrasa, el piloto
   natural pasa a ser `stockevents.ts`, que tiene menos valor demostrativo.
2. ¿Hay plan de subir a Vitest 5? Eso habilitaría `@effect/vitest` (`it.effect`, `TestClock`
   para probar backoff sin esperas reales) y cambia el coste del piloto.
3. ¿Qué presupuesto de JS de arranque acepta el proyecto? `performance-report.md` mide pero no
   fija un umbral. Sin esa cifra, el paso 3 no tiene criterio de entrada.
4. ¿Quedaría el motor de sync del cliente (tras #233 y #134/#136) con suficiente concurrencia
   propia como para justificar Effect, o basta con un rediseño pequeño en TypeScript normal?
5. ¿Cuánto cuesta realmente Effect en el arranque del Worker con Sentry envolviendo la entrada?
   No lo he medido, solo está razonado en el §5.2. Hay que comprobarlo con `wrangler check
startup` en el piloto.
6. ¿Merece la pena el lenguaje de servicio de Effect (`@effect/language-service`, tsgo) que
   recomienda el README? No se ha evaluado su integración con `astro check`.

## Apéndice A. Cómo reproducir las mediciones

Todo se ejecutó fuera del repo, en un directorio temporal, el 2026-10-02 con Node 22.22.3.

**A.1 Bundle.** Directorio con `effect@4.0.0`, `zod@4.4.3`, `rollup`,
`@rollup/plugin-node-resolve`, `@rollup/plugin-terser`, `vite@8.2.2` y `esbuild@0.28`. Otro igual
con `effect@3.22.2`. Las fixtures usan imports profundos (`effect/Effect`, `effect/Schema`…),
igual que las oficiales ([basic.ts][fx-basic], [http-client.ts][fx-http]). Configuración de
Rollup: `nodeResolve({ browser: true })` + `terser({ mangle: true, compress: true })`, salida
`esm`. Vite: `build({ build: { lib: { entry, formats: ['es'] }, minify: true } })`. Tamaños con
`gzip -9` / `zlib.gzipSync(…, { level: 9 })`. Struct equivalente en todas las librerías:
`{ commandId: string, action: literal('create'), entityType: enum(['account','category']), data:
record(string, unknown) }`. La fila «`command-schemas.ts` real» importa `syncCommandSchema`,
`entityCreatePayloadSchemas` y `entityUpdateSchemas` del fichero del repo, sin modificarlo.

Aviso: con esbuild y el _barrel_ `import { Effect } from "effect"` el árbol no se sacude igual
(29,7 KB gzip el mínimo). Por eso las cifras de la tabla usan imports profundos. Vite/Rolldown con
el barrel no se midió.

**A.2 Bocetos.** `tsc --noEmit` con `strict`, `moduleResolution: Bundler` y `lib: [ES2022, DOM]`
contra `effect@4.0.0` y `typescript@5.9.3`: sin errores. El boceto 4.2 se ejecutó con un
`fetch` simulado que falla dos veces y 12 comandos encolados: 5 llamadas a `fetch` (2 fallidas y
3 lotes), `whenIdle()` resuelto tras ~3011 ms (backoff de 1 s + 2 s) y cola vacía.

**A.3 Rechazo de `runPromise`.**
`Effect.runPromise(Effect.fail(new E1()))` con `class E1 extends Data.TaggedError("E1")`. En
4.0.0 el `catch` recibe `E1` (`instanceof E1 === true`). En 3.22.2 recibe `FiberFailureImpl`
(`instanceof E1 === false`).

**A.4 Versiones.** `npm view <paquete> dist-tags time peerDependencies` para `effect`,
`@effect/vitest`, `@effect/sql-d1`, `@effect/sql-drizzle`, `@effect/platform`, `@effect/schema`,
`@effect/platform-browser`, `@effect/atom-vue` y `vitest`, el 2026-10-02.

## Fuentes

Primarias, consultadas el 2026-10-02:

- [effect-readme]: `README.md` del paquete `effect@4.0.0` (en npm, idéntico a
  <https://github.com/Effect-TS/effect/blob/main/packages/effect/README.md>).
- [rel-400]: notas de la release `effect@4.0.0`,
  <https://github.com/Effect-TS/effect/releases/tag/effect%404.0.0>.
- [migration]: <https://github.com/Effect-TS/effect/blob/main/MIGRATION.md>.
- [mig-services]: <https://github.com/Effect-TS/effect/blob/main/migration/services.md>.
- Migración de Schema (Standard Schema, `toStandardSchemaV1`):
  <https://github.com/Effect-TS/effect/blob/main/migration/schema.md>.
- [bundle-readme]: <https://github.com/Effect-TS/effect/blob/main/packages/tools/bundle/README.md>.
- [bundle-plugins]:
  <https://github.com/Effect-TS/effect/blob/main/packages/tools/bundle/src/Plugins.ts>.
- [fx-basic]:
  <https://github.com/Effect-TS/effect/blob/main/packages/tools/bundle/fixtures/basic.ts>.
- [fx-http]:
  <https://github.com/Effect-TS/effect/blob/main/packages/tools/bundle/fixtures/http-client.ts>.
- [d1client]: <https://github.com/Effect-TS/effect/blob/main/packages/sql/d1/src/D1Client.ts>.
- Listados del monorepo: `packages/`, `packages/sql/`, `packages/platform/`, `packages/atom/` y
  `packages/atom/vue/README.md` en <https://github.com/Effect-TS/effect/tree/main/packages>.
- [i8038]: <https://github.com/Effect-TS/effect/issues/8038>.
- [pr8114]: <https://github.com/Effect-TS/effect/pull/8114>.
- [i6319]: <https://github.com/Effect-TS/effect/issues/6319>.
- [i8205]: <https://github.com/Effect-TS/effect/issues/8205>.
- [why-effect]: <https://effect.website/docs/v4/getting-started/why-effect>.
- [cf-limits]: <https://developers.cloudflare.com/workers/platform/limits/>.
- Registro npm: <https://www.npmjs.com/package/effect>, <https://www.npmjs.com/package/@effect/vitest>,
  <https://www.npmjs.com/package/@effect/sql-d1>, <https://www.npmjs.com/package/@effect/sql-drizzle>,
  <https://www.npmjs.com/package/@effect/atom-vue>, <https://www.npmjs.com/package/vitest>
  (consultados con `npm view`, apéndice A.4).
- Declaraciones publicadas de `effect@4.0.0`: `dist/Effect.d.ts` (`tryPromise`, `retry`,
  `timeoutOrElse`, `runPromise`, `cachedWithTTL`), `dist/Schedule.d.ts` (`exponential`, `min`),
  `dist/Queue.d.ts`, `dist/Latch.d.ts`, `dist/FiberSet.d.ts`, `dist/Schema.d.ts`,
  `dist/http/HttpClient.d.ts` (`retryTransient`, `withRateLimiter`, `@stability unstable`).
- Repo: los ficheros citados con `fichero:línea` en el texto; issues #190, #191 y #233 de
  `alberba/finance-tracker`.

[effect-readme]: https://github.com/Effect-TS/effect/blob/main/packages/effect/README.md
[rel-400]: https://github.com/Effect-TS/effect/releases/tag/effect%404.0.0
[migration]: https://github.com/Effect-TS/effect/blob/main/MIGRATION.md
[mig-services]: https://github.com/Effect-TS/effect/blob/main/migration/services.md
[bundle-readme]: https://github.com/Effect-TS/effect/blob/main/packages/tools/bundle/README.md
[bundle-plugins]: https://github.com/Effect-TS/effect/blob/main/packages/tools/bundle/src/Plugins.ts
[fx-basic]: https://github.com/Effect-TS/effect/blob/main/packages/tools/bundle/fixtures/basic.ts
[fx-http]: https://github.com/Effect-TS/effect/blob/main/packages/tools/bundle/fixtures/http-client.ts
[d1client]: https://github.com/Effect-TS/effect/blob/main/packages/sql/d1/src/D1Client.ts
[i8038]: https://github.com/Effect-TS/effect/issues/8038
[pr8114]: https://github.com/Effect-TS/effect/pull/8114
[i6319]: https://github.com/Effect-TS/effect/issues/6319
[i8205]: https://github.com/Effect-TS/effect/issues/8205
[why-effect]: https://effect.website/docs/v4/getting-started/why-effect
[cf-limits]: https://developers.cloudflare.com/workers/platform/limits/
