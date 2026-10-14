import { test, expect } from './fixtures'
import { FinanceTrackerPage } from './pages/FinanceTrackerPage'

test.use({ launchOptions: { args: ['--enable-features=WebMCP'] } })
test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'WebMCP requires experimental Chromium support',
)

test('WebMCP exposes live read-only queries and disappears after logout', async ({
  page,
  tracker,
  browser,
  baseURL,
  testUserEmail,
}) => {
  const tools = await page.webmcp.tools()
  expect(tools.map((tool) => tool.name).sort()).toEqual([
    'get_budget',
    'get_month_totals',
    'search_movements',
  ])
  expect(tools.every((tool) => tool.annotations?.readOnly)).toBe(true)

  const budget = await page.webmcp.callTool('get_budget')
  expect(JSON.parse(budget.content[0].text)).toMatchObject({ currency: 'EUR' })
  const before = await page.webmcp.callTool('get_month_totals', { year: 2026, month: 1 })
  const originalExpense = JSON.parse(before.content[0].text).expense

  await tracker.addCustomTransaction({
    date: '2026-01-02',
    monthLabel: 'ENERO',
    type: 'expense',
    categoryLabel: 'Comida',
    amount: 42,
    description: 'Compra WebMCP',
  })
  const result = await page.webmcp.callTool('search_movements', { query: 'Compra WebMCP' })
  expect(JSON.parse(result.content[0].text)).toMatchObject({
    total: 1,
    movements: [{ amount: 42, month: 1, description: 'Compra WebMCP' }],
  })

  await tracker.editTransactionByDescription('Compra WebMCP', { amount: 55 })
  const updated = await page.webmcp.callTool('search_movements', { query: 'Compra WebMCP' })
  expect(JSON.parse(updated.content[0].text)).toMatchObject({ movements: [{ amount: 55 }] })
  const totals = await page.webmcp.callTool('get_month_totals', { year: 2026, month: 1 })
  expect(JSON.parse(totals.content[0].text).expense).toBe(originalExpense + 55)

  const invalid = await page.webmcp.callTool('search_movements', { limit: 101 })
  expect(invalid.isError).toBe(true)
  await tracker.waitForSync()

  const otherContext = await browser.newContext({
    baseURL,
    extraHTTPHeaders: { 'X-Test-User-Email': `other-${testUserEmail}` },
  })
  try {
    const initialized = await otherContext.request.post('/api/state/initialize', { data: {} })
    expect(initialized.ok()).toBe(true)
    const otherPage = await otherContext.newPage()
    await new FinanceTrackerPage(otherPage).goto()
    const otherResult = await otherPage.webmcp.callTool('search_movements', {
      query: 'Compra WebMCP',
    })
    expect(JSON.parse(otherResult.content[0].text)).toMatchObject({ total: 0, movements: [] })
  } finally {
    await otherContext.close()
  }

  await tracker.logout()
  await expect(page).toHaveURL(/\/login$/)
  expect(await page.webmcp.tools()).toEqual([])
})
