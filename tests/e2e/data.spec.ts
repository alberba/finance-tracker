import { syncV2Test as test, expect } from './fixtures'

test.describe('Data E2E', () => {
  test(
    'renderiza datos y backups dentro del workspace Vue',
    { tag: '@smoke' },
    async ({ page, tracker }) => {
      await tracker.addAccount({ name: 'Cuenta de copia' })
      await tracker.addCustomTransaction({
        date: '2026-08-12',
        monthLabel: 'AGOSTO',
        type: 'expense',
        categoryLabel: 'Gastos generales',
        amount: 7.5,
        description: 'Movimiento de copia',
        accountLabel: 'Cuenta de copia',
      })
      await tracker.openData()

      const dataSection = tracker.section('data')

      await expect(page.locator('[data-finance-workspace] #data')).toBeVisible()
      await expect(dataSection.getByRole('heading', { name: 'Datos y backups' })).toBeVisible()

      await expect(dataSection.locator('[data-data-figures]')).toContainText(/Movimientos\s*[1-9]/)
      await expect(dataSection.locator('#data-meta')).toContainText('Origen:')
    },
  )

  test('exporta una copia y la vuelve a importar tras confirmar', async ({ page, tracker }) => {
    await tracker.addAccount({ name: 'Cuenta de copia' })
    await tracker.addCustomTransaction({
      date: '2026-08-12',
      monthLabel: 'AGOSTO',
      type: 'expense',
      categoryLabel: 'Gastos generales',
      amount: 7.5,
      description: 'Movimiento de copia',
      accountLabel: 'Cuenta de copia',
    })
    await tracker.openData()

    const dataSection = tracker.section('data')
    const figures = dataSection.locator('[data-data-figures]')
    await expect(
      dataSection.getByRole('button', { name: 'Reiniciar con datos semilla' }),
    ).toHaveCount(0)

    const downloadPromise = page.waitForEvent('download')
    await dataSection.getByRole('button', { name: 'Exportar JSON' }).click()
    const download = await downloadPromise
    const path = await download.path()

    await dataSection.locator('#import-json').setInputFiles(path)
    const dialog = page.getByRole('alertdialog', { name: '¿Importar esta copia?' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Sustituir mis datos' }).click()

    await expect(dialog).toBeHidden()
    await expect(page.getByText('JSON importado correctamente.')).toBeVisible()
    await expect(figures).toContainText(/Movimientos\s*[1-9]/)
  })
})
