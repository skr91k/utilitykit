import { useState, useRef, useMemo, useEffect } from 'react'
import JSZip from 'jszip'
import { Zip, ZipDeflate } from 'fflate'
import { parquetReadObjects, parquetMetadataAsync, parquetSchema } from 'hyparquet'
import { useSEO } from '../utils/useSEO'
import { createChart, CandlestickSeries, HistogramSeries, ColorType, CrosshairMode, TickMarkType, type IChartApi, type UTCTimestamp } from 'lightweight-charts'

// ---- Python script is served from /price_unpacker.py (public/) ----
const SCRIPT_URL = '/price_unpacker.py'

/*

import zipfile, json, os, sys, math

try:
    import numpy as np
    HAS_NP = True
except ImportError:
    HAS_NP = False


def read_u32(data: bytes, offset: int) -> int:
    return (data[offset] << 24) | (data[offset+1] << 16) | (data[offset+2] << 8) | data[offset+3]


def bit_unpack(data: bytes, start_byte: int, count: int, bpv: int):
    """MSB-first bit-packed integers. Returns numpy array if numpy present."""
    if bpv == 0 or count == 0:
        return np.zeros(count, np.int64) if HAS_NP else [0] * count
    needed = math.ceil(count * bpv / 8)
    if HAS_NP:
        chunk  = np.frombuffer(data[start_byte:start_byte + needed], dtype=np.uint8)
        bits   = np.unpackbits(chunk)[:count * bpv].reshape(count, bpv)
        powers = (1 << np.arange(bpv - 1, -1, -1, dtype=np.int64))
        return bits.astype(np.int64) @ powers
    n     = int.from_bytes(data[start_byte:start_byte + needed], 'big')
    total = needed * 8
    mask  = (1 << bpv) - 1
    return [(n >> (total - (i + 1) * bpv)) & mask for i in range(count)]


def read_long_section(data: bytes, pos: int, count: int):
    gdc    = read_u32(data, pos);     pos += 4
    start  = read_u32(data, pos);     pos += 4
    offset = read_u32(data, pos);     pos += 4
    bits   = data[pos];               pos += 1
    blen   = math.ceil(count * bits / 8)
    sh     = bit_unpack(data, pos, count, bits); pos += blen
    sc     = [0] * count
    sc[0]  = start
    for i in range(1, count):
        sc[i] = sc[i-1] + (sh[i] - offset)
    return sc, gdc, pos - (pos - 4*3 - 1 - blen)  # bytes consumed


def _rls(data, pos, count):
    """read_long_section returning (scaled, gdc, bytes_consumed)."""
    start_pos = pos
    gdc    = read_u32(data, pos);  pos += 4
    start  = read_u32(data, pos);  pos += 4
    offset = read_u32(data, pos);  pos += 4
    bits   = data[pos];            pos += 1
    blen   = math.ceil(count * bits / 8)
    sh     = bit_unpack(data, pos, count, bits); pos += blen
    if HAS_NP:
        arr    = sh.astype(np.int64) - offset
        arr[0] = start
        sc     = np.cumsum(arr)
    else:
        sc = [0] * count; sc[0] = start
        for i in range(1, count):
            sc[i] = sc[i - 1] + (sh[i] - offset)
    return sc, gdc, pos - start_pos


def decode_entry(data: bytes) -> dict:
    pos     = 0
    sym_len = data[pos]; pos += 1
    symbol  = data[pos:pos+sym_len].decode(); pos += sym_len
    tfs     = read_u32(data, pos); pos += 4

    if tfs == 86400:
        cnt = read_u32(data, pos); pos += 4
        sc, gdc, consumed = _rls(data, pos, cnt); pos += consumed
        timestamps = (sc * gdc).tolist() if HAS_NP else [s * gdc for s in sc]
    else:
        ts  = read_u32(data, pos); pos += 4
        te  = read_u32(data, pos); pos += 4
        cnt = round((te - ts) / tfs) + 1
        timestamps = [ts + i * tfs for i in range(cnt)]

    n = len(timestamps)
    t = timestamps
    o, h, l, c, v, oi, iv = [], [], [], [], [], [], []

    # 0=end  1=close-only  2=ohlc  3=volume  4=oi  5=iv
    while pos < len(data):
        tag = data[pos]; pos += 1
        if tag == 0:
            break
        elif tag == 1:
            power = read_u32(data, pos); pos += 4
            scale = 10 ** power
            sc, gdc, consumed = _rls(data, pos, n); pos += consumed
            if HAS_NP:
                vals = (sc * gdc / scale).tolist()
            else:
                vals = [s * gdc / scale for s in sc]
            o = vals; h = list(vals); l = list(vals); c = list(vals)
        elif tag == 2:
            power = read_u32(data, pos); pos += 4
            scale = 10 ** power
            sc, gdc, consumed = _rls(data, pos, n * 4); pos += consumed
            if HAS_NP:
                f      = gdc / float(scale)
                ov, cv = (sc[0::4] * f).tolist(), (sc[3::4] * f).tolist()
                p1, p2 = (sc[1::4] * f).tolist(), (sc[2::4] * f).tolist()
                bull   = [cv[i] > ov[i] for i in range(n)]
                o = ov; c = cv
                h = [p2[i] if bull[i] else p1[i] for i in range(n)]
                l = [p1[i] if bull[i] else p2[i] for i in range(n)]
            else:
                for i in range(n):
                    ov = sc[i*4+0] * gdc / scale
                    cv = sc[i*4+3] * gdc / scale
                    p1 = sc[i*4+1] * gdc / scale
                    p2 = sc[i*4+2] * gdc / scale
                    o.append(ov); c.append(cv)
                    if cv > ov: l.append(p1); h.append(p2)
                    else:       h.append(p1); l.append(p2)
        elif tag == 3:
            sc, gdc, consumed = _rls(data, pos, n); pos += consumed
            v = (sc * gdc).tolist() if HAS_NP else [s * gdc for s in sc]
        elif tag == 4:
            sc, gdc, consumed = _rls(data, pos, n); pos += consumed
            oi = (sc * gdc).tolist() if HAS_NP else [s * gdc for s in sc]
        elif tag == 5:
            power = read_u32(data, pos); pos += 4
            scale = 10 ** power
            sc, gdc, consumed = _rls(data, pos, n); pos += consumed
            if HAS_NP:
                iv = (sc * gdc / scale).tolist()
            else:
                iv = [s * gdc / scale for s in sc]

    return {'symbol': symbol, 'timeframeSec': tfs,
            't': t, 'o': o, 'h': h, 'l': l, 'c': c, 'v': v, 'oi': oi, 'iv': iv}


def to_csv(mc: dict) -> str:
    has_v  = len(mc['v']) > 0
    has_oi = len(mc['oi']) > 0
    has_iv = len(mc.get('iv', [])) > 0
    cols   = ['time', 'open', 'high', 'low', 'close']
    if has_v:  cols.append('volume')
    if has_oi: cols.append('oi')
    if has_iv: cols.append('iv')
    rows = [','.join(cols)]
    for i in range(len(mc['t'])):
        row = [str(mc['t'][i]),
               f"{mc['o'][i]:.2f}", f"{mc['h'][i]:.2f}",
               f"{mc['l'][i]:.2f}", f"{mc['c'][i]:.2f}"]
        if has_v:  row.append(str(int(mc['v'][i])))
        if has_oi: row.append(str(int(mc['oi'][i])))
        if has_iv: row.append(f"{mc['iv'][i]:.4f}")
        rows.append(','.join(row))
    return '\\n'.join(rows)


def bar(done: int, total: int) -> None:
    pct    = done / total if total else 0
    filled = int(40 * pct)
    b      = '\\u2588' * filled + '\\u2591' * (40 - filled)
    w      = len(str(total))
    print(f"\\r[{b}] {done:{w}}/{total}", end='', flush=True)


def main():
    print("Price Unpacker — bit-packed OHLC binary zip decoder")
    print(f"numpy: {'yes — fast mode' if HAS_NP else 'not found — pip install numpy  for 10x speed'}")
    print("=" * 52)

    zip_path = (sys.argv[1] if len(sys.argv) > 1
                else input("Binary zip path: ").strip().strip("'\\""))

    if not os.path.isfile(zip_path):
        sys.exit(f"File not found: {zip_path}")

    fmt = input("Output format [json/csv] (default json): ").strip().lower()
    if fmt not in ('json', 'csv'):
        fmt = 'json'

    base     = os.path.splitext(os.path.basename(zip_path))[0]
    out_path = os.path.join(os.path.dirname(zip_path) or '.', f"{base}_{fmt}.zip")
    ext      = '.json' if fmt == 'json' else '.csv'

    print(f"\\nInput : {zip_path}\\nOutput: {out_path}\\n")

    with zipfile.ZipFile(zip_path, 'r') as src:
        names = [n for n in src.namelist() if not n.endswith('/')]
        total = len(names)
        print(f"{total:,} entries\\n")

        errors = []
        tick  = max(1, total // 100)   # update bar ~once per 1%
        with zipfile.ZipFile(out_path, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as dst:
            for i, name in enumerate(names):
                if i % tick == 0 or i == total - 1:
                    bar(i + 1, total)
                try:
                    mc = decode_entry(src.read(name))
                    dst.writestr(name + ext,
                                 json.dumps(mc) if fmt == 'json' else to_csv(mc))
                except Exception as e:
                    errors.append((name, str(e)))

    print(f"\\n\\nDone → {out_path}")
    if errors:
        print(f"\\n{len(errors)} error(s):")
        for nm, err in errors[:10]:
            print(f"  {nm}: {err}")
        if len(errors) > 10:
            print(f"  ... and {len(errors)-10} more")


if __name__ == '__main__':
    main()
*/

