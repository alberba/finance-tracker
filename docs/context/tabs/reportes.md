# Contexto de la pestaña Reportes

## Resumen

La pestaña `Reportes` permite crear reportes web que terminan como issues de GitHub.
El flujo es crear un reporte simple; no hay automatización asociada.

Ruta pública:

- `/reportes`

Identificadores clave en UI:

- sección raíz: `#reports`
- formulario: `#issue-report-form`
- estado: `#issue-report-status`
- checkbox opcional Claude: `#issue-report-mention-claude`

## Objetivo funcional actual

- Permitir enviar errores o mejoras desde la UI.
- Crear una issue en GitHub con contexto técnico básico.

## Archivos principales

### UI

- `src/components/reports/GlobalReportLauncher.vue`: botón flotante «Reportar» (escritorio)
- `src/components/reports/IssueReportPanel.vue`: el formulario en un panel lateral
- `src/components/layout/MobileNavigation.astro`: «Crear reporte» en la hoja «Más» (móvil)

### Lógica frontend

- `src/services/issue-report-api.ts`
- `src/scripts/types.ts`

### Backend/API

- `src/pages/api/issues/report.ts`
- `src/lib/server/issue-report-schema.ts`
- `src/lib/server/github-issues.ts`
- `src/lib/server/issue-attachments.ts`: sube los adjuntos a `uploads.github.com`
- `src/lib/server/issue-duplicate-checker.ts`: comprobación semántica previa con DeepSeek
- `.github/workflows/enrich-web-issue.yml`: análisis asíncrono con OpenCode
- `.github/scripts/enrich-web-issue.mjs`: contexto, validación y publicación del análisis
- `src/lib/server/cloudflare-env.ts`

### Dominio compartido

- `src/domain/reports/issue-attachments.ts`: límites, tipos admitidos y detección por cabecera,
  compartidos por el panel y el servidor

### Tests relacionados

- `tests/e2e/reports.spec.ts`
- `tests/e2e/finance-tracker.spec.ts`
- `tests/e2e/pages/FinanceTrackerPage.ts`
- `tests/unit/issue-report-schema.test.ts`
- `tests/unit/issue-report-domain.test.ts`
- `tests/unit/issue-report-route.test.ts`
- `tests/unit/issue-attachments.test.ts`: reglas de adjuntos (dominio y esquema)
- `tests/unit/github-issues.test.ts`
- `tests/unit/github-issue-attachments.test.ts`: subida de adjuntos y lectura del id del repositorio
- `tests/unit/issue-duplicate-checker.test.ts`: duplicadas, plazo, errores y clave ausente
- `tests/unit/enrich-web-issue.test.ts`: JSON del agente, metadatos, publicación y reintentos

### Documentación/utilidades relacionadas

- `README.md`
- `.github/scripts/issue-context.mjs`
- `tests/unit/issue-context.test.ts`

## Composición

No es una sección propia: `FinanceWorkspace.vue` monta `GlobalReportLauncher`, que abre
`IssueReportPanel` (panel lateral con tipo, resumen, descripción opcional, el aviso de publicación
en repositorio público y el estado del envío). En móvil lo abre la hoja «Más».

## Flujo técnico

1. El usuario abre `/reportes`.
2. `src/components/reports/IssueReportPanel.vue` envía el formulario con `src/services/issue-report-api.ts`.
3. Se construye un payload con:
   - `type`
   - `summary`
   - `description`
   - `section`
   - `context.userAgent`
   - `context.pathname`
   - `context.timestamp`
   - `description` solo si la persona escribió algo
4. El frontend hace `POST` a `/api/issues/report`.
5. `issue-report-schema.ts` valida y normaliza el payload. Los campos retirados
   (`expectedResult`, `actualResult`, `stepsToReproduce`) y cualquier dato de reportero que traiga
   el payload se descartan.
