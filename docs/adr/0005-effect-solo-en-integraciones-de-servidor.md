# Effect entra solo en las integraciones de servidor, detrás de una frontera Promise

> Reemplazado por [ADR-0006](0006-effect-de-punta-a-punta.md).

Cada cliente de un proveedor externo (`stockevents.ts`, `market-data.ts`, `github-issues.ts`)
reinventa timeout, abort, clasificación de errores, reintento y caché, y lee las respuestas con
`as` sin validarlas. La integración Bitvavo (#190/#191) pide todo eso a la vez: rate limits con
`Retry-After`, backoff, exclusión de sincronizaciones concurrentes y un cursor que solo avanza
cuando el rango termina bien.

Decidimos usar Effect v4 en las integraciones de servidor con proveedores externos, empezando por
Bitvavo como piloto, y en ningún otro sitio por ahora. Los módulos Effect exportan funciones que
devuelven `Promise` y rechazan con sus propios `Data.TaggedError`; ningún tipo `Effect<…>` sale del
módulo. La versión de `effect` se fija exacta, no con `^`. Mientras el repo siga en Vitest 4, los
tests ejecutan el código con `Effect.runPromise` y una capa HTTP falsa, sin `@effect/vitest`.

Quedan fuera el cliente (Pinia, componentes, `src/stores/sync.ts`), `src/domain/**`, los esquemas
zod y Drizzle. El cliente solo entraría con una medición de `pnpm benchmark:performance` delante;
el coste de bundle está medido en `docs/research/effect-ts-viabilidad.md`.

Si al cerrar el piloto el código no es claramente mejor que su versión a mano, se para ahí: la
frontera Promise permite reescribir el módulo en async/await sin tocar a quien lo llama.
