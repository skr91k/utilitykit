import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSEO } from '../utils/useSEO'
import { useAuth } from '../utils/useAuth'
import { generateTotp, isValidSecret, normalizeSecret, parseOtpAuthUri } from '../utils/totp'
import type { TotpAlgorithm } from '../utils/totp'
import {
  subscribeToTotpEntries,
  addTotpEntry,
  renameTotpEntry,
  deleteTotpEntry,
  MAX_LABEL_LENGTH,
  MAX_SECRET_LENGTH,
} from '../utils/totpVaultFirebase'
import type { TotpEntry, NewTotpEntry } from '../utils/totpVaultFirebase'

// BarcodeDetector is Chromium/Safari only and not in the TS DOM lib yet
type BarcodeDetectorCtor = new (opts: { formats: string[] }) => {
  detect: (source: ImageBitmapSource) => Promise<{ rawValue: string }[]>
}
const BarcodeDetectorApi = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector

const EMPTY_FORM: NewTotpEntry = { issuer: '', account: '', secret: '', digits: 6, period: 30, algorithm: 'SHA1' }

// 123456 -> "123 456", 12345678 -> "1234 5678"
const groupCode = (code: string) => {
  const half = Math.ceil(code.length / 2)
  return `${code.slice(0, half)} ${code.slice(half)}`
}

const inputCls = 'w-full p-2 rounded-md border border-[#333] bg-[#1e1e1e] text-sm focus:outline-none focus:border-[#00bfff]'
const cancelCls = 'flex-1 p-2 rounded-md border! border-[#444]! bg-[#262626]! text-gray-200 font-semibold cursor-pointer hover:bg-[#333]!'
const primaryCls = 'flex-1 p-2 rounded-md bg-gradient-to-r from-[#8a2be2] to-[#00bfff] text-white font-bold cursor-pointer disabled:opacity-60'

