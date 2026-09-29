import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSEO } from '../utils/useSEO'
import { useAuth } from '../utils/useAuth'
import {
  subscribeToSavedPasswords,
  savePassword,
  deleteSavedPassword,
  MAX_FIELD_LENGTH,
} from '../utils/passwordVaultFirebase'
import type { SavedPassword } from '../utils/passwordVaultFirebase'

const SETS = {
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lower: 'abcdefghijklmnopqrstuvwxyz',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.<>/?~',
} as const

type SetKey = keyof typeof SETS

const SET_LABELS: Record<SetKey, string> = {
  upper: 'Uppercase (A-Z)',
  lower: 'Lowercase (a-z)',
  digits: 'Numbers (0-9)',
  symbols: 'Symbols (!@#…)',
}

const AMBIGUOUS = /[Il1O0o|`'"]/g

// Unbiased random index in [0, max) using crypto — rejection sampling avoids modulo bias.
function randomIndex(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max
  const buf = new Uint32Array(1)
  do crypto.getRandomValues(buf)
  while (buf[0] >= limit)
  return buf[0] % max
}

function generate(length: number, enabled: SetKey[], excludeAmbiguous: boolean): string {
  const pools = enabled.map(k => excludeAmbiguous ? SETS[k].replace(AMBIGUOUS, '') : SETS[k])
  if (pools.length === 0) return ''
  const all = pools.join('')
  // Guarantee at least one char from each selected set, then fill and shuffle.
  const chars = pools.map(p => p[randomIndex(p.length)])
  while (chars.length < length) chars.push(all[randomIndex(all.length)])
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.slice(0, length).join('')
}

function strength(length: number, poolSize: number): { label: string; color: string; bits: number } {
  const bits = poolSize > 0 ? Math.round(length * Math.log2(poolSize)) : 0
  if (bits < 40) return { label: 'Weak', color: 'bg-red-500', bits }
  if (bits < 60) return { label: 'Fair', color: 'bg-orange-400', bits }
  if (bits < 80) return { label: 'Good', color: 'bg-yellow-400', bits }
  if (bits < 120) return { label: 'Strong', color: 'bg-green-500', bits }
  return { label: 'Very Strong', color: 'bg-emerald-400', bits }
}

export function PasswordGenerator() {
  useSEO({
    title: 'Password Generator',
    description: 'Generate strong, random passwords in your browser — choose length, character sets and copy instantly.',
    keywords: 'password generator, random password, strong password, secure password',
  })

  const [length, setLength] = useState(16)
  const [enabled, setEnabled] = useState<Record<SetKey, boolean>>({ upper: true, lower: true, digits: true, symbols: true })
  const [excludeAmbiguous, setExcludeAmbiguous] = useState(false)
  const [count, setCount] = useState(1)
  const [passwords, setPasswords] = useState<string[]>([])
  const [copied, setCopied] = useState<number | null>(null)

  const { user, login } = useAuth()
  const uid = user && !user.isAnonymous && user.email ? user.uid : null
  const [saved, setSaved] = useState<SavedPassword[]>([])
  const [savedError, setSavedError] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null) // password pending save
  const [website, setWebsite] = useState('')
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [copiedSaved, setCopiedSaved] = useState<string | null>(null)
  const [savedFilter, setSavedFilter] = useState('')

  useEffect(() => {
    if (!uid) { setSaved([]); return }
    setSavedError(null)
    return subscribeToSavedPasswords(uid, setSaved, setSavedError)
  }, [uid])

  const openSave = (pw: string) => {
    setWebsite('')
    setUsername('')
    setSaving(pw)
  }

  const confirmSave = async () => {
    if (!uid || !saving) return
    setBusy(true)
    try {
      await savePassword(uid, saving, website, username)
      setSaving(null)
    } catch (e) {
      setSavedError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const removeSaved = async (entry: SavedPassword) => {
    if (!uid) return
    const label = entry.website || entry.username || 'this password'
    if (!confirm(`Delete saved password for ${label}?`)) return
    try {
      await deleteSavedPassword(uid, entry.id)
    } catch (e) {
      setSavedError((e as Error).message)
    }
  }

  const copySaved = async (entry: SavedPassword) => {
    try {
      await navigator.clipboard.writeText(entry.password)
      setCopiedSaved(entry.id)
      setTimeout(() => setCopiedSaved(c => (c === entry.id ? null : c)), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  const toggleReveal = (id: string) =>
    setRevealed(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const filteredSaved = saved.filter(e => {
    const q = savedFilter.trim().toLowerCase()
    return !q || e.website.toLowerCase().includes(q) || e.username.toLowerCase().includes(q)
  })

  const activeSets = (Object.keys(enabled) as SetKey[]).filter(k => enabled[k])
  const poolSize = activeSets
    .map(k => excludeAmbiguous ? SETS[k].replace(AMBIGUOUS, '') : SETS[k])
    .join('').length
  const s = strength(length, poolSize)

  const regenerate = useCallback(() => {
    setCopied(null)
    setPasswords(Array.from({ length: count }, () => generate(length, activeSets, excludeAmbiguous)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [length, count, excludeAmbiguous, activeSets.join()])

  useEffect(() => { regenerate() }, [regenerate])

  const copy = async (pw: string, i: number) => {
    try {
      await navigator.clipboard.writeText(pw)
      setCopied(i)
      setTimeout(() => setCopied(c => (c === i ? null : c)), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  const toggle = (k: SetKey) => {
    // Keep at least one set enabled.
    if (enabled[k] && activeSets.length === 1) return
    setEnabled(prev => ({ ...prev, [k]: !prev[k] }))
  }

  return (
    <div className="min-h-screen bg-[#121212] text-[#f0f0f0] flex flex-col items-center p-4 pt-8">
      <div className="w-full max-w-[600px]">
        <Link to="/" className="inline-flex items-center gap-1.5 mb-4 px-3 py-1.5 rounded border border-[#333] text-sm text-gray-400 hover:border-[#555] hover:text-gray-200 transition-all">← Home</Link>
        <h1 className="text-center text-[#00bfff] text-2xl font-bold mb-2">Password Generator</h1>
        <p className="text-center text-gray-500 text-sm mb-2">Generated locally with the browser's crypto — nothing leaves your device</p>
        <p className="text-center text-sm mb-6">
          <Link to="/totp" className="text-[#f0a500] hover:underline">⏱️ TOTP Manager →</Link>
        </p>

        <div className="space-y-2">
          {passwords.map((pw, i) => (
            <div key={i} className="flex items-stretch rounded-md border border-[#333] bg-[#1e1e1e] overflow-hidden">
              <span className="flex-1 p-3 font-mono text-base break-all select-all">{pw}</span>
              <button
                onClick={() => copy(pw, i)}
                className="px-4 text-sm font-semibold border-l border-[#333] text-[#00bfff] hover:bg-[#2a2a2a] cursor-pointer shrink-0"
              >
                {copied === i ? 'Copied' : 'Copy'}
              </button>
              <button
                onClick={() => openSave(pw)}
                className="px-4 text-sm font-semibold border-l border-[#333] text-[#f0a500] hover:bg-[#2a2a2a] cursor-pointer shrink-0"
              >
                Save
              </button>
            </div>
          ))}
        </div>

        <div className="mt-3">
          <div className="h-2 rounded bg-[#333] overflow-hidden">
            <div className={`h-full ${s.color} transition-all`} style={{ width: `${Math.min(100, (s.bits / 128) * 100)}%` }} />
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>{s.label}</span>
            <span>~{s.bits} bits of entropy</span>
          </div>
        </div>

        <button
          onClick={regenerate}
          className="w-full mt-4 p-3 bg-gradient-to-r from-[#8a2be2] to-[#00bfff] text-white rounded-md font-bold uppercase tracking-wide cursor-pointer hover:from-[#00bfff] hover:to-[#8a2be2] transition-all"
        >
          Generate
        </button>

        <div className="mt-6 rounded-lg border border-[#333] bg-[#1a1a1a] p-4 space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <label htmlFor="pw-length" className="text-[#888]">Length</label>
              <span className="font-mono">{length}</span>
            </div>
            <input
              id="pw-length"
              type="range"
              min={4}
              max={128}
              value={length}
              onChange={e => setLength(Number(e.target.value))}
              className="w-full accent-[#00bfff]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(Object.keys(SETS) as SetKey[]).map(k => (
              <label key={k} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={enabled[k]} onChange={() => toggle(k)} className="accent-[#00bfff]" />
                {SET_LABELS[k]}
              </label>
            ))}
            <label className="flex items-center gap-2 text-sm cursor-pointer sm:col-span-2">
              <input type="checkbox" checked={excludeAmbiguous} onChange={e => setExcludeAmbiguous(e.target.checked)} className="accent-[#00bfff]" />
              Exclude look-alikes (I l 1 O 0 o | ` ' ")
            </label>
          </div>

          <div className="flex items-center justify-between text-sm">
            <label htmlFor="pw-count" className="text-[#888]">How many</label>
            <select
              id="pw-count"
              value={count}
              onChange={e => setCount(Number(e.target.value))}
              className="bg-[#1e1e1e] border border-[#333] rounded px-2 py-1"
            >
              {[1, 3, 5, 10].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>

        {uid && (
        <div className="mt-8">
          <h2 className="text-lg font-bold text-[#f0a500] mb-3">Saved Passwords</h2>
            <>
              {savedError && (
                <div className="mb-3 p-3 rounded-md bg-red-900/50 border border-red-700 text-red-300 text-sm">{savedError}</div>
              )}
              {saved.length > 3 && (
                <input
                  type="text"
                  value={savedFilter}
                  onChange={e => setSavedFilter(e.target.value)}
                  placeholder="Search website or username..."
                  className="w-full mb-3 p-2 rounded-md border border-[#333] bg-[#1e1e1e] text-sm focus:outline-none focus:border-[#00bfff]"
                />
              )}
              {saved.length === 0 ? (
                <div className="text-center text-gray-500 text-sm py-4">Nothing saved yet — tap Save next to a password.</div>
              ) : (
                <ul className="space-y-2">
                  {filteredSaved.map(entry => (
                    <li key={entry.id} className="rounded-md border border-[#333] bg-[#1e1e1e] p-3">
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="text-gray-200 break-all">{entry.website || <span className="text-gray-500">No website</span>}</span>
                        <span className="text-xs text-gray-500 shrink-0">{new Date(entry.createdAt).toLocaleDateString()}</span>
                      </div>
                      {entry.username && <div className="text-xs text-[#888] break-all mt-0.5">{entry.username}</div>}
                      <div className="flex items-center gap-2 mt-2">
                        <span className="flex-1 font-mono text-sm break-all">
                          {revealed.has(entry.id) ? entry.password : '•'.repeat(Math.min(entry.password.length, 16))}
                        </span>
                        <button onClick={() => toggleReveal(entry.id)} className="text-xs text-gray-400 hover:text-white cursor-pointer">
                          {revealed.has(entry.id) ? 'Hide' : 'Show'}
                        </button>
                        <button onClick={() => copySaved(entry)} className="text-xs text-[#00bfff] font-semibold cursor-pointer">
                          {copiedSaved === entry.id ? 'Copied' : 'Copy'}
                        </button>
                        <button onClick={() => removeSaved(entry)} className="text-xs text-red-400 cursor-pointer">
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
        </div>
        )}
      </div>

      {saving !== null && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50" onClick={() => !busy && setSaving(null)}>
          <div className="w-full max-w-[420px] rounded-lg border border-[#333] bg-[#1a1a1a] p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-[#f0a500] mb-3">Save password</h3>
            <div className="font-mono text-sm break-all p-2 rounded bg-[#121212] border border-[#333] mb-4">{saving}</div>
            {!uid ? (
              <>
                <p className="text-sm text-gray-400 mb-4">Sign in with Google to save it. Only your account will be able to read it.</p>
                <div className="flex gap-2">
                  <button onClick={() => setSaving(null)} className="flex-1 p-2 rounded-md border! border-[#444]! bg-[#262626]! text-gray-200 font-semibold cursor-pointer hover:bg-[#333]!">Cancel</button>
                  <button onClick={login} className="flex-1 p-2 rounded-md bg-[#00bfff]! text-[#0b0b0b] font-bold cursor-pointer hover:bg-[#33ccff]!">Sign in with Google</button>
                </div>
              </>
            ) : (
              <form onSubmit={e => { e.preventDefault(); confirmSave() }} className="space-y-3">
                <input
                  autoFocus
                  type="text"
                  value={website}
                  onChange={e => setWebsite(e.target.value)}
                  maxLength={MAX_FIELD_LENGTH}
                  placeholder="Website (optional)"
                  className="w-full p-2 rounded-md border border-[#333] bg-[#1e1e1e] text-sm focus:outline-none focus:border-[#00bfff]"
                />
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  maxLength={MAX_FIELD_LENGTH}
                  placeholder="Username / email (optional)"
                  autoComplete="off"
                  className="w-full p-2 rounded-md border border-[#333] bg-[#1e1e1e] text-sm focus:outline-none focus:border-[#00bfff]"
                />
                <div className="flex gap-2 pt-1">
                  <button type="button" disabled={busy} onClick={() => setSaving(null)} className="flex-1 p-2 rounded-md border! border-[#444]! bg-[#262626]! text-gray-200 font-semibold cursor-pointer hover:bg-[#333]!">Cancel</button>
                  <button type="submit" disabled={busy} className="flex-1 p-2 rounded-md bg-gradient-to-r from-[#8a2be2] to-[#00bfff] text-white font-bold cursor-pointer disabled:opacity-60">
                    {busy ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
