import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useSEO } from '../utils/useSEO'
import { CodeText } from '../components/CodeText'
import { getPublicPaste, getSharedPaste } from '../utils/pasteBinFirebase'

interface ViewedPaste {
  title: string
  content: string
  author: string
  createdAt: number
  updatedAt: number
}

function formatDate(ts: number): string {
  if (!ts) return ''
  return new Date(ts).toLocaleString()
}

/**
 * Read-only full view behind a share link.
 *   /paste/p/:id     — a public paste, fetched directly
 *   /paste/s/:token  — the published copy of someone's private paste
 * Content is never collapsed here; the point of the link is to read all of it.
 */
export function PasteView() {
  const { kind, id } = useParams<{ kind: string; id: string }>()
  const [paste, setPaste] = useState<ViewedPaste | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useSEO({
    title: paste?.title || 'Shared Paste',
    description: 'A shared paste from Utility Kit Paste Bin.',
  })

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        if (!id || (kind !== 'p' && kind !== 's')) {
          throw new Error('That link is not valid.')
        }
        const found = kind === 'p' ? await getPublicPaste(id) : await getSharedPaste(id)
        if (cancelled) return
        if (!found) {
          setError('This paste no longer exists, or the share link was revoked.')
        } else {
          setPaste(found as ViewedPaste)
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [kind, id])

  const handleCopy = async () => {
    if (!paste) return
    try {
      await navigator.clipboard.writeText(paste.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setError('Copy failed — clipboard is not available')
    }
  }

  return (
    <div className="min-h-screen bg-[#121212] text-[#f0f0f0] flex flex-col items-center p-4 pt-8">
      <div className="w-full max-w-[800px]">
        <div className="flex items-center gap-3 mb-2">
          <Link to="/paste" className="text-[#888] text-sm hover:text-[#00bfff]">← Paste Bin</Link>
        </div>

        <h1 className="text-center text-[#00bfff] text-2xl font-bold mb-6">
          {paste?.title || 'Shared Paste'}
        </h1>

        {loading ? (
          <div className="text-center text-gray-500 text-sm py-8">Loading paste...</div>
        ) : error ? (
          <div className="p-4 rounded-md bg-red-900/50 border border-red-700 text-red-300 text-sm text-center">
            {error}
          </div>
        ) : paste ? (
          <div className="rounded-lg overflow-hidden border border-[#333]">
            <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-[#1e1e1e]">
              <span className="text-xs text-[#888] mr-auto">
                {paste.author && <>{paste.author} · </>}
                {formatDate(paste.createdAt)}
                {paste.updatedAt > paste.createdAt && <> · edited {formatDate(paste.updatedAt)}</>}
              </span>
              <button
                onClick={handleCopy}
                className="px-2 py-1 text-xs rounded border border-[#333] text-[#888] cursor-pointer hover:text-[#00bfff] hover:border-[#00bfff] transition-all"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div className="bg-[#121212] p-4">
              <CodeText text={paste.content} />
            </div>
          </div>
        ) : null}

        <p className="mt-6 text-center text-xs text-[#888]">
          Read-only view · <Link to="/paste" className="text-[#00bfff] hover:underline">Open Paste Bin</Link>
        </p>
      </div>
    </div>
  )
}
