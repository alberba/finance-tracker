# Bitvavo: importación inicial y sincronización

El recorrido vive en Configuración → Conexiones → Bitvavo, con sync v2 activo.
El grid de Conexiones reúne Stock Events y Bitvavo; cada tarjeta abre los ajustes de su proveedor
en un panel lateral. Los movimientos importados se consultan en Inversión → Movimientos.
Conexiones es una pestaña de Configuración. Las listas de efectivo de Stock Events se asignan
en la ficha de cada cuenta; las listas y los tickers de inversión, en la ficha de cada activo.
La persona selecciona una cuenta EUR propia, fecha inicial y zona IANA, y entrega una clave de
una cuenta normal con **solo lectura**. Se consulta únicamente `GET /v2/account/history`.
El servidor valida la clave antes de guardar API key y secreto juntos con AES-256-GCM en
`integration_credentials`; usa la misma clave de cifrado versionada que Stock Events.
`DATA_ENCRYPTION_KEY` tiene que estar configurada en el Worker. Ninguna respuesta, bootstrap
o exportación incluye las credenciales.

La vista previa se guarda en `bitvavo_previews` y tiene una identidad propia. Confirmar envía esa
identidad y las resoluciones de duplicados; no admite una selección libre de operaciones. Toda
coincidencia aproximada exige elegir expresamente entre crear o vincular. Un movimiento manual
solo puede vincularse una vez dentro de una vista previa. La vista queda invalidada al cambiar
la configuración; un reintento parcial conserva las mismas resoluciones.

El contrato de #246 está documentado en `docs/research/bitvavo-contract.md`: cantidad y precio
unitario se conservan como cadenas decimales, el flujo EUR es bruto y la comisión va separada.
Una compra consume bruto + comisión; una venta devuelve bruto − comisión. El signo del libro
mayor es positivo para la compra y negativo para la venta. Comisión cero EUR sigue siendo el
supuesto autorizado allí; otras divisas, tipos y contratos incoherentes aparecen como
incompatibles. No se infieren precios ni tolerancias contables.

`transactions.remote_operation` conserva identidad, instante, zona, fecha/hora local, lado,
símbolo, cantidad, precio, comisión e importe exactos. `external_id` es único por usuario. El
detalle de inversión mantiene los valores numéricos existentes para los cálculos de la app;
la proyección conserva también los datos remotos exactos, visibles en «Ver operación Bitvavo».
Los repositorios rechazan el borrado y los cambios financieros de estos movimientos. Declaración,
descripción y categoría siguen siendo locales. El instrumento se vincula automáticamente solo
si existe una coincidencia única entre los instrumentos del usuario; puede resolverse desde el
detalle con un instrumento propio.

Cada operación se escribe junto a su detalle, revisión y cambio de sync en un `D1.batch` atómico
(transacción SQLite en Vitest). Una reserva por usuario excluye importaciones y cambios de
configuración concurrentes, y se renueva entre operaciones. Una caída deja el cursor sin avanzar;
los movimientos completados se reconocen por identidad externa al reintentar. El cursor avanza
solo al terminar el `Effect.gen` de confirmación. Las revisiones y el bootstrap permiten que otros
clientes vean los cambios. La primera importación consulta el rango completo configurado.

## Sincronización (#191)

Tras la primera importación el panel deja de ofrecer la vista previa y muestra la sincronización:
estado, último intento, última sincronización correcta y los contadores creadas, actualizadas, sin
cambios y omitidas (`bitvavo_connections.last_*`). «Sincronizar ahora» vuelve a leer desde el
cursor menos un solapamiento de 7 días (`SYNC_OVERLAP_MS`) y clasifica cada operación por su
`external_id`: nueva, corregida o igual. Una corrección reescribe los campos financieros y la
proyección local; conserva declaración, descripción, categoría, cuenta y vínculo con el
instrumento. El cursor es el mayor instante remoto del rango y solo avanza en la escritura final
(`finishRange`), junto con las omitidas y el resultado; un fallo entre operaciones registra el
intento como fallido y el reintento reconoce lo ya aplicado.

