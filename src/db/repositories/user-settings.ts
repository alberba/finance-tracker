/** `user_settings` repository (WP6) — one row per user, currency/locale/theme prefs. */

import type { DashboardLayoutPreference } from '../../lib/dashboard-layout'

import { and, eq } from 'drizzle-orm'
import { lift } from '../database'
import { userSettings } from '../schema'
import { type Db, nowIso, versionGuard } from './shared'

export type UserSettingsRow = typeof userSettings.$inferSelect

export interface CreateUserSettingsInput {
  currency?: string
  locale?: string | null
  theme?: string | null
  dashboardLayout?: DashboardLayoutPreference | null
  onboardingPresented?: boolean
  onboardingDismissed?: boolean
  onboardingCompleted?: boolean
  onboardingStep?: number
  tourDesktopSeen?: boolean
  tourMobileSeen?: boolean
  stockeventsEnabled?: boolean
  stockeventsTradesToCash?: boolean
}

export interface UpdateUserSettingsInput {
  currency?: string
  locale?: string | null
  theme?: string | null
  dashboardLayout?: DashboardLayoutPreference | null
  onboardingPresented?: boolean
  onboardingDismissed?: boolean
  onboardingCompleted?: boolean
  onboardingStep?: number
  tourDesktopSeen?: boolean
  tourMobileSeen?: boolean
  stockeventsEnabled?: boolean
  stockeventsTradesToCash?: boolean
}

async function getSql(db: Db, userId: string): Promise<UserSettingsRow | undefined> {
  const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, userId))
  return row
}

async function createSql(
  db: Db,
  userId: string,
  input: CreateUserSettingsInput = {},
): Promise<UserSettingsRow> {
  const now = nowIso()
  const [row] = await db
    .insert(userSettings)
    .values({
      userId,
      currency: input.currency ?? 'EUR',
      locale: input.locale ?? null,
      theme: input.theme ?? null,
      dashboardLayout: input.dashboardLayout ?? null,
      onboardingPresented: input.onboardingPresented ? 1 : 0,
      onboardingDismissed: input.onboardingDismissed ? 1 : 0,
      onboardingCompleted: input.onboardingCompleted ? 1 : 0,
      onboardingStep: input.onboardingStep ?? 0,
      tourDesktopSeen: input.tourDesktopSeen ? 1 : 0,
      tourMobileSeen: input.tourMobileSeen ? 1 : 0,
      stockeventsEnabled: input.stockeventsEnabled ? 1 : 0,
      stockeventsTradesToCash: input.stockeventsTradesToCash ? 1 : 0,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
  return row
}

async function updateSql(
  db: Db,
  userId: string,
  input: UpdateUserSettingsInput,
  expectedVersion?: number,
): Promise<UserSettingsRow | undefined> {
  const existing = await getSql(db, userId)
  if (!existing) {
    return undefined
  }
  const [row] = await db
    .update(userSettings)
    .set({
      currency: input.currency ?? existing.currency,
      locale: input.locale === undefined ? existing.locale : input.locale,
      theme: input.theme === undefined ? existing.theme : input.theme,
      dashboardLayout:
        input.dashboardLayout === undefined ? existing.dashboardLayout : input.dashboardLayout,
      stockeventsEnabled:
        input.stockeventsEnabled === undefined
          ? existing.stockeventsEnabled
          : input.stockeventsEnabled
            ? 1
            : 0,
      stockeventsTradesToCash:
        input.stockeventsTradesToCash === undefined
          ? existing.stockeventsTradesToCash
          : input.stockeventsTradesToCash
            ? 1
            : 0,
      onboardingPresented:
        input.onboardingPresented === undefined
          ? existing.onboardingPresented
          : input.onboardingPresented
            ? 1
            : 0,
      onboardingDismissed:
        input.onboardingDismissed === undefined
          ? existing.onboardingDismissed
          : input.onboardingDismissed
            ? 1
            : 0,
      onboardingCompleted:
        input.onboardingCompleted === undefined
          ? existing.onboardingCompleted
          : input.onboardingCompleted
            ? 1
            : 0,
      onboardingStep: input.onboardingStep ?? existing.onboardingStep,
      tourDesktopSeen:
        input.tourDesktopSeen === undefined
          ? existing.tourDesktopSeen
          : input.tourDesktopSeen
            ? 1
            : 0,
      tourMobileSeen:
        input.tourMobileSeen === undefined
          ? existing.tourMobileSeen
          : input.tourMobileSeen
            ? 1
            : 0,
      updatedAt: nowIso(),
      version: existing.version + 1,
    })
    .where(
      and(
        eq(userSettings.id, existing.id),
        eq(userSettings.userId, userId),
        versionGuard(userSettings.version, expectedVersion),
      ),
    )
    .returning()
  return row
}

async function removeSql(db: Db, userId: string, expectedVersion?: number): Promise<boolean> {
  const existing = await getSql(db, userId)
  if (!existing) {
    return false
  }
  const deleted = await db
    .delete(userSettings)
    .where(
      and(
        eq(userSettings.id, existing.id),
        eq(userSettings.userId, userId),
        versionGuard(userSettings.version, expectedVersion),
      ),
    )
    .returning({ id: userSettings.id })
  return deleted.length > 0
}

export const get = lift(getSql)
export const create = lift(createSql)
export const update = lift(updateSql)
export const remove = lift(removeSql)
