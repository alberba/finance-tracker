/** Esquemas de las aclaraciones de un reporte (#340). */

import { z } from 'zod'

import { ISSUE_ATTACHMENT_MAX_COUNT } from '../../../domain/reports/issue-attachments'
import { REPORTER_COMMENT_MAX_LENGTH } from '../../../domain/reports/reporter-comment'
import {
  attachmentInputSchema,
  refineAttachments,
  resolveAttachments,
  sanitizeMultilineText,
  type ResolvedAttachment,
} from '../issue-report-schema'

const textSchema = z
  .string()
  .transform((value) => sanitizeMultilineText(value))
  .pipe(
    z
      .string()
      .min(1, 'Escribe una aclaración.')
      .max(REPORTER_COMMENT_MAX_LENGTH, 'La aclaración supera el límite de caracteres.'),
  )

const attachmentsSchema = z
  .array(attachmentInputSchema)
  .max(ISSUE_ATTACHMENT_MAX_COUNT)
  .optional()

export const createCommentSchema = z
  .object({ text: textSchema, attachments: attachmentsSchema })
  .superRefine((value, ctx) => refineAttachments(value.attachments, ctx))
  .transform((value) => ({
    text: value.text,
    attachments: resolveAttachments(value.attachments),
  }))

export const updateCommentSchema = z
  .object({
    text: textSchema,
    keepAttachments: z.array(z.string().trim().max(2048)).max(ISSUE_ATTACHMENT_MAX_COUNT).default([]),
    attachments: attachmentsSchema,
  })
  .superRefine((value, ctx) => {
    refineAttachments(value.attachments, ctx)
    if (value.keepAttachments.length + (value.attachments?.length ?? 0) > ISSUE_ATTACHMENT_MAX_COUNT) {
      ctx.addIssue({
        code: 'custom',
        path: ['keepAttachments'],
        message: `Solo puedes adjuntar hasta ${ISSUE_ATTACHMENT_MAX_COUNT} imágenes.`,
      })
    }
  })
  .transform((value) => ({
    text: value.text,
    keepAttachments: value.keepAttachments,
    attachments: resolveAttachments(value.attachments),
  }))

export interface CommentInput {
  text: string
  attachments: ResolvedAttachment[]
}

export interface CommentUpdateInput extends CommentInput {
  keepAttachments: string[]
}
