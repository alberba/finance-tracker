/**
 * Barrel re-exporting every v2 table, for `drizzle.config.ts` and
 * `src/db/client.ts`. Table modules are split per domain area (see
 * `docs/migration/work-packages.md`, WP1) instead of one giant file.
 */

export * from './users'
export * from './accounts'
export * from './transactions'
export * from './recurring'
export * from './budget'
export * from './wealth'
export * from './market'
export * from './integrations'
export * from './sync'

export * from './authentication'
