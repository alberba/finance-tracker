# Effect de punta a punta, con el runtime solo en los bordes del framework

Reemplaza a [ADR-0005](0005-effect-solo-en-integraciones-de-servidor.md). El piloto de Bitvavo dejó
claro que timeout, reintento, errores tipados y validación se escriben una vez y se componen, pero
la frontera `Promise` obliga a cada llamador a volver a manejar errores sin tipo. Mientras convivan
las dos formas, cada módulo migrado paga el traductor y ninguno gana la garantía completa.

Decidimos usar Effect v4 en todo el código con efectos, sin frontera `Promise` entre módulos: las
funciones devuelven `Effect<A, E, R>`, los errores son `Data.TaggedError` y las dependencias entran
por `Context.Service` y `Layer`. Esto cubre servidor, cliente, stores, composables y acceso a datos.

## Dónde se ejecuta un Effect

Algo tiene que ejecutar el programa. Hay un `ManagedRuntime` por lado, y `runPromise`/`runFork`
solo aparece en estos bordes:

- **Servidor:** endpoints de Astro (`src/pages/api`) y middleware. Un runtime con la capa de base de
  datos, auth y proveedores.
- **Cliente:** manejadores de eventos de Vue y acciones de Pinia que un componente invoca. Un
  runtime con outbox, red y almacenamiento local.
- **Tests:** `Effect.runPromise` con capas falsas. `@effect/vitest` solo si soporta Vitest 4; sin
  verificarlo aún.

## Qué no se envuelve

- `src/domain/**` y cualquier función pura y síncrona se queda pura. Envolverla en `Effect.succeed`
  es ruido, no migración. Solo se migra el código con efectos (E/S, fallo, concurrencia, tiempo).
- Los componentes Vue puros no cambian; solo cambia cómo llaman a stores y composables.

## Esquemas: zod sale al final

El coste de bundle medido (`docs/research/effect-ts-viabilidad.md`, §5.1) es de 8 a 29 KB gzip sobre
un arranque de ~200 KB, que se suma a los ~22 KB de zod. Si Effect Schema sustituye a zod en
`command-schemas.ts` (compartido por cliente y servidor), zod desaparece y el coste neto baja. Esa
sustitución va en la última fase, con el esquema ya medido; hasta entonces zod y Schema conviven.

## Versión y fases

`effect` sigue fijado en versión exacta. La fase 1 sube 4.0.0 a la última estable de la serie 4 y lo
registra en su commit.

1. Fundaciones: este ADR, ajuste de `CODING_STANDARDS.md`, bump de `effect`.
2. Datos: Drizzle como servicio (`src/db`). Son 21 repositorios y cada uno arrastra a sus
   llamadores, así que se migra un repositorio por commit. La consulta de Drizzle sigue siendo una
   `Promise` por dentro; la frontera del repositorio es `Effect<A, DatabaseError, Database>`
   (`lift`). Los llamadores aún sin migrar usan `runWithDb`, que desaparece en las fases 3 y 4.
3. Servidor: `src/lib/server`, `src/services` y las integraciones restantes (`stockevents`,
   `market-data`, `github-issues`), siguiendo el patrón de Bitvavo.
4. Endpoints: `src/pages/api` y middleware ejecutan sobre el runtime de servidor.
5. Cliente: `stores/sync`, outbox y composables. **Antes** de empezar, `pnpm benchmark:performance`.
6. Componentes: solo los puntos de entrada de eventos.
7. Esquemas: zod a Effect Schema y retirada de zod.

Cada fase va en su propio PR apilado, con typecheck y tests dirigidos; el conjunto completo y el
E2E smoke solo al final de cada PR.

## Presupuesto y salida

Tras las fases 5 y 7 se vuelve a medir y se anota el delta aquí. Presupuesto propuesto: el JS de
arranque transferido no crece más de 10 KB gzip respecto al valor previo a la fase 5 (200,29 KB). Si
se supera y no se puede recuperar con chunks diferidos, el cliente se queda en su forma actual y el
resto de la migración sigue en pie.
