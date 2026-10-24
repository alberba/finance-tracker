import { z } from 'zod'
import {
  ISSUE_ATTACHMENT_MAX_BYTES,
  ISSUE_ATTACHMENT_MAX_COUNT,
  ISSUE_ATTACHMENT_TYPES,
  isIssueAttachmentType,
  sniffImageType,
} from '../../domain/reports/issue-attachments'

/**
 * `enhancement` was the value emitted by the first version of the form. Keep
 * accepting it at the API boundary so old clients/bookmarks can still create
 * reports, while all new issues use the GitHub-friendly `feature` value.
 */
const ISSUE_TYPES = ['bug', 'feature', 'enhancement'] as const

// Base64 de un adjunto: el límite de caracteres corta payloads desmedidos antes
// de decodificar; el tamaño exacto se comprueba tras decodificar.
const MAX_ATTACHMENT_BASE64_LENGTH = Math.ceil(ISSUE_ATTACHMENT_MAX_BYTES / 3) * 4
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/

const attachmentInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  contentType: z.string().trim().max(64),
  data: z.string().max(MAX_ATTACHMENT_BASE64_LENGTH),
})

type AttachmentInput = z.output<typeof attachmentInputSchema>

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
    attachments: z.array(attachmentInputSchema).max(ISSUE_ATTACHMENT_MAX_COUNT).optional(),
  })
  .superRefine((report, ctx) => {
    report.attachments?.forEach((attachment, index) => {
      const path = ['attachments', index]
      if (!isIssueAttachmentType(attachment.contentType)) {
        ctx.addIssue({ code: 'custom', path, message: 'Formato de adjunto no admitido.' })
        return
      }
      if (!BASE64_PATTERN.test(attachment.data) || attachment.data.length % 4 !== 0) {
        ctx.addIssue({ code: 'custom', path, message: 'Adjunto con base64 mal formado.' })
        return
      }
      const bytes = decodeBase64(attachment.data)
      if (bytes.byteLength > ISSUE_ATTACHMENT_MAX_BYTES) {
        ctx.addIssue({ code: 'custom', path, message: 'Adjunto por encima del límite de tamaño.' })
        return
      }
      if (sniffImageType(bytes) !== attachment.contentType) {
        ctx.addIssue({
          code: 'custom',
          path,
          message: 'El contenido del adjunto no coincide con su tipo.',
        })
      }
    })
  })
  .transform((parsed) => ({
    ...parsed,
    type: parsed.type === 'enhancement' ? ('feature' as const) : parsed.type,
  }))

export type IssueReportInput = z.input<typeof issueReportSchema>

export interface ResolvedAttachment {
  name: string
  contentType: (typeof ISSUE_ATTACHMENT_TYPES)[number]
  bytes: Uint8Array<ArrayBuffer>
}

export type IssueReportPayload = Omit<z.output<typeof issueReportSchema>, 'attachments'> & {
  attachments?: ResolvedAttachment[]
}

// Quita los caracteres de control. Por defecto, todos; con `keepLineBreaks`,
// conserva `\n` y `\t` para el texto libre de la descripción.
function removeControlCharacters(value: string, keepLineBreaks = false): string {
  return Array.from(value)
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      if (keepLineBreaks && (codePoint === 0x0a || codePoint === 0x09)) return true
      return codePoint > 0x1f && codePoint !== 0x7f
    })
    .join('')
}

function sanitizeText(value: string): string {
  return removeControlCharacters(value).replace(/\r\n/g, '\n').trim()
}

function sanitizeMultilineText(value: string): string {
  return removeControlCharacters(value.replace(/\r\n?/g, '\n'), true).trim()
}

function decodeBase64(data: string): Uint8Array<ArrayBuffer> {
  const binary = atob(data)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function resolveAttachment(attachment: AttachmentInput): ResolvedAttachment {
  // `superRefine` ya rechaza los tipos no admitidos; el guard deja el tipo estrecho sin casts.
  if (!isIssueAttachmentType(attachment.contentType)) {
    throw new Error('Formato de adjunto no admitido.')
  }
  return {
    name: sanitizeText(attachment.name),
    contentType: attachment.contentType,
    bytes: decodeBase64(attachment.data),
  }
}

export function parseIssueReportPayload(input: unknown): IssueReportPayload {
  const parsed = issueReportSchema.parse(input)
  return {
    ...parsed,
    attachments: parsed.attachments?.map(resolveAttachment),
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
