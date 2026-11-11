import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import {
  ISSUE_URL,
  mockReportsApi,
  reportDetail,
  reportEntry,
  threadItem,
} from './pages/reports-api'

/**
 * «Mis reportes» in the new design (#448), desktop. No cookie: the new design
 * is the default. GitHub is never called: `/api/reports` is faked.
 */
const NO_COOKIE = { cookies: [], origins: [] }

test.use({ storageState: NO_COOKIE, viewport: { width: 1440, height: 900 } })

const GITHUB_ERROR = 'No se pudo consultar GitHub. Inténtalo de nuevo.'

const section = (page: Page) => page.locator('#reports')
const launcher = (page: Page) => page.locator('#global-report-trigger')

test.describe('Mis reportes en el diseño nuevo', () => {
  test(
    'crea un reporte, lo ve en la lista, abre su hilo y añade una aclaración',
    { tag: '@smoke' },
    async ({ page, tracker }) => {
      let created = false
      await mockReportsApi(page, {
        list: () => (created ? [reportEntry()] : []),
        detail: () => reportDetail({ thread: [threadItem()] }),
      })
      await page.route('**/api/issues/report', (route) => {
        created = true
        return route.fulfill({
          status: 201,
          json: {
            ok: true,
            issueNumber: 901,
            issueUrl: `${ISSUE_URL}/901`,
            tracked: true,
          },
        })
      })

      await tracker.openReports()
      await expect(section(page).getByText('Aún no has enviado ningún reporte.')).toBeVisible()

      await section(page).getByRole('button', { name: 'Crear reporte' }).click()
      await expect(tracker.issueReportDialog).toBeVisible()
      await tracker.issueReportDialog.getByLabel('Resumen').fill('El gráfico no respeta el filtro')
      await tracker.issueReportDialog.getByRole('button', { name: 'Crear reporte' }).click()
      await tracker.issueReportStatus().getByRole('link', { name: 'Ver en Mis reportes' }).click()

      // The list shows it and its thread is open.
      await expect(page).toHaveURL(/\/reportes\?reporte=901/)
      const entry = section(page).locator('[data-report-entry="901"]')
      await expect(entry).toContainText(reportEntry().title)
      await expect(entry).toContainText('Abierto')
      await expect(entry).toHaveAttribute('aria-current', 'true')
      const detail = section(page).locator('[data-report-detail]')
      await expect(detail.getByRole('heading', { name: reportEntry().title })).toBeFocused()
      await expect(detail.locator('[data-thread-item="700"]')).toContainText('Lo reproducimos')

      await detail.getByRole('textbox', { name: 'Nueva aclaración' }).fill('Ocurre solo en móvil.')
      await detail.getByRole('button', { name: 'Publicar aclaración' }).click()
      const own = detail.locator('[data-thread-item="555"]')
      await expect(own).toContainText('Ocurre solo en móvil.')
      await expect(own).toContainText('Tú')
      await expect(detail.getByRole('textbox', { name: 'Nueva aclaración' })).toHaveValue('')
    },
  )

  test('edita y borra una aclaración propia', async ({ page, tracker }) => {
    await mockReportsApi(page, {
      detail: () =>
        reportDetail({
          thread: [threadItem({ id: 555, kind: 'reporter', author: 'Tú', editable: true })],
        }),
    })

    await tracker.openReports(901)
    const own = section(page).locator('[data-thread-item="555"]')

    await own.getByRole('button', { name: 'Editar' }).click()
    await own.getByRole('textbox', { name: 'Editar aclaración' }).fill('Texto corregido.')
    await own.getByRole('button', { name: 'Guardar' }).click()
    await expect(own).toContainText('Texto corregido.')

    await own.getByRole('button', { name: 'Borrar' }).click()
    const confirm = own.getByRole('alertdialog', { name: '¿Borrar esta aclaración?' })
    await expect(confirm.getByRole('button', { name: 'Cancelar' })).toBeFocused()
    await confirm.getByRole('button', { name: 'Borrar de GitHub' }).click()
    await expect(section(page).locator('[data-thread-item="555"]')).toHaveCount(0)
  })

  test('avisa de novedades en el botón y en la fila y las apaga al abrir', async ({
    page,
    tracker,
  }) => {
    await mockReportsApi(page, { list: () => [reportEntry({ hasUpdates: true })] })

    await tracker.openReports()
    const dot = launcher(page).locator('[data-reports-updates]')
    await expect(dot).toBeVisible()
    await expect(section(page).locator('[data-report-entry="901"]')).toContainText('Nuevo')
    await expect(section(page)).toContainText('1 con novedades')

    const markedSeen = page.waitForRequest(
      (request) => request.method() === 'POST' && request.url().endsWith('/api/reports/901/seen'),
    )
    await section(page).locator('[data-report-entry="901"]').click()
    await markedSeen
    await expect(
      section(page).getByRole('heading', { name: reportEntry().title, level: 2 }),
    ).toBeVisible()
    await expect(dot).toHaveCount(0)
    await expect(section(page).locator('[data-report-new]')).toHaveCount(0)
  })

  test('el botón «Reportar» se despliega y abre el panel', async ({ page, tracker }) => {
    await mockReportsApi(page)
    await tracker.openReports()

    await expect(launcher(page)).toBeVisible()
    await launcher(page).hover()
    await expect(launcher(page).getByText('Reportar')).toBeVisible()

    await launcher(page).click()
    await expect(tracker.issueReportDialog).toBeVisible()
    await expect(launcher(page)).toBeHidden()
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

  test('un duplicado se sigue en la principal y su hilo es el de ella', async ({
    page,
    tracker,
  }) => {
    const main = {
      number: 887,
      url: `${ISSUE_URL}/887`,
      title: 'Exportar movimientos a PDF y CSV',
      state: 'OPEN' as const,
      stateReason: null,
    }
    const duplicate = reportEntry({
      number: 902,
      url: `${ISSUE_URL}/902`,
      title: 'Añadir exportación a PDF de los movimientos',
      state: 'CLOSED',
      stateReason: 'DUPLICATE',
      followed: main,
    })
    await mockReportsApi(page, {
      list: () => [duplicate],
      detail: () => reportDetail({ report: duplicate, threadIssue: main }),
    })

    await tracker.openReports(902)
    const row = section(page).locator('[data-report-entry="902"]')
    await expect(row).toContainText('Se sigue en #887 · Abierto')
    await expect(row).toContainText('Cerrado como duplicado · enviado el')
    const detail = section(page).locator('[data-report-detail]')
    await expect(detail.getByText('Exportar movimientos a PDF y CSV')).toBeVisible()
    await expect(detail.getByRole('link', { name: /Ver #887 en GitHub/ })).toHaveAttribute(
      'href',
      `${ISSUE_URL}/887`,
    )
    await expect(detail.getByText('Se publica en #887, donde sigue tu reporte.')).toBeVisible()
  })

  test('un hilo cerrado queda en solo lectura', async ({ page, tracker }) => {
    await mockReportsApi(page, {
      detail: () =>
        reportDetail({
          report: reportEntry({ state: 'CLOSED', stateReason: 'COMPLETED' }),
          canComment: false,
        }),
    })

    await tracker.openReports(901)
    await expect(
      section(page).getByText('Este reporte está cerrado: el hilo es de solo lectura.'),
    ).toBeVisible()
    await expect(section(page).getByRole('textbox', { name: 'Nueva aclaración' })).toHaveCount(0)
  })

  test('un fallo al publicar muestra el error y conserva el texto', async ({ page, tracker }) => {
    await mockReportsApi(page, { commentStatus: 502 })

    await tracker.openReports(901)
    const composer = section(page).getByRole('textbox', { name: 'Nueva aclaración' })
    await composer.fill('Texto que no debe perderse')
    await section(page).getByRole('button', { name: 'Publicar aclaración' }).click()

    await expect(section(page).getByRole('alert').first()).toContainText('GitHub no disponible')
    await expect(composer).toHaveValue('Texto que no debe perderse')
  })
})
