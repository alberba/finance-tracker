import { describe, expect, it } from 'vitest'
import { applyRemoteChanges, emptyReadModel } from '../../src/lib/client/sync-read-model'

describe('settings responses arriving out of order', () => {
  it('keeps newer welcome progress when an older acknowledgement arrives', () => {
    const model = { ...emptyReadModel(), settings: { version: 3, onboardingCompleted: 1 } }
    const next = applyRemoteChanges(
      model,
      [
        {
          entityType: 'userSettings',
          entityId: 'user',
          changeType: 'update',
          payload: JSON.stringify({ version: 2, onboardingCompleted: 0 }),
        },
      ],
      4,
    )
    expect(next.settings).toEqual(model.settings)
    expect(next.revision).toBe(4)
  })

  it('applies newer settings received from another device', () => {
    const model = { ...emptyReadModel(), settings: { version: 2, onboardingCompleted: 0 } }
    const next = applyRemoteChanges(
      model,
      [
        {
          entityType: 'userSettings',
          entityId: 'user',
          changeType: 'update',
          payload: JSON.stringify({ version: 3, onboardingCompleted: 1 }),
        },
      ],
      4,
    )
    expect(next.settings).toEqual({ version: 3, onboardingCompleted: 1 })
  })
})
