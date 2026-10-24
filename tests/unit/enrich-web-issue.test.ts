import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join, delimiter } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  composeEnrichedBody,
  parseAgentPlan,
  publishPlan,
  splitReportBody,
} from '../../.github/scripts/enrich-web-issue.mjs'

const plan = {
  body: '## Descripción\nEl filtro no persiste.\n\n## Notas técnicas\nComprobado en el código.',
  brief: '## Agent Brief\n**Criterios de aceptación:**\n- [ ] El filtro persiste.',
  relatedNumbers: [7, 999],
  uiChange: false,
  duplicate: null,
  category: 'bug',
  triage: {
    status: 'ready-for-agent',
    reason: 'El comportamiento pedido y los criterios están definidos.',
  },
  pendingDecisions: [],
}
const body =
  '## Reporte desde la web\n\n### Resumen\nEl filtro no persiste\n\n### Adjuntos\n![captura](https://github.com/user-attachments/assets/123)\n\n### Contexto de ejecución\n- Ruta: /movimientos\n\n### Reportero\n- Email: PRIVATE_MARKER'
const issue = { number: 12, body, state: 'open', labels: [{ name: 'source:web-report' }] }
const snapshot = {
  repository: 'org/repo',
  issue,
  candidates: { issues: [{ number: 7, state: 'open' }] },
}
const briefUrl = 'https://github.com/org/repo/issues/12#issuecomment-45'
const readyLabels = ['source:web-report', 'bug', 'ready-for-agent']
const duplicateLabels = ['source:web-report', 'bug']
const comment = {
  id: 45,
  html_url: briefUrl,
  body: `${plan.brief}\n\n<!-- web-report-agent-brief -->`,
}

function events(result: unknown) {
  return [
    { type: 'step_start' },
    {
      type: 'tool_use',
      part: { tool: 'skill', state: { status: 'completed', input: { name: 'create-issue' } } },
    },
    {
      type: 'tool_use',
      part: {
        tool: 'read',
        state: { status: 'completed', input: { filePath: 'src/lib/server/github-issues.ts' } },
      },
    },
    {
      type: 'tool_use',
      part: {
        tool: 'read',
        state: {
          status: 'completed',
          input: { filePath: '.scratch/issue-enrichment/discussion.json' },
        },
      },
    },
    { type: 'text', part: { text: 'Texto intermedio' } },
    { type: 'step_start' },
    { type: 'text', part: { text: JSON.stringify(result) } },
    { type: 'step_finish', part: { reason: 'stop' } },
  ]
    .map((event) => JSON.stringify(event))
    .join('\n')
}

describe('plan del agente de GitHub Actions', () => {
  it('extrae el JSON final después de los pasos de análisis', () => {
    expect(parseAgentPlan(events(plan))).toEqual(plan)
  })

  it.each(['skill', 'read', 'step_finish'])('rechaza un análisis que no completa %s', (missing) => {
    const output = events(plan)
      .split('\n')
      .filter((line) => {
        const event = JSON.parse(line)
        return event.type !== missing && event.part?.tool !== missing
      })
      .join('\n')
    expect(() => parseAgentPlan(output)).toThrow('El análisis debe terminar')
  })

  it.each(['invalid', 'error', 'shape'])('rechaza una salida %s sin publicarla', (kind) => {
    const output =
      kind === 'invalid'
        ? 'no es JSON'
        : kind === 'error'
          ? JSON.stringify({ type: 'error', error: 'fallo del agente' })
          : events({ ...plan, brief: 'sin criterios' })
    expect(() => parseAgentPlan(output)).toThrow()
  })

  it('retira los metadatos del contexto que recibe el modelo y conserva las capturas para publicar', () => {
    expect(splitReportBody(body).report).toBe(
      '## Reporte desde la web\n\n### Resumen\nEl filtro no persiste',
    )
    const enriched = composeEnrichedBody(plan, snapshot, briefUrl)
    expect(enriched).toContain(plan.body)
    expect(enriched).not.toContain('### Resumen')
    expect(enriched).toContain(splitReportBody(body).preserved)
    expect(enriched).toContain('Relacionada: https://github.com/org/repo/issues/7')
    expect(enriched).not.toContain('issues/999')
    expect(enriched).toContain(`[Agent Brief](${briefUrl})`)
  })
})

