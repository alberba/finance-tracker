# Diseño #340: «Mis reportes» (seguimiento de reportes)

| Dato          | Valor                                                                          |
| ------------- | ------------------------------------------------------------------------------ |
| Issue         | #340 «Seguimiento de reporte» (+ Agent Brief, único documento de requisitos)   |
| Base          | `origin/main` @ `2f30dd018bec9965c87ac2c557da5a7fe28ec799`                     |
| Rama          | `alberba/issue-340-reports`                                                    |
| Fase          | Diseño y plan para el implementador. No hay código de producción en este diff. |
| Siguiente paso | Implementar siguiendo §12 (pasos y orden), con TDD donde se indica.           |

Este documento **no sustituye** al Agent Brief: lo concreta. Si hay conflicto, manda el brief; las
decisiones que el brief deja abiertas están marcadas **[D#]** en §1 y son vinculantes para el
implementador. Código nuevo cumple `CODING_STANDARDS.md` (Effect en el servidor, Tailwind con
tokens, tests por capas, sin `style=` ni `fetch` en componentes).

---

## 1. Decisiones de diseño

Cerradas por el brief (no reabrir): `/reportes` fuera de `APP_SECTIONS`; GitHub es la fuente de
verdad; duplicada solo con campos nativos (`state`, `stateReason`, `duplicateOf`); aclaraciones con el
token del bot y marcador oculto; sin email/push; sin sondeos; sin tocar el workflow de enriquecimiento.

Decididas aquí (el brief no las fija):

- **[D1] Autoría del comentario, además del marcador.** El token del bot suele ser un PAT de una
  cuenta humana, y cualquier persona puede pegar `<!-- finance-tracker:reporter-comment user=<id> -->`
  en GitHub (el `Identificador` es público en el cuerpo de cada issue). Un comentario solo cuenta como
  «Tú» / editable si **marcador = principal autenticado Y `author.login` = login del bot**. El login
  se obtiene con `GET /user` (cacheado en memoria por token) o, si el token es de GitHub App y `/user`
  falla, de la variable opcional `GITHUB_BOT_LOGIN`. Si no se puede resolver, el hilo falla cerrado
  (error 502, no se muestran ni se permiten aclaraciones). Un comentario con marcador pero autor
  distinto se **oculta** (no se muestra como mantenedor).
- **[D2] Marcador de adjuntos.** Los adjuntos van tras una segunda marca oculta
  (`<!-- finance-tracker:reporter-attachments -->`), no «imágenes al final», para que el texto de la
  persona nunca se confunda con adjuntos. El texto del usuario se sanea: se neutralizan `<!--`
  (→ `&lt;!--`) y las menciones `@usuario` (→ `@​usuario`; el parseo lo revierte) para que no
  pueda inyectar marcadores ni notificar a terceros con el token del bot.
- **[D3] Markdown sin dependencias.** Parser propio mínimo a AST + render Vue por plantilla.
  **Cero `v-html`.** Descartado `marked`+DOMPurify: añade dependencia y una superficie XSS que el
  brief pide evitar («sin HTML crudo»).
- **[D4] Marcar visto.** `GET` nunca escribe. El cliente llama a `POST /api/reports/:n/seen` con el
  `fetchedAt` que devolvió el detalle; el servidor guarda `max(lastSeenAt, min(seenAt, ahora))`. Así una
  respuesta que llegue entre la lectura y la marca no se da por vista sin mostrarse.
- **[D5] Detalle por query.** `/reportes` (lista) y `/reportes?reporte=<n>` (detalle) comparten la
  ruta Astro; recargar conserva el detalle y no hay rutas dinámicas de página.
- **[D6] Límite de lista.** Se leen los **100 reportes más recientes** de la cuenta (alias GraphQL).
  Sin paginación en esta fase; si hay más, la respuesta lleva `hasMore: true` y la UI lo dice.
- **[D7] Fallo del registro de propiedad.** Si la issue se crea pero el `INSERT` falla, el POST
  devuelve `201` igualmente (la issue existe) con `tracked: false`; el acuse lo dice honestamente y
  `pnpm reports:backfill` lo recupera. Nunca se reintenta creando otra issue.
- **[D8] Límites de uso.** Un limitador de ventana compartido (`rate-limit.ts`, extraído de
  `report.ts`): POST de reportes 5/min (igual que hoy); escrituras de comentarios 10/min por usuario.
  Lecturas sin límite propio (una consulta GraphQL por carga; usuarios sin filas no llaman a GitHub).
- **[D9] Notificación y demo.** En demo no hay llamadas ni badge: los dos reportes ficticios tienen
  `hasUpdates: false`. El estado visual de «Nuevo» se cubre con tests de componente y E2E con mocks.
- **[D10] `wipeUserData`/reset no borran `issue_reports`** (no son datos financieros; son la
  propiedad de issues públicas). Si existe un flujo de borrado de cuenta (`usersRepository.remove`),
  debe borrar antes estas filas por la FK; hoy ninguna ruta lo invoca (verificado), solo se documenta.

---

## 2. Trazabilidad criterio → diseño → prueba

| Criterio del brief                                         | Diseño                         | Prueba principal                                        |
| ---------------------------------------------------------- | ------------------------------ | ------------------------------------------------------- |
| Acuse, cerrar panel, recargar, `/reportes` lo muestra      | §4, §6.1, §8.2                 | E2E «acuse → Mis reportes → recarga»                    |
| POST siempre crea; sin `duplicate`                         | §6.1, §10                      | unit ruta + schema; borrado de tests del checker        |
| Solo reportes de la cuenta; otro número no devuelve nada   | §5.5, §5.6                     | integración multi-usuario + unit ruta                   |
| `CLOSED+DUPLICATE+duplicateOf` sigue a la principal (3)    | §5.3 `resolveFollowed`         | unit `report-status`                                    |
| `COMPLETED`/`NOT_PLANNED` no duplicada; reapertura; falsos | §5.3                           | unit `report-status` (tabla)                            |
| Cierre asíncrono visible en la siguiente carga             | §5.4 (sin caché de estado)     | E2E con mock que cambia entre dos cargas                |
| Principal inaccesible / issue inaccesible                  | §5.3, §9.4                     | unit + E2E                                              |
| Añadir/editar/borrar aclaraciones, adjuntos, ajenos        | §5.6, §5.7                     | unit `reporter-comment`, integración servicio, E2E hilo |
| Ocultar automatización y otros reporteros; sanear Markdown | §5.6, §8.5                     | unit `classifyComment`, `report-markdown`, componente   |
| Fallo de GitHub: error, conserva texto                     | §5.9, §8.4                     | componente hilo + E2E                                   |
| Avisos en botón, «Más» y entrada; desaparecen al abrir     | §5.9, §8.6                     | componente + E2E                                        |
| `reports:backfill`                                         | §7                             | unit plan + integración sobre SQLite                    |
| Demo con 2 reportes y caja desactivada                     | §8.7                           | E2E demo + visual                                       |
| `pnpm check` + tests dirigidos                             | §11                            | CI                                                      |

---

## 3. Modelo de dominio y contratos compartidos

Todo en `src/domain/reports/` (puro, síncrono, sin Effect, sin `window`), usado por servidor, cliente
y demo.

### 3.1 `report-entry.ts` (tipos del contrato)

```ts
export type IssueState = 'OPEN' | 'CLOSED'
export type IssueStateReason = 'COMPLETED' | 'NOT_PLANNED' | 'DUPLICATE' | 'REOPENED' | null

export interface ReportIssueRef {
  number: number
  url: string
  title: string
  state: IssueState
  stateReason: IssueStateReason
}

/** Una entrada de «Mis reportes». Identidad = la issue original del reporte. */
export type ReportEntry = AvailableReportEntry | UnavailableReportEntry

interface ReportEntryBase {
  number: number // número de la ORIGINAL (clave de la API y de la UI)
  submittedAt: string // ISO, de la tabla
  lastSeenAt: string // ISO, de la tabla
  hasUpdates: boolean
}
export interface AvailableReportEntry extends ReportEntryBase, ReportIssueRef {
  unavailable?: false
  /** Presente solo cuando se sigue una principal (≥1 salto). */
  followed?: ReportIssueRef
  /** `DUPLICATE` sin principal utilizable: se conserva el estado de la original y se avisa. */
  duplicateLinkUnavailable?: boolean
  statusChangedAt: string | null // último cierre/reapertura (original o seguida)
}
export interface UnavailableReportEntry extends ReportEntryBase {
  unavailable: true // sin url, título ni estado: no se inventa nada
}

export interface ThreadItem {
  id: number // databaseId del comentario de GitHub
  kind: 'reporter' | 'maintainer'
  author: string // 'Tú' (reporter) o el login del mantenedor
  createdAt: string
  editedAt: string | null // updatedAt > createdAt
  text: string // Markdown (en reporter: sin cabecera, marcadores ni bloque de adjuntos)
  attachments: ThreadAttachment[] // solo reporter
  editable: boolean // reporter && hilo abierto && !demo
}
export interface ThreadAttachment { name: string; url: string }

export interface ReportDetail {
  report: AvailableReportEntry
  threadIssue: ReportIssueRef // la que se sigue (original o principal)
  thread: ThreadItem[] // ascendente por fecha
  hiddenBefore: number // comentarios anteriores a los 100 leídos (0 normalmente)
  canComment: boolean // threadIssue.state === 'OPEN'
  fetchedAt: string // ISO del servidor al empezar a leer (para [D4])
}
```

`url` de las issues se construye en servidor con `https://github.com/${owner}/${repo}/issues/${n}`
o se toma del campo `url` de GraphQL; **nunca** del cliente.

### 3.2 `report-status.ts`

- `resolveFollowed(root: IssueNode): { followed?: IssueNode; duplicateLinkUnavailable: boolean }`
  (ver algoritmo en §5.3).
- `describeReportStatus(entry): { headline, secondary?, state: ReportIssueRef, tone, warning? }`
  — única fuente de los textos, usada por lista, detalle y demo:

| Caso                                    | Titular («estado»)                  | Secundario                              | Aviso                                         |
| --------------------------------------- | ----------------------------------- | --------------------------------------- | --------------------------------------------- |
| OPEN (incl. `REOPENED`)                 | `Abierto`                           | —                                       | —                                             |
| CLOSED `COMPLETED`                      | `Cerrado · Completado`              | —                                       | —                                             |
| CLOSED `NOT_PLANNED`                    | `Cerrado · No planificado`          | —                                       | —                                             |
| CLOSED sin motivo (`null`)              | `Cerrado`                           | —                                       | —                                             |
| `followed`                              | `Se sigue en #N` + estado de #N     | `#orig · Cerrado como duplicado`        | —                                             |
| DUPLICATE sin principal utilizable      | `Cerrado como duplicado`            | —                                       | `El enlace a la principal no está disponible.` |
| `unavailable`                           | `Reporte #N` + fecha de envío       | —                                       | `Este reporte ya no está disponible en GitHub` |

Tonos: abierto = `warn`, completado = `gain`, el resto `neutral` (ver §9.2).

### 3.3 `reporter-comment.ts`

```ts
export const REPORTER_MARKER_PREFIX = '<!-- finance-tracker:reporter-comment user='
export const REPORTER_ATTACHMENTS_MARKER = '<!-- finance-tracker:reporter-attachments -->'
export const REPORTER_HEADER = '**Aclaración del reportero**'
export const AUTOMATION_MARKERS = ['<!-- web-report-agent-brief -->', '<!-- web-report-enriched -->'] as const

buildReporterCommentBody({ userId, text, attachments }): string
parseReporterComment(body): { userId, text, attachments } | null   // null si no empieza por el marcador
sanitizeReporterText(text): string      // [D2]; idempotente
classifyComment(c: RawComment, ctx: { userId: string; botLogin: string }):
  'automation' | 'mine' | 'maintainer' | 'hidden'
```

Cuerpo exacto publicado:

```
<!-- finance-tracker:reporter-comment user=<userId> -->
**Aclaración del reportero**

<texto saneado>

<!-- finance-tracker:reporter-attachments -->      (solo si hay adjuntos)
![nombre](https://…)
```

Reglas:

- `parseReporterComment` exige el marcador **anclado al inicio** del cuerpo (primer carácter),
  `userId` con `/^[A-Za-z0-9_-]{1,64}$/`, cabecera en la línea siguiente (tolerante: se elimina si
  existe), y separa adjuntos por la última aparición de `REPORTER_ATTACHMENTS_MARKER`. Cada línea de
  adjunto debe ser `![alt](url)` con URL `https://` de un host permitido (`github.com/user-attachments/`,
  `*.githubusercontent.com`); las demás se descartan. Máximo 3.
- `classifyComment` (orden): `automation` si `author.type === 'Bot'` o el cuerpo contiene algún
  `AUTOMATION_MARKERS`; si empieza por el marcador de reportero: `mine` solo si `userId` coincide
  **y** `author.login === botLogin` [D1], si no `hidden`; el resto, `maintainer`.
- Al editar, el servidor reconstruye el cuerpo completo con `buildReporterCommentBody` (reponiendo el
  marcador con el `userId` **del principal**, nunca el parseado).

### 3.4 `report-updates.ts`

```ts
computeHasUpdates({ lastSeenAt, statusChangedAt, latestMaintainerCommentAt }): boolean
// true si max(statusChangedAt, latestMaintainerCommentAt) > lastSeenAt (comparación por Date.parse)
```

`statusChangedAt` = máximo entre el último `ClosedEvent`/`ReopenedEvent` de la original **y** de la
seguida. `latestMaintainerCommentAt` = comentario `maintainer` más reciente de la issue que se sigue.
Comentarios propios y de automatización nunca cuentan (criterio del brief).

### 3.5 `report-markdown.ts`

`parseReportMarkdown(source: string): MarkdownBlock[]` y tipos de AST (§8.5). Puro y testeable.

### 3.6 `demo-reports.ts`

Dos `ReportDetail` fijos (§8.7), con fechas constantes (no `new Date()`; las E2E visuales los
necesitan estables).

---

## 4. Persistencia

`src/db/schema/reports.ts` (exportar desde `src/db/schema/index.ts`):

```ts
export const issueReports = sqliteTable(
  'issue_reports',
  {
    id: idColumn(),
    userId: text('user_id').notNull().references(() => users.id),
    issueNumber: integer('issue_number').notNull(),
    submittedAt: text('submitted_at').notNull(),
    lastSeenAt: text('last_seen_at').notNull(),
  },
  (table) => [
    uniqueIndex('issue_reports_user_issue_idx').on(table.userId, table.issueNumber),
    index('issue_reports_user_submitted_idx').on(table.userId, table.submittedAt),
  ],
)
```

Migración `migrations-v2/0016_issue_reports.sql` (estilo de `0007_bitvavo.sql`; sentencias separadas
por `--> statement-breakpoint` solo si hay más de una; los tests de integración aplican todos los
`.sql` ordenados):

```sql
CREATE TABLE issue_reports (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  issue_number INTEGER NOT NULL,
  submitted_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX issue_reports_user_issue_idx ON issue_reports(user_id, issue_number);
--> statement-breakpoint
CREATE INDEX issue_reports_user_submitted_idx ON issue_reports(user_id, submitted_at);
```

Antes de escribirla: `ls migrations-v2` en la rama de trabajo y usar el siguiente número libre
(hoy 0016; hay duplicados históricos de 0002/0003, no añadir otro).

Repositorio `src/db/repositories/issue-reports.ts` (patrón `audit-events.ts`: `…Sql(db, …)` +
`export const x = lift(xSql)`; exportar en `repositories/index.ts` como `issueReportsRepository`).
**Todas las funciones reciben `userId` y filtran por él.**

| Función                                  | Contrato                                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `recordSubmission(userId, n, at)`        | `INSERT … ON CONFLICT DO NOTHING`; `submittedAt = lastSeenAt = at`. Devuelve `boolean` insertada. |
| `listRecentByUser(userId, limit)`        | Ordena `submitted_at DESC, issue_number DESC`; `limit + 1` filas para calcular `hasMore`.        |
| `getByUserAndNumber(userId, n)`          | Fila o `undefined`. Es **la** comprobación de propiedad.                                        |
| `markSeen(userId, n, seenAtIso)`         | `UPDATE … SET last_seen_at = max(last_seen_at, ?)` (comparar ISO como texto es válido: mismo formato). Devuelve `boolean`. |
| `insertManyIfMissing(rows)`              | Solo backfill: `INSERT … ON CONFLICT DO NOTHING`, `chunkIds`-style por el límite de variables (`MAX_SQL_VARIABLES_PER_STATEMENT`). |
| `listIssueNumbersByUser(userId)` / `listAll()` | Backfill (existentes).                                                                       |

`submittedAt` en el alta: `nowIso()` del servidor tras crear la issue (no `created_at` de GitHub);
en el backfill: `created_at` de la issue de GitHub.

No se toca `wipe-user-data.ts` [D10].

---

## 5. Servidor

### 5.1 Módulos (nuevos salvo indicación)

| Fichero                                          | Responsabilidad                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `src/lib/server/github-api.ts`                   | **Extraído** de `github-issues.ts`: `GITHUB_API_BASE`, `githubHeaders`, `githubConfig(env)` (Effect con `token/owner/repo`), `fetchRepositoryId`, `once`. `github-issues.ts` lo importa. |
| `src/lib/server/rate-limit.ts`                   | `createRateLimiter({ windowMs, max })` → `{ consume(key) }`. `report.ts` lo usa con los valores actuales. |
| `src/lib/server/issue-reports/github.ts`         | Cliente GitHub de seguimiento (§5.2): GraphQL de estados/hilo, REST de comentarios, `resolveBotLogin`.   |
| `src/lib/server/issue-reports/service.ts`        | Casos de uso `Effect<…, ReportsError, Database \| Http>` (§5.4–5.7). Sin `Response`.                    |
| `src/lib/server/issue-reports/comment-schema.ts` | Zod de las peticiones de comentario (reutiliza la validación de adjuntos).                               |
| `src/pages/api/reports/index.ts`                 | `GET` lista.                                                                                            |
| `src/pages/api/reports/[number]/index.ts`        | `GET` detalle.                                                                                          |
| `src/pages/api/reports/[number]/seen.ts`         | `POST`.                                                                                                 |
| `src/pages/api/reports/[number]/comments/index.ts` | `POST` alta.                                                                                          |
| `src/pages/api/reports/[number]/comments/[commentId].ts` | `PATCH`, `DELETE`.                                                                              |
| `src/lib/server/issue-report-schema.ts`          | **Refactor**: exportar `attachmentsSchema`/`resolveAttachments` y `sanitizeMultilineText` para no duplicarlos. |
| `src/lib/server/cloudflare-env.ts`               | Añadir `GITHUB_BOT_LOGIN?: string` (opcional, [D1]); retirar `OPENCODE_GO_API_KEY` (§10).               |

Errores (`Data.TaggedError`): `ReportsGithubError { message, status? }` (→ 502),
`ReportNotFoundError` (→ 404), `ReportClosedError` (→ 409), `CommentForbiddenError` (→ 403),
`ReportInputError` (→ 400/413). Cada ruta los traduce con una sola función
`reportsErrorResponse(error)`; lo inesperado cae en `withApiErrorHandling` (500 + Sentry). Los fallos
de GitHub se reportan con `reportApiRouteFailure(error, { route, status: 502 })` **sin cuerpo** de la
respuesta de GitHub (`console.error` con los 500 primeros caracteres, como `github-issues.ts`).

Todas las rutas empiezan por `const principal = requirePrincipal(locals)`; **el `userId` nunca se lee
de URL, query ni cuerpo**. `[number]` y `[commentId]` se validan con `/^\d{1,9}$/` / `/^\d{1,15}$/`
(400 si no).

### 5.2 Llamadas a GitHub

Todas por el servicio `Http` (`http.request`), cabeceras `githubHeaders(token)`, tiempo máx. 8 s
(`AbortSignal.timeout`), reintentos solo en lecturas con los mismos `RETRYABLE_STATUS` y 2 reintentos
que `postWithRetry` (las escrituras **no** se reintentan: no se duplican comentarios).

**GraphQL (`POST https://api.github.com/graphql`)** — mismo patrón que `verifyDuplicateClosure`. Un
fragmento y cuatro niveles de `duplicateOf` (original + 3 saltos). Los alias salen de enteros
validados de la base de datos (`i123`), nunca de entrada del cliente:

```graphql
fragment F on Issue {
  number url title state stateReason
  repository { nameWithOwner }
  timelineItems(last: 1, itemTypes: [CLOSED_EVENT, REOPENED_EVENT]) {
    nodes { __typename ... on ClosedEvent { createdAt } ... on ReopenedEvent { createdAt } }
  }
}
fragment C on Issue {   # solo en la lista
  comments(last: 5) { nodes { databaseId createdAt body author { __typename login } } }
}
query ($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    i340: issue(number: 340) {
      ...F ...C
      duplicateOf { ...F ...C duplicateOf { ...F ...C duplicateOf { ...F ...C } } }
    }
    # … un alias por reporte
  }
}
```

- **Lista**: una sola consulta con todos los alias (≤100) → cumple «una sola consulta con alias».
- **Detalle**: consulta 1 = un alias con `F` (sin `C`) para resolver la cadena; consulta 2 = hilo de la
  issue seguida: `issue(number: N) { comments(last: 100) { totalCount nodes { databaseId createdAt updatedAt body author { __typename login } } } }`
  (`hiddenBefore = totalCount - nodes.length`).
- Alias `null` ⇒ la issue no es accesible (borrada/transferida/sin permisos) ⇒ `unavailable`. Los
  `errors[]` con `type: 'NOT_FOUND'` y `path` `[repository, iNNN]` son esperados y no fallan la
  petición. Cualquier otro error, HTTP no-2xx o sin `data` ⇒ `ReportsGithubError` (la lista muestra
  error; **no** se degrada a «no disponible», eso fingiría un estado).
- `duplicateOf.repository.nameWithOwner` distinto de `GITHUB_OWNER/GITHUB_REPO` (comparación sin
  mayúsculas) ⇒ no se sigue.

**REST** (`/repos/{owner}/{repo}/…`): `POST issues/{n}/comments`, `GET issues/comments/{id}`,
`PATCH issues/comments/{id}`, `DELETE issues/comments/{id}` (204). Adjuntos: reutilizar
`uploadIssueAttachment` y `fetchRepositoryId` tal cual. `GET /user` para `resolveBotLogin`.

### 5.3 `resolveFollowed` (dominio, puro)

```
current = root; visited = {root.number}; hops = 0; linkBroken = false
while hops < 3 and current.state == CLOSED and current.stateReason == DUPLICATE:
    next = current.duplicateOf
    if next is null or foreignRepo(next) or next.number in visited:
        linkBroken = true; break
    current = next; visited.add(next.number); hops++
followed = hops > 0 ? current : undefined
duplicateLinkUnavailable = linkBroken
```

- Alcanzados 3 saltos con la última aún duplicada: se muestra esa (con su estado propio); **no** es
  `linkBroken`.
- `linkBroken` con `hops == 0` ⇒ la entrada «vuelve a la original» (no hay `followed`), conserva su
  estado y avisa. Con `hops > 0` ⇒ `followed` es el último nodo accesible y también se avisa.
- Solo campos nativos: no se mira texto, labels ni comentarios. Un label `duplicate` o «duplicado» en
  el título no produce nada (test explícito).

### 5.4 Lista — `GET /api/reports`

1. `rows = listRecentByUser(userId, 100)`. Sin filas ⇒ `{ reports: [], hasMore:false, fetchedAt }` **sin
   llamar a GitHub**.
2. Una consulta GraphQL (lista). Para cada fila: `resolveFollowed` → entrada (`unavailable` si el alias
   es `null`).
3. `hasUpdates` con `computeHasUpdates`, usando los 5 últimos comentarios de la issue seguida
   (`classifyComment` con `botLogin`; si `resolveBotLogin` falla, en la **lista** se degrada a
   `hasUpdates` solo por cambio de estado en vez de fallar toda la lista — decisión de coste; en el
   **detalle** sí falla cerrado, [D1]).
4. Respuesta `200 { ok: true, reports, hasMore, fetchedAt }`, `Cache-Control: no-store` (vía
   `jsonResponse` de `api-auth`). **Sin caché de estado en servidor**: un cierre asíncrono del workflow
   aparece en la siguiente carga.

### 5.5 Detalle — `GET /api/reports/:number`

`getByUserAndNumber` ⇒ si no existe: **404 `{ error: 'Reporte no encontrado.' }` idéntico** haya o no
issue con ese número (no se filtra existencia) y **sin ninguna llamada a GitHub**. Si existe:
consulta 1 (cadena) ⇒ `threadIssue = followed ?? root`; si `root` es `unavailable` ⇒ `200` con
`report: { unavailable: true … }` y sin hilo (`thread: []`, `canComment: false`); consulta 2 (hilo) ⇒
clasificar y mapear (`ThreadItem`; `editable = kind==='reporter' && canComment`). Los comentarios
`automation`/`hidden` no salen del servidor (el cliente nunca los recibe).

### 5.6 Alta de comentario — `POST /api/reports/:number/comments`

Cuerpo `{ text, attachments? }` (validado: `text` 1–4000 tras `sanitizeMultilineText`; ≤3 adjuntos con las
mismas reglas de tipo/tamaño/cabecera que el reporte). Secuencia:

1. rate limit [D8] (429) → propiedad (404) → cadena (§5.5, consulta 1) → `threadIssue` (si `unavailable`,
   404) → `state === 'OPEN'` o **409** «El reporte está cerrado: el hilo es de solo lectura.».
2. Subir adjuntos (secuencial, `repositoryId` una vez con `once`). **Si uno falla ⇒ 502 y no se
   publica nada** (a diferencia del alta del reporte, que sigue; aquí «nunca finge éxito»).
3. `POST issues/{threadIssue.number}/comments` con `buildReporterCommentBody({ userId: principal.userId, … })`.
4. `201 { ok: true, comment: ThreadItem }`.

### 5.7 Edición y borrado — `PATCH|DELETE /api/reports/:number/comments/:id`

Autorización (todas deben cumplirse; si no, 404/403/409 sin efecto):

1. Propiedad del reporte (404).
2. Cadena ⇒ `allowed = { root.number, followed?.number }`.
3. `GET issues/comments/{id}` (404 si no existe). Número de issue = último segmento de `issue_url`;
   debe estar en `allowed` (403).
4. `classifyComment` = `mine` (marcador = principal **y** autor = bot [D1]) (403 — un mismo mensaje para
   ajeno y sin marcador: «No puedes modificar este comentario.»).
5. La issue del comentario está `OPEN` según la consulta 1 (409).
6. PATCH: cuerpo `{ text, keepAttachments: string[], attachments? }`. `keepAttachments` debe ser
   **subconjunto de los adjuntos del cuerpo actual** (no se aceptan URLs nuevas del cliente);
   `keep + nuevos ≤ 3`. Se reconstruye todo el cuerpo (marcador del principal). Respuesta `200 { comment }`.
   DELETE: `204`; borra el comentario de GitHub del todo.

Los adjuntos ya subidos **no** se borran de GitHub al quitarlos (la UI avisa, §9.3).

Condición de carrera conocida y aceptada: última escritura gana; no se versiona el comentario.

### 5.8 Marcar visto — `POST /api/reports/:number/seen`

Cuerpo `{ seenAt: ISO }` (zod `z.iso.datetime()`); propiedad (404); `markSeen(userId, n, min(seenAt, now))`
(el servidor recorta a «ahora» para que el cliente no pueda adelantar la marca y silenciar novedades).
`204`. Sin llamada a GitHub.

### 5.9 Resumen de códigos

| Caso                              | Código | Cuerpo                                 |
| --------------------------------- | ------ | -------------------------------------- |
| Sin sesión                        | 401    | `withApiErrorHandling`                 |
| Número ajeno / inexistente        | 404    | `Reporte no encontrado.`               |
| Payload inválido                  | 400    | `Payload inválido.` + `details` (zod)  |
| Adjunto demasiado grande          | 413    | mensaje del esquema                    |
| Hilo cerrado                      | 409    | texto fijo                             |
| Comentario no editable            | 403    | texto fijo                             |
| Límite de uso                     | 429    | como el POST actual                    |
| GitHub falla (lectura o escritura)| 502    | `No se pudo consultar/publicar en GitHub. Inténtalo de nuevo.` |

### 5.10 Seguridad (checklist)

- Autorización **siempre** por fila propia en `issue_reports` + marcador + autor [D1]; nunca por el
  número recibido.
- No se expone nada de otras cuentas: los comentarios `hidden`/ajenos no salen del servidor; el título
  y el estado de una principal sí (issue pública, y es lo que el brief pide mostrar).
- El cliente nunca envía `userId`, URL de issue ni de comentario.
- Middleware ya impone same-origin y `Content-Type: application/json` en `POST/PATCH`; `DELETE` sin
  cuerpo. `/api/*` no es navegación demo.
- Texto del usuario saneado [D2]; Markdown renderizado sin `v-html` [D3]; imágenes solo de hosts de
  GitHub (§8.5); enlaces `rel="noopener noreferrer"`.
- Sentry: solo estado HTTP y motivo fijo, sin cuerpos de GitHub ni texto de la persona.

---

## 6. Cambios en el alta del reporte

### 6.1 `POST /api/issues/report`

- `createIssueFromWebReport` pierde `checkDuplicate`, `findDuplicate`, `IssueDuplicateChecker` y el
  campo `duplicate` de `CreatedIssue`/`GithubIssueClient`. Siempre crea.
- Tras crear: `recordSubmission(principal.userId, created.number, nowIso())` con `runServer(getDb(locals), …)`.
  Si falla: `console.error`, `reportReportSideFailure({ stage: 'track', reason: 'db' })` (añadir `'track'`,
  quitar `'duplicate'` en `error-tracking.ts`) y `tracked = false` [D7].
- Respuesta: siempre `201 { ok: true, issueNumber, issueUrl, tracked }`.
- `src/services/issue-report-api.ts`: quitar `duplicate`; añadir `tracked: boolean` a `ReportResponseOk`.

### 6.2 Panel de reporte (`IssueReportPanel.vue`)

- `SuccessStatus` pierde `duplicate`; gana `tracked`.
- Texto del acuse: `Reporte creado: #N` (enlace a GitHub, igual que hoy) **más** un enlace
  «Ver en Mis reportes» (`href="/reportes?reporte=N"`, interceptado con `useSectionNavigation().navigateToReports(N)`
  y cierre del panel). Si `tracked === false`: «No pudimos añadirlo a Mis reportes todavía; aparecerá
  en cuanto se recupere.» en lugar del enlace.
- Enlace permanente «Mis reportes» en la cabecera del panel (bajo el párrafo introductorio) → `/reportes`.
- Selectores estables: mantener `#issue-report-status`; nuevos `data-report-tracking-link`.

---

## 7. `pnpm reports:backfill`

Patrón de `db:repair` (`scripts/repair-corrupted-data.ts` + `scripts/lib/repair-plan.ts`):

- `package.json`: `"reports:backfill": "tsx scripts/reports-backfill.ts"`.
- `scripts/reports-backfill.ts`: parseo con `node:util.parseArgs`; `--v2-sqlite=<ruta>` (por defecto
  `.data/finance-tracker-v2.sqlite`, como `db:repair`), `--execute`, `--dry-run`, `--json`,
  `--remote-sql-out=<ruta>` (emite `INSERT … ON CONFLICT DO NOTHING` para D1, igual que `db:repair`),
  `--help`. Modo simulación por defecto. Con `--json`, todo lo humano va a stderr.
- `scripts/lib/reports-backfill-plan.ts` (puro, testeable):
  - `parseReporterId(body): { ok: true, userId } | { ok: false, reason }`. Razón `sin-bloque` si no hay
    línea `### Reportero`; `bloque-modificado` si el bloque (hasta el siguiente `### ` o fin) no tiene
    **exactamente** las tres viñetas `- Nombre:` / `- Email:` / `- Identificador:` o hay dos
    `Identificador`, o este no cumple `/^[A-Za-z0-9_-]{1,64}$/`.
  - `buildBackfillPlan({ issues, existing, knownUserIds, now })` → `{ toInsert, alreadyPresent, skipped }`.
    `skipped[]` = `{ number, reason: 'sin-bloque' | 'bloque-modificado' | 'usuario-desconocido' }`.
    `toInsert` = `{ userId, issueNumber, submittedAt: issue.created_at, lastSeenAt: now }`.
  - `formatBackfillPlan(plan)` (informe en español: totales, y la lista de saltadas con motivo).
- Lectura de GitHub: `GET /repos/{o}/{r}/issues?labels=source:web-report&state=all&per_page=100&page=N`
  hasta página vacía. **No** `search/issues`. Se descartan elementos con clave `pull_request`.
  Credenciales: `GITHUB_ISSUE_TOKEN`/`GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO` del entorno; error
  claro si faltan. Pausa/`retry` ante 403 de rate limit (honrar `retry-after`/`x-ratelimit-reset`,
  máximo 3 reintentos).
- `usuario-desconocido`: el `userId` no existe en `users` (consulta única `listIds`).
- Idempotente: lo ya presente cuenta como `alreadyPresent` y no se toca (ni se mueve `lastSeenAt`).
  `--execute` ejecuta el mismo plan en una transacción (`runInTransaction`) con `insertManyIfMissing`.
- Sin `--execute` jamás escribe (test).

Documentación: nueva sección en `docs/operations/self-hosting.md` («Recuperar reportes anteriores
tras desplegar la migración»): ejecutar **una vez** tras el despliegue que aplica `0016`, sobre una
copia o el `finance.sqlite` del volumen con la copia diaria ya hecha; primero simulación, revisar
«saltadas», luego `--execute`. Se puede repetir. Mencionar `--remote-sql-out` para D1.

---

## 8. Cliente

### 8.1 Piezas y responsabilidades (respetando `component-boundaries.test.ts`: ningún `fetch` ni
`localStorage` en `.vue`)

