import { describe, expect, it } from 'vitest'

import { computeHasUpdates } from '../../src/domain/reports/report-updates'

const LAST_SEEN = '2026-10-20T10:00:00.000Z'

describe('computeHasUpdates', () => {
  it('no marca novedad sin cambios posteriores a la lectura', () => {
    expect(
      computeHasUpdates({
        lastSeenAt: LAST_SEEN,
        statusChangedAt: '2026-10-19T10:00:00.000Z',
        latestMaintainerCommentAt: LAST_SEEN,
      }),
    ).toBe(false)
  })

  it('marca un cierre posterior', () => {
    expect(
      computeHasUpdates({
        lastSeenAt: LAST_SEEN,
        statusChangedAt: '2026-10-21T10:00:00.000Z',
        latestMaintainerCommentAt: null,
      }),
    ).toBe(true)
  })

  it('marca un comentario del mantenedor posterior', () => {
    expect(
      computeHasUpdates({
        lastSeenAt: LAST_SEEN,
        statusChangedAt: null,
        latestMaintainerCommentAt: '2026-10-22T10:00:00.000Z',
      }),
    ).toBe(true)
  })

  it('ignora fechas ausentes o inválidas', () => {
    expect(
      computeHasUpdates({
        lastSeenAt: LAST_SEEN,
        statusChangedAt: 'no-es-fecha',
        latestMaintainerCommentAt: null,
      }),
    ).toBe(false)
  })

  it('no marca nada si la última lectura no es una fecha', () => {
    expect(
      computeHasUpdates({
        lastSeenAt: 'ayer',
        statusChangedAt: '2026-10-22T10:00:00.000Z',
        latestMaintainerCommentAt: null,
      }),
    ).toBe(false)
  })
})
