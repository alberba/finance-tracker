import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'
import type { FinanceSectionId, FinanceTrackerPage } from './pages/FinanceTrackerPage'
import { LiveMarketPage } from './pages/LiveMarketPage'

const SECTION_IDS: FinanceSectionId[] = [
  'dashboard',
  'transactions',
  'budget',
  'wealth',
  'investment',
  'goals',
  'settings',
  'data',
]

const MOBILE_SECONDARY_SECTION_LABELS: Partial<Record<FinanceSectionId, string>> = {
  wealth: 'Patrimonio',
  goals: 'Objetivos',
  settings: 'Configuración',
  data: 'Datos',
}

/**
 * Sections and views whose touch targets were already under 24 px when the
 * scan started looking at the active section (it used to find none). The list
 * only shrinks: each zone's migration fixes its targets and removes its entry.
 */
const KNOWN_UNDERSIZED_TARGETS = new Set<string>([])

/** A monthly purchase, for the views that need one rule in the plan. */
const RECURRING_RULE = {
  account: 'Revolut',
  category: 'Fondos Indexados',
  description: 'Compra mensual',
  amount: 300,
  frequency: 'monthly',
  startDate: '2026-12-01',
  symbol: 'VWCE',
  units: 1,
  unitPrice: 300,
}

/** Investment views beyond the default tab: expanded row, sub-tabs and dialog. */
const INVESTMENT_VIEWS: Array<{
  name: string
  open: (page: Page, tracker: FinanceTrackerPage) => Promise<void>
  /** Scrolled into view for the snapshot instead of the top of the page. */
  focus?: string
}> = [
  {
    name: 'investment-position',
    focus: '#investment [data-ledger-detail]',
    open: async (page, tracker) => {
      await tracker.openInvestmentDashboardTab()
      await page.locator('#investment [data-position]').first().click()
      await expect(page.locator('#investment-asset-chart')).toBeVisible()
    },
  },
  { name: 'investment-movements', open: (_page, tracker) => tracker.openInvestmentMovementsTab() },
  {
    name: 'investment-movement-panel',
    open: async (_page, tracker) => {
      await tracker.openInvestmentMovementPanel()
    },
  },
  {
    name: 'investment-movement-edit-panel',
    open: async (page, tracker) => {
      await tracker.openInvestmentMovementsTab()
      await page
        .locator('#investment tr[data-investment-tx-id]')
        .first()
        .getByRole('button', { name: /^Editar / })
        .click()
      await expect(tracker.investmentMovementPanel()).toBeVisible()
    },
  },
  {
    name: 'investment-movement-delete-dialog',
    open: async (page, tracker) => {
      await tracker.openInvestmentMovementsTab()
      const row = page.locator('#investment tr[data-investment-tx-id]').first()
      const rowDelete = row.getByRole('button', { name: /^Eliminar / })
      if (await rowDelete.isVisible()) {
        await rowDelete.click()
      } else {
        // Small screens hide the row actions: delete from the edit panel.
        await row.getByRole('button', { name: /^Editar / }).click()
        await tracker.investmentMovementPanel().getByRole('button', { name: 'Eliminar' }).click()
      }
      await expect(page.getByRole('alertdialog')).toBeVisible()
    },
  },
  {
    name: 'investment-contributions',
    open: (_page, tracker) => tracker.openInvestmentContributionsTab(),
  },
  { name: 'investment-recurring', open: (_page, tracker) => tracker.openInvestmentRecurringTab() },
  {
    name: 'investment-contribution-dialog',
    open: (_page, tracker) => tracker.openContributionWorkflowModal(),
  },
  {
    name: 'investment-contribution-allocation',
    open: async (_page, tracker) => {
      await tracker.openContributionWorkflowModal()
      await tracker.contributionWorkflowGoToAllocationStep()
    },
  },
  {
    name: 'investment-contribution-delete-dialog',
    open: async (page, tracker) => {
      await tracker.openInvestmentContributionsTab()
      const remove = page.locator('button[data-delete-contribution-date]').first()
      await remove.scrollIntoViewIfNeeded()
      await remove.click()
      await expect(page.getByRole('alertdialog')).toBeVisible()
    },
  },
  {
    name: 'investment-recurring-panel',
    open: async (page, tracker) => {
      await tracker.openInvestmentRecurringTab()
      await page.getByRole('button', { name: 'Nueva compra recurrente' }).click()
      await expect(new LiveMarketPage(page).recurringPanel).toBeVisible()
    },
  },
  {
    name: 'investment-recurring-plan',
    focus: '#investment [data-recurring-rules] table',
    open: async (page, tracker) => {
      await tracker.openInvestmentRecurringTab()
      await new LiveMarketPage(page).createRecurringRule(RECURRING_RULE)
    },
  },
  {
    name: 'investment-recurring-edit-panel',
    open: async (page, tracker) => {
      const liveMarket = new LiveMarketPage(page)
      await tracker.openInvestmentRecurringTab()
      await liveMarket.createRecurringRule(RECURRING_RULE)
      await page
        .locator('#investment tr[data-recurring-rule-id]')
        .first()
        .getByRole('button', { name: /^Editar la regla / })
        .first()
        .click()
      await expect(liveMarket.recurringPanel).toBeVisible()
    },
  },
  {
    name: 'investment-recurring-delete-dialog',
    open: async (page, tracker) => {
      const liveMarket = new LiveMarketPage(page)
      await tracker.openInvestmentRecurringTab()
      await liveMarket.createRecurringRule(RECURRING_RULE)
      const row = page.locator('#investment tr[data-recurring-rule-id]').first()
      const rowDelete = row.getByRole('button', { name: /^Eliminar la regla / })
      if (await rowDelete.isVisible()) {
        await rowDelete.click()
      } else {
        // Small screens hide the row actions: delete from the edit panel.
        await row.getByRole('button', { name: /^Editar la regla / }).click()
        await liveMarket.recurringPanel.getByRole('button', { name: 'Eliminar' }).click()
      }
      await expect(page.getByRole('alertdialog')).toBeVisible()
    },
  },
]

