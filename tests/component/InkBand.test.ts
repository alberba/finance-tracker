import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import InkBand from '../../src/components/ui/InkBand.vue'

const NBSP = ' '

describe('InkBand', () => {
  it('es una región etiquetada con la cifra principal partida en entero y decimales', () => {
    const wrapper = mount(InkBand, {
      props: {
        label: 'Valor de la cartera · 31 jul 2026',
        value: `11.062,68${NBSP}€`,
        valueId: 'total',
        ariaLabel: 'Situación de la cartera',
      },
    })

    expect(wrapper.get('section').attributes('aria-label')).toBe('Situación de la cartera')
    const value = wrapper.get('#total')
    expect(value.findAll('span').map((span) => span.text())).toEqual(['11.062', `,68${NBSP}€`])
    expect(value.text()).toBe(`11.062,68${NBSP}€`)
  })

  it('muestra el chip de variación con su tono', () => {
    const wrapper = mount(InkBand, {
      props: { label: 'Valor', value: '1,00 €', ariaLabel: 'x', chip: { text: '−0,42 % hoy', tone: 'loss' } },
    })

    const chip = wrapper.get('[data-ink-chip]')
    expect(chip.text()).toBe('−0,42 % hoy')
    expect(chip.classes()).toContain('text-ink-loss')
  })

  it('pinta los datos secundarios con sus ids y tono', () => {
    const wrapper = mount(InkBand, {
      props: {
        label: 'Valor',
        value: '1,00 €',
        ariaLabel: 'x',
        facts: [
          { label: 'Capital invertido', value: '10,00 €', valueId: 'capital' },
          { label: 'Rentabilidad', value: '+3,50 %', tone: 'gain', labelId: 'ret-label', valueId: 'ret' },
        ],
      },
    })

    expect(wrapper.get('#capital').text()).toBe('10,00 €')
    expect(wrapper.get('#ret-label').text()).toBe('Rentabilidad')
    expect(wrapper.get('#ret').classes()).toContain('text-ink-gain')
  })

  it('sin chip ni datos solo muestra la cifra', () => {
    const wrapper = mount(InkBand, { props: { label: 'Valor', value: '1,00 €', ariaLabel: 'x' } })

    expect(wrapper.find('[data-ink-chip]').exists()).toBe(false)
    expect(wrapper.findAll('p')).toHaveLength(2)
  })
})
