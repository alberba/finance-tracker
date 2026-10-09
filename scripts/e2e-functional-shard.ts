import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { balanceTestFiles } from './lib/balance-test-files'

type TestSuite = {
  specs?: { file: string; tests: unknown[] }[]
  suites?: TestSuite[]
}

const [shard, ...extraArgs] = process.argv.slice(2)
if (!/^\d+\/\d+$/.test(shard ?? '')) throw new Error('Usage: e2e-functional-shard.ts N/TOTAL')
const [current, total] = shard.split('/').map(Number)
if (current < 1 || current > total) throw new Error('Shard index must be between 1 and TOTAL.')

const history: Record<string, { durationMs: number; tests: number }> = JSON.parse(
  readFileSync('tests/e2e/functional-durations.json', 'utf8'),
)
const historical = Object.values(history)
const defaultDuration =
  historical.reduce((sum, item) => sum + item.durationMs, 0) /
  historical.reduce((sum, item) => sum + item.tests, 0)
const command = ['exec', 'playwright', 'test', '--grep-invert', '@visual']
const listing = spawnSync('pnpm', [...command, '--list', '--reporter=json'], { encoding: 'utf8' })
if (listing.status !== 0) {
  process.stderr.write(listing.stderr || listing.stdout)
  process.exit(listing.status ?? 1)
}

const report: TestSuite = JSON.parse(listing.stdout)
const files = new Map<string, number>()
function collectFiles(suite: TestSuite): void {
  for (const spec of suite.specs ?? []) {
    files.set(spec.file, (files.get(spec.file) ?? 0) + spec.tests.length)
  }
  for (const child of suite.suites ?? []) collectFiles(child)
}
collectFiles(report)

const shards = balanceTestFiles(
  [...files].map(([file, tests]) => ({
    file,
    durationMs:
      tests * (history[file] ? history[file].durationMs / history[file].tests : defaultDuration),
  })),
  total,
)
const selected = shards[current - 1]
if (!selected.length) throw new Error('The selected shard contains no tests.')
console.log(
  `Functional shard ${shard}: ${selected.length} files, estimated ${Math.round(selected.reduce((sum, file) => sum + file.durationMs, 0) / 1000)}s`,
)
const patterns = selected.map(({ file }) => `${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
const result = spawnSync('pnpm', [...command, ...patterns, ...extraArgs], { stdio: 'inherit' })
process.exit(result.status ?? 1)
