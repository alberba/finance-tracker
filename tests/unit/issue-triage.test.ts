import { describe, expect, it, vi } from 'vitest'
import {
  composeEnrichedBody,
  parseAgentPlan,
  publishPlan,
} from '../../.github/scripts/enrich-web-issue.mjs'

const plan = {
  body: '## Descripción\nHace falta un historial de reportes.\n\n## Notas técnicas\nNo existe esa vista.',
  brief:
    '## Agent Brief\n**Criterios de aceptación:**\n- [ ] Consultar el historial tras recargar.',
  category: 'feature',
  triage: {
    status: 'ready-for-agent',
    reason: 'Alcance y criterios definidos sin decisiones abiertas.',
  },
  pendingDecisions: [] as string[],
  duplicate: null,
  relatedNumbers: [],
  uiChange: false,
}
const issue = {
  number: 12,
  body: 'Reporte original\n\n### Contexto de ejecución\n- Tipo: bug',
  state: 'open',
  labels: ['source:web-report', 'bug', 'status:triage', 'needs-info', 'P1'].map((name) => ({
    name,
  })),
}
const briefUrl = 'https://github.com/org/repo/issues/12#issuecomment-45'

function scenario(initial = issue) {
  let current = structuredClone(initial)
  const comments: Array<{ id: number; body: string; html_url: string; user: { type: string } }> = []
  const snapshot = {
    repository: 'org/repo',
    issue: structuredClone(initial),
    candidates: { issues: [] },
    discussion: [],
    reprocess: false,
    existingBriefUrl: undefined as string | undefined,
  }
  const api = vi.fn(async (endpoint: string, method = 'GET', body?: Record<string, unknown>) => {
    if (endpoint.startsWith('repos/org/repo/labels/'))
      return { name: decodeURIComponent(endpoint.split('/').at(-1)!) }
    if (endpoint.startsWith('repos/org/repo/issues/comments/')) {
      const id = Number(endpoint.split('/').at(-1))
      const existing = comments.find((comment) => comment.id === id)!
      existing.body = String(body?.body)
      return structuredClone(existing)
    }
    if (endpoint.startsWith('repos/org/repo/issues/12/comments')) {
      if (method === 'GET') return structuredClone(comments)
      const comment = {
        id: 45,
        body: String(body?.body),
        html_url: briefUrl,
        user: { type: 'Bot' },
      }
      comments.push(comment)
      return comment
    }
    if (endpoint === 'repos/org/repo/issues/12') {
      if (method === 'PATCH') {
        current = {
          ...current,
          ...body,
          labels: Array.isArray(body?.labels)
            ? body.labels.map((name) => ({ name: String(name) }))
            : current.labels,
        }
      }
      return structuredClone(current)
    }
    throw new Error(`Petición inesperada: ${method} ${endpoint}`)
  })
  return { api, snapshot, comments, current: () => current }
}

function events(result: unknown) {
  return [
    { type: 'step_start' },
    {
      type: 'tool_use',
      part: { tool: 'skill', state: { status: 'completed', input: { id: 'create-issue' } } },
    },
    {
      type: 'tool_use',
      part: {
        tool: 'read',
        state: { status: 'completed', input: { path: 'src/lib/server/github-issues.ts' } },
      },
    },
    {
      type: 'tool_use',
      part: {
        tool: 'read',
        state: {
          status: 'completed',
          input: { path: '.scratch/issue-enrichment/discussion.json' },
        },
      },
    },
    { type: 'text', part: { text: JSON.stringify(result) } },
    { type: 'step_finish', part: { reason: 'stop' } },
  ]
    .map((event) => JSON.stringify(event))
    .join('\n')
}

