import { describe, expect, it } from 'vitest'

import {
  buildBackfillPlan,
  formatBackfillPlan,
  parseReporterId,
} from '../../scripts/lib/reports-backfill-plan'

const USER = 'user-abc_1'

function body(identifier = USER, extra = ''): string {
  return [
    '## Reporte desde la web',
    '',
    '### Resumen',
    'Algo falla',
    '',
    '### Reportero',
    '- Nombre: Ana',
    '- Email: ana@example.com',
    `- Identificador: ${identifier}`,
    extra,
  ].join('\n')
}

describe('parseReporterId', () => {
  it('lee el identificador del bloque de reportero', () => {
    expect(parseReporterId(body())).toEqual({ ok: true, userId: USER })
  })

  it('acepta el bloque al final del cuerpo sin salto', () => {
    expect(
      parseReporterId('### Reportero\n- Nombre: A\n- Email: a@b.c\n- Identificador: u1'),
    ).toEqual({ ok: true, userId: 'u1' })
  })

  it('se salta una issue sin bloque', () => {
    expect(parseReporterId('### Resumen\nnada')).toEqual({ ok: false, reason: 'sin-bloque' })
    expect(parseReporterId(null)).toEqual({ ok: false, reason: 'sin-bloque' })
  })

  it('rechaza un bloque modificado', () => {
    expect(
      parseReporterId('### Reportero\n- Nombre: A\n- Email: a@b.c\n- Identificador: u1\n- Otro: x'),
    ).toEqual({ ok: false, reason: 'bloque-modificado' })
    expect(
      parseReporterId(
        '### Reportero\n- Nombre: A\n- Email: a@b.c\n- Identificador: u1\n- Identificador: u2',
      ),
    ).toEqual({ ok: false, reason: 'bloque-modificado' })
    expect(
      parseReporterId('### Reportero\n- Nombre: A\n- Email: a@b.c\n- Identificador: con espacios'),
    ).toEqual({ ok: false, reason: 'bloque-modificado' })
  })
})

describe('buildBackfillPlan', () => {
  const now = '2026-10-26T10:00:00.000Z'

  const issues = [
    { number: 1, created_at: '2026-01-01T00:00:00.000Z', body: body() },
    { number: 2, created_at: '2026-01-02T00:00:00.000Z', body: body('desconocido') },
    { number: 3, created_at: '2026-01-03T00:00:00.000Z', body: 'sin bloque' },
    { number: 4, created_at: '2026-01-04T00:00:00.000Z', body: body(), pull_request: {} },
  ]

  it('separa nuevas, presentes y saltadas', () => {
    const plan = buildBackfillPlan({
      issues,
      existing: [6],
      knownUserIds: [USER],
      now,
    })
    expect(plan.toInsert).toEqual([
      { userId: USER, issueNumber: 1, submittedAt: '2026-01-01T00:00:00.000Z', lastSeenAt: now },
    ])
    expect(plan.alreadyPresent).toEqual([])
    expect(plan.skipped).toEqual([
      { number: 2, reason: 'usuario-desconocido' },
      { number: 3, reason: 'sin-bloque' },
    ])
  })

  it('no repite lo que ya está presente', () => {
    const plan = buildBackfillPlan({
      issues: [issues[0]],
      existing: [1],
      knownUserIds: [USER],
      now,
    })
    expect(plan.toInsert).toEqual([])
    expect(plan.alreadyPresent).toEqual([1])
  })

  it('el informe lista las saltadas con su motivo', () => {
    const report = formatBackfillPlan(
      buildBackfillPlan({ issues, existing: [], knownUserIds: [USER], now }),
    )
    expect(report).toContain('Saltadas: 2')
    expect(report).toContain('#2 · el identificador no corresponde a ninguna cuenta')
    expect(report).toContain('#3 · sin bloque de reportero')
  })
})
