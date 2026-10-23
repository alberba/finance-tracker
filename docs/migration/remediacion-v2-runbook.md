# Runbook — remediación de persistencia v2

> Sustituye a `docs/archive/cutover-runbook.md` para esta fase. Aquel documento describe el
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
- El cliente autenticado actual usa sync v2 directamente; no requiere una
  variable de selección de protocolo. Los endpoints legacy se retiran al cerrar
  la transición; ver `retention-checklist.md`.
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

Todo esto es una sola sentada, y **no uses la app entre el paso 1 y el paso 4**:
el código desplegado hoy da por hecho meses en base 0 (`amounts[entry.month]`,
sin restar uno), así que desde el desplazamiento de meses hasta el deploy lee
los presupuestos corridos un mes y una edición los reescribiría en base 0.

1. **Migraciones aditivas.** El orden importa: el reparador consulta
   `categories.emoji`, que solo existe desde `0003`, así que van antes que él.

   ```bash
   pnpm d1:migrate:remote:v2
   ```

   Con wrangler no se pueden aplicar por tramos, así que hay **dos pasadas**:
   esta primera aplica las aditivas y, al llegar al cierre, `0004` falla y se
   revierte solo (lo anterior queda aplicado). Es lo esperado: el paso 3 lo mete.

2. **Reparar.** El reparador escribe solo en una copia local de producción, así
   que primero hay que traerla. **El export tiene que ser con esquema**, tal cual
   sale de wrangler: así el fichero local queda con el mismo esquema que D1 y
   con los datos dentro. No vale crear el esqueleto con `openLocalV2Db` y cargar
   un dump de solo datos encima, porque `openLocalV2Db` aplica el juego completo
   —incluido el `0004`— y el cargue entonces choca con el `UNIQUE` de
   `contributions`, que es justo el duplicado que la reparación viene a resolver.

   ```bash
   wrangler d1 export finance-tracker-db-v2 --remote --output=.data/v2-prod.sql -y
   sqlite3 .data/v2-work.sqlite < .data/v2-prod.sql
   ```

   **Este export va después del paso 1, no antes.** El plan se calcula sobre
   esta copia; si está por detrás de D1, planifica contra datos que ya no son
   los de producción.
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

   El SQL contiene solo las sentencias que el plan cambia (hoy: los `UPDATE`
   que repuntan referencias, los `DELETE` de las categorías duplicadas y el
   `UPDATE` del `legacy_id`), en el mismo orden que el paso local. Volcar tablas
   enteras hacía caer a D1 con `D1_RESET_DO` (#187). Los repuntes, borrados y
   renombrados se pueden repetir sin daño; los `INSERT` de celdas o snapshots
   no, porque llevan ids generados en local y la segunda vez chocan. Si una
   celda planificada ya no existe en D1, el fichero aborta en ese punto. Deja intactos
   `sync_changes`, `sync_commands`, `audit_events` y `user_revisions`:
   borrarlos haría que cualquier otro dispositivo se perdiera la reparación.

3. **Aplicar el cierre.**
   ```bash
   pnpm d1:migrate:remote:v2   # ahora 0004 entra sola
   ```
4. **Mergear y desplegar.** Ahora que la base tiene las columnas, el merge:
   primero la PR de esta rama a `mal-guardado-v2-multiusuario`, y después la de
   `mal-guardado-v2-multiusuario` a `main`. El push a `main` despliega por
   Workers Builds en paralelo al CI, sin esperarlo, y tarda un par de minutos.
5. **Comprobar.** Un movimiento nuevo persiste al recargar, las 11 categorías
   fusionadas no duplican historial y el presupuesto aparece en el mes correcto.

## Trampas verificadas

- **El SQL que emite hoy `--remote-sql-out` no cabe por la puerta de D1.** El
  reparador vuelca las tablas enteras del usuario en vez de solo lo que cambia:
  sobre estos datos fueron 210 KB y 421 sentencias, y
  `wrangler d1 execute --remote --file=` falló dos veces seguidas con
  `D1_RESET_DO` al procesar la carga. Reintentar no sirve: el fichero se sube
  bien y lo que falla es el procesado («File already uploaded. Processing.»).
  Lo que sí entró fue un fichero con **solo las sentencias del plan** —los
  repuntes de referencia, los borrados de categoría y el renombrado—, que son
  idempotentes y se pueden repetir sin miedo si la ejecución falla a medias.
  Hasta que se corrija el emisor (issue #187), reduce el fichero a lo que el
  plan cambia antes de lanzarlo.
- **El orden meses → cierre no es negociable.** `0003_months_canonical` corre
  `month = month + 1`; con los índices únicos de `0004` ya creados, el
  desplazamiento falla porque cada mes destino lo ocupa la fila del mes
  siguiente. Hay una prueba que fija esto en
  `tests/integration/d1-v2/migrations/months-canonical.test.ts`.
- **La normalización solo funciona con las filas ya dentro.** Es un `UPDATE`, así
  que si alguien reconstruye la base desde un dump y _luego_ aplica las
  migraciones, el desplazamiento cae sobre tablas vacías y queda sin hacer. En
  producción las filas existen cuando se aplican, que es el caso normal.
- **Ventana cerrada.** El paso 4 lee producción y la vuelve a escribir, así que
  cualquier escritura intermedia se pierde. Con un solo usuario basta con no
  usar la app durante el proceso.
