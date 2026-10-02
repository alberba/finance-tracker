import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AllocationBar from '../../src/components/ui/AllocationBar.vue'

const NBSP = ' '
const segments = [
  { id: 'fondos', label: 'Fondos', weight: 60, color: '#0d8476', detail: '600,00 €' },
  { id: 'oro', label: 'Oro', weight: 30, color: '#d49a1f', detail: '300,00 €' },
  { id: 'btc', label: 'Crypto', weight: 10, color: '#3b6bf0' },
]

describe('AllocationBar', () => {
  it('es una lista con nombre cuyos segmentos se alcanzan con Tab y dicen su parte', () => {
    const wrapper = mount(AllocationBar, { props: { segments, label: 'Distribución de la cartera' } })

    expect(wrapper.get('[role="list"]').attributes('aria-label')).toBe('Distribución de la cartera')
    const oro = wrapper.get('[data-segment="oro"]')
    expect(oro.attributes('tabindex')).toBe('0')
    expect(oro.attributes('aria-label')).toBe(`Oro: 30,0${NBSP}%, 300,00 €`)
    expect(wrapper.get('[data-segment="btc"]').attributes('aria-label')).toBe(`Crypto: 10,0${NBSP}%`)
  })

  it('da a cada segmento su proporción y un tooltip con nombre, peso y detalle', () => {
    const wrapper = mount(AllocationBar, { props: { segments, label: 'Distribución' } })

    const oro = wrapper.get('[data-segment="oro"]')
    expect(oro.attributes('style')).toContain('flex-grow: 30')
    const tip = oro.get('[data-segment-tip]')
    expect(tip.attributes('aria-hidden')).toBe('true')
    expect(tip.text()).toContain('Oro')
    expect(tip.text()).toContain(`30,0${NBSP}%`)
    expect(tip.text()).toContain('300,00 €')
  })

  it('ancla al borde los tooltips de los extremos', () => {
    const wrapper = mount(AllocationBar, { props: { segments, label: 'Distribución' } })

    expect(wrapper.get('[data-segment="fondos"] [data-segment-tip]').classes()).toContain('left-0')
    expect(wrapper.get('[data-segment="btc"] [data-segment-tip]').classes()).toContain('right-0')
  })
})