export function TotpManager() {
  useSEO({
    title: 'TOTP Manager',
    description: 'Two-factor authenticator codes in your browser — add by otpauth link, QR image or setup key, synced to your Google account.',
    keywords: 'totp, 2fa, authenticator, one time password, otp generator, google authenticator',
  })

  const { user, loading, login } = useAuth()
  const uid = user && !user.isAnonymous && user.email ? user.uid : null

  const [entries, setEntries] = useState<TotpEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const [codes, setCodes] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<NewTotpEntry>(EMPTY_FORM)
  const [uri, setUri] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [editing, setEditing] = useState<TotpEntry | null>(null)
  const [showSecret, setShowSecret] = useState(false)

  useEffect(() => {
    if (!uid) { setEntries([]); return }
    setError(null)
    return subscribeToTotpEntries(uid, setEntries, setError)
  }, [uid])

  // Tick on the second boundary so every countdown flips together
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      setNow(Date.now())
      timer = setTimeout(tick, 1000 - (Date.now() % 1000))
    }
    tick()
    return () => clearTimeout(timer)
  }, [])

  // Recompute only when some entry's time step rolls over (or the list changes)
  const stepKey = entries.map(e => `${e.id}:${Math.floor(now / 1000 / e.period)}`).join()
  useEffect(() => {
    let cancelled = false
    Promise.all(entries.map(async e => [e.id, await generateTotp(e).catch(() => '------')] as const))
      .then(pairs => { if (!cancelled) setCodes(Object.fromEntries(pairs)) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey])

  const copyCode = async (entry: TotpEntry) => {
    const code = codes[entry.id]
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(entry.id)
      setTimeout(() => setCopied(c => (c === entry.id ? null : c)), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  const openAdd = () => {
    setForm(EMPTY_FORM)
    setUri('')
    setFormError(null)
    setAdding(true)
  }

  // Fill the form from an otpauth:// link (pasted or read off a QR image)
  const applyUri = (value: string) => {
    setUri(value)
    if (!value.trim()) { setFormError(null); return }
    try {
      setForm(parseOtpAuthUri(value))
      setFormError(null)
    } catch (e) {
      setFormError((e as Error).message)
    }
  }

  const scanQrImage = async (file: File | undefined) => {
    if (!file || !BarcodeDetectorApi) return
    try {
      const found = await new BarcodeDetectorApi({ formats: ['qr_code'] }).detect(await createImageBitmap(file))
      const link = found.find(b => b.rawValue.startsWith('otpauth://'))?.rawValue
      if (link) applyUri(link)
      else setFormError(found.length ? 'QR code is not an otpauth:// link' : 'No QR code found in that image')
    } catch (e) {
      setFormError((e as Error).message)
    }
  }

  const confirmAdd = async () => {
    if (!uid) return
    if (!isValidSecret(form.secret)) {
      setFormError('Secret must be a base32 key (letters A-Z and digits 2-7)')
      return
    }
    if (!form.issuer.trim() && !form.account.trim()) {
      setFormError('Give it a name — issuer or account')
      return
    }
    setBusy(true)
    try {
      await addTotpEntry(uid, form)
      setAdding(false)
    } catch (e) {
      setFormError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const openEdit = (entry: TotpEntry) => {
    setEditing(entry)
    setShowSecret(false)
    setFormError(null)
  }

  const confirmEdit = async () => {
    if (!uid || !editing) return
    setBusy(true)
    try {
      await renameTotpEntry(uid, editing.id, editing.issuer, editing.account)
      setEditing(null)
    } catch (e) {
      setFormError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (entry: TotpEntry) => {
    if (!uid) return
    const label = entry.issuer || entry.account
    if (!confirm(`Delete ${label}? Make sure 2FA is turned off or you have backup codes — this key can't be recovered.`)) return
    try {
      await deleteTotpEntry(uid, entry.id)
      setEditing(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const filtered = entries.filter(e => {
    const q = filter.trim().toLowerCase()
    return !q || e.issuer.toLowerCase().includes(q) || e.account.toLowerCase().includes(q)
  })

  return (
    <div className="min-h-screen bg-[#121212] text-[#f0f0f0] flex flex-col items-center p-4 pt-8">
      <div className="w-full max-w-[600px]">
        <h1 className="text-center text-[#00bfff] text-2xl font-bold mb-2">TOTP Manager</h1>
        <p className="text-center text-gray-500 text-sm mb-2">
          2FA codes generated in your browser — keys sync to your Google account only
        </p>
        <p className="text-center text-sm mb-6">
          <Link to="/password" className="text-[#f0a500] hover:underline">🔏 Password Generator →</Link>
        </p>

        {loading ? (
          <div className="text-center text-gray-500 py-8">Loading...</div>
        ) : !uid ? (
          <div className="rounded-lg border border-[#333] bg-[#1a1a1a] p-6 text-center">
            <p className="text-sm text-gray-400 mb-4">
              Sign in with Google to add and see your 2FA codes. Only your account can read the saved keys.
            </p>
            <button onClick={login} className="px-6 py-2 rounded-md bg-[#00bfff]! text-[#0b0b0b] font-bold cursor-pointer hover:bg-[#33ccff]!">
              Sign in with Google
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={openAdd}
              className="w-full mb-4 p-3 bg-gradient-to-r from-[#8a2be2] to-[#00bfff] text-white rounded-md font-bold uppercase tracking-wide cursor-pointer hover:from-[#00bfff] hover:to-[#8a2be2] transition-all"
            >
              + Add account
            </button>

            {error && (
              <div className="mb-3 p-3 rounded-md bg-red-900/50 border border-red-700 text-red-300 text-sm">{error}</div>
            )}

            {entries.length > 3 && (
              <input
                type="text"
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="Search issuer or account..."
                className={`${inputCls} mb-3`}
              />
            )}

            {entries.length === 0 ? (
              <div className="text-center text-gray-500 text-sm py-6">No accounts yet — tap Add and paste the setup key or otpauth link.</div>
            ) : (
              <ul className="space-y-2">
                {filtered.map(entry => {
                  const remaining = entry.period - (Math.floor(now / 1000) % entry.period)
                  const urgent = remaining <= 5
                  const code = codes[entry.id]
                  return (
                    <li key={entry.id} className="rounded-md border border-[#333] bg-[#1e1e1e] overflow-hidden">
                      <div className="flex items-center gap-3 p-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-gray-200 truncate">{entry.issuer || entry.account}</div>
                          {entry.issuer && entry.account && <div className="text-xs text-[#888] truncate">{entry.account}</div>}
                          <button
                            onClick={() => copyCode(entry)}
                            title="Copy code"
                            className={`mt-1 font-mono text-2xl sm:text-3xl font-bold tracking-wider cursor-pointer bg-transparent! p-0! border-0! ${urgent ? 'text-red-400' : 'text-[#00bfff]'}`}
                          >
                            {code ? groupCode(code) : '··· ···'}
                          </button>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className={`text-xs font-mono ${urgent ? 'text-red-400' : 'text-gray-400'}`}>{remaining}s</span>
                          <button onClick={() => copyCode(entry)} className="text-xs text-[#00bfff] font-semibold cursor-pointer">
                            {copied === entry.id ? 'Copied' : 'Copy'}
                          </button>
                          <button onClick={() => openEdit(entry)} className="text-xs text-gray-400 hover:text-white cursor-pointer">
                            Edit
                          </button>
                        </div>
                      </div>
                      <div className="h-1 bg-[#333]">
                        <div
                          className={`h-full transition-[width] duration-1000 ease-linear ${urgent ? 'bg-red-500' : 'bg-[#00bfff]'}`}
                          style={{ width: `${(remaining / entry.period) * 100}%` }}
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}
      </div>

      {adding && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50" onClick={() => !busy && setAdding(false)}>
          <div className="w-full max-w-[440px] max-h-full overflow-y-auto rounded-lg border border-[#333] bg-[#1a1a1a] p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-[#f0a500] mb-3">Add account</h3>
            <form onSubmit={e => { e.preventDefault(); confirmAdd() }} className="space-y-3">
              <input
                autoFocus
                type="text"
                value={uri}
                onChange={e => applyUri(e.target.value)}
                placeholder="Paste otpauth://totp/... link (optional)"
                autoComplete="off"
                className={inputCls}
              />
              {BarcodeDetectorApi && (
                <label className="block text-center text-sm p-2 rounded-md border border-dashed border-[#444] text-gray-300 cursor-pointer hover:border-[#00bfff]">
                  📷 Read QR code from image / screenshot
                  <input type="file" accept="image/*" className="hidden" onChange={e => { scanQrImage(e.target.files?.[0]); e.target.value = '' }} />
                </label>
              )}
              <div className="text-center text-xs text-gray-500">or enter the setup key</div>
              <input
                type="text"
                value={form.issuer}
                onChange={e => setForm(f => ({ ...f, issuer: e.target.value }))}
                maxLength={MAX_LABEL_LENGTH}
                placeholder="Issuer (e.g. GitHub)"
                className={inputCls}
              />
              <input
                type="text"
                value={form.account}
                onChange={e => setForm(f => ({ ...f, account: e.target.value }))}
                maxLength={MAX_LABEL_LENGTH}
                placeholder="Account (e.g. you@example.com)"
                autoComplete="off"
                className={inputCls}
              />
              <input
                type="text"
                value={form.secret}
                onChange={e => setForm(f => ({ ...f, secret: e.target.value }))}
                maxLength={MAX_SECRET_LENGTH}
                placeholder="Secret key (base32)"
                autoComplete="off"
                spellCheck={false}
                className={`${inputCls} font-mono`}
              />
              <div className="grid grid-cols-3 gap-2 text-xs text-[#888]">
                <label className="space-y-1">
                  <span>Digits</span>
                  <select value={form.digits} onChange={e => setForm(f => ({ ...f, digits: Number(e.target.value) }))} className={inputCls}>
                    <option value={6}>6</option>
                    <option value={8}>8</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span>Period</span>
                  <select value={form.period} onChange={e => setForm(f => ({ ...f, period: Number(e.target.value) }))} className={inputCls}>
                    {[...new Set([30, 60, form.period])].map(p => <option key={p} value={p}>{p}s</option>)}
                  </select>
                </label>
                <label className="space-y-1">
                  <span>Algorithm</span>
                  <select value={form.algorithm} onChange={e => setForm(f => ({ ...f, algorithm: e.target.value as TotpAlgorithm }))} className={inputCls}>
                    <option value="SHA1">SHA1</option>
                    <option value="SHA256">SHA256</option>
                    <option value="SHA512">SHA512</option>
                  </select>
                </label>
              </div>
              {formError && <div className="text-sm text-red-400">{formError}</div>}
              <div className="flex gap-2 pt-1">
                <button type="button" disabled={busy} onClick={() => setAdding(false)} className={cancelCls}>Cancel</button>
                <button type="submit" disabled={busy || !normalizeSecret(form.secret)} className={primaryCls}>
                  {busy ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50" onClick={() => !busy && setEditing(null)}>
          <div className="w-full max-w-[440px] rounded-lg border border-[#333] bg-[#1a1a1a] p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-[#f0a500] mb-3">Edit account</h3>
            <form onSubmit={e => { e.preventDefault(); confirmEdit() }} className="space-y-3">
              <input
                autoFocus
                type="text"
                value={editing.issuer}
                onChange={e => setEditing({ ...editing, issuer: e.target.value })}
                maxLength={MAX_LABEL_LENGTH}
                placeholder="Issuer"
                className={inputCls}
              />
              <input
                type="text"
                value={editing.account}
                onChange={e => setEditing({ ...editing, account: e.target.value })}
                maxLength={MAX_LABEL_LENGTH}
                placeholder="Account"
                autoComplete="off"
                className={inputCls}
              />
              <div className="rounded-md border border-[#333] bg-[#121212] p-2 text-xs">
                <div className="flex items-center justify-between text-[#888] mb-1">
                  <span>Secret key · {editing.digits} digits · {editing.period}s · {editing.algorithm}</span>
                  <button type="button" onClick={() => setShowSecret(s => !s)} className="text-gray-400 hover:text-white cursor-pointer">
                    {showSecret ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div className="font-mono text-sm break-all select-all">
                  {showSecret ? editing.secret : '•'.repeat(16)}
                </div>
              </div>
              {formError && <div className="text-sm text-red-400">{formError}</div>}
              <div className="flex gap-2 pt-1">
                <button type="button" disabled={busy} onClick={() => remove(editing)} className="p-2 px-3 rounded-md text-red-400 font-semibold cursor-pointer hover:bg-red-900/30">Delete</button>
                <button type="button" disabled={busy} onClick={() => setEditing(null)} className={cancelCls}>Cancel</button>
                <button
                  type="submit"
                  disabled={busy || (!editing.issuer.trim() && !editing.account.trim())}
                  className={primaryCls}
                >
                  {busy ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