| Fichero                                            | Responsabilidad                                                                          |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `src/services/reports-api.ts`                      | `Effect` + `requestApiJson` (patrón `issue-report-api.ts`): `fetchReports`, `fetchReportDetail`, `markReportSeen`, `postReportComment`, `patchReportComment`, `deleteReportComment`. En demo devuelve `demo-reports` sin red; las escrituras en demo devuelven `{ ok:false, error:'En la demo no se envían comentarios.' }`. |
| `src/stores/reports.ts`                            | Pinia: `reports`, `status: 'idle'\|'loading'\|'ready'\|'error'`, `error`, `hasMore`, `unseenCount` (computed), `refresh({ force })` (deduplica una petición en curso), `markSeenLocally(n)`. Acciones llaman `runClientHttp`. |
| `src/composables/useReportThread.ts`               | Ciclo de vida del detalle (carga, `markSeen`, alta/edición/borrado, borradores, estados `pending`/`error`). Conserva el texto ante error. |
| `src/composables/useReportsRoute.ts`               | Adaptador de `window`: lee/escribe `?reporte=<n>`, `popstate`. Es el único que toca `location`/`history` en esta zona. |
| `src/composables/useSectionNavigation.ts`          | Añadir `navigateToReports(n?)` (push de `/reportes[?reporte=n]` + `popstate`).            |
| `src/components/reports/ReportsPage.vue`           | Página (§9).                                                                             |
| `src/components/reports/ReportList.vue`, `ReportListItem.vue`, `ReportStatus.vue`, `ReportDetail.vue`, `ReportThread.vue`, `ReportComposer.vue`, `ReportMarkdown.vue` | Subcomponentes presentacionales (props/emits). |
| `src/scripts/app/reports-badge.ts`                 | Sincroniza `[data-reports-badge]` (Astro, hoja «Más») con `unseenCount` del store.       |

