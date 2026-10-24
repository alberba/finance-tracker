import { execFileSync } from 'node:child_process'
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { findIssueCandidates } from '../../src/lib/server/issue-duplicates.ts'

const BRIEF_MARKER = '<!-- web-report-agent-brief -->'
const BODY_MARKER = '<!-- web-report-enriched -->'
const planSchema = z
  .object({
    body: z
      .string()
      .trim()
      .min(20)
      .max(24_000)
      .refine((body) => /^## /m.test(body)),
    brief: z
      .string()
      .trim()
      .max(32_000)
      .refine((text) => text.startsWith('## Agent Brief\n') && /- \[ \] \S/.test(text)),
    duplicate: z
      .object({
        number: z.number().int().positive(),
        reason: z.string().trim().min(1).max(280),
      })
      .nullable(),
    category: z.enum(['bug', 'feature', 'task', 'epic']),
    triage: z.object({
      status: z.enum(['ready-for-agent', 'needs-info', 'needs-triage', 'ready-for-human']),
      reason: z.string().trim().min(1).max(2_000),
    }),
    pendingDecisions: z.array(z.string().trim().min(1).max(2_000)).max(20),
    relatedNumbers: z.array(z.number().int().positive()).max(20),
    uiChange: z.boolean(),
  })
  .refine(
    (plan) => plan.triage.status !== 'ready-for-agent' || plan.pendingDecisions.length === 0,
    'Una issue con decisiones pendientes no está lista para un agente.',
  )
  .refine(
    (plan) =>
      !['needs-info', 'ready-for-human'].includes(plan.triage.status) ||
      plan.pendingDecisions.length > 0,
    'Un bloqueo de información o intervención humana debe concretar las decisiones pendientes.',
  )

const TYPE_LABELS = new Set([
  'bug',
  'feature',
  'task',
  'epic',
  'enhancement',
  'type:bug',
  'type:feature',
  'type:enhancement',
  'type:task',
  'type:epic',
])
const TRIAGE_LABELS = new Set([
  'status:triage',
  'needs-triage',
  'needs-info',
  'ready-for-agent',
  'ready-for-human',
  'wontfix',
  'needs-discussion',
])

export function buildTriageLabels(plan, labels) {
  const retained = labels
    .map((label) => (typeof label === 'string' ? label : label.name))
    .filter((name) => !TYPE_LABELS.has(name) && !TRIAGE_LABELS.has(name) && name !== 'ui-change')
  return [
    ...new Set([
      ...retained,
      plan.category,
      ...(plan.duplicate ? [] : [plan.triage.status]),
      ...(plan.category === 'feature' && plan.uiChange ? ['ui-change'] : []),
    ]),
  ]
}

function discussionSnapshot(comments) {
  return comments
    .filter((comment) => !(comment.user?.type === 'Bot' && comment.body?.includes(BRIEF_MARKER)))
    .map((comment) => ({ id: comment.id, body: comment.body }))
}

async function readComments(endpoint, api = async (...args) => github(...args)) {
  const comments = []
  for (let page = 1; ; page += 1) {
    const items = await api(`${endpoint}/comments?per_page=100&page=${page}`)
    comments.push(...items)
    if (items.length < 100) return comments
  }
}

/** Metadata stays in GitHub and in a private snapshot outside the agent's checkout. */
export function splitReportBody(body) {
  const start = body.search(/^### (?:Adjuntos|Contexto de ejecución|Reportero)\s*$/m)
  return start < 0
    ? { report: body, preserved: '' }
    : { report: body.slice(0, start).trim(), preserved: body.slice(start).trim() }
}

export function parseAgentPlan(events) {
  let text = ''
  let completed = false
  let loadedSkill = false
  let readCode = false
  let readDiscussion = false
  for (const line of events.split('\n').filter(Boolean)) {
    const event = JSON.parse(line)
    if (event.type === 'error') throw new Error('OpenCode no pudo completar el análisis.')
    // Intermediate text is discarded when the agent starts another tool iteration.
    if (event.type === 'step_start') {
      text = ''
      completed = false
    }
    if (event.type === 'step_finish') completed = event.part?.reason === 'stop'
    if (event.type === 'tool_use' && event.part?.state?.status === 'completed') {
      const { tool, state } = event.part
      if (tool === 'skill' && state.input?.name === 'create-issue') loadedSkill = true
      if (tool === 'read' && typeof state.input?.filePath === 'string') {
        const path = resolve(state.input.filePath)
        if (path.startsWith(`${resolve('src')}${sep}`)) readCode = true
        if (path === resolve('.scratch/issue-enrichment/discussion.json')) readDiscussion = true
      }
    }
    if (event.type === 'text') text += event.part?.text ?? ''
  }
  if (!completed || !loadedSkill || !readCode || !readDiscussion)
    throw new Error(
      'El análisis debe terminar, cargar la skill y leer el código y la discusión antes de publicar.',
    )
  return planSchema.parse(JSON.parse(text.trim()))
}

/** Only numbers actually retrieved by the workflow become GitHub references. */
export function composeEnrichedBody(plan, snapshot, briefUrl) {
  const related = snapshot.candidates.issues.filter(
    (issue) =>
      plan.relatedNumbers.includes(issue.number) && issue.number !== plan.duplicate?.number,
  )
  return [
    BODY_MARKER,
    plan.body,
    ...(!plan.duplicate && plan.triage.status !== 'ready-for-agent'
      ? [
          '## Decisiones pendientes',
          ...(plan.pendingDecisions.length > 0
            ? plan.pendingDecisions.map((decision) => `- ${decision}`)
            : [plan.triage.reason]),
        ]
      : []),
    ...(related.length > 0
      ? [
          `## Issues relacionadas\n\n${related
            .map(
              (issue) =>
                `- https://github.com/${snapshot.repository}/issues/${issue.number} (${issue.state}).`,
            )
            .join('\n')}`,
        ]
      : []),
    splitReportBody(snapshot.issue.body)
      .preserved.split('\n')
      .filter(
        (line) =>
          !snapshot.existingBriefUrl ||
          line.trim() !== `[Agent Brief](${snapshot.existingBriefUrl})`,
      )
      .join('\n')
      .trim(),
    `[Agent Brief](${briefUrl})`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

function gh(args, input) {
  const output = execFileSync('gh', args, {
    encoding: 'utf8',
    input: input === undefined ? undefined : JSON.stringify(input),
    maxBuffer: 4 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  return output.trim() ? JSON.parse(output) : null
}

function github(endpoint, method = 'GET', body) {
  return gh(
    ['api', endpoint, '--method', method, ...(body === undefined ? [] : ['--input', '-'])],
    body,
  )
}

function identity() {
  const repository = process.env.GITHUB_REPOSITORY ?? ''
  const number = Number(process.env.ISSUE_NUMBER)
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !Number.isSafeInteger(number) || number <= 0) {
    throw new Error('Repositorio o número de issue inválido.')
  }
  return { repository, number, endpoint: `repos/${repository}/issues/${number}` }
}

function paths() {
  if (!process.env.RUNNER_TEMP) throw new Error('Falta RUNNER_TEMP.')
  return {
    privateDir: resolve(process.env.RUNNER_TEMP, 'issue-enrichment'),
    contextDir: resolve('.scratch', 'issue-enrichment'),
  }
}

async function prepare() {
  const { repository, number, endpoint } = identity()
  const issue = github(endpoint)
  if (!issue.labels.some((label) => label.name === 'source:web-report')) {
    throw new Error('La issue no es un reporte web.')
  }
  const reprocess = process.env.REPROCESS_REPORT === 'true'
  if (issue.state !== 'open' || (issue.body?.startsWith(`${BODY_MARKER}\n`) && !reprocess)) {
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, 'skip=true\n')
    return
  }
  const discussion = await readComments(endpoint)
  const existingBrief = discussion.find(
    (comment) => comment.user?.type === 'Bot' && comment.body?.includes(BRIEF_MARKER),
  )
  const labelNames = github(`repos/${repository}/labels?per_page=100`).map((label) => label.name)
  const [owner, repo] = repository.split('/')
  const { report } = splitReportBody(issue.body ?? '')
  const candidates = await findIssueCandidates(
    {
      type: issue.labels.some((label) => label.name === 'bug') ? 'bug' : 'feature',
      summary: issue.title,
      description: report,
      section: '',
      pathname: '',
    },
    { GITHUB_ISSUE_TOKEN: process.env.GH_TOKEN, GITHUB_OWNER: owner, GITHUB_REPO: repo },
    fetch,
  )
  candidates.issues = candidates.issues.filter((candidate) => candidate.number !== number)
  if (candidates.issues.length > 10) candidates.status = 'partial'
  const withComments = []
  for (const candidate of candidates.issues.slice(0, 10)) {
    let comments = []
    try {
      const data = github(`repos/${repository}/issues/${candidate.number}/comments?per_page=10`)
      comments = data.map((comment) => splitReportBody(comment.body).report.slice(0, 4_000))
      if (data.length >= 10 || data.some((comment) => comment.body.length > 4_000)) {
        candidates.status = 'partial'
      }
    } catch {
      candidates.status = 'partial'
    }
    withComments.push({ ...candidate, comments })
  }
  candidates.issues = withComments
  const { privateDir, contextDir } = paths()
  await mkdir(privateDir, { recursive: true, mode: 0o700 })
  await mkdir(contextDir, { recursive: true, mode: 0o700 })
  await writeFile(
    resolve(privateDir, 'snapshot.json'),
    JSON.stringify({
      repository,
      issue,
      candidates,
      reprocess,
      discussion: discussionSnapshot(discussion),
      existingBriefUrl: existingBrief?.html_url,
      labelNames,
    }),
    { mode: 0o600 },
  )
  await writeFile(
    resolve(contextDir, 'discussion.json'),
    JSON.stringify(
      discussion.map((comment) => ({
        id: comment.id,
        source:
          comment.user?.type === 'Bot' && comment.body?.includes(BRIEF_MARKER)
            ? 'previous-agent-brief'
            : 'discussion',
        body: splitReportBody(comment.body).report,
      })),
      null,
      2,
    ),
    { mode: 0o600 },
  )
  await writeFile(resolve(contextDir, 'candidates.json'), JSON.stringify(candidates, null, 2), {
    mode: 0o600,
  })
  await writeFile(
    resolve(contextDir, 'context.json'),
    JSON.stringify(
      {
        repository,
        report: {
          number,
          title: issue.title,
          body: report.replace(BODY_MARKER, '').trim(),
          labels: issue.labels.map((label) => label.name),
        },
        discussionFile: '.scratch/issue-enrichment/discussion.json',
        candidatesFile: '.scratch/issue-enrichment/candidates.json',
        candidatesStatus: candidates.status,
        candidateSummaries: candidates.issues.map(({ number, title, state, truncated }) => ({
          number,
          title,
          state,
          truncated,
        })),
      },
      null,
      2,
    ),
    { mode: 0o600 },
  )
}

async function analyze() {
  const { privateDir, contextDir } = paths()
  // The agent never receives a GitHub token, and cannot execute shell commands or edit files.
  const env = { ...process.env }
  delete env.GH_TOKEN
  delete env.GITHUB_TOKEN
  const events = execFileSync(
    'opencode',
    [
      'run',
      'Aplica la skill create-issue al reporte adjunto: analiza el código del checkout y devuelve el JSON del agente issue-enricher.',
      '--agent',
      'issue-enricher',
      '--model',
      'opencode-go/deepseek-v4.1-flash',
      '--format',
      'json',
      // --file es variádico: el mensaje debe ir antes para que no se interprete como ruta.
      '--file',
      resolve(contextDir, 'context.json'),
    ],
    {
      env,
      encoding: 'utf8',
      timeout: 8 * 60_000,
      maxBuffer: 8 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  const plan = parseAgentPlan(events)
  await writeFile(resolve(privateDir, 'plan.json'), JSON.stringify(plan), { mode: 0o600 })
}

/** Read the native closing reason and canonical issue, never infer from prose or labels. */
export async function verifyDuplicateClosure(snapshot, target, api) {
  const [owner, name] = snapshot.repository.split('/')
  const result = await api('graphql', 'POST', {
    query: `query($owner: String!, $name: String!, $number: Int!) {
      repository(owner: $owner, name: $name) {
        issue(number: $number) {
          state stateReason
          duplicateOf { number url repository { nameWithOwner } }
        }
      }
    }`,
    variables: { owner, name, number: snapshot.issue.number },
  })
  const issue = result.data?.repository?.issue
  if (
    result.errors?.length ||
    issue?.state !== 'CLOSED' ||
    issue.stateReason !== 'DUPLICATE' ||
    issue.duplicateOf?.number !== target.number ||
    issue.duplicateOf?.repository?.nameWithOwner !== snapshot.repository
  ) {
    throw new Error('No se pudo verificar el cierre nativo como duplicada.')
  }
}

async function duplicateTarget(plan, snapshot, api) {
  if (!plan.duplicate) return null
  const candidate = snapshot.candidates.issues.find(
    (issue) => issue.number === plan.duplicate.number,
  )
  if (
    !candidate ||
    candidate.number === snapshot.issue.number ||
    candidate.state !== 'open' ||
    candidate.truncated
  ) {
    throw new Error(
      'La duplicada debe coincidir con una candidata abierta con contexto suficiente.',
    )
  }
  const target = await api(`repos/${snapshot.repository}/issues/${candidate.number}`)
  if (
    target.state !== 'open' ||
    target.pull_request ||
    target.number !== candidate.number ||
    !Number.isSafeInteger(target.id) ||
    target.id <= 0 ||
    target.id === snapshot.issue.id
  ) {
    throw new Error('La issue principal ya no es una candidata válida.')
  }
  return target
}

export async function publishPlan(plan, snapshot, api) {
  plan = planSchema.parse(plan)
  const endpoint = `repos/${snapshot.repository}/issues/${snapshot.issue.number}`
  const current = await api(endpoint)
  // A rerun is safe; a human edit made during analysis must not be overwritten.
  if (current.body?.startsWith(`${BODY_MARKER}\n`) && !snapshot.reprocess) return 'already-enriched'
  if (current.body !== snapshot.issue.body)
    throw new Error('La issue cambió durante el análisis; vuelve a ejecutar el workflow.')
  if (current.state !== 'open') return 'closed'
  if (!current.labels.some((label) => label.name === 'source:web-report')) return 'not-web-report'
  const target = await duplicateTarget(plan, snapshot, api)
  const comments = await readComments(endpoint, api)
  if (
    snapshot.discussion &&
    JSON.stringify(discussionSnapshot(comments)) !== JSON.stringify(snapshot.discussion)
  ) {
    throw new Error(
      'La discusión cambió durante el análisis; vuelve a evaluar las decisiones pendientes.',
    )
  }
  const existing = comments.find(
    (comment) => comment.body?.includes(BRIEF_MARKER) && comment.user?.type === 'Bot',
  )
  const commentBody = [
    plan.brief,
    plan.duplicate ? `**Motivo del cierre como duplicada:** ${plan.duplicate.reason}` : '',
    BRIEF_MARKER,
  ]
    .filter(Boolean)
    .join('\n\n')
  const comment = existing
    ? await api(`repos/${snapshot.repository}/issues/comments/${existing.id}`, 'PATCH', {
        body: commentBody,
      })
    : await api(`${endpoint}/comments`, 'POST', { body: commentBody })
  const issueUrl = `https://github.com/${snapshot.repository}/issues/${snapshot.issue.number}`
  if (!comment.html_url?.startsWith(`${issueUrl}#issuecomment-`))
    throw new Error('Enlace al brief inválido.')
  if (comment.body !== commentBody) throw new Error('No se pudo verificar el brief publicado.')
  const beforeUpdate = await api(endpoint)
  if (beforeUpdate.body !== snapshot.issue.body || beforeUpdate.state !== 'open') {
    throw new Error('La issue cambió durante la publicación; el cuerpo no se sustituye.')
  }
  if (
    snapshot.discussion &&
    JSON.stringify(discussionSnapshot(await readComments(endpoint, api))) !==
      JSON.stringify(snapshot.discussion)
  ) {
    throw new Error(
      'La discusión cambió durante el análisis; vuelve a evaluar las decisiones pendientes.',
    )
  }
  const labels = buildTriageLabels(plan, beforeUpdate.labels ?? current.labels)
  for (const name of labels.filter(
    (name) => TYPE_LABELS.has(name) || TRIAGE_LABELS.has(name) || name === 'ui-change',
  )) {
    if (snapshot.labelNames && !snapshot.labelNames.includes(name)) {
      const labelEndpoint = `repos/${snapshot.repository}/labels/${encodeURIComponent(name)}`
      try {
        await api(labelEndpoint)
      } catch {
        try {
          await api(`repos/${snapshot.repository}/labels`, 'POST', { name, color: '1d76db' })
        } catch {
          await api(labelEndpoint)
        }
      }
    }
  }
  await api(endpoint, 'PATCH', {
    body: composeEnrichedBody(plan, snapshot, comment.html_url),
    labels,
    ...(target
      ? { state: 'closed', state_reason: 'duplicate', duplicate_issue_id: target.id }
      : {}),
  })
  const verified = await api(endpoint)
  if (verified.body !== composeEnrichedBody(plan, snapshot, comment.html_url)) {
    throw new Error('No se pudo verificar el cuerpo publicado.')
  }
  const actualLabels = (verified.labels ?? []).map((label) => label.name)
  if (
    labels.some((name) => !actualLabels.includes(name)) ||
    actualLabels.some(
      (name) => (TYPE_LABELS.has(name) || TRIAGE_LABELS.has(name)) && !labels.includes(name),
    )
  ) {
    throw new Error('No se pudo verificar la clasificación y el estado de triage publicados.')
  }
  if (target) await verifyDuplicateClosure(snapshot, target, api)
  return target ? 'closed-as-duplicate' : 'published'
}

async function publish() {
  const { repository, number } = identity()
  const { privateDir } = paths()
  const snapshot = JSON.parse(await readFile(resolve(privateDir, 'snapshot.json'), 'utf8'))
  if (snapshot.repository !== repository || snapshot.issue.number !== number)
    throw new Error('Snapshot de otra issue.')
  const plan = planSchema.parse(
    JSON.parse(await readFile(resolve(privateDir, 'plan.json'), 'utf8')),
  )
  await publishPlan(plan, snapshot, async (...args) => github(...args))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const command = { prepare, analyze, publish }[process.argv[2]]
    if (!command) throw new Error('Usa prepare, analyze o publish.')
    await command()
  } catch (error) {
    // Only fixed categories leave the process: stderr may contain report text or credentials.
    if (process.argv[2] === 'analyze') {
      const failure = error && typeof error === 'object' ? error : {}
      const stderr = String(failure.stderr ?? '')
      const reason =
        failure.code === 'ENOENT'
          ? 'opencode-not-found'
          : failure.code === 'ETIMEDOUT'
            ? 'opencode-timeout'
            : stderr.includes('File not found:')
              ? 'opencode-attachment'
              : Number.isInteger(failure.status)
                ? `opencode-exit-${failure.status}`
                : 'opencode-response'
      console.error(`[issue-enrichment] analyze: ${reason}.`)
    }
    // CLI errors and agent output can contain report text: keep workflow logs generic.
    console.error(
      'No se pudo completar el enriquecimiento. La issue sigue disponible; revisa el paso fallido antes de reintentar.',
    )
    process.exitCode = 1
  }
}
