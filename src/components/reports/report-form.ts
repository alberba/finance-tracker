/** Piezas compartidas por los formularios de aclaraciones y del alta. */

import {
  encodeBase64,
  ISSUE_ATTACHMENT_MAX_BYTES,
  ISSUE_ATTACHMENT_MAX_COUNT,
} from '../../domain/reports/issue-attachments'
import type { ReportAttachment } from '../../services/issue-report-api'
import { FIELD_CONTROL } from '../ui/field'

/** Textarea que crece con su contenido, sin observer ni animación (good-css). */
export const COMMENT_TEXTAREA = `${FIELD_CONTROL} field-sizing-content max-h-[12lh] min-h-[3lh] resize-none py-2.5 text-base`

export const ATTACHMENT_LIMITS = `Hasta ${ISSUE_ATTACHMENT_MAX_COUNT} imágenes de ${ISSUE_ATTACHMENT_MAX_BYTES / (1024 * 1024)} MB: PNG, JPEG, WebP o GIF.`

/** Fichero elegido → adjunto del payload (base64 dentro del JSON). */
export async function encodeAttachmentFile(file: File): Promise<ReportAttachment> {
  return {
    name: file.name,
    contentType: file.type,
    data: encodeBase64(new Uint8Array(await file.arrayBuffer())),
  }
}
