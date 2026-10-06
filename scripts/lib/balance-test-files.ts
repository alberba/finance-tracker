export type TimedTestFile = { file: string; durationMs: number }

export function balanceTestFiles(files: TimedTestFile[], count: number): TimedTestFile[][] {
  if (!Number.isInteger(count) || count < 1) throw new Error('Shard count must be positive.')
  const shards: { files: TimedTestFile[]; duration: number }[] = Array.from(
    { length: count },
    () => ({
      files: [],
      duration: 0,
    }),
  )
  const longestFirst = [...files].sort(
    (a, b) => b.durationMs - a.durationMs || a.file.localeCompare(b.file),
  )
  for (const file of longestFirst) {
    const shortest = shards.reduce((a, b) => (a.duration <= b.duration ? a : b))
    shortest.files.push(file)
    shortest.duration += file.durationMs
  }
  return shards.map((shard) => shard.files)
}
