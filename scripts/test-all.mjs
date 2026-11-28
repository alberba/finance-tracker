import { spawn } from 'node:child_process'
import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs'
import { loadavg } from 'node:os'

const started = performance.now()
const loadAtStart = loadavg()[0]
const phases = []
// Each phase keeps its full output: a failed run must say which phase failed and why.
const reportDir = '.scratch/test-suite'
const logStamp = new Date().toISOString().replace(/[:.]/g, '-')
mkdirSync(reportDir, { recursive: true })
const commands = [
  ['unit/component/integration', ['test']],
  ['functional', ['exec', 'playwright', 'test', '--max-failures=0']],
  ['sync-v2', ['test:e2e:sync-v2']],
  ['authentication', ['test:e2e:auth']],
]
async function run([name, args, executable = 'pnpm']) {
  const start = performance.now()
  const slug = name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  const log = createWriteStream(`${reportDir}/${logStamp}-${slug}.log`)
  const child = spawn(executable, args, { stdio: ['inherit', 'pipe', 'pipe'] })
  for (const [stream, output] of [
    [child.stdout, process.stdout],
    [child.stderr, process.stderr],
  ]) {
    stream.on('data', (chunk) => {
      output.write(chunk)
      log.write(chunk)
    })
  }
  const status = await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', resolve)
  })
  log.end()
  phases.push({ name, seconds: (performance.now() - start) / 1000, status })
  return status === 0
}
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
// A run on a busy machine says little about the budget: record the load beside the time.
const load = { start: loadAtStart, end: loadavg()[0] }
const failed = phases.filter(({ status }) => status !== 0).map(({ name }) => name)
const report = JSON.stringify(
  { date, seconds, passed, withinBudget: seconds <= 360, load, failed, phases },
  null,
  2,
)
writeFileSync(`${reportDir}/${browserOnly ? 'browser-run' : 'last-run'}.json`, report)
writeFileSync(
  `${reportDir}/${browserOnly ? 'browser' : 'full'}-${date.replace(/[:.]/g, '-')}.json`,
  report,
)
console.log(
  `Full suite: ${seconds.toFixed(1)}s / 360s; ${passed && seconds <= 360 ? 'passed' : 'failed'}; ` +
    `load ${load.start.toFixed(1)} -> ${load.end.toFixed(1)}` +
    (failed.length ? `; failed phases: ${failed.join(', ')}` : ''),
)
process.exitCode = passed && seconds <= 360 ? 0 : 1
