/**
 * Plan de `pnpm reports:backfill` (#340), puro y testeable.
 *
 * Recupera la propiedad de los reportes enviados antes de que existiera
 * `issue_reports`: lee el `Identificador` del bloque `### Reportero` que escribe
 * `buildIssueBody` y se salta —listándolas— las issues que no puede asociar.
 */

export interface BackfillIssue {
  number: number
  created_at: string
  body: string | null
  pull_request?: unknown
}

export type BackfillSkipReason = 'sin-bloque' | 'bloque-modificado' | 'usuario-desconocido'

export interface BackfillSkipped {
  number: number
  reason: BackfillSkipReason
}

export interface BackfillInsert {
  userId: string
  issueNumber: number
  submittedAt: string
  lastSeenAt: string
}

export interface BackfillPlan {
  toInsert: BackfillInsert[]
  alreadyPresent: number[]
  skipped: BackfillSkipped[]
}

export type ParseReporterResult =
  { ok: true; userId: string } | { ok: false; reason: 'sin-bloque' | 'bloque-modificado' }

const USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const REQUIRED_LABELS = ['Nombre', 'Email', 'Identificador'] as const

export function parseReporterId(body: string | null | undefined): ParseReporterResult {
  if (!body) return { ok: false, reason: 'sin-bloque' }
  const lines = body.split(/\r?\n/)
  const start = lines.findIndex((line) => line.trim() === '### Reportero')
  if (start === -1) return { ok: false, reason: 'sin-bloque' }

  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^###\s/.test(lines[index].trim())) {
      end = index
      break
    }
  }

  const block = lines.slice(start + 1, end)
  const bullets = block
    .filter((line) => /^\s*-\s+/.test(line))
    .map((line) => line.replace(/^\s*-\s+/, '').trim())

  if (bullets.length !== REQUIRED_LABELS.length) {
    return { ok: false, reason: 'bloque-modificado' }
  }

  const labels = bullets.map((bullet) => bullet.split(':')[0]?.trim())
  const uniqueLabels = new Set(labels)
  if (
    uniqueLabels.size !== REQUIRED_LABELS.length ||
    !REQUIRED_LABELS.every((label) => uniqueLabels.has(label))
  ) {
    return { ok: false, reason: 'bloque-modificado' }
  }

  const identifier = bullets.find((bullet) => bullet.startsWith('Identificador:'))
  const value = identifier?.slice('Identificador:'.length).trim() ?? ''
  if (!USER_ID_PATTERN.test(value)) {
    return { ok: false, reason: 'bloque-modificado' }
  }

  return { ok: true, userId: value }
}

export function buildBackfillPlan(input: {
  issues: readonly BackfillIssue[]
  existing: Iterable<number>
  knownUserIds: Iterable<string>
  now: string
}): BackfillPlan {
  const existing = new Set(input.existing)
  const knownUserIds = new Set(input.knownUserIds)
  const plan: BackfillPlan = { toInsert: [], alreadyPresent: [], skipped: [] }

  for (const issue of input.issues) {
    if (issue.pull_request) continue
    const reporter = parseReporterId(issue.body)
    if (!reporter.ok) {
      plan.skipped.push({ number: issue.number, reason: reporter.reason })
      continue
    }
    if (!knownUserIds.has(reporter.userId)) {
      plan.skipped.push({ number: issue.number, reason: 'usuario-desconocido' })
      continue
    }
    if (existing.has(issue.number)) {
      plan.alreadyPresent.push(issue.number)
      continue
    }
    plan.toInsert.push({
      userId: reporter.userId,
      issueNumber: issue.number,
      submittedAt: issue.created_at,
      lastSeenAt: input.now,
    })
  }

  return plan
}

const SKIP_LABEL: Record<BackfillSkipReason, string> = {
  'sin-bloque': 'sin bloque de reportero',
  'bloque-modificado': 'bloque de reportero modificado',
  'usuario-desconocido': 'el identificador no corresponde a ninguna cuenta',
}

export function formatBackfillPlan(plan: BackfillPlan): string {
  const lines = [
    `Reportes por recuperar: ${plan.toInsert.length}`,
    `Ya presentes: ${plan.alreadyPresent.length}`,
    `Saltadas: ${plan.skipped.length}`,
  ]
  if (plan.skipped.length > 0) {
    lines.push('', 'Issues saltadas:')
    for (const skipped of plan.skipped) {
      lines.push(`  #${skipped.number} · ${SKIP_LABEL[skipped.reason]}`)
    }
  }
  return lines.join('\n')
}
