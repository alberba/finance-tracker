// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setupShellNavigation } from '../../src/scripts/app/shell-navigation'
import { pinia } from '../../src/stores/pinia'
import { useUiStore } from '../../src/stores/ui'
import type { SectionId } from '../../src/scripts/types'

let scrollToSpy: ReturnType<typeof vi.spyOn>
let popstateHandler: EventListener | null = null

function navButton(sectionId: SectionId): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(`[data-section="${sectionId}"]`)
  if (!button) throw new Error(`No nav button for ${sectionId}`)
  return button
}

function setupShell() {
  document.body.innerHTML = `
    <div id="nav-tabs">
      <button type="button" data-nav-item data-section="dashboard">Dashboard</button>
      <button type="button" data-nav-item data-section="transactions">Movimientos</button>
      <button type="button" data-nav-item data-section="budget">Presupuesto</button>
    </div>
  `
  const uiStore = useUiStore(pinia)
  uiStore.setActiveSection('dashboard')
  uiStore.setPage('section')
  window.history.replaceState(null, '', '/dashboard')

  const shell = setupShellNavigation({
    ui: uiStore.ui,
    el: { navTabs: document.querySelector<HTMLElement>('#nav-tabs')! },
  })
  shell.bindNavigationEvents()
  return { shell, uiStore }
}

beforeEach(() => {
  document.body.innerHTML = ''
  window.history.replaceState(null, '', '/dashboard')

  const addEventListener = window.addEventListener.bind(window)
  vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
    if (type === 'popstate' && typeof listener === 'function') {
      popstateHandler = listener
    }
    addEventListener(type, listener, options)
  })

  scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

afterEach(() => {
  if (popstateHandler) window.removeEventListener('popstate', popstateHandler)
  popstateHandler = null
  vi.restoreAllMocks()
  document.body.innerHTML = ''
  window.history.replaceState(null, '', '/')
})

describe('navegación del shell', () => {
  it('vuelve al inicio al pulsar Movimientos, también si ya es la sección activa', () => {
    setupShell()

    navButton('transactions').click()

    expect(scrollToSpy).toHaveBeenCalledTimes(1)
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'auto' })

    navButton('transactions').click()

    expect(scrollToSpy).toHaveBeenCalledTimes(2)
  })

  it('no reinicia el desplazamiento al navegar al resto de secciones', () => {
    const { uiStore } = setupShell()

    navButton('budget').click()

    // El clic se procesó; aun así, la sección no se reinicia.
    expect(uiStore.ui.activeSection).toBe('budget')
    expect(scrollToSpy).not.toHaveBeenCalled()
  })

  it('no reinicia el desplazamiento en el arranque ni al volver con el historial', () => {
    const { shell, uiStore } = setupShell()

    window.history.replaceState(null, '', '/movimientos')
    shell.switchSection('transactions', { updateHistory: false })
    expect(scrollToSpy).not.toHaveBeenCalled()

    window.history.pushState(null, '', '/presupuesto')
    window.dispatchEvent(new PopStateEvent('popstate'))

    expect(scrollToSpy).not.toHaveBeenCalled()
    expect(uiStore.ui.activeSection).toBe('budget')
  })
})