6. `github-issues.ts` crea la issue contra GitHub API. El reportero (`userId`, `email`, `name`) sale
   siempre del principal autenticado que resuelve la ruta, nunca del payload.
7. La UI muestra:
   - issue nueva: `Reporte creado: #...`
   - duplicada abierta: `Este reporte ya existe: #...`, con enlace y sin otra publicación
   - error: `No se pudo crear la issue: ...`

## Defaults y comportamiento actual

- El botón principal usa lenguaje de producto: `Crear reporte`.

## Contrato del payload

Campos esperados por backend:

- `type`: `"bug"` | `"feature"` (`"enhancement"` se acepta como alias antiguo)
- `summary`: string, 5-140
- `description?`: string, opcional y sin mínimo; máximo 8000 (sin descripción el backend deja `""`)
- `section`: string
- `context.userAgent`: string
- `context.pathname`: string
- `context.timestamp`: string
- `attachments?`: hasta 3 imágenes, cada una `{ name, contentType, data }` con `data` en base64.
  Tipos admitidos: PNG, JPEG, WebP y GIF; máximo 2 MB decodificados por imagen. El servidor
  comprueba el tipo por la cabecera real del fichero, no solo por el declarado. Los límites viven
  en `src/domain/reports/issue-attachments.ts`, compartidos por el panel y el servidor.

Campos retirados del contrato: `expectedResult`, `actualResult` y `stepsToReproduce`. Los
clientes antiguos que los envíen siguen funcionando porque se ignoran.

## Labels y cuerpo de la issue

Labels base:

- `source:web-report`
- `needs-triage`
- `bug` o `feature`

El backend también intenta asignar el tipo estructurado `Bug` o `Feature`.
Si GitHub no admite tipos estructurados, crea la issue igualmente con sus labels.

La API conserva el reporte original y comprueba duplicadas antes de crear cuando tiene
`OPENCODE_GO_API_KEY`: consulta hasta 20 candidatas abiertas y cerradas y pide una decisión breve
a DeepSeek. Solo una coincidencia del mismo problema y alcance con una abierta devuelve su enlace
sin crear otra issue ni subir adjuntos (`200`, `duplicate: true`). Se descartan números inventados
y candidatas con cuerpo truncado. La búsqueda tiene un plazo de 3 s; el modelo, de 8 s. Sin clave
o ante fallos se crea igualmente el reporte. La comprobación es limitada y puede omitir coincidencias.

Después de crear, el workflow **Analyze web report** ejecuta OpenCode con DeepSeek en un checkout.
Carga `.opencode/skills/create-issue/SKILL.md`, explora el código y lee hasta 10 candidatas con hasta
10 comentarios por candidata. Prepara el cuerpo según el template (sin template: `## Descripción`
y `## Notas técnicas`) y un Agent Brief con hechos contrastados, hipótesis y pendientes. Las
referencias a cerradas se interpretan como posibles recurrencias. La decisión `duplicate` del
agente contiene el número de una candidata abierta y un motivo contrastado. El script revalida
la candidata y cierra el reporte con `state: closed`, `state_reason: duplicate` y
`duplicate_issue_id` (id de base de datos de la principal, no su número). Es el cierre nativo de
GitHub; no se sustituye por texto en la descripción ni por un label. Verifica la relación con
GraphQL (`state`, `stateReason`, `duplicateOf`); ante dudas o contexto insuficiente no cierra.

El script de publicación exige JSON válido, carga de la skill, lectura de código y fin del análisis.
Conserva el bloque de adjuntos y los metadatos del reporte, que no se pasan al agente; reemplaza
el cuerpo, publica el brief enlazado y verifica el resultado. Los reintentos reutilizan el comentario
del bot y omiten issues ya enriquecidas. Si detecta una edición humana antes de sustituir el cuerpo,
interrumpe la publicación. Los reportes no duplicados siguen en `needs-triage`, con `ui-change` en features visuales.
El seguimiento de reportes de #340 debe detectar `CLOSED` + `DUPLICATE` y leer `duplicateOf`
para mostrar «Cerrado como duplicado de #N», conservando la identidad y el hilo del reporte
original. Debe respetar reaperturas y cambios manuales posteriores consultando el estado nativo
actual, sin inferirlo de comentarios, labels ni cierres como completado o no planificado.

