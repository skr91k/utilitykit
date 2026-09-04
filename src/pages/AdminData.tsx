import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore'
import { useSEO } from '../utils/useSEO'
import { useAuth } from '../utils/useAuth'
import {
  ROOT_COLLECTIONS,
  GROUP_COLLECTIONS,
  childCollectionsOf,
  classifyPath,
  isAdminUser,
  loadCollection,
  loadDoc,
  loadGroup,
  scanUserIds,
  type AdminDoc,
} from '../utils/adminFirestore'

/**
 * Read-only Firestore console at /admin. Every call in here is a get/list — the page never
 * imports a write API, so a stray click cannot change data even if the rules would
 * have let it. Access is gated twice: this component checks the signed-in email,
 * and firestore.rules grants the recursive read to the same two accounts.
 */

type View =
  | { kind: 'collection'; path: string }
  | { kind: 'group'; id: string }
  | { kind: 'doc'; path: string }

const PAGE_SIZES = [25, 50, 100, 300]

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" style={{ marginRight: 10 }}>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** A one-line preview of a document, so the list is scannable without opening rows. */
function summarize(data: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(data)) {
    let text: string
    if (v === null) text = 'null'
    else if (Array.isArray(v)) text = `[${v.length}]`
    else if (typeof v === 'object') text = '{…}'
    else text = String(v)
    if (text.length > 40) text = text.slice(0, 40) + '…'
    parts.push(`${k}: ${text}`)
    if (parts.join(' · ').length > 160) break
  }
  return parts.join(' · ')
}

function JsonBlock({ value }: { value: unknown }) {
  const text = JSON.stringify(value, null, 2)
  return (
    <pre className="max-h-[60vh] overflow-auto rounded-md border border-[#2a2a2a] bg-[#0d0d0d] p-3 text-xs leading-relaxed whitespace-pre-wrap break-all text-[#d4d4d4]">
      {text}
    </pre>
  )
}

