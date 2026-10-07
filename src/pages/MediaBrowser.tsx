import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSEO } from '../utils/useSEO'
import { formatBytes } from '../utils/zipRepair'
import { HexViewer } from '../components/HexViewer'

interface FileItem {
  path: string
  size: number
  load: () => Promise<Blob>
}

type TreeNode =
  | { id: string; name: string; dir: true; children: TreeNode[] }
  | { id: string; name: string; dir: false; path: string; size: number; load: () => Promise<Blob> }
type FileNode = Extract<TreeNode, { dir: false }>

type Kind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'archive' | 'binary'
type Tab = 'preview' | 'hex'

const EXT_KIND: Record<string, [Kind, string]> = {
  png: ['image', 'image/png'], jpg: ['image', 'image/jpeg'], jpeg: ['image', 'image/jpeg'], gif: ['image', 'image/gif'],
  webp: ['image', 'image/webp'], bmp: ['image', 'image/bmp'], svg: ['image', 'image/svg+xml'], ico: ['image', 'image/x-icon'],
  avif: ['image', 'image/avif'],
  mp4: ['video', 'video/mp4'], m4v: ['video', 'video/mp4'], webm: ['video', 'video/webm'], mov: ['video', 'video/quicktime'],
  ogv: ['video', 'video/ogg'], mkv: ['video', 'video/x-matroska'],
  mp3: ['audio', 'audio/mpeg'], wav: ['audio', 'audio/wav'], ogg: ['audio', 'audio/ogg'], m4a: ['audio', 'audio/mp4'],
  flac: ['audio', 'audio/flac'], aac: ['audio', 'audio/aac'], opus: ['audio', 'audio/ogg'],
  pdf: ['pdf', 'application/pdf'],
  zip: ['archive', 'application/zip'], jar: ['archive', 'application/zip'], apk: ['archive', 'application/zip'],
  docx: ['archive', 'application/zip'], xlsx: ['archive', 'application/zip'], pptx: ['archive', 'application/zip'],
  epub: ['archive', 'application/zip'], aar: ['archive', 'application/zip'],
}

const extOf = (name: string) => name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
const isArchiveName = (name: string) => EXT_KIND[extOf(name)]?.[0] === 'archive'

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v)

// Extension first; for unknown extensions fall back to magic bytes, then a "looks like UTF-8 text" check
function sniff(name: string, head: Uint8Array): [Kind, string] {
  const byExt = EXT_KIND[extOf(name)]
  if (byExt) return byExt
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47])) return ['image', 'image/png']
  if (startsWith(head, [0xff, 0xd8, 0xff])) return ['image', 'image/jpeg']
  if (startsWith(head, [0x47, 0x49, 0x46, 0x38])) return ['image', 'image/gif']
  if (startsWith(head, [0x52, 0x49, 0x46, 0x46]) && startsWith(head, [0x57, 0x45, 0x42, 0x50], 8)) return ['image', 'image/webp']
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46])) return ['pdf', 'application/pdf']
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04]) || startsWith(head, [0x50, 0x4b, 0x05, 0x06])) return ['archive', 'application/zip']
  if (startsWith(head, [0x66, 0x74, 0x79, 0x70], 4)) return ['video', 'video/mp4']
  if (startsWith(head, [0x1a, 0x45, 0xdf, 0xa3])) return ['video', 'video/webm']
  if (startsWith(head, [0x49, 0x44, 0x33])) return ['audio', 'audio/mpeg']
  if (head.includes(0)) return ['binary', 'application/octet-stream']
  // Allow a multi-byte character cut off at the end of the sniffed chunk
  for (let cut = 0; cut <= 3 && cut < head.length; cut++) {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(head.subarray(0, head.length - cut))
      return ['text', 'text/plain']
    } catch { /* try a shorter slice */ }
  }
  return ['binary', 'application/octet-stream']
}

let nextId = 0
function buildTree(items: FileItem[]): TreeNode[] {
  const root: TreeNode[] = []
  const dirs = new Map<string, TreeNode[]>([['', root]])
  for (const item of items) {
    const parts = item.path.split('/').filter(Boolean)
    let parentPath = ''
    for (let i = 0; i < parts.length - 1; i++) {
      const dirPath = parentPath + parts[i] + '/'
      if (!dirs.has(dirPath)) {
        const children: TreeNode[] = []
        dirs.get(parentPath)!.push({ id: `n${nextId++}`, name: parts[i], dir: true, children })
        dirs.set(dirPath, children)
      }
      parentPath = dirPath
    }
    if (parts.length) {
      dirs.get(parentPath)!.push({ id: `n${nextId++}`, name: parts[parts.length - 1], dir: false, path: item.path, size: item.size, load: item.load })
    }
  }
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name, undefined, { numeric: true }))
    nodes.forEach(n => n.dir && sort(n.children))
  }
  sort(root)
  return root
}