### 8.2 Ruta, shell y navegación

- Nueva página `src/pages/reportes.astro` que renderiza `<FinanceTrackerShell page="reports" />`
  (no se añade a `ROUTE_SECTION_MAP`/`SECTION_ROUTE_MAP`: «fuera de `APP_SECTIONS`»). `[section].astro`
  no se toca. El middleware ya exige sesión salvo demo (`/demo`, `?demo=1`, cookie).
- `dashboard-section-routing.ts`: exportar `REPORTS_ROUTE = '/reportes'` e `isReportsPath(pathname)`
  (normalizando barra final).
- `FinanceTrackerShell.astro`: prop `page?: 'reports'`. Con `reports`, `activeSection = null` → ninguna
  entrada del menú queda con `aria-current` (`AppSidebar`/`MobileNavigation`/`SidebarNav` aceptan
  `SectionId | null`). `<title>` sin cambios; `canonical` sin cambios.
- `FinanceWorkspace.vue`: prop `page`; si `uiStore.page === 'reports'` monta `ReportsPage` (import
  asíncrono como el resto de secciones y entra en el prefetch en idle) **en lugar de** la sección;
  `GlobalReportLauncher` sigue montado.
- `stores/ui.ts`: `page: ref<'section' | 'reports'>('section')` + `setPage`. `setActiveSection` no lo
  cambia (decide quien navega).
