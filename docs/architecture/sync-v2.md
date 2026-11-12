# Camino de un campo en sync v2

Un campo nuevo o cambiado cruza estos ficheros, en este orden. Si un campo falta en uno de
ellos, se pierde o el comando se rechaza; #205 fue un constructor que no lo llevaba.

## Ida: de la UI a D1

1. **Comando del movimiento**: `syncMovements` (`src/lib/client/movement-commands.ts`) recibe
   las listas antes/después y la moneda general. Inversión, Movimientos, confirmación de
   pendientes y `Vincular movimientos` usan la misma conversión y publicación. Cada comando se
   construye releyendo el movimiento actual, no la copia de la lista, y se escribe junto a su
   **generación persistida** en una sola transacción de IndexedDB de la cola
   (`src/lib/client/movement-publication.ts`): así una edición o un borrado posterior —también
   desde otra pestaña, sin Web Locks— no se sobrescribe con una instantánea antigua. Su promesa
   termina al publicar, antes de que el servidor confirme:
   - Resuelve cuenta y categoría; conserva las cuentas con identidad pendiente y omite el comando
     si la cuenta requerida no se puede resolver.
   - Resuelve los instrumentos del bootstrap en caché por su id propio o su id de correlación de
     migración; incluye la referencia cuando está disponible sin exigir un instrumento de catálogo.
   - Prioriza la moneda propia, sin convertir importes, y envía hora y declarado para cualquier tipo.
   - Incluye la operación anidada solo con compra/venta explícita y títulos/precio finitos presentes.
     Una operación insuficiente se omite para conservar la previa en D1 o en un alta aún en cola. Cambiar a un tipo distinto
     de inversión envía `null`, eliminando solo la operación.
   - Envía `accountingMonth` (1-12) solo cuando el mes elegido difiere del de la fecha; si no,
     `null` y el mes sigue a la fecha. Es ya el mismo número que `Transaction.month` (ADR 0008):
     la proyección (`projectSyncV2State`) lo copia tal cual y, si es `null`, lo deriva de `date`.
   - Envía `destinationAccountId` solo en un ahorro, y lo exige resuelto: sin cuenta de destino el
     comando se omite hasta que resuelva. En los demás tipos va `null`, que borra el destino al
     cambiar de tipo. La proyección lo devuelve a `Transaction.destinationAccountId` solo cuando
     sigue siendo un ahorro.
   - Para operaciones importadas de Bitvavo, emite únicamente declarado y descripción. Los stores
     mantienen las restricciones de edición y borrado.
   - Los ajustes van por `syncSettingsUpdate` (`src/lib/client/command-mapping.ts`).
2. `src/lib/client/command-mapping.ts`: `syncListDiff` / `syncCreate` / `syncUpdate` convierten el
   antes/después en comandos.
3. `src/stores/sync.ts` `enqueueCommand` / `publishMovementCommands` → `src/lib/client/outbox.ts`
   `enqueue` y `src/lib/client/movement-publication.ts`: validan contra los esquemas Effect Schema
   y guardan en IndexedDB. La base `finance-tracker-outbox-v2` es la versión 3: cada subida solo
   añade tiendas (`movementPublications`, `intents`, `intentProgress`) sin tocar `commands`, de
   modo que una cola pendiente de la versión anterior sobrevive; una conexión antigua que bloquee
   la subida produce un error tipado y visible en vez de esperar indefinidamente. Los comandos
   siguen siendo byte-compatibles con `/api/sync`: la intención viaja solo en la entrada de la cola.
   `flush` envía a `POST /api/sync`.
4. `src/lib/server/sync/command-schemas.ts`: esquema (Effect Schema) del comando. Lo comparten cliente y
   servidor. Los objetos son `.strict()`: un campo que falte aquí hace que la cola rechace el
   comando al encolarlo.
5. `src/lib/server/sync/apply-command.ts`: `applyOneCommand`, un `case` por entidad.
6. `src/db/repositories/<entidad>.ts`: escritura. `undefined` deja el valor, `null` lo borra.
7. `src/db/schema/*.ts` (Drizzle) + migración en `migrations-v2/`, escrita a mano con el
   siguiente número libre.

## Vuelta: de D1 al estado de la UI

8. `src/lib/server/bootstrap-payload.ts` `buildBootstrapPayload` (`GET /api/bootstrap`).
9. `src/lib/client/pending-overlay.ts`: aplica sobre el bootstrap los comandos aún en cola. Los
   ajustes booleanos se declaran aquí. Reconstruye la operación de los comandos de movimientos
   como `tradeDetail` para que también se vea tras reiniciar sin conexión; omitirla conserva la previa.
