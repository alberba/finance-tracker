# Graph Report - finance-tracker  (2026-08-08)

## Corpus Check
- 291 files · ~188,142 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1842 nodes · 3645 edges · 129 communities (104 shown, 25 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 64 edges (avg confidence: 0.76)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `25707750`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Stock Events Integration
- Cloud State and Reports
- Settings and Categories
- Dashboard Charts and Wealth
- Finance Page Objects
- Build Scripts and Dependencies
- Issue Reporting Interface
- Contribution Workflow
- Recurring Transactions
- Budget Goals Dashboard
- Contribution Calculations
- Financial State Normalization
- Dashboard View Models
- Application Shell State
- Budget View Models
- Core Finance Calculations
- Graphify Tooling
- Testing and Type Safety
- Market Data Loading
- Transaction Interface
- UI State Types
- Market Instrument Editor
- Application State Hydration
- Investment Progress Dashboard
- Wealth Calculations
- E2E Fixtures and State
- Finance Product Documentation
- Astro Navigation Layout
- Movement Domain Types
- Seed Data Extraction
- Financial Goals State
- Vue Finance Workspace
- Investment Valuation
- Live Market Testing
- Investment Dashboard Tabs
- Investment Dashboard Calculations
- Dashboard Statistics
- Transaction Table Editing
- Vue Engineering Guidance
- Investment Domain Model
- TypeScript Configuration
- Data Management View
- Financial State Formatting
- Market Quote Types
- Investment Movement Editing
- Subscription Materialization
- Goal View Models
- Investment Movement Form
- Market Quotes Panel
- Visual Layout Testing
- Issue Context Automation
- Wealth Snapshot UI
- Vue State Management
- D1 Export Script
- Test Seed Utilities
- Dashboard Visual Snapshot
- Data Backup Snapshot
- Vitest Execution Guidance
- Astro Development Dependencies
- Recent Transactions Panel
- Contribution Deletion
- Mobile Data Navigation
- Mobile Investment Navigation
- Settings Visual Snapshot
- Mobile Transaction Navigation
- ESLint Configuration
- Wealth Snapshot Table
- Dashboard Flow Testing
- Budget Desktop Snapshot
- Budget Mobile Snapshot
- Dashboard Mobile Snapshot
- Goals Desktop Snapshot
- Goals Mobile Snapshot
- Investment Desktop Snapshot
- Settings Mobile Snapshot
- Wealth Mobile Snapshot
- Service Worker Cache
- Transactions Desktop Snapshot
- Frontend Design Guidance
- Graphify Incremental Updates
- Chart Canvas Component
- Dashboard Period Controls
- Transaction Reporting Snapshot
- Astro Usage Guidance
- Graphify Project Rules
- Graph Query Traversal
- Vue List Virtualization
- Vue Plugin Injection
- Vue Render Functions
- Vue Single File Components
- Finance Favicon Design
- Application Icon Design
- PWA Small Icon
- PWA Large Icon
- Expense Statistic Icon
- Income Statistic Icon
- Investment Statistic Icon
- Settings Page Objects
- Claude Code Review Workflow
- v-memo Conditional Memoization
- eslint-config-prettier Module
- @eslint js
- eslint-plugin-prettier Module
- prettier-plugin-astro Module
- @types node
- typescript-eslint Module
- @typescript-eslint parser
- vite-svg-loader Module
- vitest Module
- vue-eslint-parser Module
- wrangler Module
- Dropdown Control
- Circled Information Icon
- Forward Navigation
- Semantic Extraction Contract
- Cross-repository Graph Merge
- Web Interface Guidelines Review
- sentry client config
- WealthSnapshotTable.vue

## God Nodes (most connected - your core abstractions)
1. `FinanceTrackerPage` - 92 edges
2. `round2()` - 83 edges
3. `parseFloatSafe()` - 37 edges
4. `normalizeState()` - 26 edges
5. `useFinancialStateStore` - 26 edges
6. `State` - 25 edges
7. `scripts` - 19 edges
8. `parseIntSafe()` - 19 edges
9. `monthFromISO()` - 19 edges
10. `todayISO()` - 19 edges

## Surprising Connections (you probably didn't know these)
- `Claude Graphify Pipeline` --semantically_similar_to--> `Codex Graphify Pipeline`  [INFERRED] [semantically similar]
  .claude/skills/graphify/SKILL.md → .codex/skills/graphify/SKILL.md
- `Graphify URL Ingestion` --semantically_similar_to--> `Codex Graphify URL Ingestion`  [INFERRED] [semantically similar]
  .claude/skills/graphify/references/add-watch.md → .codex/skills/graphify/references/add-watch.md
- `Graphify Export Formats` --semantically_similar_to--> `Codex Graphify Export Formats`  [INFERRED] [semantically similar]
  .claude/skills/graphify/references/exports.md → .codex/skills/graphify/references/exports.md
- `Graphify Project Rules` --semantically_similar_to--> `Graphify Project Rules`  [INFERRED] [semantically similar]
  AGENTS.md → CLAUDE.md
- `Layered Frontend Architecture` --conceptually_related_to--> `Finance Tracker`  [INFERRED]
  docs/architecture/frontend.md → README.md

## Import Cycles
- 1-file cycle: `src/data/seed.ts -> src/data/seed.ts`

## Hyperedges (group relationships)
- **Playwright Reliable E2E Workflow** — _agents_skills_playwright_expert_skill_reliable_e2e_testing, _agents_skills_playwright_expert_references_api_mocking_api_mocking, _agents_skills_playwright_expert_references_configuration_playwright_configuration, _agents_skills_playwright_expert_references_debugging_flaky_debugging_flaky_tests, _agents_skills_playwright_expert_references_page_object_model_page_object_model, _agents_skills_playwright_expert_references_selectors_locators_selectors_locators [EXTRACTED 1.00]
- **TypeScript Type-Safe Application Patterns** — _agents_skills_typescript_advanced_types_skill_generics, _agents_skills_typescript_advanced_types_skill_conditional_types, _agents_skills_typescript_advanced_types_skill_mapped_types, _agents_skills_typescript_advanced_types_skill_template_literal_types, _agents_skills_typescript_advanced_types_skill_type_safe_patterns [EXTRACTED 1.00]
- **Vitest Testing Toolkit** — _agents_skills_vitest_skill_vitest, _agents_skills_vitest_references_advanced_environments_test_environments, _agents_skills_vitest_references_advanced_projects_projects, _agents_skills_vitest_references_advanced_type_testing_type_testing, _agents_skills_vitest_references_advanced_vi_vi_utilities, _agents_skills_vitest_references_core_cli_command_line_interface, _agents_skills_vitest_references_core_config_configuration, _agents_skills_vitest_references_core_describe_describe_api, _agents_skills_vitest_references_core_expect_expect_api, _agents_skills_vitest_references_core_hooks_lifecycle_hooks [EXTRACTED 1.00]
- **Vue Render Performance Controls** — agents_skills_vue_best_practices_references_perf_v_once_v_memo_directives_v_memo, agents_skills_vue_best_practices_references_perf_virtualize_large_lists_list_virtualization, agents_skills_vue_best_practices_references_updated_hook_performance_updated_hook_discipline [INFERRED 0.75]
- **Graphify Semantic Integrity Workflow** — claude_skills_graphify_skill_structural_semantic_merge, claude_skills_graphify_references_extraction_spec_confidence_rubric, claude_skills_graphify_references_extraction_spec_deterministic_node_ids, claude_skills_graphify_skill_graph_health_gate [EXTRACTED 1.00]
- **Graphify Distribution Surfaces** — claude_skills_graphify_references_exports_graph_exports, claude_skills_graphify_references_exports_graph_mcp_server, claude_skills_graphify_references_github_and_merge_cross_repo_graph_merge [INFERRED 0.75]
- **Web Report Enrichment and Auto-fix Pipeline** — docs_context_tabs_reportes_web_report_flow, _github_workflows_issue_enrich_claude_issue_enrichment_workflow, _github_workflows_issue_fix_claude_issue_autofix_workflow [EXTRACTED 1.00]
- **Frontend Style Migration System** — docs_architecture_frontend_layered_frontend_architecture, vale_entonces_que_me_stateless_sunset_typed_ui_primitives, vale_entonces_que_me_stateless_sunset_residual_css_boundary, vale_entonces_que_me_stateless_sunset_visual_parity_verification [INFERRED 0.85]
- **Annual Budget Overview** — tests_e2e_layout_visual_spec_ts_snapshots_page_budget_chromium_linux_annual_budget_planning, tests_e2e_layout_visual_spec_ts_snapshots_page_budget_chromium_linux_annual_budget_summary, tests_e2e_layout_visual_spec_ts_snapshots_page_budget_chromium_linux_income_budget_section [EXTRACTED 1.00]
- **Dashboard Monthly Financial Metrics** — tests_e2e_layout_visual_spec_ts_snapshots_page_dashboard_chromium_linux_monthly_income_metric, tests_e2e_layout_visual_spec_ts_snapshots_page_dashboard_chromium_linux_monthly_expense_metric, tests_e2e_layout_visual_spec_ts_snapshots_page_dashboard_chromium_linux_monthly_savings_and_investment_metric [EXTRACTED 1.00]
- **Mobile Sidebar Controls** — tests_e2e_layout_visual_spec_ts_snapshots_page_dashboard_mobile_chrome_linux_active_dashboard_navigation, tests_e2e_layout_visual_spec_ts_snapshots_page_dashboard_mobile_chrome_linux_dark_mode_toggle, tests_e2e_layout_visual_spec_ts_snapshots_page_dashboard_mobile_chrome_linux_user_account_control [EXTRACTED 1.00]
- **Mobile Navigation Controls** — tests_e2e_layout_visual_spec_ts_snapshots_page_data_mobile_chrome_linux_active_data_navigation_item, tests_e2e_layout_visual_spec_ts_snapshots_page_data_mobile_chrome_linux_dark_mode_toggle, tests_e2e_layout_visual_spec_ts_snapshots_page_data_mobile_chrome_linux_user_account_menu [EXTRACTED 1.00]
- **Financial Goal Overview** — tests_e2e_layout_visual_spec_ts_snapshots_page_goals_chromium_linux_goal_horizon_cards, tests_e2e_layout_visual_spec_ts_snapshots_page_goals_chromium_linux_investment_goal_cards, tests_e2e_layout_visual_spec_ts_snapshots_page_goals_chromium_linux_goal_progress_tracking [EXTRACTED 1.00]
- **Investment Dashboard Visual Composition** — tests_e2e_layout_visual_spec_ts_snapshots_page_investment_chromium_linux_portfolio_summary_metrics, tests_e2e_layout_visual_spec_ts_snapshots_page_investment_chromium_linux_portfolio_evolution_chart, tests_e2e_layout_visual_spec_ts_snapshots_page_investment_chromium_linux_asset_evolution_chart, tests_e2e_layout_visual_spec_ts_snapshots_page_investment_chromium_linux_return_analysis_controls [EXTRACTED 1.00]
- **Mobile Investment Navigation Controls** — tests_e2e_layout_visual_spec_ts_snapshots_page_investment_mobile_chrome_linux_active_investment_navigation_item, tests_e2e_layout_visual_spec_ts_snapshots_page_investment_mobile_chrome_linux_dark_mode_toggle, tests_e2e_layout_visual_spec_ts_snapshots_page_investment_mobile_chrome_linux_user_account_menu [EXTRACTED 1.00]
- **Base Configuration Domains** — tests_e2e_layout_visual_spec_ts_snapshots_page_settings_chromium_linux_year_currency_settings, tests_e2e_layout_visual_spec_ts_snapshots_page_settings_chromium_linux_liquidity_account_management, tests_e2e_layout_visual_spec_ts_snapshots_page_settings_chromium_linux_investment_asset_management [EXTRACTED 1.00]
- **Monthly Transaction Reporting** — tests_e2e_layout_visual_spec_ts_snapshots_page_transactions_chromium_linux_transaction_table, tests_e2e_layout_visual_spec_ts_snapshots_page_transactions_chromium_linux_income_expense_and_investment_totals, tests_e2e_layout_visual_spec_ts_snapshots_page_transactions_chromium_linux_category_breakdown [INFERRED 0.95]
- **Transactions Mobile Application Shell** — tests_e2e_layout_visual_spec_ts_snapshots_page_transactions_mobile_chrome_linux_mobile_sidebar_navigation, tests_e2e_layout_visual_spec_ts_snapshots_page_transactions_mobile_chrome_linux_active_transactions_navigation, tests_e2e_layout_visual_spec_ts_snapshots_page_transactions_mobile_chrome_linux_dark_mode_toggle, tests_e2e_layout_visual_spec_ts_snapshots_page_transactions_mobile_chrome_linux_sidebar_collapse_control, tests_e2e_layout_visual_spec_ts_snapshots_page_transactions_mobile_chrome_linux_user_account_menu [EXTRACTED 1.00]
- **Net Worth Components** — tests_e2e_layout_visual_spec_ts_snapshots_page_wealth_chromium_linux_liquidity_accounts, tests_e2e_layout_visual_spec_ts_snapshots_page_wealth_chromium_linux_investment_assets, tests_e2e_layout_visual_spec_ts_snapshots_page_wealth_chromium_linux_debt_liabilities [EXTRACTED 1.00]
- **Vitest Execution Toolkit** — agents_skills_vitest_references_core_test_api_vitest_test_api, agents_skills_vitest_references_features_concurrency_test_concurrency, agents_skills_vitest_references_features_context_test_context_fixtures, agents_skills_vitest_references_features_filtering_test_filtering [INFERRED 0.85]
- **Vue Async View Composition** — agents_skills_vue_best_practices_references_component_async_async_components, agents_skills_vue_best_practices_references_component_suspense_suspense_boundaries, agents_skills_vue_best_practices_references_component_keep_alive_keepalive_cache, agents_skills_vue_best_practices_references_component_transition_transition_component [EXTRACTED 1.00]
- **Vue Animation Strategies** — agents_skills_vue_best_practices_references_animation_class_based_technique_class_based_animation, agents_skills_vue_best_practices_references_animation_state_driven_technique_state_driven_animation, agents_skills_vue_best_practices_references_component_transition_group_transitiongroup_lists, agents_skills_vue_best_practices_references_component_transition_transition_component [INFERRED 0.85]

## Communities (129 total, 25 thin omitted)

### Community 0 - "Stock Events Integration"
Cohesion: 0.06
Nodes (47): apiKeyInput, hasApiKey, hiddenRows, showHiddenSymbols, stockEventsStore, syncedCount, visibleRows, emit (+39 more)

### Community 1 - "Cloud State and Reports"
Cohesion: 0.07
Nodes (54): FINANCE_TRACKER_SEED, getD1FromLocals(), getRuntimeEnvFromLocals(), LocalsWithRuntime, RuntimeEnv, D1DatabaseLike, D1StatementLike, ensureSchema() (+46 more)

### Community 2 - "Settings and Categories"
Cohesion: 0.11
Nodes (19): scripts, benchmark:performance, build, cf:types, check, d1:export, d1:migrate:local, d1:migrate:remote (+11 more)

### Community 3 - "Dashboard Charts and Wealth"
Cohesion: 0.06
Nodes (57): canvas, props, renderChart(), canvas, emit, netWorthLabel, netWorthSizeClass, props (+49 more)

### Community 5 - "Build Scripts and Dependencies"
Cohesion: 0.09
Nodes (23): @astrojs/vue, chart.js, dependencies, @astrojs/vue, chart.js, pinia, prettier-plugin-tailwindcss, @sentry/astro (+15 more)

### Community 6 - "Issue Reporting Interface"
Cohesion: 0.07
Nodes (32): closeDialog(), dialogRef, focusReportForm(), isClosing, isOpen, launcherRef, onCancel(), openDialog() (+24 more)

### Community 7 - "Contribution Workflow"
Cohesion: 0.06
Nodes (37): allocationWarning, allocValues, applyCalc(), calcDialogRef, calcExpression, calcExpressionInput, calcTargetId, calcTargetKind (+29 more)

### Community 8 - "Recurring Transactions"
Cohesion: 0.08
Nodes (46): categoryOptions, editingRuleId, financialStateStore, form, frequencies, movementsStore, recurringStore, resetForm() (+38 more)

### Community 9 - "Budget Goals Dashboard"
Cohesion: 0.17
Nodes (21): isBitvavoBrokerAccount(), resolveInvestmentCategory(), AllocationInputValue, applyContributionSave(), buildContributionMetricRows(), buildWorkflowSnapshotState(), computeWorkflowWarnings(), ContributionSaveInput (+13 more)

### Community 10 - "Contribution Calculations"
Cohesion: 0.10
Nodes (22): emit, updateField(), financialStateStore, formatter, goalsStore, props, { viewModel }, buildCurrentMap() (+14 more)

### Community 11 - "Financial State Normalization"
Cohesion: 0.05
Nodes (89): categoryOptions, editingId, form, isEditing, movementsStore, resetForm(), submit(), addDays() (+81 more)

### Community 12 - "Dashboard View Models"
Cohesion: 0.11
Nodes (30): emptyStat, props, addYear(), buildDashboardViewModel(), buildDashboardViewModelFromState(), buildDashboardYearOptions(), buildNetWorthChart(), buildRangeOptions() (+22 more)

### Community 13 - "Application Shell State"
Cohesion: 0.10
Nodes (32): isDemoMode(), resolveRuntimeNamespace(), setDemoModeEnabled(), requestReportDialogOpen(), applySidebarState(), BeforeInstallPromptEvent, initDemoBanner(), initDemoModeActions() (+24 more)

### Community 14 - "Budget View Models"
Cohesion: 0.09
Nodes (24): emit, handleInput(), budgetStore, financialStateStore, formatter, props, { viewModel }, BudgetBlockViewModel (+16 more)

### Community 15 - "Core Finance Calculations"
Cohesion: 0.17
Nodes (26): buildWealthViewModel(), visibleMonthLimit(), WealthTimelineRow, WealthViewModel, computeAccountBalance(), computeContributionMetrics(), computeInvestmentValue(), computeLiabilityValue() (+18 more)

### Community 16 - "Graphify Tooling"
Cohesion: 0.07
Nodes (30): Graphify Trigger Instruction, Graphify Folder Watch, Graphify URL Ingestion, Graphify Export Formats, Graphify MCP Server, Graph Edge Confidence Rubric, Deterministic Graph Node IDs, Semantic Extraction Contract (+22 more)

### Community 17 - "Testing and Type Safety"
Cohesion: 0.09
Nodes (29): Clean Code, Meaningful Names, Single Responsibility, Test-Driven Development, Playwright API Mocking, Playwright Configuration, Debugging Flaky Tests, Page Object Model (+21 more)

### Community 18 - "Market Data Loading"
Cohesion: 0.08
Nodes (50): InstrumentValuation, asRecord(), buildCacheKey(), buildFallbackQuote(), cacheExpiry(), cacheRequest(), calculateChangePercent(), createQuoteLoad() (+42 more)

### Community 19 - "Transaction Interface"
Cohesion: 0.09
Nodes (18): emit, onChange(), PeriodOption, dialogRef, monthOptions, movementsStore, onDocumentPointerDown(), sectionRef (+10 more)

### Community 20 - "UI State Types"
Cohesion: 0.10
Nodes (14): DashboardViewModelOptions, CATEGORY_KEYS, ContributionMetricRow, ENTITY_KEYS, GOAL_FIELDS, GOAL_KEYS, INVESTMENT_SIDES, MonthTotals (+6 more)

### Community 21 - "Market Instrument Editor"
Cohesion: 0.18
Nodes (8): canvasRef, props, { dashboardViewModel }, drawAllocationChart, drawAssetsChart, drawPortfolioChart, { formatMoney }, investmentStore

### Community 22 - "Application State Hydration"
Cohesion: 0.32
Nodes (11): ContributionFlowAllocation, deriveContributionFlow(), findLiquidityTargets(), getFlowFromAllocations(), getLiquidityTargetLabel(), LIQUIDITY_TARGET_KEYS, LIQUIDITY_TARGET_LABELS, normalizeLiquidityName() (+3 more)

### Community 23 - "Investment Progress Dashboard"
Cohesion: 0.12
Nodes (15): hasItems, props, emit, navigate(), attrs, ariaNow, fillWidth, props (+7 more)

### Community 24 - "Wealth Calculations"
Cohesion: 0.11
Nodes (18): applyCalc(), calcDialogRef, calcExpression, calcExpressionInput, calcTargetId, calcTargetName, calcTitle, closeCalc() (+10 more)

### Community 25 - "E2E Fixtures and State"
Cohesion: 0.16
Nodes (5): MONTH_NAMES, Fixtures, mirrorStateToServer(), test, Window

### Community 26 - "Finance Product Documentation"
Cohesion: 0.11
Nodes (21): Enrichment Payload Validation, Issue Enrichment Workflow, Auto-fix Quality Gate, Issue Auto-fix Workflow, Playwright CI Workflow, Layered Frontend Architecture, Legacy-to-Vue Migration Boundary, Annual Budget View (+13 more)

### Community 27 - "Astro Navigation Layout"
Cohesion: 0.12
Nodes (15): activeSection, ../components/FinanceTrackerShell.astro, canonicalUrl, ./FinanceWorkspace.vue, [], isSecondarySectionActive, primarySections, secondarySections (+7 more)

### Community 28 - "Movement Domain Types"
Cohesion: 0.16
Nodes (18): InvestmentMovementRow, AccountOption, buildAccountFilterOptions(), buildMonthBreakdown(), CategoryAmountRow, createCategoryMap(), filterAndSortTransactions(), MonthBreakdown (+10 more)

### Community 30 - "Seed Data Extraction"
Cohesion: 0.23
Nodes (18): Path, build_seed(), ensure_known_accounts(), main(), parse_budget(), parse_contributions(), parse_goals(), parse_list_with_amount() (+10 more)

### Community 31 - "Financial Goals State"
Cohesion: 0.21
Nodes (10): configureThrottling(), cpuSlowdownRate, installPerformanceObservers(), iterations, latencyMs, measureRun(), median(), runs (+2 more)

### Community 32 - "Vue Finance Workspace"
Cohesion: 0.05
Nodes (38): activeBlockId, currencyInput, indexEntries, settingsStore, { viewModel }, yearInput, name, openPickerFor (+30 more)

### Community 33 - "Investment Valuation"
Cohesion: 0.05
Nodes (50): financialStateStore, form, isSearching, marketStore, searchError, searchInstrumentId, searchResults, searchSourceSymbols() (+42 more)

### Community 35 - "Investment Dashboard Tabs"
Cohesion: 0.12
Nodes (10): activeTab, deleteDialogRef, investmentStore, onMonthChange(), returnMode, uiStore, workflowDialogRef, props (+2 more)

### Community 36 - "Investment Dashboard Calculations"
Cohesion: 0.13
Nodes (16): categoryOptions, close(), dialogRef, ensureValidCategory(), form, movementsStore, onDateChange(), onSubmit() (+8 more)

### Community 37 - "Dashboard Statistics"
Cohesion: 0.18
Nodes (10): Before and after, Benchmark method, Bottlenecks found, Bundle evidence, Eager route sections, Eager Session Replay, Outcome, Performance optimization report (+2 more)

### Community 38 - "Transaction Table Editing"
Cohesion: 0.12
Nodes (6): editCategoryOptions, editDraft, { formatMoney }, movementsStore, uiStore, { visibleTransactions, accountFilterOptions, allVisibleSelected, categoryEmojis }

### Community 39 - "Vue Engineering Guidance"
Cohesion: 0.20
Nodes (15): Class-Based Vue Animation, State-Driven Vue Animation, Vue Async Components, Explicit Vue Component Data Flow, Vue Fallthrough Attributes, Vue KeepAlive Cache, Typed Vue Slots, Vue Suspense Boundaries (+7 more)

### Community 40 - "Investment Domain Model"
Cohesion: 0.22
Nodes (9): categoryOptions, computedTotal, financialStateStore, form, investmentStore, isBitvavo, onSubmit(), resetDefaults() (+1 more)

### Community 42 - "TypeScript Configuration"
Cohesion: 0.14
Nodes (13): astro/tsconfigs/strict, coverage, dist, node, node_modules, playwright-report, test-results, worker-configuration.d.ts (+5 more)

### Community 43 - "Data Management View"
Cohesion: 0.46
Nodes (7): UiState, TransactionFilters, TransactionSort, InvestmentSubTab, SortDirection, TransactionsSubTab, TxSortColumn

### Community 44 - "Financial State Formatting"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 45 - "Market Quote Types"
Cohesion: 0.40
Nodes (5): onDateChange(), onMonthChange(), open(), resetTouched(), seed()

### Community 46 - "Investment Movement Editing"
Cohesion: 0.15
Nodes (8): editCategoryOptions, editComputedAmount, editDraft, editIsBitvavo, { formatMoney }, investmentStore, { movementRows, yearOptions, investmentCategories }, uiStore

### Community 51 - "Investment Movement Form"
Cohesion: 0.18
Nodes (8): dataStore, { summary }, buildDataSummaryViewModel(), buildTransactionsCsv(), CSV_HEADER, CsvField, DataSummaryViewModel, useDataStore

### Community 52 - "Market Quotes Panel"
Cohesion: 0.13
Nodes (13): assetNameById, dailyChange, financialStateStore, { formatMoney }, marketStore, rows, totalValue, activeSubscriptionCount (+5 more)

### Community 56 - "Visual Layout Testing"
Cohesion: 0.22
Nodes (6): LayoutIssue, LayoutScanResult, MOBILE_SECONDARY_SECTION_LABELS, SECTION_IDS, FinanceSectionId, SECTION_CONFIG

### Community 57 - "Issue Context Automation"
Cohesion: 0.44
Nodes (7): buildIssueContextMarkdown(), collectRepoFiles(), findCandidateFiles(), parseArgs(), runCli(), scoreFile(), tokenize()

### Community 58 - "Wealth Snapshot UI"
Cohesion: 0.25
Nodes (9): Debt and Liabilities, Investment Assets, Liquidity Accounts, Monthly Wealth Snapshot Capture, Monthly Wealth Evolution, Liquidity Plus Investment Minus Debt, Finance Tracker Sidebar Navigation, Total Net Worth (+1 more)

### Community 59 - "Vue State Management"
Cohesion: 0.25
Nodes (8): Computed Derivations, Reactive Primitive Selection, Targeted Watchers, Pinia SSR Isolation, Readonly State with Explicit Actions, Vue State Management Strategy, Post-Update DOM Synchronization, Updated Hook Discipline

### Community 60 - "D1 Export Script"
Cohesion: 0.29
Nodes (7): buildImportSql(), db, KEEP_IDS, OUTPUT_PATH, rows, SQLITE_PATH, toSqlString()

### Community 61 - "Test Seed Utilities"
Cohesion: 0.20
Nodes (20): accounts(), assets(), computeAccountBalance(), computeInvestedCapital(), computeInvestedCapitalByAsset(), computeInvestmentPortfolioValueForReturnMode(), computeInvestmentValue(), computeTwrLiquidityValue() (+12 more)

### Community 63 - "Dashboard Visual Snapshot"
Cohesion: 0.25
Nodes (8): Financial Dashboard Screenshot, Financial Summary, Monthly Expense Metric, Monthly Income Metric, Monthly Savings and Investment Metric, Net Worth Overview, Net Worth Trend Chart, Year and Month Filters

### Community 64 - "Data Backup Snapshot"
Cohesion: 0.25
Nodes (8): Data and Backups Page, Finance Tracker Data and Backups Snapshot, Data Inventory Summary, JSON Data Export, JSON Data Import, Movement CSV Export, Operation Status Panel, Seed Data Reset

### Community 65 - "Vitest Execution Guidance"
Cohesion: 0.29
Nodes (7): Vitest Test API, Vitest Test Concurrency and Sharding, Vitest Test Context and Fixtures, Vitest Code Coverage, Vitest Test Filtering, Vitest Mocking, Vitest Snapshot Testing

### Community 66 - "Astro Development Dependencies"
Cohesion: 0.07
Nodes (27): astro, @astrojs/cloudflare, eslint, eslint-config-prettier, @eslint/css, eslint-plugin-astro, eslint-plugin-vue, globals (+19 more)

### Community 67 - "Recent Transactions Panel"
Cohesion: 0.11
Nodes (15): props, yearOptions, columns, emit, {
  currentCurrency,
  currentYear,
  yearOptions,
  currentMonth,
  monthOptions,
  rangeOptions,
  kpis,
  netWorthChart,
  cashflowChart,
  topExpenses,
  wealthSplit,
  investmentProgress,
  recentTransactions,
  savingsGoal,
  changeYear,
  changeMonth,
  changeRange,
  navigate,
}, props, useDashboardViewModel(), DashboardHeroRange (+7 more)

### Community 68 - "Contribution Deletion"
Cohesion: 0.38
Nodes (5): close(), dialogRef, emit, onConfirm(), pendingDate

### Community 71 - "Mobile Data Navigation"
Cohesion: 0.29
Nodes (7): Active Data Navigation Item, Dark Mode Toggle, Data Copies and Export, Data Management Page, Expanded Mobile Navigation, Mobile Data Page Screenshot, User Account Menu

### Community 72 - "Mobile Investment Navigation"
Cohesion: 0.29
Nodes (7): Active Investment Navigation Item, Dark Mode Toggle, Expanded Mobile Navigation, Investment Portfolio Page, Mobile Investment Page Screenshot, Portfolio and Contributions, User Account Menu

### Community 73 - "Settings Visual Snapshot"
Cohesion: 0.29
Nodes (7): Investment Asset Management, Liquidity Account Management, Master Data Management, Save Settings Action, Settings Page Desktop Snapshot, Finance Tracker Sidebar Navigation, Base Year and Currency Settings

### Community 74 - "Mobile Transaction Navigation"
Cohesion: 0.33
Nodes (7): Active Transactions Navigation, Dark Mode Toggle, Mobile Sidebar Navigation, Monthly Transaction Register, Sidebar Collapse Control, Transactions Mobile Snapshot, User Account Menu

### Community 75 - "ESLint Configuration"
Cohesion: 0.33
Nodes (5): scopedTsConfigs, scopedVueConfigs, scriptFiles, sharedGlobals, vueFiles

### Community 76 - "Wealth Snapshot Table"
Cohesion: 0.10
Nodes (20): activeSectionComponent, currentSection, isReportDialogOpen, props, uiStore, APP_SECTIONS, AppSectionConfig, App (+12 more)

### Community 78 - "Budget Desktop Snapshot"
Cohesion: 0.40
Nodes (6): Annual Budget Planning, Annual Budget Summary, Budget Page Desktop Snapshot, Income Budget Section, Monthly Category Budget Table, Finance Tracker Sidebar Navigation

### Community 79 - "Budget Mobile Snapshot"
Cohesion: 0.40
Nodes (6): Annual Planning Content, Active Budget Navigation State, Dark Mode Control, Finance Tracker Mobile Budget Snapshot, Mobile Navigation Drawer, User Profile Control

### Community 80 - "Dashboard Mobile Snapshot"
Cohesion: 0.33
Nodes (6): Active Dashboard Navigation Item, Dark Mode Toggle, Dashboard Content, Expanded Mobile Sidebar Navigation, Mobile Dashboard Snapshot, User Account Control

### Community 81 - "Goals Desktop Snapshot"
Cohesion: 0.40
Nodes (6): Financial Goals Tracking, Short Medium and Long Term Goal Cards, Goal Progress Tracking, Goals Page Desktop Snapshot, Investment Category Goal Cards, Finance Tracker Sidebar Navigation

### Community 82 - "Goals Mobile Snapshot"
Cohesion: 0.40
Nodes (6): Dark Mode Control, Financial Goals Content, Active Goals Navigation State, Finance Tracker Mobile Goals Snapshot, Mobile Navigation Drawer, User Profile Control

### Community 83 - "Investment Desktop Snapshot"
Cohesion: 0.53
Nodes (6): Asset Evolution Chart, Investment Dashboard Snapshot, Investment Navigation, Portfolio Evolution Chart, Portfolio Summary Metrics, Return Analysis Controls

### Community 84 - "Settings Mobile Snapshot"
Cohesion: 0.40
Nodes (6): Dark Mode Control, Master Data Settings Content, Finance Tracker Mobile Settings Snapshot, Mobile Navigation Drawer, Active Settings Navigation State, User Profile Control

### Community 85 - "Wealth Mobile Snapshot"
Cohesion: 0.40
Nodes (6): Dark Mode Control, Finance Tracker Mobile Wealth Snapshot, Mobile Navigation Drawer, Net Worth Balance Content, User Profile Control, Active Wealth Navigation State

### Community 87 - "Transactions Desktop Snapshot"
Cohesion: 0.40
Nodes (5): Month Filter, Monthly Transaction Register, Monthly Transactions Screenshot, New Transaction Action, Record and Subscription Modes

### Community 88 - "Frontend Design Guidance"
Cohesion: 0.50
Nodes (4): Apache License 2.0, Distinctive Aesthetic Direction, Frontend Design, Cohesive Visual System

### Community 89 - "Graphify Incremental Updates"
Cohesion: 0.50
Nodes (4): Post-commit Graph Refresh, Domain-guided Media Transcription, Incremental Graph Update, Replace on Re-extraction

### Community 90 - "Chart Canvas Component"
Cohesion: 0.22
Nodes (7): { contributionRows }, emit, { formatMoney }, investmentStore, returnText(), formatPercent(), useInvestmentStore

### Community 91 - "Dashboard Period Controls"
Cohesion: 0.12
Nodes (17): edit, editingId, editingIsInvestment, financialStateStore, investmentTotal, openTransactions(), pending, props (+9 more)

### Community 92 - "Transaction Reporting Snapshot"
Cohesion: 0.50
Nodes (4): Bulk Transaction Controls, Category Breakdown, Income Expense and Investment Totals, Transaction Table

### Community 94 - "Astro Usage Guidance"
Cohesion: 0.67
Nodes (3): Astro Usage Guide, Astro Deployment Adapters, Astro Project Structure

### Community 95 - "Graphify Project Rules"
Cohesion: 0.67
Nodes (3): Native CLAUDE.md Graphify Integration, Graphify Project Rules, Graphify Project Rules

### Community 96 - "Graph Query Traversal"
Cohesion: 0.67
Nodes (3): Constrained Query Expansion, Graph Traversal, Work Memory Feedback Loop

### Community 97 - "Vue List Virtualization"
Cohesion: 0.67
Nodes (3): Vue List Virtualization, TanStack Vue Virtual, vue-virtual-scroller

### Community 98 - "Vue Plugin Injection"
Cohesion: 0.67
Nodes (3): Required Injection Helpers, Symbol Injection Keys, Vue Plugin Contract

### Community 99 - "Vue Render Functions"
Cohesion: 0.67
Nodes (3): Explicit Render-Function v-model, Functional Components, Vue Render Function Patterns

### Community 100 - "Vue Single File Components"
Cohesion: 0.67
Nodes (3): Safe v-html Rendering, Component-Scoped Styles, Vue Single-File Components

### Community 101 - "Finance Favicon Design"
Cohesion: 0.67
Nodes (3): Abstract Finance Mark, Finance Tracker Favicon, Green Status Accent

### Community 102 - "Application Icon Design"
Cohesion: 0.67
Nodes (3): Finance Tracker App Icon, Geometric Brand Mark, Mint Circular Accent

### Community 103 - "PWA Small Icon"
Cohesion: 0.67
Nodes (3): PWA Application Icon, Geometric F Mark, Green Accent Dot

### Community 104 - "PWA Large Icon"
Cohesion: 0.67
Nodes (3): Green Circular Accent, PWA 512 Icon, Stylized F Monogram

### Community 105 - "Expense Statistic Icon"
Cohesion: 0.67
Nodes (3): Downward Arrow, Expense Outflow, Dashboard Expense Statistic Icon

### Community 106 - "Income Statistic Icon"
Cohesion: 1.00
Nodes (3): Income Dashboard Statistic Icon, Income Metric, Upward Arrow

### Community 107 - "Investment Statistic Icon"
Cohesion: 0.67
Nodes (3): Bullseye Investment Symbol, Concentric Target Rings, Investment Dashboard Stat Icon

### Community 108 - "Settings Page Objects"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: Una vez hecho todo lo del grapiphy, podrías encontrar duplicidades que se pudiesen simplificar?, Source Nodes

### Community 115 - "eslint-config-prettier Module"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: adelante con los medios, Source Nodes

### Community 148 - "WealthSnapshotTable.vue"
Cohesion: 0.47
Nodes (5): emit, keyOf(), onInput(), props, SnapshotRowViewModel

## Knowledge Gaps
- **572 isolated node(s):** `sharedGlobals`, `scriptFiles`, `vueFiles`, `scopedTsConfigs`, `scopedVueConfigs` (+567 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **25 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `round2()` connect `Core Finance Calculations` to `Vue Finance Workspace`, `Investment Valuation`, `Investment Dashboard Calculations`, `Contribution Workflow`, `Recurring Transactions`, `Budget Goals Dashboard`, `Contribution Calculations`, `Financial State Normalization`, `Dashboard View Models`, `Market Quote Types`, `Budget View Models`, `Application State Hydration`, `Investment Progress Dashboard`, `Wealth Calculations`, `Dashboard Period Controls`, `Movement Domain Types`, `Test Seed Utilities`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Why does `useUiStore` connect `Wealth Snapshot Table` to `Investment Dashboard Tabs`, `Investment Dashboard Calculations`, `Recent Transactions Panel`, `Issue Reporting Interface`, `Contribution Workflow`, `Transaction Table Editing`, `Budget Goals Dashboard`, `Contribution Calculations`, `Financial State Normalization`, `Investment Movement Editing`, `Transaction Interface`, `Movement Domain Types`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Why does `useFinancialStateStore` connect `Market Quotes Panel` to `Vue Finance Workspace`, `Investment Valuation`, `Stock Events Integration`, `Recent Transactions Panel`, `Investment Dashboard Calculations`, `Contribution Workflow`, `Investment Domain Model`, `Recurring Transactions`, `Contribution Calculations`, `Financial State Normalization`, `Wealth Snapshot Table`, `Application Shell State`, `Budget View Models`, `Budget Goals Dashboard`, `Investment Movement Form`, `Dashboard Period Controls`, `Movement Domain Types`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **What connects `sharedGlobals`, `scriptFiles`, `vueFiles` to the rest of the system?**
  _572 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Stock Events Integration` be split into smaller, more focused modules?**
  _Cohesion score 0.0642243328810493 - nodes in this community are weakly interconnected._
- **Should `Cloud State and Reports` be split into smaller, more focused modules?**
  _Cohesion score 0.06540825285338016 - nodes in this community are weakly interconnected._
- **Should `Settings and Categories` be split into smaller, more focused modules?**
  _Cohesion score 0.10526315789473684 - nodes in this community are weakly interconnected._