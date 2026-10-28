import { describe, expect, it } from 'vitest'

import {
  AUTOMATION_MARKERS,
  buildReporterCommentBody,
  classifyComment,
  parseReporterComment,
  sanitizeReporterText,
} from '../../src/domain/reports/reporter-comment'

const USER = 'user-123'
const BOT = 'finance-bot'

function comment(body: string, login = BOT, type = 'User') {
  return {
    databaseId: 1,
    createdAt: '2026-10-01T00:00:00.000Z',
    body,
    author: { login, type },
  }
}

describe('buildReporterCommentBody / parseReporterComment', () => {
  it('hace ida y vuelta con texto y adjuntos', () => {
    const body = buildReporterCommentBody({
      userId: USER,
      text: 'Ocurre en móvil.',
      attachments: [
        { name: 'captura.png', url: 'https://github.com/user-attachments/assets/abc' },
        { name: 'otra.png', url: 'https://avatars.githubusercontent.com/u/1' },
      ],
    })

    expect(body.startsWith('<!-- finance-tracker:reporter-comment user=user-123 -->')).toBe(true)
    expect(body).toContain('**Aclaración del reportero**')
    expect(parseReporterComment(body)).toEqual({
      userId: USER,
      text: 'Ocurre en móvil.',
      attachments: [
        { name: 'captura.png', url: 'https://github.com/user-attachments/assets/abc' },
        { name: 'otra.png', url: 'https://avatars.githubusercontent.com/u/1' },
      ],
    })
  })

  it('hace ida y vuelta sin adjuntos', () => {
    const body = buildReporterCommentBody({ userId: USER, text: 'Solo texto' })
    expect(parseReporterComment(body)).toEqual({ userId: USER, text: 'Solo texto', attachments: [] })
  })

  it('exige el marcador al principio del cuerpo', () => {
    const body = `Hola\n${buildReporterCommentBody({ userId: USER, text: 'x' })}`
    expect(parseReporterComment(body)).toBeNull()
  })

  it('rechaza un userId inválido', () => {
    const body = `<!-- finance-tracker:reporter-comment user=bad id -->\n**Aclaración del reportero**\n\nx`
    expect(parseReporterComment(body)).toBeNull()
  })

  it('neutraliza comentarios HTML y menciones al construir y los revierte al leer', () => {
    const text = 'Mira <!-- oculto --> y avisa a @ana'
    const body = buildReporterCommentBody({ userId: USER, text })
    expect(body).not.toContain('<!-- oculto -->')
    expect(body).toContain('@\u200bana')
    expect(parseReporterComment(body)?.text).toBe(text)
  })

  it('es idempotente al sanear', () => {
    const once = sanitizeReporterText('<!-- x --> @ana')
    expect(sanitizeReporterText(once)).toBe(once)
  })

  it('descarta adjuntos de hosts no permitidos y limita a tres', () => {
    const body = [
      '<!-- finance-tracker:reporter-comment user=user-123 -->',
      '**Aclaración del reportero**',
      '',
      'texto',
      '',
      '<!-- finance-tracker:reporter-attachments -->',
      '![a](https://evil.example/a.png)',
      '![b](https://github.com/user-attachments/assets/b)',
      '![c](https://raw.githubusercontent.com/o/r/c.png)',
      '![d](https://objects.githubusercontent.com/d.png)',
      '![e](https://github.com/user-attachments/assets/e)',
    ].join('\n')

    expect(parseReporterComment(body)?.attachments.map((item) => item.name)).toEqual([
      'b',
      'c',
      'd',
    ])
  })
})

describe('classifyComment', () => {
  const context = { userId: USER, botLogin: BOT }

  it('clasifica la automatización por autor bot', () => {
    expect(classifyComment(comment('Cualquier cosa', 'ci-bot', 'Bot'), context)).toBe('automation')
  })

  it('clasifica la automatización por marcador conocido', () => {
    const body = `## Brief\n\n${AUTOMATION_MARKERS[0]}`
    expect(classifyComment(comment(body, 'someone'), context)).toBe('automation')
  })

  it('considera propia solo la aclaración con marcador propio y autor bot', () => {
    const body = buildReporterCommentBody({ userId: USER, text: 'mía' })
    expect(classifyComment(comment(body), context)).toBe('mine')
  })

  it('oculta una aclaración con marcador ajeno', () => {
    const body = buildReporterCommentBody({ userId: 'otra-persona', text: 'ajena' })
    expect(classifyComment(comment(body), context)).toBe('hidden')
  })

  it('oculta una aclaración con marcador propio pero autor distinto del bot', () => {
    const body = buildReporterCommentBody({ userId: USER, text: 'suplantada' })
    expect(classifyComment(comment(body, 'intruso'), context)).toBe('hidden')
  })

  it('deja como mantenedor un comentario normal', () => {
    expect(classifyComment(comment('Lo revisamos.', 'ana'), context)).toBe('maintainer')
  })
})