describe('publicación del análisis', () => {
  it('publica el brief, sustituye el cuerpo y verifica el resultado', async () => {
    const enrichedBody = composeEnrichedBody(plan, snapshot, briefUrl)
    const api = vi
      .fn()
      .mockResolvedValueOnce(issue)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(comment)
      .mockResolvedValueOnce(issue)
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ body: enrichedBody, labels: readyLabels.map((name) => ({ name })) })
    expect(await publishPlan(plan, snapshot, api)).toBe('published')
    expect(api.mock.calls[2]).toEqual([
      'repos/org/repo/issues/12/comments',
      'POST',
      { body: `${plan.brief}\n\n<!-- web-report-agent-brief -->` },
    ])
    expect(api.mock.calls[4]).toEqual([
      'repos/org/repo/issues/12',
      'PATCH',
      { body: enrichedBody, labels: readyLabels },
    ])
  })

  it('rechaza una edición humana posterior al snapshot sin escribir', async () => {
    const api = vi.fn().mockResolvedValueOnce({ ...issue, body: 'Editado por la persona' })
    await expect(publishPlan(plan, snapshot, api)).rejects.toThrow('cambió durante el análisis')
    expect(api).toHaveBeenCalledTimes(1)
  })

  it('detecta una edición humana mientras se publicaba el brief y conserva su cuerpo', async () => {
    const api = vi
      .fn()
      .mockResolvedValueOnce(issue)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(comment)
      .mockResolvedValueOnce({ ...issue, body: 'Edición humana nueva' })
    await expect(publishPlan(plan, snapshot, api)).rejects.toThrow('cambió durante la publicación')
    expect(
      api.mock.calls.filter(
        (call) => call[0] === 'repos/org/repo/issues/12' && call[1] === 'PATCH',
      ),
    ).toHaveLength(0)
  })

  it('un reintento recupera el brief ya publicado, sin duplicar comentarios', async () => {
    const api = vi
      .fn()
      .mockResolvedValueOnce(issue)
      .mockResolvedValueOnce([
        { ...comment, body: '<!-- web-report-agent-brief -->', user: { type: 'Bot' } },
      ])
      .mockResolvedValueOnce(comment)
      .mockResolvedValueOnce(issue)
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        body: composeEnrichedBody(plan, snapshot, briefUrl),
        labels: readyLabels.map((name) => ({ name })),
      })
    await publishPlan(plan, snapshot, api)
    expect(api.mock.calls[2][0]).toBe('repos/org/repo/issues/comments/45')
    expect(api.mock.calls[2][1]).toBe('PATCH')
    expect(api.mock.calls.filter((call) => call[1] === 'POST')).toHaveLength(0)
  })

  it('un workflow ya completado no duplica el brief ni sobrescribe otra vez', async () => {
    const api = vi.fn().mockResolvedValueOnce({
      ...issue,
      body: composeEnrichedBody(plan, snapshot, briefUrl),
      labels: readyLabels.map((name) => ({ name })),
    })
    expect(await publishPlan(plan, snapshot, api)).toBe('already-enriched')
    expect(api).toHaveBeenCalledTimes(1)
  })

  it('si falla publicar el brief, conserva el cuerpo original', async () => {
    const api = vi
      .fn()
      .mockResolvedValueOnce(issue)
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('GitHub 500'))
    await expect(publishPlan(plan, snapshot, api)).rejects.toThrow('GitHub 500')
    expect(api.mock.calls.filter((call) => call[1] === 'PATCH')).toHaveLength(0)
  })

  it('no modifica una issue que se cerró durante el análisis', async () => {
    const api = vi.fn().mockResolvedValueOnce({ ...issue, state: 'closed' })
    expect(await publishPlan(plan, snapshot, api)).toBe('closed')
    expect(api).toHaveBeenCalledTimes(1)
  })
})

