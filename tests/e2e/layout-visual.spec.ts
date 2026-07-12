import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'
import type { FinanceSectionId } from './pages/FinanceTrackerPage'

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

async function getLayoutScanResult(page: Page): Promise<LayoutScanResult> {
  return await page.evaluate(() => {
    const activePanel = document.querySelector<HTMLElement>('.panel.is-active')
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
            '.tx-query-grid',
            '.tx-bulk-grid',
            '.form-grid',
            '.settings-head',
            '.mini-form',
            '.data-actions',
            '.tag-wrap',
          ].join(','),
        ),
      ),
    ]

    for (const container of containers) {
      const children = Array.from(container.children).filter((node): node is HTMLElement => {
        if (!(node instanceof HTMLElement)) {
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
  })
}

test.describe('UI layout integrity', () => {
  for (const sectionId of SECTION_IDS) {
    test(`no rompe layout en "${sectionId}"`, async ({ tracker, page }) => {
      await tracker.open(sectionId)
      await page.evaluate(async () => {
        await document.fonts.ready
      })

      const scan = await getLayoutScanResult(page)
      expect(scan.hasViewportHorizontalOverflow, JSON.stringify(scan)).toBe(false)
      expect(scan.overlapIssues).toEqual([])
      expect(scan.undersizedInteractiveElements).toEqual([])
    })

    test(`snapshot visual estable en "${sectionId}"`, async ({ tracker, page }, testInfo) => {
      test.skip(
        testInfo.project.name === 'mobile-chrome',
        'La cobertura móvil valida el layout con el escáner y un flujo de navegación.',
      )
      await tracker.open(sectionId)
      await page.evaluate(async () => {
        await document.fonts.ready
      })
      await page.evaluate(() => {
        window.scrollTo(0, 0)
      })
      await expect(page).toHaveScreenshot(`page-${sectionId}.png`, {
        animations: 'disabled',
        caret: 'hide',
        scale: 'css',
        stylePath: './tests/e2e/screenshot-stable.css',
      })
    })
  }
})
