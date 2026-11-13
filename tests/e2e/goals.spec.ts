import { test, expect } from './fixtures'

const NET_KEYS = ['short', 'medium', 'long']
const PORTFOLIO_KEYS = ['investmentTotal', 'investmentFunds', 'investmentCrypto']

test.describe('Goals E2E', () => {
  test(
    'muestra los objetivos en sus dos libros mayores',
    { tag: '@smoke' },
    async ({ tracker }) => {
      await tracker.openGoals()
      const goals = tracker.goalsSection

      await expect(goals.getByRole('heading', { name: 'Objetivos', exact: true })).toBeVisible()
      await expect(goals.getByRole('region', { name: 'Ritmo necesario' })).toContainText('/mes')

      const net = goals.getByRole('table', { name: 'Objetivos de patrimonio neto' })
      const portfolio = goals.getByRole('table', { name: 'Objetivos de la cartera' })
      for (const key of NET_KEYS) {
        await expect(net.locator(`[data-goal-row="${key}"]`)).toBeVisible()
      }
      for (const key of PORTFOLIO_KEYS) {
        await expect(portfolio.locator(`[data-goal-row="${key}"]`)).toBeVisible()
      }
      await expect(net.locator('[data-goal-cursor]')).toContainText('Hoy ·')
    },
  )

  test('edita un objetivo en el panel lateral, lo persiste y lo refleja en el dashboard', async ({
    tracker,
    page,
  }) => {
    await tracker.openGoalPanel('short')
    const panel = tracker.goalPanel()

    await panel.getByLabel('Nombre').fill('Colchón de seguridad')
    await expect(panel.getByRole('heading', { name: 'Colchón de seguridad' })).toBeVisible()

    await panel.getByLabel('Año objetivo').fill('1999')
    await expect(panel.getByRole('button', { name: 'Guardar objetivo' })).toBeDisabled()

    await panel.getByLabel('Año objetivo').fill('2027')
    await panel.getByLabel('Importe objetivo').fill('34.567,89')
    await expect(panel.locator('[data-goal-preview]')).toContainText('Hasta dic 2027')

    await panel.getByRole('button', { name: 'Guardar objetivo' }).click()
    await expect(panel).toBeHidden()
    await expect(page.getByRole('status').filter({ hasText: 'Objetivo guardado.' })).toBeVisible()

    const row = tracker.goalRow('short')
    await expect(row).toContainText('Colchón de seguridad')
    await expect(row).toContainText('34.567,89')
    await expect(row).toContainText('dic 2027')

    await tracker.openDashboard()
    await expect(tracker.dashboardSection.locator('#savings-goal')).toContainText(
      'Colchón de seguridad',
    )

    await tracker.reload()
    await tracker.openGoalPanel('short')
    await expect(tracker.goalPanel().getByLabel('Nombre')).toHaveValue('Colchón de seguridad')
    await expect(tracker.goalPanel().getByLabel('Año objetivo')).toHaveValue('2027')
    await expect(tracker.goalPanel().getByLabel('Importe objetivo')).toHaveValue('34567,89')
  })

  test('cierra el panel con Escape sin guardar el borrador', async ({ tracker, page }) => {
    await tracker.openGoalPanel('medium')
    const name = await tracker.goalPanel().getByLabel('Nombre').inputValue()

    await tracker.goalPanel().getByLabel('Nombre').fill('Borrador sin guardar')
    await page.keyboard.press('Escape')

    await expect(tracker.goalPanel()).toBeHidden()
    await expect(tracker.goalRow('medium')).toContainText(name)
    await expect(tracker.goalRow('medium')).not.toContainText('Borrador sin guardar')
  })
})