// ---- Binary decoder — exact port of Kotlin BahvRepo4.byteArrayToresponseMC ----

interface ResponseMC {
  symbol: string
  timeframeSec: number
  t: number[]
  o: number[]
  h: number[]
  l: number[]
  c: number[]
  v: number[]
  oi: number[]
  iv: number[]
}

function readU32(data: Uint8Array, offset: number): number {
  return data[offset] * 16777216 + (data[offset + 1] << 16) + (data[offset + 2] << 8) + data[offset + 3]
}

function bitUnpack(data: Uint8Array, startByte: number, count: number, bitsPerValue: number): number[] {
  const result = new Array<number>(count)
  for (let i = 0; i < count; i++) {
    let v = 0
    for (let b = 0; b < bitsPerValue; b++) {
      const bitPos = i * bitsPerValue + b
      const byteIdx = startByte + (bitPos / 8 | 0)
      const bitIdx = 7 - (bitPos % 8)
      if (byteIdx < data.length) v = (v * 2) | ((data[byteIdx] >>> bitIdx) & 1)
    }
    result[i] = v
  }
  return result
}

function readLongSection(data: Uint8Array, startPos: number, n: number): { scaled: number[]; gdc: number; bytesConsumed: number } {
  let pos = startPos
  const gdc = readU32(data, pos); pos += 4
  const start = readU32(data, pos); pos += 4
  const offset = readU32(data, pos); pos += 4
  const bits = data[pos++]
  const bytes = Math.ceil(n * bits / 8)
  const shifted = bitUnpack(data, pos, n, bits); pos += bytes
  const scaled = new Array<number>(n)
  scaled[0] = start
  for (let i = 1; i < n; i++) scaled[i] = scaled[i - 1] + (shifted[i] - offset)
  return { scaled, gdc, bytesConsumed: pos - startPos }
}

function decodeEntry(data: Uint8Array): ResponseMC {
  let pos = 0
  const symbolLen = data[pos++]
  const symbol = new TextDecoder().decode(data.slice(pos, pos + symbolLen))
  pos += symbolLen
  const timeframeSec = readU32(data, pos); pos += 4

  let timestamps: number[]
  if (timeframeSec === 86400) {
    const count = readU32(data, pos); pos += 4
    const { scaled, gdc, bytesConsumed } = readLongSection(data, pos, count)
    pos += bytesConsumed
    timestamps = scaled.map(s => s * gdc)
  } else {
    const startTime = readU32(data, pos); pos += 4
    const endTime = readU32(data, pos); pos += 4
    const count = Math.round((endTime - startTime) / timeframeSec) + 1
    timestamps = Array.from({ length: count }, (_, i) => startTime + i * timeframeSec)
  }
  const n = timestamps.length

  const result: ResponseMC = { symbol, timeframeSec, t: [], o: [], h: [], l: [], c: [], v: [], oi: [], iv: [] }
  for (let i = 0; i < n; i++) result.t.push(timestamps[i])

  // 0=end  1=close-only  2=ohlc  3=volume  4=oi  5=iv
  while (pos < data.length) {
    const id = data[pos++]
    if (id === 0) break
    if (id === 1) {
      const power = readU32(data, pos); pos += 4
      const scale = Math.pow(10, power)
      const { scaled, gdc, bytesConsumed } = readLongSection(data, pos, n)
      pos += bytesConsumed
      for (let i = 0; i < n; i++) {
        const c = scaled[i] * gdc / scale
        result.o.push(c); result.h.push(c); result.l.push(c); result.c.push(c)
      }
    } else if (id === 2) {
      const power = readU32(data, pos); pos += 4
      const scale = Math.pow(10, power)
      const { scaled, gdc, bytesConsumed } = readLongSection(data, pos, n * 4)
      pos += bytesConsumed
      for (let i = 0; i < n; i++) {
        const o = scaled[i * 4 + 0] * gdc / scale
        const c = scaled[i * 4 + 3] * gdc / scale
        const p1 = scaled[i * 4 + 1] * gdc / scale
        const p2 = scaled[i * 4 + 2] * gdc / scale
        result.o.push(o)
        if (c > o) { result.l.push(p1); result.h.push(p2) }
        else { result.h.push(p1); result.l.push(p2) }
        result.c.push(c)
      }
    } else if (id === 3) {
      const { scaled, gdc, bytesConsumed } = readLongSection(data, pos, n)
      pos += bytesConsumed
      for (let i = 0; i < n; i++) result.v.push(scaled[i] * gdc)
    } else if (id === 4) {
      const { scaled, gdc, bytesConsumed } = readLongSection(data, pos, n)
      pos += bytesConsumed
      for (let i = 0; i < n; i++) result.oi.push(scaled[i] * gdc)
    } else if (id === 5) {
      const power = readU32(data, pos); pos += 4
      const scale = Math.pow(10, power)
      const { scaled, gdc, bytesConsumed } = readLongSection(data, pos, n)
      pos += bytesConsumed
      for (let i = 0; i < n; i++) result.iv.push(scaled[i] * gdc / scale)
    }
  }

  return result
}

