import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

async function expectModalAnchoredToLauncher(
  page: Page,
  selector: string,
  inset = 22,
  tolerance = 4,
) {
  const dialog = page.locator(selector);
  await expect(dialog).toBeVisible();
  await dialog.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });

  const viewport = page.viewportSize();
  const box = await dialog.boundingBox();
  if (!viewport || !box) {
    throw new Error(`No se pudo medir el panel ${selector}.`);
  }

  expect(
    Math.abs(viewport.width - (box.x + box.width) - inset),
  ).toBeLessThanOrEqual(tolerance);
  expect(
    Math.abs(viewport.height - (box.y + box.height) - inset),
  ).toBeLessThanOrEqual(tolerance);
}

test.describe("Reports E2E", () => {
  test("expande el formulario desde el acceso global anclado", async ({
    page,
    tracker,
  }) => {
    const trigger = page.locator("#global-report-trigger");
    await expect(trigger).toBeVisible();
    const triggerBox = await trigger.boundingBox();
    const iconBox = await trigger.locator("svg").boundingBox();
    if (!triggerBox || !iconBox) {
      throw new Error("No se pudo medir el acceso global de reportes.");
    }
    expect(
      Math.abs(
        triggerBox.x + triggerBox.width / 2 - (iconBox.x + iconBox.width / 2),
      ),
    ).toBeLessThanOrEqual(1);

    const compactWidth = triggerBox.width;
    await trigger.hover();
    await expect
      .poll(async () => (await trigger.boundingBox())?.width ?? 0)
      .toBeGreaterThan(compactWidth);

    await tracker.openGlobalReportDialog();
    await expect(tracker.issueReportDialog).toHaveAttribute("open", "");
    await expectModalAnchoredToLauncher(page, "#global-report-dialog");
    await expect(tracker.issueReportDialog).not.toHaveClass(/is-closing/);
    await expect(tracker.issueReportDialog).toHaveCSS(
      "animation-name",
      "report-dialog-in",
    );
    await expect(tracker.issueReportDialog.getByLabel("Resumen")).toBeFocused();
    await expect(
      tracker.issueReportDialog.locator("#issue-report-steps"),
    ).toHaveCount(0);
    await expect(
      tracker.issueReportDialog.locator("#issue-report-mention-claude"),
    ).toHaveCount(0);

    await page.keyboard.press("Escape");
    await expect(tracker.issueReportDialog).toHaveClass(/is-closing/);
    await expect(tracker.issueReportDialog).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await page.locator("#global-report-dialog-close").click();
    await expect(tracker.issueReportDialog).toHaveClass(/is-closing/);
    await expect(tracker.issueReportDialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("crea un reporte desde cualquier sección sin automatización", async ({
    page,
    tracker,
  }) => {
    await page.route("**/api/issues/report", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          issueNumber: 654,
          issueUrl: "https://github.com/example/repo/issues/654",
        }),
      });
    });

    await tracker.openBudget();
    await tracker.submitIssueReport({
      type: "feature",
      summary: "Mejorar feedback visual",
      description: "Quiero ver un estado más claro al crear reportes.",
    });

    await expect(tracker.issueReportStatus()).toContainText("Reporte creado:");
    await expect(tracker.issueReportStatus()).toContainText("#654");
    await expect(tracker.issueReportStatus()).not.toContainText(
      "automatización",
    );
  });

  test("envía únicamente los campos simplificados del formulario", async ({
    page,
    tracker,
  }) => {
    let submittedPayload: Record<string, unknown> | undefined;
    await page.route("**/api/issues/report", async (route) => {
      submittedPayload = route.request().postDataJSON() as Record<
        string,
        unknown
      >;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          issueNumber: 321,
          issueUrl: "https://github.com/example/repo/issues/321",
        }),
      });
    });

    await tracker.submitIssueReport({
      type: "bug",
      summary: "Fallo al exportar datos",
      description: "Después de guardar no persiste el estado.",
      expectedResult: "El cambio debe persistir.",
      actualResult: "El cambio desaparece al recargar.",
    });

    await expect(tracker.issueReportStatus()).toContainText("Reporte creado:");
    expect(submittedPayload).toMatchObject({
      type: "bug",
      summary: "Fallo al exportar datos",
      expectedResult: "El cambio debe persistir.",
      actualResult: "El cambio desaparece al recargar.",
    });
    expect(submittedPayload).not.toHaveProperty("mentionClaude");
    expect(submittedPayload).not.toHaveProperty("stepsToReproduce");
    await expect(tracker.issueReportStatus().locator("a")).toHaveAttribute(
      "href",
      "https://github.com/example/repo/issues/321",
    );
  });

  test("muestra validación específica cuando resumen o descripción no cumplen mínimo", async ({
    tracker,
  }) => {
    await tracker.openGlobalReportDialog();
    const form = tracker.issueReportDialog.locator("#issue-report-form");
    await form.locator("#issue-report-summary").fill("abc");
    await form.locator("#issue-report-description").fill("corta");
    await form.getByRole("button", { name: "Crear reporte" }).click();
    await expect(tracker.issueReportStatus()).toContainText(
      "el resumen debe tener al menos 5 caracteres",
    );
  });

  test("muestra error cuando falla la API de reporte", async ({
    page,
    tracker,
  }) => {
    await page.route("**/api/issues/report", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: "GitHub no disponible" }),
      });
    });

    await tracker.submitIssueReport({
      type: "bug",
      summary: "Error en endpoint",
      description: "Prueba de manejo de error al crear issue.",
    });

    await expect(tracker.issueReportStatus()).toContainText(
      "No se pudo crear la issue: GitHub no disponible",
    );
  });

  test("explica el fallo de conexión cuando el navegador no obtiene respuesta", async ({
    page,
    tracker,
  }) => {
    await page.route("**/api/issues/report", async (route) => {
      await route.abort("failed");
    });

    await tracker.submitIssueReport({
      type: "bug",
      summary: "Sin respuesta del servidor",
      description: "El navegador no obtiene respuesta del endpoint de reportes.",
    });

    const status = tracker.issueReportStatus();
    await expect(status).toContainText(
      "No se pudo crear la issue: No hay conexión con el servidor",
    );
    await expect(status).not.toContainText("Failed to fetch");
  });

  test("no muestra el error del parser cuando la respuesta no es JSON", async ({
    page,
    tracker,
  }) => {
    await page.route("**/api/issues/report", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><html><body>Acceso</body></html>",
      });
    });

    await tracker.submitIssueReport({
      type: "bug",
      summary: "Respuesta que no es JSON",
      description: "El borde devuelve HTML donde el cliente espera JSON.",
    });

    const status = tracker.issueReportStatus();
    await expect(status).toContainText(
      "No se pudo crear la issue: El servidor devolvió una respuesta que no se pudo interpretar.",
    );
    await expect(status).not.toContainText("Unexpected token");
  });

  test("pide volver a entrar cuando la sesión del borde venció", async ({
    page,
    tracker,
  }) => {
    await page.route("**/api/issues/report", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Token de Cf-Access inválido o caducado.",
        }),
      });
    });

    await tracker.submitIssueReport({
      type: "feature",
      summary: "Sesión del borde vencida",
      description: "El borde responde 401 al intentar crear la issue.",
    });

    const status = tracker.issueReportStatus();
    await expect(status).toContainText(
      "No se pudo crear la issue: Tu sesión venció. Vuelve a entrar o recarga la página.",
    );
    await expect(status).not.toContainText("Token de Cf-Access");
  });

  test("los paneles laterales se anclan al borde derecho", async ({
    page,
    tracker,
  }) => {
    // The movement form is a side panel now, anchored to the right edge.
    await tracker.openTransactions();
    await tracker.transactionsSection
      .getByRole("button", { name: "Nuevo movimiento" })
      .click();
    const panel = page.getByRole("dialog", { name: "Nuevo movimiento" });
    await expect(panel).toBeVisible();
    // Polled: the panel slides in from the right.
    await expect
      .poll(() => panel.evaluate((element) => Math.round(element.getBoundingClientRect().right)))
      .toBe(page.viewportSize()!.width);
    // Close it before navigating: an open dialog's backdrop swallows the
    // click on the nav tab.
    await panel.getByRole("button", { name: "Cerrar" }).click();

    // The balance calculator is a side panel too.
    await tracker.openWealth();
    await tracker.wealthSection
      .getByRole("button", { name: /^Calcular el saldo de / })
      .first()
      .click();
    const calc = tracker.wealthCalcPanel();
    await expect(calc).toBeVisible();
    await expect
      .poll(() => calc.evaluate((element) => Math.round(element.getBoundingClientRect().right)))
      .toBe(page.viewportSize()!.width);
    await calc.getByRole("button", { name: "Cerrar", exact: true }).click();
    await expect(calc).toBeHidden();
  });
});