/** Movimientos views beyond the default tab: sub-tab, side panels and the bulk bar. */
const TRANSACTION_VIEWS: Array<{
  name: string
  open: (page: Page, tracker: FinanceTrackerPage) => Promise<void>
}> = [
  {
    name: 'transactions-subscriptions',
    open: (_page, tracker) => tracker.openSubscriptionsTab(),
  },
  {
    name: 'transactions-movement-panel',
    open: async (page, tracker) => {
      await tracker.openTransactions()
      await tracker.transactionsSection.getByRole('button', { name: 'Nuevo movimiento' }).click()
      await expect(page.getByRole('dialog', { name: 'Nuevo movimiento' })).toBeVisible()
    },
  },
  {
    name: 'transactions-subscription-panel',
    open: (_page, tracker) => tracker.openNewSubscriptionPanel(),
  },
  {
    name: 'transactions-selection',
    open: async (page, tracker) => {
      await tracker.openTransactions()
      const select = page.getByRole('button', { name: 'Seleccionar', exact: true })
      if (await select.isVisible()) await select.click()
      const boxes = tracker.transactionsSection.locator('input[data-select-tx-id]')
      await boxes.nth(0).check()
      await boxes.nth(1).check()
      await expect(tracker.bulkActionBar).toBeVisible()
    },
  },
]

/** Dashboard views beyond the default one (which has no pending movements). */
const DASHBOARD_VIEWS: Array<{
  name: string
  open: (page: Page, tracker: FinanceTrackerPage) => Promise<void>
  focus?: string
}> = [
  {
    name: 'dashboard-pending',
    focus: '#dashboard [data-dashboard-pending]',
    open: async (page, tracker) => {
      await tracker.openInvestmentRecurringTab()
      await new LiveMarketPage(page).createThreePendingMovements('2026-09-15')
      await tracker.openDashboard()
      await expect(page.locator('#dashboard [data-pending-item]')).toHaveCount(3)
    },
  },
]

/** Presupuesto views beyond the default one: the other ranges, a tab and the plan panel. */
const BUDGET_VIEWS: Array<{
  name: string
  open: (page: Page, tracker: FinanceTrackerPage) => Promise<void>
  focus?: string
}> = [
  {
    name: 'budget-six-months',
    open: async (_page, tracker) => {
      await tracker.openBudget()
      await tracker.selectBudgetRange('6')
    },
  },
  {
    name: 'budget-year',
    open: async (_page, tracker) => {
      await tracker.openBudget()
      await tracker.selectBudgetRange('12')
    },
  },
  { name: 'budget-income', open: (_page, tracker) => tracker.openBudgetTab('income') },
  {
    name: 'budget-plan-panel',
    open: async (_page, tracker) => {
      await tracker.openBudgetPlan('Ocio')
    },
  },
]

/** Objetivos views beyond the top of the page: both ledgers and the edit side panel. */
const GOALS_VIEWS: Array<{
  name: string
  open: (page: Page, tracker: FinanceTrackerPage) => Promise<void>
  focus?: string
}> = [
  {
    name: 'goals-net',
    focus: '#goals [data-goal-row="medium"]',
    open: async (_page, tracker) => {
      await tracker.openGoals()
    },
  },
  {
    name: 'goals-portfolio',
    focus: '#goals [data-goals-allocation]',
    open: async (_page, tracker) => {
      await tracker.openGoals()
    },
  },
  {
    name: 'goals-panel',
    focus: '#goal-panel [data-goal-impact]',
    open: async (_page, tracker) => {
      await tracker.openGoalPanel('medium')
    },
  },
]