function toCSV(mc: ResponseMC): string {
  const hasV = mc.v.length > 0
  const hasOi = mc.oi.length > 0
  const hasIv = mc.iv.length > 0
  const cols = ['time', 'open', 'high', 'low', 'close',
    ...(hasV ? ['volume'] : []), ...(hasOi ? ['oi'] : []), ...(hasIv ? ['iv'] : [])]
  const rows = mc.t.map((t, i) =>
    [t, mc.o[i].toFixed(2), mc.h[i].toFixed(2), mc.l[i].toFixed(2), mc.c[i].toFixed(2),
      ...(hasV ? [mc.v[i]] : []), ...(hasOi ? [mc.oi[i]] : []),
      ...(hasIv ? [mc.iv[i].toFixed(4)] : [])].join(',')
  )
  return [cols.join(','), ...rows].join('\n')
}

function sanitizeMC(raw: Partial<ResponseMC>, entryName: string): ResponseMC {
  return {
    symbol: raw.symbol ?? entryName.split('/').pop()?.replace(/\.json$/, '') ?? '',
    timeframeSec: raw.timeframeSec ?? 0,
    t: Array.isArray(raw.t) ? raw.t : [],
    o: Array.isArray(raw.o) ? raw.o : [],
    h: Array.isArray(raw.h) ? raw.h : [],
    l: Array.isArray(raw.l) ? raw.l : [],
    c: Array.isArray(raw.c) ? raw.c : [],
    v: Array.isArray(raw.v) ? raw.v : [],
    oi: Array.isArray(raw.oi) ? raw.oi : [],
    iv: Array.isArray(raw.iv) ? raw.iv : [],
  }
}

// Parse a row's timestamp → UTC seconds. Accepts IST datetime strings ("YYYY-MM-DD HH:MM:SS")
// or numeric epoch values (seconds, or ms if > 1e12).
function rowTimeToUtcSec(v: unknown): number {
  if (typeof v === 'number') return v > 1e12 ? Math.floor(v / 1000) : v
  const s = String(v ?? '')
  if (/^\d+$/.test(s)) { const n = Number(s); return n > 1e12 ? Math.floor(n / 1000) : n }
  const [datePart, timePart = '00:00:00'] = s.split(' ')
  const [yr, mo, dy] = datePart.split('-').map(Number)
  const [hh, mm, ss] = timePart.split(':').map(Number)
  return Math.floor(Date.UTC(yr, mo - 1, (dy || 1), hh || 0, mm || 0, ss || 0) / 1000) - IST_OFFSET
}

// Build a ResponseMC from an array of bar objects with datetime|time/open/high/low/close (+volume/open_interest).
function rowObjectsToMC(rows: Record<string, unknown>[], fallbackName: string): ResponseMC {
  const first = rows[0]
  const tKey = 'datetime' in first ? 'datetime' : 'time' in first ? 'time' : 'timestamp' in first ? 'timestamp' : 'date'
  const arr = [...rows].sort((a, b) =>
    String(a[tKey]).localeCompare(String(b[tKey]), undefined, { numeric: true })
  )
  const sym = String(first.stock_code ?? first.symbol ?? fallbackName)
  const hasOi = 'open_interest' in first || 'oi' in first
  const hasV = 'volume' in first || 'vol' in first
  const mc: ResponseMC = { symbol: sym, timeframeSec: 0, t: [], o: [], h: [], l: [], c: [], v: [], oi: [], iv: [] }
  for (const row of arr) {
    mc.t.push(rowTimeToUtcSec(row[tKey]))
    mc.o.push(Number(row.open ?? 0)); mc.h.push(Number(row.high ?? 0))
    mc.l.push(Number(row.low ?? 0)); mc.c.push(Number(row.close ?? 0))
    if (hasV) mc.v.push(Number(row.volume ?? row.vol ?? 0))
    if (hasOi) mc.oi.push(Number(row.open_interest ?? row.oi ?? 0))
  }
  if (mc.t.length > 1) mc.timeframeSec = mc.t[1] - mc.t[0]
  return mc
}

function parseJSONEntry(text: string, entryName: string): ResponseMC {
  const parsed = JSON.parse(text)
  const name = entryName.split('/').pop()?.replace(/\.json$/, '') ?? ''

  // Format: bare top-level array of bar objects [{datetime|time, open, high, low, close, volume?, open_interest?}, ...]
  if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
    return rowObjectsToMC(parsed as Record<string, unknown>[], name)
  }

  // Format: { candles: [[t,o,h,l,c,v?,oi?], ...], ... }
  if (Array.isArray(parsed.candles)) {
    const mc: ResponseMC = { symbol: name, timeframeSec: 0, t: [], o: [], h: [], l: [], c: [], v: [], oi: [], iv: [] }
    const hasOi = parsed.candles.length > 0 && parsed.candles[0].length >= 7
    for (const row of parsed.candles as number[][]) {
      mc.t.push(row[0]); mc.o.push(row[1]); mc.h.push(row[2])
      mc.l.push(row[3]); mc.c.push(row[4]); mc.v.push(row[5] ?? 0)
      if (hasOi) mc.oi.push(row[6] ?? 0)
    }
    if (mc.t.length > 1) mc.timeframeSec = mc.t[1] - mc.t[0]
    return mc
  }

  // Format: { result: [{time,open,high,low,close,volume,oi?}, ...], ... }
  if (Array.isArray(parsed.result) && parsed.result.length > 0 && 'time' in parsed.result[0]) {
    const mc: ResponseMC = { symbol: name, timeframeSec: 0, t: [], o: [], h: [], l: [], c: [], v: [], oi: [], iv: [] }
    const rows = [...parsed.result].sort((a: Record<string, number>, b: Record<string, number>) => a.time - b.time)
    const hasOi = 'oi' in rows[0]
    for (const row of rows as Record<string, number>[]) {
      mc.t.push(row.time); mc.o.push(row.open); mc.h.push(row.high)
      mc.l.push(row.low); mc.c.push(row.close); mc.v.push(row.volume ?? 0)
      if (hasOi) mc.oi.push(row.oi ?? 0)
    }
    if (mc.t.length > 1) mc.timeframeSec = mc.t[1] - mc.t[0]
    return mc
  }

  // Format: { Success: [{datetime (IST string), open, high, low, close, volume, open_interest?, stock_code, ...}] }
  if (Array.isArray(parsed.Success) && parsed.Success.length > 0 && 'datetime' in parsed.Success[0]) {
    return rowObjectsToMC(parsed.Success as Record<string, unknown>[], name)
  }

  // Yahoo Finance format: { chart: { result: [{ meta, timestamp, indicators }] } }
  if (parsed.chart?.result?.[0]?.timestamp && parsed.chart.result[0].indicators?.quote?.[0]) {
    const r = parsed.chart.result[0]
    const meta = r.meta ?? {}
    const sym = String(meta.symbol ?? name)
    const granStr: string = String(meta.dataGranularity ?? '1d')
    const granMap: Record<string, number> = { '1m': 60, '2m': 120, '5m': 300, '15m': 900, '30m': 1800, '60m': 3600, '90m': 5400, '1h': 3600, '1d': 86400, '5d': 432000, '1wk': 604800, '1mo': 2592000 }
    const tfs = granMap[granStr] ?? 86400
    const q = r.indicators.quote[0] as Record<string, (number | null)[]>
    const ts = r.timestamp as number[]
    const mc: ResponseMC = { symbol: sym, timeframeSec: tfs, t: [], o: [], h: [], l: [], c: [], v: [], oi: [], iv: [] }
    for (let i = 0; i < ts.length; i++) {
      const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i]
      if (o == null || h == null || l == null || c == null) continue
      mc.t.push(ts[i]); mc.o.push(o); mc.h.push(h); mc.l.push(l); mc.c.push(c)
      mc.v.push(q.volume?.[i] ?? 0)
    }
    return mc
  }

  // Our ResponseMC format — sanitize to guarantee all fields are arrays
  return sanitizeMC(parsed, entryName)
}

