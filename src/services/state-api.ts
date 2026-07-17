import { resolveRuntimeNamespace } from '../scripts/demo-mode'
import type { State } from '../scripts/types'

export const STATE_API_ENDPOINT = '/api/state'

interface StateApiOptions {
  namespace?: string
}

interface LoadStateResponse {
  state?: unknown
  error?: string
}

interface SaveStateResponse {
  ok?: boolean
  error?: string
}

function buildHeaders({ namespace, hasBody }: StateApiOptions & { hasBody: boolean }): Headers {
  const headers = new Headers()

  if (hasBody) {
    headers.set('Content-Type', 'application/json')
  }

  // Sin namespace explícito se usa el del runtime (__FINANCE_NAMESPACE__),
  // igual que la capa legacy, para que demo/E2E aíslen también las islas Vue.
  const effectiveNamespace = namespace || resolveRuntimeNamespace()
  if (effectiveNamespace) {
    headers.set('x-finance-namespace', effectiveNamespace)
  }

  return headers
}

async function readJson<TBody>(response: Response): Promise<TBody> {
  return (await response.json()) as TBody
}

export async function loadStateFromApi(options: StateApiOptions = {}): Promise<unknown | null> {
  const response = await fetch(STATE_API_ENDPOINT, {
    method: 'GET',
    headers: buildHeaders({ ...options, hasBody: false }),
  })
  const body = await readJson<LoadStateResponse>(response)

  if (!response.ok) {
    throw new Error(body.error || 'No se pudo cargar el estado financiero')
  }

  return body.state ?? null
}

export async function saveStateToApi(
  state: State,
  options: StateApiOptions = {},
): Promise<void> {
  const response = await fetch(STATE_API_ENDPOINT, {
    method: 'PUT',
    headers: buildHeaders({ ...options, hasBody: true }),
    body: JSON.stringify({ state }),
  })
  const body = await readJson<SaveStateResponse>(response)

  if (!response.ok || body.ok === false) {
    throw new Error(body.error || 'No se pudo guardar el estado financiero')
  }
}
