/**
 * Descripciones de un reporte en el detalle de «Mis reportes» (#401).
 *
 * El enricher sobrescribe el cuerpo de la issue, así que el alta guarda el
 * cuerpo original. Aquí se decide qué parte de cada cuerpo puede verse: nunca el
 * contexto de ejecución ni los datos de quien reporta. Es puro: ni Effect ni red.
 */

const PRIVATE_HEADINGS = new Set(['### Contexto de ejecución', '### Reportero'])
const TITLE_LINE = /^##\s+Reporte desde la web\s*$/
const AUTOMATION_MARKER_LINE = /^\s*<!--\s*web-report-[\w-]+\s*-->\s*$/

/** Quita cabecera del alta, marcadores de automatización y secciones privadas. */
function visibleBody(body: string): string {
  const lines = body.split(/\r?\n/)
  const kept: string[] = []
  let skipping = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (/^###\s/.test(trimmed)) skipping = PRIVATE_HEADINGS.has(trimmed)
    if (skipping || TITLE_LINE.test(trimmed) || AUTOMATION_MARKER_LINE.test(line)) continue
    kept.push(line)
  }
  return kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export interface ReportDescriptions {
  /** Lo que la persona envió; `null` si el alta no lo conservó (reportes anteriores). */
  original: string | null
  /** El cuerpo actual de la issue cuando aporta algo distinto del original; si no, `null`. */
  issueDescription: string | null
}

/**
 * `issueBody` es el de la issue propia del reporte; `null` cuando se sigue a una
 * principal, cuyo texto pertenece a otra persona y nunca se muestra.
 */
export function describeReport(
  originalBody: string | null,
  issueBody: string | null,
): ReportDescriptions {
  const original = originalBody === null ? '' : visibleBody(originalBody)
  const current = issueBody === null ? '' : visibleBody(issueBody)
  return {
    original: original || null,
    issueDescription: current && current !== original ? current : null,
  }
}
