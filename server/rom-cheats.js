// Built-in cheats (金手指) an admin configures per ROM. Shared by the public
// ROM route (read) and the admin routes (read/write).
import { asc, count, eq, inArray } from 'drizzle-orm'
import { db } from './db/index.js'
import { romCheats } from './db/schema.js'

export const MAX_ROM_CHEATS = 32
const MAX_CODE_LENGTH = 128
const MAX_LABEL_LENGTH = 64

// Accepts `{ label }` or `{ desc }` from clients and drops unusable entries.
export function normalizeCheatEntry(entry) {
  if (!entry || typeof entry !== 'object') return null
  const code = String(entry.code ?? '').trim().slice(0, MAX_CODE_LENGTH)
  if (!code) return null
  const label = String(entry.label ?? entry.desc ?? '').trim().slice(0, MAX_LABEL_LENGTH)
  return { label, code }
}

export function normalizeCheatList(list) {
  const out = []
  for (const entry of Array.isArray(list) ? list : []) {
    const normalized = normalizeCheatEntry(entry)
    if (normalized) out.push(normalized)
    if (out.length >= MAX_ROM_CHEATS) break
  }
  return out
}

function serialize(row) {
  return { id: row.id, desc: row.label || '', code: row.code }
}

export async function listRomCheats(romId) {
  const rows = await db.select({ id: romCheats.id, label: romCheats.label, code: romCheats.code })
    .from(romCheats)
    .where(eq(romCheats.romId, Number(romId)))
    .orderBy(asc(romCheats.id))
  return rows.map(serialize)
}

// Replace-all: the admin dialog sends the whole list, so deletes and edits are
// applied in one shot. Runs in a transaction so a bad request can't wipe a list.
export async function replaceRomCheats(romId, list) {
  const id = Number(romId)
  const entries = normalizeCheatList(list)
  await db.transaction(async (tx) => {
    await tx.delete(romCheats).where(eq(romCheats.romId, id))
    if (entries.length) {
      await tx.insert(romCheats).values(entries.map((entry) => ({
        romId: id,
        label: entry.label,
        code: entry.code,
      })))
    }
  })
  return listRomCheats(id)
}

// romId → cheat count, for the admin ROM list badges.
export async function cheatCountsFor(romIds) {
  const ids = [...new Set((romIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))]
  const map = new Map()
  if (!ids.length) return map
  const rows = await db.select({ romId: romCheats.romId, total: count() })
    .from(romCheats)
    .where(inArray(romCheats.romId, ids))
    .groupBy(romCheats.romId)
  for (const row of rows) map.set(Number(row.romId), Number(row.total))
  return map
}
