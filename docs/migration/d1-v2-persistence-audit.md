# Auditoría de persistencia D1 v2 — issue #134

> **Alcance.** Auditoría completa del flujo de persistencia tras la migración a *sync v2*
> (D1 multiusuario), a partir del reporte del issue
> [#134](https://github.com/alberba/finance-tracker/issues/134): «las suscripciones no se están
> guardando, y las compras de inversión recurrentes no guardan correctamente todos los campos».
>
> **Resultado.** Los dos bugs reportados son reales y están confirmados, pero son **dos casos
> particulares de un patrón que afecta a casi todas las secciones de la app**. Se documentan
> 31 hallazgos, 21 de ellos confirmados leyendo el código y verificados contra el DDL.
>
> **Método.** Comparación de cinco capas para cada entidad — UI/store → constructor de payload
> → esquema Zod del comando → repositorio → DDL real de `migrations-v2/0001_init_v2.sql` — más
> el camino de vuelta (`/api/bootstrap` → `projectSyncV2State` → `normalizeState`).
> Cada afirmación cita `fichero:línea`.
>
> **Etiquetas.** `CONFIRMADO` = probado leyendo el código, el fallo es determinista.
> `SOSPECHADO` = el código lo permite pero no he podido probar el camino que lo dispara.

---

## 1. Resumen ejecutivo

En la fecha de esta auditoría, **v2 había sustituido un blob JSON completo por un modelo relacional
que todavía no cubría el dominio**, y el camino legacy estaba apagado en producción por
`PUBLIC_SYNC_V2`. La retirada posterior de esa selección elimina el fallback del cliente actual;
la retención de rutas legacy en el servidor existe para rollback y consumidores históricos
explícitos. Los hallazgos de cobertura de campos de esta auditoría siguen requiriendo sus propios
fixes de sync v2.

De ahí salen cuatro familias de fallo, y conviene entenderlas por separado porque **los arreglos
son de naturaleza distinta**:

| # | Familia | Qué provoca | Coste del arreglo |
|---|---|---|---|
| **F1** | **Un comando inválido envenena la cola para siempre** | Desde el primer fallo, *nada* se guarda nunca más, en ninguna sección | Bajo — 2 ficheros |
| **F2** | **El `legacyId` de la migración no coincide con el que busca el cliente** | Categorías duplicadas, `categoryId: null` en cada movimiento, presupuesto descartado | Bajo — 1 fichero + script de datos |
| **F3** | **La proyección de lectura no devuelve el dato donde el usuario lo metió** | El dato *está* en D1 pero la UI lo muestra vacío, desplazado un mes, o lo descarta | Bajo — 1 fichero |
| **F4** | **El modelo relacional no tiene columnas para campos del dominio** | Pérdida real e irrecuperable de datos (símbolo, títulos, precio, comisión, saldos…) | Alto — requiere migración |

Los dos bugs del issue son, respectivamente, un caso de **F3+F4** (suscripciones) y de
**F3+F4 más un `syncListDiff` que falta** (inversión recurrente).

### La cadena causal más probable en producción

Lo que un usuario describiría como «v2 guarda mal» es muy probablemente **una sola cosa**:

1. El usuario registra un movimiento de inversión.
2. `buildInvestmentTransactionData` manda el `accountId` **local**, sin resolver
   (`src/stores/investment.ts:44`).
3. El servidor lanza «La cuenta indicada no existe o no pertenece al usuario»
   (`src/db/repositories/shared.ts:159-167`) → HTTP 500 (`src/lib/server/api-auth.ts:48-49`).
4. El cliente hace `scheduleRetry()` **sin descartar nunca la entrada**
   (`src/stores/sync.ts:388-391`), y la cola es FIFO (`src/lib/client/outbox.ts:127-130`).
5. **Ese comando queda en la cabeza de la cola para siempre y nada detrás de él se envía jamás.**

A partir de ese momento la app sigue mostrando toasts de «Guardado», el único aviso es un texto
discreto en el sidebar (`src/scripts/shell.ts:284-298`), y al recargar ha desaparecido todo.
Eso explica por sí solo que el síntoma se perciba como global y aleatorio.

---

## 2. F1 — El amplificador: un comando inválido bloquea toda la sincronización

**Esto hay que arreglarlo primero**, porque convierte cualquier otro bug de esta lista en «no se
guarda nada».

### 2.1 `CONFIRMADO` — Retry infinito sin descarte, con la cola bloqueada en la cabeza

`src/stores/sync.ts:388-391`: cualquier respuesta que no sea 2xx/409 lanza, y el `catch` sólo
hace `scheduleRetry()` (backoff con tope de 30 s), **sin límite de intentos y sin sacar la
entrada de la cola**. `peekBatch` es FIFO (`src/lib/client/outbox.ts:127-130`), así que la
entrada envenenada es siempre la cabeza del lote.

Existe la función preparada para evitarlo, **y no se llama desde ningún sitio**:

```
$ grep -rn "recordFailure" src/
src/stores/sync.ts:364:          // of `recordFailure`'s indefinite backoff — surfaced via
src/lib/client/outbox.ts:153:export async function recordFailure(db, seq, error): Promise<void>
```

Un comentario la menciona; nadie la invoca. No hay contador de intentos en ninguna parte.

### 2.2 `CONFIRMADO` — La fila `sync_commands` queda en `processing` de forma permanente

`reserveCommand` inserta la fila con `status='processing'`, `result=NULL` **fuera** de la
transacción (`src/lib/server/sync/apply-command.ts:459-494`), y `runInTransaction` degrada a
ejecución secuencial sin atomicidad en D1 — está documentado en el propio código
(`src/db/repositories/shared.ts:111-131`, `beginUnsupported`). Si `performMutation` lanza, no hay
rollback: la fila se queda en `processing` para siempre. En cada reintento, pasados 30 s,
`claimStaleCommand` la reclama y **vuelve a ejecutar el mismo payload inválido**.

> ⚠️ **Consecuencia operativa:** corregir el código no basta. Hay que limpiar las filas
> `sync_commands` con `status='processing' AND result IS NULL` de los usuarios afectados, o su
> cola seguirá envenenada.

### 2.3 `CONFIRMADO` — `parse()` en vez de `safeParse()` convierte un payload inválido en un 500

`src/lib/server/sync/apply-command.ts:288` y `:327` usan `schema.parse()`, que **lanza** si falta
un campo requerido. Y la validación del cliente no protege: `createCommandSchema.data` es
`z.record(z.string(), z.unknown())` (`command-schemas.ts:170`), así que **el payload por entidad
no se valida nunca en el cliente**.

Además todos los `z.object` están en modo *strip* (el de por defecto): un campo que el cliente
manda y el esquema no declara **desaparece sin error ni aviso**. Es el mecanismo exacto por el
que se pierden los campos del bug (b) del issue.

### 2.4 `CONFIRMADO` — Un conflicto congela la cola, y «conservar local» no puede resolverlo

`src/stores/sync.ts:294-296`: mientras haya un conflicto abierto no se envía nada más. Y el
diálogo de resolución **no puede cerrarlo**, por un desajuste de nombre de campo:

```ts
// El conflicto se guarda así — sync.ts:350-354
server: { currentVersion: result.currentVersion, message: result.message }

// …y keepLocal lee otra cosa — sync.ts:484
const server = conflict.server as { version?: number } | null
baseVersion: server?.version ?? conflict.local.baseVersion   // ← siempre undefined
```

`server.version` no existe, así que se reenvía el **mismo `baseVersion` obsoleto** → conflicto
otra vez → bucle infinito. Y llegar ahí no requiere dos dispositivos: dos ediciones seguidas de
la misma fila antes de que responda la primera ya generan el conflicto
(`apply-command.ts:314-325`).

**Fix:** `server?.currentVersion ?? conflict.local.baseVersion`.

### 2.5 `CONFIRMADO` — Cambiar la divisa rompe `pullChanges` de forma permanente

`apply-command.ts:282` registra el cambio con `entityType: "userSettings"`:

```ts
const revision = await recordChange(db, userId, "userSettings", userId, "update", command.patch);
```

Pero `openIdbCache` sólo crea object stores para los 11 de `SYNC_ENTITY_TYPES` más `__meta`
(`src/lib/client/idb-cache.ts:38-48`), y el bucle de `pullChanges` aplica cada cambio **sin
filtrar el tipo** (`src/stores/sync.ts:438-450`) → `db.transaction("userSettings", …)` →
`NotFoundError`. El `try/catch` del bucle sólo envuelve el `JSON.parse`, no la escritura.

Como `revision.value` y `setCachedRevision` están **después** del bucle, el cursor nunca avanza:
el mismo cambio se vuelve a traer en cada pull y **el fallo es permanente**. Peor, propaga:
`syncNow()` → `init()` rechaza → en `src/scripts/app.ts:70-82` nunca se llega a `bindEvents()`
ni a `dataset.financeReady`, y en `src/scripts/shell.ts:277` es un `void` → *unhandled rejection*
silenciosa.

**Síntoma:** «cambié la divisa en Configuración y desde entonces la app va mal».

### 2.6 `CONFIRMADO` — Borrados que violan FK y devuelven 500

D1 **aplica claves foráneas por defecto y no se pueden desactivar**, sólo diferir dentro de una
transacción ([Cloudflare D1 docs](https://developers.cloudflare.com/d1/sql-api/foreign-keys/)).
El DDL no declara `ON DELETE CASCADE` en ninguna FK. Y estos borrados no limpian sus
dependencias:

| Operación | Falta borrar | Evidencia |
|---|---|---|
| `transactions.remove` | `investment_trade_details` (FK sin cascada) | `src/db/repositories/transactions.ts:126-137`; DDL `:96`. `removeTradeDetail` (`:232`) no se llama desde ningún sitio |
| `removeCategory` | 7 tablas la referencian | `src/db/repositories/accounts.ts:231-247` |
| `accounts.remove` | sin comprobación de referencias | `src/db/repositories/accounts.ts:113-124`. `src/stores/settings.ts:158-167` lo delega explícitamente a «the account row's FK behavior», que **no existe** |
| `wipeUserData` («empezar de cero») | borra `transactions` sin tocar `investment_trade_details` | `src/pages/api/state/reset.ts:103-105` |

Cada uno devuelve `FOREIGN KEY constraint failed` → 500 → §2.1. **Borrar un movimiento de
inversión, renombrar una categoría o resetear la cuenta bloquean la cola.**

> Nota sobre renombrar: el `legacyId` de una categoría es `${kind}:${name}`
> (`command-mapping.ts:248-250`), así que **renombrar** se ve en el diff como *borrar la vieja +
> crear una nueva*, no como un `update` de `name`.

---

## 3. Los dos bugs del issue #134

### 3.1 `CONFIRMADO` — Las suscripciones no se guardan

La suscripción **sí se escribe en D1**. El escritura está bien cableada (`syncListDiff` en
`src/stores/movements.ts:420, 455, 473, 484`), el dispatcher la enruta, y el scoping por
`userId` es correcto. El fallo está **al leer de vuelta**: la proyección genera fechas
inválidas y `normalizeState` **descarta la fila entera**.

```ts
// src/lib/client/v2-state-projection.ts:106-107
startDate: String(subscription.createdAt || ''),   // "2026-09-12T10:31:22.481Z"
nextChargeDate: '',                                // vacío
```

```ts
// src/scripts/state.ts:754-760 — normalizeSubscriptions
.filter((item) =>
  item.name && item.amount > 0 &&
  /^\d{4}-\d{2}-\d{2}$/.test(item.startDate) &&      // timestamp ISO → false
  /^\d{4}-\d{2}-\d{2}$/.test(item.nextChargeDate),   // "" → false
);
```

Las dos regex están ancladas con `$`, así que **fallan siempre**. No es un caso borde: *toda*
suscripción se descarta en cada hidratación. Ejecutando `projectSyncV2State` con una fila real de
`/api/bootstrap` el resultado es `subscriptions -> []`.

**Y no se puede arreglar sólo en la proyección**, porque la tabla no tiene dónde guardar esas
fechas: `migrations-v2/0001_init_v2.sql:169-187` sólo tiene `billing_day`, sin `start_date` ni
`next_charge_date`. El exportador de rollback ya lo admite emitiendo cadenas vacías
(`scripts/export-v2-to-v1-json.ts:186-187`).

**Agravantes:** las filas se acumulan invisibles en D1, así que al no estar hidratadas ningún
`syncListDiff` posterior emite `remove` → **volver a crear «Netflix» duplica la fila cada vez**.
Y `materializeDueSubscriptions` (`movements.ts:418`) nunca vuelve a generar cargos.

**Fix.** Añadir `start_date` / `next_charge_date` a `subscriptions` y propagarlas por las cinco
capas. Como parche sin migración, derivar fechas válidas `YYYY-MM-DD` de `createdAt` +
`billingDay` en la proyección — recupera la visibilidad, pero pierde la fecha original y el
`billingDay` en frecuencias no mensuales.

### 3.2 `CONFIRMADO` — Las compras de inversión recurrentes pierden campos

Tres causas independientes se suman:

**(a) `updateRule` es la única mutación del store que no emite ningún comando.**

```
src/stores/recurring.ts:195  addRule     → syncListDiff ✅
src/stores/recurring.ts:253  toggleRule  → syncListDiff ✅
src/stores/recurring.ts:267  removeRule  → syncListDiff ✅
src/stores/recurring.ts:202-245  updateRule → (ninguno) ❌
```

Sólo llama a `refreshPending()`, y el diff de ahí es inútil para el cambio del usuario:
`refreshPending` captura `beforeRules = rules.value` (`:156`) **después** de que `updateRule` ya
aplicó los cambios, y compara contra `result.recurringRules`, que `generatePendingMovements`
construye con `{ ...rule }` tocando sólo las fechas (`src/domain/recurring/pending.ts:38-42`).
`syncListDiff` salta los ítems idénticos (`command-mapping.ts:307-309`).

> Esto explica literalmente el «no guarda todos los campos»: **que una edición persista depende
> de si el calendario se desplazó**. Si no se desplaza, se pierde por completo.

**(b) La tabla no puede representar la regla.** `RecurringRule` (`src/scripts/types.ts:110-130`)
tiene 18 campos; `recurring_rules` (DDL `:146-168`) puede representar 9. Se pierden
silenciosamente: `symbol`, `side`, `units`, `unitPrice`, `fee`, `time`, `interval`, `startDate`,
`endDate`, `lastExecutionDate` — ninguno tiene columna, ninguno está en el esquema Zod, y
`buildRecurringRuleData` (`src/stores/recurring.ts:45-62`) no los envía. Aunque se enviaran, Zod
los quitaría sin error (§2.3).

Al reabrir la regla, `symbol` — que el formulario declara `required`
(`InvestmentRecurringRuleForm.vue:134`) — sale vacío, y `units`/`unitPrice`/`fee` salen a `0`.

**(c) Los pendientes generados vuelven como gastos.** `pending_movements` (DDL `:124-145`) no
tiene columna `type` ni `description` ni los campos de operación, así que la proyección los
inventa (`v2-state-projection.ts:172-180`): `type: 'expense'`, `description: ''`. Una compra
recurrente de inversión **aparece como un gasto genérico**, y al confirmarla genera un movimiento
sin datos de operación. El vínculo `transactionId` también se pierde → riesgo de duplicar.

**Fix.** (a) es inmediato y sin migración: capturar `before` antes del `commitState` y añadir el
`syncListDiff` que falta. (b) y (c) requieren migración.

---

## 4. Severidad 1 — Pérdida de datos en otras secciones

### 4.1 `CONFIRMADO` — Toda cuenta creada o editada en la app desaparece de la UI

`src/stores/settings.ts:22-29` escribe siempre `kind: 'checking'`. La proyección filtra por otros
tres valores (`v2-state-projection.ts:65-67`):

```ts
projected.accounts        = bootstrap.accounts.filter((a) => a.kind === 'cash')
projected.investmentAssets = bootstrap.accounts.filter((a) => a.kind === 'investment')
projected.liabilities     = bootstrap.accounts.filter((a) => a.kind === 'liability')
```

La migración escribe `cash|investment|liability` (`scripts/lib/migration-runner.ts:70-72`).
`'checking'` **no lo reconoce ningún filtro**: la cuenta existe en D1 y no aparece en ninguna de
las tres listas.

Y es peor que eso: `entityUpdateSchemas.account` es `entityCreateSchemas.account.partial()`
(`command-schemas.ts:143`), así que el `kind` viaja también en los updates, y
`accounts.ts:96` hace `kind: input.kind ?? existing.kind` → **editar el nombre o el saldo de una
cuenta migrada sobrescribe su `kind` real con `'checking'` y la hace desaparecer**.

**Fix:** `kind: 'cash'` en `buildAccountData`, y no reescribir `kind` en los updates.

### 4.2 `CONFIRMADO` — Los saldos de Patrimonio no se guardan nunca

`src/stores/wealth.ts:53-64` sincroniza sólo la *existencia* del snapshot (fecha/año/mes), y
además **sólo `if (isNewSnapshot)`**. Los saldos que el usuario teclea van a `snapshot_balances`,
que está fuera de `SYNC_ENTITY_TYPES` por diseño documentado (`command-schemas.ts:12-19`).

El usuario ve «Snapshot guardado.» y al recargar `projectSyncV2State` reconstruye el snapshot con
`accounts:{} investments:{} liabilities:{}` → **todos los saldos a cero**. Pérdida total de la
sección.

### 4.3 `CONFIRMADO` — Los movimientos de inversión se guardan como un importe pelado

`investment_trade_details` no tiene **ninguna ruta de escritura en runtime**: `createTradeDetail`
(`transactions.ts:208`) sólo se llama desde el migrador, no existe `updateTradeDetail`, y la
tabla está fuera del contrato de comandos. `buildInvestmentTransactionData`
(`src/stores/investment.ts:41-52`) omite `side`, `units`, `unitPrice`, `fee`, `symbol`,
`instrumentId`, `time`, `declared`.

La proyección sólo rellena esos campos `if (tradeDetail)` (`v2-state-projection.ts:90-95`) — y el
detalle sólo existe para las filas migradas. **Símbolo, títulos, precio unitario, comisión y
compra/venta se pierden**, y todo el cálculo de cartera (TWR, holdings, valoración) queda
corrupto. Editar un movimiento migrado no actualiza su detalle, así que además queda
desincronizado del importe.

Caso visible y concreto: `toggleDeclared` (`src/stores/investment.ts:325-342`) emite un `update`
cuyo patch **no contiene `declared`** (no hay columna) → consume una versión, escribe
`updated_at`, y **el flag se revierte al recargar**.

### 4.4 `CONFIRMADO` — Presupuesto: el `legacyId` sin año descarta la primera edición y corrompe el año anterior

Dos convenciones distintas para el mismo identificador de correlación:

| Origen | `legacyId` de `budgetEntry` |
|---|---|
| Migración | `${type}:${category}:${year}-${pad2(month0)}` (`migration-runner.ts:549`) |
| Cliente | `${type}:${category}:${month + 1}` (`src/stores/budget.ts:78`) — **sin año** |

`findByLegacyId` hace un scan del usuario sin filtrar por año, así que en 2026 el servidor
devuelve la fila de 2025 como «ya existe» → el `create` degenera en `noop`
(`apply-command.ts:289-292`) y **no se crea nada**. Las ediciones siguientes resuelven al id de
2025 y aplican un `update` que **sobrescribe el importe del año anterior**; y como
`entityUpdateSchemas.budgetEntry` sólo admite `{amount, currency}` (`command-schemas.ts:149-152`),
el `year` de la fila nunca se corrige. Corrupción silenciosa cruzada entre años.

### 4.5 `CONFIRMADO` — Presupuesto: off-by-one, y diciembre se pierde

El cliente envía `month + 1` (1-12, coherente con el esquema Zod), y la proyección lo usa como
índice de un array 0-11:

```ts
// src/lib/client/v2-state-projection.ts:117
amounts[Number(entry.month)] = Number(entry.amount || 0)
```

**Todo el presupuesto se lee desplazado un mes** (enero reaparece en febrero), y diciembre
(`month=12`) escribe en el índice 12 de un array de 12 → fuera de rango, se pierde al
renormalizar (`state.ts:837-839`). Lo migrado se ve bien; sólo lo editado después se desplaza.

### 4.6 `CONFIRMADO` — Snapshots de patrimonio: `legacyId` sin año → colisión entre años

`src/stores/wealth.ts:59` usa `String(month)` como id de correlación (`"3"`), mientras la
migración usa `${year}-${monthKey}` (`migration-runner.ts:630`). Al guardar marzo de un segundo
año se resuelve el `legacyId "3"` del primero → se actualiza la fila del año anterior o el
`create` degenera en `noop`. La proyección remata el problema indexando por `String(snapshot.month)`
sin mirar `snapshot.year` (`v2-state-projection.ts:159`): **los snapshots de todos los años se
mezclan en el mismo mapa**. Con el mismo desfase +1 de §4.5, y aquí el `clamp(0,11)` de
`state.ts:800` hace que diciembre **colisione con noviembre**.

### 4.7 `CONFIRMADO` — El `legacyId` de las categorías no coincide → `categoryId: null` en todo

| Origen | `legacyId` de `category` |
|---|---|
| Migración | `item.name` → `"Comida"` (`migration-runner.ts:232`) |
| Cliente | `${kind}:${name}` → `"expense:Comida"` (`command-mapping.ts:248-250`) |

`resolveCategoryId` no encuentra la categoría migrada, **crea un duplicado** y devuelve `null`
(`command-mapping.ts:259-270`). Ese `null` se propaga: **cada transacción, suscripción y regla
nueva o editada se guarda con `categoryId: null`** → al recargar aparece «Sin categoría»
(`v2-state-projection.ts:87`), y la lista de categorías se duplica visualmente.

Para `budgetEntry` el `categoryId` es obligatorio, así que `buildBudgetEntryData` devuelve `null`
y `src/stores/budget.ts:82-87` **no emite nada, sin warning ni toast**: la primera edición de
cada celda de presupuesto se pierde entera.

### 4.8 `CONFIRMADO` — `investmentAssets` y `liabilities` no se sincronizan nunca

Las cuatro rutas de mutación de Configuración están guardadas por `if (key === 'accounts')`
(`src/stores/settings.ts:103, 135, 147, 163`). Añadir un activo de inversión o un pasivo **no
emite ningún comando** y desaparece al recargar. Está documentado como *leftover* en
`command-mapping.ts:82-84`, pero para el usuario es pérdida de datos.

---

## 5. Severidad 2 — Secciones que vuelven al estado migrado en cada recarga

Todas estas entidades **se hidratan** desde `/api/bootstrap` pero **el cliente nunca las
escribe**, porque están fuera de `SYNC_ENTITY_TYPES`. La exclusión es deliberada y está
documentada (`command-schemas.ts:12-19`, «left for a later WP»), pero el usuario sí las edita en
la UI, así que para él son datos que se pierden.

| Entidad | Qué edita el usuario | Qué pasa | Evidencia |
|---|---|---|---|
| `twr_liquidity_accounts` | Marcar cuentas de liquidez TWR | El toggle no persiste; el TWR se recalcula distinto en cada recarga | `settings.ts:239-255` no emite nada |
| `contribution_allocations` | Reparto del flujo de una aportación | `flowAllocations` queda vacío y `flowSource` cae a legacy | `v2-state-projection.ts:138-141` |
| `user_instruments` / `market_instruments` | Añadir instrumento, mercado, unidades en cartera | Nada persiste. Tampoco hay `updateInstrument`: `symbol`/`provider`/`assetClass` son *insert-only* e incorregibles | `src/stores/market.ts` no importa `command-mapping` |
| `stockevents_symbol_mappings` | Qué símbolos sincronizar, watchlist, ticker destino, ocultos | Todo se pierde salvo la API key; la integración queda «desactivada» | `v2-state-projection.ts:198-201` hardcodea `sync:false, hidden:false` |
| `categoryEmojis` | Emoji por categoría | **No existe tabla ni columna**; se pierde en cada recarga | `v2-state-projection.ts:50` lo deja en `{}` |
| `state.year` | Año seleccionado | Vuelve al año actual | `v2-state-projection.ts:47` |

`transactions` tampoco tiene columna para `time`, `declared`, `subscriptionId`,
`subscriptionChargeDate` ni `month` (DDL `:102-119`), y la UI de inversión pide `time` como
obligatorio.

### 5.1 `SOSPECHADO` (alta probabilidad) — N+1 en `/api/bootstrap`

`src/pages/api/bootstrap.ts:95-127` hace una consulta extra **por cada** transacción
(`getTradeDetailByTransaction`), por cada snapshot, por cada aportación y dos por instrumento.
Con unos cientos de movimientos son miles de subconsultas en una sola request → límite de
subrequests/CPU del Worker → 500.

Y un 500 aquí es destructivo, no sólo lento (§5.2). **Recomiendo medirlo con el dataset real
antes que cualquier otra cosa.**

### 5.2 `CONFIRMADO` — Un fallo de `/api/bootstrap` vacía la caché local y resetea el cursor

`src/stores/sync.ts:190-230`: si el fetch falla y no hay caché, `bootstrap` cae a una proyección
**vacía**, y acto seguido se ejecutan `replaceEntities(cacheDb, entityType, [])` y
`setCachedRevision(cacheDb, 0)`. Es decir: **un 500 transitorio borra la caché y pone el cursor a
cero**. A partir de ahí `getEntityRef` devuelve `null` para todo y cada edición se convierte en un
`create` duplicado.

### 5.3 `CONFIRMADO` — El ack del lote adelanta el cursor y se salta cambios de otros dispositivos

`src/stores/sync.ts:371-376` asigna `revision.value = body.revision`, que es la revisión **global**
del usuario tras el lote (`apply-command.ts:551-552`), no las revisiones que este dispositivo ha
aplicado. Si otro dispositivo generó las revisiones 5-7 y este flushea hasta la 10, el cursor
salta a 10 y **las 5-7 nunca se aplican**. `flush()` disparado por `enqueueCommand` no hace pull
previo.

**Fix:** que sólo `pullChanges` mueva el cursor, o hacer `pullChanges()` antes de cada `flush`.

### 5.4 `CONFIRMADO` — Bajo v2 no hay persistencia local del estado editado

En el estado de código analizado por esta auditoría, `finance-tracker-state-v1` no se escribía.
El cliente actual tampoco lo consulta en sesiones autenticadas. En IndexedDB hay filas **del servidor**, el blob
de bootstrap y los **comandos** pendientes. El estado con los cambios del usuario vive **sólo en
memoria de Pinia**, y al recargar los comandos del outbox **no se reaplican a la proyección**.

Es decir: **todo cambio no sincronizado desaparece de la vista al recargar aunque siga en la
cola**. Combinado con §2.1, esto es exactamente «la app dice que guarda y luego no está».

---

## 6. Severidad 3 — Integridad y concurrencia

### 6.1 `CONFIRMADO` — Faltan índices UNIQUE; la deduplicación se hace en JS sin atomicidad

Todos estos son `CREATE INDEX`, no `CREATE UNIQUE INDEX`, y `runInTransaction` no es atómico en
D1 (`shared.ts:111-131`):

- `integration_credentials_user_id_provider_idx` (DDL `:341`) — `integrations/stockevents.ts:42-47`
  hace get-then-create; una carrera crea dos credenciales y `getByProvider` devuelve una
  arbitraria → **la API key puede «revertirse» a la anterior**.
- `budget_entries_user_id_year_month_idx` (`:207`) — nada impide dos filas para la misma celda.
- `goals_user_id_idx` (`:223`), `user_instruments_user_id_instrument_id_idx` (`:327`),
  `wealth_snapshots_user_id_snapshot_date_idx` (`:286`),
  `stockevents_symbol_mappings_user_id_symbol_idx` (`:355`),
  `market_instruments_provider_symbol_idx` (`:300`).
- **Ninguna tabla tiene UNIQUE sobre `(user_id, legacy_id)`**, que es la clave de correlación real
  de todo el sistema de sync.

### 6.2 `SOSPECHADO` — Riesgo de fuga entre usuarios por identidades duplicadas

`user_identities` tiene un índice **normal** sobre `(provider, subject)` (DDL `:12`), y
`getIdentityByProviderSubject` devuelve `rows[0]` arbitrario (`users.ts:129-139`). Si dos filas
con el mismo `(provider, subject)` apuntasen a usuarios distintos, el mismo JWT podría resolver a
un tenant distinto en cada request. **No he encontrado el camino que crea el duplicado**, así que
queda como sospecha — pero el índice debería ser UNIQUE en cualquier caso.

### 6.3 `SOSPECHADO` — Un cambio de `sub` en el IdP produce un 401 total y engañoso

`resolvePrincipal` deduplica **sólo por `(provider, subject)`** (`principal.ts:44-71`), nunca por
email. Si Cloudflare Access emite un `sub` distinto (cambio de IdP, paso a one-time PIN), se
intenta crear un usuario nuevo — y `users.email` es `unique` (`schema/users.ts:16`) → la inserción
lanza `UNIQUE constraint` → el `catch` del middleware (`src/middleware.ts:101-105`) devuelve
**401 «Token de Cf-Access inválido o caducado»** en *todas* las peticiones, ocultando el motivo
real.

**Fix:** buscar por email normalizado antes de insertar y vincular una nueva `user_identities` al
usuario existente; y registrar el error real en el 401.

### 6.4 `CONFIRMADO` — Dos repositorios sin control de concurrencia optimista

`user-settings.ts:46-67` e `integration-credentials.ts:134-163` incrementan `version` pero **no
aceptan `expectedVersion` ni lo comprueban en el `WHERE`**. Dos dispositivos cambiando la divisa
o la API key a la vez → el último gana en silencio, sin el 409 que el resto del sistema garantiza.
La columna `version` es decorativa en estas dos tablas.

### 6.5 `CONFIRMADO` — Campos que sólo se escriben al crear y no se pueden corregir

`budget_entries.category_id`/`year`/`month` (`budget-entries.ts:21-24`), `goals.key`
(`goals.ts:21-26`), `users.email` (nunca se actualiza — si el IdP cambia el correo, `getByEmail`
deja de encontrarlo), `market_instruments.*` (sin `update`), `twr_liquidity_accounts.*` (sin
`update`; su `version` se queda siempre en 1).

### 6.6 `CONFIRMADO` — Export e import asimétricos: el rollback pierde datos

| Colección | `export.ts` | `import.ts` |
|---|---|---|
| `twrLiquidityAccounts` | sí (`:88`) | **no se importa** |
| `investment_trade_details` | **no se exporta** | no se importa |
| `market_instruments` / `market_quotes` | **no se exporta** | no se importa |
| `userInstruments` | sí (`:97`) | exige que el `instrumentId` ya exista (`:321-325`) → **se descartan todos** |

Un ciclo exportar→importar —la ruta de rollback— pierde las cuentas de liquidez TWR, **todos los
detalles de operaciones** y **toda la cartera de instrumentos**. Además `import.ts` no llama a
`bumpRevision`/`createChange`, así que tras importar los demás dispositivos no ven nada.

### 6.7 `CONFIRMADO` — Otros

- **`audit_events.metadata` nunca se escribe** (DDL `:362`): el único llamador pasa siempre
  `null` (`apply-command.ts:258-263`). Y no se auditan logins ni accesos a credenciales, que era
  el propósito declarado en `schema/sync.ts:70`.
- **`createTradeDetail` no valida la propiedad de `transactionId`** (`transactions.ts:208-230`), a
  diferencia de todos los demás `create` con FK. Con el UNIQUE global sobre `transaction_id`, un
  usuario podría impedir para siempre que el propietario legítimo tenga su detalle. Defecto
  latente: hoy no hay llamador expuesto por API.
- **`PUT /api/state` legacy sigue sin `user_id`** (`src/pages/api/state.ts:33-38`): namespace
  `"default"`, un **único blob global** para todos. Con v2 activo no se usa, pero un rollback del
  flag haría que todos los usuarios compartiesen estado.
- **`/api/changes` sin `ORDER BY` ni `LIMIT`** (`src/db/repositories/sync.ts:170-179`): el orden de
  aplicación no está garantizado y el log crece sin tope.
- **Dos `init()` concurrentes** (`app.ts:96` y `shell.ts:277`): `init` marca `initialized` antes
  del primer `await` (`sync.ts:167-171`), así que el segundo retorna con `cacheDb === null` y
  `refreshPending()` corre contra el *seed*. Se autocorrige, pero es una carrera evitable.
- **`initialize.ts` no siembra categoría de inversión** (`state/initialize.ts:17-20` y el idéntico
  en `reset.ts:120-123`): un usuario nuevo no puede registrar inversiones sin crear una a mano.
- **Moneda por fila aplanada a la global** en `buildAccountData` y `buildTransactionData`: las
  columnas existen por fila, pero cualquier edición las uniformiza.

---

## 7. Estado por entidad

`emite` = el cliente manda comando · `maneja` = el servidor lo aplica · `hidrata` = vuelve en `/api/bootstrap`

| Entidad | Emite | Maneja | Hidrata | Estado |
|---|---|---|---|---|
| `user_settings` | sólo `currency` | ✅ | ✅ | El cambio **rompe `pullChanges`** §2.5; `locale`/`theme`/`year` sin ruta |
| `accounts` | sólo `accounts` | ✅ | ✅ | `kind:'checking'` → invisible §4.1 |
| `investmentAssets` / `liabilities` | ❌ | — | ✅ | Nunca se guardan §4.8 |
| `categories` | ✅ | ✅ | ✅ | `legacyId` desalineado → duplicados + `categoryId:null` §4.7 |
| `transactions` | ✅ | ✅ | ✅ | Inversión manda `accountId` local → 500 + cola envenenada §1 |
| `investment_trade_details` | ❌ | ❌ | ✅ | Se pierden símbolo/títulos/precio/comisión/side §4.3 |
| `subscriptions` | ✅ | ✅ | ✅ | **Descartadas al hidratar** §3.1 |
| `recurring_rules` | parcial | ✅ | ✅ | `updateRule` no emite; 10 campos sin columna §3.2 |
| `pending_movements` | ✅ | ✅ | ✅ | `type` hardcodeado a `'expense'` §3.2c |
| `budget_entries` | ✅ | ✅ | ✅ | `legacyId` sin año §4.4 + off-by-one §4.5 |
| `goals` | ✅ | ✅ | ✅ | OK (`key` inmutable) |
| `contributions` | ✅ | ✅ | ✅ | OK |
| `contribution_allocations` | ❌ | ❌ | ✅ | `flowAllocations` se pierde §5 |
| `wealth_snapshots` | sólo existencia | ✅ | ✅ | `legacyId` sin año §4.6 |
| `snapshot_balances` | ❌ | ❌ | ✅ | **Los saldos de Patrimonio no se guardan** §4.2 |
| `twr_liquidity_accounts` | ❌ | ❌ | ✅ | El toggle TWR no persiste §5 |
| `user_instruments` | ❌ | ✅ (nadie emite) | ✅ | `market.ts` sin cablear §5 |
| `market_instruments` / `market_quotes` | ❌ | ❌ | ✅ | Sólo lectura |
| `stockevents_symbol_mappings` | ❌ | ❌ | parcial | `stockevents.ts` sin cablear §5 |
| `integration_credentials` | vía REST | ✅ | ❌ (por diseño) | Sin concurrencia optimista §6.4 |
| `categoryEmojis`, `state.year` | **sin tabla** | — | — | Se pierden §5 |
| `audit_events`, `sync_*`, `user_*` | infra | ✅ | N/A | `metadata` siempre `null` §6.7 |

**Sin drift DDL ↔ Drizzle.** He comparado columna por columna las 26 tablas (nombres, tipos,
NOT NULL, DEFAULT, PK, UNIQUE, índices): **coinciden exactamente**. Ningún hallazgo en esa
categoría. Todas las tablas tienen repositorio; las que no tienen llamador en runtime están en §5.

---

## 8. Orden de arreglo recomendado

**Fase 1 — parar la hemorragia (bajo riesgo, sin migración).** Desbloquea la sincronización hoy.

1. `src/stores/investment.ts:44` → `resolveEntityId('account', …)` + `return null`. §1
2. `/api/sync`: `safeParse` y estado terminal `rejected` con 200 en vez de propagar a 500; en el
   cliente, llamar al `recordFailure` que ya existe y descartar tras N intentos. §2.1, §2.3
3. **Limpiar las filas `sync_commands` con `status='processing' AND result IS NULL`** de los
   usuarios afectados — sin esto la cola sigue envenenada aunque se corrija el código. §2.2
4. Filtrar `userSettings` en el bucle de `pullChanges` y envolver cada fila en `try/catch`. §2.5
5. `server?.currentVersion` en `keepLocal`. §2.4
6. Borrar `investment_trade_details` en `transactions.remove` y en `wipeUserData`; validar
   referencias antes de `removeCategory` y `accounts.remove`. §2.6

**Fase 2 — recuperar lo que ya está en D1 pero no se lee (sin migración).**

7. `kind: 'cash'` en `buildAccountData` y no reescribir `kind` en updates. §4.1
8. Alinear el `legacyId` de categorías, `budgetEntry` y `wealthSnapshot` — decidir la convención
   canónica y añadir un script de datos para las filas ya migradas. §4.4, §4.6, §4.7
9. Corregir el desfase de mes: canónico 1-12, restar 1 en la proyección. §4.5
10. Añadir el `syncListDiff` que falta en `updateRule`. §3.2a
11. Parche de fechas de suscripción en la proyección para que dejen de descartarse. §3.1
12. Medir `/api/bootstrap` con el dataset real y quitar el N+1. §5.1, §5.2

**Fase 3 — ampliar el modelo (requiere migración `0002_*.sql`).**

13. `subscriptions`: `start_date`, `next_charge_date`. §3.1
14. `recurring_rules` y `pending_movements`: `interval`, `start_date`, `end_date`,
    `last_execution_date`, `type`, `description`, `symbol`, `side`, `units`, `unit_price`,
    `fee_minor`, `time`. §3.2
15. Meter en el contrato de comandos: `investment_trade_details` (con `update`),
    `snapshot_balances`, `contribution_allocations`, `twr_liquidity_accounts`,
    `user_instruments`, `stockevents_symbol_mappings`. §4.2, §4.3, §5
16. `investmentAssets`/`liabilities` como `kind` de `accounts`; `categoryEmojis` y `state.year`
    con destino real. §4.8, §5
17. Convertir en UNIQUE los índices de §6.1 (incluido `(user_id, legacy_id)`) y
    `(provider, subject)` de §6.2; añadir `expectedVersion` a los dos repositorios de §6.4.

**Guardarraíl transversal:** endurecer `entityCreateSchemas`/`entityUpdateSchemas` con `.strict()`
y validar el payload por entidad también en `outbox.enqueue`, para que un campo sin destino falle
de forma visible en vez de desaparecer en silencio (§2.3). Hoy todos los `syncListDiff` son
`void` sin `.catch`, así que cualquier rechazo es una promesa no gestionada sin feedback.

---

## 9. Por qué los tests no lo detectaron

- **La suite E2E de la auditoría corría con `PUBLIC_SYNC_V2=false`** (`playwright.config.ts:11`),
  así que entonces ejercitaba un camino distinto al de producción. La selección se retiró después;
  los grupos funcionales actuales usan clientes autenticados sync v2.
- **La config v2** (`playwright.sync-v2.config.ts:11,16`) sólo ejecuta `multi-user-isolation.spec.ts`
  y `offline-sync.spec.ts`, que cubren únicamente cuentas y movimientos simples.
- **El único test de la proyección** pasa `subscriptions: []` y `recurringRules: []`
  (`tests/unit/v2-state-projection.test.ts:15`), es decir, justo los arrays vacíos que ocultan los
  dos bugs del issue.

**Recomendación:** un test de ida y vuelta `store → comando → repositorio → bootstrap →
projectSyncV2State → normalizeState` con datos no vacíos para cada entidad. Cualquiera de los dos
bugs del issue habría caído con eso, y también §4.1, §4.5 y §4.7.

---

## 10. Fuentes

Todo lo anterior sale de leer el código de este worktree (rama `mal-guardado-v2-multiusuario`) y
del DDL `migrations-v2/0001_init_v2.sql`. Única fuente externa:

- [Cloudflare D1 — Foreign key constraints](https://developers.cloudflare.com/d1/sql-api/foreign-keys/):
  D1 aplica las FK por defecto en todas las consultas y migraciones («identical to
  `PRAGMA foreign_keys = on`»), no se pueden desactivar globalmente y sólo se pueden diferir con
  `PRAGMA defer_foreign_keys = on` dentro de una transacción. Es lo que hace que los borrados sin
  cascada de §2.6 fallen con `FOREIGN KEY constraint failed` en vez de pasar desapercibidos.
