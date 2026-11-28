import { test, expect } from './fixtures'
import { mockReportsApi, reportEntry } from './pages/reports-api'

// PNG real de 1×1 píxel: pasa la comprobación de cabecera del servidor.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

function imageFile(name: string) {
  return { name, mimeType: 'image/png', buffer: PNG_1X1 }
}

test.describe('Reports E2E', () => {
  test('abre el panel lateral de reporte desde el acceso global', async ({ page, tracker }) => {
    const trigger = page.locator('#global-report-trigger')
    await expect(trigger).toBeVisible()

    await tracker.openGlobalReportDialog()
    const panel = tracker.issueReportDialog
    await expect(panel.getByLabel('Resumen')).toBeFocused()
    await expect(trigger).toBeHidden()

    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden()
    await expect(trigger).toBeFocused()

    await trigger.click()
    await panel.getByRole('button', { name: 'Cerrar', exact: true }).click()
    await expect(panel).toBeHidden()
    await expect(trigger).toBeFocused()

    await trigger.click()
    await panel.getByRole('button', { name: 'Cancelar' }).click()
    await expect(panel).toBeHidden()
    await expect(trigger).toBeFocused()
  })

  test('retiene la captura de arranque incompleto aunque el estado cambie antes de enviarla', async ({
    page,
    tracker,
  }) => {
    const started = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    await page.route('**/api/session', async (route) => {
      started.resolve()
      await release.promise
      await route.continue()
    })
    const submitted = Promise.withResolvers<unknown>()
    await page.route('**/api/issues/report', (route) => {
      submitted.resolve(route.request().postDataJSON())
      return route.fulfill({
        status: 201,
        json: {
          ok: true,
          issueNumber: 557,
          issueUrl: 'https://github.com/example/repo/issues/557',
          tracked: true,
        },
      })
    })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await started.promise
    try {
      await tracker.openGlobalReportDialog()
      const diagnostic = await tracker.reviewDiagnostic()
      await expect(diagnostic).toContainText('Arranque incompleto')
      await expect(diagnostic).toContainText('Evidencia insuficiente')
      release.resolve()
      await expect(page.locator('html[data-finance-ready="true"]')).toBeAttached()
      await expect(diagnostic).toContainText('Arranque incompleto')
      const panel = tracker.issueReportDialog
      await panel.getByRole('checkbox', { name: /Adjuntar diagnóstico/ }).check()
      await panel.getByLabel('Resumen').fill('Arranque detenido')
      await panel.getByRole('button', { name: 'Crear reporte' }).click()
      expect(await submitted.promise).toMatchObject({
        diagnostic: { load: 'starting', sync: null, section: { checks: ['insufficient'] } },
      })
    } finally {
      release.resolve()
    }
  })

  test('avisa honestamente cuando el reporte no quedó registrado en Mis reportes', async ({
    page,
    tracker,
  }) => {
    await page.route('**/api/issues/report', (route) =>
      route.fulfill({
        status: 201,
        json: {
          ok: true,
          issueNumber: 42,
          issueUrl: 'https://github.com/example/repo/issues/42',
          tracked: false,
        },
      }),
    )
    await tracker.submitIssueReport({ type: 'bug', summary: 'El guardado no persiste' })
    const status = tracker.issueReportStatus()
    await expect(status).toContainText('Tu borrador sigue en el formulario.')
    await expect(status).not.toContainText('Reporte creado:')
  })

  test('crea un reporte con solo resumen y avisa de la publicación antes de enviar', async ({
    page,
    tracker,
  }) => {
    let submittedPayload: Record<string, unknown> | undefined
    await page.route('**/api/issues/report', async (route) => {
      submittedPayload = route.request().postDataJSON() as Record<string, unknown>
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          issueNumber: 655,
          issueUrl: 'https://github.com/example/repo/issues/655',
          tracked: true,
        }),
      })
    })

    await tracker.openGlobalReportDialog()
    const panel = tracker.issueReportDialog
    await expect(panel.getByLabel('Resultado esperado')).toHaveCount(0)
    await expect(panel.getByLabel('Resultado actual')).toHaveCount(0)
    await expect(
      panel.getByText('GitHub recibirá este resumen técnico y la referencia del caso.'),
    ).toBeVisible()
    await expect(panel.getByRole('checkbox', { name: /Adjuntar diagnóstico/ })).not.toBeChecked()
    await panel.getByLabel('Resumen').fill('El filtro no guarda el valor')

    await panel.getByRole('button', { name: 'Crear reporte' }).click()

    await expect(tracker.issueReportStatus()).toContainText('Reporte creado:')
    expect(submittedPayload).toMatchObject({
      type: 'bug',
      summary: 'El filtro no guarda el valor',
    })
    expect(submittedPayload).not.toHaveProperty('description')
    expect(submittedPayload).not.toHaveProperty('diagnostic')
    for (const retired of ['expectedResult', 'actualResult', 'stepsToReproduce']) {
      expect(submittedPayload).not.toHaveProperty(retired)
    }
  })

  test('muestra error cuando falla la API de reporte', async ({ page, tracker }) => {
    await page.route('**/api/issues/report', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'GitHub no disponible' }),
      })
    })

    await tracker.submitIssueReport({
      type: 'bug',
      summary: 'Error en endpoint',
      description: 'Prueba de manejo de error al crear issue.',
    })

    await expect(tracker.issueReportStatus()).toContainText(
      'No se pudo crear la issue: GitHub no disponible',
    )
    const panel = tracker.issueReportDialog
    await expect(panel.getByLabel('Resumen')).toHaveValue('Error en endpoint')
    await expect(panel.getByRole('button', { name: 'Copiar resumen técnico' })).toBeVisible()
  })

  test('adjunta hasta tres capturas, las lista, quita una y envía solo las vigentes', async ({
    page,
    tracker,
  }) => {
    let submittedPayload: Record<string, unknown> | undefined
    await page.route('**/api/issues/report', async (route) => {
      submittedPayload = route.request().postDataJSON() as Record<string, unknown>
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          issueNumber: 900,
          issueUrl: 'https://github.com/example/repo/issues/900',
          tracked: true,
        }),
      })
    })

    await tracker.openGlobalReportDialog()
    const panel = tracker.issueReportDialog
    await panel.getByLabel('Resumen').fill('Captura del filtro roto')
    await panel
      .locator('#issue-report-attachments')
      .setInputFiles([imageFile('uno.png'), imageFile('dos.png'), imageFile('tres.png')])

    const list = panel.locator('#issue-report-attachment-list')
    await expect(list.getByRole('listitem')).toHaveCount(3)
    await expect(list.getByRole('listitem').filter({ hasText: 'dos.png' })).toBeVisible()

    await panel.getByRole('button', { name: 'Quitar dos.png' }).click()
    await expect(list.getByRole('listitem')).toHaveCount(2)

    await panel.getByRole('button', { name: 'Crear reporte' }).click()

    await expect(tracker.issueReportStatus()).toContainText('Reporte creado:')
    const attachments = submittedPayload?.attachments as Array<Record<string, string>>
    expect(attachments.map((item) => item.name)).toEqual(['uno.png', 'tres.png'])
    expect(attachments[0]).toMatchObject({ contentType: 'image/png' })
    expect(Buffer.from(attachments[0].data, 'base64').subarray(0, 8)).toEqual(
      PNG_1X1.subarray(0, 8),
    )
  })
})

