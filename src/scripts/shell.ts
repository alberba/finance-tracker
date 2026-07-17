import { isDemoMode, setDemoModeEnabled } from './demo-mode'

const SIDEBAR_COLLAPSED_KEY = 'sidebar-collapsed'
const THEME_KEY = 'theme'

function readStorageValue(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorageValue(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    return
  }
}

function applySidebarState(collapsed: boolean, body: HTMLElement, toggleButton: HTMLElement): void {
  body.classList.toggle('is-sidebar-collapsed', collapsed)
  toggleButton.setAttribute(
    'aria-label',
    collapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral',
  )
  toggleButton.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
  toggleButton
    .querySelector('.sidebar-toggle-label')
    ?.replaceChildren(collapsed ? 'Expandir' : 'Colapsar')
}

function initSidebarToggle(): void {
  const body = document.body
  const toggleButton = document.getElementById('sidebar-toggle')
  if (!body || !toggleButton) {
    return
  }

  const collapsed = readStorageValue(SIDEBAR_COLLAPSED_KEY) === 'true'
  applySidebarState(collapsed, body, toggleButton)

  toggleButton.addEventListener('click', () => {
    const nextCollapsed = !body.classList.contains('is-sidebar-collapsed')
    applySidebarState(nextCollapsed, body, toggleButton)
    writeStorageValue(SIDEBAR_COLLAPSED_KEY, nextCollapsed ? 'true' : 'false')
  })
}

function syncThemeToggleLabel(button: HTMLElement): void {
  const isDark = document.documentElement.dataset.theme === 'dark'
  button.setAttribute('aria-label', isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro')
  button
    .querySelector('.theme-toggle-label')
    ?.replaceChildren(isDark ? 'Modo claro' : 'Modo oscuro')
}

function repaintThemeAwareCharts(): void {
  const renderAll = (window as Window & { __ftRenderAll?: () => void }).__ftRenderAll
  if (typeof renderAll === 'function') {
    requestAnimationFrame(() => {
      renderAll()
    })
  }
}

function initThemeToggle(): void {
  const button = document.getElementById('theme-toggle')
  if (!button) {
    return
  }

  syncThemeToggleLabel(button)
  button.addEventListener('click', () => {
    const isDark = document.documentElement.dataset.theme === 'dark'
    const nextTheme = isDark ? 'light' : 'dark'
    document.documentElement.dataset.theme = nextTheme
    writeStorageValue(THEME_KEY, nextTheme)
    syncThemeToggleLabel(button)
    repaintThemeAwareCharts()
  })
}

function setUserMenuOpen(menu: HTMLElement, trigger: HTMLElement, open: boolean): void {
  menu.hidden = !open
  trigger.setAttribute('aria-expanded', open ? 'true' : 'false')
  trigger.setAttribute('aria-label', open ? 'Cerrar menú de usuario' : 'Abrir menú de usuario')
}

function syncDemoModeAction(action: HTMLElement): void {
  const active = isDemoMode()
  action.dataset.active = active ? 'true' : 'false'
  action
    .querySelector('.demo-mode-action-label')
    ?.replaceChildren(active ? 'Salir del modo demo' : 'Activar modo demo')
  action
    .querySelector('.demo-mode-action-description')
    ?.replaceChildren(active ? 'Volver a tus datos privados' : 'Usar únicamente datos ficticios')
}

function initUserMenu(): void {
  const root = document.getElementById('sidebar-user-menu-root')
  const trigger = document.getElementById('sidebar-user-menu-toggle')
  const menu = document.getElementById('sidebar-user-menu')
  const demoAction = document.getElementById('demo-mode-menu-action')
  if (!root || !trigger || !menu || !demoAction) return

  syncDemoModeAction(demoAction)
  trigger.addEventListener('click', () => {
    const nextOpen = menu.hidden
    setUserMenuOpen(menu, trigger, nextOpen)
    if (nextOpen) demoAction.focus()
  })
  demoAction.addEventListener('click', () => setDemoModeEnabled(!isDemoMode()))
  document.addEventListener('click', (event) => {
    if (!root.contains(event.target as Node)) setUserMenuOpen(menu, trigger, false)
  })
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || menu.hidden) return
    setUserMenuOpen(menu, trigger, false)
    trigger.focus()
  })
}

function initDemoBanner(): void {
  if (!isDemoMode()) return
  const banner = document.getElementById('demo-banner')
  const exit = document.getElementById('demo-banner-exit')
  if (!banner || !exit) return

  banner.hidden = false
  exit.addEventListener('click', () => setDemoModeEnabled(false))
}

function initShellInteractions(): void {
  initSidebarToggle()
  initThemeToggle()
  initUserMenu()
  initDemoBanner()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initShellInteractions, { once: true })
} else {
  initShellInteractions()
}
