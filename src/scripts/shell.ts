import { isDemoMode, setDemoModeEnabled } from './demo-mode'
import { requestReportDialogOpen } from './report-dialog'
import { getThemeController } from '../lib/client/theme'
import { wipeAllClientData, wipeLegacyClientData } from '../lib/client/wipe'
import { pinia } from '../stores/pinia'
import { useSyncStore } from '../stores/sync'
import { authentication, requireAuthenticationResult } from '../lib/client/authentication'
import { describeCheckAge } from '../lib/client/sync-connection'

const SIDEBAR_COLLAPSED_KEY = 'sidebar-collapsed'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function writeStorageValue(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    return
  }
}

function applySidebarState(collapsed: boolean, toggleButton: HTMLElement): void {
  document.documentElement.dataset.sidebar = collapsed ? 'collapsed' : 'expanded'
  toggleButton.setAttribute(
    'aria-label',
    collapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral',
  )
  toggleButton.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
  toggleButton
    .querySelector('[data-sidebar-toggle-label]')
    ?.replaceChildren(collapsed ? 'Expandir' : 'Colapsar')
}

function initSidebarToggle(): void {
  const toggleButton = document.getElementById('sidebar-toggle')
  if (!toggleButton) {
    return
  }

  // The pre-paint script already set data-sidebar; this syncs the button.
  applySidebarState(document.documentElement.dataset.sidebar === 'collapsed', toggleButton)

  toggleButton.addEventListener('click', () => {
    const nextCollapsed = document.documentElement.dataset.sidebar !== 'collapsed'
    applySidebarState(nextCollapsed, toggleButton)
    writeStorageValue(SIDEBAR_COLLAPSED_KEY, nextCollapsed ? 'true' : 'false')
  })
}

function repaintThemeAwareCharts(): void {
  const renderAll = (window as Window & { __ftRenderAll?: () => void }).__ftRenderAll
  if (typeof renderAll === 'function') {
    requestAnimationFrame(() => {
      renderAll()
    })
  }
}

/** Starts the theme controller (so "Sistema" tracks the OS) and repaints charts on change. */
function initTheme(): void {
  getThemeController().subscribe(repaintThemeAwareCharts)
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
  action
    .querySelector('[data-demo-mode-label]')
    ?.replaceChildren(active ? 'Salir del modo demo' : 'Activar modo demo')
  action
    .querySelector('[data-demo-mode-description]')
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
    const nextOpen = Boolean(menu.hidden)
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
 * Wires the menu's identity and logout entries for every authenticated
 * session. Authenticated sync always uses the per-user v2 store; logout also
 * clears any stale client data left by an older build.
 */
function initSyncMenu(): void {
  if (isDemoMode()) {
    return
  }

  const emailEl = document.getElementById('sidebar-user-email')
  const statusEl = document.getElementById('sidebar-sync-status')
  const logoutAction = document.querySelector<HTMLElement>('[data-logout-action]')
  const syncStore = useSyncStore(pinia)

  const sessionRequest = fetch('/api/session')
    .then((response) => (response.ok ? response.json() : null))
    .then((body: { user?: { id?: string; email?: string }; authentication?: string } | null) => {
      if (emailEl && body?.user?.email) {
        emailEl.replaceChildren(body.user.email)
      }
      if (body?.user?.id) {
        void syncStore.init(body.user.id, { email: body.user.email ?? null })
      }
      return body
    })
    .catch(() => {
      /* Logout still clears stale local data when session lookup fails. */
      return null
    })

  if (syncStore) {
    const renderStatus = () => {
      if (!statusEl) {
        return
      }
      const pending = syncStore.pendingCount
      const label = SYNC_STATUS_LABELS[syncStore.syncStatus] ?? syncStore.syncStatus
      const suffix = pending > 0 ? ` (${pending} pendiente${pending === 1 ? '' : 's'})` : ''
      const checked =
        syncStore.lastCheckedAt === null
          ? ''
          : ` · ${describeCheckAge(Date.now() - syncStore.lastCheckedAt)}`
      statusEl.hidden = false
      statusEl.replaceChildren(`${label}${suffix}${checked}`)
    }

    syncStore.$subscribe(renderStatus)
    renderStatus()
    setInterval(renderStatus, 1000)
  }

  logoutAction?.addEventListener('click', () => {
    logoutAction.setAttribute('aria-disabled', 'true')
    void sessionRequest
      .then(async (session) => {
        if (syncStore?.userId) {
          try {
            await syncStore.prepareLogout()
          } catch {
            const discardPending = window.confirm(
              'Hay cambios pendientes que no se pudieron sincronizar. ¿Descartarlos definitivamente y cerrar sesión?',
            )
            if (!discardPending) {
              logoutAction.removeAttribute('aria-disabled')
              return
            }
          }
        }
        await requireAuthenticationResult(await authentication.signOut())
        if (syncStore?.userId) await syncStore.logout({ discardPending: true })
        else if (session?.user?.id) await wipeAllClientData(session.user.id)
        else wipeLegacyClientData()
        window.location.href = '/login'
      })
      .catch((error: unknown) => {
        logoutAction.removeAttribute('aria-disabled')
        console.error('No se pudo cerrar sesión.', error)
      })
  })
}

function initShellInteractions(): void {
  initSidebarToggle()
  initTheme()
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
