# Camino de un campo en sync v2

Un campo nuevo o cambiado cruza estos ficheros, en este orden. Si un campo falta en uno de
ellos, se pierde o el comando se rechaza; #205 fue un constructor que no lo llevaba.

## Ida: de la UI a D1

1. **Comando del movimiento**: `syncMovements` (`src/lib/client/movement-commands.ts`) recibe
   las listas antes/después y la moneda general. Inversión, Movimientos y confirmación de
   pendientes usan la misma conversión y encolado. Su promesa termina al encolar, antes de que
   el servidor confirme:
   - Resuelve cuenta y categoría; conserva las cuentas con identidad pendiente y omite el comando
     si la cuenta requerida no se puede resolver.
   - Resuelve los instrumentos del bootstrap en caché por su id propio o su id de correlación de
     migración; incluye la referencia cuando está disponible sin exigir un instrumento de catálogo.
   - Prioriza la moneda propia, sin convertir importes, y envía hora y declarado para cualquier tipo.
   - Incluye la operación anidada solo con compra/venta explícita y títulos/precio finitos presentes.
     Una operación insuficiente se omite para conservar la previa en D1 o en un alta aún en cola. Cambiar a un tipo distinto
     de inversión envía `null`, eliminando solo la operación.
   - Envía `accountingMonth` (1-12) solo cuando el mes elegido difiere del de la fecha; si no,
     `null` y el mes sigue a la fecha. Es ya el mismo número que `Transaction.month` (ADR 0006):
     la proyección (`projectSyncV2State`) lo copia tal cual y, si es `null`, lo deriva de `date`.
   - Para operaciones importadas de Bitvavo, emite únicamente declarado y descripción. Los stores
     mantienen las restricciones de edición y borrado.
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

Las cotizaciones se configuran por símbolo con `userInstrument.quoteConfig`: símbolo visible,
ticker de consulta opcional (`quoteSymbol`), proveedor,
mercado, moneda y títulos manuales son privados del usuario. `alias` referencia su cuenta de
agrupación. El alta materializa la referencia del catálogo global sin modificar definiciones de
otros usuarios; los cambios del proveedor y ticker actualizan solo la configuración privada.
La proyección toma esa configuración de `userInstruments`, incluidos los comandos pendientes,
y conserva los precios transitorios solo si no cambia su fuente.

## Test

`tests/integration/d1-v2/round-trip/` ejecuta los stores reales contra SQLite con
`migrations-v2/` aplicadas y cubre la ida y la vuelta completas. Un campo nuevo lleva su caso en el
fichero de su entidad.
