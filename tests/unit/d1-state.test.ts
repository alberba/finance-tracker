import { describe, expect, it } from 'vitest'

import {
  loadStateFromD1,
  resetStateInD1,
  saveStateToD1,
  type D1DatabaseLike,
  type D1StatementLike,
} from '../../src/lib/server/d1-state'

type Row = { id: string; payload: string; updated_at: string; version: number }

/**
 * Minimal in-memory stand-in for the D1 driver: supports the exact SQL shapes
 * d1-state issues (CREATE TABLE, SELECT ... WHERE id, INSERT ... ON CONFLICT).
 */
function createFakeD1(): D1DatabaseLike {
  const rows = new Map<string, Row>()

  function makeStatement(sql: string): D1StatementLike {
    let bound: unknown[] = []
    const stmt: D1StatementLike = {
      bind(...values: unknown[]) {
        bound = values
        return stmt
      },
      async first() {
        if (sql.includes('SELECT')) {
          const id = String(bound[0])
          return rows.get(id) ?? null
        }
        return null
      },
      async run() {
        if (sql.includes('INSERT INTO app_state')) {
          const [id, payload, updated_at, version] = bound
          rows.set(String(id), {
            id: String(id),
            payload: String(payload),
            updated_at: String(updated_at),
            version: Number(version),
          })
        }
        return null
      },
    }
    return stmt
  }

  return {
    prepare(sql: string) {
      return makeStatement(sql)
    },
  }
}

describe('d1-state optimistic concurrency', () => {
  it('seeds a fresh namespace at version 1', async () => {
    const db = createFakeD1()
    const snapshot = await loadStateFromD1(db, 'default')
    expect(snapshot.version).toBe(1)
    expect(snapshot.state).toBeTruthy()
  })

  it('increments the version on each accepted write', async () => {
    const db = createFakeD1()
    const first = await saveStateToD1(db, 'default', { transactions: [1] }, undefined)
    expect(first).toMatchObject({ ok: true, version: 1 })

    const second = await saveStateToD1(db, 'default', { transactions: [1, 2] }, 1)
    expect(second).toMatchObject({ ok: true, version: 2 })

    const loaded = await loadStateFromD1(db, 'default')
    expect(loaded.version).toBe(2)
    expect(loaded.state).toEqual({ transactions: [1, 2] })
  })

  it('rejects a write whose baseVersion is stale (conflict)', async () => {
    const db = createFakeD1()
    await saveStateToD1(db, 'default', { v: 'a' }, undefined) // -> version 1
    await saveStateToD1(db, 'default', { v: 'b' }, 1) // -> version 2 (another device)

    // A client still on version 1 tries to save: must be rejected, not clobber.
    const outcome = await saveStateToD1(db, 'default', { v: 'stale' }, 1)
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.conflict).toBe(true)
      expect(outcome.current.version).toBe(2)
      expect(outcome.current.state).toEqual({ v: 'b' })
    }

    // Server data is untouched by the rejected write.
    const loaded = await loadStateFromD1(db, 'default')
    expect(loaded.state).toEqual({ v: 'b' })
    expect(loaded.version).toBe(2)
  })

  it('force-overwrites when baseVersion is undefined', async () => {
    const db = createFakeD1()
    await saveStateToD1(db, 'default', { v: 'a' }, undefined) // version 1
    await saveStateToD1(db, 'default', { v: 'b' }, 1) // version 2

    const outcome = await saveStateToD1(db, 'default', { v: 'forced' }, undefined)
    expect(outcome).toMatchObject({ ok: true, version: 3 })

    const loaded = await loadStateFromD1(db, 'default')
    expect(loaded.state).toEqual({ v: 'forced' })
  })

  it('reset bumps the version so other devices detect the change', async () => {
    const db = createFakeD1()
    await saveStateToD1(db, 'default', { v: 'a' }, undefined) // version 1
    const snapshot = await resetStateInD1(db, 'default')
    expect(snapshot.version).toBe(2)
  })

  it('keeps namespaces isolated', async () => {
    const db = createFakeD1()
    await saveStateToD1(db, 'default', { who: 'default' }, undefined)
    await saveStateToD1(db, 'other', { who: 'other' }, undefined)

    const a = await loadStateFromD1(db, 'default')
    const b = await loadStateFromD1(db, 'other')
    expect(a.state).toEqual({ who: 'default' })
    expect(b.state).toEqual({ who: 'other' })
  })
})
