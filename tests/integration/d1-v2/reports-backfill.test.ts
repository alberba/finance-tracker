import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Effect } from 'effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runWithDb } from '../../../src/db/database'
import { Http } from '../../../src/lib/server/http'

import { createTestDb, type TestDatabase } from './setup'
import { seedUser } from './repositories/fixtures'
import {
  fetchWebReportIssues,
  runReportsBackfill,
  writeRemoteSql,
} from '../../../scripts/reports-backfill'

function issue(number: number, identifier: string, createdAt: string) {
  return {
    number,
    created_at: createdAt,
    body: [
      '### Resumen',
      'Algo',
      '',
      '### Reportero',
      '- Nombre: Ana',
      '- Email: ana@example.com',
      `- Identificador: ${identifier}`,
    ].join('\n'),
  }
}

describe('reports:backfill', () => {
  let testDb: TestDatabase

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    testDb.close()
    vi.restoreAllMocks()
  })

  it('pagina la API, ignora PRs y no escribe en simulación', async () => {
    const request = vi.fn(async (input: RequestInfo | URL) => {
      const page = new URL(String(input)).searchParams.get('page')
      if (page === '1') {
        return new Response(
          JSON.stringify([
            issue(1, 'u1', '2026-02-01T00:00:00.000Z'),
            { ...issue(2, 'u1', '2026-02-02T00:00:00.000Z'), pull_request: { url: 'x' } },
          ]),
          { status: 200 },
        )
      }
      return new Response('[]', { status: 200 })
    })

    const issues = await Effect.runPromise(
      fetchWebReportIssues({
        env: { GITHUB_ISSUE_TOKEN: 'token', GITHUB_OWNER: 'o', GITHUB_REPO: 'r' },
      }).pipe(Effect.provideService(Http, { request: request as unknown as typeof fetch })),
    )
    expect(issues.map((item) => item.number)).toEqual([1])
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('recupera las filas que faltan y es idempotente', async () => {
    const known = await seedUser(testDb.db, 'known@example.com')
    const issues = [
      issue(11, known.id, '2026-02-01T00:00:00.000Z'),
      issue(12, known.id, '2026-02-02T00:00:00.000Z'),
      { number: 13, created_at: '2026-02-03T00:00:00.000Z', body: 'sin bloque' },
      issue(14, 'no-existe', '2026-02-04T00:00:00.000Z'),
    ]

    const dry = await runWithDb(
      testDb.db,
      runReportsBackfill({ issues, now: '2026-10-26T00:00:00.000Z' }),
    )
    expect(dry.executed).toBe(false)
    expect(testDb.sqlite.prepare('SELECT COUNT(*) AS count FROM issue_reports').get()).toEqual({
      count: 0,
    })

    const first = await runWithDb(
      testDb.db,
      runReportsBackfill({
        issues,
        now: '2026-10-26T00:00:00.000Z',
        execute: true,
      }),
    )
    expect(first.inserted).toBe(2)
    expect(first.plan.skipped).toEqual([
      { number: 13, reason: 'sin-bloque' },
      { number: 14, reason: 'usuario-desconocido' },
    ])

    const second = await runWithDb(
      testDb.db,
      runReportsBackfill({
        issues,
        now: '2026-10-27T00:00:00.000Z',
        execute: true,
      }),
    )
    expect(second.inserted).toBe(0)
    expect(second.plan.alreadyPresent).toEqual([11, 12])
    const rows = testDb.sqlite
      .prepare('SELECT issue_number, last_seen_at FROM issue_reports ORDER BY issue_number')
      .all() as Array<{ issue_number: number; last_seen_at: string }>
    expect(rows).toEqual([
      { issue_number: 11, last_seen_at: '2026-10-26T00:00:00.000Z' },
      { issue_number: 12, last_seen_at: '2026-10-26T00:00:00.000Z' },
    ])
  })

  it('emite SQL remoto idempotente para D1', async () => {
    const plan = {
      toInsert: [
        {
          userId: 'u1',
          issueNumber: 1,
          submittedAt: '2026-01-01T00:00:00.000Z',
          lastSeenAt: '2026-10-26T00:00:00.000Z',
        },
      ],
      alreadyPresent: [],
      skipped: [],
    }
    const folder = mkdtempSync(join(tmpdir(), 'reports-backfill-'))
    const path = join(folder, 'backfill.sql')
    try {
      expect(writeRemoteSql(plan, path)).toBe(1)
      const sql = readFileSync(path, 'utf8')
      expect(sql).toContain('INSERT INTO issue_reports')
      expect(sql).toContain('ON CONFLICT DO NOTHING;')
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })
})
