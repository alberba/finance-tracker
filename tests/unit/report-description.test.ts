import { describe, expect, it } from 'vitest'

import { describeReport } from '../../src/domain/reports/report-description'

const PRIVATE = [
  '### Contexto de ejecución',
  '- Navegador: Chrome',
  '',
  '### Reportero',
  '- Email: a@example.com',
].join('\n')

describe('describeReport', () => {
  it('quita cabecera, contexto y reportero del original', () => {
    const original = `## Reporte desde la web\n\n### Resumen\nHola\n\n${PRIVATE}`

    expect(describeReport(original, null).original).toBe('### Resumen\nHola')
  })

  it('no repite la issue cuando solo difiere en lo privado y en saltos de línea', () => {
    const result = describeReport(
      `### Resumen\nHola\n\n${PRIVATE}`,
      `### Resumen\r\nHola\r\n\r\n\r\n\r\n${PRIVATE}`,
    )

    expect(result.issueDescription).toBeNull()
  })

  it('un encabezado ## posterior a una sección privada vuelve a ser visible', () => {
    const body = `${PRIVATE}\n\n## Notas\nVisible`

    expect(describeReport(null, body).issueDescription).toBe('## Notas\nVisible')
  })

  it('oculta los marcadores de la automatización', () => {
    const body = '<!-- web-report-enriched -->\n\nTexto'

    expect(describeReport(null, body).issueDescription).toBe('Texto')
  })

  it('sin original y sin cuerpo propio no devuelve nada', () => {
    expect(describeReport(null, null)).toEqual({ original: null, issueDescription: null })
  })
})
