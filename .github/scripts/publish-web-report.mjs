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

export function parseLabels(text) {
  const labels = [
    ...new Set(
      text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ]
  if (labels.length > MAX_LABELS) throw new Error(`labels.txt supera ${MAX_LABELS} labels.`)
  return labels
}

/** Solo pasan labels con forma válida y que ya existan en el repositorio. */
export function selectLabels(labels, existing) {
  const accepted = []
  const rejected = []
  for (const label of labels) {
    if (LABEL_PATTERN.test(label) && existing.has(label)) accepted.push(label)
    else rejected.push(label)
  }
  return { accepted, rejected }
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

function imageUrls(section) {
  return [...section.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map((match) => match[1])
}

function mergeAttachments(body, originalBody) {
  const original = extractSection(originalBody, '### Adjuntos')
  if (!original) return body
  const current = extractSection(body, '### Adjuntos')
  if (!current) return appendSection(body, original)

  const present = new Set(imageUrls(current))
  const missing = imageUrls(original).filter((url) => !present.has(url))
  if (missing.length === 0) return body

  const lines = body.split(/\r?\n/)
  const start = lines.findLastIndex((line) => line.trim() === '### Adjuntos')
  const end = sectionEnd(lines, start)
  const missingLines = missing.flatMap((url) => {
    const line = original.split(/\r?\n/).find((candidate) => candidate.includes(url))
    return line ? [line.trim()] : []
  })
  lines.splice(end, 0, ...missingLines)
  return lines.join('\n')
}

function mergeContext(body, originalBody) {
  if (extractSection(body, '### Contexto de ejecución')) return body
  const original = extractSection(originalBody, '### Contexto de ejecución')
  return original ? appendSection(body, original) : body
}

/**
 * Compone el cuerpo publicado: quita cualquier ### Reportero que venga del
 * agente o del texto del reporte, conserva adjuntos/contexto del original y
 * añade al final el bloque ### Reportero auténtico (el último de la issue).
 */
export function composeEnrichedBody(body, originalBody) {
  let result = stripSection(body, '### Reportero')
  const marker = /^\s*<!-- web-report-enriched -->\s*$/m.exec(originalBody)?.[0]?.trim()
  if (marker && !result.includes(marker)) result = `${marker}\n\n${result}`

  result = mergeAttachments(result, originalBody)
  result = mergeContext(result, originalBody)
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
  const labels = labelsFile ? parseLabels(labelsFile.text) : []

  if (body) {
    const composed = composeEnrichedBody(body.text, readOriginalBody(originalBodyPath))
    if (Buffer.byteLength(composed, 'utf8') > MAX_BODY_BYTES) {
      throw new Error(`body.md compuesto supera ${MAX_BODY_BYTES} bytes.`)
    }
    writeFileSync(body.file, composed)
  }

  let accepted = []
  let rejected = []
  if (labels.length > 0) {
    const existing = new Set(
      JSON.parse(
        gh(['label', 'list', '--repo', repository, '--limit', '1000', '--json', 'name']),
      ).map((label) => label.name),
    )
    ;({ accepted, rejected } = selectLabels(labels, existing))
  }

  if (body) {
    gh(['issue', 'edit', String(issueNumber), '--repo', repository, '--body-file', body.file])
  }
  if (comment) {
    gh(['issue', 'comment', String(issueNumber), '--repo', repository, '--body-file', comment.file])
  }
  if (accepted.length > 0) {
    gh([
      'issue',
      'edit',
      String(issueNumber),
      '--repo',
      repository,
      ...accepted.flatMap((label) => ['--add-label', label]),
    ])
  }

  return { body: Boolean(body), comment: Boolean(comment), labels: accepted, rejected }
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
  if (!result.body && !result.comment && result.labels.length === 0) {
    console.log('[publish] sin resultados que publicar.')
    return
  }
  console.log(
    `[publish] body=${result.body} comment=${result.comment} labels=${result.labels.length}`,
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
