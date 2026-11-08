import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import OldDesignToggle from '../../src/components/layout/DesignToggle.vue'
import NeonDesignToggle from '../../src/neon/layout/DesignToggle.vue'
import { DESIGN_COOKIE } from '../../src/lib/design'

/** The toggle of each frame (ADR 0010): same contract, one copy per design tree. */
const toggles = [
  ['antiguo (barra lateral)', OldDesignToggle, { variant: 'sidebar' }],
  ['antiguo (hoja Más)', OldDesignToggle, { variant: 'sheet' }],
  ['nuevo', NeonDesignToggle, {}],
] as const

describe.each(toggles)('DesignToggle del diseño %s', (_name, component, extra) => {
  const reload = vi.fn()

  beforeEach(() => {
    document.documentElement.dataset.ui = 'neon'
    document.cookie = `${DESIGN_COOKIE}=; Max-Age=0; Path=/`
    vi.stubGlobal('location', { protocol: 'http:', reload })
  })

  it('es un grupo «Diseño» con Nuevo y Antiguo, y marca el actual', () => {
    const wrapper = mount(component, { props: { design: 'legacy', ...extra } })

    expect(wrapper.get('[role="group"]').attributes('aria-label')).toBe('Diseño')
    const [neon, legacy] = wrapper.findAll('button')
    expect(neon.attributes('aria-label')).toBe('Diseño nuevo')
    expect(neon.attributes('aria-pressed')).toBe('false')
    expect(legacy.attributes('aria-label')).toBe('Diseño antiguo')
    expect(legacy.attributes('aria-pressed')).toBe('true')
  })

  it('guarda la cookie y recarga al elegir el otro diseño', async () => {
    const wrapper = mount(component, { props: { design: 'neon', ...extra } })

    await wrapper.get('[data-design-option="legacy"]').trigger('click')

    expect(document.cookie).toContain(`${DESIGN_COOKIE}=legacy`)
    expect(reload).toHaveBeenCalledOnce()
  })

  it('no hace nada al pulsar el diseño actual', async () => {
    const wrapper = mount(component, { props: { design: 'neon', ...extra } })

    await wrapper.get('[data-design-option="neon"]').trigger('click')

    expect(document.cookie).not.toContain(DESIGN_COOKIE)
    expect(reload).not.toHaveBeenCalled()
  })
})
