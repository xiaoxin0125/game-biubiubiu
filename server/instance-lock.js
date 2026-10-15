/*
 * 单实例启动锁。
 *
 * 这个进程里有几样东西只存在于内存：接口限流的计数桶、WebSocket 一次性票据、
 * 房间在线状态、上传并发闸门、临时 TURN 凭据。它们默认"整站只有一个进程"，
 * README 的「架构要点」里写了这条假设（2026-10 审计 M-6）。
 *
 * 假设写在文档里挡不住误操作：把服务起两遍（手动起一个、systemd 再起一个），
 * 限流会被放大一倍、票据与房间状态会跨进程失效，而且现象是"有时连不上"这种
 * 最难查的形态。这里用 MySQL 的 GET_LOCK 把假设变成硬约束：抢不到锁的进程
 * 直接拒绝启动。
 *
 * GET_LOCK 属于"连接级"的锁：连接断开锁就没了，所以拿锁之后要一直攥着这条
 * 连接（不还给池子），进程退出时连接断开，锁自然释放。
 */

import { pool } from './db/index.js'

export const DEFAULT_LOCK_NAME = 'games-online:primary'

let heldConnection = null
let heldLockName = null

/** 单实例锁是否启用（SINGLE_INSTANCE_LOCK=0 可关掉，例如要临时起一个冒烟实例）。 */
export function instanceLockEnabled() {
  const raw = String(process.env.SINGLE_INSTANCE_LOCK ?? '1').trim().toLowerCase()
  return !['0', 'false', 'no', 'off'].includes(raw)
}

/**
 * 尝试抢占单实例锁。
 * 返回 { acquired: true } 或 { acquired: false, holderHint }；不抛异常（数据库本身
 * 连不上时由调用方决定怎么处理）。
 */
export async function acquireInstanceLock({ name = DEFAULT_LOCK_NAME } = {}) {
  if (heldConnection) return { acquired: true, alreadyHeld: true, name: heldLockName }
  const connection = await pool.getConnection()
  try {
    const [rows] = await connection.query('SELECT GET_LOCK(?, 0) AS acquired, IS_USED_LOCK(?) AS holder', [name, name])
    const row = rows?.[0] || {}
    if (Number(row.acquired) !== 1) {
      return { acquired: false, name, holderHint: row.holder ? `connection ${row.holder}` : null }
    }
  } catch (error) {
    connection.release()
    throw error
  }
  heldConnection = connection
  heldLockName = name
  return { acquired: true, name, alreadyHeld: false }
}

/** 主动释放单实例锁（进程正常退出时用；异常退出由连接断开兜底）。 */
export async function releaseInstanceLock() {
  const connection = heldConnection
  const name = heldLockName
  heldConnection = null
  heldLockName = null
  if (!connection) return
  try {
    if (name) await connection.query('SELECT RELEASE_LOCK(?)', [name])
  } catch (error) {
    console.warn('[api] failed to release instance lock:', error?.message || error)
  } finally {
    try {
      connection.release()
    } catch { /* 连接可能已经断了，忽略 */ }
  }
}
