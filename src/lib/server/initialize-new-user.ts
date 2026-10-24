import { Effect } from 'effect'
import * as accountsRepository from '../../db/repositories/accounts'
import * as userSettingsRepository from '../../db/repositories/user-settings'
import * as syncRepository from '../../db/repositories/sync'
import type { Database, DatabaseError } from '../../db/database'

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
export function initializeNewUser(userId: string): Effect.Effect<void, DatabaseError, Database> {
  return Effect.gen(function* () {
    if (yield* userSettingsRepository.get(userId)) return
    const categories = yield* accountsRepository.listCategoriesByUser(userId)
    yield* userSettingsRepository.create(userId)
    if (categories.length === 0) {
      yield* accountsRepository.bulkInsertCategories(userId, INITIAL_CATEGORIES)
    }
    yield* syncRepository.ensureRevision(userId)
  })
}
