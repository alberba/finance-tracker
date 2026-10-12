import { test, expect } from './fixtures'

test('cerrar sesión borra los datos privados locales de sync v2 @smoke', async ({
  page,
  tracker,
}) => {
  const userId = await page.evaluate(async () => {
    const response = await fetch('/api/session')
    const body = (await response.json()) as { user: { id: string } }
    return body.user.id
  })

  const databaseNames = [
    `finance-tracker-cache-v2:${userId}`,
    `finance-tracker-outbox-v2:${userId}`,
    `finance-tracker-keys-v2:${userId}`,
  ]

  await tracker.addAccount({ name: 'Cuenta privada de sesión', openingBalance: 42 })
  await tracker.waitForSync()
  const cachedDatabases = await page.evaluate(() =>
    indexedDB
      .databases()
      .then((databases) => databases.map((database) => database.name).filter(Boolean)),
  )
  expect(cachedDatabases).toContain(`finance-tracker-cache-v2:${userId}`)

  await tracker.logout()
  await expect(page).toHaveURL(/\/login$/)

  const remaining = await page.evaluate(
    async (names) =>
      (await indexedDB.databases())
        .map((database) => database.name)
        .filter((name): name is string => typeof name === 'string')
        .filter((name) => names.includes(name)),
    databaseNames,
  )

  expect(remaining).toEqual([])
})
