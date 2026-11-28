import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import NeonSearchButton from '../../src/neon/layout/NeonSearchButton.vue'
import { useUiStore } from '../../src/stores/ui'

const wrappers: Array<ReturnType<typeof mount>> = []

function setup() {
  setActivePinia(createPinia())
  const wrapper = mount(NeonSearchButton, { attachTo: document.body })
  wrappers.push(wrapper)
  return wrapper
}

async function openSearch(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('button[aria-label="Buscar movimientos"]').trigger('click')
  await nextTick()
  const sheet = wrapper.get('dialog')
  expect((sheet.element as HTMLDialogElement).open).toBe(true)
  return sheet
}

beforeEach(() => {
  document.body.innerHTML = ''
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
})

describe('NeonSearchButton', () => {
  it('busca desde la hoja y lleva a Movimientos con la búsqueda aplicada', async () => {
    const wrapper = setup()
    const sheet = await openSearch(wrapper)

    await sheet.get('input[type="search"]').setValue('  Compra semanal ')
    await sheet.get('form').trigger('submit')
    await nextTick()

    expect(useUiStore().ui.txFilters.search).toBe('Compra semanal')
    expect(window.location.pathname).toBe('/movimientos')
    await vi.waitFor(() => expect((sheet.element as HTMLDialogElement).open).toBe(false))
  })

  it('una búsqueda vacía no se mueve de sección', async () => {
    const wrapper = setup()
    const sheet = await openSearch(wrapper)

    await sheet.get('input[type="search"]').setValue('   ')
    await sheet.get('form').trigger('submit')

    expect(window.location.pathname).toBe('/')
    expect((sheet.element as HTMLDialogElement).open).toBe(true)
  })
})