/** Datos views beyond the top of the page: the import confirmation dialog. */
const DATA_VIEWS: Array<{
  name: string
  open: (page: Page, tracker: FinanceTrackerPage) => Promise<void>
  focus?: string
}> = [
  {
    name: 'data-import-confirm',
    open: async (page, tracker) => {
      await openSectionForLayout(page, tracker, 'data')
      await tracker.chooseImportFile()
    },
  },
]

/** Patrimonio views beyond the default one: edited snapshot, history and calculator. */
const WEALTH_VIEWS: Array<{
  name: string
  open: (page: Page, tracker: FinanceTrackerPage) => Promise<void>
  focus?: string
}> = [
  {
    name: 'wealth-dirty',
    focus: '#wealth [data-snapshot-changes]',
    open: async (_page, tracker) => {
      await tracker.openWealth()
      await tracker.wealthSnapshotInput('Revolut').fill('1234,5')
      await expect(tracker.wealthSection.locator('[data-snapshot-changes]')).toBeVisible()
    },
  },
  {
    name: 'wealth-history',
    focus: '#wealth [data-history-row="total"]',
    open: async (_page, tracker) => {
      await tracker.openWealth()
    },
  },
  {
    name: 'wealth-calc-panel',
    open: async (_page, tracker) => {
      await tracker.openWealth()
      await tracker.wealthSection
        .getByRole('button', { name: 'Calcular el saldo de Fondos Indexados' })
        .click()
      const panel = tracker.wealthCalcPanel()
      await expect(panel).toBeVisible()
      await panel.getByLabel('Cálculo numérico').fill('45,85*128,46')
    },
  },
]

/** Configuración views beyond the default tab: the other tabs, cards and dialogs. */
const SETTINGS_VIEWS: Array<{
  name: string
  open: (page: Page, tracker: FinanceTrackerPage) => Promise<void>
  focus?: string
}> = [
  { name: 'settings-assets', open: (_page, tracker) => tracker.openSettingsTab('Activos') },
  { name: 'settings-liabilities', open: (_page, tracker) => tracker.openSettingsTab('Pasivos') },
  { name: 'settings-categories', open: (_page, tracker) => tracker.openSettingsTab('Categorías') },
  { name: 'settings-recurring', open: (_page, tracker) => tracker.openSettingsTab('Recurrentes') },
  {
    name: 'settings-preferences',
    open: (_page, tracker) => tracker.openSettingsTab('Preferencias'),
  },
  {
    name: 'settings-account-card',
    open: async (_page, tracker) => {
      await tracker.openSettingsCard('Cuentas', 'Trade Republic')
    },
  },
  {
    name: 'settings-asset-card',
    open: async (page, tracker) => {
      await tracker.openSettings()
      await new LiveMarketPage(page).addInstrument({
        asset: 'ETF Plata',
        type: 'etf',
        symbol: 'PHAG',
        currency: 'EUR',
        keepOpen: true,
      })
    },
  },
  {
    name: 'settings-recurring-panel',
    open: async (page, tracker) => {
      await tracker.openSettingsTab('Recurrentes')
      await tracker.section('settings').getByRole('button', { name: 'Nueva regla' }).click()
      await expect(page.locator('#settings-recurring-panel')).toBeVisible()
    },
  },
  {
    name: 'settings-delete-account',
    open: async (page, tracker) => {
      const panel = await tracker.openSettingsCard('Cuentas', 'Efectivo')
      await panel.getByRole('button', { name: 'Eliminar' }).click()
      await expect(page.getByRole('alertdialog', { name: '¿Eliminar esta cuenta?' })).toBeVisible()
    },
  },
  {
    name: 'settings-emoji',
    focus: '#settings [data-category="Comida"]',
    open: async (page, tracker) => {
      await tracker.openSettingsTab('Categorías')
      await page
        .locator('#settings')
        .getByRole('button', { name: 'Cambiar emoji de Comida' })
        .click()
      await expect(page.getByRole('dialog', { name: 'Elegir emoji de Comida' })).toBeVisible()
    },
  },
]

/** Shell regions the layout scan covers: navigation (sidebar, bars, sheet) and the demo band. */
type ShellScope = 'nav-tabs' | 'demo-banner'

/** Shell views: the "Más" sheet and demo mode, on mobile; the user menu and collapsed sidebar, on desktop. */
const SHELL_VIEWS: Array<{
  name: string
  scope: ShellScope
  open: (page: Page, tracker: FinanceTrackerPage) => Promise<void>
}> = [
  {
    name: 'shell-more-sheet',
    scope: 'nav-tabs',
    open: async (page) => {
      await page.getByRole('button', { name: 'Más secciones' }).click()
      await expect(page.getByRole('dialog', { name: 'Más secciones' })).toBeVisible()
    },
  },
  {
    name: 'shell-demo',
    scope: 'demo-banner',
    open: async (page) => {
      await page.goto('/?demo=1')
      await expect(page.locator('html[data-finance-ready="true"]')).toBeVisible()
      await expect(page.getByRole('status').filter({ hasText: 'Modo demo' })).toBeVisible()
    },
  },
]

