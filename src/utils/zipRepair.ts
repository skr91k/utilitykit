/*
 * Client-side zip recovery engine. Nothing leaves the browser.
 *
 * A "broken" zip is usually only broken at the end: the central directory and
 * EOCD record are what normal readers parse first, and they are what gets lost
 * to truncated downloads, renamed .tmp files, or self-extracting stubs. The
 * actual file data sits earlier in the archive, intact, behind local file
 * headers. So we ignore the directory entirely, scan the raw bytes for
 * PK\x03\x04 signatures, inflate each entry forward, and rebuild a fresh zip.
 *
 * Signatures, as they appear on disk:
 *   PK 03 04  local file header      PK 01 02  central directory header
 *   PK 05 06  end of central dir     PK 07 08  data descriptor
 *   PK 06 06 / PK 06 07  zip64 records
 */

import { Inflate } from 'fflate'

export const METHOD_NAMES: Record<number, string> = {
  0: 'store', 1: 'shrink', 6: 'implode', 8: 'deflate', 9: 'deflate64',
  12: 'bzip2', 14: 'lzma', 93: 'zstd', 95: 'xz', 98: 'ppmd',
}

// Methods we can actually decode in-browser. The rest are named but skipped.
const DECODABLE = new Set([0, 8, 9])

export type EntryStatus = 'ok' | 'unverified' | 'crc' | 'partial' | 'failed' | 'dir' | 'unsupported'

export interface RepairedEntry {
  name: string
  rawName: string
  offset: number
  method: number
  flags: number
  expectedCrc: number
  declaredSize: number
  data: Uint8Array
  status: EntryStatus
  note: string
}

export interface ScanResult {
  lfh: number[]
  cfh: number[]
  eocd: number[]
  zip64: boolean
}

export interface Diagnosis {
  fileName: string
  fileSize: number
  localHeaders: number
  centralHeaders: number
  hasEocd: boolean
  eocdEntryCount: number | null
  leadingGarbage: number
  zip64: boolean
  opensNormally: boolean
  problems: string[]
}

// ---- crc32 (zip flavour, reflected 0xEDB88320) ----
const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c
  }
  return t
})()

export function crc32(data: Uint8Array): number {
  let c = -1
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8)
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0
// zip64 sizes are 8 bytes; Number stays exact well past any real entry size
const u64 = (b: Uint8Array, o: number) => u32(b, o) + u32(b, o + 4) * 0x100000000

const utf8 = new TextDecoder('utf-8', { fatal: true })
const latin1 = new TextDecoder('latin1')

