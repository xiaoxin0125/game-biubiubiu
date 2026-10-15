import mysql from 'mysql2/promise'
import { drizzle } from 'drizzle-orm/mysql2'
import { migrate } from 'drizzle-orm/mysql2/migrator'
import { sql } from 'drizzle-orm'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import * as schema from './schema.js'
import { users } from './schema.js'
import { hashPassword, MIN_PASSWORD_LENGTH } from '../passwords.js'
import { DB_TIMEZONE } from './timezone.js'

const DATABASE_URL = process.env.DATABASE_URL || 'mysql://games:games@127.0.0.1:3306/games_online'

// 连接时区必须显式指定：mysql2 默认的 'local' 取决于进程 TZ，和数据库里存的
// 时区一旦不一致，裸查询拿到的 Date 就会整体偏 8 小时。见 ./timezone.js。
export const pool = mysql.createPool({
  uri: DATABASE_URL,
  timezone: DB_TIMEZONE,
  // 池里的空闲连接会被 MySQL 的 wait_timeout（或中间设备）悄悄掐断，之后第一个
  // 用到它的请求就会撞上 "Connection lost"——2026-10 审计在线上启动日志里抓到过
  // 两次（L-2）。开着 TCP keepalive 之后，空闲连接由内核探活维持，真断了也会在
  // 取用之后立刻暴露，而不是在业务查询里炸出来。
  enableKeepAlive: true,
  keepAliveInitialDelay: 10_000,
  connectTimeout: 10_000,
  waitForConnections: true,
  connectionLimit: 10,
})

const CONNECTION_LOST_CODES = new Set(['PROTOCOL_CONNECTION_LOST', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE'])

/** 判断错误是否是"连接被掐断"这一类：这类错误重试一次通常就好了。 */
export function isConnectionLostError(error) {
  return Boolean(error && CONNECTION_LOST_CODES.has(String(error.code || '')))
}

/**
 * 跑一段数据库操作，撞上连接丢失就重试一次。
 * 只给幂等的启动流程用（迁移、清理），业务写操作一律不套——重放写请求会重复落库。
 */
export async function withConnectionRetry(task, { attempts = 2, label = 'db task' } = {}) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task()
    } catch (error) {
      lastError = error
      if (!isConnectionLostError(error) || attempt === attempts) throw error
      console.warn(`[db] ${label} hit a dropped connection, retrying (${attempt}/${attempts - 1})`)
    }
  }
  throw lastError
}

/** 健康检查用的最小探活：能跑通一条 SELECT 就说明池子还能用。 */
export async function pingDatabase({ timeoutMs = 2000 } = {}) {
  let timer = null
  try {
    return await Promise.race([
      pool.query('SELECT 1').then(() => true),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`database ping timed out after ${timeoutMs}ms`)), timeoutMs)
        timer.unref?.()
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

// 让 MySQL 会话也用同一个时区，这样列的默认值 DEFAULT (now()) 和 TIMESTAMP 的
// 换算都与 drizzle 侧的映射一致，不再依赖服务器或进程的环境。
pool.on('connection', (connection) => {
  connection.query(`SET time_zone = '${DB_TIMEZONE}'`, (err) => {
    if (err) console.warn('[db] failed to pin session time_zone:', err.message)
  })
})

export const db = drizzle(pool, { schema, mode: 'default', casing: 'snake_case' })

const MIGRATIONS_FOLDER = resolve(import.meta.dirname || './server/db', 'migrations')

export async function runMigrations() {
  if (existsSync(MIGRATIONS_FOLDER)) {
    // 迁移要在进程启动时跑完，这一步撞上"连接被掐断"会让服务起不来；
    // 重试一次比让 systemd 重启整个进程便宜（2026-10 审计 L-2）。
    await withConnectionRetry(() => migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }), { label: 'migrations' })
  }
  await withConnectionRetry(cleanupDuplicateSaveStates, { label: 'save-state cleanup' })
  await withConnectionRetry(seedAdminUser, { label: 'admin seed' })
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

const MIN_ADMIN_PASSWORD_LENGTH = MIN_PASSWORD_LENGTH

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
  const passwordHash = await hashPassword(password)

  await db.insert(users).values({ username, passwordHash, role: 'admin' })

  console.log(`[db] seeded initial admin: username="${username}", role=admin`)
}
