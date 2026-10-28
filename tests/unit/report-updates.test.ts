import { describe, expect, it } from 'vitest'

import { computeHasUpdates, scanCommentWindow } from '../../src/domain/reports/report-updates'
import type { RawComment } from '../../src/domain/reports/reporter-comment'

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

describe('scanCommentWindow', () => {
  const CONTEXT = { userId: 'user-1', botLogin: 'finance-bot' }

  function comment(overrides: Partial<RawComment> = {}): RawComment {
    return {
      databaseId: 1,
      createdAt: '2026-10-22T10:00:00.000Z',
      body: 'Lo revisamos.',
      author: { login: 'ana', __typename: 'User' },
      ...overrides,
    }
  }

  it('encuentra al mantenedor aunque la aclaración propia sea más reciente', () => {
    const window = scanCommentWindow(
      [
        comment(),
        comment({
          databaseId: 2,
          createdAt: '2026-10-23T10:00:00.000Z',
          body: '<!-- finance-tracker:reporter-comment user=user-1 -->\n**Aclaración del reportero**\n\nmía',
          author: { login: 'finance-bot', __typename: 'User' },
        }),
      ],
      LAST_SEEN,
      CONTEXT,
    )
    expect(window.latestMaintainerAt).toBe('2026-10-22T10:00:00.000Z')
    expect(window.covered).toBe(true)
  })

  it('pide la página anterior si toda la página es posterior a la lectura y no hay mantenedor', () => {
    const window = scanCommentWindow(
      [
        comment({
          databaseId: 2,
          body: '<!-- finance-tracker:reporter-comment user=user-1 -->\n**Aclaración del reportero**\n\nmía',
          author: { login: 'finance-bot', __typename: 'User' },
        }),
      ],
      LAST_SEEN,
      CONTEXT,
    )
    expect(window.latestMaintainerAt).toBeNull()
    expect(window.covered).toBe(false)
  })

  it('considera agotada la ventana al llegar a un comentario ya leído', () => {
    const window = scanCommentWindow(
      [comment({ createdAt: '2026-10-19T10:00:00.000Z' })],
      LAST_SEEN,
      CONTEXT,
    )
    expect(window.latestMaintainerAt).toBeNull()
    expect(window.covered).toBe(true)
  })

  it('no cuenta la automatización ni las aclaraciones de otras personas', () => {
    const window = scanCommentWindow(
      [
        comment({
          body: '<!-- web-report-agent-brief --> brief',
          author: { login: 'github-actions', __typename: 'Bot' },
        }),
        comment({
          databaseId: 3,
          body: '<!-- finance-tracker:reporter-comment user=otro -->\n**Aclaración del reportero**\n\notra',
          author: { login: 'finance-bot', __typename: 'User' },
        }),
      ],
      LAST_SEEN,
      CONTEXT,
    )
    expect(window.latestMaintainerAt).toBeNull()
  })
})
