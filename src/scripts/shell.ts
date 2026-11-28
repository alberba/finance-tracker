import { isDemoMode, setDemoModeEnabled } from './demo-mode'
import { requestReportDialogOpen } from './report-dialog'
import { useSectionNavigation } from '../composables/useSectionNavigation'
import { initReportsBadge } from './app/reports-badge'
import { getNeonThemeController } from '../lib/client/neon-theme'
import { logOut } from './app/logout'
import { pinia } from '../stores/pinia'
import { useSyncStore } from '../stores/sync'
import { describeCheckAge } from '../lib/client/sync-connection'
import { isRecurringIntentKind, runRecurringIntentAction } from '../lib/client/recurring-write'
import { loadSession } from '../lib/client/session'

/** Starts the theme controller, so a theme with no choice tracks the OS. */
function initTheme(): void {
  getNeonThemeController()
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
  // Picking a destination closes the sheet; `closedby="any"` closes it from the backdrop.
  dialog.addEventListener('click', (event) => {
    if (
      event.target instanceof Element &&
      event.target.closest('[data-section], [data-report-dialog-open], [data-reports-open]')
    ) {
      close()
    }
  })
  if (!('closedBy' in HTMLDialogElement.prototype)) {
    // Safari has no `closedby`: test the pointer position, not the target, since the
    // dialog is also the target for its own padding. Press and release must both
    // land outside, so a drag that ends on the backdrop does not dismiss.
    const outside = (event: PointerEvent) => {
      const rect = dialog.getBoundingClientRect()
      return (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      )
    }
    let pressedOutside = false
    dialog.addEventListener('pointerdown', (event) => {
      pressedOutside = outside(event)
    })
    dialog.addEventListener('pointerup', (event) => {
      if (pressedOutside && outside(event)) close()
    })
  }
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
  const { navigateToReports } = useSectionNavigation()
  document.querySelectorAll<HTMLElement>('[data-reports-open]').forEach((action) => {
    action.addEventListener('click', () => navigateToReports())
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
      warmMonthlyReportPdf()
    })
  })
}

/**
 * Once the browser is idle, fetch what the monthly report's PDF needs (pdfmake and the fonts)
 * so that the service worker keeps it and the report also downloads offline.
 */
function warmMonthlyReportPdf(): void {
  const warm = (): void => {
    void import('../lib/client/monthly-report-pdf').then((module) =>
      module.preloadMonthlyReportPdf(),
    )
  }
  if ('requestIdleCallback' in window) window.requestIdleCallback(warm, { timeout: 10_000 })
  else setTimeout(warm, 5_000)
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
  const intentEl = document.getElementById('sidebar-intent-status')
  const intentMessageEl = intentEl?.querySelector<HTMLElement>('[data-intent-message]')
  const intentActionsEl = intentEl?.querySelector<HTMLElement>('[data-intent-actions]')
  const intentRetryEl = intentEl?.querySelector<HTMLButtonElement>('[data-intent-retry]')
  const intentDiscardEl = intentEl?.querySelector<HTMLButtonElement>('[data-intent-discard]')
  const logoutAction = document.querySelector<HTMLElement>('[data-logout-action]')
  const syncStore = useSyncStore(pinia)

  if (syncStore) {
    /** The first intent that needs the user's attention (retry/discard). */
    const actionableIntent = () =>
      syncStore.intents.find(
        (view) =>
          view.intent.failure !== null || view.steps.some((step) => step.state === 'failed'),
      ) ?? null
    const pendingIntent = () =>
      actionableIntent() ??
      syncStore.intents.find(
        (view) =>
          view.intent.state === 'local-saved' ||
          view.intent.state === 'waiting' ||
          view.intent.state === 'sending',
      ) ??
      null

    const renderStatus = () => {
      // The workspace owns the startup session lookup; the shell only mirrors
      // its identity. A second `/api/session` here delayed every page.
      const email = syncStore.email
      if (emailEl && email && emailEl.textContent !== email) {
        emailEl.replaceChildren(email)
      }
      if (!statusEl) {
        return
      }
      const pending = syncStore.pendingCount
      const failure = actionableIntent()
      const open = pendingIntent()
      // Never present a local acceptance as server confirmation: while an
      // intent is unresolved the label says so instead of "Sincronizado".
      const label = failure
        ? SYNC_STATUS_LABELS.error
        : open && syncStore.syncStatus === 'idle'
          ? open.intent.state === 'sending'
            ? 'Sincronizando…'
            : 'Guardado local'
          : (SYNC_STATUS_LABELS[syncStore.syncStatus] ?? syncStore.syncStatus)
      const suffix = pending > 0 ? ` (${pending} pendiente${pending === 1 ? '' : 's'})` : ''
      const checked =
        syncStore.lastCheckedAt === null
          ? ''
          : ` · ${describeCheckAge(Date.now() - syncStore.lastCheckedAt)}`
      statusEl.hidden = false
      statusEl.replaceChildren(`${label}${suffix}${checked}`)

      if (intentEl) {
        intentEl.hidden = !failure
        if (failure && intentMessageEl) {
          intentMessageEl.replaceChildren(
            failure.intent.failure ?? 'No se pudo completar la vinculación.',
          )
        }
        intentActionsEl?.toggleAttribute('hidden', !failure)
        intentRetryEl?.toggleAttribute('disabled', !failure)
        intentDiscardEl?.toggleAttribute('disabled', !failure)
      }
    }

    /**
     * The recurring module owns the retry/discard guarantees of its intents
     * (reopening a partially confirmed pending, keeping its reconciliation
     * retry visible); the generic intent discard is only correct for links.
     */
    const runAction = (
      intent: { intent: { id: string; kind: string } },
      action: 'retry' | 'discard',
    ) => {
      const target = syncStore.intents.find((view) => view.intent.id === intent.intent.id)
      if (!target) return Promise.resolve(false)
      if (isRecurringIntentKind(target.intent.kind)) {
        return runRecurringIntentAction(target.intent, action)
      }
      return action === 'retry'
        ? syncStore.retryIntent(target.intent.id).then(() => true)
        : syncStore.discardIntent(target.intent.id).then((result) => result !== null)
    }

    intentRetryEl?.addEventListener('click', () => {
      const intent = actionableIntent()
      if (intent) void runAction(intent, 'retry').then(renderStatus)
    })
    intentDiscardEl?.addEventListener('click', () => {
      const intent = actionableIntent()
      if (intent) void runAction(intent, 'discard').then(renderStatus)
    })

    syncStore.$subscribe(renderStatus)
    renderStatus()
    // The age label only needs minutes, not frames; keep hidden tabs quiet.
    setInterval(() => {
      if (!document.hidden) renderStatus()
    }, 30_000)
  }

  logoutAction?.addEventListener('click', () => {
    logoutAction.setAttribute('aria-disabled', 'true')
    void loadSession()
      .catch(() => null)
      .then(async (session) => {
        if (!(await logOut(session))) logoutAction.removeAttribute('aria-disabled')
      })
      .catch((error: unknown) => {
        logoutAction.removeAttribute('aria-disabled')
        console.error('No se pudo cerrar sesión.', error)
      })
  })
}

function initShellInteractions(): void {
  initTheme()
  initMobileMoreMenu()
  initReportDialogActions()
  initReportsBadge()
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