const SHELL_DESKTOP_VIEWS: typeof SHELL_VIEWS = [
  {
    name: 'shell-user-menu',
    scope: 'nav-tabs',
    open: async (page) => {
      await page.getByRole('button', { name: 'Abrir menú de usuario' }).click()
      await expect(page.getByRole('menu', { name: 'Menú de usuario' })).toBeVisible()
    },
  },
  {
    name: 'shell-collapsed-user-menu',
    scope: 'nav-tabs',
    open: async (page) => {
      await page.getByRole('button', { name: 'Colapsar barra lateral' }).click()
      await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'collapsed')
      await page.getByRole('button', { name: 'Abrir menú de usuario' }).click()
      await expect(page.getByRole('menu', { name: 'Menú de usuario' })).toBeVisible()
    },
  },
  SHELL_VIEWS[1],
]

const DESKTOP = { viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false }

type LayoutIssue = {
  container: string
  first: string
  second: string
  overlapArea: number
}

type LayoutScanResult = {
  viewportWidth: number
  hasViewportHorizontalOverflow: boolean
  viewportOverflowElements: string[]
  overlapIssues: LayoutIssue[]
  undersizedInteractiveElements: string[]
}

/** Scans the element with id `scopeId`: a section, or a shell region such as `nav-tabs`. */
async function getLayoutScanResult(page: Page, scopeId: string): Promise<LayoutScanResult> {
  return await page.evaluate((id) => {
    const activePanel = document.getElementById(id)
    const overlapIssues: LayoutIssue[] = []
    const undersizedInteractiveElements: string[] = []
    const viewportWidth = document.documentElement.clientWidth
    const initialScrollX = window.scrollX
    window.scrollTo({ left: Number.MAX_SAFE_INTEGER })
    const hasViewportHorizontalOverflow = window.scrollX > initialScrollX
    window.scrollTo({ left: initialScrollX })
    const viewportOverflowElements = Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .filter((element) => {
        const rect = element.getBoundingClientRect()
        return rect.width > 1 && rect.right > viewportWidth + 1
      })
      .slice(0, 10)
      .map((element) =>
        element.id ? `#${element.id}` : element.className || element.tagName.toLowerCase(),
      )

    if (!activePanel) {
      return {
        viewportWidth,
        hasViewportHorizontalOverflow,
        viewportOverflowElements,
        overlapIssues,
        undersizedInteractiveElements,
      }
    }

    const containers = [
      activePanel,
      ...Array.from(
        activePanel.querySelectorAll<HTMLElement>(
          ['.cards-grid', '[data-month-card]', '[data-dashboard-grid]', '.form-grid'].join(','),
        ),
      ),
    ]

    for (const container of containers) {
      const children = Array.from(container.children).filter((node): node is HTMLElement => {
        if (!(node instanceof HTMLElement)) {
          return false
        }
        // An open modal dialog sits in the top layer, over the page on purpose.
        if (node.matches('dialog:modal')) {
          return false
        }
        const styles = window.getComputedStyle(node)
        if (styles.display === 'none' || styles.visibility === 'hidden' || styles.opacity === '0') {
          return false
        }
        const rect = node.getBoundingClientRect()
        return rect.width > 1 && rect.height > 1
      })

      for (let i = 0; i < children.length; i += 1) {
        const first = children[i]
        const firstRect = first.getBoundingClientRect()
        for (let j = i + 1; j < children.length; j += 1) {
          const second = children[j]
          if (first.contains(second) || second.contains(first)) {
            continue
          }
          const secondRect = second.getBoundingClientRect()

          const overlapX = Math.max(
            0,
            Math.min(firstRect.right, secondRect.right) - Math.max(firstRect.left, secondRect.left),
          )
          const overlapY = Math.max(
            0,
            Math.min(firstRect.bottom, secondRect.bottom) - Math.max(firstRect.top, secondRect.top),
          )
          const overlapArea = overlapX * overlapY

          if (overlapArea > 4) {
            overlapIssues.push({
              container: container.id
                ? `#${container.id}`
                : container.className || container.tagName.toLowerCase(),
              first: first.id ? `#${first.id}` : first.className || first.tagName.toLowerCase(),
              second: second.id
                ? `#${second.id}`
                : second.className || second.tagName.toLowerCase(),
              overlapArea: Math.round(overlapArea),
            })
          }
        }
      }
    }

    const interactiveElements = Array.from(
      activePanel.querySelectorAll<HTMLElement>(
        "button, a[href], [role='button'], input:not([type='checkbox']):not([type='radio']), select",
      ),
    ).filter((element) => {
      const styles = window.getComputedStyle(element)
      if (styles.display === 'none' || styles.visibility === 'hidden') {
        return false
      }
      const rect = element.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    })

    for (const element of interactiveElements) {
      const rect = element.getBoundingClientRect()
      if (rect.width < 24 || rect.height < 24) {
        undersizedInteractiveElements.push(
          element.id
            ? `#${element.id}`
            : element.getAttribute('aria-label') || element.tagName.toLowerCase(),
        )
      }
    }

    return {
      viewportWidth,
      hasViewportHorizontalOverflow,
      viewportOverflowElements,
      overlapIssues: overlapIssues.slice(0, 10),
      undersizedInteractiveElements: undersizedInteractiveElements.slice(0, 10),
    }
  }, scopeId)
}

