import {
  encodeBase64,
  ISSUE_ATTACHMENT_MAX_BYTES,
  ISSUE_ATTACHMENT_MAX_COUNT,
} from '../../../domain/reports/issue-attachments'
import type { ReportAttachment } from '../../../services/issue-report-api'

/** «Hasta 3 imágenes de 2 MB: PNG, JPEG, WebP o GIF.» */
export const ATTACHMENT_LIMITS = `Hasta ${ISSUE_ATTACHMENT_MAX_COUNT} imágenes de ${ISSUE_ATTACHMENT_MAX_BYTES / (1024 * 1024)} MB: PNG, JPEG, WebP o GIF.`

/** A chosen file as the attachment the payload carries (base64 inside the JSON). */
export async function encodeAttachmentFile(file: File): Promise<ReportAttachment> {
  return {
    name: file.name,
    contentType: file.type,
    data: encodeBase64(new Uint8Array(await file.arrayBuffer())),
  }
}

/** Classes of a multi-line field that grows with its text (no observer, no animation). */
export const TEXTAREA_CLASS =
  'bg-panel border-ctrl-line text-text outline-accent rounded-field field-sizing-content max-h-[12lh] w-full resize-none border px-3.5 py-3 text-[16px] leading-normal focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60'
