import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import BitvavoImportPanel from '../../src/components/settings/BitvavoImportPanel.vue'

const NBSP = ' '

beforeEach(() => {
  setActivePinia(createPinia())
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ configured: false })))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

it('requests read-only credentials, destination and local history settings', async () => {
  const wrapper = mount(BitvavoImportPanel, { props: { open: true } })
  await flushPromises()
  expect(wrapper.text()).toContain('exclusivamente permiso de lectura')
  expect(wrapper.find('input[name="bitvavoApiSecret"]').attributes('type')).toBe('password')
  expect(wrapper.find('input[name="bitvavoStartDate"]').exists()).toBe(true)
  expect(wrapper.find('input[name="bitvavoTimeZone"]').exists()).toBe(true)
  wrapper.unmount()
})

it('blocks confirmation until every possible duplicate has an explicit resolution', async () => {
  vi.stubEnv('PUBLIC_SYNC_V2', 'true')
  const http = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ configured: true, destinations: [] }))
    .mockResolvedValueOnce(
      Response.json({
        id: 'preview',
        connectionVersion: 1,
        accountId: 'account',
        from: 0,
        to: 1,
        timeZone: 'Europe/Madrid',
        incompatible: [],
        operations: [
          {
            provider: 'bitvavo',
            externalId: 'purchase',
            executedAt: '2020-01-01T00:00:00Z',
            date: '2020-01-01',
            time: '01:00:00',
            timeZone: 'Europe/Madrid',
            side: 'buy',
            symbol: 'BTC',
            quantity: '0.1',
            unitPrice: '100',
            fee: '0',
            cashAmount: '10',
            currency: 'EUR',
            alreadyImported: false,
            candidates: [{ id: 'manual', description: 'Compra manual', date: '2020-01-01' }],
          },
        ],
      }),
    )
  vi.stubGlobal('fetch', http)
  const wrapper = mount(BitvavoImportPanel, { props: { open: true } })
  await flushPromises()
  const prepare = wrapper
    .findAll('button')
    .find((button) => button.text() === 'Preparar vista previa')!
  await prepare.trigger('click')
  await flushPromises()
  const figures = wrapper.findAll('dd').map((dd) => dd.text())
  expect(figures).toEqual(['0,1', `100,00${NBSP}€`, `0,00${NBSP}€`, `10,00${NBSP}€`])
  expect(wrapper.text()).toContain('1 ene 2020, 01:00 · Europe/Madrid')
  const confirm = wrapper
    .findAll('button')
    .find((button) => button.text() === 'Confirmar importación completa')!
  expect(confirm.attributes('disabled')).toBeDefined()
  const select = wrapper
    .findAll('select')
    .find((select) => select.text().includes('Crear un movimiento nuevo'))!
  await select.setValue('')
  expect(confirm.attributes('disabled')).toBeUndefined()
  wrapper.unmount()
})
