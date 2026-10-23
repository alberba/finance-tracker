import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { expect, it } from 'vitest'
import SettingsInstrumentEditor from '../../src/components/settings/SettingsInstrumentEditor.vue'
import type { InstrumentRowViewModel } from '../../src/domain/settings/view-model'

it('conserva el ticker que se está eligiendo cuando cambian los contadores de movimientos', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const instrument: InstrumentRowViewModel = {
    id: 'world',
    symbol: 'XDWH.XETRA',
    type: 'etf',
    market: '',
    currency: 'EUR',
    provider: 'yahoo',
    linked: 0,
    pending: 1,
  }
  const wrapper = mount(SettingsInstrumentEditor, {
    global: { plugins: [pinia] },
    props: { instrument },
  })
  const label = wrapper
    .findAll('label')
    .find((item) => item.text() === 'Ticker de XDWH.XETRA en el proveedor')!
  const field = wrapper.get(`input[id="${label.attributes('for')}"]`)
  await field.setValue('XDWH.DE')
  await wrapper.setProps({ instrument: { ...instrument, linked: 1, pending: 0 } })
  expect((field.element as HTMLInputElement).value).toBe('XDWH.DE')
  expect(wrapper.get('a').attributes('href')).toBe('https://finance.yahoo.com/quote/XDWH.DE/')
  expect(wrapper.get('a').attributes('rel')).toBe('noopener noreferrer')
  wrapper.unmount()
})
