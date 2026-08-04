# Contexto de la pestaña Reportes

## Resumen

La pestaña `Reportes` permite crear reportes web que terminan como issues de GitHub.
El flujo principal es crear un reporte simple. La automatización con `@claude` existe, pero es opcional y manual.

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
- Ofrecer automatización opcional mediante `@claude`.

## Archivos principales

### UI Astro

- `src/components/reports/ReportsSection.astro`
- `src/components/reports/ReportsPanelHeader.astro`
- `src/components/reports/IssueReportFormCard.astro`
- `src/components/reports/ReportsGuideCard.astro`
- `src/components/FinanceTrackerShell.astro`

### Lógica frontend

- `src/scripts/issue-report.ts`
- `src/scripts/types.ts`

### Backend/API

- `src/pages/api/issues/report.ts`
- `src/lib/server/issue-report-schema.ts`
- `src/lib/server/github-issues.ts`
- `src/lib/server/cloudflare-env.ts`

### Tests relacionados

- `tests/e2e/reports.spec.ts`
- `tests/e2e/finance-tracker.spec.ts`
- `tests/e2e/pages/FinanceTrackerPage.ts`
- `tests/unit/issue-report-schema.test.ts`
- `tests/unit/github-issues.test.ts`

### Documentación/utilidades relacionadas

- `README.md`
- `.github/scripts/issue-context.mjs`
- `tests/unit/issue-context.test.ts`

## Composición de la pestaña

La sección `Reportes` se monta en `FinanceTrackerShell` junto al resto de pestañas.
Internamente está formada por:

1. `ReportsPanelHeader`
   - heading principal
   - copy de alto nivel
2. `IssueReportFormCard`
   - formulario de creación
   - opción secundaria de automatización
   - feedback de estado
3. `ReportsGuideCard`
   - explicación del flujo post-envío

## Flujo técnico

1. El usuario abre `/reportes`.
2. `src/scripts/issue-report.ts` escucha el `submit` del formulario.
3. Se construye un payload con:
   - `type`
   - `summary`
   - `description`
   - `mentionClaude`
   - `section`
   - `context.userAgent`
   - `context.pathname`
   - `context.timestamp`
   - campos opcionales de reproducción/esperado/actual
4. El frontend hace `POST` a `/api/issues/report`.
5. `issue-report-schema.ts` valida y normaliza el payload.
6. `github-issues.ts` crea la issue contra GitHub API.
7. La UI muestra:
   - éxito simple: `Reporte creado: #...`
   - éxito con automatización: `Reporte creado: #... (automatización en curso)`
   - error: `No se pudo crear la issue: ...`

## Defaults y comportamiento actual

- `mentionClaude` está desactivado por defecto.
- Solo se añade `@claude` al cuerpo de la issue si el checkbox está marcado.
- Solo se devuelve `enrichmentStatus: "pending"` si `mentionClaude === true`.
- El botón principal usa lenguaje de producto: `Crear reporte`.

## Contrato del payload

Campos esperados por backend:

- `type`: `"bug"` | `"feature"` (`"enhancement"` se acepta como alias antiguo)
- `summary`: string, 5-140
- `description`: string, 12-8000
- `mentionClaude`: boolean, por defecto `false`
- `section`: string
- `context.userAgent`: string
- `context.pathname`: string
- `context.timestamp`: string
- `stepsToReproduce?`
- `expectedResult?`
- `actualResult?`

## Labels y cuerpo de la issue

Labels base:

- `source:web-report`
- `status:triage`
- `bug` o `feature`

El backend también intenta asignar el tipo estructurado `Bug` o `Feature`.
Si GitHub no admite tipos estructurados, crea la issue igualmente con sus labels.

Label adicional si hay automatización:

- `enrich:pending`

Metadatos que se escriben en el body:

- tipo
- sección
- ruta
- navegador
- fecha cliente
- pasos para reproducir
- resultado esperado
- resultado actual
- `@claude` opcional

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
  - `src/scripts/issue-report.ts`
  - `src/lib/server/issue-report-schema.ts`
  - `src/pages/api/issues/report.ts`
  - unit tests y E2E
- Si se cambia el destino de GitHub issue a otra persistencia, esta pestaña dejará de ser solo una fachada de creación y necesitará nuevo estado local/servidor.

## Tests que protegen esta pestaña

`tests/e2e/reports.spec.ts` cubre:

- render principal de la pestaña
- flujo simple sin automatización
- flujo con automatización manual
- validación mínima de formulario
- manejo de error del endpoint

`tests/unit/issue-report-schema.test.ts` cubre:

- normalización y validación del payload
- default `mentionClaude = false`

`tests/unit/github-issues.test.ts` cubre:

- creación de issue
- reintentos transitorios
- ausencia/presencia de `@claude`
- labels correctas según automatización

## Checklist para futuras issues sobre Reportes

Antes de tocar esta pestaña, revisar:

1. `src/components/reports/*`
2. `src/scripts/issue-report.ts`
3. `src/pages/api/issues/report.ts`
4. `src/lib/server/issue-report-schema.ts`
5. `src/lib/server/github-issues.ts`
6. `tests/e2e/reports.spec.ts`
7. `tests/e2e/pages/FinanceTrackerPage.ts`
8. `README.md`

## Recomendación práctica

Para mantener un archivo de contexto por pestaña, esta estructura escala bien:

- `docs/context/tabs/dashboard.md`
- `docs/context/tabs/movimientos.md`
- `docs/context/tabs/presupuesto.md`
- `docs/context/tabs/patrimonio.md`
- `docs/context/tabs/inversion.md`
- `docs/context/tabs/objetivos.md`
- `docs/context/tabs/configuracion.md`
- `docs/context/tabs/datos.md`
- `docs/context/tabs/reportes.md`
