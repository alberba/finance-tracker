import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

/** Hoja de alta del diseño nuevo (#426). No cookie: el diseño nuevo es el de por defecto. */
const NO_COOKIE = { cookies: [], origins: [] }

const sheet = (page: Page) => page.getByRole('dialog', { name: 'Apuntar' })
const MOBILE = { width: 393, height: 780 }
const DESKTOP = { width: 1280, height: 800 }

const TYPES = [
  { label: 'Gasto', description: 'Hoja gasto' },
  { label: 'Ingreso', description: 'Hoja ingreso' },
  { label: 'Ahorro', description: 'Hoja ahorro' },
  { label: 'Inversión', description: 'Hoja inversión' },
] as const

test.describe('Hoja de alta nueva', () => {
  test.use({ storageState: NO_COOKIE })

  test('apunta cada tipo desde el botón «Apuntar» del móvil y sobrevive a recargar', async ({
    page,
    tracker,
  }) => {
    await page.setViewportSize(MOBILE)
    await tracker.goto()

    for (const { label, description } of TYPES) {
      await page.locator('[data-fab-apuntar]').click()
      await expect(sheet(page)).toBeVisible()
      await sheet(page).getByRole('radio', { name: label }).click()
      await sheet(page).getByRole('textbox', { name: 'Importe' }).fill('12,34')
      await sheet(page).getByLabel('Descripción').fill(description)
      await sheet(page).getByRole('button', { name: 'Guardar' }).click()
      await expect(sheet(page)).toBeHidden()
    }

    await tracker.reload()
    await tracker.openTransactions()
    for (const { description } of TYPES) {
      await expect(tracker.transactionsSection.getByText(description).first()).toBeVisible()
    }
  })

  test('apunta un gasto desde la barra lateral de escritorio', async ({ page, tracker }) => {
    await page.setViewportSize(DESKTOP)
    await tracker.goto()

    await page.locator('[data-sidebar-apuntar]').click()
    await expect(sheet(page)).toBeVisible()
    await sheet(page).getByRole('textbox', { name: 'Importe' }).fill('7')
    await sheet(page).getByLabel('Descripción').fill('Hoja escritorio')
    await sheet(page).getByRole('button', { name: 'Guardar' }).click()
    await expect(sheet(page)).toBeHidden()

    await tracker.reload()
    await tracker.openTransactions()
    await expect(
      tracker.transactionsSection.getByText('Hoja escritorio').locator('visible=true').first(),
    ).toBeVisible()
  })

  test('cancelar no guarda nada y la hoja reabre vacía y arriba', async ({ page, tracker }) => {
    await page.setViewportSize(MOBILE)
    await tracker.goto()

    await page.locator('[data-fab-apuntar]').click()
    await sheet(page).getByRole('radio', { name: 'Ingreso' }).click()
    await sheet(page).getByRole('textbox', { name: 'Importe' }).fill('99')
    await sheet(page).getByLabel('Descripción').fill('Cancelado')
    await sheet(page).getByLabel('Cuenta en el mes').scrollIntoViewIfNeeded()
    await sheet(page).getByRole('button', { name: 'Cancelar' }).click()
    await expect(sheet(page)).toBeHidden()

    await page.locator('[data-fab-apuntar]').click()
    await expect(sheet(page)).toBeVisible()
    await expect(sheet(page).getByRole('textbox', { name: 'Importe' })).toHaveValue('')
    await expect(sheet(page).getByLabel('Descripción')).toHaveValue('')
    await expect(sheet(page).getByRole('radio', { name: 'Gasto' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    const scrollTop = await sheet(page)
      .locator('form')
      .evaluate((form) => form.scrollTop)
    expect(scrollTop).toBe(0)

    await sheet(page).getByRole('button', { name: 'Cancelar' }).click()
    await tracker.reload()
    await tracker.openTransactions()
    await expect(tracker.transactionsSection.getByText('Cancelado')).toHaveCount(0)
  })

  test('el panel de escritorio queda pegado a la derecha y no desborda', async ({
    page,
    tracker,
  }) => {
    await page.setViewportSize(DESKTOP)
    await tracker.goto()
    await page.locator('[data-sidebar-apuntar]').click()
    await expect(sheet(page)).toBeVisible()

    const box = await sheet(page).evaluate((dialog) => {
      const rect = dialog.getBoundingClientRect()
      const form = dialog.querySelector('form')!
      return {
        right: rect.right,
        width: rect.width,
        overflows: form.scrollWidth > form.clientWidth,
      }
    })
    expect(box).toEqual({ right: DESKTOP.width, width: 380, overflows: false })
  })

  test('un importe vacío da el mismo error que el panel antiguo', async ({ page, tracker }) => {
    await page.setViewportSize(MOBILE)
    await tracker.goto()

    await page.locator('[data-fab-apuntar]').click()
    await sheet(page).getByRole('button', { name: 'Guardar' }).click()

    await expect(page.locator('#toast')).toHaveText('El importe debe ser mayor que 0.')
    await expect(sheet(page)).toBeVisible()
  })
})
