// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as accountsRepository from '../../../../src/db/repositories/accounts'
import * as marketRepository from '../../../../src/db/repositories/market'
import { seedUser } from '../repositories/fixtures'
import { useMarketStore } from '../../../../src/stores/market'
import { useSettingsStore } from '../../../../src/stores/settings'
import { startRoundTrip, type RoundTrip } from './harness'
import { runWithDb } from '../../../../src/db/database'

describe('configuración de cotizaciones persistente', () => {
  let trip: RoundTrip
  beforeEach(async () => {
    trip = await startRoundTrip(async (db, userId) => {
      await runWithDb(db, accountsRepository.create(userId, {
        legacyId: 'crypto',
        name: 'Crypto',
        kind: 'investment',
        currency: 'EUR',
        openingBalance: 0,
      }))
    })
  })
  afterEach(() => trip.cleanup())

  it('conserva el símbolo, proveedor y títulos al reiniciar el cliente', async () => {
    let market = useMarketStore()
    market.addInstrument({
      investmentAssetId: 'crypto',
      type: 'crypto',
      symbol: 'BTC',
      market: '',
      currency: 'EUR',
      provider: 'yahoo',
    })
    expect((await trip.reload()).instruments).toHaveLength(1)
    market = useMarketStore()
    expect(market.instruments).toHaveLength(1)
    const id = market.instruments[0].id
    market.configureInstrumentSymbols(id, 'BTC', 'BTC-EUR')
    market.updateCurrentUnits(id, 0.09491284)
    await trip.reload()
    expect((await trip.reboot()).instruments).toEqual([
      expect.objectContaining({
        id,
        symbol: 'BTC',
        quoteSymbol: 'BTC-EUR',
        provider: 'yahoo',
        holdingUnits: 0.09491284,
        investmentAssetId: 'crypto',
      }),
    ])
  })

  it('conserva una configuración pendiente al reiniciar sin conexión y permite eliminarla', async () => {
    trip.setOffline(true)
    useMarketStore().addInstrument({
      investmentAssetId: 'crypto',
      type: 'crypto',
      symbol: 'BTC-EUR',
      market: '',
      currency: 'EUR',
      provider: 'yahoo',
    })
    const offline = await trip.reloadOffline()
    expect(offline.instruments).toHaveLength(1)
    expect(offline.instruments[0].symbol).toBe('BTC-EUR')
    trip.setOffline(false)
    const online = await trip.reload()
    expect(online.instruments).toHaveLength(1)
    useMarketStore().removeInstrument(online.instruments[0].id)
    expect((await trip.reload()).instruments).toHaveLength(0)
  })

  it('no permite asignar la cotización a una cuenta de otro usuario', async () => {
    const other = await seedUser(trip.testDb.db, 'other-quote-user@example.com')
    const account = (await runWithDb(trip.testDb.db, accountsRepository.listByUser(trip.userId)))[0]
    await expect(
      runWithDb(trip.testDb.db, marketRepository.createUserInstrument(other.id, {
        instrumentId: 'unmaterialized',
        alias: account.id,
        quoteConfig: {
          type: 'crypto',
          symbol: 'BTC-EUR',
          provider: 'yahoo',
          market: '',
          currency: 'EUR',
          active: true,
        },
      })),
    ).rejects.toThrow()
    expect(await runWithDb(trip.testDb.db, marketRepository.listUserInstrumentsByUser(other.id))).toEqual([])
  })

  it('elimina también la configuración al borrar su agrupación', async () => {
    useMarketStore().addInstrument({
      investmentAssetId: 'crypto',
      type: 'crypto',
      symbol: 'BTC-EUR',
      market: '',
      currency: 'EUR',
      provider: 'yahoo',
    })
    expect((await trip.reload()).instruments).toHaveLength(1)
    useSettingsStore().removeEntity('investmentAssets', 'crypto')
    expect((await trip.reload()).instruments).toHaveLength(0)
  })
})
