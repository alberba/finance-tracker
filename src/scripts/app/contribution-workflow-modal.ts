import { type Contribution, type ContributionMetricRow, type SnapshotKind, type State } from "../types";
import {
  deriveContributionFlow,
  findLiquidityTargets,
  getFlowFromAllocations,
  sanitizeFlowAllocations,
  toSnapshotDate,
} from "../contribution-workflow";
import { computeContributionMetrics as computeContributionMetricsCore } from "../../lib/finance-core";
import { evaluateNumericExpression } from "../math-expression";
import { escapeAttr, escapeHtml, formatPercent, monthFromISO, parseFloatSafe, parseIntSafe, round2, todayISO } from "../utils";

interface ContributionWorkflowSectionDeps {
  getState: () => State;
  ui: any;
  el: any;
  formatMoney: (value: number) => string;
  showToast: (message: string) => void;
  saveState: () => void;
  renderAll: () => void;
  sortContributions: () => void;
  isSnapshotKind: (value: string) => value is SnapshotKind;
}

export function setupContributionWorkflowSection(deps: ContributionWorkflowSectionDeps) {
  const { ui, el } = deps;
  const workflowDialog = el.contributionWorkflowDialog as HTMLDialogElement;

  function getContributionEntriesFromSnapshots(): Contribution[] {
    const state = deps.getState();
    const liquidityTargetAccounts = findLiquidityTargets(state.accounts, state.twrLiquidityAccountIds).matched;
    const liquidityTargetIds = new Set(liquidityTargetAccounts.map((account) => String(account.id)));
    const rowsByDate = new Map<string, Contribution>();

    Object.entries(state.snapshots || {})
      .map(([monthKey, snapshot]: any) => {
        const month = parseIntSafe(monthKey, -1);
        if (!Number.isInteger(month) || month < 0 || month > 11) {
          return null;
        }

        const investments = snapshot?.investments || {};
        const investmentValue = round2(
          Object.values(investments).reduce((sum: number, value: any) => sum + parseFloatSafe(value, 0), 0)
        );
        const liquidityValue = round2(
          Object.entries(snapshot?.accounts || {}).reduce((sum: number, [accountId, value]) => {
            if (!liquidityTargetIds.has(String(accountId))) {
              return sum;
            }
            return sum + parseFloatSafe(value, 0);
          }, 0)
        );
        const portfolioValue = round2(investmentValue + liquidityValue);
        if (portfolioValue <= 0) {
          return null;
        }

        const date = toSnapshotDate(state.year, month);
        const existing = state.contributions.find((item: any) => String(item.portfolioDate || item.date) === date);
        const derived = deriveContributionFlow(existing || {});
        const flow = round2(derived.flow);
        const existingPortfolioValue = round2(parseFloatSafe(existing?.portfolioValue, portfolioValue));
        const normalizedPortfolioValue = existingPortfolioValue > 0 ? existingPortfolioValue : portfolioValue;

        return {
          id: existing?.id || `contrib-snapshot-${state.year}-${month + 1}`,
          date,
          amount: round2(parseFloatSafe(existing?.amount, flow)),
          portfolioDate: date,
          portfolioValue: normalizedPortfolioValue,
          flow,
          flowAllocations: derived.allocations,
          flowSource: derived.flowSource,
          warnings: Array.isArray(existing?.warnings)
            ? existing.warnings.map((entry: unknown) => String(entry || "").trim()).filter(Boolean)
            : [],
        };
      })
      .filter(Boolean)
      .forEach((row) => {
        rowsByDate.set(String(row.portfolioDate || row.date), row as Contribution);
      });

    state.contributions.forEach((item: Contribution) => {
      const date = String(item.portfolioDate || item.date || "").trim();
      if (!date) {
        return;
      }

      const derived = deriveContributionFlow(item || {});
      const existing = rowsByDate.get(date);
      const normalizedPortfolioValue = round2(
        parseFloatSafe(item.portfolioValue, existing?.portfolioValue ?? 0)
      );
      const portfolioValue = normalizedPortfolioValue > 0 ? normalizedPortfolioValue : round2(parseFloatSafe(existing?.portfolioValue, 0));

      if (portfolioValue <= 0) {
        return;
      }

      rowsByDate.set(date, {
        id: String(item.id || existing?.id || `contrib-${date}`),
        date,
        amount: round2(parseFloatSafe(item.amount, derived.flow)),
        portfolioDate: date,
        portfolioValue,
        flow: round2(derived.flow),
        flowAllocations: derived.allocations,
        flowSource: derived.flowSource,
        warnings: Array.isArray(item?.warnings)
          ? item.warnings.map((entry: unknown) => String(entry || "").trim()).filter(Boolean)
          : [],
      });
    });

    return Array.from(rowsByDate.values()).sort((a, b) =>
      String(a.portfolioDate || a.date).localeCompare(String(b.portfolioDate || b.date))
    );
  }

  function renderContributionsTable() {
    const rows = computeContributionMetricsCore(getContributionEntriesFromSnapshots()) as ContributionMetricRow[];

    if (!rows.length) {
      el.contributionBody.innerHTML = "<tr><td colspan='8'>Sin snapshots de inversión disponibles.</td></tr>";
      return;
    }

    el.contributionBody.innerHTML = rows
      .map((row: ContributionMetricRow, index: number) => {
        const periodText = row.periodReturn === null ? "--" : formatPercent(row.periodReturn * 100);
        const cumulativeText = row.cumulativeReturn === null ? "--" : formatPercent(row.cumulativeReturn * 100);
        const periodClass = row.periodReturn === null ? "" : row.periodReturn >= 0 ? "text-good" : "text-bad";
        const cumulativeClass =
          row.cumulativeReturn === null ? "" : row.cumulativeReturn >= 0 ? "text-good" : "text-bad";

        return `
          <tr>
            <td>${escapeHtml(row.date)}</td>
            <td>${deps.formatMoney(row.portfolioValue)}</td>
            <td>
              <input
                class="contribution-flow-input"
                type="number"
                step="0.01"
                value="${row.flow}"
                data-contribution-flow-date="${escapeAttr(row.date)}"
                aria-label="Flujo del día ${escapeAttr(row.date)}"
              />
            </td>
            <td>${index === 0 ? "100" : row.nav.toFixed(6)}</td>
            <td>${row.unitsBefore.toFixed(4)}</td>
            <td>${row.unitsAfter.toFixed(7)}</td>
            <td class="${periodClass}">${periodText}</td>
            <td class="${cumulativeClass}">${cumulativeText}</td>
          </tr>
        `;
      })
      .join("");
  }

  function openContributionWorkflowModal() {
    const state = deps.getState();
    ui.contributionWorkflowStep = 1;
    ui.contributionWorkflowDate = todayISO();
    ui.contributionWorkflowMonth = monthFromISO(ui.contributionWorkflowDate) ?? ui.investmentMonth;

    const existing = state.contributions.find(
      (item: any) => String(item.portfolioDate || item.date) === ui.contributionWorkflowDate
    );
    const derived = deriveContributionFlow(existing || {});
    ui.contributionWorkflowAmount = round2(derived.flow);

    el.contributionWorkflowMonth.value = String(ui.contributionWorkflowMonth);
    el.contributionWorkflowDate.value = ui.contributionWorkflowDate;
    renderContributionWorkflowModal();
    el.contributionWorkflowDialog.showModal();
  }

  function closeContributionWorkflowModal() {
    closeContributionCalcModal();
    if (el.contributionWorkflowDialog.open) {
      el.contributionWorkflowDialog.close();
    }
  }

  function renderContributionWorkflowModal() {
    const state = deps.getState();
    renderContributionWorkflowStepState();

    const month = ui.contributionWorkflowMonth;
    const date = ui.contributionWorkflowDate || toSnapshotDate(state.year, month);
    const existing = state.contributions.find((item: any) => String(item.portfolioDate || item.date) === date);
    const existingAllocations = sanitizeFlowAllocations(existing?.flowAllocations || []);
    const { matched: liquidityAccounts, missing } = findLiquidityTargets(state.accounts, state.twrLiquidityAccountIds);
    const snapshot = state.snapshots[String(month)];

    el.contributionWorkflowInvestmentsBody.innerHTML = state.investmentAssets.length
      ? state.investmentAssets
          .map((asset: any) => {
            const snapshotValue = snapshot?.investments?.[asset.id];
            return `
              <tr>
                <td>${escapeHtml(asset.name)}</td>
                <td>
                  <div class="snapshot-field-stack">
                    <input
                      type="number"
                      step="0.01"
                      value="${snapshotValue ?? ""}"
                      data-contribution-snapshot-kind="investments"
                      data-contribution-snapshot-id="${escapeAttr(asset.id)}"
                      aria-label="Snapshot inversión ${escapeAttr(asset.name)}"
                    />
                    <button
                      type="button"
                      class="tx-btn-secondary snapshot-calc-btn"
                      data-action="open-contribution-snapshot-calc"
                      data-snapshot-kind="investments"
                      data-snapshot-id="${escapeAttr(asset.id)}"
                      data-item-name="${escapeAttr(asset.name)}"
                      aria-label="Calcular snapshot de ${escapeAttr(asset.name)}"
                    >
                      Calcular
                    </button>
                  </div>
                </td>
              </tr>
            `;
          })
          .join("")
      : "<tr><td colspan='2'>No hay activos de inversión configurados.</td></tr>";

    const liquidityRows = liquidityAccounts
      .map((account) => {
        const snapshotValue = snapshot?.accounts?.[account.id];
        return `
          <tr>
            <td>${escapeHtml(account.name)}</td>
            <td>
              <div class="snapshot-field-stack">
                <input
                  type="number"
                  step="0.01"
                  value="${snapshotValue ?? ""}"
                  data-contribution-snapshot-kind="accounts"
                  data-contribution-snapshot-id="${escapeAttr(account.id)}"
                  aria-label="Snapshot liquidez ${escapeAttr(account.name)}"
                />
                <button
                  type="button"
                  class="tx-btn-secondary snapshot-calc-btn"
                  data-action="open-contribution-snapshot-calc"
                  data-snapshot-kind="accounts"
                  data-snapshot-id="${escapeAttr(account.id)}"
                  data-item-name="${escapeAttr(account.name)}"
                  aria-label="Calcular snapshot de ${escapeAttr(account.name)}"
                >
                  Calcular
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");

    const missingRows = missing
      .map((targetName) => {
        return `
          <tr>
            <td>${escapeHtml(targetName)}</td>
            <td class="text-bad">Cuenta no configurada</td>
          </tr>
        `;
      })
      .join("");

    el.contributionWorkflowLiquidityBody.innerHTML =
      liquidityRows || missingRows
        ? `${liquidityRows}${missingRows}`
        : "<tr><td colspan='2'>No hay cuentas de liquidez configuradas.</td></tr>";

    const allocationsByAccountId = new Map(existingAllocations.map((item) => [item.accountId, item.amount]));
    el.contributionWorkflowAllocationBody.innerHTML =
      liquidityAccounts.length > 0
        ? liquidityAccounts
            .map((account) => {
              const currentAllocation = allocationsByAccountId.get(account.id) ?? 0;
              return `
                <tr>
                  <td>${escapeHtml(account.name)}</td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value="${currentAllocation}"
                      data-contribution-allocation-account-id="${escapeAttr(account.id)}"
                      aria-label="Asignación aporte ${escapeAttr(account.name)}"
                    />
                  </td>
                </tr>
              `;
            })
            .join("")
        : "<tr><td colspan='2'>No hay cuentas objetivo para repartir el aporte.</td></tr>";

    if (ui.contributionWorkflowAmount <= 0) {
      ui.contributionWorkflowAmount = round2(
        getFlowFromAllocations(existingAllocations.length > 0 ? existingAllocations : existing?.flowAllocations || [])
      );
    }
    el.contributionWorkflowTotal.value = String(ui.contributionWorkflowAmount);
    renderContributionWorkflowModalWarnings();
  }

  function renderContributionWorkflowStepState() {
    const isStepOne = ui.contributionWorkflowStep === 1;
    el.contributionWorkflowStepSnapshot.hidden = !isStepOne;
    el.contributionWorkflowStepAllocation.hidden = isStepOne;
    el.contributionWorkflowPrev.hidden = isStepOne;
    el.contributionWorkflowNext.hidden = !isStepOne;
    el.contributionWorkflowSave.hidden = isStepOne;
  }

  function openContributionCalcModal(kind: SnapshotKind, targetId: string, targetName: string) {
    ui.contributionCalcTargetKind = kind;
    ui.contributionCalcTargetId = targetId;
    ui.contributionCalcTargetName = targetName;
    el.contributionCalcTitle.textContent = `Calcular snapshot · ${targetName}`;
    el.contributionCalcExpression.value = "";
    el.contributionCalcDialog.showModal();
    window.setTimeout(() => {
      el.contributionCalcExpression.focus();
    }, 0);
  }

  function closeContributionCalcModal() {
    if (el.contributionCalcDialog.open) {
      el.contributionCalcDialog.close();
    }
    ui.contributionCalcTargetKind = "";
    ui.contributionCalcTargetId = "";
    ui.contributionCalcTargetName = "";
    el.contributionCalcExpression.value = "";
    el.contributionCalcTitle.textContent = "Calcular snapshot";
  }

  function applyContributionCalcModalResult() {
    if (!ui.contributionCalcTargetKind || !ui.contributionCalcTargetId) {
      closeContributionCalcModal();
      return;
    }

    const evaluated = evaluateNumericExpression(el.contributionCalcExpression.value);
    if (evaluated === null) {
      deps.showToast("El cálculo no es válido.");
      el.contributionCalcExpression.focus();
      return;
    }

    const snapshotInput = workflowDialog.querySelector<HTMLInputElement>(
      `input[data-contribution-snapshot-kind="${CSS.escape(ui.contributionCalcTargetKind)}"][data-contribution-snapshot-id="${CSS.escape(ui.contributionCalcTargetId)}"]`
    );
    if (!snapshotInput) {
      deps.showToast("No se pudo aplicar el resultado.");
      closeContributionCalcModal();
      return;
    }

    snapshotInput.value = String(round2(evaluated));
    renderContributionWorkflowModalWarnings();
    deps.showToast("Resultado aplicado al snapshot.");
    closeContributionCalcModal();
  }

  function getContributionWorkflowWarnings(): string[] {
    const state = deps.getState();
    const warnings: string[] = [];
    const snapshotInputs = Array.from(
      workflowDialog.querySelectorAll("input[data-contribution-snapshot-kind]")
    ) as HTMLInputElement[];

    const missingInvestment = snapshotInputs.filter((input) => {
      if (input.dataset.contributionSnapshotKind !== "investments") {
        return false;
      }
      return Number.isNaN(parseFloatSafe(input.value, Number.NaN));
    }).length;
    if (missingInvestment > 0) {
      warnings.push(`Faltan snapshots de inversión: ${missingInvestment}`);
    }

    const missingLiquidity = snapshotInputs.filter((input) => {
      if (input.dataset.contributionSnapshotKind !== "accounts") {
        return false;
      }
      return Number.isNaN(parseFloatSafe(input.value, Number.NaN));
    }).length;
    if (missingLiquidity > 0) {
      warnings.push(`Faltan snapshots de liquidez: ${missingLiquidity}`);
    }

    const { missing } = findLiquidityTargets(state.accounts, state.twrLiquidityAccountIds);
    if (missing.length > 0) {
      warnings.push(`Cuentas de liquidez no configuradas: ${missing.join(", ")}`);
    }

    const total = round2(parseFloatSafe(el.contributionWorkflowTotal.value, 0));
    const allocationInputs = Array.from(
      workflowDialog.querySelectorAll("input[data-contribution-allocation-account-id]")
    ) as HTMLInputElement[];
    const allocated = round2(
      allocationInputs.reduce((sum: number, input: HTMLInputElement) => {
        const value = round2(parseFloatSafe(input.value, 0));
        if (value <= 0 || Number.isNaN(value)) {
          return sum;
        }
        return sum + value;
      }, 0)
    );
    const delta = round2(total - allocated);

    if (delta > 0) {
      warnings.push(`Importe sin asignar: ${deps.formatMoney(delta)}`);
    }
    if (delta < 0) {
      warnings.push(`Importe sobreasignado: ${deps.formatMoney(Math.abs(delta))}`);
    }

    return warnings;
  }

  function renderContributionWorkflowModalWarnings() {
    const warnings = getContributionWorkflowWarnings();
    const snapshotWarnings = warnings.filter((message) => /snapshot|liquidez no configuradas/i.test(message));
    const allocationWarnings = warnings.filter((message) => /asignar|sobreasignado/i.test(message));
    el.contributionWorkflowSnapshotWarning.textContent = snapshotWarnings.join("\n");
    el.contributionWorkflowAllocationWarning.textContent = allocationWarnings.join("\n");
  }

  function saveContributionFromWorkflowModal() {
    const state = deps.getState();
    const month = ui.contributionWorkflowMonth;
    const date = String(el.contributionWorkflowDate.value || "").trim() || toSnapshotDate(state.year, month);
    ui.contributionWorkflowDate = date;
    const monthFromDate = monthFromISO(date);
    if (monthFromDate !== null) {
      ui.contributionWorkflowMonth = monthFromDate;
    }

    if (!state.snapshots[String(ui.contributionWorkflowMonth)]) {
      state.snapshots[String(ui.contributionWorkflowMonth)] = {
        month: ui.contributionWorkflowMonth,
        accounts: {},
        investments: {},
        liabilities: {},
      };
    }

    const snapshot = state.snapshots[String(ui.contributionWorkflowMonth)];
    const snapshotInputs = Array.from(
      workflowDialog.querySelectorAll("input[data-contribution-snapshot-kind]")
    ) as HTMLInputElement[];
    snapshotInputs.forEach((input: HTMLInputElement) => {
      const kind = input.dataset.contributionSnapshotKind;
      const itemId = input.dataset.contributionSnapshotId;
      if (!kind || !itemId || !deps.isSnapshotKind(kind)) {
        return;
      }
      const parsed = parseFloatSafe(input.value, Number.NaN);
      if (Number.isNaN(parsed)) {
        delete snapshot[kind][itemId];
        return;
      }
      snapshot[kind][itemId] = round2(parsed);
    });

    const portfolioValue = round2(
      Object.values(snapshot.investments || {}).reduce((sum: number, value: any) => sum + parseFloatSafe(value, 0), 0)
    );
    if (portfolioValue <= 0) {
      deps.showToast("Debes indicar al menos un snapshot de inversión para registrar el aporte.");
      return;
    }

    const allocationInputs = Array.from(
      workflowDialog.querySelectorAll("input[data-contribution-allocation-account-id]")
    ) as HTMLInputElement[];
    const flowAllocations = sanitizeFlowAllocations(
      allocationInputs.map((input) => ({
        accountId: String(input.dataset.contributionAllocationAccountId || ""),
        amount: round2(parseFloatSafe(input.value, 0)),
      }))
    );
    const flow = getFlowFromAllocations(flowAllocations);
    ui.contributionWorkflowAmount = round2(parseFloatSafe(el.contributionWorkflowTotal.value, 0));
    const warnings = getContributionWorkflowWarnings();

    const existingIndex = state.contributions.findIndex((item: any) => String(item.portfolioDate || item.date) === date);
    const payload: Contribution = {
      id: existingIndex >= 0 ? state.contributions[existingIndex].id : `contrib-snapshot-${state.year}-${ui.contributionWorkflowMonth + 1}`,
      date,
      amount: flow,
      portfolioDate: date,
      portfolioValue,
      flow,
      flowAllocations,
      flowSource: "allocations",
      warnings,
    };

    if (existingIndex >= 0) {
      state.contributions[existingIndex] = payload;
    } else {
      state.contributions.push(payload);
      deps.sortContributions();
    }

    deps.saveState();
    deps.renderAll();
    closeContributionWorkflowModal();
    deps.showToast(warnings.length > 0 ? "Aporte guardado con avisos." : "Aporte guardado.");
  }

  function upsertContributionFlowForDate(date: string, flow: number) {
    const state = deps.getState();
    const entries = getContributionEntriesFromSnapshots();
    const current = entries.find((item: any) => item.date === date || item.portfolioDate === date);
    if (!current) {
      return;
    }
    const existingIndex = state.contributions.findIndex((item: any) => String(item.portfolioDate || item.date) === date);
    const payload: Contribution = {
      id: current.id,
      date,
      amount: flow,
      portfolioDate: date,
      portfolioValue: current.portfolioValue,
      flow,
      flowAllocations: [],
      flowSource: "legacy",
      warnings: [],
    };
    if (existingIndex >= 0) {
      state.contributions[existingIndex] = payload;
      return;
    }
    state.contributions.push(payload);
    deps.sortContributions();
  }

  return {
    getContributionEntriesFromSnapshots,
    renderContributionsTable,
    openContributionWorkflowModal,
    closeContributionWorkflowModal,
    renderContributionWorkflowModal,
    renderContributionWorkflowStepState,
    openContributionCalcModal,
    closeContributionCalcModal,
    applyContributionCalcModalResult,
    getContributionWorkflowWarnings,
    renderContributionWorkflowModalWarnings,
    saveContributionFromWorkflowModal,
    upsertContributionFlowForDate,
  };
}