describe('clasificación y preparación del reporte', () => {
  it('corrige bug a feature y aplica solo ready-for-agent después de publicar el brief', async () => {
    const { api, snapshot, current } = scenario()
    await publishPlan(plan, snapshot, api)
    expect(
      current()
        .labels.map((label) => label.name)
        .sort(),
    ).toEqual(['P1', 'feature', 'ready-for-agent', 'source:web-report'].sort())
    const briefIndex = api.mock.calls.findIndex(
      (call) => call[1] === 'POST' && call[0].endsWith('/comments'),
    )
    const updateIndex = api.mock.calls.findIndex(
      (call) => call[1] === 'PATCH' && call[0].endsWith('/12'),
    )
    expect(briefIndex).toBeGreaterThanOrEqual(0)
    expect(updateIndex).toBeGreaterThan(briefIndex)
  })

  it('publica en el cuerpo las decisiones que bloquean implementar y aplica needs-info', async () => {
    const { api, snapshot, current } = scenario()
    const pending = {
      ...plan,
      triage: { status: 'needs-info', reason: 'Falta decidir el canal del acuse.' },
      pendingDecisions: ['¿El acuse debe aparecer en la app, por email o en ambos?'],
    }
    await publishPlan(pending, snapshot, api)
    expect(current().body).toContain('## Decisiones pendientes')
    expect(current().body).toContain(pending.pendingDecisions[0])
    expect(current().labels.map((label) => label.name)).toContain('needs-info')
    expect(current().labels.map((label) => label.name)).not.toContain('ready-for-agent')
  })

  it('rechaza ready-for-agent cuando el agente declara decisiones pendientes', () => {
    expect(() =>
      parseAgentPlan(
        events({ ...plan, pendingDecisions: ['Decidir si se puede editar el cuerpo.'] }),
      ),
    ).toThrow()
  })

  it('no permite declarar lista una issue sin leer su discusión', () => {
    const output = events(plan)
      .split('\n')
      .filter((line) => !line.includes('discussion.json'))
      .join('\n')
    expect(() => parseAgentPlan(output)).toThrow('la discusión')
  })

  it('no añade decisiones vacías a un reporte listo', () => {
    const { snapshot } = scenario()
    expect(composeEnrichedBody(plan, snapshot, briefUrl)).not.toContain('## Decisiones pendientes')
  })
  it('no aplica ready-for-agent si cambia la discusión después de tomar el snapshot', async () => {
    const { api, snapshot, comments, current } = scenario()
    comments.push({
      id: 99,
      body: 'Falta decidir un nuevo requisito.',
      html_url: `${briefUrl}-99`,
      user: { type: 'User' },
    })
    await expect(publishPlan(plan, snapshot, api)).rejects.toThrow('La discusión cambió')
    expect(current().body).toBe(issue.body)
    expect(current().labels.map((label) => label.name)).not.toContain('ready-for-agent')
  })

  it('no aplica labels cuando GitHub no verifica el brief publicado', async () => {
    const { api, snapshot, current } = scenario()
    const publish = async (endpoint: string, method?: string, body?: Record<string, unknown>) => {
      const result = await api(endpoint, method, body)
      return method === 'POST' && endpoint.endsWith('/comments')
        ? { ...result, body: 'otro texto' }
        : result
    }
    await expect(publishPlan(plan, snapshot, publish)).rejects.toThrow('verificar el brief')
    expect(current().labels.map((label) => label.name)).not.toContain('ready-for-agent')
    expect(current().body).toBe(issue.body)
  })

  it('permite reevaluar una issue enriquecida y retira preguntas y estados ya resueltos', async () => {
    const pending = {
      ...plan,
      triage: { status: 'needs-info', reason: 'Falta el canal.' },
      pendingDecisions: ['¿App o email?'],
    }
    const original = {
      ...issue,
      body: composeEnrichedBody(pending, { ...scenario().snapshot }, briefUrl),
    }
    const { api, snapshot, comments, current } = scenario(original)
    snapshot.reprocess = true
    snapshot.existingBriefUrl = briefUrl
    comments.push({
      id: 45,
      body: `${pending.brief}\n\n<!-- web-report-agent-brief -->`,
      html_url: briefUrl,
      user: { type: 'Bot' },
    })
    await publishPlan(plan, snapshot, api)
    expect(current().body).not.toContain('## Decisiones pendientes')
    expect(current().body.split('[Agent Brief](')).toHaveLength(2)
    expect(comments).toHaveLength(1)
    expect(current().labels.map((label) => label.name)).toContain('ready-for-agent')
    expect(current().labels.map((label) => label.name)).not.toContain('needs-info')
  })

  it('exige preguntas concretas cuando falta información del usuario', () => {
    expect(() =>
      parseAgentPlan(
        events({ ...plan, triage: { status: 'needs-info', reason: 'Faltan datos.' } }),
      ),
    ).toThrow()
  })
})