- `shell-navigation.ts`: el listener `popstate` llama primero a `isReportsPath`; si es reportes →
  `uiStore.setPage('reports')`, quita `aria-current` de `[data-nav-item]` y marca «Más» inactivo; si no →
  `setPage('section')` + `switchSection`. `switchSection` (clicks del menú) ya hace `pushState` a la
  sección y llama `setPage('section')` (añadir). `app.ts` (`init`): si `isReportsPath(location.pathname)`
  no llama a `switchSection`; sí publica `data-finance-ready` como siempre.
- Accesos (brief): (a) acuse del panel (§6.2); (b) panel lateral: enlace «Mis reportes»; (c) hoja «Más» en
  `MobileNavigation.astro`: nueva fila `<button data-reports-open>` («Mis reportes» / «Estado y aclaraciones
  de tus reportes»), mismo estilo que «Crear reporte», con `<span data-reports-badge hidden>`; el handler
  (en `shell.ts`, junto a `initReportDialogActions`) hace `navigateToReports()` y la delegación existente
  `closest('[data-section], [data-report-dialog-open]')` se amplía con `[data-reports-open]` para cerrar
  la hoja. (d) Botón flotante: sin enlace propio, solo el punto de novedades (§8.6).
- Selectores/ids: sección `id="reports"` (`AppSection`), título `reports-title`.