function SidebarButton({
  active,
  onClick,
  label,
  note,
}: {
  active: boolean
  onClick: () => void
  label: string
  note?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded-md border cursor-pointer transition-colors ${
        active
          ? 'border-[#00bfff] bg-[#00bfff]/10! text-[#00bfff]'
          : 'border-transparent bg-transparent! text-[#ccc] hover:border-[#333]'
      }`}
    >
      <div className="text-sm font-medium truncate">{label}</div>
      {note && <div className="text-[11px] text-[#777] truncate">{note}</div>}
    </button>
  )
}

export function AdminData() {
  useSEO({
    title: 'Firestore Admin',
    description: 'Read-only browser for the Firestore database.',
  })

  const { user, loading: authLoading, login, logout } = useAuth()
  const allowed = isAdminUser(user)

  const [view, setView] = useState<View>({ kind: 'collection', path: 'users' })
  const [docs, setDocs] = useState<AdminDoc[]>([])
  const [selected, setSelected] = useState<AdminDoc | null>(null)
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pageSize, setPageSize] = useState(50)
  const [filter, setFilter] = useState('')
  const [pathInput, setPathInput] = useState('')
  const [navOpen, setNavOpen] = useState(false)
  const [scanned, setScanned] = useState(false)

  const title = useMemo(() => {
    if (view.kind === 'group') return `collection group: ${view.id}`
    return view.path
  }, [view])

  /** Loads the first page (or the single document) for whatever `view` points at. */
  const open = useCallback(async (next: View) => {
    setView(next)
    setDocs([])
    setSelected(null)
    setCursor(null)
    setHasMore(false)
    setError('')
    setFilter('')
    setScanned(false)
    setNavOpen(false)
    setBusy(true)
    try {
      if (next.kind === 'doc') {
        setSelected(await loadDoc(next.path))
      } else {
        const page =
          next.kind === 'group'
            ? await loadGroup(next.id, pageSize, null)
            : await loadCollection(next.path, pageSize, null)
        setDocs(page.docs)
        setCursor(page.cursor)
        setHasMore(page.hasMore)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [pageSize])

  const loadMore = async () => {
    if (view.kind === 'doc' || !cursor) return
    setBusy(true)
    setError('')
    try {
      const page =
        view.kind === 'group'
          ? await loadGroup(view.id, pageSize, cursor)
          : await loadCollection(view.path, pageSize, cursor)
      setDocs(prev => [...prev, ...page.docs])
      setCursor(page.cursor)
      setHasMore(page.hasMore)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  /** Fills in user ids whose `users/{uid}` parent document was never written. */
  const runUserScan = async () => {
    setBusy(true)
    setError('')
    try {
      const ids = await scanUserIds()
      setDocs(prev => {
        const known = new Set(prev.map(d => d.id))
        const extra = ids
          .filter(id => !known.has(id))
          .map<AdminDoc>(id => ({ id, path: `users/${id}`, data: {}, missing: true }))
        return [...prev, ...extra]
      })
      setScanned(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // First load, once the signed-in account clears the allow-list.
  useEffect(() => {
    if (allowed) open({ kind: 'collection', path: 'users' })
  }, [allowed, open])

  const submitPath = () => {
    const path = pathInput.trim().replace(/^\/+|\/+$/g, '')
    if (!path) return
    const kind = classifyPath(path)
    if (kind === 'invalid') {
      setError('Enter a path like `users` or `users/<uid>/pastes`.')
      return
    }
    open(kind === 'collection' ? { kind: 'collection', path } : { kind: 'doc', path })
  }

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    if (!needle) return docs
    return docs.filter(
      d =>
        d.id.toLowerCase().includes(needle) ||
        JSON.stringify(d.data).toLowerCase().includes(needle),
    )
  }, [docs, filter])

  // Breadcrumb: every ancestor of the current path is clickable.
  const crumbs = useMemo(() => {
    if (view.kind === 'group') return []
    const segs = view.path.split('/')
    return segs.map((seg, i) => ({
      seg,
      path: segs.slice(0, i + 1).join('/'),
      isCollection: i % 2 === 0,
    }))
  }, [view])

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#121212] text-[#888] flex items-center justify-center">
        Loading…
      </div>
    )
  }

  // Signed out: the button and nothing else — an unlisted console gives away
  // nothing about itself until someone is actually inside.
  if (!user) {
    return (
      <div className="min-h-screen bg-[#121212] text-[#f0f0f0] flex items-center justify-center p-6">
        {/* index.css sets an unlayered `button { background-color: #1a1a1a }`, which
            outranks Tailwind's layered utilities — hence the `!` on the colours. */}
        <button
          onClick={login}
          className="flex w-full max-w-[320px] items-center justify-center p-3 rounded-md bg-white! text-[#1a1a1a]! font-semibold cursor-pointer hover:bg-gray-200! transition-colors"
        >
          <GoogleIcon />
          Continue with Google
        </button>
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="min-h-screen bg-[#121212] text-[#f0f0f0] flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-[420px] text-center">
          <div className="text-5xl mb-4">🚫</div>
          <h1 className="text-2xl font-bold mb-2">Not an admin account</h1>
          <p className="text-gray-500 text-sm mb-6">
            {user.email ?? 'This account'} is not on the admin list. Sign in with an admin
            Google account to continue.
          </p>
          <button
            onClick={logout}
            className="px-4 py-2 rounded-md border border-[#333] text-[#ccc] cursor-pointer hover:border-[#00bfff] transition-colors"
          >
            Sign out
          </button>
          <div>
            <Link to="/" className="mt-5 inline-block text-[#888] text-sm hover:text-[#00bfff]">
              ← Back to Utilities
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const sidebar = (
    <nav className="flex flex-col gap-4">
      <div>
        <div className="px-3 pb-1 text-[11px] uppercase tracking-wide text-[#666]">
          Collections
        </div>
        <div className="flex flex-col gap-0.5">
          {ROOT_COLLECTIONS.map(c => (
            <SidebarButton
              key={c.path}
              label={c.label}
              note={c.note}
              active={view.kind === 'collection' && view.path === c.path}
              onClick={() => open({ kind: 'collection', path: c.path })}
            />
          ))}
        </div>
      </div>

      <div>
        <div className="px-3 pb-1 text-[11px] uppercase tracking-wide text-[#666]">
          Collection groups
        </div>
        <div className="flex flex-col gap-0.5">
          {GROUP_COLLECTIONS.map(g => (
            <SidebarButton
              key={g.id}
              label={g.id}
              note={g.note}
              active={view.kind === 'group' && view.id === g.id}
              onClick={() => open({ kind: 'group', id: g.id })}
            />
          ))}
        </div>
      </div>

      <div className="px-3">
        <div className="pb-1 text-[11px] uppercase tracking-wide text-[#666]">Open any path</div>
        <div className="flex gap-1">
          <input
            value={pathInput}
            onChange={e => setPathInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submitPath()}
            placeholder="users/<uid>/pastes"
            className="min-w-0 flex-1 rounded-md border border-[#333] bg-[#0d0d0d] px-2 py-1.5 text-xs text-[#f0f0f0] outline-none focus:border-[#00bfff]"
          />
          <button
            onClick={submitPath}
            className="rounded-md border border-[#333] px-2 py-1.5 text-xs text-[#00bfff] cursor-pointer hover:border-[#00bfff]"
          >
            Go
          </button>
        </div>
        <p className="mt-1 text-[10px] leading-snug text-[#666]">
          Odd number of segments = collection, even = document.
        </p>
      </div>
    </nav>
  )

  return (
    <div className="min-h-screen bg-[#121212] text-[#f0f0f0]">
      <header className="sticky top-0 z-10 border-b border-[#2a2a2a] bg-[#121212]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3 px-4 py-3">
          <Link to="/" className="text-sm text-[#888] hover:text-[#00bfff]">
            ←
          </Link>
          <h1 className="text-lg font-bold text-[#00bfff]">Firestore Admin</h1>
          <span className="rounded border border-[#333] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[#888]">
            read only
          </span>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden max-w-[220px] truncate text-xs text-[#888] sm:inline">
              {user.email}
            </span>
            <button
              onClick={logout}
              className="rounded-md border border-[#333] px-3 py-1 text-xs text-[#ccc] cursor-pointer hover:border-[#00bfff]"
            >
              Sign out
            </button>
          </div>
          <button
            onClick={() => setNavOpen(v => !v)}
            className="w-full rounded-md border border-[#333] px-3 py-1.5 text-xs text-[#ccc] cursor-pointer hover:border-[#00bfff] lg:hidden"
          >
            {navOpen ? 'Hide collections' : 'Browse collections'}
          </button>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1500px] flex-col gap-4 px-4 py-4 lg:flex-row">
        <aside
          className={`${navOpen ? 'block' : 'hidden'} shrink-0 lg:block lg:w-[270px]`}
        >
          {sidebar}
        </aside>

        <main className="min-w-0 flex-1">
          {/* Path + toolbar */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1 truncate font-mono text-sm text-[#f0f0f0]">
              {view.kind === 'group' ? (
                <span>
                  <span className="text-[#888]">collection group </span>
                  {view.id}
                </span>
              ) : (
                crumbs.map((c, i) => (
                  <span key={c.path}>
                    {i > 0 && <span className="text-[#555]"> / </span>}
                    <button
                      onClick={() =>
                        open(
                          c.isCollection
                            ? { kind: 'collection', path: c.path }
                            : { kind: 'doc', path: c.path },
                        )
                      }
                      className="bg-transparent! p-0 text-inherit cursor-pointer hover:text-[#00bfff]"
                    >
                      {c.seg}
                    </button>
                  </span>
                ))
              )}
            </div>

            <button
              onClick={() => open(view)}
              className="rounded-md border border-[#333] px-3 py-1.5 text-xs text-[#ccc] cursor-pointer hover:border-[#00bfff]"
            >
              Refresh
            </button>
            {view.kind !== 'doc' && (
              <select
                value={pageSize}
                onChange={e => setPageSize(Number(e.target.value))}
                className="rounded-md border border-[#333] bg-[#1a1a1a] px-2 py-1.5 text-xs text-[#ccc] cursor-pointer"
                title="Documents per page"
              >
                {PAGE_SIZES.map(n => (
                  <option key={n} value={n}>
                    {n} / page
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() =>
                download(
                  `${title.replace(/[^\w-]+/g, '_')}.json`,
                  JSON.stringify(
                    view.kind === 'doc' ? selected : visible.map(d => ({ path: d.path, ...d.data })),
                    null,
                    2,
                  ),
                )
              }
              className="rounded-md border border-[#333] px-3 py-1.5 text-xs text-[#00bfff] cursor-pointer hover:border-[#00bfff]"
            >
              Export JSON
            </button>
          </div>

          {error && (
            <div className="mb-3 rounded-md border border-[#5a2020] bg-[#2a1414] px-3 py-2 text-xs text-[#ff8a8a]">
              {error}
              {error.toLowerCase().includes('permission') && (
                <span className="block text-[#c98a8a]">
                  Deploy the updated firestore.rules, then sign out and back in.
                </span>
              )}
            </div>
          )}

          {/* Collection / group listing */}
          {view.kind !== 'doc' && (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <input
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                  placeholder="Filter loaded documents…"
                  className="min-w-0 flex-1 rounded-md border border-[#333] bg-[#0d0d0d] px-3 py-1.5 text-xs text-[#f0f0f0] outline-none focus:border-[#00bfff]"
                />
                <span className="text-xs text-[#777]">
                  {visible.length}
                  {filter && ` of ${docs.length}`} loaded{hasMore ? '+' : ''}
                </span>
              </div>

              {view.kind === 'collection' && view.path === 'users' && !scanned && (
                <button
                  onClick={runUserScan}
                  className="mb-2 w-full rounded-md border border-dashed border-[#333] px-3 py-2 text-xs text-[#888] cursor-pointer hover:border-[#00bfff] hover:text-[#00bfff]"
                >
                  Scan subcollections for user ids — a `users/&lt;uid&gt;` document is usually
                  never written, so this list misses accounts until you scan.
                </button>
              )}

              <div className="overflow-hidden rounded-md border border-[#2a2a2a]">
                {visible.length === 0 && !busy && (
                  <div className="px-3 py-6 text-center text-xs text-[#666]">
                    No documents{filter && ' match the filter'}.
                  </div>
                )}
                {visible.map(d => {
                  const isOpen = selected?.path === d.path
                  return (
                    <div key={d.path} className="border-b border-[#222] last:border-b-0">
                      <button
                        onClick={() => setSelected(isOpen ? null : d)}
                        className={`w-full bg-transparent! px-3 py-2 text-left cursor-pointer hover:bg-[#1a1a1a]! ${
                          isOpen ? 'bg-[#1a1a1a]!' : ''
                        }`}
                      >
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-xs text-[#00bfff]">{d.id}</span>
                          {d.missing && (
                            <span className="text-[10px] text-[#886]">(no document)</span>
                          )}
                          <span className="ml-auto shrink-0 text-[10px] text-[#555]">
                            {isOpen ? '▾' : '▸'}
                          </span>
                        </div>
                        {view.kind === 'group' && (
                          <div className="truncate font-mono text-[10px] text-[#666]">{d.path}</div>
                        )}
                        <div className="truncate text-[11px] text-[#888]">{summarize(d.data)}</div>
                      </button>
                      {isOpen && (
                        <div className="border-t border-[#222] bg-[#0d0d0d] px-3 py-3">
                          <DocPanel doc={d} onOpen={open} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {hasMore && (
                <button
                  onClick={loadMore}
                  disabled={busy}
                  className="mt-3 w-full rounded-md border border-[#333] px-3 py-2 text-xs text-[#00bfff] cursor-pointer hover:border-[#00bfff] disabled:opacity-50"
                >
                  {busy ? 'Loading…' : `Load ${pageSize} more`}
                </button>
              )}
            </>
          )}

          {/* Single document */}
          {view.kind === 'doc' && selected && (
            <div className="rounded-md border border-[#2a2a2a] p-3">
              <DocPanel doc={selected} onOpen={open} />
            </div>
          )}

          {busy && <div className="mt-3 text-center text-xs text-[#666]">Loading…</div>}
        </main>
      </div>
    </div>
  )
}

/** Full JSON of one document plus links into its known subcollections. */
function DocPanel({ doc, onOpen }: { doc: AdminDoc; onOpen: (v: View) => void }) {
  const children = childCollectionsOf(doc.path)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] break-all text-[#888]">{doc.path}</span>
        <button
          onClick={() => navigator.clipboard?.writeText(JSON.stringify(doc.data, null, 2))}
          className="ml-auto rounded border border-[#333] px-2 py-1 text-[10px] text-[#ccc] cursor-pointer hover:border-[#00bfff]"
        >
          Copy JSON
        </button>
      </div>

      {doc.missing ? (
        <p className="text-xs text-[#886]">
          This document does not exist — it is only a parent for the subcollections below.
        </p>
      ) : (
        <JsonBlock value={doc.data} />
      )}

      {children.length > 0 && (
        <div>
          <div className="pb-1 text-[10px] uppercase tracking-wide text-[#666]">Subcollections</div>
          <div className="flex flex-wrap gap-2">
            {children.map(name => (
              <button
                key={name}
                onClick={() => onOpen({ kind: 'collection', path: `${doc.path}/${name}` })}
                className="rounded border border-[#333] px-2 py-1 text-[11px] text-[#00bfff] cursor-pointer hover:border-[#00bfff]"
              >
                {name} →
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