function fromCSV(text: string, entryName: string): ResponseMC {
  const lines = text.trim().split('\n')
  const headers = lines[0].split(',')
  const hasV  = headers.includes('volume')
  const hasOi = headers.includes('oi')
  const mc: ResponseMC = { symbol: entryName.split('/').pop()?.replace(/\.csv$/, '') ?? '', timeframeSec: 0, t: [], o: [], h: [], l: [], c: [], v: [], oi: [], iv: [] }
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',')
    mc.t.push(Number(c[0])); mc.o.push(Number(c[1])); mc.h.push(Number(c[2]))
    mc.l.push(Number(c[3])); mc.c.push(Number(c[4]))
    if (hasV)  mc.v.push(Number(c[5]))
    if (hasOi) mc.oi.push(Number(c[hasV ? 6 : 5]))
  }
  if (mc.t.length > 1) mc.timeframeSec = mc.t[1] - mc.t[0]
  return mc
}

function toJSON(mc: ResponseMC): string {
  return JSON.stringify(mc) // compact — used for zip download
}

function toJSONPretty(mc: ResponseMC): string {
  return JSON.stringify(mc, null, 2) // pretty — used for view only
}

function findCol(keys: string[], ...candidates: string[]): string {
  const lower = keys.map(k => k.toLowerCase())
  for (const c of candidates) {
    const idx = lower.indexOf(c.toLowerCase())
    if (idx !== -1) return keys[idx]
  }
  return ''
}

function bytesToAsyncBuffer(data: Uint8Array) {
  const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
  return { byteLength: ab.byteLength, slice: (s: number, e?: number) => Promise.resolve(ab.slice(s, e)) }
}

function fileToAsyncBuffer(file: File) {
  return { byteLength: file.size, slice: (s: number, e?: number) => file.slice(s, e).arrayBuffer() }
}

function rowsToMC(rows: Record<string, unknown>[], symName: string): ResponseMC {
  if (!rows.length) throw new Error('No rows')
  const keys = Object.keys(rows[0])
  const tCol  = findCol(keys, 'time', 't', 'timestamp', 'date', 'datetime')
  const oCol  = findCol(keys, 'open', 'o')
  const hCol  = findCol(keys, 'high', 'h')
  const lCol  = findCol(keys, 'low', 'l')
  const cCol  = findCol(keys, 'close', 'c')
  const vCol  = findCol(keys, 'volume', 'vol', 'v', 'qty')
  const oiCol = findCol(keys, 'oi', 'open_interest', 'openinterest')
  if (!tCol || !oCol || !hCol || !lCol || !cCol)
    throw new Error(`Parquet missing OHLC columns. Found: ${keys.join(', ')}`)
  const mc: ResponseMC = { symbol: symName, timeframeSec: 0, t: [], o: [], h: [], l: [], c: [], v: [], oi: [], iv: [] }
  for (const row of rows) {
    const tv = row[tCol]
    let ts: number
    if (tv instanceof Date) ts = Math.floor(tv.getTime() / 1000)
    else if (typeof tv === 'bigint') ts = Number(tv)
    else ts = Number(tv)
    mc.t.push(ts)
    mc.o.push(Number(row[oCol] ?? 0))
    mc.h.push(Number(row[hCol] ?? 0))
    mc.l.push(Number(row[lCol] ?? 0))
    mc.c.push(Number(row[cCol] ?? 0))
    if (vCol) mc.v.push(Number(row[vCol] ?? 0))
    if (oiCol) mc.oi.push(Number(row[oiCol] ?? 0))
  }
  if (mc.t.length > 1) mc.timeframeSec = mc.t[1] - mc.t[0]
  return mc
}

async function fromParquet(data: Uint8Array, entryName: string): Promise<ResponseMC> {
  const name = entryName.split('/').pop()?.replace(/\.parquet$/i, '') ?? ''
  const rows = await parquetReadObjects({ file: bytesToAsyncBuffer(data) }) as Record<string, unknown>[]
  if (!rows.length) throw new Error('Empty parquet file')
  return rowsToMC(rows, name)
}


const IST_OFFSET = 19800 // UTC+5:30 in seconds
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtIST(ts: number, showTime: boolean, showSec = false): string {
  const d = new Date((ts + IST_OFFSET) * 1000)
  const day = String(d.getUTCDate()).padStart(2, '0')
  const mon = MONTHS[d.getUTCMonth()]
  const yr  = d.getUTCFullYear()
  if (!showTime) return `${day} ${mon} ${yr}`
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  const ss = String(d.getUTCSeconds()).padStart(2, '0')
  return showSec ? `${day} ${mon} ${yr}  ${hh}:${mm}:${ss}` : `${day} ${mon} ${yr}  ${hh}:${mm}`
}

function fmtDuration(sec: number) {
  if (sec < 60) return sec + 's'
  if (sec < 3600) return (sec / 60) + 'm'
  if (sec < 86400) return (sec / 3600) + 'h'
  return 'D'
}

// ---- Folder tree ----

interface EntryState { name: string; zipObj: JSZip.JSZipObject | null; format: 'binary' | 'json' | 'csv' | 'parquet'; rawData?: Uint8Array }

interface FolderNode {
  name: string
  fullPath: string
  children: Map<string, FolderNode>
  entries: EntryState[]
  totalCount: number
}

function buildTree(entries: EntryState[]): FolderNode {
  const root: FolderNode = { name: '', fullPath: '', children: new Map(), entries: [], totalCount: 0 }
  for (const entry of entries) {
    const parts = entry.name.split('/')
    let node = root
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]
      if (!node.children.has(part)) {
        const fp = parts.slice(0, i + 1).join('/')
        node.children.set(part, { name: part, fullPath: fp, children: new Map(), entries: [], totalCount: 0 })
      }
      node = node.children.get(part)!
    }
    node.entries.push(entry)
  }
  function computeCount(n: FolderNode): number {
    n.totalCount = n.entries.length
    for (const c of n.children.values()) n.totalCount += computeCount(c)
    return n.totalCount
  }
  computeCount(root)
  return root
}

