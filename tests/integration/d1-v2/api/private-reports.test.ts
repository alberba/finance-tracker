import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { POST as submit } from '../../../../src/pages/api/issues/report'
import { GET as file } from '../../../../src/pages/api/report-files/[id]'
import { DELETE as withdraw } from '../../../../src/pages/api/reports/[number]/diagnostic'
import { GET as support } from '../../../../src/pages/api/support/reports/[number]/index'
import { POST as grant } from '../../../../src/pages/api/support/reports/[number]/grant'
import { createTestDb, type TestDatabase } from '../setup'
import { seedUser } from '../repositories/fixtures'

let database: TestDatabase
vi.mock('../../../../src/db/client', () => ({ getDb: () => database.db }))
const sentry = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  setFingerprint: vi.fn(),
  setTag: vi.fn(),
  addEventProcessor: vi.fn(),
}))
vi.mock('@sentry/cloudflare', () => ({
  captureException: sentry.captureException,
  captureMessage: sentry.captureMessage,
  withScope: (callback: (scope: { setTag: typeof sentry.setTag }) => unknown) => callback(sentry),
}))

const submittedAt = '2026-08-01T10:00:00.000Z'
const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const diagnostic = {
  screen: 'transactions',
  capturedAt: submittedAt,
  version: '2.0.0',
  device: 'desktop',
  load: 'ready',
  sync: { revision: 5, pending: 1 },
  section: { subview: 'registry', checks: ['filters-reduce'], options: ['search'] },
  steps: ['import-complete', 'transactions', 'sync-pending'],
  sentryEventId: 'abcdef0123456789abcdef0123456789',
}
const payload = {
  type: 'bug',
  summary: 'Mi saldo privado es 300',
  description: 'Cuenta privada 1234',
  section: 'transactions',
  topic: 'missing',
  diagnostic,
  attachments: [{ name: 'captura-privada.png', contentType: 'image/png', data: png }],
}

function context(
  id?: string,
  options: { admin?: boolean; body?: unknown; number?: number; fileId?: string } = {},
) {
  return {
    params: { number: String(options.number ?? 42), id: options.fileId },
    request: new Request('https://finance.example.test', {
      method: options.body === undefined ? 'GET' : 'POST',
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    }),
    locals: {
      principal: id && { userId: id, email: 'private@example.test', isAdmin: options.admin },
      runtimeEnv: {
        GITHUB_OWNER: 'example',
        GITHUB_REPO: 'repo',
        GITHUB_ISSUE_TOKEN: 'token',
        BETTER_AUTH_SECRET: 'testing-report-recovery-key-for-issue-556',
      },
    },
  } as unknown as Parameters<typeof submit>[0]
}

let owner: string
let specialist: string
let other: string
let manager: string

beforeEach(async () => {
  database = createTestDb()
  ;[owner, specialist, other, manager] = await Promise.all(
    ['owner', 'specialist', 'other', 'manager'].map(
      async (name) => (await seedUser(database.db, `${name}@example.test`)).id,
    ),
  )
  vi.setSystemTime(new Date(submittedAt))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  database.close()
})

function githubSuccess(number = 42) {
  const request = vi.fn<typeof fetch>(async () =>
    Response.json(
      { number, html_url: `https://github.com/example/repo/issues/${number}` },
      { status: 201 },
    ),
  )
  vi.stubGlobal('fetch', request)
  return request
}

const assign = (number = 42, enabled = true) =>
  grant(context(manager, { admin: true, number, body: { supportUserId: specialist, enabled } }))

async function createCase(body: unknown = payload) {
  const request = githubSuccess()
  const response = await submit(context(owner, { body }))
  expect(response.status).toBe(201)
  expect(await response.json()).toMatchObject({ tracked: true, issueNumber: 42 })
  return request
}

const readGrantedCase = async () => {
  const response = await support(context(specialist, { admin: true }))
  expect(response.status).toBe(200)
  return (await response.json()).report
}

it('publishes only the reviewed summary and opaque reference to GitHub', async () => {
  const request = await createCase()
  expect(request).toHaveBeenCalledTimes(1)
  const published = JSON.parse(String(request.mock.calls[0][1]?.body))
  expect(published).toEqual({
    title: 'Datos ausentes en Movimientos',
    body: expect.stringMatching(
      /^## Reporte desde la web\n\nDatos ausentes en Movimientos\n\nReferencia del caso: [0-9a-f-]{36}\n\n<!-- web-report-private -->$/,
    ),
    labels: ['source:web-report', 'needs-triage', 'bug'],
    type: 'Bug',
  })
})

