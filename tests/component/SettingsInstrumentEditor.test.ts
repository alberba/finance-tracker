import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { expect, it } from 'vitest'
import SettingsInstrumentEditor from '../../src/components/settings/SettingsInstrumentEditor.vue'
import type { InstrumentRowViewModel } from '../../src/domain/settings/view-model'
import { useSyncStore } from '../../src/stores/sync'

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

function linkView(overrides: {
  state: 'waiting' | 'sending' | 'partial' | 'failed' | 'local-saved'
  waitingFor?: 'catalog' | 'connection' | 'private-configuration' | null
  failure?: string | null
  steps: Array<{ step: string; state: string }>
}) {
  return {
    intent: {
      id: 'intent-1',
      kind: 'instrumentLink' as const,
      ownerUserId: 'user-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      state: overrides.state,
      targetIds: ['movement-1'],
      payload: { instrumentId: 'world' },
      waitingFor: overrides.waitingFor ?? null,
      failure: overrides.failure ?? null,
      discardRequested: false,
    },
    steps: overrides.steps.map((step, index) => ({
      id: `intent-1:${step.step}`,
      intentId: 'intent-1',
      step: step.step,
      state: step.state as never,
      commandId: null,
      seq: null,
      attempt: 1,
      lastError: null,
      claimedBy: null,
      claimedAt: null,
      updatedAt: `2026-01-01T00:00:0${index}.000Z`,
    })),
  }
}

function mountEditor() {
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
  return mount(SettingsInstrumentEditor, {
    global: { plugins: [pinia] },
    props: { instrument },
  })
}

it('muestra la espera de la referencia de catálogo sin presentarla como fallo', async () => {
  const wrapper = mountEditor()
  const syncStore = useSyncStore()
  syncStore.intents = [
    linkView({
      state: 'waiting',
      waitingFor: 'catalog',
      steps: [
        { step: 'configuration', state: 'confirmed' },
        { step: 'movement-1', state: 'pending' },
      ],
    }),
  ] as never
  await wrapper.vm.$nextTick()
  const status = wrapper.get('[data-link-intent-status]')
  expect(status.text()).toContain('esperando la sincronización de la cotización')
  expect(status.attributes('role')).toBe('status')
  expect(wrapper.find('[data-link-intent-retry]').exists()).toBe(false)
  wrapper.unmount()
})

it('no cuenta la configuración como movimiento vinculado y expone el resultado parcial', async () => {
  const wrapper = mountEditor()
  const syncStore = useSyncStore()
  syncStore.intents = [
    linkView({
      state: 'partial',
      steps: [
        { step: 'configuration', state: 'confirmed' },
        { step: 'movement-1', state: 'cancelled' },
      ],
    }),
  ] as never
  await wrapper.vm.$nextTick()
  const status = wrapper.get('[data-link-intent-status]')
  // The configuration dependency is not a "vinculado": 0 of 1, not 1 of 2.
  expect(status.text()).toContain('Resultado parcial: 0 de 1 vinculados')
  expect(wrapper.find('[data-link-intent-retry]').exists()).toBe(false)
  wrapper.unmount()
})

it('muestra el fallo de la configuración con reintentar y descartar', async () => {
  const wrapper = mountEditor()
  const syncStore = useSyncStore()
  syncStore.intents = [
    linkView({
      state: 'failed',
      failure: 'La cotización no es válida.',
      steps: [
        { step: 'configuration', state: 'failed' },
        { step: 'movement-1', state: 'pending' },
      ],
    }),
  ] as never
  await wrapper.vm.$nextTick()
  const status = wrapper.get('[data-link-intent-status]')
  expect(status.text()).toContain('La cotización no es válida.')
  expect(status.text()).toContain('(0/1 vinculados)')
  expect(status.attributes('role')).toBe('alert')
  expect(wrapper.find('[data-link-intent-retry]').exists()).toBe(true)
  expect(wrapper.find('[data-link-intent-discard]').exists()).toBe(true)
  wrapper.unmount()
})
