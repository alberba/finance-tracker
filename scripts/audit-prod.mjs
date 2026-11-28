// `bun audit` has no `--prod`: audit the whole tree and keep only the high and critical
// advisories whose vulnerable range matches a version reachable from `dependencies` in
// bun.lock. Runs on Bun (`bun scripts/audit-prod.mjs`) for its semver matcher.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// Fixed by patchedDependencies in package.json; the audit cannot inspect local patches.
// Remove this exception and the patch when upstream publishes a fixed release.
const IGNORED = ['GHSA-ch52-4w7c-c8xp']
const FAILING = new Set(['high', 'critical'])

const semver = globalThis.Bun?.semver
if (!semver) throw new Error('Ejecuta este script con bun: bun run audit:prod.')

// bun.lock is JSON with trailing commas.
const lock = JSON.parse(readFileSync('bun.lock', 'utf8').replace(/,(\s*[}\]])/g, '$1'))

// A dependency resolves like Node: the nested key under its parent first, then up the path.
function resolve(path, name) {
  for (let depth = path.length; depth >= 0; depth--) {
    const candidate = [...path.slice(0, depth), name]
    if (lock.packages[candidate.join('/')]) return candidate
  }
  return undefined
}

/** Package name → versions installed for production. */
const production = new Map()
const visited = new Set()
const pending = Object.keys(lock.workspaces[''].dependencies ?? {}).map((name) => [name])
while (pending.length) {
  const path = pending.pop()
  const key = path.join('/')
  if (visited.has(key)) continue
  visited.add(key)
  const entry = lock.packages[key]
  const at = entry[0].lastIndexOf('@')
  const name = entry[0].slice(0, at)
  production.set(name, (production.get(name) ?? new Set()).add(entry[0].slice(at + 1)))
  const meta = entry.find((part) => part && typeof part === 'object' && !Array.isArray(part)) ?? {}
  // Optional peers are not installed for this package; a production package that needs one
  // depends on it directly.
  const optionalPeers = new Set(meta.optionalPeers ?? [])
  for (const group of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const dependency of Object.keys(meta[group] ?? {})) {
      if (group === 'peerDependencies' && optionalPeers.has(dependency)) continue
      const child = resolve(path, dependency)
      if (child) pending.push(child)
    }
  }
}

const audit = spawnSync('bun', ['audit', '--json', ...IGNORED.map((id) => `--ignore=${id}`)], {
  encoding: 'utf8',
})
if (audit.error) throw audit.error
// `bun audit` exits 1 when it finds any advisory; without a report that exit is a failed audit
// (registry unreachable, bad lockfile), never a pass.
if (audit.status !== 0 && !audit.stdout.trim()) {
  throw new Error(`bun audit falló (código ${audit.status}): ${audit.stderr.trim()}`)
}
const report = audit.stdout.trim() ? JSON.parse(audit.stdout) : {}
const findings = Object.entries(report).flatMap(([name, advisories]) => {
  const versions = [...(production.get(name) ?? [])]
  return advisories
    .filter((advisory) => FAILING.has(advisory.severity))
    .filter((advisory) =>
      versions.some((version) => semver.satisfies(version, advisory.vulnerable_versions)),
    )
    .map((advisory) => `${advisory.severity}\t${name}\t${advisory.title}\t${advisory.url}`)
})
console.log(`Production audit: ${findings.length} high or critical advisories.`)
if (findings.length) {
  console.log(findings.join('\n'))
  process.exitCode = 1
}