### 8.3 Estados de la página

`status` del store gobierna: `loading` (esqueleto, `aria-busy="true"`), `ready` con 0 filas (vacío),
`ready` con filas, `error` (mensaje + «Reintentar», sin lista antigua falsa). Detalle: `loading`,
`ready`, `error`, `notFound` (404: «No encontramos este reporte en tu cuenta.» + volver), `unavailable`
(§9.4). En ningún caso se inventan estados ni enlaces.

### 8.4 Errores y borradores

`useReportThread` guarda `draft` (texto + adjuntos) por estado de composición; el borrado optimista **no**
existe (se espera a GitHub). En fallo: `role="alert"` con el mensaje del servidor o
«No se pudo publicar en GitHub. Tu texto sigue aquí; inténtalo de nuevo.», el textarea conserva texto y
adjuntos y el botón se rehabilita. Éxito: se inserta el `ThreadItem` devuelto y se limpia el borrador.

### 8.5 Markdown seguro (`report-markdown.ts` + `ReportMarkdown.vue`)

AST de bloques: párrafo, encabezado (1–6, se renderiza como `<p>` en negrita/`h4`, sin saltarse la
jerarquía de la página), lista (ordenada/no ordenada, un nivel + anidado simple), cita, bloque de código
vallado, regla. Inline: texto, `código`, **negrita**, _cursiva_, ~~tachado~~, enlace, imagen.

