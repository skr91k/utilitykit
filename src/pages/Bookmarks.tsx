import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSEO } from '../utils/useSEO'
import { useAuth } from '../utils/useAuth'
import {
  subscribeToBookmarks, addBookmark, updateBookmark, deleteBookmark,
  normalizeUrl, hostOf, faviconOf, fetchTitle, MAX_TITLE_LENGTH,
} from '../utils/bookmarkFirebase'
import type { Bookmark } from '../utils/bookmarkFirebase'

const inputCls = 'p-2 rounded-md border border-[#333] bg-[#1e1e1e] text-sm focus:outline-none focus:border-[#00bfff]'

export function Bookmarks() {
  useSEO({
    title: 'Bookmark Manager',
    description: 'Save links by pasting them — title and icon filled in for you. Google or guest login, synced with Firebase.',
    keywords: 'bookmarks, bookmark manager, save links, links, favorites',
  })

  const { user, loading, login, loginAnonymous, logout } = useAuth()
  const uid = user?.uid ?? null

  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [link, setLink] = useState('')
  const [search, setSearch] = useState('')
  const [fetching, setFetching] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const bookmarksRef = useRef(bookmarks)
  bookmarksRef.current = bookmarks

  useEffect(() => {
    if (!uid) { setBookmarks([]); return }
    setError(null)
    return subscribeToBookmarks(uid, setBookmarks, setError)
  }, [uid])

  const run = (p: Promise<unknown>) => p.catch(e => setError((e as Error).message))

  // Saved at once under the site name, then renamed when the page title arrives
  const save = (raw: string): boolean => {
    if (!uid) return false
    const url = normalizeUrl(raw)
    if (!url) { setNotice('That is not a link.'); return false }
    const existing = bookmarksRef.current.find(b => b.url === url)
    if (existing) { setNotice(`Already saved: ${existing.title}`); return true }
    setNotice(null)
    const { id, saved } = addBookmark(uid, url, hostOf(url))
    run(saved)
    setFetching(s => new Set(s).add(id))
    fetchTitle(url).then(title => {
      if (title) run(updateBookmark(uid, id, { title }))
      setFetching(s => { const n = new Set(s); n.delete(id); return n })
    })
    return true
  }

  // Pasting a link anywhere on the page (outside another text field) saves it
  useEffect(() => {
    if (!uid) return
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const text = e.clipboardData?.getData('text') ?? ''
      if (normalizeUrl(text)) { e.preventDefault(); save(text) }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid])

  const onInputPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text')
    if (!link.trim() && normalizeUrl(text)) { e.preventDefault(); if (save(text)) setLink('') }
  }

  const submitAdd = (e: React.FormEvent) => {
    e.preventDefault()
    if (save(link)) setLink('')
  }

  const saveEdit = () => {
    if (!uid || !editingId || !editTitle.trim()) return
    run(updateBookmark(uid, editingId, { title: editTitle }))
    setEditingId(null)
  }

  const remove = (b: Bookmark) => {
    if (!uid || !confirm(`Delete "${b.title}"?`)) return
    run(deleteBookmark(uid, b.id))
  }

  const q = search.trim().toLowerCase()
  const shown = q ? bookmarks.filter(b => b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q)) : bookmarks

  return (
    <div className="min-h-screen bg-[#121212] text-[#f0f0f0] flex flex-col items-center p-4 pt-8">
      <div className="w-full max-w-[640px]">
        <Link to="/" className="inline-flex items-center gap-1.5 mb-4 px-3 py-1.5 rounded border border-[#333] text-sm text-gray-400 hover:border-[#555] hover:text-gray-200 transition-all">← Home</Link>
        <h1 className="text-center text-[#00bfff] text-2xl font-bold mb-2">Bookmarks</h1>
        <p className="text-center text-gray-500 text-sm mb-6">Paste a link to save it — title and icon are filled in for you</p>

        {loading ? (
          <div className="text-center text-gray-500 py-8">Loading...</div>
        ) : !uid ? (
          <div className="rounded-lg border border-[#333] bg-[#1a1a1a] p-6 text-center">
            <p className="text-sm text-gray-400 mb-4">
              Sign in with Google to keep your bookmarks on every device, or continue as a guest to try it out.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <button onClick={login} className="px-6 py-2 rounded-md bg-[#00bfff]! text-[#0b0b0b] font-bold cursor-pointer hover:bg-[#33ccff]!">
                Sign in with Google
              </button>
              <button onClick={loginAnonymous} className="px-6 py-2 rounded-md border! border-[#444]! bg-[#262626]! text-gray-200 font-semibold cursor-pointer hover:bg-[#333]!">
                Continue as guest
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 mb-4 text-xs text-gray-500">
              <span className="truncate">
                {user?.isAnonymous ? 'Guest — bookmarks are saved only in this browser' : `Signed in as ${user?.email}`}
              </span>
              <button onClick={logout} className="text-gray-400 hover:text-white cursor-pointer shrink-0">Sign out</button>
            </div>

            <form onSubmit={submitAdd} className="flex gap-2 mb-2">
              <input
                autoFocus
                value={link}
                onChange={e => setLink(e.target.value)}
                onPaste={onInputPaste}
                inputMode="url"
                placeholder="Paste a link…"
                aria-label="Link to save"
                className={`${inputCls} flex-1 min-w-0`}
              />
              <button
                type="submit"
                disabled={!link.trim()}
                className="px-4 py-2 rounded-md bg-gradient-to-r from-[#8a2be2] to-[#00bfff] text-white font-bold cursor-pointer disabled:opacity-50"
              >
                Add
              </button>
            </form>
            <div className="min-h-[20px] mb-2 text-xs text-gray-400" role="status">{notice}</div>

            {error && (
              <div className="mb-3 p-3 rounded-md bg-red-900/50 border border-red-700 text-red-300 text-sm">{error}</div>
            )}

            {bookmarks.length > 5 && (
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={`Search ${bookmarks.length} bookmarks…`}
                aria-label="Search bookmarks"
                className={`${inputCls} w-full mb-3`}
              />
            )}

            {bookmarks.length === 0 ? (
              <div className="text-center text-gray-500 text-sm py-6">No bookmarks yet — paste a link above.</div>
            ) : shown.length === 0 ? (
              <div className="text-center text-gray-500 text-sm py-6">No bookmarks match “{search}”.</div>
            ) : (
              <ul className="space-y-2">
                {shown.map(b => (
                  <li key={b.id} className="rounded-md border border-[#333] bg-[#1e1e1e] p-2.5">
                    {editingId === b.id ? (
                      <form onSubmit={e => { e.preventDefault(); saveEdit() }} className="flex flex-col sm:flex-row gap-2">
                        <input autoFocus value={editTitle} onChange={e => setEditTitle(e.target.value)} maxLength={MAX_TITLE_LENGTH} aria-label="Title" className={`${inputCls} flex-1 min-w-0`} />
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setEditingId(null)} className="flex-1 px-3 py-2 rounded-md bg-[#262626]! text-gray-300 text-sm cursor-pointer">Cancel</button>
                          <button type="submit" disabled={!editTitle.trim()} className="flex-1 px-3 py-2 rounded-md bg-[#00bfff]! text-[#0b0b0b] text-sm font-bold cursor-pointer disabled:opacity-50">Save</button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex items-center gap-3">
                        <img
                          src={faviconOf(b.url)}
                          alt=""
                          width={20}
                          height={20}
                          loading="lazy"
                          className="w-5 h-5 rounded-sm shrink-0"
                          onError={e => { e.currentTarget.style.visibility = 'hidden' }}
                        />
                        <a href={b.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 group">
                          <div className="text-sm text-gray-200 truncate group-hover:text-[#00bfff]">
                            {b.title}{fetching.has(b.id) && <span className="text-gray-500"> · fetching title…</span>}
                          </div>
                          <div className="text-xs text-[#888] truncate">{hostOf(b.url)}</div>
                        </a>
                        <button onClick={() => { setEditingId(b.id); setEditTitle(b.title) }} className="text-xs text-gray-400 hover:text-white cursor-pointer shrink-0">Edit</button>
                        <button onClick={() => remove(b)} className="text-xs text-red-400 hover:text-red-300 cursor-pointer shrink-0">Delete</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  )
}
