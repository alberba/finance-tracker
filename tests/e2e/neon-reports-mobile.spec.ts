import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { mockReportsApi, reportEntry } from './pages/reports-api'

/**
 * «Mis reportes» in the mobile frame of the new design (#449), in the mobile
 * project. No cookie: the new design is the default. GitHub is never called:
 * `/api/reports` is faked. Wording and counts are the view-model's unit tests';
 * here, what the person does and what they get.
 */
const NO_COOKIE = { cookies: [], origins: [] }

test.use({ storageState: NO_COOKIE })

const GITHUB_ERROR = 'No se pudo consultar GitHub. Inténtalo de nuevo.'

const section = (page: Page) => page.locator('#reports')
const moreTrigger = (page: Page) => page.getByRole('button', { name: 'Más secciones' })
const moreSheet = (page: Page) => page.getByRole('dialog', { name: 'Más secciones' })

test(
  'abre Mis reportes desde «Más» y ve el aviso de novedades',
  { tag: '@smoke' },
  async ({ page, tracker }) => {
    await mockReportsApi(page, {
      list: () => [
        reportEntry({ hasUpdates: true }),
        reportEntry({ number: 902, title: 'La hoja «Más» tapa el botón', hasUpdates: false }),
      ],
    })

    await tracker.goto()
    await expect(moreTrigger(page).locator('[data-reports-badge-dot]')).toBeVisible()
    await expect(moreTrigger(page)).toHaveAccessibleDescription('1 reporte con novedades')

    await moreTrigger(page).click()
    const mine = moreSheet(page).getByRole('button', { name: /Mis reportes/ })
    await expect(mine.locator('[data-reports-count-badge]')).toHaveText(/^1/)
    await mine.click()

    await expect(moreSheet(page)).toBeHidden()
    await expect(page).toHaveURL(/\/reportes$/)
    await expect(
      section(page).getByRole('heading', { name: 'Mis reportes', level: 1 }),
    ).toBeVisible()
    await expect(section(page).locator('[data-report-entry]')).toHaveCount(2)
    await expect(section(page).locator('[data-report-entry="901"] [data-report-new]')).toBeVisible()
    await expect(section(page).locator('[data-report-new]')).toHaveCount(1)
    // «/reportes» is not a section: no entry of the bar, not even «Más», is current.
    await expect(moreTrigger(page)).toHaveAttribute('data-active', 'false')
  },
)

test('sin novedades la hoja «Más» no lleva punto ni contador, y «Crear reporte» abre el panel', async ({
  page,
  tracker,
}) => {
  await mockReportsApi(page, { list: () => [reportEntry()] })

  await tracker.goto()
  await moreTrigger(page).click()
  await expect(moreSheet(page).locator('[data-reports-count-badge]')).toBeHidden()
  await expect(moreTrigger(page).locator('[data-reports-badge-dot]')).toBeHidden()

  await moreSheet(page)
    .getByRole('button', { name: /Crear reporte/ })
    .click()
  await expect(moreSheet(page)).toBeHidden()
  await expect(tracker.issueReportDialog).toBeVisible()
})

test('un fallo de la lista muestra el error y se reintenta', async ({ page, tracker }) => {
  await mockReportsApi(page)
  await page.route('**/api/reports', (route) =>
    route.fulfill({ status: 502, json: { ok: false, error: GITHUB_ERROR } }),
  )

  await tracker.openReports()
  const alert = section(page).getByRole('alert')
  await expect(alert).toContainText(GITHUB_ERROR)
  await expect(alert).toContainText('Tus reportes siguen guardados; solo falta leer su estado.')

  await page.unroute('**/api/reports')
  await alert.getByRole('button', { name: 'Reintentar' }).click()
  await expect(section(page).locator('[data-report-entry="901"]')).toBeVisible()
})

test('sin reportes la lista invita a crear uno', async ({ page, tracker }) => {
  await mockReportsApi(page, { list: () => [] })

  await tracker.openReports()
  const empty = section(page).locator('[data-empty-state]')
  await expect(empty.getByText('Aún no has enviado ningún reporte.')).toBeVisible()
  // With nothing sent, «Crear reporte» is the empty state's own button, not the header's.
  await expect(section(page).getByRole('button', { name: 'Crear reporte' })).toHaveCount(1)

  await empty.getByRole('button', { name: 'Crear reporte' }).click()
  await expect(tracker.issueReportDialog).toBeVisible()
})

test('todos los controles de Mis reportes y de «Más» miden al menos 44 px con puntero táctil', async ({
  page,
  tracker,
}) => {
  await mockReportsApi(page, {
    list: () => [reportEntry({ hasUpdates: true })],
    loadMore: () => [reportEntry({ number: 903, title: 'Otro reporte' })],
  })
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)

  const tooSmall = (selector: string) =>
    page.locator(selector).evaluateAll((controls) =>
      controls
        .filter((control) => control.getClientRects().length > 0)
        .map((control) => {
          const { width, height } = control.getBoundingClientRect()
          const name = control.getAttribute('aria-label') || control.textContent?.trim()
          return { name, width: Math.round(width), height: Math.round(height) }
        })
        .filter(({ width, height }) => width < 44 || height < 44),
    )
  const CONTROLS = 'button, a[href], input, select'

  await tracker.openReports()
  await expect(section(page).locator('[data-report-entry="901"]')).toBeVisible()
  expect(await tooSmall(`#reports :is(${CONTROLS})`)).toEqual([])
  expect(
    await tooSmall(`#nav-tabs nav[aria-label="Navegación principal"] :is(${CONTROLS})`),
  ).toEqual([])

  await moreTrigger(page).click()
  await expect(moreSheet(page)).toBeVisible()
  expect(await tooSmall(`#mobile-more-menu :is(${CONTROLS})`)).toEqual([])
})
