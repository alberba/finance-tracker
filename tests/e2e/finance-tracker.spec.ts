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

  test('movimientos exporta el informe de un periodo como PDF y CSV', async ({
    page,
    tracker,
  }, testInfo) => {
    await page.goto('/movimientos')
    await expect(
      tracker.transactionsSection.getByRole('heading', { name: 'Movimientos', exact: true }),
    ).toBeVisible()
    await expect(
      tracker.transactionsSection.getByRole('button', { name: 'Importe y fecha' }),
    ).toHaveCount(0)

    await tracker.transactionsSection.getByRole('button', { name: 'Exportar' }).click()
    const panel = page.getByRole('dialog', { name: 'Informe mensual' })
    await expect(panel).toBeVisible()

    await panel.getByLabel('Desde').fill('2026-02-01')
    await panel.getByLabel('Hasta').fill('2026-02-28')
    const summary = panel.locator('[data-report-summary]')
    await expect(summary).toContainText('13 movimientos')
    await expect(summary).toContainText(/Ingresos 2\.085,00/)
    await expect(summary).toContainText(/Gastos 404,77/)

    await panel.getByLabel('Hasta').fill('2999-01-01')
    await expect(panel.locator('[data-report-error]')).toContainText('futura')
    await expect(panel.getByRole('button', { name: 'Descargar PDF' })).toBeDisabled()
    await panel.getByLabel('Hasta').fill('2026-02-28')

    const pdfDownload = page.waitForEvent('download')
    await panel.getByRole('button', { name: 'Descargar PDF' }).click()
    const pdf = await pdfDownload
    expect(pdf.suggestedFilename()).toBe('Informe 2026-02-01 - 2026-02-28.pdf')
    const pdfPath = testInfo.outputPath('report.pdf')
    await pdf.saveAs(pdfPath)
    const header = (await import('node:fs')).readFileSync(pdfPath).subarray(0, 5).toString()
    expect(header).toBe('%PDF-')

    const csvDownload = page.waitForEvent('download')
    await panel.getByRole('button', { name: 'Descargar CSV' }).click()
    expect((await csvDownload).suggestedFilename()).toBe('movimientos-2026-02-01-2026-02-28.csv')
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

  test('datos crea issue de bug y muestra confirmación', async ({ page, tracker }) => {
    await page.route('**/api/issues/report', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          issueNumber: 321,
          issueUrl: 'https://github.com/example/repo/issues/321',
          tracked: true,
        }),
      })
    })

    await tracker.submitIssueReport({
      type: 'bug',
      summary: 'Error guardando datos',
      description: 'Después de guardar no persiste el estado.',
    })

    const status = tracker.issueReportStatus()
    await expect(status).toContainText('Reporte creado:')
    await expect(status.getByRole('link', { name: '#321' })).toHaveAttribute(
      'href',
      'https://github.com/example/repo/issues/321',
    )
    await expect(status.getByRole('link', { name: 'Ver en Mis reportes' })).toHaveAttribute(
      'href',
      '/reportes',
    )
    await expect(status).not.toContainText('No pudimos añadirlo a Mis reportes todavía')
  })
})
