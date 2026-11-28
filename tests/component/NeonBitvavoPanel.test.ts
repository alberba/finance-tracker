import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BitvavoConnectionState } from '../../src/lib/bitvavo-types'
import NeonBitvavoPanel from '../../src/neon/sections/settings/NeonBitvavoPanel.vue'

const base: BitvavoConnectionState = {
  accountId: 'account',
  startDate: '2019-01-01',
  timeZone: 'Europe/Madrid',
  cursor: Date.parse('2020-01-01T00:01:00Z'),
  imported: true,
  needsAttention: false,
  lastAttemptAt: Date.parse('2026-09-26T08:42:00Z'),
  lastAttemptStatus: 'success',
  lastError: null,
  lastSuccessAt: Date.parse('2026-09-26T08:42:00Z'),
  lastCounts: { created: 3, updated: 1, unchanged: 7, skipped: 0 },
  skipped: [],
}

let state: BitvavoConnectionState
let fetchMock: ReturnType<typeof vi.fn>
const mounted: Array<{ unmount(): void }> = []

beforeEach(() => {
  setActivePinia(createPinia())
  state = { ...base }
  fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
    if (!init?.method || init.method === 'GET')
      return Response.json({
        configured: true,
        destinations: [{ id: 'account', name: 'Bitvavo EUR' }],
        connection: state,
      })
    const body = JSON.parse(String(init.body ?? '{}')) as { action?: string }
    if (body.action === 'sync' || body.action === 'retrySkipped') {
      if (state.needsAttention) return Response.json({ error: 'Clave rechazada.' }, { status: 422 })
      return Response.json({
        status: 'success',
        counts: { created: 1, updated: 0, unchanged: 7, skipped: 0 },
      })
    }
    return Response.json({})
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  vi.unstubAllGlobals()
})

async function mountPanel() {
  const wrapper = mount(NeonBitvavoPanel, { attachTo: document.body, props: { open: true } })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

describe('Bitvavo panel after the first import', () => {
  it('shows last attempt, last correct sync and the four counters', async () => {
    const wrapper = await mountPanel()
    expect(wrapper.get('[data-bitvavo-status]').text()).toBe('Sincronizada')
    const text = wrapper.text()
    expect(text).toContain('Último intento')
    expect(text).toContain('Última sincronización correcta')
    for (const [label, value] of [
      ['Creadas', '3'],
      ['Actualizadas', '1'],
      ['Sin cambios', '7'],
      ['Omitidas', '0'],
    ])
      expect(text).toMatch(new RegExp(`${label}\\s*${value}`))
    expect(wrapper.text()).not.toContain('Preparar vista previa')
    expect(wrapper.find('select').attributes('disabled')).toBeDefined()
  })

  it('lists skipped operations with date, identity and reason and offers to retry them', async () => {
    state = {
      ...base,
      lastAttemptStatus: 'warning',
      lastCounts: { created: 0, updated: 0, unchanged: 2, skipped: 1 },
      skipped: [
        {
          externalId: 'tx-usd',
          executedAt: '2020-01-02T10:00:00.000Z',
          reason: 'Precio y comisión deben estar en EUR.',
        },
      ],
    }
    const wrapper = await mountPanel()
    expect(wrapper.get('[data-bitvavo-status]').text()).toBe('Sincronizada con omitidas')
    const skipped = wrapper.get('[aria-label="Operaciones omitidas"]').text()
    expect(skipped).toContain('tx-usd')
    expect(skipped).toContain('Precio y comisión deben estar en EUR.')
    expect(skipped).toContain('11:00')
    const retry = wrapper.findAll('button').find((b) => b.text() === 'Reintentar omitidas')!
    await retry.trigger('click')
    await flushPromises()
    const posted = fetchMock.mock.calls.map(([, init]) => (init as RequestInit | undefined)?.body)
    expect(posted).toContain(JSON.stringify({ action: 'retrySkipped' }))
  })

  it('shows a recoverable failure with its sanitized message and lets it be retried', async () => {
    state = {
      ...base,
      lastAttemptStatus: 'failed',
      lastError: 'Bitvavo ha limitado las consultas.',
    }
    const wrapper = await mountPanel()
    expect(wrapper.get('[data-bitvavo-status]').text()).toBe('Falló el último intento')
    expect(wrapper.text()).toContain('Bitvavo ha limitado las consultas.')
    const syncNow = wrapper.findAll('button').find((b) => b.text() === 'Sincronizar ahora')!
    expect(syncNow.attributes('disabled')).toBeUndefined()
    await syncNow.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('1 creadas, 0 actualizadas, 7 sin cambios y 0 omitidas')
  })

  it('asks for a new key when the connection requires attention', async () => {
    state = {
      ...base,
      needsAttention: true,
      lastAttemptStatus: 'attention',
      lastError: 'Bitvavo ha rechazado la clave. Reemplázala por una clave de solo lectura.',
    }
    const wrapper = await mountPanel()
    expect(wrapper.get('[data-bitvavo-status]').text()).toBe('Requiere atención')
    expect(wrapper.get('details').attributes('open')).toBeDefined()
    expect(wrapper.get('summary').text()).toBe('Reemplazar la clave')
    const syncNow = wrapper.findAll('button').find((b) => b.text() === 'Sincronizar ahora')!
    expect(syncNow.attributes('disabled')).toBeDefined()
  })
})
