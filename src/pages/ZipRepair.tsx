import { useState, useRef, useCallback } from 'react'
import { zipSync } from 'fflate'
import { useSEO } from '../utils/useSEO'
import {
  scanSignatures, diagnose, recoverEntries, formatBytes, METHOD_NAMES,
  type Diagnosis, type RepairedEntry, type ScanResult, type EntryStatus,
} from '../utils/zipRepair'

const STATUS_STYLE: Record<EntryStatus, string> = {
  ok: 'bg-green-900/40 text-green-400 border-green-800',
  unverified: 'bg-sky-900/40 text-sky-400 border-sky-800',
  partial: 'bg-amber-900/40 text-amber-400 border-amber-800',
  crc: 'bg-orange-900/40 text-orange-400 border-orange-800',
  failed: 'bg-red-900/40 text-red-400 border-red-800',
  unsupported: 'bg-neutral-800 text-gray-400 border-neutral-700',
  dir: 'bg-neutral-800 text-gray-500 border-neutral-700',
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

const STATUS_LABEL: Record<EntryStatus, string> = {
  ok: 'verified', unverified: 'recovered', partial: 'partial',
  crc: 'crc fail', failed: 'failed', unsupported: 'skipped', dir: 'folder',
}

export function ZipRepair() {
  useSEO({
    title: 'Zip Repair — Recover Corrupt Archives',
    description: 'Repair broken, truncated or renamed zip files entirely in your browser. Rebuilds a missing central directory, recovers readable entries and downloads a fixed archive. No upload, no server.',
    keywords: 'zip repair, fix corrupt zip, recover zip, broken archive, truncated zip, repair zip online, tmp file zip',
  })

  const [file, setFile] = useState<File | null>(null)
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null)
  const [entries, setEntries] = useState<RepairedEntry[] | null>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [building, setBuilding] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const bytesRef = useRef<Uint8Array | null>(null)
  const scanRef = useRef<ScanResult | null>(null)

  const reset = () => {
    bytesRef.current = null
    scanRef.current = null
    setFile(null); setDiagnosis(null); setEntries(null)
    setError(''); setProgress(''); setBusy(false); setBuilding(false)
  }

  const handleFile = useCallback(async (f: File) => {
    reset()
    setFile(f)
    setBusy(true)
    setProgress('Reading file…')
    try {
      const buf = new Uint8Array(await f.arrayBuffer())
      bytesRef.current = buf

      const scan = await scanSignatures(buf, pct => setProgress(`Scanning… ${pct}%`))
      scanRef.current = scan

      // Whether a normal reader opens it is the difference between "needs
      // repair" and "was fine all along, just misnamed".
      setProgress('Checking with a standard reader…')
      let opensNormally = false
      try {
        const JSZip = (await import('jszip')).default
        await JSZip.loadAsync(buf)
        opensNormally = true
      } catch { /* expected for the archives this page exists for */ }

      setDiagnosis(diagnose(f.name, f.size, buf, scan, opensNormally))
    } catch (e) {
      setError(`Could not read file: ${errText(e)}`)
    } finally {
      setBusy(false)
      setProgress('')
    }
  }, [])

  const startRepair = useCallback(async () => {
    const buf = bytesRef.current
    const scan = scanRef.current
    if (!buf || !scan) return
    setBusy(true)
    setError('')
    setEntries(null)
    try {
      const recovered = await recoverEntries(buf, scan, (done, total, name) => {
        setProgress(`Recovering ${done} / ${total} — ${name}`)
      })
      if (!recovered.length) {
        setError('No valid entries could be recovered from this file.')
        return
      }
      setEntries(recovered)
    } catch (e) {
      setError(`Repair failed: ${errText(e)}`)
    } finally {
      setBusy(false)
      setProgress('')
    }
  }, [])

  const downloadBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const downloadRepaired = useCallback(async () => {
    if (!entries) return
    setBuilding(true)
    setError('')
    await new Promise(r => setTimeout(r, 0))
    try {
      const files: Record<string, Uint8Array> = {}
      for (const e of entries) {
        if (e.status === 'dir' || e.status === 'failed' || e.status === 'unsupported') continue
        files[e.name] = e.data
      }
      if (!Object.keys(files).length) {
        setError('Nothing recoverable to package.')
        return
      }
      const zipped = zipSync(files, { level: 6 })
      const base = (file?.name || 'archive').replace(/\.[^.]+$/, '')
      downloadBlob(new Blob([zipped as unknown as BlobPart], { type: 'application/zip' }), `${base}-repaired.zip`)
    } catch (e) {
      setError(`Could not build the repaired zip: ${errText(e)}`)
    } finally {
      setBuilding(false)
    }
  }, [entries, file])

  const onDrop = (ev: React.DragEvent) => {
    ev.preventDefault()
    setDragging(false)
    const f = ev.dataTransfer.files?.[0]
    if (f) handleFile(f)
  }

  const summary = entries && {
    ok: entries.filter(e => e.status === 'ok').length,
    unverified: entries.filter(e => e.status === 'unverified').length,
    partial: entries.filter(e => e.status === 'partial').length,
    crc: entries.filter(e => e.status === 'crc').length,
    lost: entries.filter(e => e.status === 'failed' || e.status === 'unsupported').length,
    bytes: entries.reduce((s, e) => s + e.data.length, 0),
  }

  return (
    <div className="min-h-screen bg-[#121212] text-[#f0f0f0] flex flex-col items-center p-4 pt-8">
      <div className="w-full max-w-[1100px]">
        <a href="/" className="inline-flex items-center gap-1.5 mb-4 px-3 py-1.5 rounded border border-[#333] text-sm text-gray-400 hover:border-[#555] hover:text-gray-200 transition-all">← Home</a>
        <h1 className="text-center text-[#00bfff] text-2xl font-bold mb-1">Zip Repair</h1>
        <p className="text-center text-gray-500 text-sm mb-6">
          Recover entries from a broken, truncated or renamed archive — everything runs in your browser, nothing is uploaded
        </p>

        {/* Drop zone */}
        {!file && (
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-12 flex flex-col items-center gap-3 cursor-pointer transition-all ${dragging ? 'border-[#00bfff] bg-[#00bfff10]' : 'border-[#333] hover:border-[#555] bg-[#1a1a1a]'}`}
          >
            <span className="text-5xl">🩹</span>
            <p className="text-gray-300 font-semibold">Drop a file, or click to browse</p>
            <p className="text-gray-600 text-sm text-center max-w-[520px]">
              Any extension works — .zip, .tmp, .part, .crdownload, .bin, or none at all.
              The file is identified by its bytes, not its name.
            </p>
            <input ref={inputRef} type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          </div>
        )}

        {busy && (
          <div className="flex items-center justify-center gap-3 py-10 text-[#00bfff]">
            <span className="animate-spin text-2xl">⟳</span>
            <span className="text-sm truncate max-w-[80vw]">{progress || 'Working…'}</span>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 rounded-md bg-red-900/40 border border-red-700 text-red-300 text-sm whitespace-pre-wrap font-mono">{error}</div>
        )}

        {/* Diagnosis */}
        {diagnosis && !busy && (
          <div className="mt-4 rounded-lg border border-[#2a2a2a] bg-[#181818] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="min-w-0">
                <p className="font-semibold text-gray-200 truncate">{diagnosis.fileName}</p>
                <p className="text-xs text-gray-500">{formatBytes(diagnosis.fileSize)}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={reset}
                  className="px-3 py-1.5 rounded border border-[#444] text-sm text-gray-400 hover:border-[#666] hover:text-gray-200 transition-all"
                >
                  Load another
                </button>
                {!entries && (
                  <button
                    onClick={startRepair}
                    disabled={!diagnosis.localHeaders}
                    className="px-4 py-1.5 rounded border border-[#2a4a6a] bg-[#1a2a3a] text-sm font-semibold text-[#00bfff] hover:bg-[#1e3a4e] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    Start Repair
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              {[
                ['Entries found', diagnosis.localHeaders.toLocaleString()],
                ['Directory records', diagnosis.centralHeaders.toLocaleString()],
                ['EOCD record', diagnosis.hasEocd ? 'present' : 'missing'],
                ['Standard reader', diagnosis.opensNormally ? 'opens' : 'fails'],
              ].map(([label, value]) => (
                <div key={label} className="rounded border border-[#2a2a2a] bg-[#141414] px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-gray-600">{label}</p>
                  <p className="text-sm font-semibold text-gray-200">{value}</p>
                </div>
              ))}
            </div>

            {diagnosis.problems.length > 0 && (
              <ul className="space-y-1">
                {diagnosis.problems.map((p, i) => (
                  <li key={i} className="text-xs text-amber-300/90 flex gap-2">
                    <span className="text-amber-500 shrink-0">▸</span>{p}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Results */}
        {entries && !busy && summary && (
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-sm text-gray-400">
                {entries.length.toLocaleString()} entries · {formatBytes(summary.bytes)} recovered
              </span>
              {summary.ok > 0 && <span className="text-xs px-2 py-0.5 rounded border border-green-800 bg-green-900/40 text-green-400">{summary.ok} verified</span>}
              {summary.unverified > 0 && <span className="text-xs px-2 py-0.5 rounded border border-sky-800 bg-sky-900/40 text-sky-400">{summary.unverified} recovered</span>}
              {summary.partial > 0 && <span className="text-xs px-2 py-0.5 rounded border border-amber-800 bg-amber-900/40 text-amber-400">{summary.partial} partial</span>}
              {summary.crc > 0 && <span className="text-xs px-2 py-0.5 rounded border border-orange-800 bg-orange-900/40 text-orange-400">{summary.crc} crc fail</span>}
              {summary.lost > 0 && <span className="text-xs px-2 py-0.5 rounded border border-red-800 bg-red-900/40 text-red-400">{summary.lost} lost</span>}
              <button
                onClick={downloadRepaired}
                disabled={building}
                className="ml-auto px-4 py-1.5 rounded border border-[#2a6a2a] bg-[#1a3a1a] text-sm font-semibold text-green-400 hover:bg-[#1e4a1e] disabled:opacity-60 transition-all"
              >
                {building ? 'Packing…' : '↓ Download repaired.zip'}
              </button>
            </div>

            <div className="rounded-lg border border-[#2a2a2a] overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#181818] text-gray-500 text-xs uppercase tracking-wide">
                    <th className="text-left font-medium px-3 py-2">Name</th>
                    <th className="text-right font-medium px-3 py-2">Size</th>
                    <th className="text-left font-medium px-3 py-2">Method</th>
                    <th className="text-left font-medium px-3 py-2">Status</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr key={i} className="border-t border-[#222] hover:bg-[#181818]">
                      <td className="px-3 py-2 font-mono text-xs text-gray-300 max-w-[340px] truncate" title={e.rawName}>{e.name}</td>
                      <td className="px-3 py-2 text-right text-gray-400 whitespace-nowrap">{e.status === 'dir' ? '—' : formatBytes(e.data.length)}</td>
                      <td className="px-3 py-2 text-gray-500 text-xs">{METHOD_NAMES[e.method] || e.method}</td>
                      <td className="px-3 py-2">
                        <span className={`text-[11px] px-2 py-0.5 rounded border ${STATUS_STYLE[e.status]}`}>{STATUS_LABEL[e.status]}</span>
                        {e.note && <span className="ml-2 text-[11px] text-gray-600">{e.note}</span>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {e.data.length > 0 && (
                          <button
                            onClick={() => downloadBlob(new Blob([e.data as unknown as BlobPart]), e.name.split('/').pop() || 'file')}
                            className="text-xs text-[#00bfff] hover:underline whitespace-nowrap"
                          >
                            save
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!file && (
          <div className="mt-6 rounded-lg border border-[#2a2a2a] bg-[#181818] p-4 text-xs text-gray-500 leading-relaxed">
            <p className="text-gray-400 font-semibold mb-2 text-sm">What this can and cannot fix</p>
            <p className="mb-1">
              <span className="text-green-400">Fixable:</span> missing or damaged central directory, missing EOCD record,
              renamed files (.tmp/.part), leading junk or self-extracting stubs, streamed zips that write sizes after the data,
              and truncated downloads — everything before the cut point comes back, plus a partial tail.
            </p>
            <p>
              <span className="text-red-400">Not fixable:</span> bit-rot inside a compressed stream desyncs everything after it,
              so only the prefix survives. Encrypted entries, and bzip2/lzma/zstd compression, cannot be decoded here.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
