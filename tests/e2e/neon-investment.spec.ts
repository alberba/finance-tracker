import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { editScenarioState } from './seed-sync-v2'

/**
 * The cover of Inversión in the new design (#437), desktop. No cookie: the new
 * design is the default. The clock sits on 20 March 2026, the newest month of
 * the seed.
 */
const NO_COOKIE = { cookies: [], origins: [] }

test.use({ storageState: NO_COOKIE, fixedTime: '2026-03-20T12:00:00Z' })

const section = (page: Page) => page.locator('#investment')
const figure = (page: Page, key: string) =>
  section(page).locator(`[data-investment-figure="${key}"]`)

/** Answers every quote request with a price taken two days ago, flagged as late. */
async function serveLateQuotes(page: Page): Promise<void> {
  await page.route('**/api/market/quotes', async (route) => {
    const body = route.request().postDataJSON() as {
      instruments?: Array<{ id: string; currency: string }>
    }
    const quotes = Object.fromEntries(
      (body.instruments ?? []).map((instrument) => [
        instrument.id,
        {
          instrumentId: instrument.id,
          price: 130,
          currency: instrument.currency,
          timestamp: '2026-03-18T16:30:00Z',
          fetchedAt: '2026-03-20T12:00:00Z',
          dataType: 'market',
          source: 'mock-provider',
          status: 'stale',
          isStale: true,
          previousClose: 128,
          changePercent: 1.56,
        },
      ]),
    )
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ quotes }),
    })
  })
}

test.describe('Inversión en el diseño nuevo', () => {
  test(
    'cambia la rentabilidad de importe a porcentaje y vuelve',
    { tag: '@smoke' },
    async ({ page, tracker }) => {
      await tracker.openInvestment()
      await expect(figure(page, 'return')).toContainText('Tu cartera')
      await expect(figure(page, 'return')).toContainText('€')
      const chart = section(page).locator('[data-investment-chart]').getByRole('img')
      await expect(chart).toHaveAccessibleName(/^Lo que vale tu cartera frente a lo que has puesto/)

      await section(page).getByRole('button', { name: 'Rentabilidad simple' }).click()
      await page.getByRole('menuitemradio', { name: /^TWR/ }).click()

      await expect(figure(page, 'return')).toContainText('Tu cartera · TWR')
      await expect(figure(page, 'return')).not.toContainText('€')
      await expect(chart).toHaveAccessibleName(/^Rentabilidad TWR acumulada/)

      await section(page).getByRole('button', { name: 'Rentabilidad TWR' }).click()
      await page.getByRole('menuitemradio', { name: /^Simple/ }).click()
      await expect(figure(page, 'return')).not.toContainText('TWR')
      await expect(figure(page, 'return')).toContainText('€')
    },
  )

  test('avisa cuando el proveedor devuelve una cotización atrasada', async ({ page, tracker }) => {
    await serveLateQuotes(page)
    await tracker.goto()
    await editScenarioState(page, (state) => {
      state.instruments = [
        {
          id: 'e2e-vwce',
          investmentAssetId: 'fondos-indexados',
          type: 'etf',
          symbol: 'VWCE',
          market: 'XETRA',
          currency: 'EUR',
          provider: 'yahoo',
          active: true,
        },
      ]
    })
    await tracker.openInvestment()

    const notice = section(page).getByRole('status')
    await expect(notice).toContainText('Cotizaciones retrasadas')
    await expect(notice).toContainText('último precio del 18 mar')
  })

  test('abre un activo, ve sus operaciones y vuelve con la flecha y con atrás', async ({
    page,
    tracker,
  }) => {
    await tracker.openInvestment()
    await expect(section(page).getByRole('heading', { name: 'Inversión', level: 1 })).toBeVisible()

    await section(page).getByRole('button', { name: 'Ver Fondos Indexados' }).click()
    await expect(page).toHaveURL(/\/inversion\?activo=/)
    // The detail header: the arrow and the asset, no section title.
    await expect(section(page).getByRole('heading', { name: 'Inversión', level: 1 })).toBeHidden()
    await expect(section(page).getByRole('heading', { level: 1 })).toBeVisible()
    await expect(section(page).getByRole('heading', { name: 'Movimientos' })).toBeVisible()
    await expect(section(page).getByText('Aportación fondo indexado').first()).toBeVisible()

    await section(page).getByRole('link', { name: 'Volver a Inversión' }).click()
    await expect(page).toHaveURL(/\/inversion$/)
    await expect(section(page).getByRole('heading', { name: 'Inversión', level: 1 })).toBeVisible()

    await section(page).getByRole('button', { name: 'Ver Fondos Indexados' }).click()
    await expect(section(page).getByRole('heading', { name: 'Movimientos' })).toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(/\/inversion$/)
    await expect(section(page).getByRole('heading', { name: 'Inversión', level: 1 })).toBeVisible()
  })
})
