import { test, expect } from './fixtures'

const LEGACY_KEYS = [
  'finance-tracker-state-v1',
  'finance-tracker-server-version-v1',
  'finance-tracker-pending-v1',
  'finance-tracker-state-v1::demo',
  'finance-tracker-server-version-v1::demo',
  'finance-tracker-pending-v1::demo',
]

test('cerrar sesión borra los datos privados locales aunque sync v2 esté apagado @smoke', async ({
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

  await page.evaluate(
    async ({ keys, names }) => {
      keys.forEach((key) => localStorage.setItem(key, 'private'))
      await Promise.all(
        names.map(
          (name) =>
            new Promise<void>((resolve, reject) => {
              const request = indexedDB.open(name)
              request.onsuccess = () => {
                request.result.close()
                resolve()
              }
              request.onerror = () => reject(request.error)
            }),
        ),
      )
    },
    { keys: LEGACY_KEYS, names: databaseNames },
  )

  await page.route('**/cdn-cgi/access/logout', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<main>Sesión cerrada</main>' }),
  )

  await tracker.logout()
  await expect(page).toHaveURL(/\/cdn-cgi\/access\/logout$/)

  const remaining = await page.evaluate(
    async ({ keys, names }) => ({
      legacy: keys.filter((key) => localStorage.getItem(key) !== null),
      indexedDb: (await indexedDB.databases())
        .map((database) => database.name)
        .filter((name): name is string => typeof name === 'string')
        .filter((name) => names.includes(name)),
    }),
    { keys: LEGACY_KEYS, names: databaseNames },
  )

  expect(remaining).toEqual({ legacy: [], indexedDb: [] })
})
