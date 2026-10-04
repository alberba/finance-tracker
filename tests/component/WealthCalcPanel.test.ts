import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import WealthCalcPanel from '../../src/components/wealth/WealthCalcPanel.vue'

function mountPanel() {
  return mount(WealthCalcPanel, {
    attachTo: document.body,
    props: {
      open: true,
      'onUpdate:open': () => {},
      target: { key: 'santander', name: 'Santander', current: 0, calculated: 0, opening: 0 },
      monthName: 'marzo',
      formatMoney: (value: number) => `${value.toFixed(2).replace('.', ',')} €`,
      currency: 'EUR',
    },
  })
}

describe('WealthCalcPanel', () => {
  it('deja el cursor tras el operador en cuanto lo inserta, sin esperar a otro fotograma', async () => {
    const wrapper = mountPanel()
    const field = wrapper.get<HTMLInputElement>('#wealth-calc-expression')
    await field.setValue('45,5')
    field.element.setSelectionRange(4, 4)

    await wrapper.get('button[aria-label="Multiplicar"]').trigger('click')
    await nextTick()

    expect(field.element.value).toBe('45,5*')
    expect(document.activeElement).toBe(field.element)
    expect(field.element.selectionStart).toBe(5)
    wrapper.unmount()
  })

  it('los botones de operador no le quitan el foco al campo', async () => {
    const wrapper = mountPanel()
    const button = wrapper.get('button[aria-label="Sumar"]')

    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    button.element.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    wrapper.unmount()
  })
})
