import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Límites de GitHub y del workflow, comprobados antes de tocar la issue. */
export const MAX_BODY_BYTES = 64 * 1024
export const MAX_COMMENT_BYTES = 64 * 1024
export const MAX_LABELS_BYTES = 4 * 1024
export const MAX_LABELS = 50
export const LABEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._:/+-]{0,49}$/

/** Ejes documentados en docs/agents/triage-labels.md y create-issue. */
export const TRIAGE_LABELS = [
  'needs-triage',
  'needs-info',
  'ready-for-agent',
  'ready-for-human',
  'wontfix',
]
export const TYPE_LABELS = ['bug', 'feature', 'task', 'epic', 'enhancement']
export const ALLOWED_LABELS = new Set([...TRIAGE_LABELS, ...TYPE_LABELS, 'ui-change'])

export function parseLabelChanges(text) {
  const add = []
  const remove = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('-')) {
      const label = line.slice(1).trim()
      if (label) remove.push(label)
    } else {
      add.push(line)
    }
  }
  const uniqueAdd = [...new Set(add)]
  const uniqueRemove = [...new Set(remove)]
  if (new Set([...uniqueAdd, ...uniqueRemove]).size > MAX_LABELS) {
    throw new Error(`labels.txt supera ${MAX_LABELS} labels.`)
  }
  return { add: uniqueAdd, remove: uniqueRemove }
}

function keepLastAxis(labels, rejected) {
  if (labels.length <= 1) return labels
  const kept = labels[labels.length - 1]
  for (const label of labels.slice(0, -1)) rejected.push(label)
  return [kept]
}

/** Filtra la allowlist y sustituye el estado/tipo anterior del mismo eje. */
export function planLabelChanges({ changes, current, existing }) {
  const rejected = []
  const knownLabels = existing instanceof Set ? existing : new Set(existing)
  const validAdd = []
  for (const label of changes.add) {
    if (LABEL_PATTERN.test(label) && ALLOWED_LABELS.has(label) && knownLabels.has(label)) {
      validAdd.push(label)
    } else {
      rejected.push(label)
    }
  }

  const triage = keepLastAxis(
    validAdd.filter((label) => TRIAGE_LABELS.includes(label)),
    rejected,
  )
  const type = keepLastAxis(
    validAdd.filter((label) => TYPE_LABELS.includes(label)),
    rejected,
  )
  const finalLabels = new Set([
    ...validAdd.filter((label) => !TRIAGE_LABELS.includes(label) && !TYPE_LABELS.includes(label)),
    ...triage,
    ...type,
  ])
  const added = validAdd.filter((label) => finalLabels.has(label))

  const removed = new Set()
  for (const label of changes.remove) {
    if (!LABEL_PATTERN.test(label) || !ALLOWED_LABELS.has(label) || !current.includes(label)) {
      rejected.push(label)
    } else {
      removed.add(label)
    }
  }

  if (triage.length > 0) {
    for (const label of current) {
      if (TRIAGE_LABELS.includes(label) && !added.includes(label)) removed.add(label)
    }
  }
  if (type.length > 0) {
    for (const label of current) {
      if (TYPE_LABELS.includes(label) && !added.includes(label)) removed.add(label)
    }
  }
  for (const label of added) removed.delete(label)

  return {
    added,
    removed: [...removed],
    rejected: [...new Set(rejected)],
  }
}

function sectionEnd(lines, start) {
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^###\s/.test(lines[index].trim())) return index
  }
  return lines.length
}

/** Última aparición: buildIssueBody escribe el bloque real al final. */
export function extractSection(body, heading) {
  const lines = body.split(/\r?\n/)
  const start = lines.findLastIndex((line) => line.trim() === heading)
  if (start < 0) return null
  return lines.slice(start, sectionEnd(lines, start)).join('\n').trim()
}

function stripSection(body, heading) {
  const lines = body.split(/\r?\n/)
  const kept = []
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() === heading) {
      index = sectionEnd(lines, index) - 1
      continue
    }
    kept.push(lines[index])
  }
  return kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function appendSection(body, section) {
  return `${body.trimEnd()}\n\n${section.trim()}\n`
}

function imageSnippets(text) {
  const snippets = new Set()
  for (const match of text.matchAll(/!\[[^\]]*\]\([^)]+\)/g)) snippets.add(match[0])
  for (const match of text.matchAll(/!\[[^\]]*\]\[[^\]]*\]/g)) snippets.add(match[0])
  return [...snippets]
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Solo imágenes inline permitidas del cuerpo original; nunca referencias. */
function originalInlineImages(originalBody, repository) {
  const snippets = new Set()
  const user = /!\[[^\]]*\]\((https:\/\/github\.com\/user-attachments\/[^)\s]+)\)/gi
  for (const match of originalBody.matchAll(user)) snippets.add(match[0])

  if (repository) {
    const repo = escapeRegex(repository)
    const own = new RegExp(
      `!\\[[^\\]]*\\]\\(https:\\/\\/github\\.com\\/${repo}\\/assets\\/[^)\\s]+\\)`,
      'gi',
    )
    for (const match of originalBody.matchAll(own)) snippets.add(match[0])
  }
  return [...snippets]
}

