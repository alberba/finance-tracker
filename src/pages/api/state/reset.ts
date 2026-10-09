/**
 * `POST /api/state/reset` (WP4) — new v2 semantics per the work-package
 * spec: this used to reset the whole `x-finance-namespace`-selected
 * `app_state` blob (`src/lib/server/d1-state.ts`, still used by the legacy
 * `src/pages/api/state.ts` until cutover). Now it wipes only the
 * authenticated user's own private rows across every v2 table (per-user
 * "empezar de cero", not a namespace-wide blob reset) and re-seeds the
 * same defaults as `POST /api/state/initialize`.
 *
 * `integration_credentials` is deliberately left untouched (WP12 owns that
 * table's lifecycle; a reset should not silently revoke a configured
 * integration).
 */

import type { APIRoute } from "astro";
import { getDb } from "../../../db/client";
import * as accountsRepository from "../../../db/repositories/accounts";
import * as userSettingsRepository from "../../../db/repositories/user-settings";
import * as syncRepository from "../../../db/repositories/sync";
import { jsonResponse, requirePrincipal, withApiErrorHandling } from "../../../lib/server/api-auth";
import { runInTransaction } from "../../../db/repositories/shared";
import { wipeUserData } from "../../../lib/server/wipe-user-data";

const DEFAULT_CATEGORIES: Array<{ name: string; kind: string; sortOrder: number }> = [
  { name: "Ingresos", kind: "income", sortOrder: 0 },
  { name: "Gastos generales", kind: "expense", sortOrder: 0 },
];

export const POST: APIRoute = async ({ locals }) =>
  withApiErrorHandling("/api/state/reset", async () => {
    const principal = requirePrincipal(locals);
    const db = getDb(locals);
    const userId = principal.userId;

    const result = await runInTransaction(db, async (tx) => {
      await wipeUserData(tx, userId);
      const settings = await userSettingsRepository.create(tx, userId, { currency: "EUR" });
      const categories = await accountsRepository.bulkInsertCategories(tx, userId, DEFAULT_CATEGORIES);
      await syncRepository.ensureRevision(tx, userId);
      return { settings, categories };
    });

    return jsonResponse({ ok: true, ...result }, 200);
  });
