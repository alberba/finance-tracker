import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ENRICHMENT_MARKER = 'ENRICHMENT_RESULT_V1'

const PRIORITY_PATTERN = /^priority:(low|med|high)$/
const AREA_PATTERN = /^area:(frontend|backend|infra|data)$/

function lastMatch(regex, source) {
  const globalRegex = new RegExp(
    regex.source,
    regex.flags.includes('g') ? regex.flags : `${regex.flags}g`,
  )
  let last = null
  let match
  while ((match = globalRegex.exec(source)) !== null) {
    last = match
    // Prevent a zero-width global match from spinning forever on malformed
    // or deliberately empty model output.
    if (match[0] === '') {
      globalRegex.lastIndex += 1
    }
  }
  return last
}

function parseJsonCandidate(source) {
  try {
    return JSON.parse(source.trim())
  } catch {
    return null
  }
}

/**
 * Extract the structured marker emitted by Codex. The fenced fallback keeps
 * the workflow compatible with Codex versions that wrap the final response
 * in a Markdown code block.
 */
export function extractEnrichmentPayload(output) {
  const source = String(output || '')
  if (!source.trim()) {
    return null
  }

  const marker = lastMatch(
    new RegExp(`<!--\\s*${ENRICHMENT_MARKER}\\s*([\\s\\S]*?)-->`, 'm'),
    source,
  )
  if (marker) {
    return parseJsonCandidate(marker[1])
  }

  const fenced = lastMatch(/```(?:json|html|xml)?\s*([\s\S]*?)```/im, source)
  if (fenced && /(?:"title"\s*:|ENRICHMENT_RESULT_V1)/.test(fenced[1])) {
    const fencedContent = fenced[1]
      .replace(new RegExp(`^\\s*${ENRICHMENT_MARKER}\\s*`, 'i'), '')
      .trim()
    return parseJsonCandidate(fencedContent)
  }

  return parseJsonCandidate(source)
}

function stringArray(value) {
  return Array.isArray(value)
    ? value
        .filter((entry) => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : []
}

export function validateEnrichmentPayload(value) {
  const title = typeof value?.title === 'string' ? value.title.trim() : ''
  const bodyMarkdown = typeof value?.body_markdown === 'string' ? value.body_markdown.trim() : ''
  const labelsAdd = stringArray(value?.labels_add)
  const labelsKeep = stringArray(value?.labels_keep)
  const labelsRemove = stringArray(value?.labels_remove)

  if (!title || !bodyMarkdown) {
    return {
      ok: false,
      error: 'Codex debe devolver title y body_markdown no vacíos.',
    }
  }
  if (title === 'Título enriquecido' || bodyMarkdown === 'Cuerpo markdown enriquecido') {
    return {
      ok: false,
      error: 'Codex devolvió la plantilla en lugar del resultado.',
    }
  }
  const requiredSections = [
    '## Problema',
    '## Hipótesis técnica',
    '## Alcance',
    '## Criterios de aceptación',
  ]
  if (requiredSections.some((section) => !bodyMarkdown.includes(section))) {
    return {
      ok: false,
      error: 'Codex no devolvió todas las secciones técnicas requeridas.',
    }
  }
  const priorityLabels = labelsAdd.filter((label) => PRIORITY_PATTERN.test(label))
  if (priorityLabels.length !== 1) {
    return { ok: false, error: 'Codex debe proponer exactamente una prioridad válida.' }
  }
  if (!labelsAdd.some((label) => AREA_PATTERN.test(label))) {
    return { ok: false, error: 'Codex no propuso un área válida.' }
  }
  if (labelsAdd.some((label) => !PRIORITY_PATTERN.test(label) && !AREA_PATTERN.test(label))) {
    return { ok: false, error: 'Codex propuso un label adicional no permitido.' }
  }
  if (!labelsKeep.includes('source:web-report') || !labelsKeep.includes('status:triage')) {
    return {
      ok: false,
      error: 'Codex debe conservar source:web-report y status:triage.',
    }
  }
  if (!labelsKeep.some((label) => label === 'bug' || label === 'feature')) {
    return { ok: false, error: 'Codex debe conservar el label bug o feature.' }
  }
  if (labelsKeep.some((label) => /^type:/.test(label))) {
    return { ok: false, error: 'Codex no puede usar labels type:*.' }
  }
  if (!labelsRemove.includes('enrich:pending')) {
    return { ok: false, error: 'Codex debe retirar enrich:pending.' }
  }

  return {
    ok: true,
    value: {
      title,
      body_markdown: bodyMarkdown,
      labels_add: labelsAdd,
      labels_keep: labelsKeep,
      labels_remove: labelsRemove,
    },
  }
}

export function buildCodexPrompt(template, contextMarkdown) {
  return [
    String(template || '').trim(),
    '',
    '---',
    '',
    String(contextMarkdown || '').trim(),
    '',
  ].join('\n')
}

function parseArgs(argv) {
  const args = new Map()
  for (let index = 2; index < argv.length; index += 1) {
    const current = argv[index]
    if (!current?.startsWith('--')) {
      continue
    }
    const key = current.slice(2)
    const next = argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[++index] : ''
    args.set(key, next)
  }
  return args
}

function runCli() {
  const args = parseArgs(process.argv)
  const promptFile = args.get('prompt-file')
  const contextFile = args.get('context-file')
  const promptOutput = args.get('prompt-out')
  const codexOutput = args.get('codex-output')
  const normalizedOutput = args.get('normalized-out')

  if (promptFile || contextFile || promptOutput) {
    if (!promptFile || !contextFile || !promptOutput) {
      throw new Error('Uso de prompt: --prompt-file --context-file --prompt-out')
    }
    const prompt = buildCodexPrompt(
      fs.readFileSync(promptFile, 'utf-8'),
      fs.readFileSync(contextFile, 'utf-8'),
    )
    fs.mkdirSync(path.dirname(promptOutput), { recursive: true })
    fs.writeFileSync(promptOutput, prompt, 'utf-8')
    return
  }

  if (codexOutput || normalizedOutput) {
    if (!codexOutput || !normalizedOutput) {
      throw new Error('Uso de parseo: --codex-output --normalized-out')
    }
    const parsed = extractEnrichmentPayload(fs.readFileSync(codexOutput, 'utf-8'))
    const validated = validateEnrichmentPayload(parsed)
    if (!validated.ok) {
      throw new Error(validated.error)
    }
    fs.mkdirSync(path.dirname(normalizedOutput), { recursive: true })
    fs.writeFileSync(normalizedOutput, `${JSON.stringify(validated.value, null, 2)}\n`, 'utf-8')
    return
  }

  throw new Error(
    'Uso: --prompt-file ... --context-file ... --prompt-out ... o --codex-output ... --normalized-out ...',
  )
}

const currentFile = fileURLToPath(import.meta.url)
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  runCli()
}
