import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'

import { beforeEach, describe, expect, it } from 'vitest'

import InvestmentQuotesBlock from '../../src/components/investment/InvestmentQuotesBlock.vue'

let pinia: Pinia

describe('InvestmentQuotesBlock', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
  })

  it('muestra su bloque 03 con el estado vacío cuando no hay instrumentos', () => {
    const wrapper = mount(InvestmentQuotesBlock, { global: { plugins: [pinia] } })

    expect(wrapper.get('[data-investment-quotes]').text()).toContain('Cotizaciones')
    expect(wrapper.get('[data-ledger-empty]').text()).toBe(
      'Aún no hay símbolos configurados. Añádelos en Configuración → Cotizaciones.',
    )
  })
})
