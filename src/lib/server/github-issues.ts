import type { RuntimeEnv } from './cloudflare-env'
import { enrichIssueReport, type IssueEnricher } from './issue-enricher'
import type { IssueReportPayload } from './issue-report-schema'

export interface CreatedIssue {
  number: number
  url: string
}

export interface GithubIssueClient {
  fetch: typeof fetch
  /** Análisis opcional del reporte. Por defecto, el enriquecedor de DeepSeek vía OpenCode Go. */
  enrich?: IssueEnricher
}

/**
 * Quien envía el reporte, tomado del principal autenticado en el servidor.
 * Nunca viene del payload del cliente.
 */
export interface IssueReporter {
  userId: string
  email: string | null
  name: string | null
}

const GITHUB_API_BASE = 'https://api.github.com'
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])
const TYPE_RETRY_STATUS = new Set([400, 403, 404, 422])

export type GithubIssueType = 'Bug' | 'Feature'

function requiredEnv(name: keyof RuntimeEnv, env: RuntimeEnv): string {
  const value = String(env[name] || '').trim()
  if (!value) {
    throw new Error(`Falta variable de entorno requerida: ${name}`)
  }
  return value
}

function requiredAnyEnv(names: ReadonlyArray<keyof RuntimeEnv>, env: RuntimeEnv): string {
  for (const name of names) {
    const value = String(env[name] || '').trim()
    if (value) {
      return value
    }
  }

  throw new Error(`Falta variable de entorno requerida: ${names.join(' o ')}`)
}

function canonicalReportType(type: IssueReportPayload['type']): 'bug' | 'feature' {
  return type === 'bug' ? 'bug' : 'feature'
}

export function getGithubIssueType(type: IssueReportPayload['type']): GithubIssueType {
  return canonicalReportType(type) === 'bug' ? 'Bug' : 'Feature'
}

export function buildIssueBody(
  payload: IssueReportPayload,
  reporter: IssueReporter,
  analysis?: string | null,
): string {
  const reportType = canonicalReportType(payload.type)
  const githubType = getGithubIssueType(payload.type)
  const lines = ['## Reporte desde la web', '', '### Resumen', payload.summary, '']

  // Sin descripción no se escribe el encabezado: una sección vacía ensucia la issue.
  if (payload.description) {
    lines.push('### Problema o solicitud', payload.description, '')
  }

  lines.push(
    '### Contexto de ejecución',
    `- Tipo: ${reportType}`,
    `- Tipo de reporte: ${reportType}`,
    `- Tipo de issue de GitHub: ${githubType}`,
    `- Se envió desde la sección: ${payload.section}`,
    `- Se envió desde la ruta: ${payload.context.pathname || 'n/a'}`,
    `- Navegador: ${payload.context.userAgent || 'n/a'}`,
    `- Fecha cliente: ${payload.context.timestamp || 'n/a'}`,
    '',
    '### Reportero',
    `- Nombre: ${reporter.name || 'n/a'}`,
    `- Email: ${reporter.email || 'n/a'}`,
    `- Identificador: ${reporter.userId}`,
  )

  // Sección aditiva y separada: el texto del usuario queda intacto por encima.
  if (analysis) {
    lines.push(
      '',
      '## Análisis generado automáticamente',
      '> Generado con DeepSeek V4.1 Flash a partir del reporte. No es texto del usuario.',
      '',
      analysis,
    )
  }

  return lines.join('\n').trim()
}

export function buildIssueLabels(type: IssueReportPayload['type']): string[] {
  // Keep labels short and compatible with GitHub's default labels. The
  // structured issue type is sent separately in the request body.
  return ['source:web-report', 'status:triage', canonicalReportType(type)]
}

async function requestWithRetry(
  requestFn: () => Promise<Response>,
  retries: number,
  retryDelayMs: number,
): Promise<Response> {
  let lastResponse: Response | null = null

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await requestFn()
    if (!RETRYABLE_STATUS.has(response.status)) {
      return response
    }
    lastResponse = response

    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs * (attempt + 1)))
    }
  }

  return lastResponse as Response
}

/**
 * El enriquecimiento nunca bloquea el reporte: si algo falla, la issue se crea
 * sin análisis. Los enriquecedores ya registran sus fallos; este catch cubre
 * solo un enriquecedor que lance pese al contrato.
 */
async function enrichReport(
  payload: IssueReportPayload,
  env: RuntimeEnv,
  enrich: IssueEnricher,
): Promise<string | null> {
  try {
    return await enrich(
      {
        type: canonicalReportType(payload.type),
        summary: payload.summary,
        description: payload.description,
        section: payload.section,
        pathname: payload.context.pathname,
      },
      env,
    )
  } catch {
    console.error('[github] El análisis del reporte se omitió por un fallo inesperado.')
    return null
  }
}

export async function createIssueFromWebReport(
  payload: IssueReportPayload,
  reporter: IssueReporter,
  env: RuntimeEnv,
  client: GithubIssueClient = { fetch: globalThis.fetch.bind(globalThis) },
): Promise<CreatedIssue> {
  const token = requiredAnyEnv(['GITHUB_ISSUE_TOKEN', 'GITHUB_TOKEN'], env)
  const owner = requiredEnv('GITHUB_OWNER', env)
  const repo = requiredEnv('GITHUB_REPO', env)
  const title = payload.summary.slice(0, 140)
  const labels = buildIssueLabels(payload.type)
  const analysis = await enrichReport(payload, env, client.enrich ?? enrichIssueReport)
  const baseRequestBody = {
    title,
    body: buildIssueBody(payload, reporter, analysis),
    labels,
  }
  const requestBody = {
    ...baseRequestBody,
    // GitHub accepts the issue type by name. If the repository does not have
    // issue types enabled, the fallback below creates the issue without it.
    type: getGithubIssueType(payload.type),
  }

  const requestIssue = (body: object) =>
    requestWithRetry(
      () =>
        client.fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/issues`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
            'User-Agent': 'finance-tracker-web-reporter',
          },
          body: JSON.stringify(body),
        }),
      2,
      500,
    )

  let response = await requestIssue(requestBody)

  if (!response.ok) {
    const details = await response.text()

    // Some GitHub installations expose labels/issues but not structured issue
    // types. A type rejection must not prevent the report from being created.
    if (TYPE_RETRY_STATUS.has(response.status)) {
      response = await requestIssue(baseRequestBody)
    } else {
      // El cuerpo de GitHub queda del lado del servidor: el mensaje del error
      // viaja a Sentry con `reportApiRouteFailure` y no debe repetirlo.
      console.error(`[github] GitHub API devolvió ${response.status}`, details.slice(0, 500))
      throw new Error(`GitHub API devolvió ${response.status}.`)
    }
  }

  if (!response.ok) {
    const details = await response.text()
    console.error(`[github] GitHub API devolvió ${response.status}`, details.slice(0, 500))
    throw new Error(`GitHub API devolvió ${response.status}.`)
  }

  const data = (await response.json()) as {
    number?: number
    html_url?: string
  }
  const issueNumber = Number(data.number)
  const issueUrl = String(data.html_url || '')
  if (!Number.isFinite(issueNumber) || !issueUrl) {
    throw new Error('Respuesta inválida al crear issue en GitHub.')
  }

  return { number: issueNumber, url: issueUrl }
}
