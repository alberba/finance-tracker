/**
 * Email casing must never decide whether an identity resolves.
 *
 * `users.email` is a plain `text ... unique` column and SQLite compares text
 * case-sensitively, so before normalization `Owner@Example.com` and
 * `owner@example.com` were two distinct rows and two distinct lookups. The
 * cutover feeds the same address in from three unrelated places — WP9's
 * `--legacy-owner-email` flag, the `LEGACY_OWNER_EMAIL` variable and the
 * Cf-Access JWT's `email` claim (GitHub, in this deployment) — and nothing
 * guarantees they agree on casing.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDatabase } from "../setup";
import * as usersRepository from "../../../../src/db/repositories/users";
import { findLegacyOwnerToLink } from "../../../../src/lib/server/auth/legacy-owner-link";

describe("email casing", () => {
  let testDb: TestDatabase;
  let db: TestDatabase["db"];

  beforeEach(() => {
    testDb = createTestDb();
    db = testDb.db;
  });

  afterEach(() => {
    testDb.close();
  });

  it("stores users.email normalized", async () => {
    const user = await usersRepository.create(db, {
      email: "  Owner@Example.COM ",
    });
    expect(user.email).toBe("owner@example.com");
  });

  it("finds a user regardless of the casing used to look it up", async () => {
    await usersRepository.create(db, { email: "owner@example.com" });

    for (const variant of [
      "owner@example.com",
      "Owner@Example.com",
      "OWNER@EXAMPLE.COM",
      "  owner@example.com  ",
    ]) {
      const found = await usersRepository.getByEmail(db, variant);
      expect(found, `lookup failed for ${JSON.stringify(variant)}`).toBeDefined();
      expect(found?.email).toBe("owner@example.com");
    }
  });

  it("links the legacy owner when the JWT claim and LEGACY_OWNER_EMAIL differ in case", async () => {
    // What WP9's migration provisions.
    const reserved = await usersRepository.create(db, {
      email: "Owner@Example.com",
      displayName: "Legacy Owner",
      isLegacyOwner: true,
    });

    // What the JWT carries vs. what the environment variable says.
    const linked = await findLegacyOwnerToLink(db, {
      email: "OWNER@example.com",
      legacyOwnerEmail: "owner@EXAMPLE.com",
    });

    expect(linked).not.toBeNull();
    expect(linked?.userId).toBe(reserved.id);
  });

  it("still refuses to link a different address", async () => {
    await usersRepository.create(db, {
      email: "owner@example.com",
      isLegacyOwner: true,
    });

    const linked = await findLegacyOwnerToLink(db, {
      email: "someone-else@example.com",
      legacyOwnerEmail: "owner@example.com",
    });

    expect(linked).toBeNull();
  });
});