10. `src/lib/client/v2-state-projection.ts` `projectSyncV2State`: filas relacionales → estado.
11. `src/scripts/state.ts` `normalizeState` (valores por defecto y normalización) y
    `src/scripts/types.ts` (tipo `State`). Si la proyección emite un campo que `normalizeState`
    no conserva, se pierde. Moneda propia, hora y declarado se conservan para cualquier movimiento;
    solo los campos de operación se limpian cuando deja de ser inversión. No se inventan compra/venta,
    títulos ni precio cuando faltan.

**Fuera de la cadena**: la copia JSON de Datos. `src/pages/api/data/export.ts` vuelca las filas
y `src/pages/api/data/import.ts` las recrea campo a campo, así que un campo nuevo también se
añade ahí. `tests/integration/d1-v2/api/data-export-import.test.ts` (`seedFullDataset`) comprueba
que exportar → importar → exportar no pierde nada: rellena el campo nuevo en la semilla.

La vinculación de movimientos a una cotización fija sus ids objetivo al pulsar Vincular
(`src/lib/client/instrument-link.ts`) y se acepta solo después de persistir la intención y esos ids
en la base de la cola. Arranque y reconexión reconstruyen cada objetivo desde el estado **actual**
del movimiento (nunca desde una instantánea guardada) y publican comando y progreso en la misma
transacción; un paso ya encolado por otra pestaña se omite en vez de duplicarse. Tras un conflicto
el módulo relee el movimiento y genera otro intento con identidad nueva; el resto de comandos
conserva el rebase automático de ADR 0003.

La caché sigue siendo una proyección reconstruible en otra base: las confirmaciones se incorporan
antes de retirar el comando, y la retirada del comando y el avance del paso de la intención se
confirman juntos en la base de la cola. Si la respuesta se pierde o el proceso se interrumpe entre
esos pasos, el mismo comando (mismo `commandId` y contenido) queda disponible para un reenvío
idempotente; un cambio de contenido o un reintento explícito tras un rechazo definitivo usan un
`commandId` nuevo conservando la identidad del movimiento. Los estados visibles distinguen guardado
local, espera de conexión o dependencia, pendiente, confirmado, fallo definitivo y resultado
parcial; el fallo permite reintentar o descartar, y el descarte solo cancela lo que aún no se ha
reclamado, reconciliando antes un envío incierto. Los registros `intents`/`intentProgress` guardan
la dependencia de configuración (#491) y las confirmaciones recurrentes (#492).

La confirmación de un pendiente (`src/lib/client/recurring-write.ts`) persiste una reserva única
por pendiente con la edición resuelta, un solo id de movimiento y sus marcas; el alta del
movimiento se publica en la misma transacción que acepta la intención. La actualización del
pendiente solo se construye después de que el servidor confirme ese movimiento, para que nunca
referencie un movimiento que no pudo existir. Recargar, repetir desde otra pestaña o reintentar
reutiliza la reserva y la identidad; un rechazo definitivo espera un reintento explícito, que
emite un `commandId` nuevo conservando el movimiento. Descartar no revierte un movimiento ya
confirmado: la reserva permanece para impedir una segunda confirmación y el resultado parcial se
muestra; una reserva ya enlazada y confirmada se olvida para no crecer sin límite.

Las cotizaciones se configuran por símbolo con `userInstrument.quoteConfig`: símbolo visible,
ticker de consulta opcional (`quoteSymbol`), proveedor,
mercado, moneda y títulos manuales son privados del usuario. `alias` referencia su cuenta de
agrupación. El alta materializa la referencia del catálogo global sin modificar definiciones de
otros usuarios; los cambios del proveedor y ticker actualizan solo la configuración privada.
La proyección toma esa configuración de `userInstruments`, incluidos los comandos pendientes,
y conserva los precios transitorios solo si no cambia su fuente.

## Tocar el tipo de movimiento

Añadir o cambiar un tipo (`income`, `expense`, `investment`, `saving`…) afecta además a sitios que
el compilador no siempre marca. Tras `pnpm check`, busca el tipo con `grep -rn` en:

- `src/lib/finance-core.ts` y `src/domain/dashboard/view-model.ts`: totales y patrimonio.
- `src/domain/transactions/registry.ts` y `src/components/transactions/`: etiquetas, formulario
  y `TransactionPanel.vue`.
- `src/stores/recurring.ts` y `src/domain/recurring/pending.ts`: reglas y pendientes.
- `src/data/demo-seed.ts`, `src/lib/client/webmcp.ts` y `src/styles/global.css` (color del tipo,
  vigilado por `tests/unit/styles-guards.test.ts`).
- `tests/unit/finance-core.test.ts` y `tests/unit/dashboard-view-model.test.ts`.

## Test

`tests/integration/d1-v2/round-trip/` ejecuta los stores reales contra SQLite con
`migrations-v2/` aplicadas y cubre la ida y la vuelta completas. Un campo nuevo lleva su caso en el
fichero de su entidad.
