import { test, expect } from './fixtures'
import type { AvailableReportEntry } from '../../src/domain/reports/report-entry'

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
          tracked: true,
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
    await expect(status).toContainText('No pudimos añadirlo a Mis reportes todavía')
    await expect(status).not.toContainText('Reporte creado:')
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
          tracked: true,
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
    await expect(tracker.issueReportStatus().getByRole('link', { name: '#321' })).toHaveAttribute(
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
          tracked: true,
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

type ReportEntryShape = AvailableReportEntry

const ISSUE_URL = 'https://github.com/example/finance-tracker/issues'

function reportEntry(overrides: Partial<ReportEntryShape> = {}): ReportEntryShape {
  return {
    number: 901,
    url: `${ISSUE_URL}/901`,
    title: 'El gráfico de gastos no respeta el filtro de mes',
    state: 'OPEN',
    stateReason: null,
    submittedAt: '2026-10-18T08:32:00.000Z',
    lastSeenAt: '2026-10-24T11:00:00.000Z',
    hasUpdates: false,
    statusChangedAt: null,
    ...overrides,
  }
}

function reportDetail(overrides: Record<string, unknown> = {}) {
  const report = reportEntry()
  return {
    report,
    threadIssue: {
      number: 901,
      url: report.url,
      title: report.title,
      state: 'OPEN',
      stateReason: null,
    },
    thread: [],
    hiddenBefore: 0,
    canComment: true,
    fetchedAt: '2026-10-24T12:00:00.000Z',
    ...overrides,
  }
}

function threadItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 700,
    kind: 'maintainer',
    author: 'ana-mantenimiento',
    createdAt: '2026-10-20T09:00:00.000Z',
    editedAt: null,
    text: 'Lo reproducimos y lo revisamos esta semana.',
    attachments: [],
    editable: false,
    ...overrides,
  }
}

async function mockReportsApi(
  page: import('@playwright/test').Page,
  options: {
    list?: () => ReportEntryShape[]
    detail?: () => Record<string, unknown>
    commentStatus?: number
  } = {},
) {
  await page.route('**/api/reports**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()

    if (url.pathname === '/api/reports') {
      return route.fulfill({
        status: 200,
        json: {
          ok: true,
          reports: options.list ? options.list() : [reportEntry()],
          hasMore: false,
          fetchedAt: '2026-10-24T12:00:00.000Z',
        },
      })
    }

    if (url.pathname.endsWith('/seen')) return route.fulfill({ status: 204, body: '' })

    if (url.pathname.endsWith('/comments')) {
      if (options.commentStatus && options.commentStatus >= 400) {
        return route.fulfill({
          status: options.commentStatus,
          json: { ok: false, error: 'GitHub no disponible' },
        })
      }
      const posted = request.postDataJSON() as { text: string }
      return route.fulfill({
        status: 201,
        json: {
          ok: true,
          comment: threadItem({
            id: 555,
            kind: 'reporter',
            author: 'Tú',
            text: posted.text,
            editable: true,
          }),
        },
      })
    }

    const commentMatch = /\/comments\/(\d+)$/.exec(url.pathname)
    if (commentMatch && method === 'PATCH') {
      const posted = request.postDataJSON() as { text: string }
      return route.fulfill({
        status: 200,
        json: {
          ok: true,
          comment: threadItem({
            id: Number(commentMatch[1]),
            kind: 'reporter',
            author: 'Tú',
            text: posted.text,
            editable: true,
          }),
        },
      })
    }
    if (commentMatch && method === 'DELETE') {
      return route.fulfill({ status: 204, body: '' })
    }

    return route.fulfill({
      status: 200,
      json: { ok: true, detail: options.detail ? options.detail() : reportDetail() },
    })
  })
}

