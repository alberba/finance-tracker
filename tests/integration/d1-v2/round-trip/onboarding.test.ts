// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { syncSettingsUpdate } from '../../../../src/lib/client/command-mapping'
import * as settingsRepository from '../../../../src/db/repositories/user-settings'
import { startRoundTrip, type RoundTrip } from './harness'
import { runWithDb } from '../../../../src/db/database'

const progress = {
  onboardingPresented: true,
  onboardingDismissed: true,
  onboardingAccountCompleted: true,
  onboardingMovementCompleted: true,
  onboardingCompleted: true,
}

describe('onboarding settings round trip', () => {
  let trip: RoundTrip
  beforeEach(async () => {
    trip = await startRoundTrip()
  })
  afterEach(() => trip.cleanup())

  it('defaults old or absent settings to an unpresented welcome', async () => {
    expect(await trip.reload()).toMatchObject(
      Object.fromEntries(Object.keys(progress).map((key) => [key, false])),
    )
  })

  it('persists all milestones across reloads and preserves them on unrelated updates', async () => {
    await syncSettingsUpdate(progress)
    expect(await trip.reload()).toMatchObject(progress)
    await syncSettingsUpdate({ currency: 'USD' })
    expect(await trip.reload()).toMatchObject({ ...progress, currency: 'USD' })
    expect(await runWithDb(trip.testDb.db, settingsRepository.get(trip.userId))).toMatchObject(
      Object.fromEntries(Object.keys(progress).map((key) => [key, 1])),
    )
  })

  it('keeps queued flags visible after restarting offline and syncs explicit false', async () => {
    trip.setOffline(true)
    await syncSettingsUpdate(progress)
    expect(await trip.reloadOffline()).toMatchObject(progress)
    trip.setOffline(false)
    await trip.reload()
    await syncSettingsUpdate({ onboardingDismissed: false })
    expect(await trip.reload()).toMatchObject({ ...progress, onboardingDismissed: false })
  })

  it('recognizes stale boolean patches already held by another device as replay', async () => {
    await syncSettingsUpdate(progress)
    await trip.reload()
    const { applySyncBatch } = await import('../../../../src/lib/server/sync/apply-command')
    const result = await runWithDb(trip.testDb.db, applySyncBatch(trip.userId, [
      {
        commandId: 'onboarding-replay',
        action: 'settingsUpdate',
        baseVersion: 0,
        patch: progress,
      },
    ]))
    expect(result.results[0].status).toBe('noop')
  })
})
