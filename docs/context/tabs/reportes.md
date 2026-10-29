# Contexto de «Mis reportes»

## Resumen

«Mis reportes» convierte el acuse momentáneo del alta en una página de seguimiento (`/reportes`).
Cada cuenta ve sus reportes con el estado nativo de GitHub, el hilo de aclaraciones y avisos de
novedades. GitHub es la fuente de verdad; la app solo guarda propiedad y última lectura.

Rutas:

- `/reportes` — lista de la cuenta.
- `/reportes?reporte=<n>` — detalle e hilo de un reporte.
- El alta sigue viviendo en el panel lateral (`#global-report-dialog`) y en la hoja «Más» móvil.

Identificadores clave en UI:

- sección raíz: `#reports`
- título: `reports-title`
- filas de lista: `[data-report-entry="<n>"]`
- detalle: `[data-report-detail]`, `[data-thread-item="<id>"]`
- «Nuevo»: `PillTag` dentro de la fila
- avisos: `[data-reports-updates]` (botón flotante), `[data-reports-badge]` y
  `[data-reports-badge-dot]` (hoja «Más»)
- acuse del panel: `#issue-report-status`, `[data-report-tracking-link]`

## Flujo funcional

1. La persona envía un reporte desde el panel. `POST /api/issues/report` crea siempre la issue
   (ya no hay comprobación previa de duplicadas) y registra la propiedad en `issue_reports`.
2. El acuse muestra `Reporte creado: #N` y un enlace «Ver en Mis reportes». Si el registro falló,
   muestra que aparecerá en cuanto se recupere y el POST responde `tracked: false`.
3. `/reportes` pide `GET /api/reports`: consultas GraphQL con alias por número (≤50 por petición) y
   páginas de 20 entradas con «Cargar más reportes». Los cierres asíncronos del workflow aparecen en la
   siguiente carga, sin sondeos ni caché de estado.
4. Al abrir un detalle se pide `GET /api/reports/:n`, que resuelve la cadena de duplicadas y lee el
   hilo de la issue seguida, y devuelve `original` (lo que escribió la persona al crear el reporte) e
   `issueDescription` (el cuerpo actual de la issue propia si difiere; `null` al seguir una principal). El cliente marca la lectura con `POST /api/reports/:n/seen`.
5. Las aclaraciones propias se publican, editan y borran con `POST`/`PATCH`/`DELETE` sobre
   `/api/reports/:n/comments`. Solo se permiten con el hilo abierto.

## Estados

- Abierto (incluida reapertura), cerrado completado, cerrado no planificado y cerrado sin motivo.
- `CLOSED` + `DUPLICATE` + `duplicateOf`: la entrada sigue a la principal, hasta tres saltos. Se
  muestra «Se sigue en #N» con el estado de la principal y el `#original` como secundario.
- Principal inaccesible, de otro repositorio o cadena cíclica: se conserva el estado original y se
  avisa de que el enlace no está disponible.
- Issue borrada, transferida o inaccesible: la entrada queda con número, fecha y «Este reporte ya no
  está disponible en GitHub», sin hilo.
- Solo los campos nativos producen duplicadas; un título o label «duplicate» no hace nada.
- La UI distingue carga, lista vacía, error y 404 uniforme («No encontramos este reporte en tu
  cuenta»). El 404 de un número ajeno no llama a GitHub.

## Aclaraciones

- Se publican con el token del bot y un marcador oculto
  `<!-- finance-tracker:reporter-comment user=<userId> -->` más la cabecera visible.
- Solo son editables si el marcador coincide con el principal **y** el autor es el login del bot
  (`GITHUB_BOT_LOGIN` o `GET /user`). Un marcador con otro autor se oculta.
- La automatización (cualquier autor `*[bot]`, como `github-actions[bot]`, o los marcadores históricos
  `<!-- web-report-agent-brief -->` y `<!-- web-report-enriched -->`)
  y las aclaraciones de otras personas no salen del servidor. Un comentario sin marcador solo cuenta
  como mantenedor si `authorAssociation` es `OWNER`, `MEMBER` o `COLLABORATOR`; los de terceros se
  ocultan. El login del bot se compara normalizado (`app[bot]` en REST, `app` en GraphQL).
- Los adjuntos comparten límites y validación con el alta (`src/domain/reports/issue-attachments.ts`)
  y se enlazan tras un segundo marcador. Quitar uno de la aclaración no lo borra de GitHub; la UI lo
  avisa.
- El texto se sanea (comentarios HTML y menciones) y el Markdown se renderiza por AST, sin `v-html`.
  Enlaces solo `http(s)`; imágenes solo de hosts de GitHub.
- Con el hilo cerrado, el compositor se sustituye por un aviso de solo lectura.
- Un fallo de GitHub se muestra como error y conserva el texto y los adjuntos del borrador.

## Novedades

- Cuentan un cambio de estado y un comentario nuevo del mantenedor en la issue seguida. No cuentan
  los comentarios propios ni los de la automatización.
- El store arranca en `GlobalReportLauncher` (una carga por app) y `ReportsPage` fuerza otra al
  entrar. Sin `setInterval` ni `visibilitychange`.
