import mysql from 'mysql2/promise'
import { migrate } from 'drizzle-orm/mysql2/migrator'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { db, pool } from './index.js'

const SQLITE_DB = resolve(process.env.SQLITE_DB || 'data/app.db')
const DATABASE_URL = process.env.DATABASE_URL || 'mysql://games:games@127.0.0.1:3306/games_online'
const MIGRATIONS_FOLDER = resolve('server/db/migrations')
const SHOULD_TRUNCATE = process.env.IMPORT_TRUNCATE === '1'

const TABLES = [
  'users',
  'settings',
  'roms',
  'sessions',
  'rooms',
  'favorites',
  'save_states',
]

const TIMESTAMP_COLUMNS = new Set([
  'created_at',
  'updated_at',
  'closed_at',
  'expires_at',
  'last_activity_at',
])

if (!existsSync(SQLITE_DB)) {
  console.error(`[import] SQLite database not found: ${SQLITE_DB}`)
  process.exit(1)
}

function sqliteJson(sql) {
  const result = spawnSync('sqlite3', ['-readonly', '-json', SQLITE_DB, sql], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 256,
  })

  if (result.error?.code === 'ENOENT') {
    throw new Error('sqlite3 command not found. Install it first: apt install sqlite3')
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || `sqlite3 exited with status ${result.status}`)
  }
  const output = result.stdout.trim()
  return output ? JSON.parse(output) : []
}

function quoteId(name) {
  return `\`${name.replaceAll('`', '``')}\``
}

function normalizeValue(column, value) {
  if (value === undefined) return null
  if (value === null) return null
  if (typeof value === 'number' && !Number.isFinite(value)) return null
  if (TIMESTAMP_COLUMNS.has(column) && typeof value === 'number') {
    return new Date(value * 1000)
  }
  return value
}

async function tableColumns(conn, table) {
  const [rows] = await conn.query(`SHOW COLUMNS FROM ${quoteId(table)}`)
  return rows.map((row) => row.Field)
}

async function sourceTables() {
  const rows = sqliteJson("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  return new Set(rows.map((row) => row.name))
}

async function importTable(conn, table, availableTables) {
  if (!availableTables.has(table)) {
    console.log(`[import] skip ${table}: not found in SQLite`)
    return 0
  }

  const rows = sqliteJson(`SELECT * FROM ${quoteId(table)}`)
  if (rows.length === 0) {
    console.log(`[import] skip ${table}: empty`)
    return 0
  }

  const targetColumns = await tableColumns(conn, table)
  const columns = Object.keys(rows[0]).filter((column) => targetColumns.includes(column))
  if (columns.length === 0) {
    console.log(`[import] skip ${table}: no compatible columns`)
    return 0
  }

  const columnList = columns.map(quoteId).join(', ')
  const placeholders = columns.map(() => '?').join(', ')
  const updateList = columns
    .filter((column) => column !== 'id')
    .map((column) => `${quoteId(column)} = VALUES(${quoteId(column)})`)
    .join(', ')
  const sql = `INSERT INTO ${quoteId(table)} (${columnList}) VALUES (${placeholders})${updateList ? ` ON DUPLICATE KEY UPDATE ${updateList}` : ''}`

  for (const row of rows) {
    await conn.execute(sql, columns.map((column) => normalizeValue(column, row[column])))
  }

  console.log(`[import] ${table}: ${rows.length} rows`)
  return rows.length
}

async function prepareSchema() {
  if (existsSync(MIGRATIONS_FOLDER)) {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
  }
}

async function truncateTargetTables(conn) {
  for (const table of [...TABLES].reverse()) {
    await conn.query(`TRUNCATE TABLE ${quoteId(table)}`).catch((err) => {
      console.warn(`[import] truncate ${table} skipped: ${err.message}`)
    })
  }
}

async function resetAutoIncrement(conn, table) {
  const [[row]] = await conn.query(`SELECT MAX(id) AS maxId FROM ${quoteId(table)}`)
  const nextId = Number(row?.maxId || 0) + 1
  if (nextId > 1) await conn.query(`ALTER TABLE ${quoteId(table)} AUTO_INCREMENT = ${nextId}`)
}

async function main() {
  console.log(`[import] sqlite: ${SQLITE_DB}`)
  console.log(`[import] mysql: ${DATABASE_URL.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@')}`)

  await prepareSchema()
  const conn = await mysql.createConnection(DATABASE_URL)

  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0')
    if (SHOULD_TRUNCATE) {
      console.log('[import] truncating target MySQL tables')
      await truncateTargetTables(conn)
    }
    const availableTables = await sourceTables()
    let total = 0

    for (const table of TABLES) {
      total += await importTable(conn, table, availableTables)
    }

    await conn.query('SET FOREIGN_KEY_CHECKS = 1')
    for (const table of ['users', 'roms', 'sessions', 'rooms', 'save_states']) {
      await resetAutoIncrement(conn, table).catch(() => {})
    }

    console.log(`[import] done: ${total} rows imported`)
  } finally {
    await conn.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => {})
    await conn.end()
    await pool.end()
  }
}

main().catch(async (err) => {
  console.error('[import] failed')
  console.error(err)
  await pool.end().catch(() => {})
  process.exit(1)
})