import { describe, expect, it } from 'vitest'
import {
  buildCodexPrompt,
  extractEnrichmentPayload,
  validateEnrichmentPayload,
} from '../../.github/scripts/issue-enrichment.mjs'

const validPayload = {
  title: 'El filtro de movimientos pierde el valor al cambiar de pestaña',
  body_markdown: [
    '## Problema',
    'El filtro desaparece al navegar.',
    '## Hipótesis técnica',
    'El estado no se conserva al cambiar de sección.',
    '## Alcance',
    'Revisar el store de movimientos.',
    '## Criterios de aceptación',
    '- [ ] El filtro se conserva al navegar.',
  ].join('\n\n'),
  labels_add: ['priority:med', 'area:frontend'],
  labels_keep: ['source:web-report', 'status:triage', 'bug'],
  labels_remove: ['enrich:pending'],
}

describe('issue enrichment helper', () => {
  it('extrae el marcador estructurado de Codex', () => {
    const output = `texto ignorado\n<!-- ENRICHMENT_RESULT_V1\n${JSON.stringify(validPayload)}\n-->`
    expect(extractEnrichmentPayload(output)).toEqual(validPayload)
  })

  it('acepta JSON en bloque fenced y valida prioridad/área', () => {
    const output = `\`\`\`json\n${JSON.stringify(validPayload)}\n\`\`\``
    const parsed = extractEnrichmentPayload(output)
    const result = validateEnrichmentPayload(parsed)
    expect(result.ok).toBe(true)
  })

  it('rechaza una salida sin prioridad o área', () => {
    const result = validateEnrichmentPayload({
      ...validPayload,
      labels_add: ['area:frontend'],
    })
    expect(result.ok).toBe(false)
  })

  it('compone prompt separando instrucciones y contexto', () => {
    const prompt = buildCodexPrompt('Instrucciones', 'Descripción del usuario')
    expect(prompt).toContain('Instrucciones')
    expect(prompt).toContain('---')
    expect(prompt).toContain('Descripción del usuario')
  })
})
