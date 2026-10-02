/**
 * One-time legacy-owner linking (WP3).
 *
 * WP9's migration tool creates a single reserved `users` row
 * (`is_legacy_owner = 1`) that owns every pre-auth v1 record. That row has
 * no `user_identities` rows yet. The *first* real authenticated access whose
 * verified email matches `LEGACY_OWNER_EMAIL` should attach its identity to
 * that reserved user instead of provisioning a brand-new one.
 *
 * This lookup must run inside the same transaction as the identity insert
 * in `principal.ts`, and only when no `user_identities` row already exists
 * for the `(provider, subject)` pair — `principal.ts`'s identity lookup
 * short-circuits before this ever runs again, which is what makes repeat
 * logins after linking a no-op.
 */

import { and, eq } from "drizzle-orm";
import { users } from "../../../db/schema";
import { normalizeEmail } from "../../../db/repositories/shared";
import type { Queryable } from "./principal";

export interface LegacyOwnerLinkResult {
  userId: string;
  email: string;
}

export interface LegacyOwnerLinkInput {
  /** Verified email claim from the incoming Cf-Access JWT, if present. */
  email?: string | null;
  /** `LEGACY_OWNER_EMAIL` from `RuntimeEnv`, if configured. */
  legacyOwnerEmail?: string | null;
}

/**
 * Returns the reserved legacy-owner user to link to, or `null` when linking
 * doesn't apply (no email match, no `LEGACY_OWNER_EMAIL` configured, or the
 * reserved row hasn't been created yet by WP9 — e.g. in dev/test).
 *
 * Callers must run this against the same transaction handle (`tx`) used for
 * the subsequent identity insert.
 */
export async function findLegacyOwnerToLink(
  tx: Queryable,
  input: LegacyOwnerLinkInput,
): Promise<LegacyOwnerLinkResult | null> {
  const { email, legacyOwnerEmail } = input;
  if (!email || !legacyOwnerEmail) {
    return null;
  }
  const normalizedOwnerEmail = normalizeEmail(legacyOwnerEmail);
  if (normalizeEmail(email) !== normalizedOwnerEmail) {
    return null;
  }

  // Match the reserved row on the *normalized* address. The guard above is
  // case-insensitive, so looking the row up with the raw `LEGACY_OWNER_EMAIL`
  // meant a casing difference between that variable and the value WP9's
  // migration stored found nothing, returned null, and silently skipped the
  // link — leaving the owner staring at an empty app after cutover while
  // their v1 data sat under an unreachable reserved user.
  const rows = await tx
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(and(eq(users.isLegacyOwner, 1), eq(users.email, normalizedOwnerEmail)))
    .limit(1);

  const reserved = rows[0];
  if (!reserved) {
    return null;
  }
  return { userId: reserved.id, email: reserved.email };
}
