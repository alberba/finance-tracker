import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const authUser = sqliteTable('auth_user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull(),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  invitationId: text('invitation_id'),
})

export const authSession = sqliteTable(
  'auth_session',
  {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('auth_session_user_idx').on(table.userId),
    index('auth_session_expiry_idx').on(table.expiresAt),
  ],
)

export const authAccount = sqliteTable(
  'auth_account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
    scope: text('scope'),
    password: text('password'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('auth_account_provider_identity_idx').on(table.providerId, table.accountId),
    index('auth_account_user_idx').on(table.userId),
  ],
)

export const authVerification = sqliteTable(
  'auth_verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('auth_verification_identifier_idx').on(table.identifier)],
)

export const authPasskey = sqliteTable(
  'auth_passkey',
  {
    id: text('id').primaryKey(),
    name: text('name'),
    publicKey: text('public_key').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    credentialID: text('credential_id').notNull().unique(),
    counter: integer('counter').notNull(),
    deviceType: text('device_type').notNull(),
    backedUp: integer('backed_up', { mode: 'boolean' }).notNull(),
    transports: text('transports'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }),
    aaguid: text('aaguid'),
  },
  (table) => [index('auth_passkey_user_idx').on(table.userId)],
)

export const authRateLimit = sqliteTable('auth_rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: integer('last_request').notNull(),
})

export const authInvitation = sqliteTable('auth_invitation', {
  id: text('id').primaryKey(),
  tokenHash: text('token_hash').notNull().unique(),
  maxUses: integer('max_uses').notNull(),
  uses: integer('uses').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  revoked: integer('revoked', { mode: 'boolean' }).notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

export const authAdmission = sqliteTable('auth_admission', {
  userId: text('user_id')
    .primaryKey()
    .notNull()
    .references(() => authUser.id, { onDelete: 'cascade' }),
  invitationId: text('invitation_id'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

export const authRole = sqliteTable('auth_role', {
  userId: text('user_id')
    .primaryKey()
    .notNull()
    .references(() => authUser.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
})

export const authPolicy = sqliteTable('auth_policy', {
  id: text('id').primaryKey(),
  publicRegistration: integer('public_registration', { mode: 'boolean' }).notNull(),
})

export const authProof = sqliteTable(
  'auth_proof',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    sessionId: text('session_id')
      .notNull()
      .references(() => authSession.id, { onDelete: 'cascade' }),
    purpose: text('purpose').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('auth_proof_expiry_idx').on(table.expiresAt)],
)
