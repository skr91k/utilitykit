import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { initializeApp, getApps } from 'firebase/app'
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  addDoc,
  setDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
} from 'firebase/firestore'
import { useAuth } from '../utils/useAuth'
import type { User } from '../utils/firebase'
import { firebaseConfig } from '../utils/firebaseConfig'
import { useSEO } from '../utils/useSEO'

// Same init dance as the other Firestore utils: whichever page loads first turns
// on the persistent cache, the rest just grab the already-initialized instance.
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]
let db: ReturnType<typeof getFirestore>
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  })
} catch {
  db = getFirestore(app)
}

const txnCollection = (uid: string) => collection(db, 'users', uid, 'moneyTransactions')

// ---------------------------------------------------------------------------
// "Add to Home screen" support
// ---------------------------------------------------------------------------

/** Page-scoped manifest — makes the home-screen icon open /money, not the app root. */
const MONEY_MANIFEST = '/money.webmanifest'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Chrome fires beforeinstallprompt once, very early — often before React has
// mounted anything — so the handler is registered at module load and the event
// parked here until the button needs it.
let deferredInstall: BeforeInstallPromptEvent | null = null
const INSTALL_READY = 'money:install-ready'

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault()
    deferredInstall = e as BeforeInstallPromptEvent
    window.dispatchEvent(new Event(INSTALL_READY))
  })
  window.addEventListener('appinstalled', () => {
    deferredInstall = null
    window.dispatchEvent(new Event(INSTALL_READY))
  })
}

const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari doesn't implement display-mode
    (navigator as unknown as { standalone?: boolean }).standalone === true)

// ---------------------------------------------------------------------------

type TxnType = 'in' | 'out'

interface Txn {
  id: string
  type: TxnType
  name: string
  phone: string
  amount: number
  date: string
  time: string
  method: string
  createdAt: number
}

const METHODS = ['GPay', 'PhonePe', 'Paytm', 'UPI', 'Bank Transfer', 'Cash', 'Card', 'Other']

/** Shown beside the heading — bump on every user-visible change to this page. */
const VERSION = 'v1.2'

const pad = (n: number) => String(n).padStart(2, '0')

const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const nowHM = () => {
  const d = new Date()
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const emptyForm = () => ({
  type: 'in' as TxnType,
  name: '',
  phone: '',
  amount: '',
  method: METHODS[0],
  date: todayISO(),
  time: nowHM(),
})

type Form = ReturnType<typeof emptyForm>

// Keystroke filters — the field only ever holds characters it can actually mean.
/** Phone numbers keep digits, spaces and a leading-style '+'; everything else is dropped. */
const cleanPhone = (v: string) => v.replace(/[^\d+ ]/g, '')
/** Amounts keep digits and a single decimal point. */
const cleanAmount = (v: string) => {
  const stripped = v.replace(/[^\d.]/g, '')
  const [whole, ...rest] = stripped.split('.')
  return rest.length ? `${whole}.${rest.join('')}` : whole
}

const money = (n: number) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Page-scoped CSS. Two jobs: keep the light theme's form controls light, and
// take the headings back from the app's global styles — index.css sets
// `h1 { font-size: 2.5em }` and WorkoutManager.css leaks an unscoped
// `h1, h2 { color: #fff }` into every page. Both are unlayered, so they outrank
// Tailwind utilities no matter what is put on the element; only an id-scoped
// rule here (or an inline style) wins. Headings therefore size themselves from
// this block and inherit their colour from whatever they sit on.
const PRINT_CSS = `
#moneyflow-root { color-scheme: light; }
#moneyflow-root h1 { margin: 0; color: inherit; font-weight: 700; font-size: 22px; line-height: 1.2; }
#moneyflow-root h2 { margin: 0; color: inherit; font-weight: 700; font-size: 17px; line-height: 1.3; }
@media (min-width: 640px) { #moneyflow-root h1 { font-size: 26px; } }
@media print {
  body * { visibility: hidden; }
  #money-print-area, #money-print-area * { visibility: visible; }
  #money-print-area {
    position: absolute; left: 0; top: 0; width: 100%;
    background: #fff !important; color: #000 !important; padding: 0;
  }
  #money-print-area .no-print { display: none !important; }
  #money-print-area .print-only { display: block !important; }
  /* Print always uses the table, even from a phone where the cards are shown. */
  #money-print-area .screen-only { display: none !important; }
  #money-print-area .print-table { display: block !important; overflow: visible !important; }
  #money-print-area .print-table table { min-width: 0 !important; }
  #money-print-area table { width: 100%; border-collapse: collapse; font-size: 11px; }
  #money-print-area th, #money-print-area td { border: 1px solid #999 !important; padding: 4px 6px; }
  @page { size: A4 landscape; margin: 12mm; }
}
`

const inputClass =
  'w-full p-2.5 rounded-lg border border-[#d0d5dd] bg-white text-[#172033] text-sm ' +
  'focus:outline-none focus:border-[#2563eb] focus:ring-3 focus:ring-[#2563eb]/10 transition-colors'

// The native dropdown arrow is painted against the border box and ignores
// padding-right, so it always sits flush with the edge. Turning the native
// appearance off and drawing our own chevron as a background image is the only
// way to control the gap — background-position puts it 12px in from the border.
// Inline, so it beats the unlayered element rules in index.css, which sit outside
// Tailwind's layers and therefore win over any utility class.
const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' " +
  "viewBox='0 0 12 8' fill='none'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%23344054' " +
  "stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")"

