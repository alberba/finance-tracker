import { beforeEach, describe, expect, it, vi } from 'vitest'

// Sentry es el límite externo: un SDK falso recoge los eventos que saldrían hacia Sentry.
// El scope expone solo setTag y setFingerprint: cualquier otro adjunto reventaría el test.
interface SentryEvent {
  message: string
  level: string
  tags: Record<string, string>
  fingerprint?: string[]
}
const sentry = vi.hoisted(() => {
  const state = {
    events: [] as SentryEvent[],
    inits: [] as Array<Record<string, unknown>>,
    initFails: false,
    scopeFails: false,
  }
  let scope: { tags: Record<string, string>; fingerprint?: string[] } = { tags: {} }
  return {
    state,
    sdk: {
      init: (options: Record<string, unknown>) => {
        if (state.initFails) throw new Error('init falló')
        state.inits.push(options)
      },
      withScope: (
        handler: (scope: {
          setTag: (key: string, value: string) => void
          setFingerprint: (fingerprint: string[]) => void
        }) => void,
      ) => {
        if (state.scopeFails) throw new Error('el SDK de Sentry falló')
        const current: typeof scope = { tags: {} }
        scope = current
        handler({
          setTag: (key, value) => {
            current.tags[key] = value
          },
          setFingerprint: (fingerprint) => {
            current.fingerprint = fingerprint
          },
        })
      },
      captureMessage: (message: string, level: string) => {
        state.events.push({ message, level, ...scope })
      },
    },
  }
})

vi.mock('@sentry/cloudflare', () => sentry.sdk)

let logged: unknown[][]

beforeEach(() => {
  vi.resetModules()
  sentry.state.events = []
  sentry.state.inits = []
  sentry.state.initFails = false
  sentry.state.scopeFails = false
  logged = []
  vi.spyOn(console, 'error').mockImplementation((...args) => {
    logged.push(args)
  })
})

async function loadTracking() {
  return import('../../src/lib/server/error-tracking')
}

describe('reportReportSideFailure', () => {
  it('manda un evento con mensaje fijo y solo la fase y el motivo como tags', async () => {
    const { reportReportSideFailure } = await loadTracking()

    reportReportSideFailure({ stage: 'track', reason: 'http-401' })

    expect(sentry.state.events).toHaveLength(1)
    expect(sentry.state.events[0]).toMatchObject({
      message: 'Fallo auxiliar del reporte web (track: http-401)',
      level: 'warning',
      tags: { 'report.stage': 'track', 'report.reason': 'http-401' },
    })
    expect(Object.keys(sentry.state.events[0].tags)).toHaveLength(2)
  })

  it('agrupa por fase y motivo: cada combinación es su propia issue', async () => {
    const { reportReportSideFailure } = await loadTracking()

    reportReportSideFailure({ stage: 'track', reason: 'http-401' })
    reportReportSideFailure({ stage: 'upload', reason: 'http-403' })

    expect(sentry.state.events.map((event) => event.fingerprint)).toEqual([
      ['report-side-failure', 'track', 'http-401'],
      ['report-side-failure', 'upload', 'http-403'],
    ])
  })

  it('no relanza si el SDK falla, y deja un log fijo sin el texto del fallo', async () => {
    sentry.state.scopeFails = true
    const { reportReportSideFailure } = await loadTracking()

    expect(() => reportReportSideFailure({ stage: 'upload', reason: 'failed' })).not.toThrow()

    expect(logged).toEqual([['[api] No se pudo reportar a Sentry el fallo auxiliar del reporte.']])
  })
})

describe('initServerErrorTracking', () => {
  it('sin DSN no inicializa nada', async () => {
    const { initServerErrorTracking } = await loadTracking()

    initServerErrorTracking(undefined)
    initServerErrorTracking('')

    expect(sentry.state.inits).toEqual([])
  })

  it('con DSN inicializa una sola vez, aunque se llame en cada petición', async () => {
    const { initServerErrorTracking } = await loadTracking()

    initServerErrorTracking('https://clave@sentry.example/1')
    initServerErrorTracking('https://clave@sentry.example/1')

    expect(sentry.state.inits).toHaveLength(1)
    expect(sentry.state.inits[0]).toMatchObject({
      dsn: 'https://clave@sentry.example/1',
      dataCollection: { userInfo: false, cookies: false, httpBodies: [] },
    })
  })

  it('arranca con el mismo contrato de privacidad: sin la integración Console', async () => {
    const { initServerErrorTracking } = await loadTracking()

    initServerErrorTracking('https://clave@sentry.example/1')

    const { integrations } = sentry.state.inits[0] as {
      integrations: (defaults: { name: string }[]) => { name: string }[]
    }
    expect(integrations([{ name: 'Console' }, { name: 'Http' }])).toEqual([{ name: 'Http' }])
  })

  it('no rompe la petición si el SDK falla al inicializar, y deja un log fijo', async () => {
    sentry.state.initFails = true
    const { initServerErrorTracking } = await loadTracking()

    expect(() => initServerErrorTracking('https://clave@sentry.example/1')).not.toThrow()

    expect(logged).toEqual([['[api] No se pudo inicializar Sentry en el servidor.']])
  })
})
