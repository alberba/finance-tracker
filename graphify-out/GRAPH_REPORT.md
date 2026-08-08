# Graph Report - finance-tracker  (2026-08-08)

## Corpus Check
- 410 files · ~259,576 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2542 nodes · 5645 edges · 196 communities (154 shown, 42 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 88 edges (avg confidence: 0.69)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `57614f80`
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
- Subscription Utilities
- Subscription Materialization
- Goal View Models
- Transaction Form Dialog
- Investment Movement Form
- Market Quotes Panel
- Investment Section Tabs
- Demo Seed Builder
- Investment Movement Calculations
- Visual Layout Testing
- Issue Context Automation
- Wealth Snapshot UI
- Vue State Management
- D1 Export Script
- Test Seed Utilities
- Market Symbol Search
- Dashboard Visual Snapshot
- Data Backup Snapshot
- Vitest Execution Guidance
- Astro Development Dependencies
- Recent Transactions Panel
- Contribution Deletion
- Wealth Snapshot State
- Vue Pinia Bootstrap
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
- Wealth Page Objects
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
- Transaction Summary Assertions
- Report Modal Testing
- Claude Code Review Workflow
- v-memo Conditional Memoization
- eslint
- issue-enrich.md
- eslint-config-prettier Module
- @eslint css
- @eslint js
- eslint-plugin-astro Module
- eslint-plugin-prettier Module
- eslint-plugin-vue Module
- globals Module
- @playwright test
- prettier Module
- prettier-plugin-astro Module
- @types node
- DashboardPeriodControls.vue
- typescript-eslint Module
- @typescript-eslint parser
- vite Module
- vite-svg-loader Module
- vitest Module
- @vitest coverage-v8
- vue-eslint-parser Module
- wrangler Module
- Dropdown Control
- Circled Information Icon
- Forward Navigation
- Semantic Extraction Contract
- Cross-repository Graph Merge
- Web Interface Guidelines Review
- @astrojs/check
- ProgressBar.vue
- WealthSnapshotTable.vue
- eslint-plugin-vue
- useMoneyFormatter.ts
- report-dialog.ts
- buckets.ts
- pinia.ts
- readEdgeCache
- Instrument
- @astrojs/cloudflare
- wealth.ts
- principal.ts
- Work Package Breakdown — Migración relacional multiusuario sobre Cloudflare D1
- users.ts
- shared.ts
- WP11 — Cutover runbook: v1 → v2 (D1 relational, Cf-Access auth, sync v2)
- MobileNavigation.astro
- budget-entries.ts
- goals.ts
- loadAndCacheQuote
- DashboardStatCard.vue
- investment-movements.ts
- movements.ts
- WP11 — 30-day v1 retention & decommission checklist
- migration.test.ts
- DashboardInvestmentProgressList.vue
- ConflictResolutionDialog.vue
- user-settings.ts
- applyMigration
- schema-v2.test.ts
- Q: Una vez hecho todo lo del grapiphy, podrías encontrar duplicidades que se pudiesen simplificar?
- Q: adelante con los medios
- package.json
- uuidv7.ts
- MigrationReport
- @astrojs/check
- better-sqlite3
- drizzle-kit
- drizzle-orm
- eslint-config-prettier
- @sentry/cloudflare
- tailwindcss
- @tailwindcss/vite
- tsx
- @types/better-sqlite3
- DataEncryptionError

## God Nodes (most connected - your core abstractions)
1. `FinanceTrackerPage` - 94 edges
2. `round2()` - 83 edges
3. `nowIso()` - 79 edges
4. `toMinorUnits()` - 44 edges
5. `parseFloatSafe()` - 37 edges
6. `normalizeState()` - 33 edges
7. `State` - 30 edges
8. `createTestDb()` - 29 edges
9. `scripts` - 27 edges
10. `useFinancialStateStore` - 26 edges

## Surprising Connections (you probably didn't know these)
- `Claude Graphify Pipeline` --semantically_similar_to--> `Codex Graphify Pipeline`  [INFERRED] [semantically similar]
  .claude/skills/graphify/SKILL.md → .codex/skills/graphify/SKILL.md
- `Graphify URL Ingestion` --semantically_similar_to--> `Codex Graphify URL Ingestion`  [INFERRED] [semantically similar]
  .claude/skills/graphify/references/add-watch.md → .codex/skills/graphify/references/add-watch.md
- `Graphify Export Formats` --semantically_similar_to--> `Codex Graphify Export Formats`  [INFERRED] [semantically similar]
  .claude/skills/graphify/references/exports.md → .codex/skills/graphify/references/exports.md
- `Graphify Project Rules` --semantically_similar_to--> `Graphify Project Rules`  [INFERRED] [semantically similar]
  AGENTS.md → CLAUDE.md
- `buildFixtureState()` --calls--> `normalizeState()`  [EXTRACTED]
  tests/integration/d1-v2/migration.test.ts → src/scripts/state.ts

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

## Communities (196 total, 42 thin omitted)

### Community 0 - "Stock Events Integration"
Cohesion: 0.06
Nodes (48): apiKeyInput, hasApiKey, hiddenRows, showHiddenSymbols, stockEventsStore, syncedCount, visibleRows, emit (+40 more)

### Community 1 - "Cloud State and Reports"
Cohesion: 0.06
Nodes (56): resolve(), FINANCE_TRACKER_SEED, getD1FromLocals(), getRuntimeEnvFromLocals(), LocalsWithRuntime, RuntimeEnv, D1DatabaseLike, D1StatementLike (+48 more)

### Community 2 - "Settings and Categories"
Cohesion: 0.14
Nodes (16): buildCategoryTags(), buildSettingsViewModel(), categoryKeyToType(), CategoryTagViewModel, SettingsViewModel, TwrLiquidityOptionViewModel, categoryLocalId(), categoryEmojiKey() (+8 more)

### Community 3 - "Dashboard Charts and Wealth"
Cohesion: 0.18
Nodes (26): areaFill(), axisColor(), baseScales(), cssVar(), destroyExisting(), emptyColor(), getTooltipEl(), gridColor() (+18 more)

### Community 5 - "Build Scripts and Dependencies"
Cohesion: 0.11
Nodes (19): @astrojs/vue, chart.js, decimal.js, jose, dependencies, @astrojs/vue, chart.js, decimal.js (+11 more)

### Community 6 - "Issue Reporting Interface"
Cohesion: 0.07
Nodes (32): closeDialog(), dialogRef, focusReportForm(), isClosing, isOpen, launcherRef, onCancel(), openDialog() (+24 more)

### Community 7 - "Contribution Workflow"
Cohesion: 0.06
Nodes (42): allocationWarning, allocValues, applyCalc(), calcDialogRef, calcExpression, calcExpressionInput, calcTargetId, calcTargetKind (+34 more)

### Community 8 - "Recurring Transactions"
Cohesion: 0.10
Nodes (35): categoryOptions, editingRuleId, financialStateStore, form, frequencies, movementsStore, recurringStore, resetForm() (+27 more)

### Community 9 - "Budget Goals Dashboard"
Cohesion: 0.13
Nodes (33): AllocationInputValue, applyContributionSave(), buildContributionMetricRows(), buildWorkflowSnapshotState(), computeWorkflowWarnings(), ContributionSaveInput, ContributionSaveResult, getContributionEntriesFromSnapshots() (+25 more)

### Community 10 - "Contribution Calculations"
Cohesion: 0.18
Nodes (9): emit, updateField(), financialStateStore, formatter, goalsStore, props, { viewModel }, GoalField (+1 more)

### Community 11 - "Financial State Normalization"
Cohesion: 0.14
Nodes (41): asRecord(), FALLBACK_BASE_SEED, normalizeBudget(), normalizeCategoryEmojis(), normalizeContributions(), normalizeEntities(), normalizeGoals(), normalizeInstruments() (+33 more)

### Community 12 - "Dashboard View Models"
Cohesion: 0.09
Nodes (39): addYear(), buildDashboardViewModel(), buildDashboardViewModelFromState(), buildDashboardYearOptions(), buildNetWorthChart(), buildRangeOptions(), buildRecentTransactions(), buildSavingsGoal() (+31 more)

### Community 13 - "Application Shell State"
Cohesion: 0.16
Nodes (23): setDemoModeEnabled(), requestReportDialogOpen(), applySidebarState(), BeforeInstallPromptEvent, initDemoBanner(), initDemoModeActions(), initMobileMoreMenu(), initPwaInstall() (+15 more)

### Community 14 - "Budget View Models"
Cohesion: 0.15
Nodes (16): emit, handleInput(), BudgetBlockViewModel, BudgetCategoryRow, BudgetMonthCell, BudgetSummaryViewModel, budgetTypeMeta, budgetTypes (+8 more)

### Community 15 - "Core Finance Calculations"
Cohesion: 0.12
Nodes (34): buildCurrentMap(), buildGoalsViewModel(), GoalEditorViewModel, goalOrder, GoalProgressViewModel, GoalsViewModel, monthsUntilGoal(), buildWealthViewModel() (+26 more)

### Community 16 - "Graphify Tooling"
Cohesion: 0.07
Nodes (30): Graphify Trigger Instruction, Graphify Folder Watch, Graphify URL Ingestion, Graphify Export Formats, Graphify MCP Server, Graph Edge Confidence Rubric, Deterministic Graph Node IDs, Semantic Extraction Contract (+22 more)

### Community 17 - "Testing and Type Safety"
Cohesion: 0.09
Nodes (29): Clean Code, Meaningful Names, Single Responsibility, Test-Driven Development, Playwright API Mocking, Playwright Configuration, Debugging Flaky Tests, Page Object Model (+21 more)

### Community 18 - "Market Data Loading"
Cohesion: 0.14
Nodes (23): buildCacheKey(), buildFallbackQuote(), createQuoteLoad(), fetchCoinGecko(), fetchJsonWithTimeout(), fetchProviderQuote(), fetchProviderQuoteFrom(), fetchTwelveData() (+15 more)

### Community 19 - "Transaction Interface"
Cohesion: 0.13
Nodes (11): dialogRef, monthOptions, movementsStore, onDocumentPointerDown(), sectionRef, uiStore, { accounts, selectedVisibleCount }, bulk (+3 more)

### Community 20 - "UI State Types"
Cohesion: 0.11
Nodes (11): CATEGORY_KEYS, ENTITY_KEYS, GOAL_FIELDS, GOAL_KEYS, INVESTMENT_SIDES, MonthTotals, PendingMovementStatus, QuoteStatus (+3 more)

### Community 21 - "Market Instrument Editor"
Cohesion: 0.19
Nodes (9): canvasRef, props, chartItemsForTheme(), drawChart, props, WealthSplitChartItem, DashboardWealthSplitItem, cssPropertyName() (+1 more)

### Community 22 - "Application State Hydration"
Cohesion: 0.18
Nodes (17): asRecord(), cacheSearchResults(), createSearch(), fetchJson(), fetchWithTimeout(), inFlightSearches, loadSearchResults(), MarketSearchEnv (+9 more)

### Community 23 - "Investment Progress Dashboard"
Cohesion: 0.16
Nodes (9): emit, navigate(), attrs, emptyStat, props, {
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
}, props, DashboardKpis (+1 more)

### Community 24 - "Wealth Calculations"
Cohesion: 0.10
Nodes (20): applyCalc(), calcDialogRef, calcExpression, calcExpressionInput, calcTargetId, calcTargetName, calcTitle, closeCalc() (+12 more)

### Community 25 - "E2E Fixtures and State"
Cohesion: 0.06
Nodes (8): TestChart, TestChartConstructor, MONTH_NAMES, Fixtures, mirrorStateToServer(), test, Window, LiveMarketPage

### Community 26 - "Finance Product Documentation"
Cohesion: 0.11
Nodes (21): Enrichment Payload Validation, Issue Enrichment Workflow, Auto-fix Quality Gate, Issue Auto-fix Workflow, Playwright CI Workflow, Layered Frontend Architecture, Legacy-to-Vue Migration Boundary, Annual Budget View (+13 more)

### Community 27 - "Astro Navigation Layout"
Cohesion: 0.16
Nodes (14): ../components/FinanceTrackerShell.astro, activeSection, canonicalUrl, getSectionFromPath(), isSectionRoutePath(), normalizePath(), normalizeSectionId(), isSectionId() (+6 more)

### Community 28 - "Movement Domain Types"
Cohesion: 0.20
Nodes (16): UiState, AccountOption, buildAccountFilterOptions(), buildMonthBreakdown(), CategoryAmountRow, createCategoryMap(), filterAndSortTransactions(), toSortedCategoryRows() (+8 more)

### Community 30 - "Seed Data Extraction"
Cohesion: 0.23
Nodes (18): Path, build_seed(), ensure_known_accounts(), main(), parse_budget(), parse_contributions(), parse_goals(), parse_list_with_amount() (+10 more)

### Community 31 - "Financial Goals State"
Cohesion: 0.16
Nodes (15): canvas, props, renderChart(), canvas, emit, netWorthLabel, netWorthSizeClass, props (+7 more)

### Community 32 - "Vue Finance Workspace"
Cohesion: 0.12
Nodes (11): activeBlockId, currencyInput, indexEntries, settingsStore, { viewModel }, yearInput, draft, props (+3 more)

### Community 33 - "Investment Valuation"
Cohesion: 0.12
Nodes (13): financialStateStore, form, isSearching, marketStore, searchError, searchInstrumentId, searchResults, searchSourceSymbols() (+5 more)

### Community 34 - "Live Market Testing"
Cohesion: 0.06
Nodes (69): dbNameFor(), decryptText(), EncryptedPayload, encryptText(), fromBase64(), getOrCreateEncryptionKey(), loadStoredKey(), openKeyDb() (+61 more)

### Community 35 - "Investment Dashboard Tabs"
Cohesion: 0.11
Nodes (15): { dashboardViewModel }, drawAllocationChart, drawAssetsChart, drawPortfolioChart, { formatMoney }, investmentStore, activeTab, deleteDialogRef (+7 more)

### Community 36 - "Investment Dashboard Calculations"
Cohesion: 0.18
Nodes (12): categoryOptions, close(), dialogRef, ensureValidCategory(), form, movementsStore, onDateChange(), onSubmit() (+4 more)

### Community 37 - "Dashboard Statistics"
Cohesion: 0.16
Nodes (23): bindChartTooltipEvents(), bindEvents(), getEventElement(), getRequiredElement(), AppElements, getAppElements(), hydrateState(), init() (+15 more)

### Community 38 - "Transaction Table Editing"
Cohesion: 0.11
Nodes (9): editCategoryOptions, editDraft, { formatMoney }, movementsStore, onReposition(), popoverStyle, uiStore, updatePopoverPosition() (+1 more)

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
Cohesion: 0.18
Nodes (18): normalizeSymbol(), stripYahooMarketSuffix(), symbolsMatchInstrument(), buildInstrumentValuation(), buildPortfolioValuation(), calculateInstrumentUnits(), calculateWeightedChange(), getExchangeRate() (+10 more)

### Community 44 - "Financial State Formatting"
Cohesion: 0.67
Nodes (3): InvestmentDashboardViewModel, DonutChartItem, MultiLineSeries

### Community 45 - "Market Quote Types"
Cohesion: 0.08
Nodes (13): currentSection, isReportDialogOpen, props, uiStore, budgetStore, financialStateStore, formatter, props (+5 more)

### Community 46 - "Investment Movement Editing"
Cohesion: 0.15
Nodes (8): editCategoryOptions, editComputedAmount, editDraft, editIsBitvavo, { formatMoney }, investmentStore, { movementRows, yearOptions, investmentCategories }, uiStore

### Community 47 - "Subscription Utilities"
Cohesion: 0.14
Nodes (11): activeSubscriptionCount, emit, { formatMoney }, props, categoryOptions, editingId, form, isEditing (+3 more)

### Community 48 - "Subscription Materialization"
Cohesion: 0.27
Nodes (8): addMonths(), advanceSubscriptionDate(), daysInMonth(), DueSubscriptionsResult, formatIsoDate(), getFirstUpcomingChargeDate(), parseIsoDate(), Subscription

### Community 49 - "Goal View Models"
Cohesion: 0.15
Nodes (5): name, openPickerFor, props, rootRef, settingsStore

### Community 50 - "Transaction Form Dialog"
Cohesion: 0.38
Nodes (6): applyCustom(), customEmoji, emit, EMOJI_PALETTE, pick(), props

### Community 51 - "Investment Movement Form"
Cohesion: 0.18
Nodes (8): buildDataSummaryViewModel(), buildTransactionsCsv(), CSV_HEADER, CsvField, DataSummaryViewModel, initializeFreshState(), InitializeResult, useDataStore

### Community 52 - "Market Quotes Panel"
Cohesion: 0.10
Nodes (14): { contributionRows }, emit, { formatMoney }, investmentStore, returnText(), assetNameById, dailyChange, financialStateStore (+6 more)

### Community 53 - "Investment Section Tabs"
Cohesion: 0.08
Nodes (34): bulkInsertInstruments(), bulkInsertQuotes(), bulkInsertUserInstruments(), createInstrument(), CreateMarketInstrumentInput, CreateMarketQuoteInput, createQuote(), createUserInstrument() (+26 more)

### Community 54 - "Demo Seed Builder"
Cohesion: 0.39
Nodes (7): addDays(), buildDemoSeed(), FINANCE_TRACKER_DEMO_SEED, iso(), mulberry32(), toISODate(), SnapshotRow

### Community 55 - "Investment Movement Calculations"
Cohesion: 0.18
Nodes (27): D1BindingLike, Db, getDb(), LocalsWithRuntime, runInTransaction(), jsonResponse(), requirePrincipal(), UnauthorizedError (+19 more)

### Community 56 - "Visual Layout Testing"
Cohesion: 0.11
Nodes (12): LayoutIssue, LayoutScanResult, MOBILE_SECONDARY_SECTION_LABELS, SECTION_IDS, namespaceForEmail(), provisionUser(), Window, namespaceForEmail() (+4 more)

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
Cohesion: 0.16
Nodes (24): accounts(), assets(), computeAccountBalance(), computeInvestedCapital(), computeInvestedCapitalByAsset(), computeInvestmentPortfolioValueForReturnMode(), computeInvestmentValue(), computeTwrLiquidityValue() (+16 more)

### Community 62 - "Market Symbol Search"
Cohesion: 0.22
Nodes (12): InstrumentValuation, createJsonResponse(), MarketDataEnv, MarketQuoteRequest, isInstrument(), json, normalizeFallbackQuotes(), normalizeInstruments() (+4 more)

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
Cohesion: 0.22
Nodes (9): eslint-plugin-astro, fake-indexeddb, devDependencies, eslint-plugin-astro, fake-indexeddb, prettier, typescript, prettier (+1 more)

### Community 67 - "Recent Transactions Panel"
Cohesion: 0.29
Nodes (4): columns, emit, DashboardRecentTransaction, DashboardTransactionTone

### Community 68 - "Contribution Deletion"
Cohesion: 0.38
Nodes (5): close(), dialogRef, emit, onConfirm(), pendingDate

### Community 69 - "Wealth Snapshot State"
Cohesion: 0.21
Nodes (10): seedAccount(), seedCategory(), seedUser(), env, createTestDb(), MIGRATIONS_DIR, readMigrationFiles(), splitStatements() (+2 more)

### Community 70 - "Vue Pinia Bootstrap"
Cohesion: 0.22
Nodes (8): { breakdown, categoryEmojis }, { formatMoney }, movementsStore, sections, CATEGORY_EMOJI_MAP, CategoryEmojiOverrides, decorateCategoryLabel(), TYPE_FALLBACK_EMOJI

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
Cohesion: 0.15
Nodes (18): useDashboardViewModel(), APP_SECTIONS, AppSectionConfig, DashboardHeroRange, DashboardNavigationDeps, DashboardNavigationElements, DashboardNavigationUi, MOBILE_PRIMARY_SECTIONS (+10 more)

### Community 77 - "Dashboard Flow Testing"
Cohesion: 0.15
Nodes (24): bulkInsert(), create(), CreatePendingMovementInput, get(), listByUser(), PendingMovementRow, remove(), toRow() (+16 more)

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
Cohesion: 0.07
Nodes (27): scripts, build, cf:types, check, d1:export, d1:migrate:local, d1:migrate:local:v2, d1:migrate:remote (+19 more)

### Community 91 - "Dashboard Period Controls"
Cohesion: 0.12
Nodes (13): edit, editingId, editingIsInvestment, financialStateStore, investmentTotal, openTransactions(), pending, props (+5 more)

### Community 92 - "Transaction Reporting Snapshot"
Cohesion: 0.50
Nodes (4): Bulk Transaction Controls, Category Breakdown, Income Expense and Investment Totals, Transaction Table

### Community 93 - "Wealth Page Objects"
Cohesion: 0.15
Nodes (24): exportState(), main(), monthFromISO(), dumpUserRowsAsSql(), insertStatement(), LocalV2Database, MIGRATIONS_DIR, openLocalV2Db() (+16 more)

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
Cohesion: 0.11
Nodes (24): AccountRow, bulkInsert(), bulkInsertCategories(), CategoryRow, create(), CreateAccountInput, createCategory(), CreateCategoryInput (+16 more)

### Community 109 - "Transaction Summary Assertions"
Cohesion: 0.32
Nodes (16): accounts, categories, budgetEntries, goals, createdAtColumn(), currencyColumn(), idColumn(), moneyMinorColumn() (+8 more)

### Community 110 - "Report Modal Testing"
Cohesion: 0.20
Nodes (22): CategoryKind, JsonRecord, resolveCategoryId(), resolveEntityId(), syncCreate(), syncListDiff(), syncRemove(), syncSettingsUpdate() (+14 more)

### Community 114 - "issue-enrich.md"
Cohesion: 0.12
Nodes (21): AuditEventRow, bulkInsert(), create(), CreateAuditEventInput, get(), remove(), Db, auditEvents (+13 more)

### Community 115 - "eslint-config-prettier Module"
Cohesion: 0.16
Nodes (21): bulkInsert(), create(), CreateIntegrationCredentialInput, get(), getByProvider(), IntegrationCredentialRow, IntegrationCredentialTableRow, listByUser() (+13 more)

### Community 118 - "eslint-plugin-astro Module"
Cohesion: 0.11
Nodes (17): bulkInsertChanges(), bumpRevision(), createChange(), createCommand(), CreateSyncChangeInput, CreateSyncCommandInput, ensureRevision(), getCommand() (+9 more)

### Community 120 - "eslint-plugin-vue Module"
Cohesion: 0.54
Nodes (4): getGlobalDemoState(), isReadOnlyDemoActive(), isDemoMode(), resolveRuntimeNamespace()

### Community 123 - "prettier Module"
Cohesion: 0.28
Nodes (17): MigrationCollection, accountsRepository, auditEventsRepository, budgetEntriesRepository, contributionsRepository, goalsRepository, integrationCredentialsRepository, marketRepository (+9 more)

### Community 126 - "DashboardPeriodControls.vue"
Cohesion: 0.29
Nodes (6): props, yearOptions, emit, onChange(), PeriodOption, DashboardMonthOption

### Community 148 - "WealthSnapshotTable.vue"
Cohesion: 0.47
Nodes (5): emit, keyOf(), onInput(), props, SnapshotRowViewModel

### Community 150 - "useMoneyFormatter.ts"
Cohesion: 0.15
Nodes (20): bulkInsert(), bulkInsertAllocations(), ContributionAllocationRow, ContributionRow, create(), createAllocation(), CreateContributionAllocationInput, CreateContributionInput (+12 more)

### Community 151 - "report-dialog.ts"
Cohesion: 0.13
Nodes (12): userIdentities, AccessJwtConfig, buildJwksUrl(), CfAccessClaims, getJwks(), jwksByUrl, RemoteJwkSet, verifyAccessJwt() (+4 more)

### Community 152 - "buckets.ts"
Cohesion: 0.15
Nodes (18): categoryUnion(), computeV1Parity(), round2(), CollectionCounts, emptyCounts(), emptyCountsByCollection(), MIGRATION_COLLECTIONS, MigrationAnomaly (+10 more)

### Community 153 - "pinia.ts"
Cohesion: 0.50
Nodes (3): App, pinia, setupVueApp()

### Community 154 - "readEdgeCache"
Cohesion: 0.38
Nodes (5): cacheRequest(), EdgeCache, getEdgeCache(), readEdgeCache(), writeEdgeCache()

### Community 155 - "Instrument"
Cohesion: 0.16
Nodes (17): bulkInsert(), create(), CreateInvestmentTradeDetailInput, createTradeDetail(), CreateTransactionInput, get(), getTradeDetailByTransaction(), InvestmentTradeDetailRow (+9 more)

### Community 157 - "wealth.ts"
Cohesion: 0.15
Nodes (17): bulkInsert(), bulkInsertBalances(), create(), createBalance(), CreateSnapshotBalanceInput, CreateWealthSnapshotInput, get(), getBalance() (+9 more)

### Community 158 - "principal.ts"
Cohesion: 0.16
Nodes (9): ImportMeta, ImportMetaEnv, Locals, findLegacyOwnerToLink(), LegacyOwnerLinkInput, LegacyOwnerLinkResult, AuthPrincipal, Queryable (+1 more)

### Community 159 - "Work Package Breakdown — Migración relacional multiusuario sobre Cloudflare D1"
Cohesion: 0.12
Nodes (16): Contradictions & gaps to flag before starting (read this first), Dependency graph (overview), Parallelization in isolated worktrees, Work Package Breakdown — Migración relacional multiusuario sobre Cloudflare D1, WP10 — Full test suite + CI gating, WP11 — Cutover runbook & retention window, WP12 — Encrypted credentials (AES-GCM, integration_credentials), WP1 — Relational schema, Drizzle setup, versioned migrations (+8 more)

### Community 160 - "users.ts"
Cohesion: 0.14
Nodes (13): bulkInsert(), create(), createIdentity(), CreateUserIdentityInput, CreateUserInput, get(), getIdentity(), remove() (+5 more)

### Community 161 - "shared.ts"
Cohesion: 0.29
Nodes (13): assertOwnedReferences(), fromFlag(), toFlag(), bulkInsert(), create(), CreateSubscriptionInput, get(), listByUser() (+5 more)

### Community 162 - "WP11 — Cutover runbook: v1 → v2 (D1 relational, Cf-Access auth, sync v2)"
Cohesion: 0.15
Nodes (12): 0. Preconditions, 10. Post-cutover monitoring (first 30 days), 1. Enter maintenance mode (block v1 writes), 2. Export v1 + take a Time Travel bookmark, 3. Provision the v2 database (first cutover only), 4. Run the v1 → v2 migration tool (remote path), 5. Validate migration parity, 6. Deploy with the binding flip + feature flags (+4 more)

### Community 163 - "MobileNavigation.astro"
Cohesion: 0.25
Nodes (7): isSecondarySectionActive, primarySections, secondarySections, ./NavIcon.astro, [], ../../config/app-sections, ../../scripts/types

### Community 164 - "budget-entries.ts"
Cohesion: 0.31
Nodes (10): BudgetEntryRow, bulkInsert(), create(), CreateBudgetEntryInput, get(), listByUser(), remove(), toRow() (+2 more)

### Community 165 - "goals.ts"
Cohesion: 0.31
Nodes (10): bulkInsert(), create(), CreateGoalInput, get(), GoalRow, listByUser(), remove(), toRow() (+2 more)

### Community 166 - "loadAndCacheQuote"
Cohesion: 0.38
Nodes (11): asRecord(), cacheExpiry(), calculateChangePercent(), loadAndCacheQuote(), normalizeProviderQuote(), normalizeTimestamp(), normalizeYahooQuote(), normalizeYahooTimestamp() (+3 more)

### Community 167 - "DashboardStatCard.vue"
Cohesion: 0.22
Nodes (9): canvas, DashboardStatVariant, deltaToneClass, props, renderChart(), styleVars, variantStyles, DashboardStatDelta (+1 more)

### Community 168 - "investment-movements.ts"
Cohesion: 0.40
Nodes (8): buildInvestmentDescription(), computeInvestmentMovement(), formatUnits(), InvestmentComputedFields, normalizeInvestmentSide(), normalizeInvestmentSymbol(), normalizeNonNegative(), roundWithPrecision()

### Community 169 - "movements.ts"
Cohesion: 0.27
Nodes (9): MonthBreakdown, SubscriptionFrequency, TransactionType, BulkTransactionChanges, EditedSubscriptionInput, EditedTransactionInput, NewSubscriptionInput, NewTransactionInput (+1 more)

### Community 170 - "WP11 — 30-day v1 retention & decommission checklist"
Cohesion: 0.25
Nodes (7): Day 0 (immediately after cutover, part of exiting maintenance mode), Decommission sign-off (day 30, or later if extended), Rollback still available during the window, Weekly during the window (4 checks over 30 days), Who owns this, Why keep v1 at all, WP11 — 30-day v1 retention & decommission checklist

### Community 171 - "migration.test.ts"
Cohesion: 0.29
Nodes (4): RunMigrationOptions, DataEncryptionEnv, buildFixtureState(), ENCRYPTION_ENV

### Community 172 - "DashboardInvestmentProgressList.vue"
Cohesion: 0.25
Nodes (5): hasItems, props, ariaNow, fillWidth, props

### Community 173 - "ConflictResolutionDialog.vue"
Cohesion: 0.25
Nodes (4): current, entityLabels, remainingCount, syncStore

### Community 174 - "user-settings.ts"
Cohesion: 0.32
Nodes (7): create(), CreateUserSettingsInput, get(), remove(), update(), UpdateUserSettingsInput, UserSettingsRow

### Community 175 - "applyMigration"
Cohesion: 0.38
Nodes (6): sha256Hex(), sortDeep(), stableStringify(), accountKind(), applyMigration(), pad2()

### Community 176 - "schema-v2.test.ts"
Cohesion: 0.33
Nodes (4): ColumnInfo, MIGRATION_PATH, MONEY_COLUMN_SUFFIXES, TABLES_WITHOUT_USER_ID

### Community 177 - "Q: Una vez hecho todo lo del grapiphy, podrías encontrar duplicidades que se pudiesen simplificar?"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: Una vez hecho todo lo del grapiphy, podrías encontrar duplicidades que se pudiesen simplificar?, Source Nodes

### Community 178 - "Q: adelante con los medios"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: adelante con los medios, Source Nodes

### Community 179 - "package.json"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 180 - "uuidv7.ts"
Cohesion: 0.67
Nodes (3): RFC-9562, toHex(), uuidv7()

## Knowledge Gaps
- **733 isolated node(s):** `sharedGlobals`, `scriptFiles`, `vueFiles`, `scopedTsConfigs`, `scopedVueConfigs` (+728 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **42 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `round2()` connect `Core Finance Calculations` to `Settings and Categories`, `Contribution Workflow`, `investment-movements.ts`, `Budget Goals Dashboard`, `movements.ts`, `Data Management View`, `Dashboard View Models`, `Financial State Normalization`, `Budget View Models`, `Report Modal Testing`, `Subscription Materialization`, `Recurring Transactions`, `Demo Seed Builder`, `Wealth Calculations`, `Dashboard Period Controls`, `Movement Domain Types`, `Test Seed Utilities`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Why does `State` connect `buckets.ts` to `Settings and Categories`, `Dashboard Statistics`, `Recurring Transactions`, `Budget Goals Dashboard`, `Dashboard Period Controls`, `Data Management View`, `Dashboard View Models`, `Financial State Normalization`, `Budget View Models`, `Core Finance Calculations`, `Subscription Materialization`, `migration.test.ts`, `Investment Movement Form`, `UI State Types`, `Demo Seed Builder`, `eslint-plugin-vue Module`, `prettier Module`, `Test Seed Utilities`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `Db` connect `issue-enrich.md` to `users.ts`, `shared.ts`, `budget-entries.ts`, `goals.ts`, `Settings Page Objects`, `Dashboard Flow Testing`, `Instrument`, `user-settings.ts`, `eslint-config-prettier Module`, `Investment Section Tabs`, `useMoneyFormatter.ts`, `eslint-plugin-astro Module`, `Investment Movement Calculations`, `prettier Module`, `wealth.ts`, `principal.ts`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **What connects `sharedGlobals`, `scriptFiles`, `vueFiles` to the rest of the system?**
  _733 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Stock Events Integration` be split into smaller, more focused modules?**
  _Cohesion score 0.06321334503950835 - nodes in this community are weakly interconnected._
- **Should `Cloud State and Reports` be split into smaller, more focused modules?**
  _Cohesion score 0.06169772256728778 - nodes in this community are weakly interconnected._
- **Should `Settings and Categories` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._