- Todo HTML crudo (`<script>`, `<img>`, `<!-- -->`…) se trata como **texto literal** (Vue lo escapa).
- Enlaces: solo `https:` y `http:` (y `mailto:` no); `#123` y `@user` quedan como texto. Render:
  `<a target="_blank" rel="noopener noreferrer">`. «Abrirse fuera de la app».
- Imágenes: solo hosts de GitHub (`github.com/user-attachments/`, `*.githubusercontent.com`);
  `<img loading="lazy" referrerpolicy="no-referrer" alt>` dentro de un enlace; cualquier otra URL de
  imagen se degrada a enlace de texto.
- Límite: 20 000 caracteres por comentario y profundidad ≤ 4 (el resto, texto plano) contra entradas
  patológicas.
- Sin `v-html`; el test de límites (§11) falla si aparece en `src/components/reports/`.

### 8.6 Novedades

- El store arranca desde `GlobalReportLauncher.vue` (montado una vez): `onMounted` → si no demo,
  `reportsStore.refresh()`. `ReportsPage` llama `refresh({ force: true })` al entrar. Sin `setInterval`,
  sin `visibilitychange`. Los fallos del chequeo inicial son silenciosos (sin punto).
- `unseenCount = reports.filter(r => r.hasUpdates).length`.
- Botón flotante (`#global-report-trigger`): punto `bg-accent` (`size-2.5`, anillo `ring-2 ring-elevated`)
  esquina superior derecha, `data-reports-updates`, con descripción accesible oculta
  («Hay novedades en tus reportes», vinculada con `aria-describedby`). No cambia el `aria-label`
  «Crear reporte» (las E2E lo usan).
- Hoja «Más»: `[data-reports-badge]` muestra el contador (`unseenCount`, o `9+`) en la fila «Mis reportes»
  y un punto sobre `[data-mobile-more-trigger]`; sincronizado por `reports-badge.ts` con `watch` de Pinia
  (el markup es Astro estático).
- Cada entrada con `hasUpdates` lleva `PillTag tone="accent"` «Nuevo».
- Al abrir el detalle (`ready`): `markReportSeen(n, detail.fetchedAt)` y `markSeenLocally(n)` (apaga «Nuevo»,
  baja el contador y los puntos). Si el POST falla, se mantiene el estado local hasta la próxima carga y
  no se muestra error (no bloquea).

### 8.7 Demo

`isDemoMode()` ⇒ `reports-api` devuelve `DEMO_REPORTS`; nada llama a `/api/reports`. Contenidos fijos
(`src/domain/reports/demo-reports.ts`), fechas constantes (octubre de 2026), todos con
`hasUpdates: false`:

1. **#901 «El gráfico de gastos no respeta el filtro de mes»** — `OPEN`. Hilo: respuesta del mantenedor
   («Gracias por el detalle. Lo reproducimos con el filtro de octubre; lo revisamos esta semana.») y una
   aclaración «Tú» («Ocurre solo en móvil, con el mes anterior seleccionado.»).
2. **#902 «Añadir exportación a PDF de los movimientos»** — `CLOSED`/`DUPLICATE`, `followed`: **#887**
   «Exportar movimientos a PDF y CSV» (`OPEN`, ficticia). Hilo = el de #887 (una respuesta del mantenedor).
   Secundario: «#902 · Cerrado como duplicado».

URLs ficticias (`https://github.com/example/finance-tracker/issues/N`) con aviso en el detalle de que
es una demostración; los enlaces externos existen pero **no** se llama a GitHub. La caja de comentarios:
textarea y botón `disabled`, con `role="note"`: «En la demo no se envían comentarios». Mismas
fixtures para la E2E visual.

---

## 9. Diseño de interfaz (skill `frontend-design`, restringida por `docs/architecture/design-language.md`)

### 9.1 Dirección

**Libro de correspondencia, tono de informe financiero.** El lenguaje v2 manda (tokens, Syne/DM Sans/
DM Mono, filetes, sin mosaicos de tarjetas, sin barras de progreso ni marcadores llamativos). Lo
memorable no es la decoración sino la estructura: un reporte es un **expediente numerado** (`#340` en
mono, como el número de un asiento contable) y su hilo es una **correspondencia** (cartas con
remitente, fecha y filete lateral), no un chat de burbujas. La composición sale del contenido, no del
Dashboard: es una pantalla de trabajo de lista + hilo, sin cifras titulares ni `InkBand`.

Un único gesto distintivo: la **línea de seguimiento** — cuando una entrada sigue a una principal, la
fila muestra el `#original` tachado con un filete y una flecha mono hacia `#N`
(`#902 ──▶ #887`), leído como «este asiento pasó al otro libro».

### 9.2 Piezas existentes a reutilizar (no redibujar)

`AppSection`, `PageHeader` (+ slot `aside` con `BaseButton` «Crear reporte»), `DocumentSurface` y
`NumberedBlock` (detalle: «01 Estado», «02 Hilo», «03 Nueva aclaración»), `KickerLabel`, `PillTag`
(«Nuevo» `accent`; «Cerrado como duplicado» `neutral`), `StatusDot` (abierto `warn`, completado `gain`),
`BaseButton`, `BaseInput`/`FIELD_CONTROL`/`FIELD_LABEL`, `ConfirmDialog` (borrar), `IconButton`.
Texto de estado siempre con palabras; el punto solo refuerza. Nada de `text-faint` para texto leíble.
Estilo solo con utilidades de `@theme`; ningún `style=`; `<style scoped>` solo para `animate`.
Componente nuevo base solo si un patrón se repite en ≥2 ficheros (`ReportStatus` se usa en lista y
detalle, vive en `components/reports/`).

### 9.3 Composición

Escritorio (`desk:`; contenedor `mx-auto max-w-6xl`): dos columnas
`desk:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] gap-x-10`.

```
Tu cuenta                                              [ Crear reporte ]
Mis reportes
Sigue el estado de lo que has enviado y aclara lo que haga falta.
──────────────────────────────────────────────────────────────────────────
 #340  Seguimiento de reporte            NUEVO │  01  ESTADO
 ● Abierto · 24 oct 2026                       │  #902 ──▶ #887   Se sigue en #887
 ─────────────────────────────────────────     │  ● Abierto  · #902 Cerrado como duplicado
 #902 ─▶ #887  Añadir exportación a PDF        │  ──────────────────────────────────────
 Se sigue en #887 · ● Abierto                  │  02  HILO
 #902 · Cerrado como duplicado                 │  │ Mantenedor · 25 oct, 10:12
 ─────────────────────────────────────────     │  │ Gracias por el detalle…
 #118  Reporte no disponible                   │  │
 ⚠ Este reporte ya no está disponible en GitHub│  ┃ Tú · 25 oct, 11:40       Editar  Borrar
                                               │  ┃ Ocurre solo en móvil…
                                               │  ──────────────────────────────────────
                                               │  03  NUEVA ACLARACIÓN
                                               │  [ textarea ]  Capturas (opcional)
                                               │  Se publica en un repositorio público.
                                               │                        [ Publicar aclaración ]
```

