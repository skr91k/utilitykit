import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSEO } from '../utils/useSEO'
import { useAuth } from '../utils/useAuth'
import { CodeText } from '../components/CodeText'
import {
  subscribeToPastes,
  createPaste,
  updatePaste,
  deletePaste,
  sharePrivatePaste,
  unsharePrivatePaste,
  buildShareUrl,
  byteLength,
  truncateToBytes,
  MAX_CONTENT_BYTES,
  MAX_TITLE_LENGTH,
} from '../utils/pasteBinFirebase'
import type { Paste, PasteScope } from '../utils/pasteBinFirebase'

function formatDate(ts: number): string {
  if (!ts) return ''
  return new Date(ts).toLocaleString()
}

/** Long pastes are collapsed to this many lines until the reader expands them. */
const PREVIEW_LINE_LIMIT = 100

function PasteBody({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false)
  const lines = useMemo(() => content.split('\n'), [content])
  const isLong = lines.length > PREVIEW_LINE_LIMIT
  const visible = isLong && !expanded ? lines.slice(0, PREVIEW_LINE_LIMIT).join('\n') : content

  return (
    <>
      <div className="relative">
        <CodeText text={visible} />
        {isLong && !expanded && (
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[#121212] to-transparent" />
        )}
      </div>
      {isLong && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="mt-2 px-3 py-1 text-xs rounded border border-[#333] text-[#00bfff] cursor-pointer hover:border-[#00bfff] transition-all"
        >
          {expanded
            ? `Show less (first ${PREVIEW_LINE_LIMIT} lines)`
            : `Show all ${lines.length} lines (${lines.length - PREVIEW_LINE_LIMIT} more)`}
        </button>
      )}
    </>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/** Live size readout + the over-limit disclaimer shown under each editor. */
function SizeNotice({ bytes }: { bytes: number }) {
  const over = bytes > MAX_CONTENT_BYTES
  return (
    <div className="mt-2 text-xs">
      <div className={over ? 'text-red-400' : 'text-[#888]'}>
        {formatBytes(bytes)} / {formatBytes(MAX_CONTENT_BYTES)}
      </div>
      {over && (
        <div className="mt-2 p-2 rounded-md bg-[#f0a500]/10 border border-[#f0a500] text-[#f0a500]">
          A Firestore document is capped at 1 MiB, so a paste can hold at most{' '}
          {formatBytes(MAX_CONTENT_BYTES)} of text. This one is over by{' '}
          {formatBytes(bytes - MAX_CONTENT_BYTES)} — saving will keep only the first{' '}
          {formatBytes(MAX_CONTENT_BYTES)} and drop the rest.
        </div>
      )}
    </div>
  )
}

export function PasteBin() {
  useSEO({
    title: 'Paste Bin',
    description: 'Public and private paste bin — share text and links, copy, edit or remove them anytime.',
    keywords: 'paste bin, pastebin, share text, share links, notes, snippets',
  })

  const { user, loading: authLoading, login, logout } = useAuth()
  const isSignedIn = !!user && !user.isAnonymous && !!user.email

  const [scope, setScope] = useState<PasteScope>('public')
  const [pastes, setPastes] = useState<Paste[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [sharedId, setSharedId] = useState<string | null>(null)

  const uid = user?.uid ?? null

  // Signed-in users land on their private bin; everyone else stays on public.
  // Skipped once the user picks a tab themselves, including mid auth-load.
  const scopePickedByUser = useRef(false)
  useEffect(() => {
    if (authLoading || scopePickedByUser.current) return
    scopePickedByUser.current = true
    if (isSignedIn) setScope('private')
  }, [authLoading, isSignedIn])

  const selectScope = (value: PasteScope) => {
    scopePickedByUser.current = true
    setScope(value)
  }

  const contentBytes = useMemo(() => byteLength(content), [content])
  const editContentBytes = useMemo(() => byteLength(editContent), [editContent])
  const contentOverLimit = contentBytes > MAX_CONTENT_BYTES
  const editOverLimit = editContentBytes > MAX_CONTENT_BYTES

  /** Confirms a partial save when the text exceeds the per-document cap. */
  const confirmTruncation = (bytes: number): boolean =>
    window.confirm(
      `This paste is ${formatBytes(bytes)}, over the ${formatBytes(MAX_CONTENT_BYTES)} limit.\n\n` +
        `Save only the first ${formatBytes(MAX_CONTENT_BYTES)}? The remaining ` +
        `${formatBytes(bytes - MAX_CONTENT_BYTES)} will be dropped.`
    )

  useEffect(() => {
    if (scope === 'private' && !isSignedIn) {
      setPastes([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const unsub = subscribeToPastes(
      scope,
      uid,
      list => {
        setPastes(list)
        setLoading(false)
      },
      message => {
        setError(message)
        setLoading(false)
      }
    )
    return () => unsub()
  }, [scope, uid, isSignedIn])

  // Leaving a scope should not carry an open editor into the other list.
  useEffect(() => {
    setEditingId(null)
  }, [scope])

  const handleCreate = async () => {
    if (!content.trim()) {
      setError('Nothing to paste — add some text first')
      return
    }
    if (contentOverLimit && !confirmTruncation(contentBytes)) return
    setSaving(true)
    setError(null)
    try {
      await createPaste(
        scope,
        uid,
        title,
        truncateToBytes(content),
        scope === 'public' ? (user?.displayName || 'Anonymous') : (user?.displayName || 'Me')
      )
      setTitle('')
      setContent('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // Signing out drops back to the public bin rather than the private sign-in wall.
  const handleLogout = async () => {
    await logout()
    setScope('public')
    setEditingId(null)
  }

  const handleCopy = async (paste: Paste) => {
    if (await copyToClipboard(paste.content)) {
      setCopiedId(paste.id)
      setTimeout(() => setCopiedId(null), 1500)
    }
  }

  const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      setError('Copy failed — clipboard is not available')
      return false
    }
  }

  /**
   * Public pastes link straight to the document. Private ones publish a
   * read-only copy under an unguessable token first.
   */
  const handleShare = async (paste: Paste) => {
    setError(null)
    try {
      let url: string
      if (scope === 'public') {
        url = buildShareUrl('public', paste.id)
      } else {
        if (!paste.shareToken && !window.confirm(
          'Create a share link for this private paste?\n\n' +
          'Anyone with the link will be able to read it (not edit it). ' +
          'You can revoke the link at any time.'
        )) return
        const token = await sharePrivatePaste(uid!, paste)
        url = buildShareUrl('private', token)
      }
      if (await copyToClipboard(url)) {
        setSharedId(paste.id)
        setTimeout(() => setSharedId(null), 2000)
      }
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const handleUnshare = async (paste: Paste) => {
    if (!paste.shareToken) return
    if (!window.confirm('Revoke this share link? Anyone holding it will lose access.')) return
    setError(null)
    try {
      await unsharePrivatePaste(uid!, paste.id, paste.shareToken)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const startEdit = (paste: Paste) => {
    setEditingId(paste.id)
    setEditTitle(paste.title || '')
    setEditContent(paste.content)
  }

  const handleSaveEdit = async (paste: Paste) => {
    if (!editContent.trim()) {
      setError('Paste content cannot be empty')
      return
    }
    if (editOverLimit && !confirmTruncation(editContentBytes)) return
    setError(null)
    try {
      await updatePaste(scope, uid, paste.id, editTitle, truncateToBytes(editContent), paste.shareToken)
      setEditingId(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const handleDelete = async (paste: Paste) => {
    if (!window.confirm(`Delete this paste${paste.title ? ` "${paste.title}"` : ''}? This cannot be undone.`)) return
    setError(null)
    try {
      await deletePaste(scope, uid, paste.id, paste.shareToken)
      if (editingId === paste.id) setEditingId(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const tabClass = (value: PasteScope) =>
    `flex-1 px-4 py-2 rounded-md text-sm font-bold uppercase tracking-wide transition-all cursor-pointer ${
      scope === value
        ? 'bg-gradient-to-r from-[#8a2be2] to-[#00bfff] text-white'
        : 'bg-[#1e1e1e] text-[#888] hover:text-[#f0f0f0]'
    }`

  return (
    <div className="min-h-screen bg-[#121212] text-[#f0f0f0] flex flex-col items-center p-4 pt-8">
      <div className="w-full max-w-[800px]">
        <div className="flex items-center gap-3 mb-2">
          <Link to="/" className="text-[#888] text-sm hover:text-[#00bfff]">← Back</Link>
          {user && (
            <div className="ml-auto flex items-center gap-2">
              {user.photoURL && (
                <img src={user.photoURL} alt="" className="w-6 h-6 rounded-full" />
              )}
              <span className="text-xs text-[#888] max-w-[140px] truncate">
                {user.displayName?.split(' ')[0] || user.email || 'Guest'}
              </span>
              <button
                onClick={handleLogout}
                className="px-2 py-1 text-xs rounded border border-[#333] text-[#888] cursor-pointer hover:text-red-400 hover:border-red-400 transition-all"
              >
                Logout
              </button>
            </div>
          )}
        </div>

        <h1 className="text-center text-[#00bfff] text-2xl font-bold mb-2">Paste Bin</h1>
        <p className="text-center text-gray-500 text-sm mb-6">
          Share text and links — public for everyone, private just for you
        </p>

        <div className="flex gap-2 mb-6">
          <button onClick={() => selectScope('public')} className={tabClass('public')}>🌍 Public</button>
          <button onClick={() => selectScope('private')} className={tabClass('private')}>🔒 Private</button>
        </div>

        {scope === 'private' && !isSignedIn ? (
          <div className="rounded-lg border border-[#333] bg-[#1e1e1e] p-6 text-center">
            <p className="text-sm text-gray-400 mb-4">
              Private pastes are stored under your account. Sign in with Google to continue.
            </p>
            <button
              onClick={login}
              disabled={authLoading}
              className="inline-flex items-center px-4 py-2 bg-[#121212] border border-[#333] rounded-md text-sm font-semibold cursor-pointer hover:border-[#00bfff] transition-all disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" style={{ marginRight: '8px' }}>
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign in with Google
            </button>
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-[#333] bg-[#1e1e1e] p-4 mb-6">
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                maxLength={MAX_TITLE_LENGTH}
                placeholder="Title (optional)"
                className="w-full p-2 mb-3 rounded-md border border-[#333] bg-[#121212] text-[#f0f0f0] text-sm focus:outline-none focus:border-[#00bfff]"
              />
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="Paste text or links here..."
                className="w-full p-3 rounded-md border border-[#333] bg-[#121212] text-[#f0f0f0] font-mono text-sm min-h-[120px] resize-y focus:outline-none focus:border-[#00bfff]"
              />
              <SizeNotice bytes={contentBytes} />
              <button
                onClick={handleCreate}
                disabled={saving}
                className="w-full mt-3 p-3 bg-gradient-to-r from-[#8a2be2] to-[#00bfff] text-white rounded-md font-bold uppercase tracking-wide cursor-pointer hover:from-[#00bfff] hover:to-[#8a2be2] transition-all disabled:opacity-50"
              >
                {saving
                  ? 'Saving...'
                  : contentOverLimit
                    ? `Save first ${formatBytes(MAX_CONTENT_BYTES)}`
                    : scope === 'public' ? 'Post Publicly' : 'Save Privately'}
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-md bg-red-900/50 border border-red-700 text-red-300 text-sm">
                {error}
              </div>
            )}

            {loading ? (
              <div className="text-center text-gray-500 text-sm py-8">Loading pastes...</div>
            ) : pastes.length === 0 ? (
              <div className="text-center text-gray-500 text-sm py-8">
                No pastes yet — add the first one above.
              </div>
            ) : (
              <div className="space-y-4">
                {pastes.map(paste => (
                  <div key={paste.id} className="rounded-lg overflow-hidden border border-[#333]">
                    <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-[#1e1e1e]">
                      <span className="font-bold text-sm text-[#ff1493] mr-auto break-all">
                        {paste.title || 'Untitled'}
                      </span>
                      <button
                        onClick={() => handleShare(paste)}
                        className="px-2 py-1 text-xs rounded border border-[#333] text-[#888] cursor-pointer hover:text-[#8a2be2] hover:border-[#8a2be2] transition-all"
                      >
                        {sharedId === paste.id ? 'Link copied!' : paste.shareToken ? 'Copy link' : 'Share'}
                      </button>
                      {scope === 'private' && paste.shareToken && (
                        <button
                          onClick={() => handleUnshare(paste)}
                          className="px-2 py-1 text-xs rounded border border-[#333] text-[#888] cursor-pointer hover:text-red-400 hover:border-red-400 transition-all"
                        >
                          Unshare
                        </button>
                      )}
                      <button
                        onClick={() => handleCopy(paste)}
                        className="px-2 py-1 text-xs rounded border border-[#333] text-[#888] cursor-pointer hover:text-[#00bfff] hover:border-[#00bfff] transition-all"
                      >
                        {copiedId === paste.id ? 'Copied!' : 'Copy'}
                      </button>
                      <button
                        onClick={() => (editingId === paste.id ? setEditingId(null) : startEdit(paste))}
                        className="px-2 py-1 text-xs rounded border border-[#333] text-[#888] cursor-pointer hover:text-[#f0a500] hover:border-[#f0a500] transition-all"
                      >
                        {editingId === paste.id ? 'Cancel' : 'Edit'}
                      </button>
                      <button
                        onClick={() => handleDelete(paste)}
                        className="px-2 py-1 text-xs rounded border border-[#333] text-[#888] cursor-pointer hover:text-red-400 hover:border-red-400 transition-all"
                      >
                        Delete
                      </button>
                    </div>

                    <div className="bg-[#121212] p-4">
                      {editingId === paste.id ? (
                        <>
                          <input
                            type="text"
                            value={editTitle}
                            onChange={e => setEditTitle(e.target.value)}
                            maxLength={MAX_TITLE_LENGTH}
                            placeholder="Title (optional)"
                            className="w-full p-2 mb-3 rounded-md border border-[#333] bg-[#1e1e1e] text-[#f0f0f0] text-sm focus:outline-none focus:border-[#00bfff]"
                          />
                          <textarea
                            value={editContent}
                            onChange={e => setEditContent(e.target.value)}
                            className="w-full p-3 rounded-md border border-[#333] bg-[#1e1e1e] text-[#f0f0f0] font-mono text-sm min-h-[120px] resize-y focus:outline-none focus:border-[#00bfff]"
                          />
                          <SizeNotice bytes={editContentBytes} />
                          <button
                            onClick={() => handleSaveEdit(paste)}
                            className="mt-3 px-4 py-2 bg-gradient-to-r from-[#8a2be2] to-[#00bfff] text-white rounded-md text-sm font-bold cursor-pointer hover:from-[#00bfff] hover:to-[#8a2be2] transition-all"
                          >
                            {editOverLimit ? `Save first ${formatBytes(MAX_CONTENT_BYTES)}` : 'Save Changes'}
                          </button>
                        </>
                      ) : (
                        <PasteBody content={paste.content} />
                      )}

                      <div className="mt-3 text-xs text-[#888]">
                        {scope === 'public' && <span>{paste.author || 'Anonymous'} · </span>}
                        <span>{formatDate(paste.createdAt)}</span>
                        {paste.updatedAt > paste.createdAt && (
                          <span> · edited {formatDate(paste.updatedAt)}</span>
                        )}
                        {scope === 'private' && paste.shareToken && (
                          <span className="text-[#8a2be2]"> · shared by link</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {scope === 'public' && (
              <p className="mt-6 text-center text-xs text-[#888]">
                Public pastes are visible and editable by anyone. Don't post secrets here.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
