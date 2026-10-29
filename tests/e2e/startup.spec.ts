import { test as base, expect } from './fixtures'
import { expectSelfHostedFonts } from './pages/fonts'

const test = base.extend({
  page: async ({ page }, use) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error' && message.text().includes('Error hydrating')) {
        errors.push(message.text())
      }
    })
    await use(page)
    expect(errors, 'The workspace must hydrate without replacing its Vue runtime').toEqual([])
  },
})

test('hydrates the workspace without client runtime errors', async ({ tracker }) => {
  await expect(
    tracker.dashboardSection.getByRole('button', { name: 'Nuevo movimiento' }),
  ).toBeEnabled()
})

test(
  'carga Syne, DM Sans y DM Mono desde el propio dominio',
  { tag: '@smoke' },
  async ({ page, tracker }) => {
    await tracker.reload()
    await expectSelfHostedFonts(page)
  },
)
