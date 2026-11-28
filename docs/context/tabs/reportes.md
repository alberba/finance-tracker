# Contexto de «Mis reportes»

## Resumen

«Mis reportes» convierte el acuse momentáneo del alta en una página de seguimiento (`/reportes`).
Cada cuenta ve sus reportes con el estado nativo de GitHub, el hilo de aclaraciones y avisos de
novedades. GitHub aporta el estado y las respuestas de mantenedores. La app conserva el contenido
privado, la propiedad y la última lectura.

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

1. Al abrir **Reportar** se toma una captura en memoria. La persona puede revisar la sección,
   el periodo, las opciones activas, el estado de carga y de sincronización, las comprobaciones
   y los últimos pasos observados. La casilla de adjuntar viene desmarcada.
2. `POST /api/issues/report` envía a GitHub el resumen técnico revisado y una referencia opaca.
   El título escrito, la descripción y las capturas quedan en la app. En un fallo se conserva
   el borrador y se puede copiar el resumen técnico. Si GitHub creó la issue pero falló el
   guardado privado, el alta devuelve `tracked: false`. El formulario puede guardar el borrador
   en el mismo caso durante las 24 horas siguientes.
3. `GET /api/reports` sigue consultando el estado en GitHub y pagina de 20 en 20.
   `GET /api/reports/:n` mezcla el hilo de mantenedores de la issue seguida con las aclaraciones
   privadas del reporte original. El cliente marca la lectura con `POST /api/reports/:n/seen`.
4. La persona puede retirar el diagnóstico en el detalle de su reporte. La retirada borra la
   captura. El plazo de 30 días empieza al enviar el reporte; vencido el plazo, la consulta
   deja de devolverla. Una nueva alta purga las capturas vencidas.

## Consulta de soporte

- En `/soporte/reportes`, introduce el número de la issue de GitHub. La consulta es de solo
  lectura y requiere rol de administrador y un permiso para ese caso.
- Otra persona administradora habilita el permiso con `POST /api/support/reports/:n/grant`.
  Envía JSON con `supportUserId` (identificador interno de la persona de soporte) y
  `enabled: true`. Usa `enabled: false` para revocarlo. Cada concesión, revocación, lectura
  y retirada queda en `report_support_audit`.
- La misma consulta está disponible en `GET /api/support/reports/:n`. Los adjuntos se entregan
  desde la app con los permisos del caso. Un número o una referencia de GitHub nunca concede
  acceso por sí solo.
- Acceso muestra una referencia copiable si un fallo del servidor o del callback de proveedor
  generó un evento de Sentry.
  Si el navegador ya registró un fallo técnico en la pantalla, la captura puede incluir su ID.

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

- Las nuevas aclaraciones y sus adjuntos se guardan, editan y borran en la app mientras el hilo
  seguido está abierto. El texto del borrador se conserva ante un fallo.
- El hilo sigue mostrando respuestas de mantenedores y las aclaraciones históricas propias de
  GitHub. Las históricas se pueden eliminar mientras el hilo está abierto. El marcador y el
  login del bot siguen siendo necesarios para comprobar autoría.
- El Markdown se renderiza por AST. Las capturas subidas en el formulario se sirven con
  autorización de cuenta o permiso de soporte por caso.

## Novedades

- Cuentan un cambio de estado y un comentario nuevo del mantenedor en la issue seguida. No cuentan
  los comentarios propios ni los de la automatización.
- El store arranca en `NeonReportLauncher` (una carga por app) y `NeonReportsSection` fuerza otra
  al entrar. Sin `setInterval` ni `visibilitychange`.
- El aviso aparece en el punto del botón flotante, en el contador y el punto de la hoja «Más» y en
  la etiqueta «Nuevo» de la entrada. Se apaga al abrir el detalle (`lastSeenAt`), también si el POST
  falla (estado local hasta la próxima carga).

## Persistencia

- Tabla `issue_reports` (`user_id`, `issue_number`, `submitted_at`, `last_seen_at`, `original_body`, nulo en altas anteriores a #401), única por
  `(user_id, issue_number)`. Migraciones `0016_issue_reports.sql` y `0017_issue_reports_original_body.sql`.
- Repositorio `src/db/repositories/issue-reports.ts`; todas las funciones reciben `userId`.
- `submittedAt` se toma del servidor al crear; en el backfill, de `created_at` de GitHub.
- `bun run reports:backfill` recupera los reportes anteriores leyendo el bloque `### Reportero`. Simula
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
- `src/neon/sections/reports/NeonReportsSection.vue` y sus piezas (`NeonReportList`,
  `NeonReportDetail`, `NeonReportThread`, `NeonReportComposer`, `NeonReportMarkdown*`,
  `view-model.ts`); el botón «Reportar» con su punto de novedades en
  `src/neon/layout/NeonReportLauncher.vue`, y el panel de alta en
  `src/neon/layout/NeonIssueReportPanel.vue`.
- `src/scripts/app/reports-badge.ts`
- `src/pages/reportes.astro`, `src/neon/app/AppWorkspace.vue`, `src/neon/app/AppShell.astro`,
  `src/scripts/app/shell-navigation.ts`

### Backfill

- `scripts/reports-backfill.ts` (CLI) y `scripts/lib/reports-backfill-plan.ts` (plan puro).

## Demo

`/demo` y `?demo=1` muestran dos reportes ficticios: uno abierto con respuesta del mantenedor y una
aclaración, y otro cerrado como duplicado de una principal ficticia. No hay llamadas a
`/api/reports`; el compositor aparece desactivado con «En la demo no se envían comentarios». Las
fechas son constantes y sirven de fixtures para la E2E.

## Tests

- `tests/unit/neon-reports-view-model.test.ts`,
  `tests/component/NeonReportsSection.test.ts`, `tests/e2e/neon-reports.spec.ts` (con la API simulada
  de `tests/e2e/pages/reports-api.ts`, compartida con `reports.spec.ts`).
- `tests/unit/report-status.test.ts`, `reporter-comment.test.ts`, `report-updates.test.ts`,
  `report-markdown.test.ts`, `reports-backfill-plan.test.ts`, `report-diagnostic.test.ts`.
- `tests/integration/d1-v2/repositories/issue-reports.test.ts`, `api/reports.test.ts`,
  `reports-backfill.test.ts`, `api/private-reports.test.ts`.
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