const selectStyle: React.CSSProperties = {
  appearance: 'none',
  WebkitAppearance: 'none',
  MozAppearance: 'none',
  backgroundImage: CHEVRON,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  // Room for the 12px gap, the 12px chevron, and 10px of breathing space before the text.
  paddingRight: 34,
}

function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-bold text-[#475467]">
        {label}{hint && <span className="ml-1 font-normal text-[#667085]">{hint}</span>}
      </span>
      {children}
    </label>
  )
}

/** One of the four headline totals across the top of the page. */
function SummaryCard({ label, value, accent, bar }: { label: string; value: string; accent: string; bar: string }) {
  return (
    <div
      className="rounded-2xl border border-[#e8edf4] bg-white px-4 py-3.5 shadow-[0_5px_18px_rgba(15,23,42,.05)]"
      style={{ borderLeft: `4px solid ${bar}` }}
    >
      <small className="block mb-1.5 text-[11px] font-semibold text-[#667085]">{label}</small>
      <b className={`block text-xl sm:text-2xl leading-tight ${accent}`}>{value}</b>
    </div>
  )
}

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

/** Login wall — transactions live under the signed-in account, so Google is required. */
function SignInGate({ onLogin, anonymous }: { onLogin: () => void; anonymous: boolean }) {
  return (
    <div id="moneyflow-root" className="min-h-screen bg-[#f3f6fb] text-[#172033] flex flex-col items-center justify-center p-6">
      <style>{PRINT_CSS}</style>
      <div className="w-full max-w-[380px] text-center">
        <div className="text-5xl mb-4">💳</div>
        {/* Inline colour: an unlayered global `h1 { color: #fff }` would otherwise win. */}
        <h1 className="mb-2" style={{ color: '#2563eb' }}>
          MoneyFlow
          <span className="ml-1.5 align-super text-[10px] font-medium text-[#93a3b8]">{VERSION}</span>
        </h1>
        <p className="text-[#667085] text-sm mb-6">
          {anonymous
            ? 'You are signed in as a guest. Transactions are saved to your Google account, so please sign in with Google to continue.'
            : 'Sign in with Google to track your cash in and out — your ledger syncs across every device you use.'}
        </p>
        {/* index.css sets an unlayered `button { background-color: #1a1a1a }`, which
            outranks Tailwind's layered utilities — hence the `!` on the colours. */}
        <button
          onClick={onLogin}
          className="w-full flex items-center justify-center p-3 rounded-lg bg-white! text-[#172033]! font-semibold cursor-pointer border border-[#d0d5dd] hover:bg-[#f8fafc]! transition-colors shadow-sm"
        >
          <GoogleIcon />
          Continue with Google
        </button>
        <Link to="/" className="mt-5 inline-block text-[#667085] text-sm hover:text-[#2563eb]">← Back to Utilities</Link>
      </div>
    </div>
  )
}

