import { isDemoMode, setDemoModeEnabled } from './demo-mode'
import { requestReportDialogOpen } from './report-dialog'
import { isSyncV2Enabled } from '../lib/client/feature-flags'
import { pinia } from '../stores/pinia'
import { useSyncStore } from '../stores/sync'

const SIDEBAR_COLLAPSED_KEY = 'sidebar-collapsed'
const THEME_KEY = 'theme'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

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

function syncAllThemeToggleLabels(): void {
  document.querySelectorAll<HTMLElement>('[data-theme-toggle]').forEach(syncThemeToggleLabel)
}

function initThemeToggles(): void {
  const buttons = document.querySelectorAll<HTMLElement>('[data-theme-toggle]')
  if (buttons.length === 0) {
    return
  }

  syncAllThemeToggleLabels()
  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const isDark = document.documentElement.dataset.theme === 'dark'
      const nextTheme = isDark ? 'light' : 'dark'
      document.documentElement.dataset.theme = nextTheme
      writeStorageValue(THEME_KEY, nextTheme)
      syncAllThemeToggleLabels()
      repaintThemeAwareCharts()
    })
  })
}

function initMobileMoreMenu(): void {
  const dialog = document.getElementById('mobile-more-menu')
  const trigger = document.querySelector<HTMLElement>('[data-mobile-more-trigger]')
  const closeButton = dialog?.querySelector<HTMLElement>('[data-mobile-more-close]')
  if (!(dialog instanceof HTMLDialogElement) || !trigger) {
    return
  }

  const close = () => {
    if (dialog.open) {
      dialog.close()
    }
  }

  trigger.addEventListener('click', () => {
    if (!dialog.open) {
      dialog.showModal()
    }
  })
  closeButton?.addEventListener('click', close)
  dialog.addEventListener('click', (event) => {
    if (
      event.target === dialog ||
      (event.target instanceof Element &&
        event.target.closest('[data-section], [data-report-dialog-open]'))
    ) {
      close()
    }
  })
  dialog.addEventListener('toggle', () => {
    trigger.setAttribute('aria-expanded', dialog.open ? 'true' : 'false')
  })
  dialog.addEventListener('close', () => {
    trigger.setAttribute('aria-expanded', 'false')
  })
}

function initReportDialogActions(): void {
  document.querySelectorAll<HTMLElement>('[data-report-dialog-open]').forEach((action) => {
    action.addEventListener('click', requestReportDialogOpen)
  })
}

function initPwaInstall(): void {
  const installButton = document.getElementById('pwa-install-button')
  if (!(installButton instanceof HTMLButtonElement)) {
    return
  }

  let installPrompt: BeforeInstallPromptEvent | null = null
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    installPrompt = event as BeforeInstallPromptEvent
    installButton.hidden = false
  })
  installButton.addEventListener('click', async () => {
    if (!installPrompt) {
      return
    }
    await installPrompt.prompt()
    await installPrompt.userChoice
    installPrompt = null
    installButton.hidden = true
  })
  window.addEventListener('appinstalled', () => {
    installPrompt = null
    installButton.hidden = true
  })
}

function initServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) {
    return
  }
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').then(async () => {
      const registration = await navigator.serviceWorker.ready
      const resourceUrls = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter((url) => new URL(url).origin === window.location.origin)

      registration.active?.postMessage({
        type: 'CACHE_RESOURCE_URLS',
        urls: ['/', window.location.pathname, ...resourceUrls],
      })
    })
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

function initDemoModeActions(): void {
  document.querySelectorAll<HTMLElement>('[data-demo-mode-action]').forEach((action) => {
    syncDemoModeAction(action)
    action.addEventListener('click', () => setDemoModeEnabled(!isDemoMode()))
  })
}

function initUserMenu(): void {
  const root = document.getElementById('sidebar-user-menu-root')
  const trigger = document.getElementById('sidebar-user-menu-toggle')
  const menu = document.getElementById('sidebar-user-menu')
  const demoAction = root?.querySelector<HTMLElement>('[data-demo-mode-action]')
  if (!root || !trigger || !menu || !demoAction) return

  trigger.addEventListener('click', () => {
    const nextOpen = menu.hidden
    setUserMenuOpen(menu, trigger, nextOpen)
    if (nextOpen) demoAction.focus()
  })
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

const SYNC_STATUS_LABELS: Record<string, string> = {
  idle: 'Sincronizado',
  syncing: 'Sincronizando…',
  error: 'Error de sincronización',
}

/**
 * Wires the menu's email/sync-status/logout entries to `useSyncStore`
 * (WP7). A no-op when `PUBLIC_SYNC_V2` is off — the legacy save-status
 * indicator (`#save-status`, driven by `state-format-helpers.ts`) keeps
 * doing its job until cutover.
 */
function initSyncMenu(): void {
  if (!isSyncV2Enabled() || isDemoMode()) {
    return
  }

  const emailEl = document.getElementById('sidebar-user-email')
  const statusEl = document.getElementById('sidebar-sync-status')
  const logoutAction = document.querySelector<HTMLElement>('[data-logout-action]')
  const syncStore = useSyncStore(pinia)

  fetch('/api/session')
    .then((response) => (response.ok ? response.json() : null))
    .then((body: { user?: { id?: string; email?: string } } | null) => {
      if (!body?.user?.id) {
        return
      }
      void syncStore.init(body.user.id, { email: body.user.email ?? null })
      if (emailEl && body.user.email) {
        emailEl.replaceChildren(body.user.email)
      }
    })
    .catch(() => {
      /* session lookup failed — sync stays disabled for this load */
    })

  const renderStatus = () => {
    if (!statusEl) {
      return
    }
    const pending = syncStore.pendingCount
    const label = SYNC_STATUS_LABELS[syncStore.syncStatus] ?? syncStore.syncStatus
    const suffix = pending > 0 ? ` (${pending} pendiente${pending === 1 ? '' : 's'})` : ''
    statusEl.hidden = false
    statusEl.replaceChildren(`${label}${suffix}`)
  }

  syncStore.$subscribe(renderStatus)
  renderStatus()

  logoutAction?.addEventListener('click', () => {
    void syncStore.logout().finally(() => {
      window.location.href = '/cdn-cgi/access/logout'
    })
  })
}

function initShellInteractions(): void {
  initSidebarToggle()
  initThemeToggles()
  initMobileMoreMenu()
  initReportDialogActions()
  initPwaInstall()
  initServiceWorker()
  initDemoModeActions()
  initUserMenu()
  initDemoBanner()
  initSyncMenu()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initShellInteractions, { once: true })
} else {
  initShellInteractions()
}