it('requires a grant for the case and its files, and denies access once it is revoked', async () => {
  await createCase()
  expect((await support(context())).status).toBe(401)
  expect((await support(context(specialist, { admin: true }))).status).toBe(404)
  const selfGrant = await grant(
    context(specialist, {
      admin: true,
      body: { supportUserId: specialist, enabled: true },
    }),
  )
  expect(selfGrant.status).toBe(403)
  expect((await assign()).status).toBe(200)
  githubSuccess(43)
  expect((await submit(context(other, { body: payload }))).status).toBe(201)
  expect((await support(context(specialist, { admin: true, number: 43 }))).status).toBe(404)
  expect((await support(context(other, { admin: true }))).status).toBe(404)
  expect((await support(context(specialist))).status).toBe(404)
  const open = await support(context(specialist, { admin: true }))
  expect(open.headers.get('Cache-Control')).toBe('no-store')
  const { report } = await open.json()
  expect(report).toMatchObject({
    title: payload.summary,
    original: payload.description,
    diagnostic,
    diagnosticExpiresAt: '2026-08-31T10:00:00.000Z',
  })
  const fileId = report.attachments[0].url.split('/').at(-1)
  expect((await file(context(other, { fileId }))).status).toBe(404)
  const ownerAttachment = await file(context(owner, { fileId }))
  expect(Buffer.from(await ownerAttachment.arrayBuffer()).toString('base64')).toBe(png)
  expect(
    (await file(context(specialist, { admin: true, fileId }))).headers.get('Content-Type'),
  ).toBe('image/png')
  expect((await assign(42, false)).status).toBe(200)
  expect((await support(context(specialist, { admin: true }))).status).toBe(404)
  expect((await file(context(specialist, { admin: true, fileId }))).status).toBe(404)
})

it('audits the case, actor and recipient when support grants, reads and revokes access', async () => {
  await createCase()
  await support(context(specialist, { admin: true }))
  await assign()
  await readGrantedCase()
  await assign(42, false)

  expect(
    database.sqlite
      .prepare(
        'select issue_number, actor_id, subject_id, action from report_support_audit order by rowid',
      )
      .all(),
  ).toEqual([
    { issue_number: 42, actor_id: specialist, subject_id: null, action: 'denied' },
    { issue_number: 42, actor_id: manager, subject_id: specialist, action: 'grant' },
    { issue_number: 42, actor_id: specialist, subject_id: null, action: 'read' },
    { issue_number: 42, actor_id: manager, subject_id: specialist, action: 'revoke' },
  ])
})

it('lets only the owner withdraw the diagnostic from a case', async () => {
  await createCase()
  await assign()
  expect((await withdraw(context(other))).status).toBe(404)
  expect((await readGrantedCase()).diagnostic).toEqual(diagnostic)
  expect((await withdraw(context(owner))).status).toBe(204)
  expect((await readGrantedCase()).diagnostic).toBeNull()
})

it('stops returning the capture at the exact 30-day expiry', async () => {
  await createCase()
  await assign()
  vi.setSystemTime(new Date('2026-08-31T09:59:59.999Z'))
  expect((await readGrantedCase()).diagnostic).toEqual(diagnostic)
  vi.setSystemTime(new Date('2026-08-31T10:00:00.000Z'))
  expect((await readGrantedCase()).diagnostic).toBeNull()
})

it('saves a private case when the reporter sends no capture', async () => {
  await createCase({ ...payload, diagnostic: undefined })
  await assign()
  expect(await readGrantedCase()).toMatchObject({ original: payload.description, diagnostic: null })
})

it('reports a submission failure to Sentry using only the fixed route, status and safe message', async () => {
  vi.stubGlobal('fetch', async () => new Response('upstream-private-token', { status: 401 }))
  const response = await submit(context(owner, { body: payload }))
  expect(response.status).toBe(500)
  expect(sentry.setTag.mock.calls).toEqual([
    ['api.route', '/api/issues/report'],
    ['http.response.status_code', '500'],
  ])
  expect(sentry.captureException.mock.calls).toEqual([
    [new Error('No se pudo crear el reporte web.')],
  ])
  const processEvent = sentry.addEventProcessor.mock.calls[0][0]
  expect(
    processEvent({
      level: 'error',
      request: { data: payload },
      user: { id: owner },
      extra: { diagnostic },
      contexts: { private: { account: '123' } },
      breadcrumbs: [{ data: { description: payload.description } }],
    }),
  ).toEqual({ level: 'error' })
})

it('recovers the case after a failed private save without creating a second GitHub issue', async () => {
  const request = githubSuccess()
  database.sqlite.exec(
    "create trigger fail_case before insert on issue_reports begin select raise(abort, 'write failed'); end",
  )
  const first = await submit(context(owner, { body: payload }))
  expect(first.status).toBe(201)
  const incomplete = await first.json()
  expect(incomplete).toMatchObject({ tracked: false, issueNumber: 42, receipt: expect.any(String) })

  database.sqlite.exec('drop trigger fail_case')
  const retry = { ...payload, receipt: incomplete.receipt }
  expect((await submit(context(other, { body: retry }))).status).toBe(400)
  const saved = await submit(context(owner, { body: retry }))
  expect(await saved.json()).toMatchObject({ tracked: true, issueNumber: 42 })
  expect(request).toHaveBeenCalledTimes(1)
  expect((await assign()).status).toBe(200)
  const response = await support(context(specialist, { admin: true }))
  expect(await response.json()).toMatchObject({ report: { diagnostic } })
})

it('rejects submissions without a session before contacting GitHub', async () => {
  const request = githubSuccess()
  expect((await submit(context(undefined, { body: payload }))).status).toBe(401)
  expect(request).not.toHaveBeenCalled()
})

it('rejects invalid report bodies without sending an incident to Sentry', async () => {
  const response = await submit(
    context(owner, { body: { ...payload, diagnostic: { screen: 'evil' } } }),
  )
  expect(response.status).toBe(400)
  expect(sentry.captureException).not.toHaveBeenCalled()
})
