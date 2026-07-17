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
      (event.target instanceof Element && event.target.closest('[data-section]'))
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
    void navigator.serviceWorker.register('/sw.js')
  })
}

function initShellInteractions(): void {
  initSidebarToggle()
  initThemeToggles()
  initMobileMoreMenu()
  initPwaInstall()
  initServiceWorker()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initShellInteractions, { once: true })
} else {
  initShellInteractions()
}
