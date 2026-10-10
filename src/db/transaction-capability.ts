/** Optional interactive capability supplied by a backend, independent of Drizzle handles. */
export const interactiveTransaction = Symbol('interactiveTransaction')

export interface TransactionBinding {
  [interactiveTransaction]?: <T>(fn: () => Promise<T>) => Promise<T>
}
