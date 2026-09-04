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

const tripsCollection = (uid: string) => collection(db, 'users', uid, 'fuelTrips')

// ---------------------------------------------------------------------------
// "Add to Home screen" support
// ---------------------------------------------------------------------------

/** Page-scoped manifest — makes the home-screen icon open /fuel, not the app root. */
const FUEL_MANIFEST = '/fuel.webmanifest'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Chrome fires beforeinstallprompt once, very early — often before React has
// mounted anything — so the handler is registered at module load and the event
// parked here until the button needs it.
let deferredInstall: BeforeInstallPromptEvent | null = null
const INSTALL_READY = 'fuel:install-ready'

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

interface Trip {
  id: string
  date: string
  startLocation: string
  endLocation: string
  fuelAmount: number
  fuelRate: number
  mileage: number
  startOdo: number
  endOdo: number
  // Derived at save time so the history keeps the numbers that were actually used.
  fuelReceived: number
  estimatedRange: number
  distance: number
  createdAt: number
}

const EMPTY_FORM = {
  date: new Date().toISOString().split('T')[0],
  fuelAmount: '',
  fuelRate: '',
  mileage: '',
  startLocation: '',
  endLocation: '',
  startOdo: '',
  endOdo: '',
}

type Form = typeof EMPTY_FORM

const num = (v: string) => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

const money = (n: number) => '₹' + n.toFixed(2)
const litres = (n: number) => n.toFixed(2) + ' L'
const km = (n: number) => n.toFixed(1) + ' km'

// Printed sheets go to white paper — the dark theme would waste ink and read badly.
const PRINT_CSS = `
@media print {
  body * { visibility: hidden; }
  #fuel-print-area, #fuel-print-area * { visibility: visible; }
  #fuel-print-area {
    position: absolute; left: 0; top: 0; width: 100%;
    background: #fff !important; color: #000 !important; padding: 0;
  }
  #fuel-print-area * { background: transparent !important; color: #000 !important; border-color: #999 !important; }
  #fuel-print-area .no-print { display: none !important; }
  #fuel-print-area table { width: 100%; border-collapse: collapse; font-size: 11px; }
  #fuel-print-area th, #fuel-print-area td { border: 1px solid #999 !important; padding: 4px 6px; }
  #fuel-print-area .print-only { display: block !important; }
  /* Print always uses the table, even from a phone where the cards are shown. */
  #fuel-print-area .screen-only { display: none !important; }
  #fuel-print-area .print-table { display: block !important; overflow: visible !important; }
  #fuel-print-area .print-table table { min-width: 0 !important; }
  @page { size: A4 landscape; margin: 12mm; }
}
`

function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-[#888] uppercase tracking-wide">
        {label}{hint && <span className="ml-1 normal-case font-normal text-[#666]">{hint}</span>}
      </span>
      {children}
    </label>
  )
}

const inputClass =
  'w-full p-3 rounded-md border border-[#333] bg-[#1e1e1e] text-[#f0f0f0] text-base ' +
  'focus:outline-none focus:border-[#00bfff] transition-colors'

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-[#333] bg-[#1e1e1e] px-3 py-3 text-center">
      <div className="text-[11px] uppercase tracking-wide text-[#888]">{label}</div>
      <div className={`mt-1 text-lg font-bold ${accent ?? 'text-[#f0f0f0]'}`}>{value}</div>
    </div>
  )
}

