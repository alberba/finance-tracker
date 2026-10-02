import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import StatusDot from '../../src/components/ui/StatusDot.vue'

describe('StatusDot', () => {
  it('muestra la etiqueta y expone su tono', () => {
    const wrapper = mount(StatusDot, { props: { tone: 'warn', label: 'Retrasado' } })

    expect(wrapper.text()).toBe('Retrasado')
    expect(wrapper.attributes('data-status-tone')).toBe('warn')
  })

  it('admite contenido propio en lugar de la etiqueta', () => {
    const wrapper = mount(StatusDot, {
      props: { tone: 'gain', label: 'Actualizado' },
      slots: { default: 'Cotizaciones actualizadas · 26/09, 10:42' },
    })

    expect(wrapper.text()).toBe('Cotizaciones actualizadas · 26/09, 10:42')
  })
})
