/**
 * El modo demo apunta toda la app al namespace de estado `demo`: una fila D1
 * separada y claves de localStorage con sufijo propio, de forma que los datos
 * reales del namespace por defecto nunca se leen ni se escriben mientras se
 * presenta la aplicación en público.
 *
 * La activación ocurre antes de que cargue cualquier script de la app
 * (script inline en FinanceTrackerShell.astro): el menú de usuario o
 * `?demo=1` persisten el flag y fijan `window.__FINANCE_NAMESPACE__ = 'demo'`;
 * `?demo=0`, el mismo menú o el botón del distintivo lo desactivan.
 */
export const DEMO_NAMESPACE = 'demo'
export const DEMO_MODE_STORAGE_KEY = 'finance-demo-mode'

export function resolveRuntimeNamespace(): string {
  if (typeof window === 'undefined') {
    return ''
  }

  const candidate = String(
    (window as Window & { __FINANCE_NAMESPACE__?: string }).__FINANCE_NAMESPACE__ || '',
  )
    .trim()
    .toLowerCase()
  if (!candidate) {
    return ''
  }

  return candidate.replace(/[^a-z0-9_-]/g, '').slice(0, 64)
}

export function isDemoMode(): boolean {
  return resolveRuntimeNamespace() === DEMO_NAMESPACE
}

export function setDemoModeEnabled(enabled: boolean): void {
  try {
    if (enabled) {
      localStorage.setItem(DEMO_MODE_STORAGE_KEY, '1')
    } else {
      localStorage.removeItem(DEMO_MODE_STORAGE_KEY)
    }
  } catch {
    // La recarga mantiene el comportamiento seguro aunque storage no esté disponible.
  }

  window.location.reload()
}
