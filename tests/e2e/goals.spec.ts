import { test, expect } from "./fixtures";

test.describe("Goals E2E", () => {
  test("renderiza objetivos dentro del workspace Vue", { tag: "@smoke" }, async ({ page, tracker }) => {
    await tracker.openGoals();

    const goalsSection = tracker.section("goals");

    await expect(page.locator("[data-finance-workspace] #goals")).toBeVisible();
    await expect(
      goalsSection.getByRole("heading", { name: "Objetivos" }),
    ).toBeVisible();
    await expect(
      goalsSection.locator('[data-goal-card="short"]'),
    ).toBeVisible();
    await expect(goalsSection.locator(".goal-progress-item")).toHaveCount(6);
  });

  test("permite editar un objetivo, persistirlo y reflejarlo en dashboard", async ({
    tracker,
  }) => {
    await tracker.openGoals();

    const goalsSection = tracker.section("goals");
    const shortGoal = goalsSection.locator('[data-goal-card="short"]');
    await shortGoal.getByLabel("Nombre").fill("Colchón de seguridad");
    await shortGoal.getByLabel("Año objetivo").fill("2026");
    await shortGoal.getByLabel("Monto objetivo").fill("34567.89");

    await expect(shortGoal.getByLabel("Nombre")).toHaveValue(
      "Colchón de seguridad",
    );
    await expect(shortGoal.getByLabel("Año objetivo")).toHaveValue("2026");
    await expect(shortGoal.getByLabel("Monto objetivo")).toHaveValue(
      "34567.89",
    );
    await expect(
      goalsSection.locator(".goal-progress-item", {
        hasText: "Colchón de seguridad",
      }),
    ).toBeVisible();

    await tracker.openDashboard();
    await expect(tracker.dashboardSection.locator("#savings-goal")).toContainText(
      "Colchón de seguridad",
    );
    await expect(tracker.dashboardSection.locator("#savings-goal")).toContainText(
      "2026",
    );

    await tracker.reload();
    await tracker.openGoals();

    const persistedShortGoal = tracker
      .section("goals")
      .locator('[data-goal-card="short"]');
    await expect(persistedShortGoal.getByLabel("Nombre")).toHaveValue(
      "Colchón de seguridad",
    );
    await expect(persistedShortGoal.getByLabel("Año objetivo")).toHaveValue(
      "2026",
    );
    await expect(persistedShortGoal.getByLabel("Monto objetivo")).toHaveValue(
      "34567.89",
    );
  });
});
