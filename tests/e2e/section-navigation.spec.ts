import { test, expect } from './fixtures'

test.describe('Navegación de secciones', () => {
  test('pulsar Movimientos devuelve la vista al inicio sin abrir el alta', async ({
    page,
    tracker,
  }) => {
    await tracker.openTransactions()
    const transactionsHeading = tracker.transactionsSection.getByRole('heading', {
      name: 'Movimientos',
      exact: true,
    })

    await tracker.scrollToPageBottom()
    await expect.poll(() => tracker.scrollY()).toBeGreaterThan(0)
    await expect(transactionsHeading).not.toBeInViewport()

    await tracker.clickNav('transactions')

    await expect(page).toHaveURL(/\/movimientos$/)
    await expect.poll(() => tracker.scrollY()).toBe(0)
    await expect(transactionsHeading).toBeInViewport()
    await expect(page.locator('#nav-tabs [data-section="transactions"]:visible')).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(page.getByRole('dialog', { name: 'Nuevo movimiento' })).toBeHidden()
  })

  test('llegar a Movimientos desde otra sección empieza al inicio', async ({ page, tracker }) => {
    // La sección de destino tiene que poder conservar el desplazamiento: si el
    // navegador lo recortase al montar una sección más corta, el test pasaría
    // sin el reinicio. Se elige un offset válido en ambas secciones.
    await tracker.openTransactions()
    const transactionsMaxScroll = await tracker.maxScrollY()
    expect(transactionsMaxScroll).toBeGreaterThan(0)

    await tracker.openDashboard()
    const dashboardMaxScroll = await tracker.maxScrollY()
    const keptScroll = Math.min(transactionsMaxScroll, dashboardMaxScroll)
    expect(keptScroll).toBeGreaterThan(0)

    await tracker.scrollToPageY(keptScroll)
    await expect.poll(() => tracker.scrollY()).toBe(keptScroll)

    await tracker.clickNav('transactions')

    await expect(page).toHaveURL(/\/movimientos$/)
    await expect.poll(() => tracker.scrollY()).toBe(0)
    await expect(
      tracker.transactionsSection.getByRole('heading', { name: 'Movimientos', exact: true }),
    ).toBeInViewport()
  })
})
