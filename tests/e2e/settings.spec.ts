import { test, expect } from "./fixtures";

test.describe("Settings E2E", () => {
  test("renderiza configuración base dentro del workspace Vue", async ({
    page,
    tracker,
  }) => {
    await tracker.openSettings();

    const settingsSection = tracker.section("settings");

    await expect(
      page.locator("[data-finance-workspace] #settings"),
    ).toBeVisible();
    await expect(
      settingsSection.getByRole("heading", { name: "Configuración base" }),
    ).toBeVisible();
    await expect(
      settingsSection.locator("#settings-accounts .list-item").first(),
    ).toBeVisible();
  });

  test("permite agregar una cuenta y refleja el cambio en el formulario de movimientos", async ({
    tracker,
    page,
  }) => {
    await tracker.openSettings();

    const settingsSection = tracker.section("settings");
    const accountsForm = settingsSection.locator("#add-account-form");
    await accountsForm.locator('input[name="name"]').fill("Cuenta Vacaciones");
    await accountsForm.locator('input[name="openingBalance"]').fill("500");
    await accountsForm.getByRole("button", { name: "Agregar" }).click();

    // El nombre vive en un <input>, así que comprobamos por la acción de borrado.
    await expect(
      settingsSection.getByRole("button", {
        name: "Eliminar Cuenta Vacaciones",
      }),
    ).toBeVisible();

    // El alta se propaga al selector de cuentas del formulario de movimientos.
    await tracker.openTransactions();
    await tracker.transactionsSection
      .getByRole("button", { name: "Nuevo" })
      .click();
    await expect(
      page.locator("#tx-dialog select[name='accountId']"),
    ).toContainText("Cuenta Vacaciones");
  });

  test("permite agregar y eliminar una categoría de gasto", async ({
    tracker,
  }) => {
    await tracker.openSettings();

    const settingsSection = tracker.section("settings");
    const expenseForm = settingsSection.locator("#add-expense-category");
    await expenseForm.locator('input[name="name"]').fill("Suscripciones");
    await expenseForm.getByRole("button", { name: "Agregar" }).click();

    const tag = settingsSection.locator("#settings-expense-categories .tag", {
      hasText: "Suscripciones",
    });
    await expect(tag).toBeVisible();

    await tag.getByRole("button", { name: /Eliminar categoría/ }).click();
    await expect(tag).toHaveCount(0);
  });

  test("eliminar una cuenta elimina sus suscripciones pendientes", async ({
    tracker,
    page,
  }) => {
    const today = new Date().toISOString().slice(0, 10);
    await tracker.addSubscription({
      name: "Suscripción cuenta eliminada",
      amount: 12,
      categoryLabel: "Comida",
      frequency: "monthly",
      firstChargeDate: today,
    });

    await tracker.openSettings();
    const settingsSection = tracker.section("settings");
    await settingsSection
      .getByRole("button", { name: "Eliminar Revolut", exact: true })
      .click();
    await expect(
      settingsSection.getByRole("button", {
        name: "Eliminar Revolut",
        exact: true,
      }),
    ).toHaveCount(0);

    await tracker.openSubscriptionsTab();
    await expect(
      tracker.transactionsSection
        .locator("#transactions-tab-subscriptions")
        .getByRole("listitem")
        .filter({ hasText: "Suscripción cuenta eliminada" }),
    ).toHaveCount(0);
    await expect(page.getByRole("status")).toContainText("Elemento eliminado");
  });
});
