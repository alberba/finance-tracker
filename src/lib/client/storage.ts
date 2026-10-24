/**
 * Local storage of the client as a service (ADR-0006).
 *
 * The per-user runtime opens the IndexedDB cache and the outbox once and keeps
 * them for the page's lifetime; `idb-cache.ts` and `outbox.ts` receive those
 * handles through this service instead of taking an `IDBDatabase` parameter.
 * A storage failure is a typed `ClientStorageError`, so a caller can tell a
 * full/blocked database apart from a rejected command.
 */

import { Context, Data, Effect } from 'effect'

export class ClientStorageError extends Data.TaggedError('ClientStorageError')<{
  readonly cause: unknown
  readonly message: string
}> {}

export interface ClientStorageHandles {
  readonly cache: IDBDatabase
  readonly outbox: IDBDatabase
}

export class ClientStorage extends Context.Service<ClientStorage, ClientStorageHandles>()(
  'finance/client/ClientStorage',
) {}

export const storageError = (cause: unknown, message: string): ClientStorageError =>
  new ClientStorageError({
    cause,
    // Keep the browser's own explanation ("otra pestaña mantiene abierta…")
    // when there is one; the generic text is only the fallback.
    message: cause instanceof Error && cause.message ? cause.message : message,
  })

/** Runs one IndexedDB operation, typing any failure as a `ClientStorageError`. */
export const attemptStorage = <A>(
  message: string,
  run: () => Promise<A>,
): Effect.Effect<A, ClientStorageError> =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => storageError(cause, message),
  })
