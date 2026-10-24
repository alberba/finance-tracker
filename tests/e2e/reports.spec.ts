import { test, expect } from './fixtures'

// PNG real de 1×1 píxel: pasa la comprobación de cabecera del servidor.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

function imageFile(name: string, size = PNG_1X1.length) {
  const buffer = Buffer.alloc(size)
  PNG_1X1.copy(buffer, 0, 0, Math.min(PNG_1X1.length, size))
  return { name, mimeType: 'image/png', buffer }
}

test.describe('Reports E2E', () => {
  test('abre el panel lateral de reporte desde el acceso global', async ({ page, tracker }) => {
    const trigger = page.locator('#global-report-trigger')
    await expect(trigger).toBeVisible()
    const triggerBox = await trigger.boundingBox()
    const iconBox = await trigger.locator('svg').boundingBox()
    if (!triggerBox || !iconBox) {
      throw new Error('No se pudo medir el acceso global de reportes.')
    }
    expect(
      Math.abs(triggerBox.x + triggerBox.width / 2 - (iconBox.x + iconBox.width / 2)),
    ).toBeLessThanOrEqual(1)

    const compactWidth = triggerBox.width
    await trigger.hover()
    await expect
      .poll(async () => (await trigger.boundingBox())?.width ?? 0)
      .toBeGreaterThan(compactWidth)

    await tracker.openGlobalReportDialog()
    const panel = tracker.issueReportDialog
    // Polled: the side panel slides in from the right edge.
    await expect
      .poll(() => panel.evaluate((element) => Math.round(element.getBoundingClientRect().right)))
      .toBe(page.viewportSize()!.width)
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

  test('crea un reporte desde cualquier sección sin automatización', async ({ page, tracker }) => {
    await page.route('**/api/issues/report', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          issueNumber: 654,
          issueUrl: 'https://github.com/example/repo/issues/654',
        }),
      })
    })

    await tracker.openBudget()
    await tracker.submitIssueReport({
      type: 'feature',
      summary: 'Mejorar feedback visual',
      description: 'Quiero ver un estado más claro al crear reportes.',
    })

    await expect(tracker.issueReportStatus()).toContainText('Reporte creado:')
    await expect(tracker.issueReportStatus()).toContainText('#654')
    await expect(tracker.issueReportStatus()).not.toContainText('automatización')
  })

  test('enlaza la issue duplicada sin mostrar que se ha creado otra', async ({ page, tracker }) => {
    await page.route('**/api/issues/report', (route) =>
      route.fulfill({
        status: 200,
        json: {
          ok: true,
          issueNumber: 42,
          issueUrl: 'https://github.com/example/repo/issues/42',
          duplicate: true,
        },
      }),
    )
    await tracker.submitIssueReport({ type: 'bug', summary: 'El guardado no persiste' })
    const status = tracker.issueReportStatus()
    await expect(status).toContainText('Este reporte ya existe:')
    await expect(status).not.toContainText('Reporte creado:')
    await expect(status.getByRole('link', { name: '#42' })).toHaveAttribute(
      'href',
      'https://github.com/example/repo/issues/42',
    )
  })

  test('envía únicamente los campos vigentes del formulario', async ({ page, tracker }) => {
    let submittedPayload: Record<string, unknown> | undefined
    await page.route('**/api/issues/report', async (route) => {
      submittedPayload = route.request().postDataJSON() as Record<string, unknown>
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          issueNumber: 321,
          issueUrl: 'https://github.com/example/repo/issues/321',
        }),
      })
    })

    await tracker.submitIssueReport({
      type: 'bug',
      summary: 'Fallo al exportar datos',
      description: 'Después de guardar no persiste el estado.',
    })

    await expect(tracker.issueReportStatus()).toContainText('Reporte creado:')
    expect(submittedPayload).toMatchObject({
      type: 'bug',
      summary: 'Fallo al exportar datos',
      description: 'Después de guardar no persiste el estado.',
    })
    for (const retired of ['expectedResult', 'actualResult', 'stepsToReproduce']) {
      expect(submittedPayload).not.toHaveProperty(retired)
    }
    await expect(tracker.issueReportStatus().locator('a')).toHaveAttribute(
      'href',
      'https://github.com/example/repo/issues/321',
    )
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
        }),
      })
    })

    await tracker.openGlobalReportDialog()
    const panel = tracker.issueReportDialog
    await expect(panel.getByLabel('Resultado esperado')).toHaveCount(0)
    await expect(panel.getByLabel('Resultado actual')).toHaveCount(0)
    await expect(panel.locator('#issue-report-notice')).toContainText('repositorio público')
    await expect(panel.locator('#issue-report-notice')).toContainText('email')
    await panel.getByLabel('Resumen').fill('El filtro no guarda el valor')

    await panel.getByRole('button', { name: 'Crear reporte' }).click()

    await expect(tracker.issueReportStatus()).toContainText('Reporte creado:')
    expect(submittedPayload).toMatchObject({
      type: 'bug',
      summary: 'El filtro no guarda el valor',
    })
    expect(submittedPayload).not.toHaveProperty('description')
    for (const retired of ['expectedResult', 'actualResult', 'stepsToReproduce']) {
      expect(submittedPayload).not.toHaveProperty(retired)
    }
  })

  test('muestra validación específica cuando el resumen no cumple mínimo', async ({ tracker }) => {
    await tracker.openGlobalReportDialog()
    const panel = tracker.issueReportDialog
    await panel.getByLabel('Resumen').fill('abc')
    await panel.getByRole('button', { name: 'Crear reporte' }).click()
    await expect(tracker.issueReportStatus()).toContainText(
      'el resumen debe tener al menos 5 caracteres',
    )
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
  })

  test('explica el fallo de conexión cuando el navegador no obtiene respuesta', async ({
    page,
    tracker,
  }) => {
    await page.route('**/api/issues/report', async (route) => {
      await route.abort('failed')
    })

    await tracker.submitIssueReport({
      type: 'bug',
      summary: 'Sin respuesta del servidor',
      description: 'El navegador no obtiene respuesta del endpoint de reportes.',
    })

    const status = tracker.issueReportStatus()
    await expect(status).toContainText('No se pudo crear la issue: No hay conexión con el servidor')
    await expect(status).not.toContainText('Failed to fetch')
  })

  test('no muestra el error del parser cuando la respuesta no es JSON', async ({
    page,
    tracker,
  }) => {
    await page.route('**/api/issues/report', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><html><body>Acceso</body></html>',
      })
    })

    await tracker.submitIssueReport({
      type: 'bug',
      summary: 'Respuesta que no es JSON',
      description: 'El borde devuelve HTML donde el cliente espera JSON.',
    })

    const status = tracker.issueReportStatus()
    await expect(status).toContainText(
      'No se pudo crear la issue: El servidor devolvió una respuesta que no se pudo interpretar.',
    )
    await expect(status).not.toContainText('Unexpected token')
  })

  test('pide volver a entrar cuando la sesión del borde venció', async ({ page, tracker }) => {
    await page.route('**/api/issues/report', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Inicia sesión para continuar.',
        }),
      })
    })

    await tracker.submitIssueReport({
      type: 'feature',
      summary: 'Sesión del borde vencida',
      description: 'El borde responde 401 al intentar crear la issue.',
    })

    const status = tracker.issueReportStatus()
    await expect(status).toContainText(
      'No se pudo crear la issue: Tu sesión venció. Vuelve a entrar o recarga la página.',
    )
    await expect(status).not.toContainText('Inicia sesión para continuar.')
  })

  test('los paneles laterales se anclan al borde derecho', async ({ page, tracker }) => {
    // The movement form is a side panel now, anchored to the right edge.
    await tracker.openTransactions()
    await tracker.transactionsSection.getByRole('button', { name: 'Nuevo movimiento' }).click()
    const panel = page.getByRole('dialog', { name: 'Nuevo movimiento' })
    await expect(panel).toBeVisible()
    // Polled: the panel slides in from the right.
    await expect
      .poll(() => panel.evaluate((element) => Math.round(element.getBoundingClientRect().right)))
      .toBe(page.viewportSize()!.width)
    // Close it before navigating: an open dialog's backdrop swallows the
    // click on the nav tab.
    await panel.getByRole('button', { name: 'Cerrar' }).click()

    // The balance calculator is a side panel too.
    await tracker.openWealth()
    await tracker.wealthSection
      .getByRole('button', { name: /^Calcular el saldo de / })
      .first()
      .click()
    const calc = tracker.wealthCalcPanel()
    await expect(calc).toBeVisible()
    await expect
      .poll(() => calc.evaluate((element) => Math.round(element.getBoundingClientRect().right)))
      .toBe(page.viewportSize()!.width)
    await calc.getByRole('button', { name: 'Cerrar', exact: true }).click()
    await expect(calc).toBeHidden()
  })

  test('adjunta hasta tres capturas, las previsualiza, quita una y envía solo las vigentes', async ({
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
    await expect(list.getByRole('img')).toHaveCount(3)
    await expect(list.getByRole('img', { name: 'Vista previa de dos.png' })).toBeVisible()

    await panel.getByRole('button', { name: 'Quitar dos.png' }).click()
    await expect(list.getByRole('img')).toHaveCount(2)

    await panel.getByRole('button', { name: 'Crear reporte' }).click()

    await expect(tracker.issueReportStatus()).toContainText('Reporte creado:')
    const attachments = submittedPayload?.attachments as Array<Record<string, string>>
    expect(attachments.map((item) => item.name)).toEqual(['uno.png', 'tres.png'])
    expect(attachments[0]).toMatchObject({ contentType: 'image/png' })
    expect(Buffer.from(attachments[0].data, 'base64').subarray(0, 8)).toEqual(
      PNG_1X1.subarray(0, 8),
    )
  })

  test('rechaza en la UI un cuarto adjunto, un fichero grande y un formato no admitido', async ({
    tracker,
  }) => {
    await tracker.openGlobalReportDialog()
    const panel = tracker.issueReportDialog
    const input = panel.locator('#issue-report-attachments')

    await input.setInputFiles([imageFile('a.png'), imageFile('b.png'), imageFile('c.png')])
    await input.setInputFiles(imageFile('d.png'))
    await expect(tracker.issueReportStatus()).toContainText('hasta 3')
    await expect(panel.locator('#issue-report-attachment-list').getByRole('img')).toHaveCount(3)

    await panel.getByRole('button', { name: 'Quitar a.png' }).click()
    await input.setInputFiles(imageFile('grande.png', 2 * 1024 * 1024 + 1))
    await expect(tracker.issueReportStatus()).toContainText('supera el límite de 2 MB')

    await input.setInputFiles({
      name: 'vector.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg/>'),
    })
    await expect(tracker.issueReportStatus()).toContainText('PNG, JPEG, WebP o GIF')
  })
})