const MENTION_URL = /(?:https?|ftp):\/\/[^\s<>()]+|www\.[^\s<>()]+/gi

/** Menciones de texto, también en código; respeta correos y URLs. */
function neutralizeMentions(text) {
  const urls = [...text.matchAll(MENTION_URL)].map((match) => [
    match.index ?? 0,
    (match.index ?? 0) + match[0].length,
  ])
  return text.replace(/@([A-Za-z0-9][A-Za-z0-9-]{0,38})/g, (match, login, offset) => {
    const previous = text[offset - 1]
    if (previous && /[\w.]/.test(previous)) return match
    if (urls.some(([start, end]) => offset >= start && offset < end)) return match
    return `@\u200b${login}`
  })
}

/**
 * Escapa toda imagen y HTML en todo el texto, también dentro de código, con
 * U+200B. Después reinserta solo las imágenes inline permitidas del original.
 */
export function sanitizeMarkdown(text, { originalBody = '', repository = '' } = {}) {
  const originalImages = originalInlineImages(originalBody, repository)
  let result = text
  const placeholders = []
  for (const image of originalImages) {
    if (!result.includes(image)) continue
    const placeholder = `\u0000OPENCODE_IMAGE_${placeholders.length}\u0000`
    placeholders.push(image)
    result = result.split(image).join(placeholder)
  }

  result = result.replace(/!\[/g, '!\u200b[').replace(/</g, '<\u200b')
  result = neutralizeMentions(result)

  for (let index = 0; index < placeholders.length; index += 1) {
    result = result.split(`\u0000OPENCODE_IMAGE_${index}\u0000`).join(placeholders[index])
  }
  return result
}

function mergeAttachments(body, originalBody, repository) {
  const original = extractSection(originalBody, '### Adjuntos')
  if (!original) return body
  const safeOriginal = sanitizeMarkdown(original, { originalBody, repository })
  const current = extractSection(body, '### Adjuntos')
  if (!current) return appendSection(body, safeOriginal)

  const present = new Set(imageSnippets(current))
  const missing = imageSnippets(safeOriginal).filter((snippet) => !present.has(snippet))
  if (missing.length === 0) return body

  const lines = body.split(/\r?\n/)
  const start = lines.findLastIndex((line) => line.trim() === '### Adjuntos')
  const end = sectionEnd(lines, start)
  const missingLines = missing.flatMap((snippet) => {
    const line = safeOriginal.split(/\r?\n/).find((candidate) => candidate.includes(snippet))
    return line ? [line.trim()] : []
  })
  lines.splice(end, 0, ...missingLines)
  return lines.join('\n')
}

function mergeContext(body, originalBody, repository) {
  if (extractSection(body, '### Contexto de ejecución')) return body
  const original = extractSection(originalBody, '### Contexto de ejecución')
  if (!original) return body
  return appendSection(body, sanitizeMarkdown(original, { originalBody, repository }))
}

/**
 * Compone el cuerpo publicado: quita cualquier ### Reportero que venga del
 * agente o del texto del reporte, conserva adjuntos/contexto del original y
 * añade al final el bloque ### Reportero auténtico (el último de la issue).
 */
export function composeEnrichedBody(body, originalBody, repository = '') {
  let result = stripSection(body, '### Reportero')
  const marker = /^\s*<!-- web-report-enriched -->\s*$/m.exec(originalBody)?.[0]?.trim()
  if (marker && !result.includes(marker)) result = `${marker}\n\n${result}`

  result = mergeAttachments(result, originalBody, repository)
  result = mergeContext(result, originalBody, repository)
  const reporter = extractSection(originalBody, '### Reportero')
  if (reporter) result = appendSection(result, reporter)
  return result
}

function readOptional(root, name, maxBytes) {
  const file = resolve(root, name)
  if (!existsSync(file)) return null
  const stat = lstatSync(file)
  if (!stat.isFile()) throw new Error(`${name} no es un fichero regular.`)
  if (stat.size > maxBytes) throw new Error(`${name} supera ${maxBytes} bytes.`)
  const text = readFileSync(file, 'utf8')
  return text.trim() ? { file, text } : null
}

function readOriginalBody(originalBodyPath) {
  if (!originalBodyPath || !existsSync(originalBodyPath)) {
    throw new Error('Falta el cuerpo original de la issue.')
  }
  const stat = lstatSync(originalBodyPath)
  if (!stat.isFile()) throw new Error('El cuerpo original no es un fichero regular.')
  if (stat.size > MAX_BODY_BYTES) throw new Error('El cuerpo original supera el límite.')
  return readFileSync(originalBodyPath, 'utf8')
}

function defaultGh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function currentIssue(gh, repository, issueNumber) {
  return JSON.parse(
    gh(['issue', 'view', String(issueNumber), '--repo', repository, '--json', 'body,labels']),
  )
}

export function publishReport({
  repository,
  issueNumber,
  root = '.scratch/enricher',
  originalBodyPath = process.env.ORIGINAL_BODY_PATH,
  gh = defaultGh,
}) {
  const body = readOptional(root, 'body.md', MAX_BODY_BYTES)
  const comment = readOptional(root, 'comment.md', MAX_COMMENT_BYTES)
  const labelsFile = readOptional(root, 'labels.txt', MAX_LABELS_BYTES)
  if (!body && !comment && !labelsFile) {
    return {
      body: false,
      comment: false,
      bodyAsComment: false,
      labels: [],
      removed: [],
      rejected: [],
    }
  }

  const originalBody = body || comment ? readOriginalBody(originalBodyPath) : ''
  const changes = labelsFile ? parseLabelChanges(labelsFile.text) : { add: [], remove: [] }
  const issue = currentIssue(gh, repository, issueNumber)
  const currentBody = issue.body ?? ''
  const currentLabels = (issue.labels ?? []).map((label) => label.name)
  const normalizeBody = (text) => text.replace(/\r\n/g, '\n').trimEnd()
  const bodyChanged = Boolean(body) && normalizeBody(currentBody) !== normalizeBody(originalBody)

  let existing = new Set()
  if (changes.add.length > 0) {
    existing = new Set(
      JSON.parse(
        gh(['label', 'list', '--repo', repository, '--limit', '1000', '--json', 'name']),
      ).map((label) => label.name),
    )
  }
  const plan = planLabelChanges({ changes, current: currentLabels, existing })

  let bodyAsComment = false
  if (body) {
    const sanitized = sanitizeMarkdown(body.text, { originalBody, repository })
    const composed = composeEnrichedBody(sanitized, originalBody, repository)
    if (Buffer.byteLength(composed, 'utf8') > MAX_BODY_BYTES) {
      throw new Error(`body.md compuesto supera ${MAX_BODY_BYTES} bytes.`)
    }
    writeFileSync(body.file, composed)
    bodyAsComment = bodyChanged
  }
  if (comment) {
    const sanitized = sanitizeMarkdown(comment.text, { originalBody, repository })
    if (Buffer.byteLength(sanitized, 'utf8') > MAX_COMMENT_BYTES) {
      throw new Error(`comment.md compuesto supera ${MAX_COMMENT_BYTES} bytes.`)
    }
    writeFileSync(comment.file, sanitized)
  }

  if (body) {
    const action = bodyAsComment ? ['issue', 'comment'] : ['issue', 'edit']
    gh([...action, String(issueNumber), '--repo', repository, '--body-file', body.file])
  }
  if (bodyAsComment) {
    console.warn('[publish] el cuerpo cambió; se publica como comentario en vez de sobrescribirlo.')
  }
  if (comment) {
    gh(['issue', 'comment', String(issueNumber), '--repo', repository, '--body-file', comment.file])
  }
  if (plan.added.length > 0 || plan.removed.length > 0) {
    gh([
      'issue',
      'edit',
      String(issueNumber),
      '--repo',
      repository,
      ...plan.added.flatMap((label) => ['--add-label', label]),
      ...plan.removed.flatMap((label) => ['--remove-label', label]),
    ])
  }

  return {
    body: Boolean(body),
    comment: Boolean(comment),
    bodyAsComment,
    labels: plan.added,
    removed: plan.removed,
    rejected: plan.rejected,
  }
}

function main() {
  const repository = process.env.GITHUB_REPOSITORY ?? ''
  const issueNumber = Number(process.env.ISSUE_NUMBER)
  if (
    !/^[\w.-]+\/[\w.-]+$/.test(repository) ||
    !Number.isSafeInteger(issueNumber) ||
    issueNumber <= 0
  ) {
    throw new Error('Repositorio o número de issue inválido.')
  }
  if (!process.env.GH_TOKEN) throw new Error('Falta GH_TOKEN.')

  const result = publishReport({ repository, issueNumber })
  if (
    !result.body &&
    !result.comment &&
    result.labels.length === 0 &&
    result.removed.length === 0
  ) {
    console.log('[publish] sin resultados que publicar.')
    return
  }
  console.log(
    `[publish] body=${result.body} bodyAsComment=${result.bodyAsComment} comment=${result.comment} labels=${result.labels.length} removed=${result.removed.length}`,
  )
  if (result.rejected.length > 0) {
    console.warn(`[publish] labels ignorados: ${result.rejected.join(', ')}`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main()
  } catch (error) {
    console.error(`[publish] ${error instanceof Error ? error.message : 'fallo inesperado'}`)
    process.exitCode = 1
  }
}