async function openSectionForLayout(
  page: Page,
  tracker: FinanceTrackerPage,
  sectionId: FinanceSectionId,
): Promise<void> {
  const secondaryLabel = MOBILE_SECONDARY_SECTION_LABELS[sectionId]
  const moreButton = page.getByRole('button', { name: 'Más secciones' })
  if (secondaryLabel && (await moreButton.isVisible())) {
    await moreButton.click()
    await page
      .getByRole('dialog', { name: 'Más secciones' })
      .getByRole('button', { name: secondaryLabel, exact: true })
      .click()
    await expect(page.locator(`#${sectionId}`)).toBeVisible()
    return
  }

  await tracker.open(sectionId)
}

/** Fixed "today" for snapshots: the default month and dates otherwise drift monthly. */
const SNAPSHOT_NOW = new Date('2026-09-15T10:00:00+02:00')

async function expectViewSnapshot(
  page: Page,
  tracker: FinanceTrackerPage,
  open: () => Promise<void>,
  name: string,
  focus?: string,
): Promise<void> {
  await page.clock.setFixedTime(SNAPSHOT_NOW)
  await tracker.goto()
  // Tab scrolling must use the same font metrics as the captured screenshot.
  if (/^page-settings-(recurring|preferences)/.test(name)) {
    await page.addStyleTag({ path: './tests/e2e/screenshot-stable.css' })
  }
  await open()
  await page.evaluate(async (selector) => {
    await document.fonts.ready
    const target = selector ? document.querySelector(selector) : null
    if (target) target.scrollIntoView({ block: 'center' })
    else window.scrollTo(0, 0)
  }, focus)
  await expect(page).toHaveScreenshot(name, {
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
    stylePath: './tests/e2e/screenshot-stable.css',
  })
}

async function expectSectionSnapshot(
  page: Page,
  tracker: FinanceTrackerPage,
  sectionId: FinanceSectionId,
  name: string,
): Promise<void> {
  await expectViewSnapshot(
    page,
    tracker,
    () => openSectionForLayout(page, tracker, sectionId),
    name,
  )
}

async function expectSoundLayout(
  page: Page,
  scopeId: FinanceSectionId | ShellScope,
  view: string = scopeId,
): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready
  })
  const scan = await getLayoutScanResult(page, scopeId)
  expect(scan.hasViewportHorizontalOverflow, JSON.stringify(scan)).toBe(false)
  expect(scan.overlapIssues).toEqual([])
  if (!KNOWN_UNDERSIZED_TARGETS.has(view)) {
    expect(scan.undersizedInteractiveElements).toEqual([])
  }
}

// The date the committed snapshots were taken; see `fixedTime` in fixtures.ts.
test.use({ fixedTime: '2026-10-03T12:00:00' })

test.describe('UI layout integrity', { tag: '@visual' }, () => {
  // The date the committed snapshots were taken; see `fixedTime` in fixtures.ts.
  test.use({ fixedTime: '2026-08-23T12:00:00' })

  for (const sectionId of SECTION_IDS) {
    test(`no rompe layout en "${sectionId}"`, async ({ tracker, page }) => {
      await openSectionForLayout(page, tracker, sectionId)
      await expectSoundLayout(page, sectionId)
    })

    test(`snapshot visual estable en "${sectionId}"`, async ({ tracker, page }) => {
      await expectSectionSnapshot(page, tracker, sectionId, `page-${sectionId}.png`)
    })
  }
})

test.describe('UI layout integrity · tema oscuro', { tag: '@visual' }, () => {
  // No stored theme, so the pre-paint script follows prefers-color-scheme and
  // the whole app (charts included) renders dark from the first frame.
  test.use({ colorScheme: 'dark' })

  for (const sectionId of SECTION_IDS) {
    test(`snapshot visual estable en "${sectionId}" (oscuro)`, async ({ tracker, page }) => {
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
      await expectSectionSnapshot(page, tracker, sectionId, `page-${sectionId}-dark.png`)
    })
  }
})

