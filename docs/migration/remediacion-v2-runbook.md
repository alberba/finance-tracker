# Runbook — remediación de persistencia v2

> Sustituye a `cutover-runbook.md` para esta fase. Aquel documento describe el
> cutover v1 → v2, que ya se ejecutó, y está desactualizado en varios pasos
> (llega a pedir comprobar el `ConflictResolutionDialog`, que #139 borró con el
> ADR 0003). Este cubre lo que queda: llevar a producción las entregas 2 y 3 del
> spec #136 y reparar los datos ya corrompidos.

## Estado de partida (comprobado el 18/09/2026)

- `finance-tracker-db-v2` está en `0001`. Le faltan cinco migraciones:
  `0002_movement_template`, `0002_subscription_dates`, `0003_category_emoji`,
  `0003_months_canonical` y `0003_movement_operation`, más
  `0004_close_schema`.
- Un usuario, 19 cuentas, 37 categorías, 383 movimientos, 312 celdas de
  presupuesto, 8 snapshots con 141 saldos, 96 detalles de operación, 9
  aportaciones, 6 suscripciones.
- **Los meses están en base 0** (`budget_entries.month` 0-11,
  `wealth_snapshots.month` 0-7). `0003_months_canonical` los pasa a 1-12.
- **Hay una colisión de clave de correlación** en `contributions`: dos
  aportaciones de marzo comparten `contrib-snapshot-2026-3`. Son dos filas
  reales (el v1 ya las distinguía mal), así que el reparador mueve una a
  `contrib-snapshot-2026-3@2` en vez de borrarla.
- `PUBLIC_SYNC_V2=true` ya viene de `.env.production`. No hay flag que tocar.
- El código de esta remediación vive en `mal-guardado-v2-multiusuario`, no en
  `main`: son 46 commits. `main` solo tiene la primera entrega (sincronización).

## Antes de la ventana

1. **Punto de retorno.** Guarda el bookmark de Time Travel y un export completo:
   ```bash
   wrangler d1 time-travel info finance-tracker-db-v2
   wrangler d1 export finance-tracker-db-v2 --remote --output=.data/v2-pre-remediacion.sql -y
   ```
2. **El respaldo de reparación** es el export **anterior al corte**. Se reconoce
   por su `meta`: `savedAt: 2026-08-12` y `source` apuntando al Excel. Un
   export generado por el propio v2 (`source: "sync-v2"`) **no sirve**: es una
   foto del estado ya corrompido y el reparador no tendría contra qué comparar.

## Secuencia

1. **Mergear y desplegar el código.** PR de `mal-guardado-v2-multiusuario` (con
   esta rama dentro) a `main`. Ojo: el push a `main` despliega por Workers
   Builds en paralelo al CI, sin esperarlo.
2. **Aplicar las migraciones aditivas.** El orden importa: el reparador consulta
   `categories.emoji`, que solo existe desde `0003`.

   ```bash
   pnpm d1:migrate:remote:v2
   ```

   Con wrangler no se pueden aplicar por tramos, así que hay **dos pasadas**:
   esta primera aplica las aditivas y, si el cierre entra en la misma pasada,
   `0004` falla y se revierte solo (el resto queda aplicado). Si eso pasa, es lo
   esperado hasta que el paso 4 haya corrido.
3. **Desplegar** el merge del paso 1, ahora que las columnas existen.
4. **Reparar.** El reparador escribe solo en una copia local de producción, así
   que primero hay que traerla:
   ```bash
   wrangler d1 export finance-tracker-db-v2 --remote --output=.data/v2-data.sql --no-schema -y
   npx tsx -e "import {openLocalV2Db} from './scripts/lib/migration-db'; openLocalV2Db('.data/v2-work.sqlite').close()"
   sqlite3 .data/v2-work.sqlite < .data/v2-data.sql   # avisa de app_state, es inofensivo
   ```
   Ensayo en seco y revisión del plan:
   ```bash
   pnpm db:repair --v2-sqlite=.data/v2-work.sqlite \
     --user-id=<id> --backup=<export anterior al corte>
   ```
   Con los datos actuales el plan son **11 fusiones de categorías y 1 renombrado
   de correlación**, y cero celdas o snapshots: tus presupuestos y tu patrimonio
   ya coinciden con el export del 12/08.

   Si el plan cuadra, ejecuta y emite el SQL para D1:
   ```bash
   pnpm db:repair --v2-sqlite=.data/v2-work.sqlite \
     --user-id=<id> --backup=<export anterior al corte> \
     --execute --remote-sql-out=.data/reparacion-remote.sql

   wrangler d1 execute finance-tracker-db-v2 --remote --file=.data/reparacion-remote.sql
   ```
   El SQL reemplaza por usuario solo las tablas que el plan toca (hoy:
   `categories`, `contributions`, `transactions`) y deja intactos
   `sync_changes`, `sync_commands`, `audit_events` y `user_revisions`:
   borrarlos haría que cualquier otro dispositivo se perdiera la reparación.
5. **Aplicar el cierre.**
   ```bash
   pnpm d1:migrate:remote:v2   # ahora 0004 entra sola
   ```
6. **Comprobar.** Un movimiento nuevo persiste al recargar, las 11 categorías
   fusionadas no duplican historial y el presupuesto aparece en el mes correcto.

## Trampas verificadas

- **El orden meses → cierre no es negociable.** `0003_months_canonical` corre
  `month = month + 1`; con los índices únicos de `0004` ya creados, el
  desplazamiento falla porque cada mes destino lo ocupa la fila del mes
  siguiente. Hay una prueba que fija esto en
  `tests/integration/d1-v2/migrations/months-canonical.test.ts`.
- **La normalización solo funciona con las filas ya dentro.** Es un `UPDATE`, así
  que si alguien reconstruye la base desde un dump y *luego* aplica las
  migraciones, el desplazamiento cae sobre tablas vacías y queda sin hacer. En
  producción las filas existen cuando se aplican, que es el caso normal.
- **Ventana cerrada.** El paso 4 lee producción y la vuelve a escribir, así que
  cualquier escritura intermedia se pierde. Con un solo usuario basta con no
  usar la app durante el proceso.