const fileToItem = (file: File, path: string): FileItem => ({ path, size: file.size, load: async () => file })

// Walk a dropped folder; readEntries returns results in batches until it returns an empty array
async function readDropped(entry: FileSystemEntry, prefix: string, out: FileItem[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej))
    out.push(fileToItem(file, prefix + entry.name))
  } else if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej))
      if (!batch.length) break
      for (const child of batch) await readDropped(child, prefix + entry.name + '/', out)
    }
  }
}

const countFiles = (nodes: TreeNode[]): number => nodes.reduce((n, c) => n + (c.dir ? countFiles(c.children) : 1), 0)

const TEXT_LIMIT = 1_000_000
const iconFor = (name: string) => {
  const kind = EXT_KIND[extOf(name)]?.[0]
  return kind === 'image' ? '🖼️' : kind === 'video' ? '🎬' : kind === 'audio' ? '🎵' : kind === 'pdf' ? '📕' : kind === 'archive' ? '🗜️' : '📄'
}

export function MediaBrowser() {
  useSEO({
    title: 'Media Browser',
    description: 'Browse local files and zip archives in your browser — preview text, images, video, audio and PDF, with a hex viewer for any file. Nothing is uploaded.',
    keywords: 'file browser, zip viewer, hex viewer, hex editor, pdf viewer, image viewer, video player, open zip online',
  })

  const [tree, setTree] = useState<TreeNode[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  // Children of archive files once they've been opened, keyed by the archive's node id
  const [archives, setArchives] = useState<Record<string, TreeNode[]>>({})
  const [archiveBusy, setArchiveBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const [selected, setSelected] = useState<FileNode | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [kind, setKind] = useState<Kind>('binary')
  const [url, setUrl] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('preview')
  const [text, setText] = useState<{ value: string; truncated: boolean } | null>(null)
  const [wrap, setWrap] = useState(true)
  const [imgSize, setImgSize] = useState<string | null>(null)
  const [loadingFile, setLoadingFile] = useState(false)

  const viewerRef = useRef<HTMLDivElement>(null)

  const addItems = (items: FileItem[]) => {
    if (!items.length) return
    setError(null)
    const nodes = buildTree(items)
    setTree(t => [...t, ...nodes])
    // Opening a single file means you want to see it — skip the "select a file" step
    if (items.length === 1) {
      let node = nodes[0]
      const dirIds: string[] = []
      while (node.dir) { dirIds.push(node.id); node = node.children[0] }
      if (dirIds.length) setExpanded(s => new Set([...s, ...dirIds]))
      setSelected(node)
    }
  }

  const onPick = (files: FileList | null) => {
    if (!files) return
    addItems(Array.from(files, f => fileToItem(f, f.webkitRelativePath || f.name)))
  }

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const entries = Array.from(e.dataTransfer.items, i => i.webkitGetAsEntry()).filter((x): x is FileSystemEntry => !!x)
    if (entries.length) {
      const out: FileItem[] = []
      try {
        for (const entry of entries) await readDropped(entry, '', out)
      } catch (err) {
        setError((err as Error).message)
      }
      addItems(out)
    } else {
      onPick(e.dataTransfer.files)
    }
  }

  const clearAll = () => {
    setTree([])
    setArchives({})
    setExpanded(new Set())
    setSelected(null)
  }

  const toggle = (id: string) =>
    setExpanded(s => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const openArchive = async (node: FileNode) => {
    if (archives[node.id]) { toggle(node.id); return }
    setArchiveBusy(node.id)
    setError(null)
    try {
      const JSZip = (await import('jszip')).default
      const zip = await JSZip.loadAsync(await node.load())
      const items: FileItem[] = []
      zip.forEach((relPath, file) => {
        if (file.dir) return
        // uncompressedSize isn't in JSZip's public types but is read from the central directory
        const size = (file as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0
        items.push({ path: relPath, size, load: () => file.async('blob') })
      })
      setArchives(a => ({ ...a, [node.id]: buildTree(items) }))
      setExpanded(s => new Set(s).add(node.id))
    } catch (err) {
      setError(`${node.name}: ${(err as Error).message}`)
    } finally {
      setArchiveBusy(null)
    }
  }

  const select = (node: FileNode) => {
    setSelected(node)
    if (window.innerWidth < 768) setTimeout(() => viewerRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  // Load the selected file and work out how to show it
  useEffect(() => {
    if (!selected) { setBlob(null); return }
    let cancelled = false
    setLoadingFile(true)
    setText(null)
    setImgSize(null)
    ;(async () => {
      try {
        const raw = await selected.load()
        const head = new Uint8Array(await raw.slice(0, 4096).arrayBuffer())
        const [k, mime] = sniff(selected.name, head)
        // Zip entries come back untyped; video/pdf players need the real MIME type
        const typed = raw.type === mime ? raw : new Blob([raw], { type: mime })
        if (cancelled) return
        setBlob(typed)
        setKind(k)
        setTab(k === 'binary' ? 'hex' : 'preview')
        if (k === 'text') {
          const value = await typed.slice(0, TEXT_LIMIT).text()
          if (!cancelled) setText({ value, truncated: typed.size > TEXT_LIMIT })
        }
      } catch (err) {
        if (!cancelled) { setError((err as Error).message); setBlob(null) }
      } finally {
        if (!cancelled) setLoadingFile(false)
      }
    })()
    return () => { cancelled = true }
  }, [selected])

  useEffect(() => {
    if (!blob || !['image', 'video', 'audio', 'pdf'].includes(kind)) { setUrl(null); return }
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob, kind])

  const loadFullText = async () => {
    if (blob) setText({ value: await blob.text(), truncated: false })
  }

  const download = () => {
    if (!blob || !selected) return
    const u = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = u
    a.download = selected.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(u), 1000)
  }

  const renderNodes = (nodes: TreeNode[], depth: number) =>
    nodes.map(node => {
      const pad = { paddingLeft: 8 + depth * 14 }
      if (node.dir) {
        const open = expanded.has(node.id)
        return (
          <div key={node.id}>
            <button onClick={() => toggle(node.id)} style={pad} className="w-full flex items-center gap-1.5 py-1 pr-2 text-left text-sm text-gray-300 hover:bg-[#262626]! bg-transparent! border-0! cursor-pointer rounded">
              <span className="w-3 text-gray-500 text-xs">{open ? '▾' : '▸'}</span>📁 <span className="truncate">{node.name}</span>
            </button>
            {open && renderNodes(node.children, depth + 1)}
          </div>
        )
      }
      const archive = isArchiveName(node.name)
      const open = expanded.has(node.id)
      const isSel = selected?.id === node.id
      return (
        <div key={node.id}>
          <div style={pad} className={`flex items-center gap-1.5 py-1 pr-2 text-sm rounded ${isSel ? 'bg-[#00bfff]/15' : 'hover:bg-[#262626]'}`}>
            {archive ? (
              <button onClick={() => openArchive(node)} title="Browse archive" className="w-3 text-gray-500 text-xs bg-transparent! border-0! p-0! cursor-pointer">
                {archiveBusy === node.id ? '…' : open ? '▾' : '▸'}
              </button>
            ) : <span className="w-3" />}
            <button onClick={() => select(node)} className={`flex-1 min-w-0 flex items-center gap-1.5 text-left bg-transparent! border-0! p-0! cursor-pointer ${isSel ? 'text-[#00bfff]' : 'text-gray-200'}`}>
              {iconFor(node.name)} <span className="truncate">{node.name}</span>
            </button>
            <span className="text-[11px] text-gray-500 shrink-0">{formatBytes(node.size)}</span>
          </div>
          {archive && open && archives[node.id] && (
            archives[node.id].length
              ? renderNodes(archives[node.id], depth + 1)
              : <div style={{ paddingLeft: 8 + (depth + 1) * 14 }} className="py-1 text-xs text-gray-500">empty archive</div>
          )}
        </div>
      )
    })

  const tabBtn = (t: Tab, label: string) => (
    <button
      onClick={() => setTab(t)}
      className={`px-3 py-1.5 rounded-md text-sm font-semibold cursor-pointer border! ${tab === t ? 'bg-[#00bfff]! text-[#0b0b0b] border-[#00bfff]!' : 'bg-[#1e1e1e]! text-gray-300 border-[#333]!'}`}
    >
      {label}
    </button>
  )

  const renderPreview = () => {
    if (!blob || !selected) return null
    switch (kind) {
      case 'image':
        return url && (
          <div className="text-center">
            <img src={url} alt={selected.name} onLoad={e => setImgSize(`${e.currentTarget.naturalWidth} × ${e.currentTarget.naturalHeight}`)}
              className="max-w-full max-h-[70vh] mx-auto rounded bg-[repeating-conic-gradient(#2a2a2a_0_25%,#1e1e1e_0_50%)] bg-[length:16px_16px]" />
            {imgSize && <div className="text-xs text-gray-500 mt-2">{imgSize} px</div>}
          </div>
        )
      case 'video':
        return url && <video key={url} src={url} controls className="w-full max-h-[70vh] rounded bg-black" />
      case 'audio':
        return url && <audio key={url} src={url} controls className="w-full" />
      case 'pdf':
        return url && <iframe key={url} src={url} title={selected.name} className="w-full h-[75vh] rounded border border-[#333] bg-white" />
      case 'text':
        return text && (
          <div>
            <div className="flex items-center justify-between mb-2 text-xs text-gray-500">
              <span>{text.value.split('\n').length.toLocaleString()} lines{text.truncated && ` · first ${formatBytes(TEXT_LIMIT)} shown`}</span>
              <div className="flex gap-3">
                {text.truncated && <button onClick={loadFullText} className="text-[#00bfff] cursor-pointer">Load all</button>}
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={wrap} onChange={e => setWrap(e.target.checked)} className="accent-[#00bfff]" /> Wrap
                </label>
              </div>
            </div>
            <pre className={`max-h-[70vh] overflow-auto p-3 rounded-md border border-[#333] bg-[#161616] text-xs text-gray-200 ${wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'}`}>
              {text.value}
            </pre>
          </div>
        )
      case 'archive':
        return (
          <div className="text-center py-8 text-sm text-gray-400">
            {archives[selected.id]
              ? `Archive with ${countFiles(archives[selected.id]).toLocaleString()} files — browse it in the file list.`
              : <button onClick={() => openArchive(selected)} className="px-4 py-2 rounded-md bg-[#00bfff]! text-[#0b0b0b] font-bold cursor-pointer">🗜️ Browse archive contents</button>}
          </div>
        )
      default:
        return <div className="text-center py-8 text-sm text-gray-500">No preview for this file type — see the Hex tab.</div>
    }
  }

  return (
    <div
      className="min-h-screen bg-[#121212] text-[#f0f0f0] flex flex-col items-center p-4 pt-8"
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={e => { if (e.currentTarget === e.target) setDragOver(false) }}
      onDrop={onDrop}
    >
      <div className="w-full max-w-[1200px]">
        <Link to="/" className="inline-flex items-center gap-1.5 mb-4 px-3 py-1.5 rounded border border-[#333] text-sm text-gray-400 hover:border-[#555] hover:text-gray-200 transition-all">← Home</Link>
        <h1 className="text-center text-[#00bfff] text-2xl font-bold mb-2">Media Browser</h1>
        <p className="text-center text-gray-500 text-sm mb-6">
          Open files, folders or zips — preview text, images, video, audio & PDF, or inspect any file in hex. Nothing leaves your device.
        </p>

        <div className={`flex flex-wrap items-center justify-center gap-2 mb-4 p-4 rounded-lg border-2 border-dashed transition-colors ${dragOver ? 'border-[#00bfff] bg-[#00bfff]/10' : 'border-[#333]'}`}>
          <label className="px-4 py-2 rounded-md bg-gradient-to-r from-[#8a2be2] to-[#00bfff] text-white font-bold cursor-pointer">
            Open files
            <input type="file" multiple className="hidden" onChange={e => { onPick(e.target.files); e.target.value = '' }} />
          </label>
          <label className="px-4 py-2 rounded-md border border-[#444] bg-[#262626] text-gray-200 font-semibold cursor-pointer hover:bg-[#333]">
            Open folder
            <input type="file" className="hidden" {...{ webkitdirectory: '' }} onChange={e => { onPick(e.target.files); e.target.value = '' }} />
          </label>
          <span className="text-xs text-gray-500">or drop files / folders anywhere</span>
          {tree.length > 0 && <button onClick={clearAll} className="text-xs text-red-400 hover:text-red-300 cursor-pointer">Clear</button>}
        </div>

        {error && <div className="mb-3 p-3 rounded-md bg-red-900/50 border border-red-700 text-red-300 text-sm">{error}</div>}

        {tree.length > 0 && (
          <div className="flex flex-col md:flex-row gap-4">
            <div className="md:w-[340px] shrink-0 max-h-[50vh] md:max-h-[80vh] overflow-auto rounded-lg border border-[#333] bg-[#1a1a1a] p-1">
              {renderNodes(tree, 0)}
            </div>

            <div ref={viewerRef} className="flex-1 min-w-0 rounded-lg border border-[#333] bg-[#1a1a1a] p-3">
              {!selected ? (
                <div className="text-center py-12 text-sm text-gray-500">Select a file to view it.</div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-200 truncate" title={selected.path}>{selected.name}</div>
                      <div className="text-xs text-gray-500 truncate">
                        {formatBytes(blob?.size ?? selected.size)}{blob && ` · ${blob.type || kind}`} · {selected.path}
                      </div>
                    </div>
                    {tabBtn('preview', 'Preview')}
                    {tabBtn('hex', 'Hex')}
                    <button onClick={download} disabled={!blob} className="px-3 py-1.5 rounded-md text-sm bg-[#262626]! border! border-[#444]! text-gray-200 cursor-pointer disabled:opacity-50">
                      ⬇
                    </button>
                  </div>
                  {loadingFile ? (
                    <div className="text-center py-12 text-sm text-gray-500">Loading...</div>
                  ) : blob && (tab === 'hex' ? <HexViewer key={selected.id} blob={blob} /> : renderPreview())}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
