import { test, expect } from './fixtures'

// 3 October 2026: September is the last closed month and October is in progress.
test.use({ fixedTime: '2026-10-03T12:00:00' })

test.describe('Presupuesto', () => {
  test(
    'abre en Gastos con el mes anterior, el actual y el siguiente',
    { tag: '@smoke' },
    async ({ tracker }) => {
      await tracker.openBudget()
      const section = tracker.budgetSection

      await expect(section.getByRole('heading', { name: 'Presupuesto', level: 2 })).toBeVisible()
      await expect(section.getByRole('tab', { name: /Gastos/ })).toHaveAttribute(
        'aria-selected',
        'true',
      )
      await expect(section.getByRole('group', { name: 'Resumen del año' })).toContainText(
        'Desvío hasta septiembre',
      )
      const table = section.getByRole('table', { name: 'Gastos por categoría y mes' })
      await expect(table.getByRole('columnheader')).toHaveText([
        'Categoría',
        /Septiembre\s*cerrado/,
        /Octubre\s*en curso/,
        /Noviembre\s*previsto/,
      ])

      await tracker.openBudgetTab('income')
      await expect(section.getByRole('group', { name: 'Resumen del año' })).toContainText(
        'Falta por ingresar',
      )
      await expect(
        section.getByRole('table', { name: 'Ingresos por categoría y mes' }),
      ).toBeVisible()
    },
  )

  test('mueve la ventana de meses sin salirse del año', async ({ tracker }) => {
    await tracker.openBudget()
    const section = tracker.budgetSection
    const next = section.getByRole('button', { name: 'Meses siguientes' })

    await next.click()
    await expect(section.getByRole('columnheader', { name: /Diciembre/ })).toBeVisible()
    await expect(next).toBeDisabled()

    await tracker.selectBudgetRange('6')
    await expect(section.getByRole('columnheader')).toHaveCount(7)
  })

  test('edita una celda en la vista de año y recuerda la vista al volver', async ({ tracker }) => {
    await tracker.setBudgetValue({
      typeValue: 'expense',
      monthLabel: 'MARZO',
      categoryLabel: 'Comida',
      plannedValue: '432,1',
    })

    await tracker.reload()
    await tracker.openBudget()
    await expect(tracker.budgetSection.locator('[data-budget-range="12"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(tracker.budgetInput('Comida', 'marzo')).toHaveValue('432,1')
  })

  test('marca un importe que no se entiende y no lo guarda', async ({ tracker }) => {
    await tracker.setBudgetValue({
      typeValue: 'expense',
      monthLabel: 'ABRIL',
      categoryLabel: 'Ocio',
      plannedValue: 'abc',
    })

    await expect(tracker.budgetInput('Ocio', 'abril')).toHaveAttribute('aria-invalid', 'true')
  })

  test('planifica los doce meses de una categoría desde su panel', async ({ tracker, page }) => {
    const panel = await tracker.openBudgetPlan('Ocio')

    await expect(panel.getByText('Plan de 2026 · Gastos')).toBeVisible()
    await panel.getByRole('textbox', { name: 'Diciembre' }).fill('250')
    await panel.getByRole('textbox', { name: 'Noviembre' }).fill('-3')
    await expect(panel.getByRole('button', { name: 'Guardar plan' })).toBeDisabled()
    await panel.getByRole('textbox', { name: 'Noviembre' }).fill('140,5')
    await panel.getByRole('button', { name: 'Guardar plan' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()

    await tracker.reload()
    await tracker.openBudget()
    await tracker.selectBudgetRange('12')
    await expect(tracker.budgetInput('Ocio', 'diciembre')).toHaveValue('250')
    await expect(tracker.budgetInput('Ocio', 'noviembre')).toHaveValue('140,5')
  })
})
