# Contexto de la pestaña Presupuesto

## Vista actual

La ruta `/presupuesto` abre la sección `#budget`. Las pestañas Gastos, Ingresos e Inversión
seleccionan el tipo; Gastos está activo al entrar. Cada tipo muestra su resumen anual y una
tabla de categorías por mes.

En escritorio, el selector ofrece 3 meses, 6 meses o Año y recuerda el rango por dispositivo.
La ventana inicial de tres meses incluye el anterior, el actual y el siguiente, ajustándose a
los límites del año. Las flechas desplazan la ventana sin salir del año.
En móvil, la tabla muestra una columna de mes y la edición se realiza en el panel de categoría.

El resumen distingue presupuesto anual, real hasta hoy, importe restante y desvío de los meses
cerrados. Los meses futuros no muestran importe real; el mes en curso aún no se juzga como cerrado.
Un exceso es favorable para ingresos y desfavorable para gastos e inversión.

Los importes se editan directamente en las celdas de escritorio o en el panel que abre cada
categoría, donde se planifican los doce meses. La UI admite decimales y rechaza valores que no
se pueden interpretar o son negativos.

## Archivos y recorrido técnico

1. `src/components/FinanceWorkspace.vue` monta `src/components/sections/BudgetSection.vue`.
   La sección lee `useBudgetStore` con `storeToRefs`, selecciona el tipo y compone el resumen,
   `src/components/budget/BudgetTable.vue` y `src/components/budget/BudgetPlanPanel.vue`.
2. `src/domain/budget/view-model.ts` calcula filas, importes reales a partir de movimientos,
   estados de mes, desvíos, tonos y ventanas. Acepta una fecha para probar los cálculos con un
   reloj fijo.
3. `BudgetTable.vue` usa `LedgerTable` y `LedgerInput`, valida el importe y emite `update`.
   La sección llama a `updateBudgetValue` del store. El panel llama a `saveBudgetPlan`.
4. `src/stores/budget.ts` actualiza el estado compartido. Guardar el plan hace un solo commit
   y sincroniza únicamente los meses que cambiaron.
5. El store resuelve o crea la categoría antes de enviar cada celda con `syncBudgetEntry`, en
   `src/lib/client/command-mapping.ts`. La clave de la celda incluye categoría, año y mes;
   el índice cliente `0..11` se convierte a mes `1..12` para el comando.
6. En una sesión autenticada, la cola envía los comandos al servidor y la proyección recupera
   el estado persistido. El recorrido completo está en [sync v2](../../architecture/sync-v2.md).
   El demo mantiene su persistencia local aislada en `src/scripts/app.ts`.

El estado que consume la UI guarda el plan en `state.budget[type][category][month]`, donde
`type` es `income`, `expense` o `investment`, `category` es el nombre y `month` es índice `0..11`.

## Pruebas y puntos sensibles

- `tests/e2e/budget.spec.ts`: pestañas, ventana de meses, rango recordado, edición persistida
  tras recarga, rechazo de texto inválido y guardado del plan anual.
- `tests/e2e/pages/FinanceTrackerPage.ts`: helpers de navegación, rango, celdas y panel.
- `tests/unit/budget-view-model.test.ts`: estados de mes, tonos, ventanas y barras.
- `tests/unit/budget-store-sync.test.ts`: edición y encolado desde el store.
- `tests/integration/d1-v2/round-trip/budget.test.ts`: persistencia con el store real y SQLite,
  incluida la primera edición, el mes y el aislamiento entre años.
- `tests/e2e/layout-visual.spec.ts`: presentación de Presupuesto en escritorio y móvil.

Los locators usan roles y etiquetas, además de `data-budget-type`, `data-budget-months`,
`data-budget-row` y `data-budget-cell`. Revisa los Page Objects al cambiar esas superficies.
Conserva la resolución de categoría antes de encolar la celda y la conversión de mes; son parte
de la persistencia, aunque la edición local ya se vea en pantalla.
