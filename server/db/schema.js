import {
  mysqlTable,
  varchar,
  text,
  int,
  boolean,
  timestamp,
  index,
  uniqueIndex,
  primaryKey,
  bigint,
} from 'drizzle-orm/mysql-core'

export const STATUS = Object.freeze({
  deleted: 0,
  normal: 1,
})

const ts = (name) => timestamp(name).notNull().defaultNow()
const tsNullable = (name) => timestamp(name)

export const settings = mysqlTable('settings', {
  key: varchar('key', { length: 64 }).primaryKey(),
  value: text('value').notNull(),
  updatedAt: ts('updated_at').$onUpdateFn(() => new Date()),
})

export const auditLogs = mysqlTable('audit_logs', {
  id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
  actorUserId: int('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  actorUsername: varchar('actor_username', { length: 64 }),
  action: varchar('action', { length: 80 }).notNull(),
  targetType: varchar('target_type', { length: 64 }),
  targetId: varchar('target_id', { length: 128 }),
  ip: varchar('ip', { length: 64 }),
  userAgent: varchar('user_agent', { length: 512 }),
  metadata: text('metadata'),
  createdAt: ts('created_at'),
}, (t) => [
  index('idx_audit_logs_actor').on(t.actorUserId),
  index('idx_audit_logs_action').on(t.action),
  index('idx_audit_logs_created').on(t.createdAt),
])

export const users = mysqlTable('users', {
  id: int('id').primaryKey().autoincrement(),
  username: varchar('username', { length: 32 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: varchar('role', { length: 32 }).notNull().default('user'),
  status: int('status').notNull().default(STATUS.normal),
  createdAt: ts('created_at'),
  updatedAt: ts('updated_at').$onUpdateFn(() => new Date()),
})

export const sessions = mysqlTable('sessions', {
  id: int('id').primaryKey().autoincrement(),
  userId: int('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: varchar('token', { length: 128 }).notNull().unique(),
  ip: varchar('ip', { length: 64 }),
  userAgent: varchar('user_agent', { length: 512 }),
  expiresAt: timestamp('expires_at').notNull(),
  lastActivityAt: ts('last_activity_at').$onUpdateFn(() => new Date()),
  createdAt: ts('created_at'),
}, (t) => [
  index('idx_sessions_user').on(t.userId),
  index('idx_sessions_expires').on(t.expiresAt),
])

export const rooms = mysqlTable('rooms', {
  id: int('id').primaryKey().autoincrement(),
  code: varchar('code', { length: 16 }).notNull().unique(),
  hostUserId: int('host_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  romId: int('rom_id').notNull().references(() => roms.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 60 }).notNull(),
  isPublic: boolean('is_public').notNull().default(true),
  allowPlay: boolean('allow_play').notNull().default(true),
  passwordHash: varchar('password_hash', { length: 255 }),
  status: int('status').notNull().default(STATUS.normal),
  createdAt: ts('created_at'),
  updatedAt: ts('updated_at').$onUpdateFn(() => new Date()),
  closedAt: tsNullable('closed_at'),
})

export const roms = mysqlTable('roms', {
  id: int('id').primaryKey().autoincrement(),
  userId: int('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 128 }).notNull(),
  platform: varchar('platform', { length: 32 }).notNull(),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  filePath: varchar('file_path', { length: 1024 }).notNull(),
  fileSize: int('file_size').notNull(),
  isPublic: boolean('is_public').notNull().default(false),
  maxPlayers: int('max_players'),
  // Optional parent ROM — for arcade clone/variant sets where the child depends
  // on shared data from the parent (e.g. kof97pls is a split clone of kof97).
  // Children are hidden from the main Gallery list and shown as a version
  // picker on the parent's detail. `null` = this ROM is a top-level game.
  parentRomId: int('parent_rom_id'),
  versionLabel: varchar('version_label', { length: 64 }),
  status: int('status').notNull().default(STATUS.normal),
  createdAt: ts('created_at'),
  updatedAt: ts('updated_at').$onUpdateFn(() => new Date()),
}, (t) => [
  index('idx_roms_parent').on(t.parentRomId),
])

export const favorites = mysqlTable('favorites', {
  userId: int('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  romId: int('rom_id').notNull().references(() => roms.id, { onDelete: 'cascade' }),
  createdAt: ts('created_at'),
}, (t) => [
  primaryKey({ columns: [t.userId, t.romId] }),
  index('idx_favorites_user').on(t.userId),
  index('idx_favorites_rom').on(t.romId),
])

export const saveStates = mysqlTable('save_states', {
  id: int('id').primaryKey().autoincrement(),
  userId: int('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  romId: int('rom_id').notNull().references(() => roms.id, { onDelete: 'cascade' }),
  slot: int('slot').notNull().default(0),
  filePath: varchar('file_path', { length: 1024 }).notNull(),
  fileSize: int('file_size').notNull(),
  status: int('status').notNull().default(STATUS.normal),
  updatedAt: ts('updated_at').$onUpdateFn(() => new Date()),
}, (t) => [
  uniqueIndex('idx_save_states_unique_slot').on(t.userId, t.romId, t.slot),
])
