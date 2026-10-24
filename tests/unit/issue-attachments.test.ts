import { describe, expect, it } from 'vitest'
import {
  getAttachmentError,
  ISSUE_ATTACHMENT_MAX_BYTES,
  ISSUE_ATTACHMENT_MAX_COUNT,
  sniffImageType,
} from '../../src/domain/reports/issue-attachments'
import { parseIssueReportPayload } from '../../src/lib/server/issue-report-schema'

const HEADERS: Record<string, number[]> = {
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'image/jpeg': [0xff, 0xd8, 0xff, 0xe0],
  'image/gif': [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
  'image/webp': [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50],
}

/** Bytes con la cabecera real del tipo y relleno hasta `size`. */
function imageBytes(type: keyof typeof HEADERS, size = 64): Uint8Array {
  const bytes = new Uint8Array(size)
  bytes.set(HEADERS[type])
  return bytes
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function attachment(type: keyof typeof HEADERS, overrides: Record<string, unknown> = {}) {
  return {
    name: `captura.${type.split('/')[1]}`,
    contentType: type,
    data: toBase64(imageBytes(type)),
    ...overrides,
  }
}

function reportWith(attachments: unknown) {
  return {
    type: 'bug',
    summary: 'Captura adjunta al reporte',
    section: 'reports',
    context: {},
    attachments,
  }
}

describe('issue attachments: sniffing', () => {
  it('reconoce PNG, JPEG, GIF y WebP por su cabecera real', () => {
    expect(sniffImageType(imageBytes('image/png'))).toBe('image/png')
    expect(sniffImageType(imageBytes('image/jpeg'))).toBe('image/jpeg')
    expect(sniffImageType(imageBytes('image/gif'))).toBe('image/gif')
    expect(sniffImageType(imageBytes('image/webp'))).toBe('image/webp')
  })

  it('no reconoce como imagen un texto aunque diga ser PNG', () => {
    expect(sniffImageType(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull()
  })
})

describe('issue attachments: schema', () => {
  it('acepta hasta tres adjuntos y los devuelve decodificados', () => {
    const parsed = parseIssueReportPayload(
      reportWith([attachment('image/png'), attachment('image/jpeg'), attachment('image/webp')]),
    )

    expect(ISSUE_ATTACHMENT_MAX_COUNT).toBe(3)
    expect(parsed.attachments).toHaveLength(3)
    expect(parsed.attachments?.[0]).toMatchObject({
      name: 'captura.png',
      contentType: 'image/png',
    })
    expect(parsed.attachments?.[0].bytes.slice(0, 8)).toEqual(imageBytes('image/png').slice(0, 8))
  })

  it('rechaza un cuarto adjunto', () => {
    expect(() =>
      parseIssueReportPayload(
        reportWith([
          attachment('image/png'),
          attachment('image/png'),
          attachment('image/png'),
          attachment('image/png'),
        ]),
      ),
    ).toThrow()
  })

  it('rechaza un tipo no admitido aunque el contenido sea válido', () => {
    expect(() =>
      parseIssueReportPayload(
        reportWith([attachment('image/png', { contentType: 'image/svg+xml' })]),
      ),
    ).toThrow()
  })

  it('rechaza contenido que no coincide con el tipo declarado', () => {
    expect(() =>
      parseIssueReportPayload(reportWith([attachment('image/png', { contentType: 'image/jpeg' })])),
    ).toThrow()
  })

  it('rechaza una imagen de más de 2 MB una vez decodificada', () => {
    const oversized = toBase64(imageBytes('image/png', ISSUE_ATTACHMENT_MAX_BYTES + 1))
    expect(() =>
      parseIssueReportPayload(reportWith([attachment('image/png', { data: oversized })])),
    ).toThrow()
  })

  it('acepta una imagen exactamente en el límite de 2 MB', () => {
    const atLimit = toBase64(imageBytes('image/png', ISSUE_ATTACHMENT_MAX_BYTES))
    const parsed = parseIssueReportPayload(reportWith([attachment('image/png', { data: atLimit })]))
    expect(parsed.attachments?.[0].bytes.byteLength).toBe(ISSUE_ATTACHMENT_MAX_BYTES)
  })

  it('rechaza base64 mal formado', () => {
    expect(() =>
      parseIssueReportPayload(reportWith([attachment('image/png', { data: 'no es base64!!' })])),
    ).toThrow()
  })

  it('un reporte sin adjuntos no los trae', () => {
    const parsed = parseIssueReportPayload({
      type: 'bug',
      summary: 'Sin adjuntos en absoluto',
      section: 'reports',
      context: {},
    })

    expect(parsed.attachments ?? []).toEqual([])
  })
})

describe('issue attachments: validación al elegir el fichero', () => {
  const png = { name: 'pantalla.png', size: 1024, type: 'image/png' }

  it('acepta una imagen válida mientras haya hueco', () => {
    expect(getAttachmentError(png, 0)).toBeNull()
    expect(getAttachmentError(png, ISSUE_ATTACHMENT_MAX_COUNT - 1)).toBeNull()
  })

  it('rechaza un cuarto adjunto mencionando el límite', () => {
    expect(getAttachmentError(png, ISSUE_ATTACHMENT_MAX_COUNT)).toContain('3')
  })

  it('rechaza un fichero de más de 2 MB mencionando el límite', () => {
    const error = getAttachmentError({ ...png, size: ISSUE_ATTACHMENT_MAX_BYTES + 1 }, 0)
    expect(error).toContain('2 MB')
  })

  it('acepta exactamente 2 MB', () => {
    expect(getAttachmentError({ ...png, size: ISSUE_ATTACHMENT_MAX_BYTES }, 0)).toBeNull()
  })

  it('rechaza un formato no admitido', () => {
    expect(getAttachmentError({ name: 'x.svg', size: 10, type: 'image/svg+xml' }, 0)).toContain(
      'PNG, JPEG, WebP o GIF',
    )
  })
})