Las operaciones incompatibles (precio o comisión fuera de EUR) se guardan en `bitvavo_skipped`
solo con identidad, instante y motivo. «Reintentar omitidas» amplía el rango hasta la más antigua
y vuelve a consultar Bitvavo; nunca reproduce un payload guardado. Un rango completo sustituye las
omitidas que cubre.

La reserva de `bitvavo_connections` impide dos sincronizaciones, importaciones o cambios de
configuración a la vez; vive en la base de datos porque varias instancias pueden atender al mismo
usuario. Los límites de frecuencia, `Retry-After`/reset y el backoff siguen en el `Schedule` del
cliente. Una clave rechazada (401/403) deja la conexión en «Requiere atención»; guardar una clave
nueva la limpia sin tocar cursor ni movimientos. Con la conexión hecha, la clave es opcional al
guardar ajustes.

Adelantar la fecha inicial anula el cursor para traer el historial anterior; retrasarla no borra
nada. La cuenta vinculada queda fija tras la primera importación. Cambiar la zona horaria
rematerializa fecha y hora de cada movimiento importado desde `executedAt` (UTC), de forma
idempotente si se interrumpe. Desconectar borra configuración, clave, vistas previas y omitidas;
los movimientos se conservan y una reconexión los reconoce por su identidad.

`integration_audit_events` registra configuración, lectura de la clave, sincronización y
desconexión con su resultado y, como mucho, contadores o el mensaje saneado; nunca secretos ni
datos remotos.

## Piloto de Effect

`effect` está fijado a **4.0.0**, solo en `src/lib/server/bitvavo/`. El servicio HTTP se suministra
con `Layer.succeed`; las funciones públicas devuelven Promise y los errores son `Data.TaggedError`
propios. Schema valida el proveedor, timeout cancela también la lectura del cuerpo y Schedule
combina backoff con `Retry-After` y `bitvavo-ratelimit-resetat`. Si el proveedor pide esperar más
de un minuto se devuelve el límite de frecuencia para reintentar después. Zod, Drizzle y los
stores mantienen sus interfaces.

Frente a async/await, la mejora está en compartir cancelación, timeout y reintento sin otro bucle
de temporizadores y controladores AbortController; la frontera Promise mantiene esa elección
reversible. La persistencia sigue explícita en los repositorios: Effect no sustituye la atomicidad
de D1. Las pruebas Vitest 4 ejecutan la frontera Promise con HTTP falso y su capa, sin
`@effect/vitest`.

Medición local de `wrangler check startup` en esta máquina (2026-10-04), comparando
`v2` (`056f29a`) con la integración y las mismas versiones de dependencias:

| Medida                |        Base | Con Bitvavo |
| --------------------- | ----------: | ----------: |
| Bundle Worker         | 1980,52 KiB | 2305,67 KiB |
| Gzip                  |  452,89 KiB |  543,72 KiB |
| CPU activa muestreada |     31,3 ms |     28,8 ms |

Es una muestra local, no una predicción del arranque en producción ni evidencia de una mejora
de velocidad; no mostró regresión de arranque. Para reproducir con el build Astro:

```sh
pnpm build
pnpm exec wrangler deploy --dry-run --config dist/server/wrangler.json --outfile /tmp/bitvavo-worker.bundle
pnpm exec wrangler check startup --worker /tmp/bitvavo-worker.bundle --outfile /tmp/bitvavo-startup.cpuprofile
```

## Pruebas

Las fronteras cubiertas son el HTTP del proveedor, confirmación/repositorios con SQLite,
proyección y sync, estados del panel y recorrido Playwright con rutas y D1 reales. Para E2E,
las identidades del proveedor de autenticación de pruebas, exclusivamente en loopback con
`TEST_AUTH_ENABLED`, aportan el historial falso mediante `X-Test-Bitvavo-History`; nunca llaman
a Bitvavo real; `X-Test-Bitvavo-Status` simula una clave revocada o una caída. Las cabeceras no
alteran el proveedor de una identidad de producción.

```sh
pnpm exec vitest run tests/unit/bitvavo.test.ts tests/integration/d1-v2/bitvavo.test.ts \
  tests/integration/d1-v2/bitvavo-sync.test.ts tests/component/NeonBitvavoPanel.test.ts
pnpm exec playwright test --config playwright.bitvavo.config.ts
```
