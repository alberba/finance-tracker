// @vitest-environment happy-dom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'

import { assetHref, useAssetRoute } from '../../src/neon/sections/investment/asset-route'

/**
 * The route of an asset's detail (#439, #440) against the browser's history:
 * where each step leaves the URL, and where back takes you.
 */
type Route = ReturnType<typeof useAssetRoute>

let wrapper: VueWrapper | null = null

function mountRoute(url = '/inversion'): Route {
  window.history.replaceState(null, '', url)
  let route: Route | undefined
  wrapper = mount(
    defineComponent({
      setup() {
        route = useAssetRoute()
        return () => h('div')
      },
    }),
  )
  return route!
}

/** Runs a history move and waits for its `popstate`. */
async function navigate(move: () => void): Promise<void> {
  const landed = new Promise<void>((resolve) =>
    window.addEventListener('popstate', () => resolve(), { once: true }),
  )
  move()
  await landed
  // The route listens to the same event; let it run after us too.
  await Promise.resolve()
}

const address = () => `${window.location.pathname}${window.location.search}`

beforeEach(() => {
  window.history.replaceState(null, '', '/inversion')
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

describe('useAssetRoute', () => {
  it('abrir un activo deja su dirección y atrás vuelve a la portada', async () => {
    const route = mountRoute()
    route.open('fondos')
    expect(address()).toBe('/inversion?activo=fondos')
    expect(route.selected.value).toBe('fondos')

    await navigate(() => window.history.back())
    expect(address()).toBe('/inversion')
    expect(route.selected.value).toBeNull()
  })

  it('los movimientos son otra entrada: atrás vuelve al resumen del activo', async () => {
    const route = mountRoute()
    route.open('fondos')
    route.openMovements()
    expect(address()).toBe('/inversion?activo=fondos&vista=movimientos')
    expect(route.movements.value).toBe(true)

    await navigate(() => route.closeMovements())
    expect(address()).toBe('/inversion?activo=fondos')
    expect(route.selected.value).toBe('fondos')
    expect(route.movements.value).toBe(false)
  })

  it('cerrar desde los movimientos vuelve directamente a la portada', async () => {
    const route = mountRoute()
    route.open('fondos')
    route.openMovements()

    await navigate(() => route.close())
    expect(address()).toBe('/inversion')
    expect(route.selected.value).toBeNull()
    expect(route.movements.value).toBe(false)
  })

  it('un enlace cargado al activo se cierra reescribiendo la dirección', () => {
    const route = mountRoute('/inversion?activo=fondos')
    expect(route.selected.value).toBe('fondos')

    route.close()
    expect(address()).toBe('/inversion')
    expect(route.selected.value).toBeNull()
  })

  it('un enlace cargado a los movimientos vuelve al resumen reescribiendo la dirección', () => {
    const route = mountRoute('/inversion?activo=fondos&vista=movimientos')
    expect(route.movements.value).toBe(true)

    route.closeMovements()
    expect(address()).toBe('/inversion?activo=fondos')
    expect(route.selected.value).toBe('fondos')
    expect(route.movements.value).toBe(false)
  })

  it('desde los movimientos de un enlace cargado, cerrar llega a la portada', async () => {
    const route = mountRoute('/inversion?activo=fondos')
    route.openMovements()

    await navigate(() => route.close())
    expect(address()).toBe('/inversion')
    expect(route.selected.value).toBeNull()
  })

  it('la vista de movimientos sin activo no cuenta', () => {
    const route = mountRoute('/inversion?vista=movimientos')
    expect(route.selected.value).toBeNull()
    expect(route.movements.value).toBe(false)
  })

  it('el enlace de la sección en la navegación vuelve a la portada', () => {
    const route = mountRoute('/inversion?activo=fondos')
    const nav = document.createElement('a')
    nav.dataset.navItem = ''
    nav.dataset.section = 'investment'
    document.body.append(nav)

    nav.click()
    expect(route.selected.value).toBeNull()
    expect(address()).toBe('/inversion')
    nav.remove()
  })

  it('al salir de la sección, el detalle se va con ella', () => {
    const route = mountRoute('/inversion?activo=fondos&vista=movimientos')
    route.reset()
    expect(route.selected.value).toBeNull()
    expect(route.movements.value).toBe(false)
  })
})

describe('assetHref', () => {
  it('da la dirección del resumen de un activo', () => {
    expect(assetHref('fondos')).toBe('/inversion?activo=fondos')
    expect(assetHref('a b&c')).toBe('/inversion?activo=a+b%26c')
  })
})
