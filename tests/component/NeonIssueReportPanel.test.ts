import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import NeonIssueReportPanel from '../../src/neon/layout/NeonIssueReportPanel.vue'
import { useUiStore } from '../../src/stores/ui'

const cleanups: Array<() => void> = []

beforeEach(() => {
  vi.setSystemTime(new Date('2026-08-01T10:00:00.000Z'))
  document.documentElement.dataset.financeReady = 'true'
})
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  delete document.documentElement.dataset.financeReady
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function reportPanel() {
  const pinia = createPinia()
  const wrapper = mount(NeonIssueReportPanel, {
    attachTo: document.body,
    props: { open: false },
    global: { plugins: [pinia] },
  })
  cleanups.push(() => wrapper.unmount())
  return { wrapper, ui: useUiStore(pinia) }
}

it('preserves the draft but asks for fresh consent when reopened on another screen after a failure', async () => {
  const { wrapper, ui } = reportPanel()
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ error: 'No se pudo guardar' }, { status: 500 }))
  vi.stubGlobal('fetch', request)
  await wrapper.setProps({ open: true })
  const summary = wrapper.get<HTMLInputElement>('input[name="summary"]')
  await summary.setValue('Error al cargar la pantalla')
  await wrapper.get<HTMLInputElement>('input[type="checkbox"]').setValue(true)
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(wrapper.get('[role="status"]').text()).toContain('No se pudo crear la issue')

  await wrapper.setProps({ open: false })
  ui.setActiveSection('transactions')
  await wrapper.setProps({ open: true })
  expect(summary.element.value).toBe('Error al cargar la pantalla')
  expect(wrapper.get('fieldset').text()).toContain('Movimientos')
  expect(wrapper.get<HTMLInputElement>('input[type="checkbox"]').element.checked).toBe(false)
})

it('uses the recovery receipt when retrying a private save after GitHub already created the case', async () => {
  const { wrapper } = reportPanel()
  const issue = { ok: true, issueNumber: 42, issueUrl: 'https://github.com/example/repo/issues/42' }
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({ ...issue, tracked: false, receipt: 'known-receipt' }, { status: 201 }),
    )
    .mockResolvedValueOnce(Response.json({ ...issue, tracked: true }, { status: 201 }))
  vi.stubGlobal('fetch', request)
  await wrapper.setProps({ open: true })
  await wrapper.get('input[name="summary"]').setValue('Error al cargar la pantalla')
  await wrapper.get('form').trigger('submit')
  await flushPromises()

  const retry = wrapper
    .findAll('button')
    .find((button) => button.text() === 'Guardar reporte privado')
  expect(retry?.exists()).toBe(true)
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(JSON.parse(String(request.mock.calls[1][1]?.body))).toMatchObject({
    receipt: 'known-receipt',
    summary: 'Error al cargar la pantalla',
  })
  expect(wrapper.get('[role="status"]').text()).toContain('Reporte creado:')
})
