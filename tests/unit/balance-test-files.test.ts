import { describe, expect, it } from 'vitest'
import { balanceTestFiles } from '../../scripts/lib/balance-test-files'

describe('functional CI sharding', () => {
  it('balances time rather than alphabetical order and runs every file exactly once', () => {
    const files = [10, 9, 8, 7].map((durationMs, index) => ({
      file: `${index}.spec.ts`,
      durationMs,
    }))
    const shards = balanceTestFiles(files, 2)
    expect(shards.map((shard) => shard.reduce((sum, file) => sum + file.durationMs, 0))).toEqual([
      17, 17,
    ])
    expect(
      shards
        .flat()
        .map((file) => file.file)
        .sort(),
    ).toEqual(files.map((file) => file.file))
    expect(files.map((file) => file.durationMs)).toEqual([10, 9, 8, 7])
  })

  it('keeps new files when there are more runners than files', () => {
    const files = [{ file: 'new.spec.ts', durationMs: 1000 }]
    expect(balanceTestFiles(files, 3).flat()).toEqual(files)
  })
})
