import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const BYTES_PER_ROW = 16
const ROW_HEIGHT = 20
// Browsers stop growing an element somewhere past ~33M px, so for big files the
// scrollbar is scaled: scroll position maps proportionally onto the row index.
const MAX_SPACER = 10_000_000

const hex2 = (b: number) => b.toString(16).padStart(2, '0')
const ascii = (b: number) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.')

// Mount with a key per file so offset/selection reset between files.
// Only the visible window of rows is ever read from the Blob, so multi-GB files are fine
export function HexViewer({ blob }: { blob: Blob }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [viewH, setViewH] = useState(480)
  const [scrollTop, setScrollTop] = useState(0)
  const [chunk, setChunk] = useState<{ start: number; bytes: Uint8Array } | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [goto, setGoto] = useState('')

  const totalRows = Math.max(1, Math.ceil(blob.size / BYTES_PER_ROW))
  const visibleRows = Math.max(1, Math.floor(viewH / ROW_HEIGHT))
  const spacer = Math.min(totalRows * ROW_HEIGHT, MAX_SPACER)
  const maxScroll = Math.max(0, spacer - viewH)
  const maxFirst = Math.max(0, totalRows - visibleRows)
  const firstRow = maxScroll > 0 ? Math.round((scrollTop / maxScroll) * maxFirst) : 0
  const offsetDigits = Math.max(8, blob.size.toString(16).length)

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewH(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false
    const start = firstRow * BYTES_PER_ROW
    blob.slice(start, start + (visibleRows + 1) * BYTES_PER_ROW).arrayBuffer().then(buf => {
      if (!cancelled) setChunk({ start, bytes: new Uint8Array(buf) })
    })
    return () => { cancelled = true }
  }, [blob, firstRow, visibleRows])

  const jumpTo = (offset: number) => {
    if (!Number.isFinite(offset) || offset < 0 || offset >= blob.size) return
    const row = Math.min(Math.floor(offset / BYTES_PER_ROW), maxFirst)
    const top = maxFirst > 0 ? (row / maxFirst) * maxScroll : 0
    if (scrollRef.current) scrollRef.current.scrollTop = top
    setScrollTop(top)
    setSelected(offset)
  }

  const submitGoto = (e: React.FormEvent) => {
    e.preventDefault()
    const v = goto.trim().toLowerCase()
    // "0x1f" or anything with a-f is hex, plain digits are decimal
    const n = v.startsWith('0x') ? parseInt(v.slice(2), 16) : /[a-f]/.test(v) ? parseInt(v, 16) : parseInt(v, 10)
    jumpTo(n)
  }

  const rows: { offset: number; bytes: Uint8Array }[] = []
  if (chunk) {
    for (let r = 0; r < visibleRows + 1; r++) {
      const rel = (firstRow + r) * BYTES_PER_ROW - chunk.start
      if (rel < 0 || rel >= chunk.bytes.length) break
      rows.push({ offset: chunk.start + rel, bytes: chunk.bytes.subarray(rel, rel + BYTES_PER_ROW) })
    }
  }

  const selectedByte = selected !== null && chunk && selected >= chunk.start && selected < chunk.start + chunk.bytes.length
    ? chunk.bytes[selected - chunk.start]
    : null

  const cellCls = (off: number) => (off === selected ? 'bg-[#00bfff] text-[#0b0b0b] rounded-sm' : 'hover:bg-[#333] rounded-sm')

  return (
    <div>
      <form onSubmit={submitGoto} className="flex flex-wrap items-center gap-2 mb-2 text-xs">
        <input
          value={goto}
          onChange={e => setGoto(e.target.value)}
          placeholder="Go to offset (0x1F0 or 496)"
          className="flex-1 min-w-[160px] p-1.5 rounded-md border border-[#333] bg-[#1e1e1e] font-mono focus:outline-none focus:border-[#00bfff]"
        />
        <button type="submit" className="px-3 py-1.5 rounded-md bg-[#262626]! border! border-[#444]! text-gray-200 cursor-pointer">Go</button>
        <span className="text-gray-500 font-mono">
          {selected !== null
            ? `@0x${selected.toString(16)} (${selected})${selectedByte !== null ? ` = 0x${hex2(selectedByte)} · ${selectedByte} · '${ascii(selectedByte)}'` : ''}`
            : `${blob.size.toLocaleString()} bytes`}
        </span>
      </form>

      <div
        ref={scrollRef}
        onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
        className="h-[60vh] overflow-auto rounded-md border border-[#333] bg-[#161616]"
      >
        <div className="sticky top-0 font-mono text-xs whitespace-pre" style={{ height: viewH }}>
          {rows.map(({ offset, bytes }) => (
            <div key={offset} className="flex gap-4 px-2" style={{ height: ROW_HEIGHT, lineHeight: `${ROW_HEIGHT}px` }}>
              <span className="text-gray-500 select-none">{offset.toString(16).padStart(offsetDigits, '0')}</span>
              <span className="text-gray-200">
                {Array.from({ length: BYTES_PER_ROW }, (_, i) => (
                  <span key={i} className={i === 8 ? 'ml-2' : ''}>
                    {i < bytes.length
                      ? <span onClick={() => setSelected(offset + i)} className={`cursor-pointer px-[1px] ${cellCls(offset + i)}`}>{hex2(bytes[i])}</span>
                      : <span className="px-[1px]">{'  '}</span>}
                    {i < BYTES_PER_ROW - 1 ? ' ' : ''}
                  </span>
                ))}
              </span>
              <span className="text-[#f0a500]">
                {Array.from(bytes, (b, i) => (
                  <span key={i} onClick={() => setSelected(offset + i)} className={`cursor-pointer ${cellCls(offset + i)}`}>{ascii(b)}</span>
                ))}
              </span>
            </div>
          ))}
        </div>
        <div style={{ height: Math.max(0, spacer - viewH) }} />
      </div>
    </div>
  )
}
