import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { cpus, platform, arch } from 'node:os'
import { performance } from 'node:perf_hooks'

const iterations = Number(process.env.BENCHMARK_ITERATIONS ?? 5)
if (!Number.isInteger(iterations) || iterations < 1) {
  throw new Error('BENCHMARK_ITERATIONS must be a positive integer')
}

const compilers = ['typescript', 'typescript-native']
const flags = [
  '--noEmit',
  '-p',
  'tsconfig.native.json',
  '--incremental',
  'false',
  '--extendedDiagnostics',
]

function measure(compiler) {
  const start = performance.now()
  const result = spawnSync(process.execPath, [`node_modules/${compiler}/bin/tsc`, ...flags], {
    encoding: 'utf8',
  })
  const wallMs = performance.now() - start
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${compiler} failed (${result.status}):\n${result.stdout}\n${result.stderr}`)
  }
  const memory = result.stdout.match(/Memory used:\s+([\d.]+)K/)
  return { wallMs, compilerMemoryKiB: memory ? Number(memory[1]) : null }
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

// Warm filesystem caches, then alternate order to reduce ordering bias.
for (const compiler of compilers) measure(compiler)
const samples = Object.fromEntries(compilers.map((compiler) => [compiler, []]))
for (let iteration = 0; iteration < iterations; iteration++) {
  const order = iteration % 2 ? [...compilers].reverse() : compilers
  for (const compiler of order) samples[compiler].push(measure(compiler))
}

const results = Object.fromEntries(
  compilers.map((compiler) => [
    compiler,
    {
      version: JSON.parse(readFileSync(`node_modules/${compiler}/package.json`, 'utf8')).version,
      medianWallMs: median(samples[compiler].map((sample) => sample.wallMs)),
      samples: samples[compiler],
    },
  ]),
)

console.log(
  JSON.stringify(
    {
      environment: {
        node: process.version,
        platform: platform(),
        arch: arch(),
        cpu: cpus()[0]?.model,
        cores: cpus().length,
      },
      config: 'tsconfig.native.json',
      flags,
      iterations,
      results,
      speedup: results.typescript.medianWallMs / results['typescript-native'].medianWallMs,
      memoryNote: 'Compiler-reported memory is not peak RSS; JS and Go accounting differ.',
    },
    null,
    2,
  ),
)