test.describe('Inversión · vistas secundarias', { tag: '@visual' }, () => {
  for (const view of INVESTMENT_VIEWS) {
    test(`no rompe layout en "${view.name}"`, async ({ tracker, page }) => {
      await view.open(page, tracker)
      await expectSoundLayout(page, 'investment', view.name)
    })

    test(`snapshot visual estable en "${view.name}"`, async ({ tracker, page }) => {
      await expectViewSnapshot(
        page,
        tracker,
        () => view.open(page, tracker),
        `page-${view.name}.png`,
        view.focus,
      )
    })
  }

  test.describe('tema oscuro', () => {
    test.use({ colorScheme: 'dark' })

    for (const view of INVESTMENT_VIEWS) {
      test(`snapshot visual estable en "${view.name}" (oscuro)`, async ({ tracker, page }) => {
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
        await expectViewSnapshot(
          page,
          tracker,
          () => view.open(page, tracker),
          `page-${view.name}-dark.png`,
          view.focus,
        )
      })
    }
  })

  test.describe('escritorio', () => {
    test.use(DESKTOP)

    test('no rompe layout en "investment" (escritorio)', async ({ tracker, page }) => {
      await tracker.openInvestment()
      await expectSoundLayout(page, 'investment')
    })

    for (const view of INVESTMENT_VIEWS) {
      test(`no rompe layout en "${view.name}" (escritorio)`, async ({ tracker, page }) => {
        await view.open(page, tracker)
        await expectSoundLayout(page, 'investment', view.name)
      })
    }
  })
})

test.describe('Dashboard · vistas secundarias', { tag: '@visual' }, () => {
  for (const view of DASHBOARD_VIEWS) {
    test(`no rompe layout en "${view.name}"`, async ({ tracker, page }) => {
      await view.open(page, tracker)
      await expectSoundLayout(page, 'dashboard', view.name)
    })

    test(`snapshot visual estable en "${view.name}"`, async ({ tracker, page }) => {
      await expectViewSnapshot(
        page,
        tracker,
        () => view.open(page, tracker),
        `page-${view.name}.png`,
        view.focus,
      )
    })
  }

  test.describe('tema oscuro', () => {
    test.use({ colorScheme: 'dark' })

    for (const view of DASHBOARD_VIEWS) {
      test(`snapshot visual estable en "${view.name}" (oscuro)`, async ({ tracker, page }) => {
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
        await expectViewSnapshot(
          page,
          tracker,
          () => view.open(page, tracker),
          `page-${view.name}-dark.png`,
          view.focus,
        )
      })
    }
  })

  test.describe('escritorio', () => {
    test.use(DESKTOP)

    test('no rompe layout en "dashboard" (escritorio)', async ({ tracker, page }) => {
      await tracker.openDashboard()
      await expectSoundLayout(page, 'dashboard')
    })

    for (const view of DASHBOARD_VIEWS) {
      test(`no rompe layout en "${view.name}" (escritorio)`, async ({ tracker, page }) => {
        await view.open(page, tracker)
        await expectSoundLayout(page, 'dashboard', view.name)
      })
    }
  })
})

test.describe('Patrimonio · vistas secundarias', { tag: '@visual' }, () => {
  for (const view of WEALTH_VIEWS) {
    test(`no rompe layout en "${view.name}"`, async ({ tracker, page }) => {
      await view.open(page, tracker)
      await expectSoundLayout(page, 'wealth', view.name)
    })

    test(`snapshot visual estable en "${view.name}"`, async ({ tracker, page }) => {
      await expectViewSnapshot(
        page,
        tracker,
        () => view.open(page, tracker),
        `page-${view.name}.png`,
        view.focus,
      )
    })
  }

  test.describe('tema oscuro', () => {
    test.use({ colorScheme: 'dark' })

    for (const view of WEALTH_VIEWS) {
      test(`snapshot visual estable en "${view.name}" (oscuro)`, async ({ tracker, page }) => {
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
        await expectViewSnapshot(
          page,
          tracker,
          () => view.open(page, tracker),
          `page-${view.name}-dark.png`,
          view.focus,
        )
      })
    }
  })

  test.describe('escritorio', () => {
    test.use(DESKTOP)

    test('no rompe layout en "wealth" (escritorio)', async ({ tracker, page }) => {
      await tracker.openWealth()
      await expectSoundLayout(page, 'wealth')
    })

    for (const view of WEALTH_VIEWS) {
      test(`no rompe layout en "${view.name}" (escritorio)`, async ({ tracker, page }) => {
        await view.open(page, tracker)
        await expectSoundLayout(page, 'wealth', view.name)
      })
    }
  })
})

