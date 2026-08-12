/**
 * El modo demo usa un dataset sintético generado en el cliente y claves de
 * localStorage con sufijo propio. Nunca lee ni escribe estado en D1.
 *
 * La activación ocurre antes de que cargue cualquier script de la app
 * (script inline en FinanceTrackerShell.astro): el menú de usuario o
 * `?demo=1` persisten el flag y fijan `window.__FINANCE_NAMESPACE__ = 'demo'`;
 * `?demo=0`, el mismo menú o el botón del distintivo lo desactivan.
 */
export const DEMO_NAMESPACE = 'demo'
export const DEMO_MODE_STORAGE_KEY = 'finance-demo-mode'
export const DEMO_MODE_COOKIE = 'finance-demo-mode'

function setDemoCookie(enabled: boolean): void {
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = enabled
    ? `${DEMO_MODE_COOKIE}=1; Path=/; Max-Age=2592000; SameSite=Lax${secure}`
    : `${DEMO_MODE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`
}

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

  setDemoCookie(enabled)

  window.location.reload()
}
