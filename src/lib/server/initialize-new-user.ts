import * as accountsRepository from '../../db/repositories/accounts'
import * as userSettingsRepository from '../../db/repositories/user-settings'
import * as syncRepository from '../../db/repositories/sync'
import type { Db } from '../../db/repositories/shared'
import { runWithDb } from '../../db/database'

export const INITIAL_CATEGORIES: Array<{ name: string; kind: string; sortOrder: number }> = [
  { name: 'Nómina', kind: 'income', sortOrder: 0 },
  { name: 'Otros ingresos', kind: 'income', sortOrder: 1 },
  { name: 'Vivienda', kind: 'expense', sortOrder: 0 },
  { name: 'Alimentación', kind: 'expense', sortOrder: 1 },
  { name: 'Transporte', kind: 'expense', sortOrder: 2 },
  { name: 'Suministros', kind: 'expense', sortOrder: 3 },
  { name: 'Salud', kind: 'expense', sortOrder: 4 },
  { name: 'Ocio', kind: 'expense', sortOrder: 5 },
  { name: 'Otros gastos', kind: 'expense', sortOrder: 6 },
  { name: 'Inversión', kind: 'investment', sortOrder: 0 },
]

/** Only for newly created financial users. The caller owns the transaction. */
export async function initializeNewUser(db: Db, userId: string): Promise<void> {
  if (await runWithDb(db, userSettingsRepository.get(userId))) return
  const categories = await accountsRepository.listCategoriesByUser(db, userId)
  await runWithDb(db, userSettingsRepository.create(userId))
  if (categories.length === 0) {
    await accountsRepository.bulkInsertCategories(db, userId, INITIAL_CATEGORIES)
  }
  await syncRepository.ensureRevision(db, userId)
}