function FolderTreeView({
  node, depth, expanded, onToggle, selected, onSelect,
}: {
  node: FolderNode
  depth: number
  expanded: Record<string, boolean>
  onToggle: (path: string) => void
  selected: string | null
  onSelect: (entry: EntryState) => void
}) {
  const pl = 10 + depth * 14
  const folders = [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div>
      {folders.map(child => {
        const isOpen = !!expanded[child.fullPath]
        return (
          <div key={child.fullPath}>
            <button
              onClick={() => onToggle(child.fullPath)}
              className="w-full flex items-center gap-1.5 py-1.5 text-xs hover:bg-[#232323] text-gray-200 transition-colors"
              style={{ paddingLeft: pl + 'px', paddingRight: '10px' }}
            >
              <span className="text-[9px] text-[#00bfff] shrink-0 w-2">{isOpen ? '▼' : '▶'}</span>
              <span className="shrink-0 text-sm">📁</span>
              <span className="font-mono font-semibold text-yellow-400 truncate">{child.name}</span>
              <span className="ml-auto text-gray-600 shrink-0 tabular-nums">{child.totalCount.toLocaleString()}</span>
            </button>
            {isOpen && (
              <FolderTreeView
                node={child} depth={depth + 1}
                expanded={expanded} onToggle={onToggle}
                selected={selected} onSelect={onSelect}
              />
            )}
          </div>
        )
      })}

      {node.entries.map(entry => (
        <button
          key={entry.name}
          onClick={() => onSelect(entry)}
          className={`w-full flex items-start gap-1 py-1.5 border-b border-[#1c1c1c] text-left transition-colors hover:bg-[#232323] ${selected === entry.name ? 'bg-[#003050] text-[#00bfff]' : 'text-gray-400'}`}
          style={{ paddingLeft: pl + 'px', paddingRight: '10px' }}
        >
          <span className="shrink-0 text-[10px] mt-0.5">📄</span>
          <span className="font-mono text-[10px] leading-tight line-clamp-2 break-all">{entry.name.split('/').pop()}</span>
        </button>
      ))}
    </div>
  )
}

// ---- Main component ----

// ---- Candlestick chart ----

interface CrosshairLegend { t: number; o: number; h: number; l: number; c: number; v: number | null }

function CandleChart({ mc }: { mc: ResponseMC }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [legend, setLegend] = useState<CrosshairLegend | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current

    const intraday = mc.timeframeSec < 86400
    const showSeconds = mc.timeframeSec < 60
    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: '#0e0e0e' },
        textColor: '#888',
      },
      localization: {
        timeFormatter: (ts: UTCTimestamp) => fmtIST(ts as number, intraday, showSeconds),
      },
      grid: {
        vertLines: { color: '#1a1a1a' },
        horzLines: { color: '#1a1a1a' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: '#2a2a2a',
        scaleMargins: {
          top: 0.08,
          bottom: mc.v.length > 0 && mc.v.some(v => v > 0) ? 0.22 : 0.05,
        },
      },
      timeScale: {
        borderColor: '#2a2a2a',
        timeVisible: intraday,
        secondsVisible: showSeconds,
        tickMarkFormatter: (time: UTCTimestamp, type: TickMarkType) => {
          const d = new Date((time as number + IST_OFFSET) * 1000)
          const hh = String(d.getUTCHours()).padStart(2, '0')
          const mm = String(d.getUTCMinutes()).padStart(2, '0')
          const ss = String(d.getUTCSeconds()).padStart(2, '0')
          if (type === TickMarkType.Year)        return String(d.getUTCFullYear())
          if (type === TickMarkType.Month)       return MONTHS[d.getUTCMonth()]
          if (type === TickMarkType.DayOfMonth)  return `${String(d.getUTCDate()).padStart(2,'0')} ${MONTHS[d.getUTCMonth()]}`
          if (type === TickMarkType.TimeWithSeconds) return `${hh}:${mm}:${ss}`
          return `${hh}:${mm}`
        },
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true },
      handleScale: { axisPressedMouseMove: { time: true, price: true }, mouseWheel: true, pinch: true },
    })
    chartRef.current = chart

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    })
    const valid = (v: number) => Number.isFinite(v)
    const candleData = mc.t
      .map((t, i) => ({ time: t as UTCTimestamp, open: mc.o[i], high: mc.h[i], low: mc.l[i], close: mc.c[i] }))
      .filter(c => valid(c.time) && valid(c.open) && valid(c.high) && valid(c.low) && valid(c.close) && c.high >= c.low)
    candleSeries.setData(candleData)

    if (mc.v.length > 0 && mc.v.some(v => v > 0)) {
      const volSeries = chart.addSeries(HistogramSeries, {
        color: '#26a69a55',
        priceFormat: { type: 'volume' },
        priceScaleId: 'vol',
      })
      chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
      volSeries.setData(
        mc.t
          .map((t, i) => ({ time: t as UTCTimestamp, value: mc.v[i], color: mc.c[i] >= mc.o[i] ? '#26a69a55' : '#ef535055' }))
          .filter(c => valid(c.time) && valid(c.value))
      )
    }

    chart.timeScale().fitContent()
    const n = candleData.length
    if (n > 500) {
      chart.timeScale().setVisibleRange({
        from: candleData[n - 500].time,
        to: candleData[n - 1].time,
      })
    }

    const hasVol = mc.v.length > 0 && mc.v.some(v => v > 0)
    chart.subscribeCrosshairMove(param => {
      if (!param.time || !param.seriesData) { setLegend(null); return }
      const ts = param.time as number
      const idx = mc.t.indexOf(ts)
      if (idx === -1) { setLegend(null); return }
      setLegend({
        t: ts,
        o: mc.o[idx], h: mc.h[idx], l: mc.l[idx], c: mc.c[idx],
        v: hasVol ? mc.v[idx] : null,
      })
    })

    const ro = new ResizeObserver(() => {
      chart.resize(el.clientWidth, el.clientHeight, true)
    })
    ro.observe(el)

    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; setLegend(null) }
  }, [mc])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsFullscreen(false) }
    if (isFullscreen) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isFullscreen])

  const intraday = mc.timeframeSec < 86400
  const showSeconds = mc.timeframeSec < 60

  return (
    <div className={isFullscreen ? 'fixed inset-0 z-50' : 'relative h-[500px]'}>
      <div ref={containerRef} className="w-full h-full" />

      {/* Crosshair legend — top-left */}
      {legend && (
        <div className="absolute top-2 left-2 z-10 flex items-center gap-2 px-2 py-1 rounded bg-[#0e0e0e]/90 border border-[#2a2a2a] text-[11px] font-mono pointer-events-none select-none flex-wrap">
          <span className="text-gray-500">{fmtIST(legend.t, intraday, showSeconds)}</span>
          <span className="text-gray-400">O<span className="text-white ml-0.5">{legend.o.toFixed(2)}</span></span>
          <span className="text-gray-400">H<span className="text-green-400 ml-0.5">{legend.h.toFixed(2)}</span></span>
          <span className="text-gray-400">L<span className="text-red-400 ml-0.5">{legend.l.toFixed(2)}</span></span>
          <span className="text-gray-400">C<span className={`ml-0.5 ${legend.c >= legend.o ? 'text-green-400' : 'text-red-400'}`}>{legend.c.toFixed(2)}</span></span>
          {legend.v !== null && <span className="text-gray-400">V<span className="text-yellow-400 ml-0.5">{legend.v.toLocaleString()}</span></span>}
        </div>
      )}

      <button
        onClick={() => setIsFullscreen(f => !f)}
        title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
        className="absolute top-2 right-2 px-2.5 py-1 rounded bg-[#1a1a1a]/90 border border-[#333] text-xs text-gray-400 hover:text-white transition-all z-10"
      >
        {isFullscreen ? '⊡ Exit' : '⊞ Full'}
      </button>
    </div>
  )
}

type PreviewTab = 'chart' | 'table' | 'json' | 'csv'
const PAGE = 50

