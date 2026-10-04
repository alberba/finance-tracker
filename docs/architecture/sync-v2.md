# Camino de un campo en sync v2

Un campo nuevo o cambiado cruza estos ficheros, en este orden. Si un campo falta en uno de
ellos, se pierde o el comando se rechaza; #205 fue un constructor que no lo llevaba.

## Ida: de la UI a D1

1. **Constructor del payload** en el store de la sección (`src/stores/*.ts`). Ojo: hay **tres
   constructores de movimientos**:
   - `buildInvestmentTransactionData` (`src/stores/investment.ts`) envía `time`, `declared` y
     `operation`.
   - `buildTransactionData` de `src/stores/movements.ts` y el de `src/stores/recurring.ts` solo
     envían el movimiento básico. Un camino que puede tocar inversiones tiene que elegir el
     constructor por tipo, como hace `confirmPending`.
   - Los ajustes van por `syncSettingsUpdate` (`src/lib/client/command-mapping.ts`).
2. `src/lib/client/command-mapping.ts`: `syncListDiff` / `syncCreate` / `syncUpdate` convierten el
   antes/después en comandos.
3. `src/stores/sync.ts` `enqueueCommand` → `src/lib/client/outbox.ts` `enqueue`: valida contra los
   esquemas zod y guarda en IndexedDB. `flush` envía a `POST /api/sync`.
4. `src/lib/server/sync/command-schemas.ts`: esquema zod del comando. Lo comparten cliente y
   servidor. Los objetos son `.strict()`: un campo que falte aquí hace que la cola rechace el
   comando al encolarlo.
5. `src/lib/server/sync/apply-command.ts`: `applyOneCommand`, un `case` por entidad.
6. `src/db/repositories/<entidad>.ts`: escritura. `undefined` deja el valor, `null` lo borra.
7. `src/db/schema/*.ts` (Drizzle) + migración en `migrations-v2/`, escrita a mano con el
   siguiente número libre.

## Vuelta: de D1 al estado de la UI

8. `src/lib/server/bootstrap-payload.ts` `buildBootstrapPayload` (`GET /api/bootstrap`).
9. `src/lib/client/pending-overlay.ts`: aplica sobre el bootstrap los comandos aún en cola. Los
   ajustes booleanos se declaran aquí.
10. `src/lib/client/v2-state-projection.ts` `projectSyncV2State`: filas relacionales → estado.
11. `src/scripts/state.ts` `normalizeState` (valores por defecto y normalización) y
    `src/scripts/types.ts` (tipo `State`). Si la proyección emite un campo que `normalizeState`
    no conserva, se pierde.

**Fuera de la cadena**: la copia JSON de Datos. `src/pages/api/data/export.ts` vuelca las filas
y `src/pages/api/data/import.ts` las recrea campo a campo, así que un campo nuevo también se
añade ahí. `tests/integration/d1-v2/api/data-export-import.test.ts` (`seedFullDataset`) comprueba
que exportar → importar → exportar no pierde nada: rellena el campo nuevo en la semilla.

## Test

`tests/integration/d1-v2/round-trip/` ejecuta los stores reales contra SQLite con
`migrations-v2/` aplicadas y cubre la ida y la vuelta completas. Un campo nuevo lleva su caso en el
fichero de su entidad.