test.describe('Presupuesto · vistas secundarias', { tag: '@visual' }, () => {
  for (const view of BUDGET_VIEWS) {
    test(`no rompe layout en "${view.name}"`, async ({ tracker, page }) => {
      await view.open(page, tracker)
      await expectSoundLayout(page, 'budget', view.name)
    })

    test(`snapshot visual estable en "${view.name}"`, async ({ tracker, page }) => {
      await expectViewSnapshot(
        page,
        tracker,
        () => view.open(page, tracker),
        `page-${view.name}.png`,
        view.focus,
      )
    })
  }

  test.describe('tema oscuro', () => {
    test.use({ colorScheme: 'dark' })

    for (const view of BUDGET_VIEWS) {
      test(`snapshot visual estable en "${view.name}" (oscuro)`, async ({ tracker, page }) => {
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
        await expectViewSnapshot(
          page,
          tracker,
          () => view.open(page, tracker),
          `page-${view.name}-dark.png`,
          view.focus,
        )
      })
    }
  })

  test.describe('escritorio', () => {
    test.use(DESKTOP)

    test('no rompe layout en "budget" (escritorio)', async ({ tracker, page }) => {
      await tracker.openBudget()
      await expectSoundLayout(page, 'budget')
    })

    for (const view of BUDGET_VIEWS) {
      test(`no rompe layout en "${view.name}" (escritorio)`, async ({ tracker, page }) => {
        await view.open(page, tracker)
        await expectSoundLayout(page, 'budget', view.name)
      })
    }
  })
})

test.describe('Objetivos · vistas secundarias', { tag: '@visual' }, () => {
  for (const view of GOALS_VIEWS) {
    test(`no rompe layout en "${view.name}"`, async ({ tracker, page }) => {
      await view.open(page, tracker)
      await expectSoundLayout(page, 'goals', view.name)
    })

    test(`snapshot visual estable en "${view.name}"`, async ({ tracker, page }) => {
      await expectViewSnapshot(
        page,
        tracker,
        () => view.open(page, tracker),
        `page-${view.name}.png`,
        view.focus,
      )
    })
  }

  test.describe('tema oscuro', () => {
    test.use({ colorScheme: 'dark' })

    for (const view of GOALS_VIEWS) {
      test(`snapshot visual estable en "${view.name}" (oscuro)`, async ({ tracker, page }) => {
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
        await expectViewSnapshot(
          page,
          tracker,
          () => view.open(page, tracker),
          `page-${view.name}-dark.png`,
          view.focus,
        )
      })
    }
  })

  test.describe('escritorio', () => {
    test.use(DESKTOP)

    test('no rompe layout en "goals" (escritorio)', async ({ tracker, page }) => {
      await tracker.openGoals()
      await expectSoundLayout(page, 'goals')
    })

    for (const view of GOALS_VIEWS) {
      test(`no rompe layout en "${view.name}" (escritorio)`, async ({ tracker, page }) => {
        await view.open(page, tracker)
        await expectSoundLayout(page, 'goals', view.name)
      })
    }
  })
})

test.describe('Configuración · vistas secundarias', { tag: '@visual' }, () => {
  for (const view of SETTINGS_VIEWS) {
    test(`no rompe layout en "${view.name}"`, async ({ tracker, page }) => {
      await view.open(page, tracker)
      await expectSoundLayout(page, 'settings', view.name)
    })

    test(`snapshot visual estable en "${view.name}"`, async ({ tracker, page }) => {
      await expectViewSnapshot(
        page,
        tracker,
        () => view.open(page, tracker),
        `page-${view.name}.png`,
        view.focus,
      )
    })
  }

  test.describe('tema oscuro', () => {
    test.use({ colorScheme: 'dark' })

    for (const view of SETTINGS_VIEWS) {
      test(`snapshot visual estable en "${view.name}" (oscuro)`, async ({ tracker, page }) => {
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
        await expectViewSnapshot(
          page,
          tracker,
          () => view.open(page, tracker),
          `page-${view.name}-dark.png`,
          view.focus,
        )
      })
    }
  })

  test.describe('escritorio', () => {
    test.use(DESKTOP)

    test('no rompe layout en "settings" (escritorio)', async ({ tracker, page }) => {
      await tracker.openSettings()
      await expectSoundLayout(page, 'settings')
    })

    for (const view of SETTINGS_VIEWS) {
      test(`no rompe layout en "${view.name}" (escritorio)`, async ({ tracker, page }) => {
        await view.open(page, tracker)
        await expectSoundLayout(page, 'settings', view.name)
      })
    }
  })
})

