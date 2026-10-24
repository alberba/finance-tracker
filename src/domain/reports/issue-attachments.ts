// Reglas de los adjuntos de un reporte. Las comparten el panel (validación al
// elegir el fichero) y el servidor (validación definitiva). Sin dependencias de
// navegador ni de Node: solo bytes y constantes.

export const ISSUE_ATTACHMENT_MAX_COUNT = 3
export const ISSUE_ATTACHMENT_MAX_BYTES = 2 * 1024 * 1024

export const ISSUE_ATTACHMENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const

export type IssueAttachmentType = (typeof ISSUE_ATTACHMENT_TYPES)[number]

export function isIssueAttachmentType(value: string): value is IssueAttachmentType {
  return (ISSUE_ATTACHMENT_TYPES as readonly string[]).includes(value)
}

/**
 * Tipo real de una imagen según su cabecera. El tipo que declara el navegador
 * o el cliente no basta: se contrasta con estos bytes.
 */
export function sniffImageType(bytes: Uint8Array): IssueAttachmentType | null {
  const startsWith = (signature: number[], offset = 0) =>
    signature.every((byte, index) => bytes[offset + index] === byte)

  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (startsWith([0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith([0x47, 0x49, 0x46, 0x38])) return 'image/gif'
  // WebP: contenedor RIFF con la marca «WEBP» en el offset 8.
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image/webp'
  }
  return null
}

/** Base64 sin saltos, el formato del campo `data` del payload. */
export function encodeBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary)
}

export function formatAttachmentSize(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`
}

export function getAttachmentError(
  file: { name: string; size: number; type: string },
  currentCount: number,
): string | null {
  if (currentCount >= ISSUE_ATTACHMENT_MAX_COUNT) {
    return `Solo puedes adjuntar hasta ${ISSUE_ATTACHMENT_MAX_COUNT} imágenes.`
  }
  if (!isIssueAttachmentType(file.type)) {
    return `«${file.name}» no es un formato admitido. Usa PNG, JPEG, WebP o GIF.`
  }
  if (file.size > ISSUE_ATTACHMENT_MAX_BYTES) {
    return `«${file.name}» supera el límite de ${formatAttachmentSize(ISSUE_ATTACHMENT_MAX_BYTES)}.`
  }
  return null
}
