/**
 * Identity the client mints for a new entity (ADR 0001).
 *
 * Its own `id` — the entity's primary key in D1 too — so nothing correlates
 * the local row with the server one afterwards. Web Crypto's `randomUUID` is
 * present in every browser the app targets; the fallback only keeps an
 * absent implementation from throwing on the way to a `create`, the same
 * defensive shape `generateCommandId` (`./outbox.ts`) uses for command ids.
 */
export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