test.describe('Movimientos · vistas secundarias', { tag: '@visual' }, () => {
  for (const view of TRANSACTION_VIEWS) {
    test(`no rompe layout en "${view.name}"`, async ({ tracker, page }) => {
      await view.open(page, tracker)
      await expectSoundLayout(page, 'transactions', view.name)
    })

    test(`snapshot visual estable en "${view.name}"`, async ({ tracker, page }) => {
      await expectViewSnapshot(
        page,
        tracker,
        () => view.open(page, tracker),
        `page-${view.name}.png`,
      )
    })
  }

  test.describe('tema oscuro', () => {
    test.use({ colorScheme: 'dark' })

    for (const view of TRANSACTION_VIEWS) {
      test(`snapshot visual estable en "${view.name}" (oscuro)`, async ({ tracker, page }) => {
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
        await expectViewSnapshot(
          page,
          tracker,
          () => view.open(page, tracker),
          `page-${view.name}-dark.png`,
        )
      })
    }
  })

  test.describe('escritorio', () => {
    test.use(DESKTOP)

    test('no rompe layout en "transactions" (escritorio)', async ({ tracker, page }) => {
      await tracker.openTransactions()
      await expectSoundLayout(page, 'transactions')
    })

    for (const view of TRANSACTION_VIEWS) {
      test(`no rompe layout en "${view.name}" (escritorio)`, async ({ tracker, page }) => {
        await view.open(page, tracker)
        await expectSoundLayout(page, 'transactions', view.name)
      })
    }
  })
})

test.describe('Datos · vistas secundarias', { tag: '@visual' }, () => {
  for (const view of DATA_VIEWS) {
    test(`no rompe layout en "${view.name}"`, async ({ tracker, page }) => {
      await view.open(page, tracker)
      await expectSoundLayout(page, 'data', view.name)
    })

    test(`snapshot visual estable en "${view.name}"`, async ({ tracker, page }) => {
      await expectViewSnapshot(
        page,
        tracker,
        () => view.open(page, tracker),
        `page-${view.name}.png`,
        view.focus,
      )
    })
  }

  test.describe('tema oscuro', () => {
    test.use({ colorScheme: 'dark' })

    for (const view of DATA_VIEWS) {
      test(`snapshot visual estable en "${view.name}" (oscuro)`, async ({ tracker, page }) => {
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
        await expectViewSnapshot(
          page,
          tracker,
          () => view.open(page, tracker),
          `page-${view.name}-dark.png`,
          view.focus,
        )
      })
    }
  })

  test.describe('escritorio', () => {
    test.use(DESKTOP)

    test('no rompe layout en "data" (escritorio)', async ({ tracker, page }) => {
      await tracker.openData()
      await expectSoundLayout(page, 'data', 'data')
    })

    for (const view of DATA_VIEWS) {
      test(`no rompe layout en "${view.name}" (escritorio)`, async ({ tracker, page }) => {
        await view.open(page, tracker)
        await expectSoundLayout(page, 'data', view.name)
      })
    }
  })
})

test.describe('Shell · vistas secundarias', { tag: '@visual' }, () => {
  for (const view of SHELL_VIEWS) {
    test(`no rompe layout en "${view.name}"`, async ({ tracker, page }) => {
      await tracker.goto()
      await view.open(page, tracker)
      await expectSoundLayout(page, view.scope, view.name)
    })

    test(`snapshot visual estable en "${view.name}"`, async ({ tracker, page }) => {
      await expectViewSnapshot(
        page,
        tracker,
        () => view.open(page, tracker),
        `page-${view.name}.png`,
      )
    })
  }

  test.describe('tema oscuro', () => {
    test.use({ colorScheme: 'dark' })

    for (const view of SHELL_VIEWS) {
      test(`snapshot visual estable en "${view.name}" (oscuro)`, async ({ tracker, page }) => {
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
        await expectViewSnapshot(
          page,
          tracker,
          () => view.open(page, tracker),
          `page-${view.name}-dark.png`,
        )
      })
    }
  })

  test.describe('escritorio', () => {
    test.use(DESKTOP)

    test('no rompe layout en la navegación (escritorio)', async ({ tracker, page }) => {
      await tracker.goto()
      await expectSoundLayout(page, 'nav-tabs', 'shell')
    })

    for (const view of SHELL_DESKTOP_VIEWS) {
      test(`no rompe layout en "${view.name}" (escritorio)`, async ({ tracker, page }) => {
        await tracker.goto()
        await view.open(page, tracker)
        await expectSoundLayout(page, view.scope, view.name)
      })
    }

    for (const view of SHELL_DESKTOP_VIEWS) {
      test(`snapshot visual estable en "${view.name}" (escritorio)`, async ({ tracker, page }) => {
        await expectViewSnapshot(
          page,
          tracker,
          () => view.open(page, tracker),
          `page-${view.name}-desktop.png`,
        )
      })
    }

    test.describe('tema oscuro', () => {
      test.use({ colorScheme: 'dark' })

      for (const view of SHELL_DESKTOP_VIEWS) {
        test(`snapshot visual estable en "${view.name}" (escritorio, oscuro)`, async ({
          tracker,
          page,
        }) => {
          await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
          await expectViewSnapshot(
            page,
            tracker,
            () => view.open(page, tracker),
            `page-${view.name}-desktop-dark.png`,
          )
        })
      }
    })
  })
})