/** One headline number inside a mobile trip card. */
function CardValue({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-md bg-[#121212] border border-[#2a2a2a] py-2">
      <div className="text-[10px] uppercase tracking-wide text-[#888]">{label}</div>
      <div className={`text-sm font-bold ${accent}`}>{value}</div>
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

/** Login wall — trips live under the signed-in account, so a Google user is required. */
function SignInGate({ onLogin, anonymous }: { onLogin: () => void; anonymous: boolean }) {
  return (
    <div className="min-h-screen bg-[#121212] text-[#f0f0f0] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-[380px] text-center">
        <div className="text-5xl mb-4">⛽</div>
        <h1 className="text-[#00bfff] text-2xl font-bold mb-2">Fuel &amp; Trip Tracker</h1>
        <p className="text-gray-500 text-sm mb-6">
          {anonymous
            ? 'You are signed in as a guest. Trips are saved to your Google account, so please sign in with Google to continue.'
            : 'Sign in with Google to log your trips — your history syncs across every device you use.'}
        </p>
        {/* index.css sets an unlayered `button { background-color: #1a1a1a }`, which
            outranks Tailwind's layered utilities — hence the `!` on the colours. */}
        <button
          onClick={onLogin}
          className="w-full flex items-center justify-center p-3 rounded-md bg-white! text-[#1a1a1a]! font-semibold cursor-pointer hover:bg-gray-200! transition-colors"
        >
          <GoogleIcon />
          Continue with Google
        </button>
        <Link to="/" className="mt-5 inline-block text-[#888] text-sm hover:text-[#00bfff]">← Back to Utilities</Link>
      </div>
    </div>
  )
}

/**
 * Points the document at the fuel-scoped manifest while this page is mounted, so
 * an "Add to Home screen" from here lands on /fuel with its own name and icon.
 * The app's normal manifest is put back on the way out.
 */
function useFuelManifest() {
  useEffect(() => {
    const existing = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    const previous = existing?.getAttribute('href') ?? null
    const link = existing ?? document.createElement('link')
    if (!existing) {
      link.rel = 'manifest'
      document.head.appendChild(link)
    }
    link.setAttribute('href', FUEL_MANIFEST)
    return () => {
      if (previous === null) link.remove()
      else link.setAttribute('href', previous)
    }
  }, [])
}

/** Header icon that drops a Fuel Log shortcut on the phone's home screen. */
function AddToHomeButton() {
  const [ready, setReady] = useState(() => deferredInstall !== null)
  const [help, setHelp] = useState(false)
  const [installed] = useState(isStandalone)

  useEffect(() => {
    const onReady = () => setReady(deferredInstall !== null)
    window.addEventListener(INSTALL_READY, onReady)
    return () => window.removeEventListener(INSTALL_READY, onReady)
  }, [])

  // Already launched from the home screen — nothing left to add.
  if (installed) return null

  const add = async () => {
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
      setReady(false)
      if (outcome === 'dismissed') setHelp(true)
    } catch (err) {
      console.error('Install prompt failed:', err)
      setHelp(true)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={add}
        title={ready ? 'Add Fuel Log to your home screen' : 'How to add this to your home screen'}
        aria-label="Add to home screen"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[#333] bg-[#1e1e1e]! text-sm hover:border-[#00bfff] cursor-pointer"
      >
        <span aria-hidden="true">📲</span>
        <span className="hidden sm:inline text-xs text-[#888]">Add to Home</span>
      </button>

      {help && (
        <div className="absolute right-0 z-10 mt-2 w-[270px] rounded-lg border border-[#333] bg-[#1e1e1e] p-3 text-left text-xs leading-relaxed text-[#bbb] shadow-lg">
          <div className="mb-2 font-semibold text-[#f0f0f0]">Add a Fuel Log icon</div>
          <p className="mb-2">
            <b className="text-[#00bfff]">Android / Chrome:</b> tap the ⋮ menu → <b>Add to Home screen</b>.
          </p>
          <p className="mb-2">
            <b className="text-[#00bfff]">iPhone / Safari:</b> tap Share → <b>Add to Home Screen</b>.
          </p>
          <p className="text-[#666]">The icon opens this page straight away.</p>
          <button onClick={() => setHelp(false)} className="mt-2 bg-transparent! text-[#888] hover:text-[#00bfff] cursor-pointer">
            Got it
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Avatar-only account control — the name and Logout button cost more header room
 * than they are worth on a phone, so they live in a popover behind the picture.
 */
function UserMenu({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [open, setOpen] = useState(false)
  const initial = (user.displayName || user.email || '?').charAt(0).toUpperCase()

  // Any click outside the menu, or Escape, closes it.
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-user-menu]')) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" data-user-menu>
      <button
        onClick={() => setOpen(o => !o)}
        title={user.displayName || user.email || 'Account'}
        aria-label="Account"
        aria-expanded={open}
        className="block rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#00bfff]"
      >
        {user.photoURL ? (
          <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full object-cover" />
        ) : (
          <span className="flex w-8 h-8 items-center justify-center rounded-full bg-[#1e1e1e] border border-[#333] text-sm font-semibold text-[#00bfff]">
            {initial}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-[230px] rounded-lg border border-[#333] bg-[#1e1e1e] p-4 text-center shadow-lg">
          {user.photoURL ? (
            <img src={user.photoURL} alt="" className="mx-auto w-14 h-14 rounded-full object-cover" />
          ) : (
            <span className="mx-auto flex w-14 h-14 items-center justify-center rounded-full bg-[#121212] border border-[#333] text-xl font-semibold text-[#00bfff]">
              {initial}
            </span>
          )}
          <div className="mt-2 text-sm font-semibold text-[#f0f0f0] break-words">{user.displayName || 'Signed in'}</div>
          {user.email && <div className="text-xs text-[#888] break-all">{user.email}</div>}
          <button
            onClick={onLogout}
            className="mt-3 w-full rounded-md border border-[#333] bg-[#121212]! px-3 py-2 text-sm text-[#bbb] hover:border-red-700 hover:text-red-300 cursor-pointer"
          >
            Logout
          </button>
        </div>
      )}
    </div>
  )
}

export function FuelTracker() {
  useSEO({
    title: 'Fuel & Trip Tracker',
    description: 'Log vehicle trips and fuel expenses — auto-calculates fuel received, estimated range and distance driven, syncs to your Google account and exports as a PDF.',
    keywords: 'fuel tracker, mileage log, trip tracker, odometer, fuel expense, petrol log, vehicle log book',
  })

  useFuelManifest()

  const { user, loading, login, logout } = useAuth()
  // Anonymous sessions have no email; those accounts are not allowed past the gate.
  const uid = user?.email ? user.uid : null

  if (loading) {
    return (
      <div className="min-h-screen bg-[#121212] text-[#888] flex items-center justify-center text-sm">
        Checking your session…
      </div>
    )
  }

  if (!uid || !user) return <SignInGate onLogin={login} anonymous={!!user} />

  // Keyed on uid so switching accounts rebuilds the log against the right cache.
  return <TripLog key={uid} uid={uid} user={user} onLogout={logout} />
}

function TripLog({ uid, user, onLogout }: { uid: string; user: User; onLogout: () => void }) {
  const [form, setForm] = useState<Form>(EMPTY_FORM)
  const [trips, setTrips] = useState<Trip[]>([])
  const [syncing, setSyncing] = useState(true)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  // Firestore is the single source of truth — nothing is kept in localStorage.
  // The persistent cache above keeps the log readable across refreshes and offline.
  useEffect(() => {
    const q = query(tripsCollection(uid), orderBy('createdAt', 'desc'))
    const unsubscribe = onSnapshot(
      q,
      snap => {
        setTrips(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Trip, 'id'>) })))
        setSyncing(false)
      },
      err => {
        console.error('Fuel trips sync failed:', err)
        setError('Could not load your trips. Check your connection and refresh.')
        setSyncing(false)
      },
    )
    return () => unsubscribe()
  }, [uid])

  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => ({ ...f, [key]: e.target.value }))
    setError('')
  }

  // Live preview of the three derived values while the form is being filled.
  const preview = useMemo(() => {
    const amount = num(form.fuelAmount)
    const rate = num(form.fuelRate)
    const mileage = num(form.mileage)
    const fuelReceived = rate > 0 ? amount / rate : 0
    const start = num(form.startOdo)
    const end = num(form.endOdo)
    return {
      fuelReceived,
      estimatedRange: fuelReceived * mileage,
      distance: end > start ? end - start : 0,
    }
  }, [form.fuelAmount, form.fuelRate, form.mileage, form.startOdo, form.endOdo])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!uid) return
    const amount = parseFloat(form.fuelAmount)
    const rate = parseFloat(form.fuelRate)
    const mileage = parseFloat(form.mileage)
    const startOdo = parseFloat(form.startOdo)
    const endOdo = parseFloat(form.endOdo)

    if (!form.date) return setError('Pick a date for the trip.')
    if (!Number.isFinite(amount) || amount < 0) return setError('Enter the fuel amount paid.')
    if (!Number.isFinite(rate) || rate <= 0) return setError('Enter a fuel rate greater than 0.')
    if (!Number.isFinite(mileage) || mileage <= 0) return setError('Enter the approximate mileage (km/L).')
    if (!form.startLocation.trim() || !form.endLocation.trim()) return setError('Enter both start and end locations.')
    if (!Number.isFinite(startOdo) || !Number.isFinite(endOdo)) return setError('Enter both odometer readings.')
    if (endOdo < startOdo) return setError('Ending odometer cannot be less than the starting reading.')

    const fuelReceived = amount / rate
    const trip: Omit<Trip, 'id'> = {
      date: form.date,
      startLocation: form.startLocation.trim(),
      endLocation: form.endLocation.trim(),
      fuelAmount: amount,
      fuelRate: rate,
      mileage,
      startOdo,
      endOdo,
      fuelReceived,
      estimatedRange: fuelReceived * mileage,
      distance: endOdo - startOdo,
      createdAt: Date.now(),
    }

    // Keep date, rate and mileage — they rarely change between consecutive trips.
    setForm(f => ({ ...f, startLocation: '', endLocation: '', startOdo: '', endOdo: '', fuelAmount: '' }))
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)

    try {
      await addDoc(tripsCollection(uid), trip)
    } catch (err) {
      console.error('Saving trip failed:', err)
      setError('Could not save the trip to the cloud. Check your connection and try again.')
    }
  }

  const removeTrip = async (id: string) => {
    if (!uid) return
    try {
      await deleteDoc(doc(db, 'users', uid, 'fuelTrips', id))
    } catch (err) {
      console.error('Deleting trip failed:', err)
      setError('Could not delete that trip.')
    }
  }

  const clearAll = async () => {
    if (!uid) return
    if (!confirm(`Delete all ${trips.length} saved trips from your account? This cannot be undone.`)) return
    try {
      await Promise.all(trips.map(t => deleteDoc(doc(db, 'users', uid, 'fuelTrips', t.id))))
    } catch (err) {
      console.error('Clearing trips failed:', err)
      setError('Could not clear the history.')
    }
  }

  const totals = useMemo(() => trips.reduce(
    (acc, t) => ({
      distance: acc.distance + t.distance,
      spent: acc.spent + t.fuelAmount,
      fuel: acc.fuel + t.fuelReceived,
    }),
    { distance: 0, spent: 0, fuel: 0 },
  ), [trips])

  return (
    <div className="min-h-screen bg-[#121212] text-[#f0f0f0] p-4 pt-6">
      <style>{PRINT_CSS}</style>

      <div className="mx-auto w-full max-w-[900px]">
        <div className="no-print flex items-center justify-between gap-3 mb-2">
          <Link to="/" className="text-[#888] text-sm hover:text-[#00bfff]">← Back</Link>
          <div className="flex items-center gap-2 text-xs text-[#666]">
            <AddToHomeButton />
            <UserMenu user={user} onLogout={onLogout} />
          </div>
        </div>

        <h1 className="no-print text-center text-[#00bfff] text-2xl font-bold">⛽ Fuel &amp; Trip Tracker</h1>
        <p className="no-print text-center text-gray-500 text-sm mb-6">
          Log every trip and fuel fill — synced to your Google account
        </p>

        <form onSubmit={submit} className="no-print rounded-lg border border-[#333] bg-[#181818] p-4 mb-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Field label="Date">
                <input type="date" value={form.date} onChange={set('date')} className={inputClass} />
              </Field>
            </div>

            <Field label="Fuel Amount Paid" hint="(₹)">
              <input type="number" inputMode="decimal" min="0" step="0.01" placeholder="500"
                value={form.fuelAmount} onChange={set('fuelAmount')} className={inputClass} />
            </Field>

            <Field label="Fuel Rate" hint="(₹ / litre)">
              <input type="number" inputMode="decimal" min="0" step="0.01" placeholder="105.50"
                value={form.fuelRate} onChange={set('fuelRate')} className={inputClass} />
            </Field>

            <div className="sm:col-span-2">
              <Field label="Approximate Mileage" hint="(km / litre)">
                <input type="number" inputMode="decimal" min="0.1" step="0.1" placeholder="15"
                  value={form.mileage} onChange={set('mileage')} className={inputClass} />
              </Field>
            </div>

            <Field label="Start Location">
              <input type="text" placeholder="Kochi"
                value={form.startLocation} onChange={set('startLocation')} className={inputClass} />
            </Field>

            <Field label="End Location">
              <input type="text" placeholder="Kottayam"
                value={form.endLocation} onChange={set('endLocation')} className={inputClass} />
            </Field>

            <Field label="Starting Odometer" hint="(km)">
              <input type="number" inputMode="decimal" min="0" step="0.1" placeholder="60.5"
                value={form.startOdo} onChange={set('startOdo')} className={inputClass} />
            </Field>

            <Field label="Ending Odometer" hint="(km)">
              <input type="number" inputMode="decimal" min="0" step="0.1" placeholder="128.9"
                value={form.endOdo} onChange={set('endOdo')} className={inputClass} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-5">
            <Stat label="Fuel Received" value={litres(preview.fuelReceived)} accent="text-[#00bfff]" />
            <Stat label="Estimated Range" value={km(preview.estimatedRange)} accent="text-[#f0a500]" />
            <Stat label="Distance Driven" value={km(preview.distance)} accent="text-green-400" />
          </div>

          {error && (
            <div className="mt-4 p-3 rounded-md bg-red-900/50 border border-red-700 text-red-300 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full mt-4 p-3 bg-gradient-to-r from-[#8a2be2] to-[#00bfff] text-white rounded-md font-bold uppercase tracking-wide cursor-pointer hover:from-[#00bfff] hover:to-[#8a2be2] transition-all"
          >
            Save Trip
          </button>

          {saved && <div className="mt-3 text-center text-sm text-green-400">✓ Trip saved to your account</div>}
        </form>

        <div id="fuel-print-area">
          <div className="hidden print-only mb-3">
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Fuel &amp; Trip History</h2>
            <div style={{ fontSize: 11 }}>{user?.email} — generated {new Date().toLocaleString()}</div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="text-lg font-bold">
              Trip History <span className="text-[#666] text-sm font-normal">({trips.length})</span>
              {syncing && <span className="no-print ml-2 text-xs font-normal text-[#00bfff]">syncing…</span>}
            </h2>
            <div className="no-print flex gap-2">
              <button
                onClick={() => window.print()}
                disabled={!trips.length}
                className="px-3 py-2 text-sm rounded-md border border-[#333] bg-[#1e1e1e]! hover:border-[#00bfff] disabled:opacity-40 disabled:hover:border-[#333] cursor-pointer"
              >
                ⬇ Download PDF
              </button>
              <button
                onClick={clearAll}
                disabled={!trips.length}
                className="px-3 py-2 text-sm rounded-md border border-red-900 bg-red-900/30! text-red-300 hover:bg-red-900/60! disabled:opacity-40 cursor-pointer"
              >
                Clear All
              </button>
            </div>
          </div>

          {trips.length > 0 && (
            <div className="grid grid-cols-3 gap-3 mb-4">
              <Stat label="Total Distance" value={km(totals.distance)} accent="text-green-400" />
              <Stat label="Total Spent" value={money(totals.spent)} accent="text-[#ff1493]" />
              <Stat label="Total Fuel" value={litres(totals.fuel)} accent="text-[#00bfff]" />
            </div>
          )}

          {trips.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#333] p-8 text-center text-[#666] text-sm">
              {syncing ? 'Loading your trips…' : 'No trips saved yet — fill the form above to add your first one.'}
            </div>
          ) : (
            <>
            {/* Phones: one card per trip, so nothing needs sideways scrolling. */}
            <div className="md:hidden screen-only space-y-3">
              {trips.map(t => (
                <div key={t.id} className="rounded-lg border border-[#333] bg-[#181818] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold break-words">{t.startLocation} → {t.endLocation}</div>
                      <div className="text-xs text-[#888] mt-0.5">{t.date}</div>
                    </div>
                    <button
                      onClick={() => removeTrip(t.id)}
                      title="Delete trip"
                      aria-label="Delete trip"
                      className="shrink-0 bg-transparent! text-red-400 hover:text-red-300 cursor-pointer px-1"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <CardValue label="Distance" value={km(t.distance)} accent="text-green-400" />
                    <CardValue label="Fuel" value={litres(t.fuelReceived)} accent="text-[#00bfff]" />
                    <CardValue label="Range" value={km(t.estimatedRange)} accent="text-[#f0a500]" />
                  </div>

                  <div className="mt-3 space-y-1 text-xs text-[#888]">
                    <div className="flex justify-between"><span>Odometer</span><span className="text-[#bbb]">{t.startOdo} → {t.endOdo}</span></div>
                    <div className="flex justify-between"><span>Paid</span><span className="text-[#bbb]">{money(t.fuelAmount)} @ {money(t.fuelRate)}/L</span></div>
                    <div className="flex justify-between"><span>Mileage</span><span className="text-[#bbb]">{t.mileage} km/L</span></div>
                  </div>
                </div>
              ))}
            </div>

            {/* Tablet and up (and every printed page): the full table. */}
            <div className="hidden md:block print-table overflow-x-auto rounded-lg border border-[#333]">
              <table className="w-full text-sm border-collapse min-w-[820px]">
                <thead>
                  <tr className="bg-[#1e1e1e] text-[#888] text-xs uppercase tracking-wide">
                    <th className="text-left p-2">Date</th>
                    <th className="text-left p-2">Route</th>
                    <th className="text-right p-2">Odometer</th>
                    <th className="text-right p-2">Distance</th>
                    <th className="text-right p-2">Paid</th>
                    <th className="text-right p-2">Rate</th>
                    <th className="text-right p-2">Mileage</th>
                    <th className="text-right p-2">Fuel</th>
                    <th className="text-right p-2">Range</th>
                    <th className="no-print p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {trips.map(t => (
                    <tr key={t.id} className="border-t border-[#2a2a2a]">
                      <td className="p-2 whitespace-nowrap">{t.date}</td>
                      <td className="p-2">{t.startLocation} → {t.endLocation}</td>
                      <td className="p-2 text-right whitespace-nowrap text-[#888]">{t.startOdo} → {t.endOdo}</td>
                      <td className="p-2 text-right font-semibold text-green-400">{km(t.distance)}</td>
                      <td className="p-2 text-right">{money(t.fuelAmount)}</td>
                      <td className="p-2 text-right text-[#888]">{money(t.fuelRate)}</td>
                      <td className="p-2 text-right text-[#888]">{t.mileage} km/L</td>
                      <td className="p-2 text-right text-[#00bfff]">{litres(t.fuelReceived)}</td>
                      <td className="p-2 text-right text-[#f0a500]">{km(t.estimatedRange)}</td>
                      <td className="no-print p-2 text-right">
                        <button
                          onClick={() => removeTrip(t.id)}
                          title="Delete trip"
                          className="bg-transparent! text-red-400 hover:text-red-300 cursor-pointer px-1"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-[#333] bg-[#1a1a1a] font-semibold">
                    <td className="p-2" colSpan={3}>Total</td>
                    <td className="p-2 text-right text-green-400">{km(totals.distance)}</td>
                    <td className="p-2 text-right">{money(totals.spent)}</td>
                    <td className="p-2" colSpan={2}></td>
                    <td className="p-2 text-right text-[#00bfff]">{litres(totals.fuel)}</td>
                    <td className="p-2" colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            </>
          )}
        </div>

        <p className="no-print mt-4 text-center text-xs text-[#555]">
          "Download PDF" opens your browser's print dialog — choose <b>Save as PDF</b> as the destination.
        </p>
      </div>
    </div>
  )
}
