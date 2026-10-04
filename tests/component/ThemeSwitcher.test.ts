import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ThemeSwitcher from '../../src/components/layout/ThemeSwitcher.vue'
import { createThemeController, type ThemeController } from '../../src/lib/client/theme'

let controller: ThemeController

vi.mock('../../src/lib/client/theme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/client/theme')>()
  return { ...actual, getThemeController: () => controller }
})

beforeEach(() => {
  controller = createThemeController({
    storage: null,
    media: { matches: false, addEventListener: () => {} },
    root: { dataset: {} },
  })
})

function pressed(wrapper: ReturnType<typeof mount>): string[] {
  return wrapper
    .findAll('button[aria-pressed="true"]')
    .map((button) => button.attributes('aria-label') ?? button.text())
}

describe('ThemeSwitcher', () => {
  it('ofrece claro, sistema y oscuro como iconos con nombre, con «Sistema» por defecto', () => {
    const wrapper = mount(ThemeSwitcher, { props: { variant: 'sidebar' } })

    expect(wrapper.get('[role="group"]').attributes('aria-label')).toBe('Tema')
    expect(wrapper.findAll('button').map((button) => button.attributes('aria-label'))).toEqual([
      'Tema claro',
      'Tema del sistema',
      'Tema oscuro',
    ])
    expect(pressed(wrapper)).toEqual(['Tema del sistema'])
  })

  it('aplica el tema elegido', async () => {
    const wrapper = mount(ThemeSwitcher, { props: { variant: 'bar' } })

    await wrapper.get('button[aria-label="Tema oscuro"]').trigger('click')

    expect(controller.getState()).toEqual({ preference: 'dark', theme: 'dark' })
    expect(pressed(wrapper)).toEqual(['Tema oscuro'])
  })

  it('en la hoja móvil muestra las opciones con texto', () => {
    const wrapper = mount(ThemeSwitcher, { props: { variant: 'sheet' } })

    expect(wrapper.findAll('button').map((button) => button.text())).toEqual([
      'Claro',
      'Sistema',
      'Oscuro',
    ])
  })

  it('refleja un cambio hecho desde otro selector', async () => {
    const wrapper = mount(ThemeSwitcher, { props: { variant: 'sheet' } })

    controller.setPreference('light')
    await wrapper.vm.$nextTick()

    expect(pressed(wrapper)).toEqual(['Claro'])
  })
})
