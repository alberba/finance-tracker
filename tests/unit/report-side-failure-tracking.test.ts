import { beforeEach, describe, expect, it, vi } from 'vitest'

// Se mockea el SDK para que el real nunca se cargue: lo que se fija aquí es lo
// que sale hacia Sentry y cuándo se inicializa en el destino Node.
const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  withScope: vi.fn(),
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}))

vi.mock('@sentry/cloudflare', () => sentry)

const setTag = vi.fn()
const setFingerprint = vi.fn()

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  sentry.withScope.mockImplementation(
    (
      handler: (scope: { setTag: typeof setTag; setFingerprint: typeof setFingerprint }) => void,
    ) => {
      // El scope expone solo setTag y setFingerprint: cualquier otro adjunto reventaría el test.
      handler({ setTag, setFingerprint })
    },
  )
})

async function loadTracking() {
  return import('../../src/lib/server/error-tracking')
}

describe('reportReportSideFailure', () => {
  it('manda un evento con mensaje fijo y solo la fase y el motivo como tags', async () => {
    const { reportReportSideFailure } = await loadTracking()

    reportReportSideFailure({ stage: 'duplicate', reason: 'http-401' })

    expect(setTag.mock.calls).toEqual([
      ['report.stage', 'duplicate'],
      ['report.reason', 'http-401'],
    ])
    expect(sentry.captureMessage).toHaveBeenCalledTimes(1)
    expect(sentry.captureMessage).toHaveBeenCalledWith(
      'Fallo auxiliar del reporte web (enrich: http-401)',
      'warning',
    )
  })

  it('agrupa por fase y motivo: cada combinación es su propia issue', async () => {
    const { reportReportSideFailure } = await loadTracking()

    reportReportSideFailure({ stage: 'enrich', reason: 'http-401' })
    reportReportSideFailure({ stage: 'upload', reason: 'http-403' })

    expect(setFingerprint.mock.calls).toEqual([
      [['report-side-failure', 'enrich', 'http-401']],
      [['report-side-failure', 'upload', 'http-403']],
    ])
  })

  it('no relanza si el SDK falla, y deja un log fijo', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    sentry.withScope.mockImplementation(() => {
      throw new Error('el SDK de Sentry falló')
    })
    const { reportReportSideFailure } = await loadTracking()

    expect(() => reportReportSideFailure({ stage: 'upload', reason: 'failed' })).not.toThrow()

    expect(consoleError).toHaveBeenCalledTimes(1)
    consoleError.mockRestore()
  })
})

describe('initServerErrorTracking', () => {
  it('sin DSN no inicializa nada', async () => {
    const { initServerErrorTracking } = await loadTracking()

    initServerErrorTracking(undefined)
    initServerErrorTracking('')

    expect(sentry.init).not.toHaveBeenCalled()
  })

  it('con DSN inicializa una sola vez, aunque se llame en cada petición', async () => {
    const { initServerErrorTracking } = await loadTracking()

    initServerErrorTracking('https://clave@sentry.example/1')
    initServerErrorTracking('https://clave@sentry.example/1')

    expect(sentry.init).toHaveBeenCalledTimes(1)
    expect(sentry.init.mock.calls[0]?.[0]).toMatchObject({
      dsn: 'https://clave@sentry.example/1',
      dataCollection: { userInfo: false, cookies: false, httpBodies: [] },
    })
  })

  it('arranca con el mismo contrato de privacidad: sin la integración Console', async () => {
    const { initServerErrorTracking } = await loadTracking()

    initServerErrorTracking('https://clave@sentry.example/1')

    const { integrations } = sentry.init.mock.calls[0]?.[0] as {
      integrations: (defaults: { name: string }[]) => { name: string }[]
    }
    expect(integrations([{ name: 'Console' }, { name: 'Http' }])).toEqual([{ name: 'Http' }])
  })

  it('no rompe la petición si el SDK falla al inicializar', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    sentry.init.mockImplementation(() => {
      throw new Error('init falló')
    })
    const { initServerErrorTracking } = await loadTracking()

    expect(() => initServerErrorTracking('https://clave@sentry.example/1')).not.toThrow()
    consoleError.mockRestore()
  })
})