- El aviso aparece en el punto del botón flotante, en el contador y el punto de la hoja «Más» y en
  la etiqueta «Nuevo» de la entrada. Se apaga al abrir el detalle (`lastSeenAt`), también si el POST
  falla (estado local hasta la próxima carga).

## Persistencia

- Tabla `issue_reports` (`user_id`, `issue_number`, `submitted_at`, `last_seen_at`, `original_body`, nulo en altas anteriores a #401), única por
  `(user_id, issue_number)`. Migraciones `0016_issue_reports.sql` y `0017_issue_reports_original_body.sql`.
- Repositorio `src/db/repositories/issue-reports.ts`; todas las funciones reciben `userId`.
- `submittedAt` se toma del servidor al crear; en el backfill, de `created_at` de GitHub.
- `pnpm reports:backfill` recupera los reportes anteriores leyendo el bloque `### Reportero`. Simula
  por defecto, escribe con `--execute`, es idempotente y lista las issues que no puede asociar. Se
  documenta en `docs/operations/self-hosting.md`.

## Archivos principales

### Dominio

- `src/domain/reports/report-entry.ts` — contrato compartido.
- `src/domain/reports/report-status.ts` — `resolveFollowed` y textos de estado.
- `src/domain/reports/reporter-comment.ts` — marcadores, saneado y clasificación.
- `src/domain/reports/report-updates.ts` — cálculo de novedades.
- `src/domain/reports/report-markdown.ts` — parser Markdown a AST.
- `src/domain/reports/demo-reports.ts` — fixtures de la demo.

### Servidor

- `src/lib/server/github-api.ts` — configuración y cabeceras compartidas.
- `src/lib/server/rate-limit.ts` — limitador de ventana fija por cuenta, con purga de claves
  caducadas (5/min altas, 10/min comentarios, 30/min lecturas de la lista).
- `src/lib/server/issue-reports/github.ts` — GraphQL de estado/hilo y REST de comentarios.
- `src/lib/server/issue-reports/service.ts` — casos de uso.
- `src/lib/server/issue-reports/errors.ts` — errores y respuestas.
- `src/pages/api/reports/**` — rutas de lista, detalle, visto y comentarios.
- `src/lib/server/issue-report-schema.ts` y `issue-reports/comment-schema.ts` — validación.
- `src/lib/server/github-issues.ts` — alta de la issue.

### Cliente

- `src/services/reports-api.ts`, `src/stores/reports.ts`
- `src/composables/useReportThread.ts`, `src/composables/useReportsRoute.ts`
- `src/components/reports/ReportsPage.vue` y subcomponentes (`ReportList`, `ReportListItem`,
  `ReportStatus`, `ReportDetail`, `ReportThread`, `ReportComposer`, `ReportMarkdown`)
- `src/scripts/app/reports-badge.ts`
- `src/pages/reportes.astro`, `src/components/FinanceWorkspace.vue`,
  `src/components/FinanceTrackerShell.astro`, `src/scripts/app/shell-navigation.ts`

### Backfill

- `scripts/reports-backfill.ts` (CLI) y `scripts/lib/reports-backfill-plan.ts` (plan puro).

## Demo

`/demo` y `?demo=1` muestran dos reportes ficticios: uno abierto con respuesta del mantenedor y una
aclaración, y otro cerrado como duplicado de una principal ficticia. No hay llamadas a
`/api/reports`; el compositor aparece desactivado con «En la demo no se envían comentarios». Las
fechas son constantes y sirven de fixtures para la E2E.

## Tests

- `tests/unit/report-status.test.ts`, `reporter-comment.test.ts`, `report-updates.test.ts`,
  `report-markdown.test.ts`, `reports-backfill-plan.test.ts`, `issue-report-route.test.ts`.
- `tests/integration/d1-v2/repositories/issue-reports.test.ts`, `api/reports.test.ts`,
  `migrations/issue-reports.test.ts`, `reports-backfill.test.ts`.
- `tests/component/ReportStatus.test.ts`, `ReportMarkdown.test.ts`, `ReportThread.test.ts`.
- `tests/e2e/reports.spec.ts`: acuse y recarga, cierre como duplicada, hilo completo, solo lectura,
  error que conserva el texto, demo sin API y lista vacía real.

## Riesgos y puntos sensibles

- El contrato de la API y los tipos de `report-entry.ts` deben cambiar juntos; el cliente nunca
  envía `userId`, URL de issue ni de comentario.
- El token del bot necesita `GITHUB_BOT_LOGIN` si es una GitHub App; sin login resoluble, la lista y el
  detalle fallan cerrados con un error visible en vez de perder avisos.
- La lista pagina de 20 en 20 con «Cargar más reportes»; el contador de novedades cubre todas las
  entradas de la cuenta.
- El cuerpo de la issue nunca se edita desde la app.

## Documentación relacionada

- `README.md` (§ «Reportes web»)
- `docs/architecture/frontend.md`
- `docs/operations/self-hosting.md`
- `docs/playwright.md`
