import { readScenarioState } from './seed-sync-v2'
import { test, expect } from './fixtures'

test.describe('toggle de modo de rentabilidad (Simple / TWR)', () => {
  function parseMoney(text: string): number {
    const cleaned = text
      .replace(/\u00a0/g, '')
      .replace(/\u2212/g, '-')
      .replace(/[€$£]/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
      .trim()
    return Number.parseFloat(cleaned)
  }

  test('el toggle existe con los dos botones en la sección de inversión', async ({ tracker }) => {
    await tracker.openInvestment()
    const section = tracker.investmentSection()

    const simpleBtn = section.getByRole('button', { name: 'Simple' })
    const twrBtn = section.getByRole('button', { name: 'TWR' })

    await expect(simpleBtn).toBeVisible()
    await expect(twrBtn).toBeVisible()
  })

  test('el modo Simple está activo por defecto', async ({ tracker }) => {
    await tracker.openInvestment()
    const section = tracker.investmentSection()

    const simpleBtn = section.getByRole('button', { name: 'Simple' })
    const twrBtn = section.getByRole('button', { name: 'TWR' })

    await expect(simpleBtn).toHaveAttribute('aria-pressed', 'true')
    await expect(twrBtn).toHaveAttribute('aria-pressed', 'false')
  })

  test('al activar TWR cambia el botón activo y la etiqueta del KPI', async ({ tracker }) => {
    await tracker.openInvestment()
    const section = tracker.investmentSection()

    const twrBtn = section.getByRole('button', { name: 'TWR' })
    await twrBtn.click()

    // El botón TWR queda activo
    await expect(twrBtn).toHaveAttribute('aria-pressed', 'true')

    // El botón Simple deja de estar activo
    const simpleBtn = section.getByRole('button', { name: 'Simple' })
    await expect(simpleBtn).toHaveAttribute('aria-pressed', 'false')

    // La etiqueta del KPI cambia a "Rentabilidad TWR"
    await expect(section.locator('#inv-return-label')).toHaveText('Rentabilidad TWR')
  })

  test('al volver al modo Simple la etiqueta del KPI restaura el texto original', async ({
    tracker,
  }) => {
    await tracker.openInvestment()
    const section = tracker.investmentSection()

    // Activar TWR
    await section.getByRole('button', { name: 'TWR' }).click()
    await expect(section.locator('#inv-return-label')).toHaveText('Rentabilidad TWR')

    // Volver a Simple
    await section.getByRole('button', { name: 'Simple' }).click()
    await expect(section.locator('#inv-return-label')).toHaveText('Rentabilidad estimada')
    await expect(
      section.locator('#inv-return-label').locator('..').locator('#inv-return'),
    ).toBeVisible()
  })

  test('el modo de rentabilidad se conserva al cambiar entre subtabs de inversión', async ({
    tracker,
  }) => {
    await tracker.openInvestment()
    const section = tracker.investmentSection()

    const twrBtn = section.getByRole('button', { name: 'TWR' })

    // Activar TWR
    await twrBtn.click()
    await expect(twrBtn).toHaveAttribute('aria-pressed', 'true')

    // El selector solo afecta al Resumen, así que vive dentro de esa pestaña.
    await tracker.openInvestmentMovementsTab()
    await expect(twrBtn).toBeHidden()

    // Volver al Resumen y el modo sigue activo
    await tracker.openInvestmentDashboardTab()
    await expect(twrBtn).toHaveAttribute('aria-pressed', 'true')
    await expect(section.locator('#inv-return-label')).toHaveText('Rentabilidad TWR')
  })

  test('TWR usa la liquidez configurada por broker para el valor de cartera', async ({
    tracker,
    page,
  }) => {
    await tracker.setTwrLiquidityAccountEnabled('Trade Republic', false)
    await tracker.setTwrLiquidityAccountEnabled('Trading 212', false)
    await tracker.setTwrLiquidityAccountEnabled('MyInvestor', true)

    await tracker.openInvestment()
    const section = tracker.investmentSection()
    await section.getByRole('button', { name: 'TWR' }).click()

    const expected = await page.evaluate(
      (state) => {
        const round2 = (value: number) => Math.round((value || 0) * 100) / 100
        const slug = (value: string) =>
          String(value || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '')
        const month = Number(
          (document.getElementById('investment-month') as HTMLSelectElement).value || 0,
        )
        const investments = state.investmentAssets || []
        const accounts = state.accounts || []
        const twrIds = new Set((state.twrLiquidityAccountIds || []).map((item) => String(item)))
        const getSnapshotValue = (
          kind: 'accounts' | 'investments',
          targetMonth: number,
          itemId: string,
        ): number | null => {
          const snapshot = state.snapshots?.[String(targetMonth)]
          if (!snapshot || !snapshot[kind]) {
            return null
          }
          const value = snapshot[kind]?.[itemId]
          return Number.isFinite(Number(value)) ? Number(value) : null
        }
        const getLatestSnapshot = (
          kind: 'accounts' | 'investments',
          itemId: string,
          targetMonth: number,
        ) => {
          for (let m = targetMonth; m >= 0; m -= 1) {
            const value = getSnapshotValue(kind, m, itemId)
            if (value !== null) {
              return { month: m, value }
            }
          }
          return null
        }
        const computeAccountBalance = (accountId: string, targetMonth: number): number => {
          const account = accounts.find((item) => item.id === accountId)
          if (!account) return 0
          const latest = getLatestSnapshot('accounts', accountId, targetMonth)
          let startMonth = -1
          let balance = Number(account.openingBalance || 0)
          if (latest) {
            startMonth = latest.month
            balance = latest.value
          }
          for (const tx of state.transactions || []) {
            if (tx.accountId !== accountId) continue
            if (!Number.isFinite(Number(tx.month))) continue
            const txMonth = Number(tx.month)
            if (txMonth <= startMonth || txMonth > targetMonth) continue
            const amount = Number(tx.amount || 0)
            if (tx.type === 'income') balance += amount
            if (tx.type === 'expense' || tx.type === 'investment') balance -= amount
          }
          return round2(balance)
        }
        const computeInvestmentValue = (assetId: string, targetMonth: number): number => {
          const asset = investments.find((item) => item.id === assetId)
          if (!asset) return 0
          const latest = getLatestSnapshot('investments', assetId, targetMonth)
          let startMonth = -1
          let value = Number(asset.openingBalance || 0)
          if (latest) {
            startMonth = latest.month
            value = latest.value
          }
          for (const tx of state.transactions || []) {
            if (tx.type !== 'investment') continue
            const txMonth = Number(tx.month)
            if (txMonth <= startMonth || txMonth > targetMonth) continue
            const category = String(tx.category || '')
            const isSameAsset =
              slug(category) === String(asset.id) ||
              category.toLowerCase() ===
                String((asset as { name?: string }).name || '').toLowerCase()
            if (!isSameAsset) continue
            value += Number(tx.amount || 0)
          }
          return round2(value)
        }
        const investmentValue = round2(
          investments.reduce((sum, asset) => sum + computeInvestmentValue(asset.id, month), 0),
        )
        const liquidityValue = round2(
          accounts
            .filter((account) => twrIds.has(String(account.id)))
            .reduce((sum, account) => sum + computeAccountBalance(account.id, month), 0),
        )
        return round2(investmentValue + liquidityValue)
      },
      await readScenarioState(page),
    )

    const displayed = parseMoney(await section.locator('#inv-total-value').innerText())
    expect(displayed).toBeCloseTo(expected, 2)
  })
})
