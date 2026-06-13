import {
  getRequiredElement,
  type InvestmentMovementForm,
  type TxForm,
} from "./dom-helpers";

export function getAppElements() {
  return {
    navTabs: getRequiredElement<HTMLElement>("nav-tabs"),
    panels: Array.from(document.querySelectorAll<HTMLElement>(".panel")),
    toast: getRequiredElement<HTMLElement>("toast"),
    saveStatus: getRequiredElement<HTMLElement>("save-status"),

    txMonthFilter: getRequiredElement<HTMLSelectElement>("tx-month-filter"),
    txForm: getRequiredElement<TxForm>("tx-form"),
    txBody: getRequiredElement<HTMLElement>("tx-table-body"),
    txHeaderFilterDate: getRequiredElement<HTMLInputElement>(
      "tx-header-filter-date",
    ),
    txHeaderFilterAccount: getRequiredElement<HTMLElement>(
      "tx-header-filter-account",
    ),
    txHeaderFilterType: getRequiredElement<HTMLElement>(
      "tx-header-filter-type",
    ),
    txHeaderFilterCategory: getRequiredElement<HTMLInputElement>(
      "tx-header-filter-category",
    ),
    txHeaderFilterDescription: getRequiredElement<HTMLInputElement>(
      "tx-header-filter-description",
    ),
    txHeaderFilterAmountMin: getRequiredElement<HTMLInputElement>(
      "tx-header-filter-amount-min",
    ),
    txHeaderFilterAmountMax: getRequiredElement<HTMLInputElement>(
      "tx-header-filter-amount-max",
    ),
    txOpenModal: getRequiredElement<HTMLButtonElement>("tx-open-modal"),
    txDialog: getRequiredElement<HTMLDialogElement>("tx-dialog"),
    txCloseModal: getRequiredElement<HTMLButtonElement>("tx-close-modal"),
    txSubmitMore: getRequiredElement<HTMLButtonElement>("tx-submit-more"),
    txSelectAll: getRequiredElement<HTMLInputElement>("tx-select-all"),
    txSelectedCount: getRequiredElement<HTMLElement>("tx-selected-count"),
    txBulkType: getRequiredElement<HTMLSelectElement>("tx-bulk-type"),
    txBulkAccount: getRequiredElement<HTMLSelectElement>("tx-bulk-account"),
    txBulkCategory: getRequiredElement<HTMLInputElement>("tx-bulk-category"),
    txBulkApply: getRequiredElement<HTMLButtonElement>("tx-bulk-apply"),
    txBulkDelete: getRequiredElement<HTMLButtonElement>("tx-bulk-delete"),
    txTotalIncome: getRequiredElement<HTMLElement>("tx-total-income"),
    txTotalExpense: getRequiredElement<HTMLElement>("tx-total-expense"),
    txTotalInvestment: getRequiredElement<HTMLElement>("tx-total-investment"),
    txCategoryBreakdownBody: getRequiredElement<HTMLElement>(
      "tx-category-breakdown-body",
    ),

    snapshotMonth: getRequiredElement<HTMLSelectElement>("snapshot-month"),
    saveSnapshot: getRequiredElement<HTMLButtonElement>("save-snapshot"),
    snapshotAccounts: getRequiredElement<HTMLElement>("snapshot-accounts"),
    snapshotInvestments: getRequiredElement<HTMLElement>(
      "snapshot-investments",
    ),
    snapshotLiabilities: getRequiredElement<HTMLElement>(
      "snapshot-liabilities",
    ),
    wealthTimelineBody: getRequiredElement<HTMLElement>("wealth-timeline-body"),
    chartWealth: getRequiredElement<HTMLCanvasElement>("chart-wealth"),
    wealthCalcDialog:
      getRequiredElement<HTMLDialogElement>("wealth-calc-dialog"),
    wealthCalcForm: getRequiredElement<HTMLFormElement>("wealth-calc-form"),
    wealthCalcTitle: getRequiredElement<HTMLElement>("wealth-calc-title"),
    wealthCalcExpression: getRequiredElement<HTMLInputElement>(
      "wealth-calc-expression",
    ),
    wealthCalcClose: getRequiredElement<HTMLButtonElement>("wealth-calc-close"),

    investmentMonth: getRequiredElement<HTMLSelectElement>("investment-month"),
    investmentSubtabButtons: Array.from(
      document.querySelectorAll<HTMLButtonElement>("[data-investment-tab]"),
    ),
    investmentSubtabPanels: Array.from(
      document.querySelectorAll<HTMLElement>("[data-investment-tab-panel]"),
    ),
    investmentReturnModeButtons: Array.from(
      document.querySelectorAll<HTMLButtonElement>("[data-return-mode]"),
    ),
    invTotalValue: getRequiredElement<HTMLElement>("inv-total-value"),
    invCapital: getRequiredElement<HTMLElement>("inv-capital"),
    invReturn: getRequiredElement<HTMLElement>("inv-return"),
    invReturnLabel: getRequiredElement<HTMLElement>("inv-return-label"),
    investmentPortfolioChart: getRequiredElement<HTMLCanvasElement>(
      "investment-portfolio-chart",
    ),
    investmentAssetsChart: getRequiredElement<HTMLCanvasElement>(
      "investment-assets-chart",
    ),
    investmentAllocation: getRequiredElement<HTMLCanvasElement>(
      "investment-allocation",
    ),
    investmentYearFilter: getRequiredElement<HTMLSelectElement>(
      "investment-year-filter",
    ),
    investmentOnlyUndeclared: getRequiredElement<HTMLInputElement>(
      "investment-only-undeclared",
    ),
    investmentMovementForm: getRequiredElement<InvestmentMovementForm>(
      "investment-movement-form",
    ),
    investmentTxBody: getRequiredElement<HTMLElement>(
      "investment-tx-table-body",
    ),
    investmentMovementDate: getRequiredElement<HTMLInputElement>(
      "investment-movement-date",
    ),
    investmentMovementTime: getRequiredElement<HTMLInputElement>(
      "investment-movement-time",
    ),
    investmentMovementSide: getRequiredElement<HTMLSelectElement>(
      "investment-movement-side",
    ),
    investmentMovementSymbol: getRequiredElement<HTMLInputElement>(
      "investment-movement-symbol",
    ),
    investmentMovementCategory: getRequiredElement<HTMLSelectElement>(
      "investment-movement-category",
    ),
    investmentMovementUnitPrice: getRequiredElement<HTMLInputElement>(
      "investment-movement-unit-price",
    ),
    investmentMovementUnits: getRequiredElement<HTMLInputElement>(
      "investment-movement-units",
    ),
    investmentMovementFee: getRequiredElement<HTMLInputElement>(
      "investment-movement-fee",
    ),
    investmentMovementTotal: getRequiredElement<HTMLInputElement>(
      "investment-movement-total",
    ),
    investmentMovementCurrency: getRequiredElement<HTMLInputElement>(
      "investment-movement-currency",
    ),
    investmentMovementBroker: getRequiredElement<HTMLSelectElement>(
      "investment-movement-broker",
    ),
    investmentMovementDeclared: getRequiredElement<HTMLInputElement>(
      "investment-movement-declared",
    ),
    contributionBody: getRequiredElement<HTMLElement>("contribution-body"),
    openContributionWorkflow: getRequiredElement<HTMLButtonElement>(
      "open-contribution-workflow",
    ),
    contributionWorkflowDialog: getRequiredElement<HTMLDialogElement>(
      "contribution-workflow-dialog",
    ),
    contributionWorkflowForm: getRequiredElement<HTMLFormElement>(
      "contribution-workflow-form",
    ),
    contributionWorkflowClose: getRequiredElement<HTMLButtonElement>(
      "contribution-workflow-close",
    ),
    contributionWorkflowMonth: getRequiredElement<HTMLSelectElement>(
      "contribution-workflow-month",
    ),
    contributionWorkflowDate: getRequiredElement<HTMLInputElement>(
      "contribution-workflow-date",
    ),
    contributionWorkflowStepSnapshot: getRequiredElement<HTMLElement>(
      "contribution-workflow-step-snapshot",
    ),
    contributionWorkflowStepAllocation: getRequiredElement<HTMLElement>(
      "contribution-workflow-step-allocation",
    ),
    contributionWorkflowInvestmentsBody: getRequiredElement<HTMLElement>(
      "contribution-workflow-investments-body",
    ),
    contributionWorkflowLiquidityBody: getRequiredElement<HTMLElement>(
      "contribution-workflow-liquidity-body",
    ),
    contributionWorkflowAllocationBody: getRequiredElement<HTMLElement>(
      "contribution-workflow-allocation-body",
    ),
    contributionWorkflowTotal: getRequiredElement<HTMLInputElement>(
      "contribution-workflow-total",
    ),
    contributionWorkflowSnapshotWarning: getRequiredElement<HTMLElement>(
      "contribution-workflow-snapshot-warning",
    ),
    contributionWorkflowAllocationWarning: getRequiredElement<HTMLElement>(
      "contribution-workflow-allocation-warning",
    ),
    contributionWorkflowPrev: getRequiredElement<HTMLButtonElement>(
      "contribution-workflow-prev",
    ),
    contributionWorkflowNext: getRequiredElement<HTMLButtonElement>(
      "contribution-workflow-next",
    ),
    contributionWorkflowSave: getRequiredElement<HTMLButtonElement>(
      "contribution-workflow-save",
    ),
    contributionDeleteDialog: getRequiredElement<HTMLDialogElement>(
      "contribution-delete-dialog",
    ),
    contributionDeleteForm: getRequiredElement<HTMLFormElement>(
      "contribution-delete-form",
    ),
    contributionDeleteTitle: getRequiredElement<HTMLElement>(
      "contribution-delete-title",
    ),
    contributionDeleteMessage: getRequiredElement<HTMLElement>(
      "contribution-delete-message",
    ),
    contributionDeleteClose: getRequiredElement<HTMLButtonElement>(
      "contribution-delete-close",
    ),
    contributionDeleteCancel: getRequiredElement<HTMLButtonElement>(
      "contribution-delete-cancel",
    ),
    contributionDeleteConfirm: getRequiredElement<HTMLButtonElement>(
      "contribution-delete-confirm",
    ),
    contributionCalcDialog: getRequiredElement<HTMLDialogElement>(
      "contribution-calc-dialog",
    ),
    contributionCalcForm: getRequiredElement<HTMLFormElement>(
      "contribution-calc-form",
    ),
    contributionCalcTitle: getRequiredElement<HTMLElement>(
      "contribution-calc-title",
    ),
    contributionCalcClose: getRequiredElement<HTMLButtonElement>(
      "contribution-calc-close",
    ),
    contributionCalcExpression: getRequiredElement<HTMLInputElement>(
      "contribution-calc-expression",
    ),

    settingsYear: getRequiredElement<HTMLInputElement>("settings-year"),
    settingsCurrency: getRequiredElement<HTMLInputElement>("settings-currency"),
    saveSettingsMain:
      getRequiredElement<HTMLButtonElement>("save-settings-main"),

    addAccountForm: getRequiredElement<HTMLFormElement>("add-account-form"),
    addInvestmentForm: getRequiredElement<HTMLFormElement>(
      "add-investment-form",
    ),
    addLiabilityForm: getRequiredElement<HTMLFormElement>("add-liability-form"),

    settingsAccounts: getRequiredElement<HTMLElement>("settings-accounts"),
    settingsInvestments: getRequiredElement<HTMLElement>(
      "settings-investments",
    ),
    settingsLiabilities: getRequiredElement<HTMLElement>(
      "settings-liabilities",
    ),
    settingsTwrLiquidity: getRequiredElement<HTMLElement>(
      "settings-twr-liquidity",
    ),

    addIncomeCategory: getRequiredElement<HTMLFormElement>(
      "add-income-category",
    ),
    addExpenseCategory: getRequiredElement<HTMLFormElement>(
      "add-expense-category",
    ),
    addInvestmentCategory: getRequiredElement<HTMLFormElement>(
      "add-investment-category",
    ),

    incomeTags: getRequiredElement<HTMLElement>("settings-income-categories"),
    expenseTags: getRequiredElement<HTMLElement>("settings-expense-categories"),
    investmentTags: getRequiredElement<HTMLElement>(
      "settings-investment-categories",
    ),

    chartTooltip: getRequiredElement<HTMLElement>("chart-tooltip"),
  } as const;
}

export type AppElements = ReturnType<typeof getAppElements>;
