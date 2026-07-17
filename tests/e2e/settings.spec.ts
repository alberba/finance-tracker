import { test, expect, mirrorStateToServer } from "./fixtures";

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

  test("permite editar y conservar la lista y el símbolo de Stock Events", async ({
    tracker,
    page,
  }) => {
    let releaseFirstWatchlistLoad: (() => void) | undefined;
    let markFirstWatchlistLoadRequested: (() => void) | undefined;
    const firstWatchlistLoadRequested = new Promise<void>((resolve) => {
      markFirstWatchlistLoadRequested = resolve;
    });
    let watchlistRequestCount = 0;
    await page.route("**/api/stockevents/watchlists", async (route) => {
      watchlistRequestCount += 1;
      if (watchlistRequestCount === 1) {
        markFirstWatchlistLoadRequested?.();
        await new Promise<void>((resolve) => {
          releaseFirstWatchlistLoad = resolve;
        });
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          watchlists: [
            { id: "wl-acciones", name: "Acciones" },
            { id: "wl-etf", name: "ETF" },
          ],
        }),
      });
    });

    await page.evaluate(() => {
      const raw = localStorage.getItem("finance-tracker-state-v1");
      if (!raw) {
        throw new Error("No se encontró el estado financiero inicial");
      }
      const state = JSON.parse(raw);
      state.instruments.push({
        id: "instrument-aged",
        investmentAssetId: state.investmentAssets[0]?.id ?? "",
        type: "etf",
        symbol: "AGED",
        market: "MI",
        currency: "EUR",
        provider: "manual",
        active: true,
      });
      state.stockEvents = {
        enabled: true,
        apiKey: "test-stock-events-key",
        symbolMappings: [
          {
            symbol: "AGED",
            sync: true,
            watchlistId: "wl-acciones",
            targetSymbol: "AGED.MI",
            hidden: false,
          },
        ],
      };
      localStorage.setItem("finance-tracker-state-v1", JSON.stringify(state));
    });
    await mirrorStateToServer(page);
    await page.reload();
    await page.waitForFunction(() => {
      const raw = localStorage.getItem("finance-tracker-state-v1");
      return raw
        ? JSON.parse(raw).instruments.some(
            (item: { symbol?: string }) => item.symbol === "AGED",
          )
        : false;
    });
    await tracker.openSettings();

    const watchlist = page.getByRole("combobox", {
      name: "Lista de seguimiento de AGED",
    });
    const targetSymbol = page.getByRole("textbox", {
      name: "Símbolo en Stock Events de AGED",
    });

    await firstWatchlistLoadRequested;
    await targetSymbol.fill("aged.xetra");
    releaseFirstWatchlistLoad?.();

    await expect(watchlist).toBeEnabled();
    await watchlist.selectOption("wl-etf");

    await expect(watchlist).toHaveValue("wl-etf");
    await expect(targetSymbol).toHaveValue("AGED.XETRA");
    await expect(page.locator("#save-status")).toContainText("Sincronizado");

    await page.reload();
    await page.waitForFunction(() => {
      const raw = localStorage.getItem("finance-tracker-state-v1");
      return raw
        ? JSON.parse(raw).stockEvents?.symbolMappings?.some(
            (item: { symbol?: string; watchlistId?: string }) =>
              item.symbol === "AGED" && item.watchlistId === "wl-etf",
          )
        : false;
    });
    await tracker.openSettings();

    await expect(
      page.getByRole("combobox", { name: "Lista de seguimiento de AGED" }),
    ).toHaveValue("wl-etf");
    await expect(
      page.getByRole("textbox", { name: "Símbolo en Stock Events de AGED" }),
    ).toHaveValue("AGED.XETRA");

    await page.getByRole("button", { name: "Ocultar AGED" }).click();
    await expect(page.getByText("No hay símbolos visibles.")).toBeVisible();
    await page.getByRole("button", { name: "Mostrar ocultos (1)" }).click();
    await expect(
      page
        .getByRole("table", { name: "Símbolos ocultos de Stock Events" })
        .getByRole("row")
        .filter({ hasText: "AGED" }),
    ).toBeVisible();
    await expect(page.locator("#save-status")).toContainText("Sincronizado");

    await page.reload();
    await tracker.openSettings();
    await expect(page.getByRole("button", { name: "Mostrar ocultos (1)" })).toBeVisible();
    await page.getByRole("button", { name: "Mostrar ocultos (1)" }).click();
    await page.getByRole("button", { name: "Mostrar AGED" }).click();
    await expect(
      page
        .getByRole("table", { name: "Símbolos visibles de Stock Events" })
        .getByRole("row")
        .filter({ hasText: "AGED" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Mostrar ocultos/ })).toHaveCount(0);
  });
});
