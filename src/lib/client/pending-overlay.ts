/**
 * Overlays the commands still waiting in the outbox onto the read model
 * (audit §5.4).
 *
 * Under v2 the edited state lives only in Pinia memory: reloading the page
 * rebuilds the UI from the server's rows, so anything queued-but-unsent
 * disappears from view even though it is safely stored and will be sent. To
 * the user that is indistinguishable from data loss — and it is the other
 * half of "the app says it saved and then it isn't there".
 *
 * Applying the queue on top of the bootstrap makes what you see match what
 * you did: a `create` shows up as a row, an `update` as a patched row, a
 * `remove` as a missing one — all of it disappearing on its own once the
 * server confirms and the real rows arrive.
 */

import type { SyncCommandInput, SyncEntityType } from "../server/sync/command-schemas";
import type { CachedEntity } from "./idb-cache";
import type { SyncV2Bootstrap } from "./v2-state-projection";

const COLLECTION_BY_ENTITY: Record<SyncEntityType, keyof SyncV2Bootstrap> = {
  account: "accounts",
  category: "categories",
  transaction: "transactions",
  subscription: "subscriptions",
  recurringRule: "recurringRules",
  pendingMovement: "pendingMovements",
  budgetEntry: "budgetEntries",
  goal: "goals",
  contribution: "contributions",
  userInstrument: "userInstruments",
  wealthSnapshot: "wealthSnapshots",
  stockeventsMapping: "stockeventsSymbolMappings",
  stockeventsCashEntry: "stockeventsCashSyncEntries",
};

function matches(entity: CachedEntity, reference: string): boolean {
  return entity.id === reference || entity.legacyId === reference;
}

/**
 * Returns a copy of `bootstrap` with every pending command applied in queue
 * order. Never mutates its arguments; unknown command shapes are skipped.
 */
export function applyPendingCommands(
  bootstrap: SyncV2Bootstrap,
  commands: SyncCommandInput[],
): SyncV2Bootstrap {
  const next: SyncV2Bootstrap = { ...bootstrap };

  for (const command of commands) {
    if (command.action === "settingsUpdate") {
      const patch = command.patch as Record<string, unknown>;
      const settings = { ...((next.settings as Record<string, unknown> | null) ?? {}) };
      for (const [key, value] of Object.entries(patch)) {
        if (key === "stockeventsEnabled") {
          settings["stockeventsEnabled"] = value === true ? 1 : 0;
        } else if (key === "stockeventsCashMappings") {
          settings["stockeventsCashMappings"] = value;
        } else if (key === "twrLiquidityAccountIds") {
          settings["twrLiquidityAccountIds"] = value;
        } else {
          settings[key] = value;
        }
      }
      next.settings = settings as SyncV2Bootstrap["settings"];
      continue;
    }
    if (!("entityType" in command)) {
      continue;
    }
    const collection = COLLECTION_BY_ENTITY[command.entityType as SyncEntityType];
    if (!collection) {
      continue;
    }
    const rows = ((next[collection] as CachedEntity[] | undefined) ?? []).slice();

    if (command.action === "create") {
      const data = command.data as Record<string, unknown>;
      // An entity created from now on carries its own identity (ADR 0001),
      // so the queued row is addressed by `data.id` — the same id the server
      // will store it under.
      const id = String(data.id ?? "");
      // A create whose row already arrived from the server is not re-added:
      // the server's version is the better one.
      if (!id || !rows.some((row) => matches(row, id))) {
        rows.push({ ...data, id } as CachedEntity);
      }
    } else if (command.action === "update") {
      const index = rows.findIndex((row) => matches(row, String(command.entityId)));
      if (index >= 0) {
        rows[index] = { ...rows[index], ...(command.patch as Record<string, unknown>) };
      }
    } else if (command.action === "remove") {
      const index = rows.findIndex((row) => matches(row, String(command.entityId)));
      if (index >= 0) {
        rows.splice(index, 1);
      }
    } else {
      continue;
    }

    (next as unknown as Record<string, unknown>)[collection] = rows;
  }

  return next;
}
