import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import FigureStrip from '../../src/components/ui/FigureStrip.vue'

describe('FigureStrip', () => {
  it('lista cada cifra como término y valor', () => {
    const wrapper = mount(FigureStrip, {
      props: {
        items: [
          { label: 'Comprado', value: '1.200,00 €' },
          { label: 'Sin declarar', value: '3', suffix: 'movimientos' },
        ],
      },
    })

    expect(wrapper.findAll('dt').map((dt) => dt.text())).toEqual(['Comprado', 'Sin declarar'])
    expect(wrapper.findAll('dd').map((dd) => dd.text())).toEqual(['1.200,00 €', '3 movimientos'])
  })

  it('colorea el valor según su tono', () => {
    const wrapper = mount(FigureStrip, {
      props: {
        items: [
          { label: 'Resultado', value: '+10,00 €', tone: 'gain' },
          { label: 'Comisiones', value: '−2,00 €', tone: 'loss' },
        ],
      },
    })

    const [gain, loss] = wrapper.findAll('dd')
    expect(gain.classes()).toContain('text-gain')
    expect(loss.classes()).toContain('text-loss')
  })
})
