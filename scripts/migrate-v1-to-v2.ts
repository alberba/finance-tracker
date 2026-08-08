#!/usr/bin/env -S node
/**
 * WP9 — legacy v1 JSON → v2 relational migration CLI.
 *
 * Usage (see `pnpm migrate:v1-to-v2 --help`):
 *   pnpm migrate:v1-to-v2 --dry-run
 *   pnpm migrate:v1-to-v2 --v1-sqlite=.data/finance-tracker.sqlite --v2-sqlite=.data/finance-tracker-v2.sqlite
 *   pnpm migrate:v1-to-v2 --v1-remote=finance-tracker-db --remote-sql-out=.data/migrate-v2-remote.sql
 *
 * The actual write target is always a local v2 SQLite staging file
 * (`--v2-sqlite`, default `.data/finance-tracker-v2.sqlite`) — this is what
 * `--dry-run` rolls back against, and what `--remote-sql-out` reads its
 * dump from afterwards (see `scripts/lib/migration-db.ts` for why: no
 * Workers runtime is available from a plain Node script to talk to D1
 * directly, so "remote" support means generating SQL for
 * `wrangler d1 execute --remote --file=...` to apply, exactly like the
 * existing `scripts/export-sqlite-to-d1.mjs` convention).
 */

import { parseArgs } from "node:util";
import { resolve } from "node:path";
import type { DataEncryptionEnv } from "../src/lib/server/crypto/data-encryption";
import { normalizeState } from "../src/scripts/state";
import {
  dumpUserRowsAsSql,
  openLocalV2Db,
  readV1StateFromJsonFile,
  readV1StateFromLocalSqlite,
  readV1StateFromWranglerRemote,
} from "./lib/migration-db";
import { runMigration } from "./lib/migration-runner";

function parseCliArgs(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    options: {
      "v1-sqlite": { type: "string" },
      "v1-json": { type: "string" },
      "v1-remote": { type: "string" },
      "v1-namespace": { type: "string", default: "default" },
      "v2-sqlite": { type: "string", default: ".data/finance-tracker-v2.sqlite" },
      "remote-sql-out": { type: "string" },
      "legacy-owner-email": { type: "string" },
      "report-out": { type: "string" },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  return values;
}

function printHelp(): void {
  console.log(`
Usage: pnpm migrate:v1-to-v2 [options]

Reads legacy v1 state and migrates it into the v2 relational schema,
transactionally and idempotently (safe to re-run).

Options:
  --v1-sqlite=<path>       Local v1 SQLite file (default: .data/finance-tracker.sqlite)
  --v1-json=<path>         Raw v1 state JSON file, instead of a SQLite source
  --v1-remote=<db-name>    Read v1 state via 'wrangler d1 execute <db-name> --remote'
  --v1-namespace=<name>    app_state row id to read, falls back to 'current' (default: default)
  --v2-sqlite=<path>       Local v2 staging SQLite file, the real write target
                           (default: .data/finance-tracker-v2.sqlite)
  --remote-sql-out=<path> After a successful run, dump the migrated rows as SQL
                           for 'wrangler d1 execute finance-tracker-db-v2 --remote --file=...'
  --legacy-owner-email=<e> Reserved legacy-owner user email
                           (default: $LEGACY_OWNER_EMAIL or legacy-owner@finance-tracker.local)
  --report-out=<path>      Write the JSON report to a file instead of stdout
  --dry-run                Run the full migration, then roll back — report only
  --help                   Show this help
`);
}

function resolveEncryptionEnv(): DataEncryptionEnv {
  return {
    DATA_ENCRYPTION_KEY: process.env.DATA_ENCRYPTION_KEY,
    DATA_ENCRYPTION_KEY_PREVIOUS: process.env.DATA_ENCRYPTION_KEY_PREVIOUS,
    DATA_ENCRYPTION_KEY_VERSION: process.env.DATA_ENCRYPTION_KEY_VERSION,
  };
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const namespace = args["v1-namespace"] ?? "default";
  let rawState: unknown;
  if (args["v1-json"]) {
    rawState = readV1StateFromJsonFile(resolve(args["v1-json"]));
  } else if (args["v1-remote"]) {
    rawState = readV1StateFromWranglerRemote(args["v1-remote"], namespace);
  } else {
    const v1Path = resolve(args["v1-sqlite"] ?? ".data/finance-tracker.sqlite");
    rawState = readV1StateFromLocalSqlite(v1Path, namespace);
  }

  const state = normalizeState(rawState);
  const legacyOwnerEmail =
    args["legacy-owner-email"] ?? process.env.LEGACY_OWNER_EMAIL ?? "legacy-owner@finance-tracker.local";

  const v2Path = resolve(args["v2-sqlite"] ?? ".data/finance-tracker-v2.sqlite");
  const { db, sqlite, close } = openLocalV2Db(v2Path);
  try {
    const report = await runMigration(db, state, {
      legacyOwnerEmail,
      dryRun: args["dry-run"],
      dataEncryptionEnv: resolveEncryptionEnv(),
    });

    const output = JSON.stringify(report, null, 2);
    if (args["report-out"]) {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(resolve(args["report-out"]), output, "utf8");
      console.log(`Report written to ${args["report-out"]}`);
    } else {
      console.log(output);
    }

    if (report.anomalies.length > 0) {
      console.warn(`\n${report.anomalies.length} anomaly(ies) — see report.anomalies for details.`);
    }

    if (!args["dry-run"] && args["remote-sql-out"]) {
      dumpUserRowsAsSql(sqlite, report.userId, resolve(args["remote-sql-out"]));
      console.log(`Remote-apply SQL written to ${args["remote-sql-out"]}`);
    }
  } finally {
    close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