- Fila de lista = `<button>` de ancho completo (`role` nativo), filetes `border-line` entre filas, sin
  cajas. Contenido: `#N` (`font-mono`), título (`font-display`, máx. 2 líneas, `line-clamp-2`), línea de
  estado (`ReportStatus`) y fecha (`formatShortDate`). Seleccionada: `aria-current="true"` + filete
  izquierdo `border-primary` de 2 px. «Nuevo» alineado a la derecha del número.
- Móvil: la lista ocupa todo el ancho; abrir un reporte reemplaza la vista con un botón «← Mis reportes»
  (`useReportsRoute` empuja `?reporte=n`; el atrás del navegador vuelve). Gutter 16 px; filas ≥ 56 px de
  alto táctil; barra inferior del shell ya reserva `pb-[calc(104px+…)]`.
- Hilo: cada carta = `<article>` con cabecera mono (`Tú`/login, fecha larga con hora vía
  `formatStamp`), filete lateral `border-l-2` (`border-primary` para «Tú», `border-line-strong` para
  mantenedor), cuerpo `ReportMarkdown`. «editado» en `text-text-muted` si `editedAt`. Acciones «Editar»
  y «Borrar» (`BaseButton variant="ghost"`) solo en `editable`.
- Edición **en el sitio**: la carta pasa a textarea + lista de adjuntos existentes con «Quitar nombre» y
  selector de nuevos; botones «Guardar» / «Cancelar». Al pulsar «Quitar» aparece bajo la lista (y se
  anuncia con `role="status"`) **«Quitar un adjunto no lo borra de GitHub»**.
- Borrar: `ConfirmDialog` «¿Borrar esta aclaración? Se eliminará de GitHub y no se puede deshacer.»
- Compositor (`ReportComposer`): mismas reglas de adjuntos que el panel (reutiliza
  `getAttachmentError`, `encodeBase64` y los límites; la vista previa con `URL.createObjectURL` se
  libera como en `IssueReportPanel`). Contador `n/4000`. Aviso público permanente.
- Comentarios deshabilitados: **cerrado** → bloque `role="note"` «Este reporte está cerrado: el hilo es de
  solo lectura.» en lugar del compositor (y sin «Editar»/«Borrar»); **demo** → compositor `disabled` +
  «En la demo no se envían comentarios».

### 9.4 Estados especiales

- `unavailable`: fila y detalle con `#N`, «enviado el <fecha>» y **«Este reporte ya no está disponible en
  GitHub»** (icono de aviso + texto, `bg-notice text-notice-text`), sin enlace ni hilo ni compositor.
- `duplicateLinkUnavailable`: estado de la original + «El enlace a la principal no está disponible.»
  (`bg-notice`).
- Lista vacía: «Aún no has enviado ningún reporte.» + `BaseButton` «Crear reporte» (abre el panel).
- Error de lista/detalle: bloque `role="alert"` + «Reintentar».
- `hasMore`: nota «Mostrando tus 100 reportes más recientes.».

### 9.5 Movimiento y accesibilidad

- Entrada de la página con el `animate-panel-in` ya existente en `AppSection`; en lista, aparición
  escalonada sutil (`animation-delay` por índice, ≤ 6 filas, 40 ms) respetando `prefers-reduced-motion`
  (`motion-safe:`). Sin otras animaciones.
- Contraste AA en claro y oscuro (solo tokens de texto ya validados); foco visible con
  `focus-visible:outline-primary`; todas las acciones por teclado; el cambio de vista
  lista↔detalle mueve el foco al `h3` del detalle y de vuelta a la fila de origen.
- `aria-live="polite"` para «Publicando…», éxito y «Quitar un adjunto…».
- El punto de novedades nunca es el único aviso: contador/etiqueta «Nuevo» con texto.
- Localizadores E2E por rol/etiqueta/`data-*`: `data-report-entry="<n>"`, `data-report-new`,
  `data-reports-updates`, `data-reports-badge`, `data-thread-item="<id>"`.

---

## 10. Eliminaciones y documentación

Eliminar (no dejar código muerto):

- `src/lib/server/issue-duplicate-checker.ts` y `tests/unit/issue-duplicate-checker.test.ts`.
- En `github-issues.ts`: `checkDuplicate`, `findDuplicate`, imports de `IssueDuplicate*`, `duplicate` de
  `CreatedIssue` y `GithubIssueClient`.
- `src/lib/server/issue-duplicates.ts` **se mantiene**; pasa a **definir** `IssueDuplicateInput`
  (hoy vive en el checker eliminado) y el enricher sigue importándolo igual.
- `RuntimeEnv.OPENCODE_GO_API_KEY` (el servidor ya no la usa; el secret de Actions es independiente),
  `.dev.vars.example` (línea 22), `README.md` (línea 253 y el párrafo que la distingue de la de Actions),
  `docs/operations/self-hosting.md` (mención en `.env`).
- `error-tracking.ts`: stage `'duplicate'` y su test (`tests/unit/report-side-failure-tracking.test.ts`).
- Tests de duplicada en `github-issues.test.ts`, `issue-report-api.test.ts`, `issue-report-route.test.ts`
  y `tests/e2e/reports.spec.ts`.

Documentación a actualizar en el mismo PR:

- `docs/context/tabs/reportes.md`: reescribir con la ruta real (`/reportes`, `#reports`,
  `?reporte=n`), identificadores, ficheros nuevos, flujo («Mis reportes»), contrato de la API, estados,
  hilo, marcadores, notificaciones, demo y checklist; quitar «comprobación previa» y la ruta/`#reports`
  que no existían; actualizar la sección de «Riesgos» (ya hay estado servidor) y el párrafo de #340 que
  hoy está como «debe» (pasa a hecho).
- `docs/architecture/frontend.md`: nota bajo la tabla de secciones («Reportes no es una sección: lo abre
  el lanzador… y `/reportes` es una página aparte»).
- `README.md` (sección «Reportes web»): nueva variable opcional `GITHUB_BOT_LOGIN`; quitar la de
  duplicadas del runtime.
- `docs/operations/self-hosting.md`: backfill (§7) y variable.
- `docs/playwright.md` si se añaden escenarios visuales (lista de snapshots).

---

## 11. Plan de pruebas

Regla: capa más baja posible, un fallo por razón.

**Unit (`tests/unit/`)** — nuevas:

- `report-status.test.ts`: tabla `(state, stateReason, duplicateOf)` → salida de `resolveFollowed` y
  `describeReportStatus`: `OPEN`, `REOPENED`, `COMPLETED`, `NOT_PLANNED`, `null`, `DUPLICATE` con y sin
  principal, cadena de 1/2/3 saltos y de 4 (se corta en 3), ciclo (A→B→A), repo ajeno, principal
  cerrada `COMPLETED` (se muestra su estado), título/labels «duplicate» sin efecto, hop intermedio roto.
- `reporter-comment.test.ts`: build/parse ida y vuelta (con y sin adjuntos), marcador no anclado ⇒ `null`,
  `userId` inválido, `<!--` y `@mención` neutralizados (y revertidos al parsear), host de adjunto no
  permitido descartado, `classifyComment` (automatización por marcador y por `Bot`; `mine` solo con
  autor = bot; marcador ajeno; marcador con autor distinto ⇒ `hidden`; mantenedor).
- `report-updates.test.ts`: umbrales, comentarios propios/automatización no cuentan, cambio de estado de
  original vs seguida.
- `report-markdown.test.ts`: `<script>`, `<img onerror>`, `javascript:`/`data:` en enlaces e imágenes,
  imagen de host no permitido, comentarios HTML, anidación, límites.
