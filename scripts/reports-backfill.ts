#!/usr/bin/env -S node
/**
 * `pnpm reports:backfill` (#340) — recupera la propiedad de los reportes que se
 * enviaron antes de que existiera `issue_reports`.
 *
 * Por defecto solo simula e imprime el plan; con `--execute` escribe. Es
 * idempotente: lo que ya está no se toca y puede ejecutarse varias veces.
 *
 * Uso:
 *   pnpm reports:backfill
 *   pnpm reports:backfill --execute --v2-sqlite=.data/finance-tracker-v2.sqlite
 *   pnpm reports:backfill --execute --remote-sql-out=.data/reports-backfill.sql
 */

import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import { runWithDb, transaction } from '../src/db/database'
import type { Db } from '../src/db/repositories/shared'
import * as issueReportsRepository from '../src/db/repositories/issue-reports'
import { nowIso } from '../src/db/repositories/shared'
import { issueReports, users } from '../src/db/schema'
import { uuidv7 } from '../src/lib/server/uuidv7'
import { openLocalV2Db } from './lib/local-v2-db'
import {
  buildBackfillPlan,
  formatBackfillPlan,
  type BackfillIssue,
  type BackfillPlan,
} from './lib/reports-backfill-plan'

const GITHUB_API_BASE = 'https://api.github.com'
const PER_PAGE = 100
const MAX_RATE_LIMIT_RETRIES = 3
const LABEL = 'source:web-report'

export interface BackfillEnv {
  GITHUB_ISSUE_TOKEN?: string
  GITHUB_TOKEN?: string
  GITHUB_OWNER?: string
  GITHUB_REPO?: string
}

interface RawIssue {
  number?: number
  created_at?: string
  body?: string | null
  pull_request?: unknown
}

function requiredEnv(env: BackfillEnv): { token: string; owner: string; repo: string } {
  const token = env.GITHUB_ISSUE_TOKEN || env.GITHUB_TOKEN
  const owner = env.GITHUB_OWNER
  const repo = env.GITHUB_REPO
  if (!token || !owner || !repo) {
    throw new Error(
      'Faltan credenciales de GitHub: define GITHUB_ISSUE_TOKEN (o GITHUB_TOKEN), GITHUB_OWNER y GITHUB_REPO.',
    )
  }
  return { token, owner, repo }
}

function rateLimitDelayMs(response: Response): number {
  const retryAfter = Number(response.headers.get('retry-after'))
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000
  const reset = Number(response.headers.get('x-ratelimit-reset'))
  if (Number.isFinite(reset) && reset > 0) {
    return Math.max(0, reset * 1000 - Date.now())
  }
  return 60_000
}

