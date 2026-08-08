import { test, expect } from './fixtures'

test.describe('Modo demo', () => {
  test('se activa y desactiva desde el menú de usuario sin mezclar la caché real', async ({
    page,
    request,
  }) => {
    await request.post('/api/state/reset-legacy', {
      headers: { 'x-finance-namespace': 'demo' },
    })

    await page.goto('/')

    const userMenuButton = page.getByRole('button', { name: 'Abrir menú de usuario' })
    await userMenuButton.click()

    const userMenu = page.getByRole('menu', { name: 'Menú de usuario' })
    await expect(userMenu).toBeVisible()

    await userMenu.getByRole('menuitem', { name: /Activar modo demo/ }).click()

    await expect(page.locator('html')).toHaveAttribute('data-demo', '1')
    await expect(page.getByText('Modo demo · datos ficticios')).toBeVisible()
    await expect
      .poll(() =>
        page.evaluate(() => ({
          demoFlag: localStorage.getItem('finance-demo-mode'),
          demoState: localStorage.getItem('finance-tracker-state-v1::demo'),
        })),
      )
      .toMatchObject({
        demoFlag: '1',
        demoState: expect.stringContaining('Cuenta Corriente'),
      })

    await userMenuButton.click()
    await userMenu.getByRole('menuitem', { name: /Salir del modo demo/ }).click()

    await expect(page.locator('html')).not.toHaveAttribute('data-demo', '1')
    await expect(page.getByText('Modo demo · datos ficticios')).toBeHidden()
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('finance-demo-mode')))
      .toBeNull()
  })
})
