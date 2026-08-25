#!/usr/bin/env -S node
/**
 * WP9 — parity validator.
 *
 * Independently recomputes counts, monthly totals by type, wealth per
 * snapshot, and budget/goal totals from both the v1 source and the v2
 * database, and diffs them. Exit code 0 + "zero discrepancies" means the
 * migration is verified; exit code 1 otherwise (with every discrepancy
 * listed).
 */

import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { usersRepository } from "../src/db/repositories";
import { openLocalV2Db, readV1StateFromJsonFile, readV1StateFromLocalSqlite } from "./lib/migration-db";
import { computeV1Parity, diffParity } from "./lib/migration-parity";
import { computeV2Parity } from "./lib/migration-v2-read";
import { normalizeState } from "../src/scripts/state";

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      "v1-sqlite": { type: "string" },
      "v1-json": { type: "string" },
      "v1-namespace": { type: "string", default: "default" },
      "v2-sqlite": { type: "string", default: ".data/finance-tracker-v2.sqlite" },
      email: { type: "string" },
      "user-id": { type: "string" },
    },
  });

  const rawState = values["v1-json"]
    ? readV1StateFromJsonFile(resolve(values["v1-json"]))
    : readV1StateFromLocalSqlite(resolve(values["v1-sqlite"] ?? ".data/finance-tracker.sqlite"), values["v1-namespace"]);
  const state = normalizeState(rawState);

  const v2Path = resolve(values["v2-sqlite"] ?? ".data/finance-tracker-v2.sqlite");
  const { db, close } = openLocalV2Db(v2Path);
  try {
    let userId = values["user-id"];
    if (!userId) {
      const email = values.email ?? process.env.LEGACY_OWNER_EMAIL ?? "legacy-owner@finance-tracker.local";
      const user = await usersRepository.getByEmail(db, email);
      if (!user) {
        throw new Error(`No user found for email '${email}'. Pass --user-id or --email explicitly.`);
      }
      userId = user.id;
    }

    const v1Parity = computeV1Parity(state);
    const v2Parity = await computeV2Parity(db, userId, state.year);
    const discrepancies = diffParity(v1Parity, v2Parity);

    if (discrepancies.length === 0) {
      console.log(`Parity OK — zero discrepancies for user ${userId}, year ${state.year}.`);
      return;
    }

    console.error(`${discrepancies.length} discrepancy(ies) found:\n`);
    for (const d of discrepancies) {
      console.error(`  ${d.path}: v1=${JSON.stringify(d.v1Value)} v2=${JSON.stringify(d.v2Value)}`);
    }
    process.exitCode = 1;
  } finally {
    close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
