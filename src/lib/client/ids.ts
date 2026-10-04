/**
 * Identity the client mints for a new entity (ADR 0001).
 *
 * Its own `id` — the entity's primary key in D1 too — so nothing correlates
 * the local row with the server one afterwards. Web Crypto's `randomUUID` is
 * present in every browser the app targets and in Node, which runs the tests.
 */
export function newId(): string {
  return crypto.randomUUID();
}
