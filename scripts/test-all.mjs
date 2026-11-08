import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

const started = performance.now()
const phases = []
const commands = [
  ['unit/component/integration', ['test']],
  ['functional/visual', ['exec', 'playwright', 'test', '--max-failures=0']],
  ['sync-v2', ['test:e2e:sync-v2']],
  ['authentication', ['test:e2e:auth']],
]
async function run([name, args, executable = 'pnpm']) {
  const start = performance.now()
  const child = spawn(executable, args, { stdio: 'inherit' })
  const status = await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', resolve)
  })
  phases.push({ name, seconds: (performance.now() - start) / 1000, status })
  return status === 0
}
// Canonical Linux fonts and native date controls are part of the pixel baseline.
// Vitest stays native; browser tests use the same image as CI on every desktop OS.
const browserOnly = process.argv.includes('--browser-only')
const native = Boolean(process.env.CI) || browserOnly
const selected = browserOnly ? commands.slice(1) : [commands[0]]
if (!browserOnly) {
  if (native) selected.push(...commands.slice(1))
  else {
    selected.push([
      'Linux browser suite',
      ['scripts/run-browser-linux.mjs', process.execPath, 'scripts/test-all.mjs', '--browser-only'],
      process.execPath,
    ])
  }
}
// Browser runtimes own separate databases, ports and Vite caches. Vitest runs
// first to keep its module transforms away from the browsers' CPU load.
if (browserOnly) await Promise.all(selected.map(run))
else if (await run(selected[0])) await Promise.all(selected.slice(1).map(run))
const seconds = (performance.now() - started) / 1000
const passed = phases.length === selected.length && phases.every(({ status }) => status === 0)
const date = new Date().toISOString()
const report = JSON.stringify(
  { date, seconds, passed, withinBudget: seconds <= 360, phases },
  null,
  2,
)
mkdirSync('.scratch/test-suite', { recursive: true })
writeFileSync(`.scratch/test-suite/${browserOnly ? 'browser-run' : 'last-run'}.json`, report)
writeFileSync(
  `.scratch/test-suite/${browserOnly ? 'browser' : 'full'}-${date.replace(/[:.]/g, '-')}.json`,
  report,
)
console.log(
  `Full suite: ${seconds.toFixed(1)}s / 360s; ${passed && seconds <= 360 ? 'passed' : 'failed'}`,
)
process.exitCode = passed && seconds <= 360 ? 0 : 1
