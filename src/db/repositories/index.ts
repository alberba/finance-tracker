/**
 * Barrel re-exporting every v2 repository module as a namespace, so callers
 * (WP4 routes, WP9 migration tool) can do
 * `import { accountsRepository } from "src/db/repositories"` without
 * memorizing per-file paths. Each module is also importable directly.
 */

export * as usersRepository from "./users";
export * as userSettingsRepository from "./user-settings";
export * as accountsRepository from "./accounts";
export * as transactionsRepository from "./transactions";
export * as subscriptionsRepository from "./subscriptions";
export * as recurringRulesRepository from "./recurring-rules";
export * as pendingMovementsRepository from "./pending-movements";
export * as budgetEntriesRepository from "./budget-entries";
export * as goalsRepository from "./goals";
export * as wealthRepository from "./wealth";
export * as contributionsRepository from "./contributions";
export * as marketRepository from "./market";
export * as integrationCredentialsRepository from "./integration-credentials";
export * as stockeventsSymbolMappingsRepository from "./stockevents-symbol-mappings";
export * as syncRepository from "./sync";
export * as auditEventsRepository from "./audit-events";