function decodeName(bytes: Uint8Array): string {
  try { return utf8.decode(bytes) } catch { return latin1.decode(bytes) }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`
  return `${(n / 1073741824).toFixed(2)} GB`
}

/** Strip anything that would let a recovered name escape its folder on extract. */
export function sanitizeName(name: string, index: number): string {
  const n = name.replace(/\\/g, '/').replace(/^[a-zA-Z]:/, '')
  const cleaned = n.split('/').filter(p => p && p !== '.' && p !== '..').join('/')
  return cleaned || `recovered_${index}`
}

interface RawHeader {
  offset: number
  dataStart: number
  name: string
  method: number
  flags: number
  crc: number
  csize: number
  usize: number
}

/**
 * Parse a local file header, returning null when the signature was a false
 * positive — PK\x03\x04 occurs by chance inside compressed data, so every
 * candidate has to prove itself with plausible header fields.
 */
export function parseLocalHeader(b: Uint8Array, off: number): RawHeader | null {
  if (off + 30 > b.length) return null
  const version = u16(b, off + 4)
  const flags = u16(b, off + 6)
  const method = u16(b, off + 8)
  const crc = u32(b, off + 14)
  let csize = u32(b, off + 18)
  let usize = u32(b, off + 22)
  const nlen = u16(b, off + 26)
  const elen = u16(b, off + 28)

  if (version > 100) return null
  if (!(method in METHOD_NAMES)) return null
  if (nlen === 0 || nlen > 512) return null
  if (off + 30 + nlen + elen > b.length) return null

  const nameBytes = b.subarray(off + 30, off + 30 + nlen)
  for (let i = 0; i < nameBytes.length; i++) {
    // control characters never appear in a real archive path
    if (nameBytes[i] < 0x20 || nameBytes[i] === 0x7f) return null
  }

  // zip64 extended information — the real sizes live in the extra field
  if (csize === 0xffffffff || usize === 0xffffffff) {
    let p = off + 30 + nlen
    const end = p + elen
    while (p + 4 <= end) {
      const id = u16(b, p)
      const size = u16(b, p + 2)
      if (id === 0x0001) {
        let q = p + 4
        if (usize === 0xffffffff && q + 8 <= end) { usize = u64(b, q); q += 8 }
        if (csize === 0xffffffff && q + 8 <= end) csize = u64(b, q)
        break
      }
      p += 4 + size
    }
  }

  return {
    offset: off,
    dataStart: off + 30 + nlen + elen,
    name: decodeName(nameBytes),
    method, flags, crc, csize, usize,
  }
}

/**
 * Raw-inflate a region, keeping whatever decoded before an error.
 *
 * Pushing with final=false lets fflate stop cleanly at the end of the buffer
 * instead of throwing, so partial output survives a truncated stream; the
 * closing push is what reports whether the stream actually terminated.
 */
export function inflateRegion(region: Uint8Array): { data: Uint8Array; truncated: boolean } {
  const chunks: Uint8Array[] = []
  let total = 0
  const inf = new Inflate(chunk => { chunks.push(chunk); total += chunk.length })
  let truncated = false
  try {
    inf.push(region, false)
  } catch {
    truncated = true
  }
  if (!truncated) {
    try {
      inf.push(new Uint8Array(0), true)
    } catch {
      truncated = true
    }
  }
  const out = new Uint8Array(total)
  let p = 0
  for (const c of chunks) { out.set(c, p); p += c.length }
  return { data: out, truncated }
}

const yieldToHost = () => new Promise<void>(r => setTimeout(r, 0))

/** Pass 1: one sweep of the whole buffer for every PK signature we care about. */
export async function scanSignatures(
  b: Uint8Array,
  onProgress?: (pct: number) => void,
): Promise<ScanResult> {
  const lfh: number[] = []
  const cfh: number[] = []
  const eocd: number[] = []
  let zip64 = false
  const CHUNK = 8 * 1024 * 1024
  const limit = b.length - 4
  for (let base = 0; base <= limit; base += CHUNK) {
    const end = Math.min(base + CHUNK, limit)
    for (let i = base; i <= end; i++) {
      if (b[i] !== 0x50 || b[i + 1] !== 0x4b) continue
      const c = b[i + 2], d = b[i + 3]
      if (c === 3 && d === 4) lfh.push(i)
      else if (c === 1 && d === 2) cfh.push(i)
      else if (c === 5 && d === 6) eocd.push(i)
      else if (c === 6 && (d === 6 || d === 7)) zip64 = true
    }
    onProgress?.(limit > 0 ? Math.min(100, Math.round((end / limit) * 100)) : 100)
    await yieldToHost()
  }
  return { lfh, cfh, eocd, zip64 }
}

export function diagnose(
  fileName: string,
  fileSize: number,
  b: Uint8Array,
  scan: ScanResult,
  opensNormally: boolean,
): Diagnosis {
  const { lfh, cfh, eocd, zip64 } = scan
  const lastEocd = eocd.length ? eocd[eocd.length - 1] : -1
  const eocdEntryCount = lastEocd >= 0 && lastEocd + 22 <= b.length ? u16(b, lastEocd + 10) : null

  const problems: string[] = []
  if (!lfh.length) problems.push('No local file headers found — this is not a zip, or the data is unrecoverable.')
  if (lastEocd < 0) problems.push('End-of-central-directory record is missing — the usual result of a truncated or partial download.')
  if (lfh.length && !cfh.length) problems.push('Central directory is missing — entries have to be recovered by scanning.')
  if (eocdEntryCount !== null && lfh.length && eocdEntryCount !== lfh.length) {
    problems.push(`Directory claims ${eocdEntryCount} entries but ${lfh.length} were found in the data.`)
  }
  if (lfh.length && lfh[0] > 0) {
    problems.push(`${formatBytes(lfh[0])} of data before the first entry (self-extracting stub, or a zip embedded in another file).`)
  }
  if (zip64) problems.push('Zip64 structures present — sizes are read from the extra field.')
  if (opensNormally && !problems.length) problems.push('Archive already opens with a standard reader — a rebuild will still normalise it.')

  return {
    fileName, fileSize,
    localHeaders: lfh.length,
    centralHeaders: cfh.length,
    hasEocd: lastEocd >= 0,
    eocdEntryCount,
    leadingGarbage: lfh.length ? lfh[0] : 0,
    zip64,
    opensNormally,
    problems,
  }
}

/**
 * Passes 2 and 3: validate candidate headers, then decode each entry.
 *
 * An entry may run to the next header at most. When sizes are missing —
 * streamed zips write them *after* the data — deflate terminates itself, so
 * that boundary is only an upper bound.
 */
export async function recoverEntries(
  b: Uint8Array,
  scan: ScanResult,
  onProgress?: (done: number, total: number, name: string) => void,
): Promise<RepairedEntry[]> {
  const headers: RawHeader[] = []
  let minOffset = 0
  for (const off of scan.lfh) {
    // a signature inside compressed data cannot be a real header: it would
    // start before the previous entry's data is known to have ended
    if (off < minOffset) continue
    const h = parseLocalHeader(b, off)
    if (!h) continue
    headers.push(h)
    minOffset = h.csize > 0 && h.dataStart + h.csize <= b.length ? h.dataStart + h.csize : h.dataStart
  }

  const out: RepairedEntry[] = []
  const used = new Set<string>()

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]
    const nextHeader = headers[i + 1]?.offset
    const nextCfh = scan.cfh.find(c => c > h.dataStart)
    const boundary = Math.min(nextHeader ?? b.length, nextCfh ?? b.length, b.length)

    onProgress?.(i + 1, headers.length, h.name)
    if (i % 20 === 0) await yieldToHost()

    const isDir = h.name.endsWith('/') || h.name.endsWith('\\')
    let name = sanitizeName(h.name, i)
    if (!isDir) {
      let candidate = name
      let dup = 2
      while (used.has(candidate)) {
        const dot = name.lastIndexOf('.')
        candidate = dot > 0 ? `${name.slice(0, dot)} (${dup})${name.slice(dot)}` : `${name} (${dup})`
        dup++
      }
      name = candidate
      used.add(name)
    }

    const base = {
      name, rawName: h.name, offset: h.offset, method: h.method,
      flags: h.flags, expectedCrc: h.crc, declaredSize: h.usize,
    }

    if (isDir) {
      out.push({ ...base, data: new Uint8Array(0), status: 'dir', note: 'directory' })
      continue
    }

    if (h.flags & 0x01) {
      out.push({ ...base, data: new Uint8Array(0), status: 'unsupported', note: 'entry is encrypted' })
      continue
    }

    if (!DECODABLE.has(h.method)) {
      out.push({
        ...base, data: new Uint8Array(0), status: 'unsupported',
        note: `${METHOD_NAMES[h.method] || `method ${h.method}`} cannot be decoded in-browser`,
      })
      continue
    }

    let data: Uint8Array
    let truncated = false
    let note = ''

    if (h.method === 0) {
      // stored data does not self-terminate, so a size is required
      let size = h.csize || h.usize
      if (!size) {
        size = boundary - h.dataStart
        note = 'size missing — read up to the next entry'
        // a streamed entry ends with a data descriptor; do not keep it
        if (h.flags & 0x08) {
          for (let p = boundary - 24; p < boundary - 3 && p > h.dataStart; p++) {
            if (b[p] === 0x50 && b[p + 1] === 0x4b && b[p + 2] === 7 && b[p + 3] === 8) {
              size = p - h.dataStart
              break
            }
          }
        }
      }
      const end = Math.min(h.dataStart + size, boundary, b.length)
      if (end < h.dataStart + size) {
        truncated = true
        note = 'file ends before the entry does'
      }
      data = b.slice(h.dataStart, end)
    } else {
      const end = Math.min(h.csize > 0 ? h.dataStart + h.csize : boundary, boundary, b.length)
      const r = inflateRegion(b.subarray(h.dataStart, end))
      data = r.data
      truncated = r.truncated
      if (h.method === 9 && truncated) note = 'deflate64 — may need the larger window size'
    }

    // CRC first: a stream can report an error on the closing push and still be
    // byte-for-byte correct, and the checksum is the authority on that.
    let status: EntryStatus
    const actualCrc = data.length ? crc32(data) : 0
    if (h.crc !== 0 && actualCrc === h.crc) {
      status = 'ok'
    } else if (!data.length) {
      status = 'failed'
      note = note || 'no data could be decoded'
    } else if (truncated) {
      status = 'partial'
      note = note || `recovered ${formatBytes(data.length)}${h.usize ? ` of ${formatBytes(h.usize)}` : ''}`
    } else if (h.crc !== 0) {
      status = 'crc'
      note = note || 'checksum mismatch — data may be damaged'
    } else {
      status = 'unverified'
      note = note || 'no checksum stored to verify against'
    }

    out.push({ ...base, data, status, note })
  }

  return out
}
