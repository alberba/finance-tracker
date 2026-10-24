import { describe, expect, it } from 'vitest'
import { parseIssueReportPayload } from '../../src/lib/server/issue-report-schema'

describe('issue report schema', () => {
  it('normaliza y valida payload válido', () => {
    const parsed = parseIssueReportPayload({
      type: 'bug',
      summary: '  Falla guardado\u0001  ',
      description: '  El sistema no guarda al recargar.  ',
      section: 'data',
      context: {
        userAgent: 'Browser',
        pathname: '/datos',
        timestamp: '2026-02-23T10:00:00.000Z',
      },
    })

    expect(parsed.summary).toBe('Falla guardado')
    expect(parsed.description).toBe('El sistema no guarda al recargar.')
  })

  it('normaliza enhancement legacy a feature', () => {
    const parsed = parseIssueReportPayload({
      type: 'enhancement',
      summary: 'Mejorar el resumen de incidencias',
      description: 'La issue necesita contexto técnico para poder revisarse.',
      section: 'reports',
      context: {},
    })

    expect(parsed.type).toBe('feature')
  })

  it('rechaza payload inválido', () => {
    expect(() =>
      parseIssueReportPayload({
        type: 'bug',
        summary: 'bad',
        description: 'corta',
        section: 'data',
        context: {},
      }),
    ).toThrow()
  })

  it('acepta un reporte sin descripción y la devuelve vacía', () => {
    const parsed = parseIssueReportPayload({
      type: 'bug',
      summary: 'Solo tiene resumen',
      section: 'reports',
      context: {},
    })

    expect(parsed.description).toBe('')
  })

  it('acepta una descripción vacía o solo con espacios', () => {
    const parsed = parseIssueReportPayload({
      type: 'feature',
      summary: 'Descripción en blanco',
      description: '   ',
      section: 'reports',
      context: {},
    })

    expect(parsed.description).toBe('')
  })

  it('conserva los saltos de línea y tabuladores de la descripción tal cual', () => {
    const parsed = parseIssueReportPayload({
      type: 'bug',
      summary: 'Descripción multilínea',
      description: 'Línea uno\n\n- detalle\tcon tabulador\r\nlínea final',
      section: 'reports',
      context: {},
    })

    expect(parsed.description).toBe('Línea uno\n\n- detalle\tcon tabulador\nlínea final')
  })

  it('sigue rechazando una descripción por encima de 8000 caracteres', () => {
    expect(() =>
      parseIssueReportPayload({
        type: 'bug',
        summary: 'Descripción demasiado larga',
        description: 'a'.repeat(8001),
        section: 'reports',
        context: {},
      }),
    ).toThrow()
  })

  it('descarta los campos retirados y cualquier dato de reportero que traiga el payload', () => {
    const parsed = parseIssueReportPayload({
      type: 'bug',
      summary: 'Campos antiguos del formulario',
      description: 'Texto libre que sí se conserva.',
      section: 'reports',
      context: {},
      expectedResult: 'esperado',
      actualResult: 'actual',
      stepsToReproduce: 'pasos',
      reporter: { userId: 'otro', email: 'otro@example.com', name: 'Otro' },
      email: 'otro@example.com',
    })

    expect(parsed).not.toHaveProperty('expectedResult')
    expect(parsed).not.toHaveProperty('actualResult')
    expect(parsed).not.toHaveProperty('stepsToReproduce')
    expect(parsed).not.toHaveProperty('reporter')
    expect(parsed).not.toHaveProperty('email')
    expect(parsed.description).toBe('Texto libre que sí se conserva.')
  })

  it('sigue aceptando el alias enhancement junto a los campos retirados', () => {
    const parsed = parseIssueReportPayload({
      type: 'enhancement',
      summary: 'Pestaña antigua sin descripción',
      section: 'reports',
      context: {},
      expectedResult: 'algo',
    })

    expect(parsed.type).toBe('feature')
    expect(parsed.description).toBe('')
  })
})
