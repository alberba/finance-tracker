import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'
import type { FinanceSectionId, FinanceTrackerPage } from './pages/FinanceTrackerPage'

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
const KNOWN_UNDERSIZED_TARGETS = new Set<string>(['goals', 'settings', 'investment-recurring'])

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
    name: 'investment-contributions',
    open: (_page, tracker) => tracker.openInvestmentContributionsTab(),
  },
  { name: 'investment-recurring', open: (_page, tracker) => tracker.openInvestmentRecurringTab() },
  {
    name: 'investment-contribution-dialog',
    open: (_page, tracker) => tracker.openContributionWorkflowModal(),
  },
  {
    name: 'investment-contribution-delete-dialog',
    open: async (page, tracker) => {
      await tracker.openInvestmentContributionsTab()
      await page.locator('button[data-delete-contribution-date]').first().click()
      await expect(page.getByRole('dialog')).toBeVisible()
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

async function getLayoutScanResult(page: Page, sectionId: FinanceSectionId): Promise<LayoutScanResult> {
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
          [
            '.cards-grid',
            '.dashboard-kpi-layout',
            '[data-dashboard-chart-grid]',
            '.dual-grid',
            '.goal-edit-grid',
            '.goal-progress',
            '.form-grid',
            '.settings-head',
            '.mini-form',
            '.data-actions',
          ].join(','),
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
  }, sectionId)
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
  await expectViewSnapshot(page, tracker, () => openSectionForLayout(page, tracker, sectionId), name)
}

async function expectSoundLayout(
  page: Page,
  sectionId: FinanceSectionId,
  view: string = sectionId,
): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready
  })
  const scan = await getLayoutScanResult(page, sectionId)
  expect(scan.hasViewportHorizontalOverflow, JSON.stringify(scan)).toBe(false)
  expect(scan.overlapIssues).toEqual([])
  if (!KNOWN_UNDERSIZED_TARGETS.has(view)) {
    expect(scan.undersizedInteractiveElements).toEqual([])
  }
}

test.describe('UI layout integrity', { tag: '@visual' }, () => {
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

test.describe('Movimientos · vistas secundarias', { tag: '@visual' }, () => {
  for (const view of TRANSACTION_VIEWS) {
    test(`no rompe layout en "${view.name}"`, async ({ tracker, page }) => {
      await view.open(page, tracker)
      await expectSoundLayout(page, 'transactions', view.name)
    })

    test(`snapshot visual estable en "${view.name}"`, async ({ tracker, page }) => {
      await expectViewSnapshot(page, tracker, () => view.open(page, tracker), `page-${view.name}.png`)
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