test.describe('Mis reportes E2E', () => {
  test('carga la página siguiente sin ocultar la lista', async ({ page, tracker }) => {
    await mockReportsApi(page, {
      list: () => [reportEntry()],
      loadMore: () => [reportEntry({ number: 902, title: 'Exportación a PDF' })],
    })
    await page.goto('/reportes')
    await expect(page.locator('[data-report-entry="901"]')).toBeVisible()

    await tracker.reportsPage.getByRole('button', { name: 'Cargar más reportes' }).click()

    await expect(page.locator('[data-report-entry="902"]')).toContainText('Exportación a PDF')
    await expect(page.locator('[data-report-entry="901"]')).toBeVisible()
    await expect(
      tracker.reportsPage.getByRole('button', { name: 'Cargar más reportes' }),
    ).toHaveCount(0)
  })

  test('la demo muestra dos reportes y no llama a la API', async ({ page }) => {
    const apiCalls: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/api/reports')) apiCalls.push(request.url())
    })

    await page.goto('/?demo=1')
    await expect(page.locator('html[data-finance-ready="true"]')).toBeVisible()
    await page.goto('/reportes')
    await expect(page.locator('html[data-finance-ready="true"]')).toBeVisible()

    await expect(page.locator('[data-report-entry="901"]')).toContainText(
      'El gráfico de gastos no respeta el filtro de mes',
    )
    await expect(page.locator('[data-report-entry="902"]')).toContainText(
      'Añadir exportación a PDF de los movimientos',
    )
    await page.locator('[data-report-entry="901"]').click()
    await expect(page.getByText('En la demo no se envían comentarios.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Tu descripción' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Descripción en GitHub' })).toBeVisible()
    expect(apiCalls).toEqual([])
  })

  test('un usuario sin filas ve la lista vacía desde la API real', async ({ tracker }) => {
    await tracker.openReports()
    await expect(tracker.reportsPage.getByText('Aún no has enviado ningún reporte.')).toBeVisible()
  })
})