- `reports-backfill-plan.test.ts`: `parseReporterId` (válido, sin bloque, modificado, duplicado),
  `buildBackfillPlan` (nuevas, ya presentes, desconocidas), idempotencia, `lastSeenAt = now`, simulación
  no escribe.
- `issue-report-route.test.ts` (actualizar): siempre 201, sin `duplicate`, `tracked: false` si el `INSERT`
  falla pero la issue se crea, `userId` del principal.
- `reports-routes.test.ts`: cada ruta nueva con `locals.principal` falso: 401 sin principal, 400 en
  parámetros inválidos, 404 uniforme, 502 de GitHub, 409 cerrado, 403 no editable, 429.
- `issue-attachments.test.ts`/`issue-report-schema.test.ts`: cubrir el refactor de esquemas.

**Integración (`tests/integration/d1-v2/`, SQLite real, `Http` falso)**:

- `repositories/issue-reports.test.ts`: unicidad `(user, issue)`, `recordSubmission` idempotente, filtro
  por usuario, orden, `markSeen` monótono, `insertManyIfMissing` por lotes.
- `api/reports.test.ts`: dos usuarios; B pide el número de A ⇒ 404 y **cero** llamadas a GitHub; lista de A
  no contiene filas de B; seguimiento de una principal compartida (ambos ven solo sus aclaraciones);
  edición/borrado rechazan marcador ajeno, autor distinto del bot, issue cerrada y comentario de otra
  issue; `seen` recortado a «ahora»; usuario sin filas ⇒ lista vacía sin llamar a GitHub.
- `migrations/issue-reports.test.ts`: la migración crea tabla e índices y la FK.
- `repair`-style: `reports-backfill.test.ts` extremo a extremo sobre un SQLite temporal con GitHub falso
  paginado (incluye PRs ignorados, dos ejecuciones sin duplicados, informe de saltadas).

**Componente (`tests/component/`)**: `ReportStatus`, `ReportListItem` («Nuevo», seguimiento, no
disponible), `ReportThread` (editar/borrar solo en propias, cerrado ⇒ solo lectura, demo ⇒ desactivado,
error conserva texto, aviso «Quitar un adjunto no lo borra de GitHub»), `ReportMarkdown` (render seguro),
`ReportsPage` (carga/vacío/error), `GlobalReportLauncher` (punto), y ampliar `component-boundaries`
para prohibir `v-html` en `src/components/reports/`.

**E2E (`tests/e2e/reports.spec.ts`, sesión aislada, `page.route` para `/api/reports**` con un mock con
estado)**: (1) acuse → «Ver en Mis reportes» → recarga ⇒ sigue la entrada (número, enlace, estado);
(2) estado duplicado: dos cargas con la misma entrada pasando de abierta a duplicada ⇒ «Se sigue en #N»;
(3) hilo: añadir con captura, editar, quitar adjunto (aviso), borrar con confirmación; (4) cerrado ⇒ solo
lectura; (5) error de GitHub ⇒ alerta y texto conservado; (6) novedades: punto en el flotante, «Nuevo»
en la entrada y desaparición tras abrir el detalle; (7) móvil: hoja «Más» → «Mis reportes» (con contador);
(8) demo (`?demo=1`, `/demo` redirige): dos reportes, caja desactivada, ninguna petición a `/api/reports`
(`page.on('request')`); (9) `GET /api/reports` real autenticado con usuario sin filas ⇒ lista vacía
(no mock) para cubrir el cableado Worker. `FinanceTrackerPage`: añadir `reportsPage`/`openReports()`.
Esperar `html[data-finance-ready="true"]`, nunca `waitForTimeout`.

**Visual (`@visual`)**: un escenario `reports-demo` (escritorio y móvil, claro y oscuro) en
`layout-visual.spec.ts` con los datos de demo; snapshots Linux con `pnpm test:e2e:visual:linux` tras
revisar el diff a ojo (regla de `AGENTS.md`: texto desplazado = diff real).

**Gate**: `pnpm check`, `pnpm lint` (ficheros tocados), `pnpm test` completo una vez al final, `pnpm exec
prettier --write` solo sobre los ficheros tocados.

---

## 12. Plan de implementación (orden y commits sugeridos)

TDD en 1–4 (`tdd` skill). Cada paso deja `pnpm check` y los tests del paso en verde.

1. **Dominio puro** (`src/domain/reports/*`): tipos, `resolveFollowed`/`describeReportStatus`,
   `reporter-comment`, `report-updates`, `report-markdown`, `demo-reports` + sus unit tests.
2. **Persistencia**: `schema/reports.ts`, migración `0016`, repositorio, barril, tests de integración.
3. **Servidor**: extracción `github-api.ts` y `rate-limit.ts` (refactor sin cambio de comportamiento,
   tests existentes en verde) → `issue-reports/github.ts` → `service.ts` → rutas `/api/reports/**` →
   tests de ruta e integración.
4. **Alta**: retirar el checker y `duplicate`, registrar propiedad, `tracked`, limpieza de env/docs/tests
   (§10). Comprobar que `.github/scripts/enrich-web-issue.mjs` sigue importando
   `findIssueCandidates` (test `enrich-web-issue.test.ts` en verde).
5. **Backfill**: plan puro + CLI + `package.json` + prueba de integración + docs de operaciones.
6. **Cliente base**: `reports-api.ts`, `stores/reports.ts`, `useReportsRoute`, `useReportThread`,
   ruta Astro, shell/UI store/popstate, `useSectionNavigation.navigateToReports`.
7. **UI** (leer antes `src/components/ui/*` y `IssueReportPanel.vue`; abrir la página en el navegador con
   `pnpm dev:worktree` y mirar claro/oscuro, móvil/escritorio): `ReportsPage` y subcomponentes, panel
   (enlaces y acuse), hoja «Más», punto del flotante, `reports-badge.ts`.
8. **E2E, visual y documentación** (§10–11); regenerar snapshots Linux; suite completa una vez.

Definición de hecho: todos los criterios del brief con su prueba de §2, `pnpm check` + `pnpm lint` +
`pnpm test` + E2E de reportes en verde, documentación al día y ningún `duplicate`/`OPENCODE_GO_API_KEY`
de servidor en el árbol (`rg`).

---

## 13. Riesgos y notas para el implementador

- **GraphQL de la lista**: 100 alias × 4 niveles × (1 evento + 5 comentarios) ≈ 2 800 nodos, lejos del
  límite de 500 000 de GitHub; el coste en cuerpos de comentarios (los briefs del agente pesan varios KB)
  puede ser alto. Si en pruebas reales el payload molesta, bajar `comments(last: 5)` a `3` en el
  fragmento `C`; no sustituirlo por consultas por issue (rompe «una sola consulta»).
- `duplicateOf` devuelve `null` también cuando la principal es inaccesible: es el caso «principal
  inaccesible» del brief. No distinguir más.
- Un `GITHUB_TOKEN` de GitHub App no puede llamar a `/user`: configurar `GITHUB_BOT_LOGIN` en ese caso
  [D1]; documentado en README.
- Las aclaraciones publicadas con el token del bot aparecen en GitHub con el avatar de esa cuenta, y
  GitHub notifica a los suscriptores de la issue: es inherente al diseño del brief.
- `lastSeenAt` en el alta = `submittedAt`: el análisis automático (brief del agente) es comentario de
  automatización y no cuenta; su cierre como duplicada **sí** cuenta (cambio de estado posterior).
- Sin caché de servidor y sin sondeos: coste de GitHub = 1 consulta por arranque de app para usuarios
  con reportes. Si crece, añadir un TTL de 30 s por usuario en servidor es una mejora compatible.
- Conflicto de nombres: no confundir la «aclaración» (comentario del reportero) con el cuerpo de la
  issue, que **nunca** se edita desde la app.
- Fuera de alcance (reafirmado): email/push, editar el cuerpo o el análisis, abrir/cerrar/cambiar el
  motivo desde la app, tocar el workflow de enriquecimiento (`enrich-web-issue.*`).