/**
 * Points the document at the money-scoped manifest while this page is mounted, so
 * an "Add to Home screen" from here lands on /money with its own name and icon.
 * The app's normal manifest is put back on the way out.
 */
function useMoneyManifest() {
  useEffect(() => {
    const existing = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    const previous = existing?.getAttribute('href') ?? null
    const link = existing ?? document.createElement('link')
    if (!existing) {
      link.rel = 'manifest'
      document.head.appendChild(link)
    }
    link.setAttribute('href', MONEY_MANIFEST)
    return () => {
      if (previous === null) link.remove()
      else link.setAttribute('href', previous)
    }
  }, [])
}

/**
 * The header's single ⋮ control. Everything that used to sit exposed in the
 * header — the account, the "Add to Home screen" action, the PDF export and the
 * way back to the utilities index — lives in here, so the title row keeps its
 * full width on a phone.
 */
function HeaderMenu({
  user,
  onLogout,
  onDownloadPdf,
  canDownload,
}: {
  user: User
  onLogout: () => void
  onDownloadPdf?: () => void
  canDownload?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [help, setHelp] = useState(false)
  const [reloading, setReloading] = useState(false)
  const [canInstall, setCanInstall] = useState(() => deferredInstall !== null)
  // Launched from the home screen already — the install item has nothing to do.
  const [installed] = useState(isStandalone)

  const initial = (user.displayName || user.email || '?').charAt(0).toUpperCase()

  useEffect(() => {
    const onReady = () => setCanInstall(deferredInstall !== null)
    window.addEventListener(INSTALL_READY, onReady)
    return () => window.removeEventListener(INSTALL_READY, onReady)
  }, [])

  // Any click outside the menu, or Escape, closes it.
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-header-menu]')) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  /**
   * A real hard reload. The app precaches its own shell in a service worker, so a
   * plain reload — and even ⌘⇧R — is answered from that cache and keeps serving
   * the previous deploy. Dropping the registration and the cache entries first is
   * what actually forces the newest build off the network. The service worker
   * re-registers by itself once the fresh page loads.
   */
  const hardReload = async () => {
    setReloading(true)
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map(r => r.unregister()))
      }
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map(k => caches.delete(k)))
      }
    } catch (err) {
      // Never leave the user stuck on a spinner — reload regardless.
      console.error('Clearing the app cache failed:', err)
    }
    window.location.reload()
  }

  const addToHome = async () => {
    if (!deferredInstall) {
      // No prompt available: Safari/iOS, desktop Firefox, or Chrome hasn't
      // decided the page is installable yet. Fall back to telling the user how.
      setHelp(true)
      return
    }
    try {
      await deferredInstall.prompt()
      const { outcome } = await deferredInstall.userChoice
      deferredInstall = null
      setCanInstall(false)
      if (outcome === 'dismissed') setHelp(true)
      else setOpen(false)
    } catch (err) {
      console.error('Install prompt failed:', err)
      setHelp(true)
    }
  }

  const itemClass =
    'flex w-full items-center gap-2.5 rounded-lg bg-transparent! px-3 py-2.5 text-left text-sm ' +
    'text-[#344054]! font-medium cursor-pointer hover:bg-[#f3f6fb]! border-transparent!'

  return (
    <div className="relative shrink-0" data-header-menu>
      <button
        onClick={() => { setOpen(o => !o); setHelp(false) }}
        title="Menu"
        aria-label="Menu"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15! text-white! text-xl leading-none border-transparent! cursor-pointer hover:bg-white/25! focus:outline-none focus:ring-2 focus:ring-white/60"
      >
        ⋮
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[248px] overflow-hidden rounded-xl border border-[#e6eaf0] bg-white text-left shadow-[0_12px_35px_rgba(15,23,42,.18)]">
          <div className="flex items-center gap-3 border-b border-[#eef1f5] p-3">
            {user.photoURL ? (
              <img src={user.photoURL} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f3f6fb] border border-[#d0d5dd] text-base font-semibold text-[#2563eb]">
                {initial}
              </span>
            )}
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-[#172033]">{user.displayName || 'Signed in'}</div>
              {user.email && <div className="truncate text-xs text-[#667085]">{user.email}</div>}
            </div>
          </div>

          <div className="p-1.5">
            {onDownloadPdf && (
              <button
                onClick={() => { setOpen(false); onDownloadPdf() }}
                disabled={!canDownload}
                className={`${itemClass} disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent!`}
              >
                <span aria-hidden="true">🧾</span>
                <span>Download PDF</span>
              </button>
            )}
            {!installed && (
              <button onClick={addToHome} className={itemClass}>
                <span aria-hidden="true">📲</span>
                <span>{canInstall ? 'Add to Home screen' : 'Add to Home screen…'}</span>
              </button>
            )}
            <button
              onClick={hardReload}
              disabled={reloading}
              title="Clears the cached app shell and reloads the newest version"
              className={`${itemClass} disabled:opacity-60`}
            >
              <span aria-hidden="true">🔄</span>
              <span>{reloading ? 'Reloading…' : 'Force reload'}</span>
            </button>
            <Link to="/" onClick={() => setOpen(false)} className={`${itemClass} no-underline!`}>
              <span aria-hidden="true">←</span>
              <span>Back to Utilities</span>
            </Link>
            <button
              onClick={() => { setOpen(false); onLogout() }}
              className={`${itemClass} text-[#b91c1c]! hover:bg-[#fef2f2]!`}
            >
              <span aria-hidden="true">↩</span>
              <span>Logout</span>
            </button>
          </div>

          {help && (
            <div className="border-t border-[#eef1f5] p-3 text-xs leading-relaxed text-[#475467]">
              <div className="mb-2 font-semibold text-[#172033]">Add a MoneyFlow icon</div>
              <p className="mb-2">
                <b className="text-[#2563eb]">Android / Chrome:</b> tap the browser's ⋮ menu → <b>Add to Home screen</b>.
              </p>
              <p className="mb-2">
                <b className="text-[#2563eb]">iPhone / Safari:</b> tap Share → <b>Add to Home Screen</b>.
              </p>
              <p className="text-[#98a2b3]">The icon opens this page straight away.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function MoneyFlow() {
  useSEO({
    title: 'MoneyFlow — Cash In & Out Manager',
    description: 'Track every cash in and cash out — running balance, payment method, search and filters, synced to your Google account and exportable as a PDF.',
    keywords: 'cash tracker, money manager, income expense tracker, cash book, ledger, upi payment log, personal finance',
  })

  useMoneyManifest()

  const { user, loading, login, logout } = useAuth()
  // Anonymous sessions have no email; those accounts are not allowed past the gate.
  const uid = user?.email ? user.uid : null

  if (loading) {
    return (
      <div id="moneyflow-root" className="min-h-screen bg-[#f3f6fb] text-[#667085] flex items-center justify-center text-sm">
        Loading...
      </div>
    )
  }

  if (!uid || !user) return <SignInGate onLogin={login} anonymous={!!user} />

  // Keyed on uid so switching accounts rebuilds the ledger against the right cache.
  return <Ledger key={uid} uid={uid} user={user} onLogout={logout} />
}

function Ledger({ uid, user, onLogout }: { uid: string; user: User; onLogout: () => void }) {
  const [form, setForm] = useState<Form>(emptyForm)
  const [editId, setEditId] = useState<string | null>(null)
  const [txns, setTxns] = useState<Txn[]>([])
  const [syncing, setSyncing] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | TxnType>('all')
  const [methodFilter, setMethodFilter] = useState('all')

  // Firestore is the single source of truth — nothing is kept in localStorage.
  // The persistent cache above keeps the ledger readable across refreshes and offline.
  useEffect(() => {
    const q = query(txnCollection(uid), orderBy('createdAt', 'desc'))
    const unsubscribe = onSnapshot(
      q,
      snap => {
        setTxns(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Txn, 'id'>) })))
        setSyncing(false)
      },
      err => {
        console.error('MoneyFlow sync failed:', err)
        setError('Could not load your transactions. Check your connection and refresh.')
        setSyncing(false)
      },
    )
    return () => unsubscribe()
  }, [uid])

  const FILTERS: Partial<Record<keyof Form, (v: string) => string>> = {
    phone: cleanPhone,
    amount: cleanAmount,
  }

  const set = (key: keyof Form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const filter = FILTERS[key]
    const value = filter ? filter(e.target.value) : e.target.value
    setForm(f => ({ ...f, [key]: value }))
    setError('')
  }

  const flash = (msg: string) => {
    setNotice(msg)
    setTimeout(() => setNotice(''), 1800)
  }

  const resetForm = () => {
    setEditId(null)
    setForm(emptyForm())
    setError('')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = form.name.trim()
    const amount = parseFloat(form.amount)

    if (!name) return setError('Enter a name — who sent or received the money?')
    if (!Number.isFinite(amount) || amount <= 0) return setError('Enter an amount greater than 0.')
    if (!form.date) return setError('Pick a date.')
    if (!form.time) return setError('Pick a time.')

    const editing = editId
    const payload: Omit<Txn, 'id' | 'createdAt'> = {
      type: form.type,
      name,
      phone: form.phone.trim(),
      amount,
      date: form.date,
      time: form.time,
      method: form.method,
    }

    // Keep the type and payment method — consecutive entries usually share them.
    setForm(f => ({ ...emptyForm(), type: f.type, method: f.method, date: f.date }))
    setEditId(null)
    flash(editing ? '✓ Transaction updated' : '✓ Transaction saved to your account')

    try {
      if (editing) {
        const existing = txns.find(t => t.id === editing)
        await setDoc(doc(db, 'users', uid, 'moneyTransactions', editing), {
          ...payload,
          createdAt: existing?.createdAt ?? Date.now(),
        })
      } else {
        await addDoc(txnCollection(uid), { ...payload, createdAt: Date.now() })
      }
    } catch (err) {
      console.error('Saving transaction failed:', err)
      setNotice('')
      setError('Could not save to the cloud. Check your connection and try again.')
    }
  }

  const startEdit = (t: Txn) => {
    setEditId(t.id)
    setForm({
      type: t.type,
      name: t.name,
      phone: t.phone || '',
      amount: String(t.amount),
      method: t.method || METHODS[0],
      date: t.date,
      time: t.time,
    })
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this transaction permanently?')) return
    if (editId === id) resetForm()
    try {
      await deleteDoc(doc(db, 'users', uid, 'moneyTransactions', id))
    } catch (err) {
      console.error('Deleting transaction failed:', err)
      setError('Could not delete that transaction.')
    }
  }

  const clearAll = async () => {
    if (!confirm(`Delete all ${txns.length} transactions from your account? This cannot be undone.`)) return
    try {
      await Promise.all(txns.map(t => deleteDoc(doc(db, 'users', uid, 'moneyTransactions', t.id))))
      resetForm()
    } catch (err) {
      console.error('Clearing transactions failed:', err)
      setError('Could not clear the history.')
    }
  }

  // Headline totals always cover the whole ledger, not the filtered view.
  const totals = useMemo(() => {
    const cashIn = txns.filter(t => t.type === 'in').reduce((s, t) => s + (t.amount || 0), 0)
    const cashOut = txns.filter(t => t.type === 'out').reduce((s, t) => s + (t.amount || 0), 0)
    return { cashIn, cashOut, balance: cashIn - cashOut }
  }, [txns])

  const visible = useMemo(() => {
    const q = search.toLowerCase().trim()
    return txns
      .filter(t => {
        const hay = [t.name, t.phone, t.method].join(' ').toLowerCase()
        return (
          (typeFilter === 'all' || t.type === typeFilter) &&
          (methodFilter === 'all' || t.method === methodFilter) &&
          hay.includes(q)
        )
      })
      .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))
  }, [txns, search, typeFilter, methodFilter])

  // Net of what is currently on screen — moves with the filters, unlike the cards.
  const shownNet = useMemo(
    () => visible.reduce((s, t) => s + (t.type === 'in' ? t.amount : -t.amount), 0),
    [visible],
  )

  const typeBtn = (t: TxnType) => {
    const active = form.type === t
    if (t === 'in') {
      return active
        ? 'bg-[#dcfce7]! border-[#86efac] text-[#15803d]'
        : 'bg-[#f8fafc]! border-[#e6eaf0] text-[#475467]'
    }
    return active
      ? 'bg-[#fee2e2]! border-[#fca5a5] text-[#b91c1c]'
      : 'bg-[#f8fafc]! border-[#e6eaf0] text-[#475467]'
  }

  return (
    <div id="moneyflow-root" className="min-h-screen bg-[#f3f6fb] text-[#172033]">
      <style>{PRINT_CSS}</style>

      <header className="no-print px-4 py-5 text-white shadow-[0_4px_20px_#17255433] bg-gradient-to-br from-[#0f172a] via-[#1e3a8a] to-[#2563eb]">
        <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between gap-3">
          <div className="min-w-0">
            {/* One flex line so the emoji, name and version can never wrap apart. */}
            <h1 className="flex items-baseline gap-1.5 whitespace-nowrap tracking-tight">
              <span aria-hidden="true">💳</span>
              <span>MoneyFlow</span>
              <span className="text-[10px] font-medium text-[#93c5fd]">{VERSION}</span>
            </h1>
            <p className="mt-1 mb-0 truncate text-[13px] text-[#dbeafe]">Personal Cash In &amp; Out Manager</p>
          </div>
          <HeaderMenu
            user={user}
            onLogout={onLogout}
            onDownloadPdf={() => window.print()}
            canDownload={txns.length > 0}
          />
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1100px] p-4 pb-10">
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <SummaryCard label="Total Cash In" value={money(totals.cashIn)} accent="text-[#16a34a]" bar="#16a34a" />
          <SummaryCard label="Total Cash Out" value={money(totals.cashOut)} accent="text-[#dc2626]" bar="#dc2626" />
          <SummaryCard label="Current Balance" value={money(totals.balance)} accent="text-[#2563eb]" bar="#2563eb" />
          <SummaryCard label="Total Transactions" value={String(txns.length)} accent="text-[#7c3aed]" bar="#7c3aed" />
        </section>

        <form
          onSubmit={submit}
          className="no-print rounded-2xl bg-white p-4 sm:p-5 mb-4 shadow-[0_12px_35px_rgba(15,23,42,.07)]"
        >
          <h2 className="flex items-center gap-2" style={{ marginTop: 0, marginBottom: 14 }}>
            <span aria-hidden="true">{editId ? '✏️' : '➕'}</span>
            <span>{editId ? 'Edit Transaction' : 'Add Transaction'}</span>
          </h2>

          <div className="grid grid-cols-2 gap-2 mb-3.5">
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, type: 'in' }))}
              className={`p-3 rounded-lg border font-bold text-sm cursor-pointer ${typeBtn('in')}`}
            >
              ➕ CASH IN
            </button>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, type: 'out' }))}
              className={`p-3 rounded-lg border font-bold text-sm cursor-pointer ${typeBtn('out')}`}
            >
              ➖ CASH OUT
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Name" hint="*">
              <input type="text" placeholder="Who sent / received?"
                value={form.name} onChange={set('name')} className={inputClass} />
            </Field>

            <Field label="Phone Number">
              <input type="tel" inputMode="tel" placeholder="Phone number"
                value={form.phone} onChange={set('phone')} className={inputClass} />
            </Field>

            <Field label="Amount" hint="(₹) *">
              {/* Deliberately type="text": a number input reports an empty value for
                  anything it considers invalid, so the filter would never see the
                  stray characters it is meant to strip. */}
              <input type="text" inputMode="decimal" placeholder="0.00"
                value={form.amount} onChange={set('amount')} className={inputClass} />
            </Field>

            <Field label="Payment Method">
              <select value={form.method} onChange={set('method')} className={inputClass} style={selectStyle}>
                {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>

            <Field label="Date" hint="*">
              <input type="date" value={form.date} onChange={set('date')} className={inputClass} />
            </Field>

            <Field label="Time" hint="*">
              <input type="time" value={form.time} onChange={set('time')} className={inputClass} />
            </Field>
          </div>

          {error && (
            <div className="mt-4 p-3 rounded-lg bg-[#fee2e2] border border-[#fca5a5] text-[#b91c1c] text-sm">
              {error}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 mt-4">
            <button
              type="submit"
              className="flex-1 sm:flex-none px-5 py-3 rounded-lg bg-[#2563eb]! text-white! font-bold cursor-pointer hover:bg-[#1d4ed8]! transition-colors"
            >
              {editId ? 'Update Transaction' : 'Save Transaction'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="flex-1 sm:flex-none px-5 py-3 rounded-lg bg-[#eef2f6]! text-[#344054]! font-bold cursor-pointer hover:bg-[#e2e8f0]! transition-colors"
            >
              {editId ? 'Cancel Edit' : 'Clear'}
            </button>
          </div>

          {notice && <div className="mt-3 text-sm text-[#15803d]">{notice}</div>}
        </form>

        <section className="rounded-2xl bg-white p-4 sm:p-5 shadow-[0_12px_35px_rgba(15,23,42,.07)]">
          <div className="no-print grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.5fr_.7fr_.7fr] gap-2.5 mb-3">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="🔎 Search name, phone or method..."
              className={`${inputClass} sm:col-span-2 lg:col-span-1`}
            />
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as 'all' | TxnType)} className={inputClass} style={selectStyle}>
              <option value="all">All Types</option>
              <option value="in">Cash In</option>
              <option value="out">Cash Out</option>
            </select>
            <select value={methodFilter} onChange={e => setMethodFilter(e.target.value)} className={inputClass} style={selectStyle}>
              <option value="all">All Methods</option>
              {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className="no-print flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="text-sm">
              <b>Recent Activity</b>
              <span className="text-[#667085]"> · your cash flow at a glance</span>
              {syncing && <span className="ml-2 text-xs text-[#2563eb]">syncing…</span>}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => window.print()}
                disabled={!txns.length}
                className="px-3 py-2 text-sm rounded-lg border border-[#d0d5dd] bg-white! text-[#344054]! hover:border-[#2563eb] disabled:opacity-40 disabled:hover:border-[#d0d5dd] cursor-pointer"
              >
                🧾 Download PDF
              </button>
              <button
                onClick={clearAll}
                disabled={!txns.length}
                className="px-3 py-2 text-sm rounded-lg border border-[#fca5a5] bg-[#fee2e2]! text-[#b91c1c]! hover:bg-[#fecaca]! disabled:opacity-40 cursor-pointer"
              >
                Clear All
              </button>
            </div>
          </div>

          <div id="money-print-area">
            <div className="hidden print-only mb-3">
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>MoneyFlow — Transaction Report</h2>
              <div style={{ fontSize: 11 }}>{user.email} — generated {new Date().toLocaleString('en-IN')}</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>
                Cash In {money(totals.cashIn)} · Cash Out {money(totals.cashOut)} · Balance {money(totals.balance)}
              </div>
            </div>

            {visible.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#d0d5dd] p-8 text-center text-[#667085] text-sm">
                {syncing
                  ? 'Loading your transactions…'
                  : txns.length
                    ? 'No transactions match those filters.'
                    : 'No transactions yet — add your first one above.'}
              </div>
            ) : (
              <>
                {/* Phones: one card per transaction, so nothing needs sideways scrolling. */}
                <div className="md:hidden screen-only space-y-3">
                  {visible.map(t => (
                    <div key={t.id} className="rounded-xl border border-[#e8edf4] bg-white p-3 shadow-[0_3px_10px_rgba(15,23,42,.04)]">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold break-words">{t.name}</div>
                          <div className="text-xs text-[#667085] mt-0.5">{t.date} · {t.time}</div>
                        </div>
                        <div className={`text-base font-bold shrink-0 ${t.type === 'in' ? 'text-[#15803d]' : 'text-[#b91c1c]'}`}>
                          {t.type === 'in' ? '+' : '−'}{money(t.amount)}
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#667085]">
                        <span className={`rounded-full px-2 py-1 text-[11px] font-extrabold ${t.type === 'in' ? 'bg-[#dcfce7] text-[#15803d]' : 'bg-[#fee2e2] text-[#b91c1c]'}`}>
                          {t.type === 'in' ? 'CASH IN' : 'CASH OUT'}
                        </span>
                        <span>{t.method}</span>
                        {t.phone && <span>· {t.phone}</span>}
                      </div>

                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => startEdit(t)}
                          className="px-2.5 py-1.5 rounded-md text-[11px] font-bold bg-[#e0e7ff]! text-[#3730a3]! cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => remove(t.id)}
                          className="px-2.5 py-1.5 rounded-md text-[11px] font-bold bg-[#fee2e2]! text-[#b91c1c]! cursor-pointer"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Tablet and up (and every printed page): the full table. */}
                <div className="hidden md:block print-table overflow-x-auto rounded-xl border border-[#e6eaf0]">
                  <table className="w-full text-sm border-collapse min-w-[820px]">
                    <thead>
                      <tr className="bg-[#f5f7fb] text-[#475467] text-xs uppercase tracking-wide">
                        <th className="text-left p-2.5">Date &amp; Time</th>
                        <th className="text-left p-2.5">Type</th>
                        <th className="text-left p-2.5">Name</th>
                        <th className="text-left p-2.5">Phone</th>
                        <th className="text-right p-2.5">Amount</th>
                        <th className="text-left p-2.5">Method</th>
                        <th className="no-print p-2.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map(t => (
                        <tr key={t.id} className="border-t border-[#eef1f5]">
                          <td className="p-2.5 whitespace-nowrap">{t.date}<br /><span className="text-[#667085]">{t.time}</span></td>
                          <td className="p-2.5">
                            <span className={`inline-block rounded-full px-2 py-1 text-[11px] font-extrabold ${t.type === 'in' ? 'bg-[#dcfce7] text-[#15803d]' : 'bg-[#fee2e2] text-[#b91c1c]'}`}>
                              {t.type === 'in' ? 'CASH IN' : 'CASH OUT'}
                            </span>
                          </td>
                          <td className="p-2.5">{t.name}</td>
                          <td className="p-2.5 text-[#667085]">{t.phone || '-'}</td>
                          <td className={`p-2.5 text-right font-bold whitespace-nowrap ${t.type === 'in' ? 'text-[#15803d]' : 'text-[#b91c1c]'}`}>
                            {t.type === 'in' ? '+' : '−'}{money(t.amount)}
                          </td>
                          <td className="p-2.5 text-[#475467]">{t.method}</td>
                          <td className="no-print p-2.5 text-right whitespace-nowrap">
                            <button
                              onClick={() => startEdit(t)}
                              className="px-2 py-1.5 rounded-md text-[11px] font-bold bg-[#e0e7ff]! text-[#3730a3]! cursor-pointer"
                            >
                              Edit
                            </button>{' '}
                            <button
                              onClick={() => remove(t.id)}
                              className="px-2 py-1.5 rounded-md text-[11px] font-bold bg-[#fee2e2]! text-[#b91c1c]! cursor-pointer"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-[#e6eaf0] bg-[#f8fafc] font-semibold">
                        <td className="p-2.5" colSpan={4}>Net of shown transactions</td>
                        <td className={`p-2.5 text-right ${shownNet < 0 ? 'text-[#b91c1c]' : 'text-[#15803d]'}`}>
                          {money(shownNet)}
                        </td>
                        <td className="p-2.5" colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}
          </div>

          <div className="no-print mt-3 flex flex-wrap justify-between gap-2 text-xs text-[#667085]">
            <span>Showing {visible.length} of {txns.length} transaction{txns.length === 1 ? '' : 's'}</span>
            <span>Net of shown: <b className={shownNet < 0 ? 'text-[#b91c1c]' : 'text-[#15803d]'}>{money(shownNet)}</b></span>
          </div>
        </section>

        <p className="no-print mt-4 text-center text-xs text-[#98a2b3]">
          "Download PDF" opens your browser's print dialog — choose <b>Save as PDF</b> as the destination.
        </p>
      </div>
    </div>
  )
}
