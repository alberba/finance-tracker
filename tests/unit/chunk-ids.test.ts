import { describe, expect, it } from 'vitest'
import { MAX_SQL_VARIABLES_PER_STATEMENT, chunkIds } from '../../src/db/repositories/shared'

/**
 * FINANCE-TRACKER-7: `GET /api/bootstrap` 500s with `D1_ERROR: too many SQL
 * variables` because the batch loaders passed every id to a single
 * `inArray(...)`. `chunkIds` is the single splitting rule every unbounded
 * `inArray` in the repository layer now goes through.
 */
describe('chunkIds', () => {
  it('returns no chunks for an empty id list', () => {
    expect(chunkIds([])).toEqual([])
  })

  it('returns a single chunk when the ids fit exactly in one statement', () => {
    const ids = Array.from({ length: MAX_SQL_VARIABLES_PER_STATEMENT }, (_, index) => `id-${index}`)

    const chunks = chunkIds(ids)

    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toHaveLength(50)
    expect(chunks[0]).toEqual(ids)
  })

  it('splits one id over the ceiling into a full chunk plus a remainder', () => {
    const ids = Array.from({ length: 51 }, (_, index) => `id-${index}`)

    const chunks = chunkIds(ids)

    expect(chunks.map((chunk) => chunk.length)).toEqual([50, 1])
    expect(chunks[1]).toEqual(['id-50'])
  })
})