El secret de Actions `OPENCODE_GO_API_KEY` se configura aparte del entorno del servidor. El workflow
necesita estar en la rama por defecto; se puede reintentar con `workflow_dispatch` e `issue_number`.
La configuración, los permisos y los límites están documentados en [Reportes web](../../../README.md#reportes-web).

Secciones del cuerpo inicial que publica la API:

- `### Resumen`
- `### Problema o solicitud`: solo si hay descripción, con el texto tal cual lo escribió la persona
- `### Adjuntos`: solo si hay capturas. Cada imagen subida aparece como referencia de imagen Markdown con su nombre y la URL devuelta; si una
  subida falla, la línea dice que ese adjunto no se pudo subir y la issue se crea igualmente.
  Las imágenes se suben antes de crear la issue, al endpoint de adjuntos de usuario de GitHub
  (`uploads.github.com/user-attachments/assets`) con el mismo token.
- `### Contexto de ejecución`: tipo, sección, ruta, navegador y fecha cliente
- `### Reportero`: nombre, email e identificador de la cuenta, tomados del principal autenticado

El formulario avisa, antes de enviar, de que el reporte se publica en un repositorio público con
esos datos de cuenta.

## Issue #29: revisión relevante para esta pestaña

Issue revisada:

- `#29`
- título: `Mejorar vista de Presupuesto`

Conclusión:

- La issue no describe un problema de la pestaña `Reportes`.
- Es una petición funcional para `Presupuesto`.
- Sin embargo, la issue fue creada desde `Reportes`, por eso quedó con estos metadatos:
  - `Sección: reports`
  - `Ruta: /reportes`

Lectura técnica:

- El sistema registra la pestaña activa desde la que se envía el reporte.
- No detecta automáticamente cuál es la pestaña realmente afectada por el contenido del texto.

Implicación para futuros cambios:

- Si quieres que las issues reflejen el área real afectada, hará falta añadir un campo explícito tipo `área afectada` o `sección afectada`.
- Mientras eso no exista, `section` y `pathname` significan "desde dónde se envió", no necesariamente "qué módulo está afectado".

## Riesgos y puntos sensibles

- El copy de la pestaña puede cambiar con facilidad, pero los selectores de tests deben mantenerse estables.
- Si cambia el contrato del payload, hay que actualizar:
  - `src/services/issue-report-api.ts`
  - `src/lib/server/issue-report-schema.ts`
  - `src/pages/api/issues/report.ts`
  - unit tests y E2E
- Si se cambia el destino de GitHub issue a otra persistencia, esta pestaña dejará de ser solo una fachada de creación y necesitará nuevo estado local/servidor.

## Tests que protegen esta pestaña

`tests/e2e/reports.spec.ts` cubre:

- render principal de la pestaña
- flujo de creación del reporte
- validación mínima de formulario
- manejo de error del endpoint

`tests/unit/issue-report-schema.test.ts` cubre:

- normalización y validación del payload

`tests/unit/github-issues.test.ts` cubre:

- creación de issue
- reintentos transitorios
- labels correctas según el tipo

## Checklist para futuras issues sobre Reportes

Antes de tocar esta pestaña, revisar:

1. `src/components/reports/*`
2. `src/services/issue-report-api.ts`
3. `src/pages/api/issues/report.ts`
4. `src/lib/server/issue-report-schema.ts`
5. `src/lib/server/github-issues.ts`
6. `tests/e2e/reports.spec.ts`
7. `tests/e2e/pages/FinanceTrackerPage.ts`
8. `README.md`