export function BhavUnpacker() {
  useSEO({
    title: 'Price Unpacker',
    description: 'Unpack OHLC binary zip — decode bit-packed candle entries, preview as JSON or CSV, and download repacked zips.',
    keywords: 'bhav, ohlc, binary, decode, zip, candle, market data',
  })

  const [entries, setEntries] = useState<EntryState[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [decoded, setDecoded] = useState<ResponseMC | null>(null)
  const [tab, setTab] = useState<PreviewTab>('table')
  const [page, setPage] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [dlState, setDlState] = useState<'idle' | 'json' | 'csv'>('idle')
  const [dlProgress, setDlProgress] = useState<{ done: number; total: number } | null>(null)
  const [filter, setFilter] = useState('')
  const [dragging, setDragging] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copiedScript, setCopiedScript] = useState(false)

  const copyPythonScript = () => {
    fetch(SCRIPT_URL).then(r => r.text()).then(text => {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedScript(true)
        setTimeout(() => setCopiedScript(false), 2000)
      })
    })
  }
  const [loadStatus, setLoadStatus] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const dataCache = useRef<Map<string, Uint8Array>>(new Map())
  const parquetMCCache = useRef<Map<string, ResponseMC>>(new Map())
  const parquetFileRef = useRef<File | null>(null)
  const parquetSymColRef = useRef<string>('')

  const loadZip = async (file: File) => {
    setError(null); setEntries([]); setSelected(null); setDecoded(null)
    setFilter(''); setExpanded({}); setShowClearConfirm(false)
    dataCache.current.clear(); parquetMCCache.current.clear()
    parquetFileRef.current = null; parquetSymColRef.current = ''

    const GB2 = 2 * 1024 * 1024 * 1024
    if (file.size > GB2) {
      setError(`File too large for the browser (${(file.size / 1e9).toFixed(1)} GB). JSZip cannot handle ZIP64 files >2 GB. Use the Python script instead:\n  python price_unpacker.py "${file.name}"`)
      return
    }

    setLoading(true)
    try {
      const zip = await JSZip.loadAsync(file)
      const result: EntryState[] = []
      for (const [name, zipObj] of Object.entries(zip.files)) {
        if (!zipObj.dir) {
            const fmt: EntryState['format'] = name.endsWith('.json') ? 'json' : name.endsWith('.csv') ? 'csv' : name.endsWith('.parquet') ? 'parquet' : 'binary'
            result.push({ name, zipObj, format: fmt })
          }
      }
      result.sort((a, b) => a.name.localeCompare(b.name))
      setEntries(result)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const loadParquetFile = async (file: File) => {
    setError(null); setEntries([]); setSelected(null); setDecoded(null)
    setFilter(''); setExpanded({}); setShowClearConfirm(false)
    dataCache.current.clear(); parquetMCCache.current.clear()
    parquetFileRef.current = file; parquetSymColRef.current = ''
    setLoading(true); setLoadStatus('Reading metadata…')
    try {
      const asyncBuf = fileToAsyncBuffer(file)

      // Step 1: read only footer metadata (a few KB) to discover column names
      const metadata = await parquetMetadataAsync(asyncBuf)
      const cols = parquetSchema(metadata).children.map((c: { element: { name: string } }) => c.element.name)
      const symCol = findCol(cols, 'symbol', 'sym', 'ticker', 'instrument', 'scrip', 'tradingsymbol')

      if (symCol) {
        parquetSymColRef.current = symCol
        setLoadStatus('Reading symbol list…')
        // Step 2: read ONLY the symbol column — hyparquet fetches only that column's bytes
        const symRows = await parquetReadObjects({ file: asyncBuf, columns: [symCol] }) as Record<string, unknown>[]
        const symbols = [...new Set(symRows.map(r => String(r[symCol] ?? 'UNKNOWN')))].sort()
        setEntries(symbols.map(sym => ({ name: sym, zipObj: null, format: 'parquet' as const })))
      } else {
        // No symbol column — read full file now and cache as single entry
        setLoadStatus('Parsing parquet…')
        const rows = await parquetReadObjects({ file: asyncBuf }) as Record<string, unknown>[]
        if (!rows.length) throw new Error('Empty parquet file')
        const baseName = file.name.replace(/\.parquet$/i, '')
        parquetMCCache.current.set(file.name, rowsToMC(rows, baseName))
        setEntries([{ name: file.name, zipObj: null, format: 'parquet' }])
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false); setLoadStatus('')
    }
  }

  const handleFile = (file: File) => {
    if (file.name.toLowerCase().endsWith('.parquet')) loadParquetFile(file)
    else loadZip(file)
  }

  const clearAll = () => {
    dataCache.current.clear(); parquetMCCache.current.clear()
    parquetFileRef.current = null; parquetSymColRef.current = ''
    setEntries([]); setSelected(null); setDecoded(null); setFilter('')
    setExpanded({}); setError(null); setShowClearConfirm(false)
  }

  useEffect(() => {
    if (entries.length === 0) return
    const first = entries[0]
    const parts = first.name.split('/')
    if (parts.length > 1) {
      const toExpand: Record<string, boolean> = {}
      for (let i = 1; i < parts.length; i++) {
        toExpand[parts.slice(0, i).join('/')] = true
      }
      setExpanded(prev => ({ ...prev, ...toExpand }))
    }
    handleSelect(first)
  }, [entries]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const loadEntryAsMC = async (entry: EntryState, cache = true): Promise<ResponseMC> => {
    if (entry.format === 'json') {
      return parseJSONEntry(await entry.zipObj!.async('string'), entry.name)
    }
    if (entry.format === 'csv') {
      const text = await entry.zipObj!.async('string')
      return fromCSV(text, entry.name)
    }
    if (entry.format === 'parquet') {
      const cached = parquetMCCache.current.get(entry.name)
      if (cached) return cached
      // On-demand: re-read from the original File with a per-symbol filter
      const pFile = parquetFileRef.current
      const symCol = parquetSymColRef.current
      if (pFile && symCol) {
        const asyncBuf = fileToAsyncBuffer(pFile)
        const rows = await parquetReadObjects({
          file: asyncBuf,
          filter: { [symCol]: { $eq: entry.name } },
        }) as Record<string, unknown>[]
        const mc = rowsToMC(rows, entry.name)
        parquetMCCache.current.set(entry.name, mc)
        return mc
      }
      // Fallback for zip-contained parquets
      const data = entry.rawData ?? await entry.zipObj!.async('uint8array')
      return fromParquet(data, entry.name)
    }
    let data = dataCache.current.get(entry.name)
    if (!data) {
      data = await entry.zipObj!.async('uint8array')
      if (cache) dataCache.current.set(entry.name, data)
    }
    return decodeEntry(data)
  }

  const handleSelect = async (entry: EntryState) => {
    if (selected === entry.name) { setSelected(null); setDecoded(null); return }
    try {
      setDecoded(await loadEntryAsMC(entry))
      setSelected(entry.name)
      setPage(0); setTab('chart'); setError(null)
    } catch (e) {
      setError(`Decode error in "${entry.name}": ${(e as Error).message}`)
    }
  }

  const toggleFolder = (path: string) => {
    setExpanded(prev => ({ ...prev, [path]: !prev[path] }))
  }

  const downloadEntry = (format: 'json' | 'csv') => {
    if (!decoded || !selected) return
    const content = format === 'json' ? toJSON(decoded) : toCSV(decoded)
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = selected.replace(/\//g, '_') + (format === 'json' ? '.json' : '.csv')
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadAll = async (format: 'json' | 'csv') => {
    setDlState(format)
    setDlProgress({ done: 0, total: entries.length })
    const ext = format === 'json' ? '.json' : '.csv'
    try {
      // Streaming zip via fflate — compresses each entry immediately so only one entry
      // lives uncompressed in memory at a time; accumulates only compressed chunks.
      const chunks: Uint8Array[] = []
      let zipError: Error | null = null
      const zip = new Zip((err, chunk) => {
        if (err) { zipError = err; return }
        chunks.push(chunk)
      })

      for (let i = 0; i < entries.length; i++) {
        if (zipError) throw zipError
        const entry = entries[i]
        const mc = await loadEntryAsMC(entry, false)
        const content = format === 'json' ? toJSON(mc) : toCSV(mc)
        const file = new ZipDeflate(entry.name + ext, { level: 1 })
        zip.add(file)
        file.push(new TextEncoder().encode(content), true)
        setDlProgress({ done: i + 1, total: entries.length })
        if (i % 100 === 0) await new Promise<void>(r => setTimeout(r, 0))
      }

      zip.end()
      if (zipError) throw zipError

      const blob = new Blob(chunks.map(c => new Uint8Array(c)), { type: 'application/zip' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `bhav_all_${format}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(`Download error: ${(e as Error).message}`)
    } finally {
      setDlState('idle')
      setDlProgress(null)
    }
  }

  const filteredEntries = useMemo(
    () => entries.filter(e => !filter || e.name.toLowerCase().includes(filter.toLowerCase())),
    [entries, filter]
  )

  const tree = useMemo(() => buildTree(filteredEntries), [filteredEntries])

  const csvText = decoded ? toCSV(decoded) : ''
  const jsonText = decoded ? toJSONPretty(decoded) : ''

  const copyContent = () => {
    const text = tab === 'csv' ? csvText : jsonText
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  const totalRows = decoded ? decoded.t.length : 0
  const totalPages = Math.ceil(totalRows / PAGE)
  const hasOi = decoded && decoded.oi.length > 0
  const hasV = decoded && decoded.v.length > 0
  const pageRows = decoded ? decoded.t.slice(page * PAGE, (page + 1) * PAGE).map((t, ri) => {
    const i = page * PAGE + ri
    return { t, o: decoded.o[i], h: decoded.h[i], l: decoded.l[i], c: decoded.c[i], v: hasV ? decoded.v[i] : null, oi: hasOi ? decoded.oi[i] : null }
  }) : []

  return (
    <div className="min-h-screen bg-[#121212] text-[#f0f0f0] flex flex-col items-center p-4 pt-8">
      <div className="w-full max-w-[1100px]">
        <a href="/" className="inline-flex items-center gap-1.5 mb-4 px-3 py-1.5 rounded border border-[#333] text-sm text-gray-400 hover:border-[#555] hover:text-gray-200 transition-all">← Home</a>
        <h1 className="text-center text-[#00bfff] text-2xl font-bold mb-1">Price Unpacker</h1>
        <p className="text-center text-gray-500 text-sm mb-3">
          Load a binary zip — decode bit-packed OHLC entries, preview, download as JSON or CSV
        </p>

        {/* Python script banner */}
        <div className="mb-6 rounded-lg border border-[#2a2a2a] bg-[#181818] px-4 py-3 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-300 font-semibold mb-0.5">Faster on your machine?</p>
            <p className="text-[11px] text-gray-500">Copy or download the Python script — run locally for fast JSON/CSV zip creation without the browser</p>
            <code className="text-[10px] text-[#00bfff] font-mono mt-1 block">python price_unpacker.py byte.zip</code>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={copyPythonScript}
              className="px-3 py-1.5 rounded border border-[#444] text-xs font-semibold text-gray-300 hover:border-[#666] hover:text-white transition-all"
            >
              {copiedScript ? <span className="text-green-400">✓ Copied!</span> : '⎘ Copy script'}
            </button>
            <a
              href={SCRIPT_URL}
              download="price_unpacker.py"
              className="px-3 py-1.5 rounded border border-[#2a4a6a] bg-[#1a2a3a] text-xs font-semibold text-[#00bfff] hover:bg-[#1e3a4e] transition-all"
            >
              ↓ price_unpacker.py
            </a>
          </div>
        </div>

        {/* Drop zone */}
        {entries.length === 0 && !loading && (
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-12 flex flex-col items-center gap-3 cursor-pointer transition-all ${dragging ? 'border-[#00bfff] bg-[#00bfff10]' : 'border-[#333] hover:border-[#555] bg-[#1a1a1a]'}`}
          >
            <span className="text-5xl">📦</span>
            <p className="text-gray-300 font-semibold">Drop zip, or click to browse</p>
            <p className="text-gray-600 text-sm">Accepts binary, JSON, CSV, Parquet, or Yahoo Finance JSON zips — or drop a standalone .parquet file</p>
            <input ref={inputRef} type="file" accept=".zip,.parquet" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-3 py-12 text-[#00bfff]">
            <span className="animate-spin text-2xl">⟳</span>
            <span>{loadStatus || 'Reading entries…'}</span>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 rounded-md bg-red-900/40 border border-red-700 text-red-300 text-sm whitespace-pre-wrap font-mono">{error}</div>
        )}

        {/* Clear confirm dialog */}
        {showClearConfirm && (
          <div className="mt-4 p-4 rounded-lg border border-red-700 bg-red-950/60 flex items-center justify-between gap-4">
            <span className="text-red-300 text-sm font-semibold">Clear all loaded data? This will unload the zip from memory.</span>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => setShowClearConfirm(false)} className="px-3 py-1.5 rounded border border-[#444] text-sm text-gray-300 hover:border-[#666] transition-all">Cancel</button>
              <button onClick={clearAll} className="px-3 py-1.5 rounded bg-red-700 text-white text-sm font-semibold hover:bg-red-600 transition-all">Clear</button>
            </div>
          </div>
        )}

        {/* Main content after load */}
        {entries.length > 0 && (
          <>
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <button
                onClick={() => inputRef.current?.click()}
                className="px-3 py-1.5 rounded border border-[#444] text-sm text-gray-400 hover:border-[#666] hover:text-gray-200 transition-all"
              >
                ← Load another
              </button>
              <input ref={inputRef} type="file" accept=".zip,.parquet" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />

              <span className="text-gray-500 text-sm">{entries.length.toLocaleString()} entries</span>

              <input
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="Filter entries…"
                className="flex-1 min-w-[140px] px-3 py-1.5 rounded border border-[#333] bg-[#1e1e1e] text-sm text-[#f0f0f0] focus:outline-none focus:border-[#00bfff]"
              />

              {(['json', 'csv'] as const).map(fmt => {
                const isActive = dlState === fmt
                const pct = isActive && dlProgress ? Math.round(dlProgress.done / dlProgress.total * 100) : 0
                const baseClass = fmt === 'json'
                  ? 'bg-[#1a3a1a] border-[#2a6a2a] text-green-400 hover:bg-[#1e4a1e]'
                  : 'bg-[#1a2a3a] border-[#2a4a6a] text-[#00bfff] hover:bg-[#1e3a4e]'
                return (
                  <button
                    key={fmt}
                    onClick={() => downloadAll(fmt)}
                    disabled={dlState !== 'idle'}
                    className={`relative overflow-hidden px-3 py-1.5 rounded border text-sm font-semibold disabled:opacity-70 transition-all ${baseClass}`}
                    style={{ minWidth: '130px' }}
                  >
                    {isActive && (
                      <span
                        className="absolute inset-y-0 left-0 opacity-20 bg-current transition-all duration-100"
                        style={{ width: pct + '%' }}
                      />
                    )}
                    <span className="relative">
                      {isActive && dlProgress
                        ? `${dlProgress.done.toLocaleString()} / ${dlProgress.total.toLocaleString()}`
                        : `All → ${fmt.toUpperCase()}.zip`}
                    </span>
                  </button>
                )
              })}

              {/* Bin / clear button */}
              <button
                onClick={() => setShowClearConfirm(v => !v)}
                title="Clear loaded data"
                className={`px-2.5 py-1.5 rounded border text-base transition-all ${showClearConfirm ? 'border-red-600 bg-red-950/50 text-red-400' : 'border-[#444] text-gray-500 hover:border-red-700 hover:text-red-400'}`}
              >
                🗑
              </button>
            </div>

            <div className="flex flex-col lg:flex-row gap-4">
              {/* Folder tree */}
              <div className="lg:w-72 shrink-0">
                <div className="rounded-lg border border-[#2a2a2a] bg-[#181818] overflow-hidden">
                  <div className="px-3 py-2 border-b border-[#2a2a2a] text-xs text-gray-500 font-semibold uppercase tracking-wider flex items-center justify-between">
                    <span>Entries {filter ? `(${filteredEntries.length.toLocaleString()})` : ''}</span>
                    <span className="text-[10px] text-gray-700 normal-case font-normal">click folder to expand</span>
                  </div>
                  <div className="overflow-y-auto max-h-[600px]">
                    {filteredEntries.length === 0 && (
                      <div className="p-4 text-gray-600 text-sm text-center">No matches</div>
                    )}
                    <FolderTreeView
                      node={tree}
                      depth={0}
                      expanded={expanded}
                      onToggle={toggleFolder}

                      selected={selected}
                      onSelect={handleSelect}
                    />
                  </div>
                </div>
              </div>

              {/* Preview panel */}
              <div className="flex-1 min-w-0">
                {!decoded && (
                  <div className="h-64 flex items-center justify-center text-gray-600 border border-dashed border-[#333] rounded-lg text-sm">
                    Click an entry to preview
                  </div>
                )}
                {decoded && (
                  <div className="rounded-lg border border-[#2a2a2a] bg-[#181818] overflow-hidden">
                    <div className="px-4 py-3 border-b border-[#2a2a2a] flex flex-wrap items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <span className="font-mono text-[#00bfff] text-sm font-bold truncate block">{decoded.symbol}</span>
                        <span className="text-xs text-gray-500">{fmtDuration(decoded.timeframeSec)} · {totalRows.toLocaleString()} candles</span>
                        {selected && <span className="font-mono text-[10px] text-gray-600 truncate block mt-0.5">{selected}</span>}
                      </div>
                      <button onClick={() => downloadEntry('json')} className="px-2.5 py-1 rounded bg-[#1a3a1a] border border-[#2a6a2a] text-green-400 text-xs font-semibold hover:bg-[#1e4a1e] transition-all">↓ JSON</button>
                      <button onClick={() => downloadEntry('csv')} className="px-2.5 py-1 rounded bg-[#1a2a3a] border border-[#2a4a6a] text-[#00bfff] text-xs font-semibold hover:bg-[#1e3a4e] transition-all">↓ CSV</button>
                    </div>

                    <div className="flex items-center border-b border-[#2a2a2a]">
                      {(['chart', 'table', 'json', 'csv'] as PreviewTab[]).map(t => (
                        <button key={t} onClick={() => setTab(t)}
                          className={`px-4 py-2 text-xs font-semibold uppercase tracking-wide transition-all ${tab === t ? 'text-[#00bfff] border-b-2 border-[#00bfff]' : 'text-gray-500 hover:text-gray-300'}`}
                        >{t}</button>
                      ))}
                      <button
                        onClick={copyContent}
                        title={`Copy ${tab === 'csv' ? 'CSV' : 'JSON'}`}
                        className="ml-auto mr-2 px-2 py-1 rounded text-xs transition-all text-gray-500 hover:text-gray-200"
                      >
                        {copied ? <span className="text-green-400 font-semibold">✓ Copied</span> : '⎘ Copy'}
                      </button>
                    </div>

                    {tab === 'chart' && (
                      <CandleChart mc={decoded} />
                    )}

                    {tab === 'table' && (
                      <div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs font-mono">
                            <thead>
                              <tr className="border-b border-[#2a2a2a] text-gray-500">
                                <th className="px-3 py-2 text-left">time</th>
                                <th className="px-3 py-2 text-right">open</th>
                                <th className="px-3 py-2 text-right">high</th>
                                <th className="px-3 py-2 text-right">low</th>
                                <th className="px-3 py-2 text-right">close</th>
                                {hasV && <th className="px-3 py-2 text-right">volume</th>}
                                {hasOi && <th className="px-3 py-2 text-right">oi</th>}
                              </tr>
                            </thead>
                            <tbody>
                              {pageRows.map((row, i) => (
                                <tr key={i} className="border-b border-[#1e1e1e] hover:bg-[#202020] transition-colors">
                                  <td className="px-3 py-1.5 text-gray-400">{row.t}</td>
                                  <td className="px-3 py-1.5 text-right text-gray-300">{row.o.toFixed(2)}</td>
                                  <td className="px-3 py-1.5 text-right text-green-400">{row.h.toFixed(2)}</td>
                                  <td className="px-3 py-1.5 text-right text-red-400">{row.l.toFixed(2)}</td>
                                  <td className={`px-3 py-1.5 text-right font-semibold ${row.c >= row.o ? 'text-green-400' : 'text-red-400'}`}>{row.c.toFixed(2)}</td>
                                  {hasV && <td className="px-3 py-1.5 text-right text-gray-400">{row.v?.toLocaleString()}</td>}
                                  {hasOi && <td className="px-3 py-1.5 text-right text-yellow-500">{row.oi?.toLocaleString()}</td>}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {totalPages > 1 && (
                          <div className="flex items-center justify-center gap-3 px-4 py-3 border-t border-[#2a2a2a]">
                            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1 rounded border border-[#333] text-sm text-gray-400 disabled:opacity-30 hover:border-[#555] transition-all">‹</button>
                            <span className="text-xs text-gray-500">Page {page + 1} / {totalPages} · {totalRows.toLocaleString()} rows</span>
                            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1} className="px-3 py-1 rounded border border-[#333] text-sm text-gray-400 disabled:opacity-30 hover:border-[#555] transition-all">›</button>
                          </div>
                        )}
                      </div>
                    )}

                    {tab === 'json' && (
                      <pre className="p-4 text-xs font-mono text-gray-300 overflow-auto max-h-[520px] whitespace-pre-wrap break-all">{jsonText}</pre>
                    )}
                    {tab === 'csv' && (
                      <pre className="p-4 text-xs font-mono text-gray-300 overflow-auto max-h-[520px] whitespace-pre">{csvText}</pre>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
