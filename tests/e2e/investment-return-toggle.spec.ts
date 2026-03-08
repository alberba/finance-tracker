import { test, expect } from "./fixtures";

test.describe("toggle de modo de rentabilidad (Simple / TWR)", () => {
  test("el toggle existe con los dos botones en la sección de inversión", async ({ tracker }) => {
    await tracker.openInvestment();
    const section = tracker.investmentSection();

    const simpleBtn = section.getByRole("button", { name: "Simple" });
    const twrBtn = section.getByRole("button", { name: "TWR" });

    await expect(simpleBtn).toBeVisible();
    await expect(twrBtn).toBeVisible();
  });

  test("el modo Simple está activo por defecto", async ({ tracker }) => {
    await tracker.openInvestment();
    const section = tracker.investmentSection();

    const simpleBtn = section.getByRole("button", { name: "Simple" });
    const twrBtn = section.getByRole("button", { name: "TWR" });

    await expect(simpleBtn).toHaveClass(/is-active/);
    await expect(twrBtn).not.toHaveClass(/is-active/);
    await expect(simpleBtn).toHaveAttribute("aria-pressed", "true");
    await expect(twrBtn).toHaveAttribute("aria-pressed", "false");
  });

  test("al activar TWR cambia el botón activo y la etiqueta del KPI", async ({ tracker }) => {
    await tracker.openInvestment();
    const section = tracker.investmentSection();

    const twrBtn = section.getByRole("button", { name: "TWR" });
    await twrBtn.click();

    // El botón TWR queda activo
    await expect(twrBtn).toHaveClass(/is-active/);
    await expect(twrBtn).toHaveAttribute("aria-pressed", "true");

    // El botón Simple deja de estar activo
    const simpleBtn = section.getByRole("button", { name: "Simple" });
    await expect(simpleBtn).not.toHaveClass(/is-active/);
    await expect(simpleBtn).toHaveAttribute("aria-pressed", "false");

    // La etiqueta del KPI cambia a "Rentabilidad TWR"
    await expect(section.locator("#inv-return-label")).toHaveText("Rentabilidad TWR");
  });

  test("al volver al modo Simple la etiqueta del KPI restaura el texto original", async ({ tracker }) => {
    await tracker.openInvestment();
    const section = tracker.investmentSection();

    // Activar TWR
    await section.getByRole("button", { name: "TWR" }).click();
    await expect(section.locator("#inv-return-label")).toHaveText("Rentabilidad TWR");

    // Volver a Simple
    await section.getByRole("button", { name: "Simple" }).click();
    await expect(section.locator("#inv-return-label")).toHaveText("Rentabilidad estimada");
    await expect(section.locator("#inv-return-label").locator("..").locator("#inv-return")).toBeVisible();
  });

  test("el toggle permanece visible al cambiar entre subtabs de inversión", async ({ tracker }) => {
    await tracker.openInvestment();
    const section = tracker.investmentSection();

    const twrBtn = section.getByRole("button", { name: "TWR" });

    // Activar TWR
    await twrBtn.click();
    await expect(twrBtn).toHaveClass(/is-active/);

    // Cambiar a pestaña Movimientos
    await tracker.openInvestmentMovementsTab();
    await expect(twrBtn).toBeVisible();
    await expect(twrBtn).toHaveClass(/is-active/);

    // Volver a Dashboard y el toggle sigue activo
    await tracker.openInvestmentDashboardTab();
    await expect(twrBtn).toHaveClass(/is-active/);
    await expect(section.locator("#inv-return-label")).toHaveText("Rentabilidad TWR");
  });
});
