import { z } from 'zod'

/**
 * `enhancement` was the value emitted by the first version of the form. Keep
 * accepting it at the API boundary so old clients/bookmarks can still create
 * reports, while all new issues use the GitHub-friendly `feature` value.
 */
const ISSUE_TYPES = ['bug', 'feature', 'enhancement'] as const

export const issueReportSchema = z
  .object({
    type: z.enum(ISSUE_TYPES),
    summary: z.string().trim().min(5).max(140),
    // Opcional y sin mínimo: el resumen ya suele bastar. El máximo se mantiene
    // como cortafuegos contra payloads desmedidos.
    description: z.string().trim().max(8000).optional().default(''),
    section: z.string().trim().min(1).max(64),
    context: z.object({
      userAgent: z.string().trim().max(512).optional().default(''),
      pathname: z.string().trim().max(256).optional().default(''),
      timestamp: z.string().trim().max(64).optional().default(''),
    }),
  })
  .transform((parsed) => ({
    ...parsed,
    type: parsed.type === 'enhancement' ? ('feature' as const) : parsed.type,
  }))

export type IssueReportInput = z.input<typeof issueReportSchema>

export type IssueReportPayload = z.output<typeof issueReportSchema>

function removeControlCharacters(value: string): string {
  return Array.from(value)
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return codePoint > 0x1f && codePoint !== 0x7f
    })
    .join('')
}

function sanitizeText(value: string): string {
  return removeControlCharacters(value).replace(/\r\n/g, '\n').trim()
}

// La descripción es texto libre: conserva saltos de línea y tabuladores, que
// `removeControlCharacters` sí elimina para el resto de campos de una línea.
function sanitizeMultilineText(value: string): string {
  return Array.from(value.replace(/\r\n?/g, '\n'))
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return codePoint === 0x0a || codePoint === 0x09 || (codePoint > 0x1f && codePoint !== 0x7f)
    })
    .join('')
    .trim()
}

export function parseIssueReportPayload(input: unknown): IssueReportPayload {
  const parsed = issueReportSchema.parse(input)
  return {
    ...parsed,
    summary: sanitizeText(parsed.summary),
    description: sanitizeMultilineText(parsed.description),
    section: sanitizeText(parsed.section),
    context: {
      userAgent: sanitizeText(parsed.context.userAgent),
      pathname: sanitizeText(parsed.context.pathname),
      timestamp: sanitizeText(parsed.context.timestamp),
    },
  }
}
