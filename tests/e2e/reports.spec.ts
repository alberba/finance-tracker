import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

async function expectModalCentered(
  page: Page,
  selector: string,
  tolerance = 24,
) {
  const dialog = page.locator(selector);
  await expect(dialog).toBeVisible();

  const viewport = page.viewportSize();
  const box = await dialog.boundingBox();
  if (!viewport || !box) {
    throw new Error(`No se pudo medir el modal ${selector}.`);
  }

  const dialogCenterX = box.x + box.width / 2;
  const dialogCenterY = box.y + box.height / 2;
  const viewportCenterX = viewport.width / 2;
  const viewportCenterY = viewport.height / 2;

  expect(Math.abs(dialogCenterX - viewportCenterX)).toBeLessThanOrEqual(
    tolerance,
  );
  expect(Math.abs(dialogCenterY - viewportCenterY)).toBeLessThanOrEqual(
    tolerance,
  );
}

test.describe("Reports E2E", () => {
  test("reportes muestra el flujo simple como camino principal", async ({
    tracker,
  }) => {
    await tracker.openReports();

    await expect(
      tracker.reportsSection.getByRole("heading", { name: "Reportes" }),
    ).toBeVisible();
    await expect(
      tracker.reportsSection.locator(".reports-form-card h3"),
    ).toHaveText("Crear reporte");
    await expect(
      tracker.reportsSection.locator(".reports-guide-card h3"),
    ).toHaveText("Qué ocurre al enviarlo");
    await expect(
      tracker.reportsSection.locator(".reports-guide-list li"),
    ).toHaveCount(3);
    await expect(
      tracker.reportsSection.locator("#issue-report-mention-claude"),
    ).not.toBeChecked();
  });

  test("crea un reporte simple sin automatización", async ({
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

    await tracker.submitIssueReport({
      type: "enhancement",
      summary: "Mejorar feedback visual",
      description: "Quiero ver un estado más claro al crear reportes.",
    });

    await expect(tracker.issueReportStatus()).toContainText("Reporte creado:");
    await expect(tracker.issueReportStatus()).toContainText("#654");
    await expect(tracker.issueReportStatus()).not.toContainText(
      "automatización en curso",
    );
  });

  test("permite activar automatización manualmente", async ({
    page,
    tracker,
  }) => {
    await page.route("**/api/issues/report", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          issueNumber: 321,
          issueUrl: "https://github.com/example/repo/issues/321",
          enrichmentStatus: "pending",
        }),
      });
    });

    await tracker.submitIssueReport({
      type: "bug",
      summary: "Fallo al exportar datos",
      description: "Después de guardar no persiste el estado.",
      stepsToReproduce: "1. Ir a datos\n2. Guardar\n3. Recargar",
      mentionClaude: true,
    });

    await expect(tracker.issueReportStatus()).toContainText("Reporte creado:");
    await expect(tracker.issueReportStatus()).toContainText(
      "automatización en curso",
    );
    await expect(tracker.issueReportStatus().locator("a")).toHaveAttribute(
      "href",
      "https://github.com/example/repo/issues/321",
    );
  });

  test("muestra validación específica cuando resumen o descripción no cumplen mínimo", async ({
    tracker,
  }) => {
    await tracker.openReports();
    const form = tracker.reportsSection.locator("#issue-report-form");
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

  test("los modales principales se abren centrados en pantalla", async ({
    page,
    tracker,
  }) => {
    await tracker.openTransactions();
    await tracker.transactionsSection
      .getByRole("button", { name: "Nuevo" })
      .click();
    await expectModalCentered(page, "#tx-dialog");

    await tracker.openWealth();
    await tracker.wealthSection
      .getByRole("button", { name: /^Calcular$/ })
      .first()
      .click();
    await expectModalCentered(page, "#wealth-calc-dialog");
    await page.locator("#wealth-calc-close").click();

    await tracker.openContributionWorkflowModal();
    await expectModalCentered(page, "#contribution-workflow-dialog");

    const workflowModal = page.locator("#contribution-workflow-dialog");
    const investmentSnapshotButton = workflowModal
      .getByRole("button", { name: /^Calcular snapshot de / })
      .first();
    await investmentSnapshotButton.click();
    await expectModalCentered(page, "#contribution-calc-dialog");
  });
});
