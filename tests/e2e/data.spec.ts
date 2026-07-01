import { test, expect } from "./fixtures";

test.describe("Data E2E", () => {
  test("renderiza datos y backups dentro del workspace Vue", async ({
    page,
    tracker,
  }) => {
    await tracker.openData();

    const dataSection = tracker.section("data");

    await expect(page.locator("[data-finance-workspace] #data")).toBeVisible();
    await expect(
      dataSection.getByRole("heading", { name: "Datos y backups" }),
    ).toBeVisible();

    await expect(dataSection.locator("#data-total-transactions")).not.toHaveText(
      "0",
    );
    await expect(dataSection.locator("#data-meta")).toContainText("Origen:");
  });

  test("reinicia con datos semilla y refleja los totales actualizados", async ({
    page,
    tracker,
  }) => {
    await tracker.openData();

    const dataSection = tracker.section("data");
    const totalTransactions = dataSection.locator("#data-total-transactions");
    await expect(totalTransactions).not.toHaveText("0");

    page.once("dialog", (dialog) => dialog.accept());
    await dataSection.getByRole("button", {
      name: "Reiniciar con datos semilla",
    }).click();

    // Tras el reset la sección sigue mostrando los totales del seed.
    await expect(totalTransactions).not.toHaveText("0");
    await expect(dataSection.locator("#data-meta")).toContainText("Origen:");
  });
});