export async function fetchWebReportIssues(options: {
  request?: typeof fetch
  env: BackfillEnv
  sleep?: (ms: number) => Promise<void>
}): Promise<BackfillIssue[]> {
  const request = options.request ?? fetch
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))
  const { token, owner, repo } = requiredEnv(options.env)
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'finance-tracker-reports-backfill',
  }

  const issues: BackfillIssue[] = []
  for (let page = 1; ; page += 1) {
    const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/issues?${new URLSearchParams({
      labels: LABEL,
      state: 'all',
      per_page: String(PER_PAGE),
      page: String(page),
    })}`

    let response = await request(url, { headers })
    let retries = 0
    while (response.status === 403 && retries < MAX_RATE_LIMIT_RETRIES) {
      await sleep(rateLimitDelayMs(response))
      response = await request(url, { headers })
      retries += 1
    }
    if (!response.ok) {
      throw new Error(`GitHub devolvió ${response.status} al listar los reportes.`)
    }

    const pageIssues = (await response.json()) as RawIssue[]
    if (!Array.isArray(pageIssues) || pageIssues.length === 0) break
    for (const raw of pageIssues) {
      if (raw.pull_request || typeof raw.number !== 'number') continue
      issues.push({
        number: raw.number,
        created_at: raw.created_at ?? '',
        body: raw.body ?? null,
        pull_request: raw.pull_request,
      })
    }
  }
  return issues
}

async function readExisting(db: Db): Promise<number[]> {
  const rows = await db.select({ issueNumber: issueReports.issueNumber }).from(issueReports)
  return rows.map((row) => row.issueNumber)
}

async function readKnownUserIds(db: Db): Promise<string[]> {
  const rows = await db.select({ id: users.id }).from(users)
  return rows.map((row) => row.id)
}

export async function runReportsBackfill(options: {
  db: Db
  issues: BackfillIssue[]
  now?: string
  execute?: boolean
}): Promise<{ plan: BackfillPlan; inserted: number; executed: boolean }> {
  const now = options.now ?? nowIso()
  const plan = buildBackfillPlan({
    issues: options.issues,
    existing: await readExisting(options.db),
    knownUserIds: await readKnownUserIds(options.db),
    now,
  })

  if (!options.execute || plan.toInsert.length === 0) {
    return { plan, inserted: 0, executed: false }
  }

  const inserted = await runWithDb(
    options.db,
    transaction(issueReportsRepository.insertManyIfMissing(plan.toInsert)),
  )
  return { plan, inserted, executed: true }
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/** INSERT para D1, con ids nuevos: la fila de destino solo depende de (user, issue). */
export function buildRemoteSql(plan: BackfillPlan): string[] {
  return plan.toInsert.map((row) => {
    const values = [
      sqlLiteral(uuidv7()),
      sqlLiteral(row.userId),
      String(row.issueNumber),
      sqlLiteral(row.submittedAt),
      sqlLiteral(row.lastSeenAt),
    ]
    return `INSERT INTO issue_reports (id, user_id, issue_number, submitted_at, last_seen_at) VALUES (${values.join(', ')}) ON CONFLICT DO NOTHING;`
  })
}

export function writeRemoteSql(plan: BackfillPlan, outPath: string): number {
  const statements = buildRemoteSql(plan)
  const file = [
    '-- Generado por scripts/reports-backfill.ts (--remote-sql-out).',
    '-- Aplicar con: wrangler d1 execute finance-tracker-db-v2 --remote --file=<este fichero>',
    '',
    ...statements,
    '',
  ].join('\n')
  writeFileSync(outPath, file, 'utf8')
  return statements.length
}

const HELP = `
Uso: pnpm reports:backfill [opciones]

Recupera la propiedad de los reportes web anteriores a issue_reports leyendo el
bloque «### Reportero» de cada issue con label ${LABEL}.

Opciones:
  --v2-sqlite=<ruta>    Base SQLite v2 (por defecto: .data/finance-tracker-v2.sqlite)
  --execute             Aplica el plan (por defecto solo simula)
  --dry-run             Fuerza la simulación (sin escrituras)
  --json                Emite el plan en JSON; el texto humano va a stderr
  --remote-sql-out=<r>  Escribe el plan como INSERT ... ON CONFLICT DO NOTHING para D1
  --help                Muestra esta ayuda
`

async function main(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      'v2-sqlite': { type: 'string', default: '.data/finance-tracker-v2.sqlite' },
      execute: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      'remote-sql-out': { type: 'string' },
      help: { type: 'boolean', default: false },
    },
  })

  if (values.help) {
    console.log(HELP)
    return
  }

  const log = values.json ? console.error : console.log
  const issues = await fetchWebReportIssues({ env: process.env })
  const database = openLocalV2Db(values['v2-sqlite'] as string)
  try {
    const execute = values.execute && !values['dry-run']
    const result = await runReportsBackfill({ db: database.db, issues, execute })
    log(formatBackfillPlan(result.plan))
    if (result.executed) log(`Insertadas: ${result.inserted}`)
    if (values['remote-sql-out']) {
      const count = writeRemoteSql(result.plan, values['remote-sql-out'] as string)
      log(`SQL remoto escrito: ${count} sentencias en ${values['remote-sql-out']}`)
    }
    if (values.json) {
      console.log(
        JSON.stringify({ ...result.plan, inserted: result.inserted, executed: result.executed }),
      )
    }
  } finally {
    database.close()
  }
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (import.meta.url === entry) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
