import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { editScenarioState, holdVwceInFondos } from './seed-sync-v2'

/**
 * The cover of Inversión (#437), desktop. The clock sits on 20 March 2026, the newest month of
 * the seed.
 */
test.use({ fixedTime: '2026-03-20T12:00:00Z' })

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

test.describe('Inversión', () => {
  test(
    'cambia la rentabilidad de importe a porcentaje y vuelve',
    { tag: '@smoke' },
    async ({ page, tracker }) => {
      await tracker.openInvestment()
      await expect(figure(page, 'return')).toContainText('Rentabilidad')
      await expect(figure(page, 'return')).toContainText(/€ sobre /)
      const chart = section(page).locator('[data-investment-chart]').getByRole('img')
      await expect(chart).toHaveAccessibleName(/^Lo que vale tu cartera frente a lo que has puesto/)

      const methods = section(page).getByRole('group', { name: 'Cómo medir la rentabilidad' })
      await methods.getByRole('button', { name: 'TWR', exact: true }).click()
      await expect(methods.getByRole('button', { name: 'TWR', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await expect(figure(page, 'return')).toContainText('TWR · vale')
      await expect(chart).toHaveAccessibleName(/^Rentabilidad TWR acumulada/)

      await methods.getByRole('button', { name: 'Simple', exact: true }).click()
      await expect(figure(page, 'return')).not.toContainText('TWR')
      await expect(figure(page, 'return')).toContainText(/€ sobre /)
    },
  )

  test('apunta una nueva operación sin elegir tipo: es una inversión', async ({
    page,
    tracker,
  }) => {
    await tracker.openInvestment()
    await section(page).getByRole('button', { name: 'Nueva operación' }).click()
    const sheet = page.getByRole('dialog', { name: 'Nueva inversión' })
    await expect(sheet).toBeVisible()
    await expect(sheet.getByRole('radiogroup', { name: 'Tipo de movimiento' })).toHaveCount(0)
    // The same fields as a purchase in Inversión › Movimientos.
    await sheet.getByLabel('Símbolo').fill('vwce')
    await sheet.getByLabel('Títulos').fill('3')
    await sheet.getByLabel('Precio').fill('100')
    await sheet.getByLabel('Comisión').fill('1')
    await sheet.getByRole('radio', { name: 'Venta' }).click()
    await sheet.getByRole('button', { name: 'Guardar venta' }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByText('Movimiento de inversión guardado.')).toBeVisible()

    // Anywhere else, the sheet asks for the type again.
    await tracker.openDashboard()
    await page.locator('#dashboard').getByRole('button', { name: 'Apuntar', exact: true }).click()
    const other = page.getByRole('dialog', { name: 'Nuevo movimiento' })
    await expect(other.getByRole('radiogroup', { name: 'Tipo de movimiento' })).toBeVisible()
  })

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

  test('distingue un índice sin datos de una comparación disponible', async ({ page, tracker }) => {
    const release = Promise.withResolvers<void>()
    await page.route('**/api/market/benchmark?*', async (route) => {
      const { searchParams } = new URL(route.request().url())
      const isSp500 = searchParams.get('id') === 'sp-500'
      if (isSp500) await release.promise
      const closes = isSp500 ? [100, 101, 102, 103] : []
      await route.fulfill({ json: { closes } })
    })
    await tracker.openInvestment()

    const chart = section(page).locator('[data-investment-chart]').getByRole('img')
    // The index is picked from the line under the figures, beside its difference.
    const benchmark = section(page).locator('[data-investment-benchmark]')
    await expect(benchmark).toContainText('sin datos')
    await expect(chart).toBeVisible()

    await benchmark.getByRole('button', { name: 'Comparar con MSCI World' }).click()
    const comparison = benchmark.getByRole('menu', { name: 'Comparar con un índice' })
    await expect(comparison.getByRole('menuitemradio', { name: 'MSCI World' })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(comparison.getByRole('menuitemradio', { name: 'S&P 500' })).toBeFocused()
    await page.keyboard.press('Enter')
    try {
      await expect(benchmark).toContainText('cargando')
    } finally {
      release.resolve()
    }
    await expect(comparison).toBeHidden()
    await expect(benchmark.getByRole('button', { name: 'Comparar con S&P 500' })).toBeFocused()
    await expect(benchmark).toContainText(/Diferencia con S&P 500.*−[\d.,]+\s*€/s)
    await expect(chart).toHaveAccessibleName(/S&P 500/)
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

  test('abre un instrumento desde las posiciones de su cuenta, vuelve a la cuenta y sobrevive a la recarga', async ({
    page,
    tracker,
  }) => {
    await serveLateQuotes(page)
    await tracker.goto()
    await holdVwceInFondos(page)
    await tracker.openInvestment()

    await section(page).getByRole('button', { name: 'Ver Fondos Indexados' }).click()
    await section(page).getByRole('link', { name: 'VWCE' }).click()
    await expect(page).toHaveURL(/\/inversion\?instrumento=[^&]+$/)
    await expect(section(page).getByRole('heading', { level: 1 })).toHaveText('VWCE')
    await expect(section(page).getByRole('heading', { name: 'Cotización' })).toBeVisible()
    const positions = section(page).locator('[data-instrument-position]')
    await expect(positions).toContainText('Fondos Indexados')
    await expect(positions).toContainText('15')
    await expect(section(page).locator('[data-instrument-total]')).toContainText('1.950,00')
    await expect(section(page).locator('[data-instrument-count]')).toHaveText('2 operaciones')
    await expect(section(page).getByText('Compra 5 VWCE')).toHaveCount(0)

    await tracker.reload()
    await expect(section(page).getByRole('heading', { level: 1 })).toHaveText('VWCE')
    await expect(section(page).locator('[data-instrument-total]')).toContainText('1.950,00')

    // The reload kept the history entry: the arrow still goes back to the account it came from.
    await section(page).getByRole('link', { name: 'Volver a Inversión' }).click()
    await expect(page).toHaveURL(/\/inversion\?activo=[^&]+$/)
    await expect(section(page).getByRole('heading', { name: 'Posiciones' })).toBeVisible()
  })

  test('el atrás del navegador del instrumento vuelve al detalle de su cuenta', async ({
    page,
    tracker,
  }) => {
    await serveLateQuotes(page)
    await tracker.goto()
    await holdVwceInFondos(page)
    await tracker.openInvestment()

    await section(page).getByRole('button', { name: 'Ver Fondos Indexados' }).click()
    await section(page).getByRole('link', { name: 'VWCE' }).click()
    await expect(page).toHaveURL(/instrumento=[^&]+/)

    await page.goBack()
    await expect(page).toHaveURL(/\/inversion\?activo=[^&]+$/)
    await expect(section(page).getByRole('heading', { name: 'Posiciones' })).toBeVisible()
  })
})