describe('cierre nativo como duplicada', () => {
  const duplicatePlan = {
    ...plan,
    duplicate: { number: 7, reason: 'Coinciden el fallo de persistencia y el alcance del filtro.' },
  }
  const target = { number: 7, id: 9007, state: 'open' }
  const nativeResult = {
    data: {
      repository: {
        issue: {
          state: 'CLOSED',
          stateReason: 'DUPLICATE',
          duplicateOf: {
            number: 7,
            url: 'https://github.com/org/repo/issues/7',
            repository: { nameWithOwner: 'org/repo' },
          },
        },
      },
    },
  }

  function publisher(result: unknown = nativeResult) {
    const commentBody = `${plan.brief}\n\n**Motivo del cierre como duplicada:** ${duplicatePlan.duplicate.reason}\n\n<!-- web-report-agent-brief -->`
    const enrichedBody = composeEnrichedBody(duplicatePlan, snapshot, briefUrl)
    const api = vi
      .fn()
      .mockResolvedValueOnce(issue)
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ ...comment, body: commentBody })
      .mockResolvedValueOnce(issue)
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        body: enrichedBody,
        labels: duplicateLabels.map((name) => ({ name })),
      })
      .mockResolvedValueOnce(result)
    return { api, enrichedBody }
  }

  it('cierra con state_reason duplicate y el id de base de datos de la principal, conservando adjuntos', async () => {
    const { api, enrichedBody } = publisher()
    expect(await publishPlan(duplicatePlan, snapshot, api)).toBe('closed-as-duplicate')
    expect(api.mock.calls[5]).toEqual([
      'repos/org/repo/issues/12',
      'PATCH',
      {
        body: enrichedBody,
        labels: duplicateLabels,
        state: 'closed',
        state_reason: 'duplicate',
        duplicate_issue_id: 9007,
      },
    ])
    expect(enrichedBody).toContain(splitReportBody(body).preserved)
    expect(enrichedBody).not.toContain('Relacionada: https://github.com/org/repo/issues/7')
    expect(enrichedBody).not.toContain('Duplicate of')
    expect(api.mock.calls[7][0]).toBe('graphql')
  })

  it.each(['unknown', 'self', 'closed', 'truncated'])(
    'rechaza una decisión %s sin escribir en GitHub',
    async (kind) => {
      const candidates =
        kind === 'closed'
          ? [{ number: 7, state: 'closed' }]
          : kind === 'truncated'
            ? [{ number: 7, state: 'open', truncated: true }]
            : snapshot.candidates.issues
      const number = kind === 'unknown' ? 999 : kind === 'self' ? 12 : 7
      const api = vi.fn().mockResolvedValueOnce(issue)
      await expect(
        publishPlan(
          { ...duplicatePlan, duplicate: { ...duplicatePlan.duplicate, number } },
          { ...snapshot, candidates: { issues: candidates } },
          api,
        ),
      ).rejects.toThrow('candidata abierta')
      expect(api).toHaveBeenCalledTimes(1)
    },
  )

  it('no cierra si la principal se ha cerrado desde la búsqueda', async () => {
    const api = vi
      .fn()
      .mockResolvedValueOnce(issue)
      .mockResolvedValueOnce({ ...target, state: 'closed' })
    await expect(publishPlan(duplicatePlan, snapshot, api)).rejects.toThrow(
      'ya no es una candidata válida',
    )
    expect(api).toHaveBeenCalledTimes(2)
  })

  it.each(['completed', 'wrong-target', 'wrong-repo', 'graphql-error'])(
    'no confirma el cierre si GitHub devuelve %s',
    async (kind) => {
      const result = structuredClone(nativeResult)
      if (kind === 'completed') result.data.repository.issue.stateReason = 'COMPLETED'
      if (kind === 'wrong-target') result.data.repository.issue.duplicateOf.number = 8
      if (kind === 'wrong-repo')
        result.data.repository.issue.duplicateOf.repository.nameWithOwner = 'org/otro'
      const { api } = publisher(
        kind === 'graphql-error' ? { ...result, errors: [{ message: 'denied' }] } : result,
      )
      await expect(publishPlan(duplicatePlan, snapshot, api)).rejects.toThrow(
        'verificar el cierre nativo',
      )
    },
  )

  it('exige un motivo cuando el agente decide cerrar una duplicada', () => {
    expect(() =>
      parseAgentPlan(events({ ...duplicatePlan, duplicate: { number: 7, reason: '' } })),
    ).toThrow()
  })
})

function runAnalysisWithCli(source: string) {
  const folder = mkdtempSync(join(tmpdir(), 'issue enrichment-'))
  try {
    const bin = join(folder, 'bin')
    const context = join(folder, '.scratch', 'issue-enrichment')
    const privateDir = join(folder, 'private', 'issue-enrichment')
    mkdirSync(bin, { recursive: true })
    mkdirSync(context, { recursive: true })
    mkdirSync(privateDir, { recursive: true })
    writeFileSync(join(context, 'context.json'), JSON.stringify({ report: 'Datos sintéticos' }))
    writeFileSync(join(bin, 'opencode'), `#!/usr/bin/env node\n${source}`, { mode: 0o755 })
    const result = spawnSync(
      process.execPath,
      [resolve('.github/scripts/enrich-web-issue.mjs'), 'analyze'],
      {
        cwd: folder,
        encoding: 'utf8',
        timeout: 10_000,
        env: {
          ...process.env,
          RUNNER_TEMP: join(folder, 'private'),
          PATH: `${bin}${delimiter}${process.env.PATH}`,
        },
      },
    )
    return {
      result,
      plan:
        result.status === 0
          ? JSON.parse(readFileSync(join(privateDir, 'plan.json'), 'utf8'))
          : null,
    }
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
}

describe('invocación de OpenCode desde el script de Actions', () => {
  it('envía el prompt como mensaje y deja solo archivos tras la opción variádica --file', () => {
    // Contrato de OpenCode 1.19.4: --file consume todos los argumentos siguientes.
    const { result, plan: savedPlan } = runAnalysisWithCli(`
const fs = require('node:fs')
const args = process.argv.slice(2)
const files = args.slice(args.indexOf('--file') + 1)
for (const file of files) {
  if (!fs.existsSync(file)) {
    process.stderr.write('File not found: ' + file)
    process.exit(1)
  }
}
process.stdout.write(${JSON.stringify(events(plan))})
`)
    expect(result.status, result.stderr).toBe(0)
    expect(savedPlan).toEqual(plan)
  })

  it.each([
    ['File not found: PRIVATE_MARKER', 'opencode-attachment'],
    ['upstream error PRIVATE_MARKER', 'opencode-exit-1'],
  ])('clasifica el fallo del CLI sin exponer stderr: %s', (stderr, reason) => {
    const { result, plan: savedPlan } = runAnalysisWithCli(
      `process.stderr.write(${JSON.stringify(stderr)}); process.exit(1)`,
    )
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(`[issue-enrichment] analyze: ${reason}.`)
    expect(result.stderr).not.toContain('PRIVATE_MARKER')
    expect(savedPlan).toBeNull()
  })
})
