// Minimal ZIP entry reader/rewriter for the vendored J2meJS class libraries.
//
// The class libraries are prebuilt JARs. One of their `java/lang/Class.class`
// files contains a site-hostile shortcut — `Class.forName("XMessage")` returns
// null before the real class loader runs — and there is no source checkout to
// rebuild it from. Rewriting a single deflated entry in place is enough:
//
//   * both the local header and the central directory get the new CRC/sizes;
//   * every other entry keeps its original bytes, order, timestamps and extra
//     fields, so the archive stays a normal JAR;
//   * the rewritten entry is re-deflated, which is why CRC32 is implemented
//     here instead of relying on zlib.crc32 (only present on newer Node).
//
// Only the subset of ZIP this project's class libraries use is supported:
// stored/deflated entries, no data descriptors, no ZIP64, no encryption.
import { deflateRawSync, inflateRawSync } from 'node:zlib'

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer) {
  let crc = 0xffffffff
  for (let i = 0; i < buffer.length; i++) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function findEndOfCentralDirectory(buffer) {
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) return i
  }
  throw new Error('zip: end of central directory not found')
}

function parseCentralDirectory(buffer) {
  const eocd = findEndOfCentralDirectory(buffer)
  if (buffer.readUInt16LE(eocd + 4) !== 0 || buffer.readUInt16LE(eocd + 6) !== 0) {
    throw new Error('zip: multi-disk archives are not supported')
  }
  const count = buffer.readUInt16LE(eocd + 10)
  const directorySize = buffer.readUInt32LE(eocd + 12)
  const directoryOffset = buffer.readUInt32LE(eocd + 16)
  const comment = buffer.subarray(eocd + 22, eocd + 22 + buffer.readUInt16LE(eocd + 20))
  const entries = []
  let offset = directoryOffset
  for (let index = 0; index < count; index++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('zip: bad central directory header at ' + offset)
    }
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    entries.push({
      method: buffer.readUInt16LE(offset + 10),
      crc: buffer.readUInt32LE(offset + 16),
      compressedSize: buffer.readUInt32LE(offset + 20),
      uncompressedSize: buffer.readUInt32LE(offset + 24),
      name: buffer.toString('utf8', offset + 46, offset + 46 + nameLength),
      localHeaderOffset: buffer.readUInt32LE(offset + 42),
      header: Buffer.from(buffer.subarray(offset, offset + 46 + nameLength + extraLength + commentLength)),
    })
    offset += 46 + nameLength + extraLength + commentLength
  }
  if (offset !== directoryOffset + directorySize) {
    throw new Error('zip: central directory size mismatch')
  }
  return { entries, comment }
}

function localDataStart(buffer, entry) {
  const offset = entry.localHeaderOffset
  if (buffer.readUInt32LE(offset) !== 0x04034b50) {
    throw new Error('zip: bad local header for ' + entry.name)
  }
  return offset + 30 + buffer.readUInt16LE(offset + 26) + buffer.readUInt16LE(offset + 28)
}

/** Read one entry and decompress it. Returns null when the entry is absent. */
export function readZipEntry(buffer, name) {
  const { entries } = parseCentralDirectory(buffer)
  const entry = entries.find((candidate) => candidate.name === name)
  if (!entry) return null
  const raw = buffer.subarray(localDataStart(buffer, entry), localDataStart(buffer, entry) + entry.compressedSize)
  if (entry.method === 0) return Buffer.from(raw)
  if (entry.method === 8) return inflateRawSync(raw)
  throw new Error('zip: unsupported compression method ' + entry.method + ' for ' + name)
}

/** Rewrite one deflated entry, preserving every other byte of the archive. */
export function rewriteZipEntry(buffer, name, transform) {
  const { entries, comment } = parseCentralDirectory(buffer)
  if (!entries.some((entry) => entry.name === name)) {
    throw new Error('zip: entry not found: ' + name)
  }
  const parts = []
  const rewritten = []
  let offset = 0
  for (const entry of entries) {
    const localOffset = entry.localHeaderOffset
    const nameLength = buffer.readUInt16LE(localOffset + 26)
    const extraLength = buffer.readUInt16LE(localOffset + 28)
    let data = buffer.subarray(localDataStart(buffer, entry), localDataStart(buffer, entry) + entry.compressedSize)
    let { crc, compressedSize, uncompressedSize } = entry
    if (entry.name === name) {
      if (entry.method !== 8) throw new Error('zip: entry is not deflated: ' + name)
      const plain = inflateRawSync(data)
      const next = transform(plain)
      if (!Buffer.isBuffer(next)) throw new Error('zip: transform must return a Buffer')
      data = deflateRawSync(next, { level: 9 })
      crc = crc32(next)
      compressedSize = data.length
      uncompressedSize = next.length
    }
    const header = Buffer.from(buffer.subarray(localOffset, localOffset + 30 + nameLength + extraLength))
    header.writeUInt32LE(crc, 14)
    header.writeUInt32LE(compressedSize, 18)
    header.writeUInt32LE(uncompressedSize, 22)
    parts.push(header, data)
    rewritten.push({ entry, offset, crc, compressedSize, uncompressedSize })
    offset += header.length + data.length
  }
  const directoryOffset = offset
  for (const item of rewritten) {
    const header = Buffer.from(item.entry.header)
    header.writeUInt32LE(item.crc, 16)
    header.writeUInt32LE(item.compressedSize, 20)
    header.writeUInt32LE(item.uncompressedSize, 24)
    header.writeUInt32LE(item.offset, 42)
    parts.push(header)
    offset += header.length
  }
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(offset - directoryOffset, 12)
  eocd.writeUInt32LE(directoryOffset, 16)
  eocd.writeUInt16LE(comment.length, 20)
  parts.push(eocd, comment)
  return Buffer.concat(parts)
}
