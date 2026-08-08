/** `user_settings` repository (WP6) — one row per user, currency/locale/theme prefs. */

import { and, eq } from "drizzle-orm";
import { userSettings } from "../schema";
import { nowIso, type Db } from "./shared";

export type UserSettingsRow = typeof userSettings.$inferSelect;

export interface CreateUserSettingsInput {
  currency?: string;
  locale?: string | null;
  theme?: string | null;
}

export interface UpdateUserSettingsInput {
  currency?: string;
  locale?: string | null;
  theme?: string | null;
}

export async function get(db: Db, userId: string): Promise<UserSettingsRow | undefined> {
  const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  return row;
}

export async function create(
  db: Db,
  userId: string,
  input: CreateUserSettingsInput = {},
): Promise<UserSettingsRow> {
  const now = nowIso();
  const [row] = await db
    .insert(userSettings)
    .values({
      userId,
      currency: input.currency ?? "EUR",
      locale: input.locale ?? null,
      theme: input.theme ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return row;
}

export async function update(
  db: Db,
  userId: string,
  input: UpdateUserSettingsInput,
): Promise<UserSettingsRow | undefined> {
  const existing = await get(db, userId);
  if (!existing) {
    return undefined;
  }
  const [row] = await db
    .update(userSettings)
    .set({
      currency: input.currency ?? existing.currency,
      locale: input.locale === undefined ? existing.locale : input.locale,
      theme: input.theme === undefined ? existing.theme : input.theme,
      updatedAt: nowIso(),
      version: existing.version + 1,
    })
    .where(and(eq(userSettings.id, existing.id), eq(userSettings.userId, userId)))
    .returning();
  return row;
}

export async function remove(db: Db, userId: string): Promise<boolean> {
  const existing = await get(db, userId);
  if (!existing) {
    return false;
  }
  await db.delete(userSettings).where(and(eq(userSettings.id, existing.id), eq(userSettings.userId, userId)));
  return true;
}
