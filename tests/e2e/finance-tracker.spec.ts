import { FinanceTrackerPage } from './pages/FinanceTrackerPage'
import { readScenarioState } from './seed-sync-v2'
import { test, expect } from './fixtures'

test.describe('Finance tracker E2E', () => {
  test(
    'permite crear movimiento y persiste tras recarga',
    { tag: '@smoke' },
    async ({ tracker }) => {
      await tracker.filterTransactionsMonth('FEBRERO')
      const beforeCount = await tracker.getTransactionRowCount()

      await tracker.addIncomeTransaction({
        date: '2026-02-05',
        monthLabel: 'FEBRERO',
        categoryLabel: 'Nómina',
        amount: 1234.56,
        description: 'Ingreso e2e febrero',
      })

      await tracker.filterTransactionsMonth('FEBRERO')
      const afterCount = await tracker.getTransactionRowCount()
      expect(afterCount).toBe(beforeCount + 1)

      await tracker.reload()
      await tracker.filterTransactionsMonth('FEBRERO')
      expect(await tracker.getTransactionRowCount()).toBe(afterCount)
    },
  )

  test('nuevo movimiento usa gasto por defecto y ordena categorías de gasto por uso', async ({
    page,
    tracker,
  }) => {
    await tracker.openTransactions()
    await tracker.transactionsSection.getByRole('button', { name: 'Nuevo movimiento' }).click()

    const form = tracker.transactionPanel
    await expect(
      form
        .getByRole('group', { name: 'Tipo de movimiento' })
        .getByRole('button', { name: 'Gasto', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true')

    const uiExpenseCategories = await form
      .getByLabel('Categoría')
      .locator('option')
      .evaluateAll((options) => options.map((option) => option.getAttribute('value') || ''))

    const expectedExpenseCategories = await page.evaluate(
      (state) => {
        const parsed = state
        const categories = Array.isArray(parsed?.expenseCategories) ? parsed.expenseCategories : []
        const transactions = Array.isArray(parsed?.transactions) ? parsed.transactions : []
        const usageByCategory = transactions.reduce(
          (acc: Record<string, number>, tx: { type?: string; category?: string }) => {
            if (tx?.type !== 'expense') {
              return acc
            }
            const category = String(tx?.category || '').trim()
            if (!category) {
              return acc
            }
            acc[category] = (acc[category] || 0) + 1
            return acc
          },
          {},
        )
        return [...categories].sort((a, b) => {
          const usageA = usageByCategory[a] || 0
          const usageB = usageByCategory[b] || 0
          if (usageA !== usageB) {
            return usageB - usageA
          }
          return categories.indexOf(a) - categories.indexOf(b)
        })
      },
      await readScenarioState(page),
    )

    expect(uiExpenseCategories).toEqual(expectedExpenseCategories)
  })

  test('mantiene datos sin caché local porque persiste en servidor', async ({
    browser,
    testUserEmail,
    tracker,
  }) => {
    await tracker.filterTransactionsMonth('FEBRERO')
    const beforeCount = await tracker.getTransactionRowCount()

    await tracker.addIncomeTransaction({
      date: '2026-02-11',
      monthLabel: 'FEBRERO',
      categoryLabel: 'Nómina',
      amount: 888.11,
      description: 'sqlite-persist-e2e',
    })

    await tracker.filterTransactionsMonth('FEBRERO')
    const afterCreateCount = await tracker.getTransactionRowCount()
    expect(afterCreateCount).toBe(beforeCount + 1)

    await tracker.waitForSync()

    // Discard the local cache: a new browser context must recover the server data.
    const freshContext = await browser.newContext({
      extraHTTPHeaders: { 'X-Test-User-Email': testUserEmail },
    })
    const freshPage = await freshContext.newPage()
    const freshTracker = new FinanceTrackerPage(freshPage)
    try {
      await freshTracker.goto()
      await freshTracker.filterTransactionsMonth('FEBRERO')
      await freshTracker.setTransactionDescriptionFilter('sqlite-persist-e2e')
      await freshTracker.expectTransactionDescriptionVisible('sqlite-persist-e2e')
    } finally {
      await freshContext.close()
    }

    await tracker.reload()
    await tracker.filterTransactionsMonth('FEBRERO')
    await tracker.setTransactionDescriptionFilter('sqlite-persist-e2e')
    await tracker.expectTransactionDescriptionVisible('sqlite-persist-e2e')
  })

  test('permite guardar snapshot de cuenta', async ({ tracker }) => {
    await tracker.saveAccountSnapshot({
      monthLabel: 'MARZO',
      accountName: 'Revolut',
      value: 999.99,
    })

    expect(await tracker.getAccountSnapshotValue('Revolut')).toBe(999.99)

    await tracker.reload()
    await tracker.openWealth()
    await tracker.selectWealthMonth('MARZO')
    expect(await tracker.getAccountSnapshotValue('Revolut')).toBe(999.99)
  })

  test('patrimonio permite calcular snapshot de inversión por fila y persistirlo', async ({
    tracker,
  }) => {
    const calculated = await tracker.applyInvestmentSnapshotCalculation({
      monthLabel: 'MARZO',
      assetName: 'Fondos Indexados',
      expression: '100+50*2',
    })
    expect(calculated).toBe(200)

    await tracker.saveSnapshot()
    await tracker.reload()
    await tracker.openWealth()
    await tracker.selectWealthMonth('MARZO')
    expect(await tracker.getInvestmentSnapshotValue('Fondos Indexados')).toBe(200)
  })

  test('movimientos soporta búsqueda, orden y edición en el panel lateral', async ({ tracker }) => {
    await tracker.addCustomTransaction({
      date: '2026-02-03',
      monthLabel: 'FEBRERO',
      type: 'income',
      categoryLabel: 'Nómina',
      amount: 101,
      description: 'e2e-sort-old',
    })
    await tracker.addCustomTransaction({
      date: '2026-02-20',
      monthLabel: 'FEBRERO',
      type: 'income',
      categoryLabel: 'Nómina',
      amount: 202,
      description: 'e2e-sort-new',
    })

    await tracker.filterTransactionsMonth('FEBRERO')
    await tracker.setTransactionDescriptionFilter('e2e-sort')
    await expect(tracker.transactionRows).toHaveCount(2)
    expect(await tracker.firstTransactionDescription()).toBe('e2e-sort-new')

    await tracker.clickSortByDate()
    expect(await tracker.firstTransactionDescription()).toBe('e2e-sort-old')

    await tracker.editTransactionByDescription('e2e-sort-old', {
      amount: 303,
      newDescription: 'e2e-sort-old-edited',
      category: 'Nómina',
    })
    await tracker.expectTransactionDescriptionVisible('e2e-sort-old-edited')
    await expect(
      tracker.transactionRow('e2e-sort-old-edited').locator('[data-tx-amount]'),
    ).toHaveText('+303,00 €')

    await tracker.reload()
    await tracker.filterTransactionsMonth('FEBRERO')
    await tracker.setTransactionDescriptionFilter('e2e-sort')
    await tracker.expectTransactionDescriptionVisible('e2e-sort-old-edited')
    await tracker.clearTransactionFilters()
  })

  test('movimientos agrupa por mes con su recuento y su neto', async ({ tracker }) => {
    await tracker.filterTransactionsMonth('FEBRERO')
    await tracker.revealOlderTransactions()

    const february = tracker.transactionsSection.locator('[data-ledger-group]', {
      hasText: 'Febrero 2026',
    })
    await expect(february).toBeVisible()
    // February in `src/data/seed.json`: 2085 in, 404.77 out, 200 invested.
    await expect(february).toContainText('neto +1.480,23 €')
    const count = await tracker.getTransactionRowCount()
    await expect(february).toContainText(`${count} movimientos`)
  })

  test('movimientos solo muestra el mes actual por defecto y pliega los anteriores', async ({
    page,
    tracker,
  }) => {
    await page.goto('/movimientos')
    await expect(page).toHaveURL(/\/movimientos$/)

    const march = tracker.transactionsSection.locator('[data-ledger-group]', {
      hasText: 'Marzo 2026',
    })
    const february = tracker.transactionsSection.locator('[data-ledger-group]', {
      hasText: 'Febrero 2026',
    })

    await expect(march).toBeVisible()
    await expect(february).toBeHidden()

    await tracker.revealOlderTransactions()
    await expect(february).toBeVisible()
  })

  test('movimientos muestra columnas en orden: fecha, descripción, cuenta, tipo, importe', async ({
    page,
    tracker,
  }) => {
    await page.goto('/movimientos')
    await expect(page).toHaveURL(/\/movimientos$/)

    const headerCells = tracker.transactionsSection.locator('[data-tx-ledger] thead th')
    await expect(headerCells).toHaveCount(7)

    await expect(headerCells.nth(1)).toContainText('Fecha')
    await expect(headerCells.nth(2)).toContainText('Descripción')
    await expect(headerCells.nth(3)).toContainText('Cuenta')
    await expect(headerCells.nth(4)).toContainText('Tipo')
    await expect(headerCells.nth(5)).toContainText('Importe')
    await expect(headerCells.nth(6)).toHaveText(/^\s*acciones\s*$/i)
  })

  test('movimientos guarda los filtros de importe y fecha tras un botón', async ({
    page,
    tracker,
  }) => {
    await page.goto('/movimientos')
    await expect(
      tracker.transactionsSection.getByRole('heading', { name: 'Movimientos', exact: true }),
    ).toBeVisible()

    const toggle = tracker.transactionsSection.getByRole('button', {
      name: 'Importe y fecha',
    })
    const extra = tracker.transactionsSection.locator('#tx-extra-filters')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(extra).toBeHidden()

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(extra.getByLabel('Importe mín.')).toBeVisible()
    await expect(extra.getByLabel('Fecha exacta')).toBeVisible()
  })

  test('movimientos muestra el neto del mes y su desglose por categoría', async ({
    page,
    tracker,
  }) => {
    await page.goto('/movimientos')
    await expect(page).toHaveURL(/\/movimientos$/)
    await tracker.filterTransactionsMonth('FEBRERO')

    await expect(
      tracker.transactionsSection.getByRole('heading', { name: 'Neto de febrero 2026' }),
    ).toBeVisible()
    await expect(tracker.transactionsSection.locator('#tx-month-net')).toHaveText('+1.480,23 €')
    await expect(
      tracker.transactionsBreakdown.getByRole('heading', { name: 'Febrero por categoría' }),
    ).toBeVisible()

    // Figures below track February in `src/data/seed.json`: income is
    // Nómina 2000 + Reventa 85, expenses are the ten rows totalling 404.77,
    // and the only investment movement is the 200 indexed-fund contribution.
    expect(await tracker.getTransactionSummaryTotal('income')).toBeCloseTo(2085, 2)
    expect(await tracker.getTransactionSummaryTotal('expense')).toBeCloseTo(404.77, 2)
    expect(await tracker.getTransactionSummaryTotal('investment')).toBeCloseTo(200, 2)

    expect(await tracker.getTransactionSummaryCategoryAmount('income', 'Nómina')).toBeCloseTo(
      2000,
      2,
    )
    expect(await tracker.getTransactionSummaryCategoryAmount('expense', 'Comida')).toBeCloseTo(
      201.02,
      2,
    )
    expect(
      await tracker.getTransactionSummaryCategoryAmount('investment', 'Fondos Indexados'),
    ).toBeCloseTo(200, 2)

    const assertSortedDescByAmount = async (type: 'income' | 'expense' | 'investment') => {
      await tracker.showTransactionBreakdown(type)
      const amountTexts = await tracker.transactionsBreakdown
        .locator(`li[data-summary-type="${type}"] [data-summary-amount]`)
        .allInnerTexts()
      const amounts = amountTexts.map((text) =>
        Number.parseFloat(
          text
            .replace(/\u2212/g, '-')
            .replace(/[^\d,-]/g, '')
            .replace(/\./g, '')
            .replace(',', '.'),
        ),
      )
      expect(amounts.length).toBeGreaterThan(0)
      expect(amounts).toEqual([...amounts].sort((a, b) => b - a))
    }

    await assertSortedDescByAmount('income')
    await expect(tracker.transactionsBreakdown).toContainText('💼 Nómina')
    await assertSortedDescByAmount('expense')
    await assertSortedDescByAmount('investment')
  })

  // Quarantine: raw navigation does not wait for finance-ready before interacting.
  // https://github.com/alberba/finance-tracker/issues/233
  test.fixme('home no muestra bloque legacy de filtros en movimientos', async ({
    page,
    tracker,
  }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('html[data-finance-ready="true"]')).toBeVisible()
    await tracker.openTransactions()
    await expect(
      tracker.transactionsSection.getByRole('heading', {
        name: 'Orden y filtros de tabla',
      }),
    ).toHaveCount(0)
  })

  test('movimientos filtra por tipo con chips y por cuenta', async ({ tracker }) => {
    await tracker.addCustomTransaction({
      date: '2026-03-03',
      monthLabel: 'MARZO',
      type: 'income',
      categoryLabel: 'Nómina',
      amount: 301,
      description: 'e2e-multi-income',
    })
    await tracker.addCustomTransaction({
      date: '2026-03-04',
      monthLabel: 'MARZO',
      type: 'expense',
      categoryLabel: 'Comida',
      amount: 302,
      description: 'e2e-multi-expense',
    })
    await tracker.addCustomTransaction({
      date: '2026-03-05',
      monthLabel: 'MARZO',
      type: 'investment',
      categoryLabel: 'Fondos Indexados',
      amount: 303,
      description: 'e2e-multi-investment',
      accountLabel: 'MyInvestor',
    })

    await tracker.filterTransactionsMonth('MARZO')
    await tracker.setTransactionDescriptionFilter('e2e-multi')
    await expect(tracker.transactionRows).toHaveCount(3)

    await tracker.setTransactionTypeChip('Ingresos', false)

    await expect(tracker.transactionRows.filter({ hasText: 'e2e-multi-expense' })).toHaveCount(1)
    await expect(tracker.transactionRows.filter({ hasText: 'e2e-multi-investment' })).toHaveCount(1)
    await expect(tracker.transactionRows.filter({ hasText: 'e2e-multi-income' })).toHaveCount(0)

    await tracker.setTransactionTypeChip('Ingresos', true)
    await tracker.registryToolbar
      .getByLabel('Cuenta', { exact: true })
      .selectOption({ label: 'MyInvestor' })
    await expect(tracker.transactionRows).toHaveCount(1)
    await expect(tracker.transactionRows.first()).toContainText('e2e-multi-investment')

    await tracker.clearTransactionFilters()
  })

  test("movimientos soporta 'Guardar y añadir otro' y acciones masivas en la barra", async ({
    tracker,
  }) => {
    await tracker.addCustomTransactionKeepOpen({
      date: '2026-03-11',
      monthLabel: 'MARZO',
      type: 'expense',
      categoryLabel: 'Comida',
      amount: 11,
      description: 'e2e-bulk-a',
    })
    expect(await tracker.transactionModalDateValue()).toBe('2026-03-11')
    expect(await tracker.transactionModalCategoryValue()).toBe('Comida')

    await tracker.addCustomTransaction({
      date: '2026-03-12',
      monthLabel: 'MARZO',
      type: 'expense',
      categoryLabel: 'Comida',
      amount: 12,
      description: 'e2e-bulk-b',
    })

    await tracker.filterTransactionsMonth('MARZO')
    await tracker.setTransactionDescriptionFilter('e2e-bulk')
    await expect(tracker.bulkActionBar).toHaveCount(0)
    await tracker.selectTransactionByDescription('e2e-bulk-a')
    await tracker.selectTransactionByDescription('e2e-bulk-b')
    await expect(tracker.bulkActionBar).toContainText('2 seleccionados')
    await expect(tracker.bulkActionBar).toContainText('−23,00 €')
    await tracker.applyBulkTransactionChanges({
      type: 'investment',
      category: 'Fondos Indexados',
    })
    await expect(tracker.transactionRows.filter({ hasText: '📈 Fondos Indexados' })).toHaveCount(2)

    await tracker.deleteSelectedTransactions(2)
    await expect(tracker.transactionRows).toHaveCount(0)
    await expect(tracker.bulkActionBar).toHaveCount(0)
    await tracker.clearTransactionFilters()
  })

  test('eliminar un movimiento pide confirmación y Cancelar lo conserva', async ({
    page,
    tracker,
  }) => {
    await tracker.addCustomTransaction({
      date: '2026-03-13',
      monthLabel: 'MARZO',
      type: 'expense',
      categoryLabel: 'Comida',
      amount: 13,
      description: 'e2e-borrar',
    })
    await tracker.filterTransactionsMonth('MARZO')
    await tracker.setTransactionDescriptionFilter('e2e-borrar')
    const row = tracker.transactionRow('e2e-borrar')
    const remove = row.getByRole('button', { name: 'Eliminar e2e-borrar del 13 mar' })
    const dialog = page.getByRole('alertdialog', { name: '¿Eliminar este movimiento?' })

    await remove.click()
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('e2e-borrar del 13 mar')
    await dialog.getByRole('button', { name: 'Cancelar' }).click()
    await expect(dialog).toBeHidden()
    await expect(row).toBeVisible()

    await remove.click()
    await dialog.getByRole('button', { name: 'Eliminar movimiento' }).click()
    await expect(page.getByRole('status')).toContainText('Movimiento eliminado.')
    await expect(tracker.transactionRows).toHaveCount(0)
    await tracker.clearTransactionFilters()
  })

  test('el aviso se ve por encima del panel lateral abierto', async ({ page, tracker }) => {
    await tracker.addCustomTransactionKeepOpen({
      date: '2026-03-14',
      monthLabel: 'MARZO',
      type: 'expense',
      categoryLabel: 'Comida',
      amount: 14,
      description: 'e2e-aviso',
    })

    // The panel is a modal dialog in the top layer: the toast, a manual
    // popover shown after it, renders above it.
    await expect(tracker.transactionPanel).toBeVisible()
    const toast = page.locator('#toast')
    await expect(toast).toBeVisible()
    expect(await toast.evaluate((element) => element.matches(':popover-open'))).toBe(true)
    // Still in its corner, not centred like a bare popover.
    const box = await toast.boundingBox()
    const viewport = page.viewportSize()
    expect(box && viewport).toBeTruthy()
    expect(box!.x).toBeGreaterThan(viewport!.width / 2)
    expect(box!.y).toBeGreaterThan(viewport!.height / 2)
    await expect(
      tracker.transactionPanel.getByRole('button', { name: 'Guardar y añadir otro' }),
    ).toBeFocused()
  })

  test('movimientos cierra el panel lateral con Escape y con Cancelar', async ({
    page,
    tracker,
  }) => {
    await tracker.openTransactions()
    const open = tracker.transactionsSection.getByRole('button', {
      name: 'Nuevo movimiento',
    })
    const panel = page.getByRole('dialog', { name: 'Nuevo movimiento' })

    await open.click()
    await expect(panel).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden()
    await expect(open).toBeFocused()

    await open.click()
    await panel.getByRole('button', { name: 'Cancelar' }).click()
    await expect(panel).toBeHidden()
  })

  test('movimientos mantiene abierto el panel al seleccionar texto y soltar fuera', async ({
    page,
    tracker,
  }) => {
    await tracker.openTransactions()
    await tracker.transactionsSection.getByRole('button', { name: 'Nuevo movimiento' }).click()
    const panel = tracker.transactionPanel
    const descriptionInput = panel.getByLabel('Descripción')
    await expect(panel).toBeVisible()
    await descriptionInput.fill('seleccion en panel para e2e')

    const box = await descriptionInput.boundingBox()
    expect(box).not.toBeNull()
    if (!box) {
      return
    }

    await page.mouse.move(box.x + 8, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x - 160, box.y + box.height / 2)
    await page.mouse.up()

    const isOpen = await panel.evaluate((element) => (element as HTMLDialogElement).open)
    expect(isOpen).toBe(true)
  })

  test('datos crea issue de bug y muestra confirmación', async ({ page, tracker }) => {
    await page.route('**/api/issues/report', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          issueNumber: 321,
          issueUrl: 'https://github.com/example/repo/issues/321',
        }),
      })
    })

    await tracker.submitIssueReport({
      type: 'bug',
      summary: 'Error guardando datos',
      description: 'Después de guardar no persiste el estado.',
    })

    await expect(tracker.issueReportStatus()).toContainText('Reporte creado:')
    await expect(tracker.issueReportStatus().locator('a')).toHaveAttribute(
      'href',
      'https://github.com/example/repo/issues/321',
    )
  })
})
