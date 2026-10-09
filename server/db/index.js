import mysql from 'mysql2/promise'
import { drizzle } from 'drizzle-orm/mysql2'
import { migrate } from 'drizzle-orm/mysql2/migrator'
import { sql } from 'drizzle-orm'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import bcrypt from 'bcryptjs'
import * as schema from './schema.js'
import { users } from './schema.js'

const DATABASE_URL = process.env.DATABASE_URL || 'mysql://games:games@127.0.0.1:3306/games_online'

export const pool = mysql.createPool(DATABASE_URL)
export const db = drizzle(pool, { schema, mode: 'default', casing: 'snake_case' })

const MIGRATIONS_FOLDER = resolve(import.meta.dirname || './server/db', 'migrations')

export async function runMigrations() {
  if (existsSync(MIGRATIONS_FOLDER)) {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
  }
  await cleanupDuplicateSaveStates()
  await seedAdminUser()
}

export async function insertAndFetch(table, values, where) {
  await db.insert(table).values(values)
  const [row] = await db.select().from(table).where(where).limit(1)
  return row
}

export async function updateAndFetch(table, values, where) {
  await db.update(table).set(values).where(where)
  const [row] = await db.select().from(table).where(where).limit(1)
  return row
}

async function cleanupDuplicateSaveStates() {
  await db.execute(sql`
    DELETE s1
    FROM save_states s1
    INNER JOIN save_states s2
      ON s1.user_id = s2.user_id
     AND s1.rom_id = s2.rom_id
     AND s1.slot = s2.slot
     AND s1.id < s2.id
  `)
}

const MIN_ADMIN_PASSWORD_LENGTH = 6

function requireInitialAdminPassword() {
  const password = process.env.ADMIN_PASSWORD
  if (password && password.length >= MIN_ADMIN_PASSWORD_LENGTH) return password
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`ADMIN_PASSWORD must be set to at least ${MIN_ADMIN_PASSWORD_LENGTH} characters in production`)
  }
  console.warn(`[db] ADMIN_PASSWORD is not set strongly; using development-only default password`)
  return 'admin123-dev'
}

async function seedAdminUser() {
  const [row] = await db.select({ n: sql`count(*)`.as('n') }).from(users)
  if (Number(row?.n || 0) > 0) return

  const username = process.env.ADMIN_USERNAME || 'admin'
  const password = requireInitialAdminPassword()
  const passwordHash = bcrypt.hashSync(password, 10)

  await db.insert(users).values({ username, passwordHash, role: 'admin' })

  console.log(`[db] seeded initial admin: username="${username}", role=admin`)
}
