import { execFileSync } from 'node:child_process'
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { findIssueCandidates } from '../../src/lib/server/issue-duplicates.ts'

const BRIEF_MARKER = '<!-- web-report-agent-brief -->'
const BODY_MARKER = '<!-- web-report-enriched -->'
const planSchema = z.object({
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
  relatedNumbers: z.array(z.number().int().positive()).max(20),
  uiChange: z.boolean(),
})

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
      }
    }
    if (event.type === 'text') text += event.part?.text ?? ''
  }
  if (!completed || !loadedSkill || !readCode)
    throw new Error(
      'El análisis debe terminar, cargar la skill y leer el código antes de publicar.',
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
    ...related.map(
      (issue) =>
        `Relacionada: https://github.com/${snapshot.repository}/issues/${issue.number} (${issue.state}).`,
    ),
    splitReportBody(snapshot.issue.body).preserved,
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
  if (issue.state !== 'open' || issue.body?.startsWith(`${BODY_MARKER}\n`)) {
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, 'skip=true\n')
    return
  }
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
    JSON.stringify({ repository, issue, candidates }),
    { mode: 0o600 },
  )
  await writeFile(
    resolve(contextDir, 'context.json'),
    JSON.stringify({
      repository,
      report: {
        number,
        title: issue.title,
        body: report,
        labels: issue.labels.map((label) => label.name),
      },
      candidates,
    }),
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
  const endpoint = `repos/${snapshot.repository}/issues/${snapshot.issue.number}`
  const current = await api(endpoint)
  // A rerun is safe; a human edit made during analysis must not be overwritten.
  if (current.body?.startsWith(`${BODY_MARKER}\n`)) return 'already-enriched'
  if (current.body !== snapshot.issue.body)
    throw new Error('La issue cambió durante el análisis; vuelve a ejecutar el workflow.')
  if (current.state !== 'open') return 'closed'
  if (!current.labels.some((label) => label.name === 'source:web-report')) return 'not-web-report'
  const target = await duplicateTarget(plan, snapshot, api)
  const comments = await api(`${endpoint}/comments?per_page=100`)
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
  if (plan.uiChange && current.labels.some((label) => label.name === 'feature')) {
    await api(`repos/${snapshot.repository}/labels`, 'POST', {
      name: 'ui-change',
      color: '1d76db',
      description: 'Cambia la apariencia de la interfaz',
    }).catch(() => {})
    await api(`${endpoint}/labels`, 'POST', { labels: ['ui-change'] })
  }
  if (comment.body !== commentBody) throw new Error('No se pudo verificar el brief publicado.')
  const beforeUpdate = await api(endpoint)
  if (beforeUpdate.body !== snapshot.issue.body || beforeUpdate.state !== 'open') {
    throw new Error('La issue cambió durante la publicación; el cuerpo no se sustituye.')
  }
  await api(endpoint, 'PATCH', {
    body: composeEnrichedBody(plan, snapshot, comment.html_url),
    ...(target
      ? { state: 'closed', state_reason: 'duplicate', duplicate_issue_id: target.id }
      : {}),
  })
  const verified = await api(endpoint)
  if (verified.body !== composeEnrichedBody(plan, snapshot, comment.html_url)) {
    throw new Error('No se pudo verificar el cuerpo publicado.')
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