test.describe('Mis reportes E2E', () => {
  test('el acuse abre el reporte y el detalle sobrevive a la recarga', async ({
    page,
    tracker,
  }) => {
    await page.route('**/api/issues/report', (route) =>
      route.fulfill({
        status: 201,
        json: {
          ok: true,
          issueNumber: 901,
          issueUrl: `${ISSUE_URL}/901`,
          tracked: true,
        },
      }),
    )
    await mockReportsApi(page)

    await tracker.openGlobalReportDialog()
    await tracker.issueReportDialog.getByLabel('Resumen').fill('El gráfico no respeta el filtro')
    await tracker.issueReportDialog.getByRole('button', { name: 'Crear reporte' }).click()
    const status = tracker.issueReportStatus()
    await expect(status).toContainText('Reporte creado:')
    await status.getByRole('link', { name: 'Ver en Mis reportes' }).click()

    await expect(page).toHaveURL(/\/reportes\?reporte=901/)
    await expect(
      tracker.reportsPage.getByRole('heading', { name: reportEntry().title }),
    ).toBeVisible()
    await tracker.reload()
    await expect(
      tracker.reportsPage.getByRole('heading', { name: reportEntry().title }),
    ).toBeVisible()
  })

  test('el cierre asíncrono como duplicada aparece en la siguiente carga', async ({
    page,
    tracker,
  }) => {
    let loads = 0
    await mockReportsApi(page, {
      list: () => {
        loads += 1
        return loads === 1
          ? [reportEntry()]
          : [
              reportEntry({
                state: 'CLOSED',
                stateReason: 'DUPLICATE',
                statusChangedAt: '2026-10-25T09:00:00.000Z',
                followed: {
                  number: 887,
                  url: `${ISSUE_URL}/887`,
                  title: 'Exportar movimientos a PDF y CSV',
                  state: 'OPEN',
                  stateReason: null,
                },
              }),
            ]
      },
    })

    await tracker.openReports()
    await expect(tracker.reportsPage.getByText('Abierto').first()).toBeVisible()
    await tracker.reload()
    await expect(tracker.reportsPage.getByText('Se sigue en #887').first()).toBeVisible()
    await expect(tracker.reportsPage.getByText('#901 · Cerrado como duplicado')).toBeVisible()
  })

  test('avisa de novedades en el botón y en la entrada y las apaga al abrir', async ({
    page,
    tracker,
  }) => {
    await mockReportsApi(page, {
      list: () => [reportEntry({ hasUpdates: true })],
    })

    await tracker.openReports()
    const dot = page.locator('#global-report-trigger [data-reports-updates]')
    await expect(dot).toBeVisible()
    await expect(page.locator('[data-report-entry="901"]').getByText('Nuevo')).toBeVisible()

    await page.locator('[data-report-entry="901"]').click()
    await expect(tracker.reportsPage.getByRole('heading', { name: reportEntry().title })).toBeVisible()
    await expect(dot).toHaveCount(0)
  })

  test('la hoja «Más» enlaza a Mis reportes y muestra el contador de novedades', async ({
    page,
    tracker,
  }) => {
    await mockReportsApi(page, { list: () => [reportEntry({ hasUpdates: true })] })
    await page.setViewportSize({ width: 390, height: 844 })
    await tracker.openReports()

    await page.getByRole('button', { name: 'Más secciones' }).click()
    const sheet = page.getByRole('dialog', { name: 'Más secciones' })
    const row = sheet.getByRole('button', { name: /Mis reportes/ })
    await expect(row).toBeVisible()
    await expect(sheet.locator('[data-reports-badge]')).toHaveText('1')

    await row.click()
    await expect(page).toHaveURL(/\/reportes$/)
    await expect(sheet).toBeHidden()
  })

  test('añade, edita y borra una aclaración propia', async ({ page, tracker }) => {
    await mockReportsApi(page, {
      detail: () =>
        reportDetail({
          thread: [threadItem()],
        }),
    })

    await tracker.openReports(901)
    const detail = tracker.reportsPage
    await expect(detail.locator('[data-thread-item="700"]')).toContainText('Lo reproducimos')

    await detail.getByRole('textbox', { name: 'Nueva aclaración' }).fill('Ocurre solo en móvil.')
    await detail.getByRole('button', { name: 'Publicar aclaración' }).click()
    const own = detail.locator('[data-thread-item="555"]')
    await expect(own).toContainText('Ocurre solo en móvil.')
    await expect(own).toContainText('Tú')

    await own.getByRole('button', { name: 'Editar' }).click()
    await detail
      .getByRole('textbox', { name: 'Editar aclaración' })
      .fill('Ocurre solo en móvil, con el mes anterior.')
    await detail.getByRole('button', { name: 'Guardar' }).click()
    await expect(own).toContainText('con el mes anterior')

    await own.getByRole('button', { name: 'Borrar' }).click()
    const dialog = page.getByRole('alertdialog', { name: '¿Borrar esta aclaración?' })
    await dialog.getByRole('button', { name: 'Borrar' }).click()
    await expect(detail.locator('[data-thread-item="555"]')).toHaveCount(0)
  })

  test('un hilo cerrado queda en solo lectura', async ({ page, tracker }) => {
    await mockReportsApi(page, {
      detail: () =>
        reportDetail({
          report: reportEntry({ state: 'CLOSED', stateReason: 'COMPLETED' }),
          threadIssue: {
            number: 901,
            url: `${ISSUE_URL}/901`,
            title: reportEntry().title,
            state: 'CLOSED',
            stateReason: 'COMPLETED',
          },
          canComment: false,
        }),
    })

    await tracker.openReports(901)
    await expect(
      tracker.reportsPage.getByText('Este reporte está cerrado: el hilo es de solo lectura.'),
    ).toBeVisible()
    await expect(
      tracker.reportsPage.getByRole('textbox', { name: 'Nueva aclaración' }),
    ).toHaveCount(0)
  })

  test('un fallo de GitHub muestra el error y conserva el texto', async ({ page, tracker }) => {
    await mockReportsApi(page, { commentStatus: 502 })

    await tracker.openReports(901)
    const composer = tracker.reportsPage.getByRole('textbox', { name: 'Nueva aclaración' })
    await composer.fill('Texto que no debe perderse')
    await tracker.reportsPage.getByRole('button', { name: 'Publicar aclaración' }).click()

    await expect(tracker.reportsPage.getByRole('alert').first()).toContainText(
      'GitHub no disponible',
    )
    await expect(composer).toHaveValue('Texto que no debe perderse')
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
    expect(apiCalls).toEqual([])
  })

  test('un usuario sin filas ve la lista vacía desde la API real', async ({ tracker }) => {
    await tracker.openReports()
    await expect(tracker.reportsPage.getByText('Aún no has enviado ningún reporte.')).toBeVisible()
  })
})
