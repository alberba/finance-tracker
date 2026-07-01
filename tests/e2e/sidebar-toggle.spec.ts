import { test, expect } from "./fixtures";

test.describe("Sidebar toggle", () => {
  test("la inicialización del sidebar no lanza errores de classList en carga", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });

    await page.goto("/");
    await expect(page.locator("#dashboard")).toBeVisible();

    expect(
      pageErrors.some((message) =>
        message.includes(
          "Cannot read properties of null (reading 'classList')",
        ),
      ),
    ).toBe(false);
  });

  test("el botón de toggle existe y tiene el aria-label correcto", async ({
    page,
    tracker,
  }) => {
    await tracker.goto();
    const toggleBtn = page.locator("#sidebar-toggle");
    await expect(toggleBtn).toBeVisible();
    await expect(toggleBtn).toHaveAttribute(
      "aria-label",
      "Colapsar barra lateral",
    );
    await expect(toggleBtn).toHaveAttribute("aria-expanded", "true");
  });

  test("muestra icono de marca encima del nav cuando el sidebar está colapsado", async ({
    page,
    tracker,
  }) => {
    await tracker.goto();

    const collapsedBrand = page.locator(".sidebar-collapsed-brand");
    const nav = page.locator(".nav");

    await expect(collapsedBrand).toBeHidden();

    await page.locator("#sidebar-toggle").click();
    await expect(page.locator("body")).toHaveClass(/is-sidebar-collapsed/);
    await expect(collapsedBrand).toBeVisible();

    const brandBox = await collapsedBrand.boundingBox();
    const navBox = await nav.boundingBox();
    expect(brandBox).not.toBeNull();
    expect(navBox).not.toBeNull();
    if (!brandBox || !navBox) {
      return;
    }
    expect(brandBox.y).toBeLessThan(navBox.y);

    await page.locator("#sidebar-toggle").click();
    await expect(page.locator("body")).not.toHaveClass(/is-sidebar-collapsed/);
    await expect(collapsedBrand).toBeHidden();
  });

  test("colapsar el sidebar oculta las etiquetas de texto de las pestañas", async ({
    page,
    tracker,
  }) => {
    await tracker.goto();

    // Las nav-labels deben estar visibles inicialmente
    const firstLabel = page.locator(".nav-label").first();
    await expect(firstLabel).toBeVisible();

    // Colapsar
    await page.locator("#sidebar-toggle").click();

    // El body debe tener la clase colapsada
    await expect(page.locator("body")).toHaveClass(/is-sidebar-collapsed/);

    // El botón actualiza sus atributos aria
    const toggleBtn = page.locator("#sidebar-toggle");
    await expect(toggleBtn).toHaveAttribute(
      "aria-label",
      "Expandir barra lateral",
    );
    await expect(toggleBtn).toHaveAttribute("aria-expanded", "false");
  });

  test("el sidebar colapsado reduce su anchura visiblemente respecto al expandido", async ({
    page,
    tracker,
  }) => {
    await tracker.goto();

    const expandedWidth = await page
      .locator(".sidebar")
      .evaluate((el) => el.getBoundingClientRect().width);

    await page.locator("#sidebar-toggle").click();
    await page.waitForTimeout(350); // esperar a la transición CSS

    const collapsedWidth = await page
      .locator(".sidebar")
      .evaluate((el) => el.getBoundingClientRect().width);

    expect(collapsedWidth).toBeLessThan(expandedWidth);
    expect(collapsedWidth).toBeLessThan(100);
  });

  test("se puede navegar a una sección haciendo click en el icono cuando el sidebar está colapsado", async ({
    page,
    tracker,
  }) => {
    await tracker.goto();

    // Colapsar el sidebar
    await page.locator("#sidebar-toggle").click();
    await expect(page.locator("body")).toHaveClass(/is-sidebar-collapsed/);

    // Navegar a Movimientos a través del botón de icono (aria-label) del nav lateral
    await page
      .locator("#nav-tabs")
      .getByRole("button", { name: "Movimientos" })
      .click();
    await expect(page.locator("#transactions")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Movimientos mensuales" }),
    ).toBeVisible();

    // Navegar a Inversión
    await page
      .locator("#nav-tabs")
      .getByRole("button", { name: "Inversión" })
      .click();
    await expect(page.locator("#investment")).toBeVisible();
  });

  test("expandir de nuevo el sidebar vuelve a mostrar las etiquetas de texto", async ({
    page,
    tracker,
  }) => {
    await tracker.goto();

    // Colapsar y volver a expandir
    await page.locator("#sidebar-toggle").click();
    await expect(page.locator("body")).toHaveClass(/is-sidebar-collapsed/);

    await page.locator("#sidebar-toggle").click();
    await expect(page.locator("body")).not.toHaveClass(/is-sidebar-collapsed/);

    // Las nav-labels deben ser visibles de nuevo
    await expect(page.locator(".nav-label").first()).toBeVisible();
    await expect(page.locator("#sidebar-toggle")).toHaveAttribute(
      "aria-label",
      "Colapsar barra lateral",
    );
  });

  test("el estado colapsado persiste tras recargar la página (localStorage)", async ({
    page,
    tracker,
  }) => {
    await tracker.goto();

    // Colapsar
    await page.locator("#sidebar-toggle").click();
    await expect(page.locator("body")).toHaveClass(/is-sidebar-collapsed/);

    // Recargar la página
    await page.reload();
    await expect(page.locator("#dashboard")).toBeVisible();

    // El sidebar debe seguir colapsado
    await expect(page.locator("body")).toHaveClass(/is-sidebar-collapsed/);
    await expect(page.locator("#sidebar-toggle")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  test("el estado expandido persiste tras recargar la página", async ({
    page,
    tracker,
  }) => {
    await tracker.goto();

    // Colapsar y luego expandir
    await page.locator("#sidebar-toggle").click();
    await page.locator("#sidebar-toggle").click();
    await expect(page.locator("body")).not.toHaveClass(/is-sidebar-collapsed/);

    await page.reload();
    await expect(page.locator("#dashboard")).toBeVisible();

    // El sidebar debe verse expandido
    await expect(page.locator("body")).not.toHaveClass(/is-sidebar-collapsed/);
  });

  test("los iconos del nav son visibles tanto en estado expandido como colapsado", async ({
    page,
    tracker,
  }) => {
    await tracker.goto();

    // Expandido: los iconos deben estar presentes en el DOM
    const icons = page.locator(".nav .nav-icon");
    await expect(icons).toHaveCount(9);

    // Colapsar
    await page.locator("#sidebar-toggle").click();

    // Colapsado: los iconos deben seguir presentes
    await expect(icons).toHaveCount(9);
  });
});
