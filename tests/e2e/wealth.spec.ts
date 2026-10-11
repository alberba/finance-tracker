import { test, expect } from './fixtures'

test.describe('Patrimonio', () => {
  test('cuenta los cambios sin guardar y los descarta', async ({ tracker }) => {
    await tracker.openWealth()
    await tracker.selectWealthMonth('MARZO')
    const band = tracker.wealthSection.locator('[data-wealth-band]')
    const total = band.locator('#wealth-total')
    const before = await total.textContent()

    await tracker.wealthSnapshotInput('Revolut').fill('12345,67')

    const changes = tracker.wealthSection.locator('[data-snapshot-changes]')
    await expect(changes).toContainText('1 cambio sin guardar')
    await expect(band.locator('[data-wealth-status]')).toHaveText('Con cambios sin guardar')
    await expect(total).not.toHaveText(before ?? '')

    await changes.getByRole('button', { name: 'Descartar' }).click()
    await expect(changes).toBeHidden()
    await expect(tracker.wealthSnapshotInput('Revolut')).toHaveValue('')
    await expect(total).toHaveText(before ?? '')
  })

  test('una entrada inválida no se guarda hasta corregirla', async ({ page, tracker }) => {
    await tracker.openWealth()
    await tracker.selectWealthMonth('MARZO')
    const input = tracker.wealthSnapshotInput('Revolut')

    await input.fill('12x')
    await expect(input).toHaveAttribute('aria-invalid', 'true')
    await tracker.wealthSection.locator('[data-save-snapshot]').click()
    await expect(page.locator('#toast')).toContainText(
      'Corrige los saldos no válidos antes de guardar.',
    )
    await expect(input).toHaveValue('12x')
    await expect(tracker.wealthSection.locator('[data-wealth-status]')).toHaveText(
      'Con cambios sin guardar',
    )

    await input.fill('150')
    await tracker.wealthSection.locator('[data-save-snapshot]').click()
    await expect(tracker.wealthSection.locator('[data-wealth-status]')).toHaveText('Guardado')
    await expect(input).toHaveValue('150')
  })

  test('marca en la tira los meses con snapshot guardado', async ({ tracker }) => {
    await tracker.openWealth()
    const months = tracker.wealthSection.getByRole('group', { name: 'Mes del snapshot' })
    await expect(months.getByRole('button', { name: 'enero, snapshot guardado' })).toBeVisible()
    await expect(months.getByRole('button', { name: 'marzo, sin guardar' })).toBeVisible()

    await tracker.saveAccountSnapshot({ monthLabel: 'MARZO', accountName: 'Revolut', value: 150 })

    await expect(months.getByRole('button', { name: 'marzo, snapshot guardado' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(tracker.wealthSection.locator('[data-wealth-status]')).toHaveText('Guardado')
  })

  test('calcula el saldo de una cuenta en el panel lateral con las teclas de operador', async ({
    tracker,
  }) => {
    await tracker.openWealth()
    await tracker.selectWealthMonth('MARZO')
    await tracker.wealthSection
      .getByRole('button', { name: 'Calcular el saldo de Santander' })
      .click()

    const panel = tracker.wealthCalcPanel()
    await expect(panel).toBeVisible()
    await expect(panel.getByText('Snapshot · marzo')).toBeVisible()
    const field = panel.getByLabel('Cálculo numérico')
    await field.fill('45,5')
    await panel.getByRole('button', { name: 'Multiplicar' }).click()
    await field.press('End')
    await field.pressSequentially('2')
    await expect(panel.locator('[data-calc-result]')).toHaveText('91,00 €')

    await field.fill('2+')
    await expect(panel.getByText('El cálculo no es válido')).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Aplicar al snapshot' })).toBeDisabled()

    await field.fill('45,5*2')
    await panel.getByRole('button', { name: 'Aplicar al snapshot' }).click()
    await expect(panel).toBeHidden()
    await expect(tracker.wealthSnapshotInput('Santander')).toHaveValue('91')
  })

  test('el historial abre el snapshot del mes pulsado', async ({ tracker }) => {
    await tracker.openWealth()
    const history = tracker.wealthSection.getByRole('table', {
      name: 'Saldo de cada cuenta por mes, en euros redondeados',
    })
    await expect(history.locator('[data-history-row="total"]')).toBeVisible()

    await history.getByRole('button', { name: 'Abrir el snapshot de febrero' }).click()

    await expect(
      tracker.wealthSection.getByRole('heading', { name: 'Total del snapshot de febrero' }),
    ).toBeVisible()
    await expect(
      tracker.wealthSection
        .getByRole('group', { name: 'Mes del snapshot' })
        .getByRole('button', { name: /^febrero,/ }),
    ).toHaveAttribute('aria-pressed', 'true')
  })
})
