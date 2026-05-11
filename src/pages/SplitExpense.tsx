import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  createBook, updateBookName, addPersonToBook, removePersonFromBook,
  saveExpense, deleteExpense, addAuditEntry,
  subscribeToBook, subscribeToExpenses, subscribeToAuditLog,
  calculateSettlements,
} from '../utils/splitExpenseFirebase'
import type { SplitBook, Expense, AuditEntry } from '../utils/splitExpenseFirebase'

/* ── Design tokens (matching app dark theme) ────────────────────────────── */
const c = {
  bg: '#242424',
  surface: '#1a1a1a',
  surfaceHover: '#2a2a2a',
  border: '#333',
  borderFocus: '#646cff',
  accent: '#646cff',
  accentHover: '#7c82ff',
  text: 'rgba(255,255,255,0.87)',
  muted: '#888',
  faint: '#555',
  danger: '#ff4757',
  success: '#4caf50',
  warn: '#f59e0b',
} as const

const inp: React.CSSProperties = {
  background: c.surface,
  border: `1px solid ${c.border}`,
  borderRadius: 10,
  color: c.text,
  padding: '10px 14px',
  fontSize: '0.95rem',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  transition: 'border-color 0.2s',
}

const card: React.CSSProperties = {
  background: c.surface,
  border: `1px solid ${c.border}`,
  borderRadius: 12,
  padding: '16px',
}

const fmt = (n: number) => `₹${Math.abs(n).toFixed(2)}`
const ts = (t: number) =>
  new Date(t).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/* ── Focus handler to show accent border ────────────────────────────────── */
function useFocusStyle() {
  const [focused, setFocused] = useState(false)
  return {
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    style: { ...(focused ? { borderColor: c.borderFocus, boxShadow: `0 0 0 2px rgba(100,108,255,0.2)` } : {}) },
  }
}

/* ── Small focusable input ───────────────────────────────────────────────── */
const DarkInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function DarkInput({ style, ...props }, ref) {
  const focus = useFocusStyle()
  return (
    <input
      ref={ref}
      {...props}
      {...focus}
      style={{ ...inp, ...focus.style, ...style }}
    />
  )
})

// Per-person color palette (bg, border, text) — cycles if more persons than entries
const PERSON_COLORS = [
  { bg: 'rgba(100,108,255,0.15)', border: 'rgba(100,108,255,0.4)', text: '#a5adff' },  // indigo
  { bg: 'rgba(52,211,153,0.15)',  border: 'rgba(52,211,153,0.4)',  text: '#6ee7b7' },  // emerald
  { bg: 'rgba(251,146,60,0.15)',  border: 'rgba(251,146,60,0.4)',  text: '#fdba74' },  // orange
  { bg: 'rgba(232,121,249,0.15)', border: 'rgba(232,121,249,0.4)', text: '#f0abfc' },  // fuchsia
  { bg: 'rgba(56,189,248,0.15)',  border: 'rgba(56,189,248,0.4)',  text: '#7dd3fc' },  // sky
  { bg: 'rgba(250,204,21,0.15)',  border: 'rgba(250,204,21,0.4)',  text: '#fde047' },  // yellow
  { bg: 'rgba(248,113,113,0.15)', border: 'rgba(248,113,113,0.4)', text: '#fca5a5' },  // red
  { bg: 'rgba(94,234,212,0.15)',  border: 'rgba(94,234,212,0.4)',  text: '#5eead4' },  // teal
]

const DELETED_COLOR = { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.12)', text: '#666' }

const personColor = (persons: string[], name: string) => {
  const idx = persons.indexOf(name)
  if (idx === -1) return DELETED_COLOR
  return PERSON_COLORS[idx % PERSON_COLORS.length]
}

/* ── Expense Form Modal ──────────────────────────────────────────────────── */
function ExpenseForm({
  persons,
  editing,
  onClose,
  onSave,
}: {
  persons: string[]
  editing: Expense | null
  onClose: () => void
  onSave: (data: Omit<Expense, 'id'>) => Promise<void>
}) {
  const [desc, setDesc] = useState(editing?.description ?? '')
  const [amount, setAmount] = useState(editing ? editing.amount.toString() : '')
  const [paidBy, setPaidBy] = useState(editing?.paidBy ?? '')
  const [selected, setSelected] = useState<Set<string>>(() =>
    editing ? new Set(editing.splits.map(s => s.personName)) : new Set(persons)
  )
  const [splits, setSplits] = useState<Record<string, string>>(() => {
    if (!editing) return {}
    const m: Record<string, string> = {}
    editing.splits.forEach(s => { m[s.personName] = s.amount.toFixed(2) })
    return m
  })
  const [mode, setMode] = useState<'equal' | 'custom'>(() => {
    if (!editing) return 'equal'
    const n = editing.splits.length
    if (n === 0) return 'equal'
    const eq = editing.amount / n
    return editing.splits.every(s => Math.abs(s.amount - eq) < 0.02) ? 'equal' : 'custom'
  })
  const [saving, setSaving] = useState(false)
  const descRef = useRef<HTMLInputElement>(null)

  useEffect(() => { descRef.current?.focus() }, [])

  // Recalculate equal splits when amount / selected / mode changes
  useEffect(() => {
    if (mode !== 'equal') return
    const amt = parseFloat(amount) || 0
    const sel = Array.from(selected)
    if (sel.length === 0) return
    // Give floored share to all; payer absorbs the remainder so total is exact
    const base = Math.floor((amt / sel.length) * 100) / 100
    const remainder = Math.round((amt - base * sel.length) * 100) / 100
    const next: Record<string, string> = {}
    sel.forEach(p => { next[p] = (p === paidBy ? base + remainder : base).toFixed(2) })
    setSplits(next)
  }, [amount, selected, mode, paidBy]) // splits intentionally excluded

  const totalSplit = Array.from(selected).reduce((s, p) => s + (parseFloat(splits[p]) || 0), 0)
  const expAmt = parseFloat(amount) || 0
  const diff = totalSplit - expAmt
  const splitOk = Math.abs(diff) < 0.02

  const togglePerson = (p: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(p) ? n.delete(p) : n.add(p); return n })

  const handleSplitChange = (p: string, v: string) => {
    setMode('custom')
    setSplits(prev => ({ ...prev, [p]: v }))
  }

  const handleSubmit = async () => {
    if (!desc.trim() || !expAmt || !paidBy || selected.size === 0) return
    setSaving(true)
    try {
      await onSave({
        description: desc.trim(),
        amount: expAmt,
        paidBy,
        splits: Array.from(selected).map(p => ({
          personName: p,
          amount: parseFloat(splits[p]) || 0,
        })),
        createdAt: editing?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: c.bg, borderTop: `1px solid ${c.border}`, borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 14px', borderBottom: `1px solid ${c.border}` }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: c.text }}>
            {editing ? 'Edit Expense' : 'Add Expense'}
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: c.muted, fontSize: '1.5rem', lineHeight: 1, cursor: 'pointer', padding: '0 4px' }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Description */}
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', color: c.muted, marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Description
            </label>
            <DarkInput
              ref={descRef}
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="e.g. Dinner, Hotel, Petrol…"
            />
          </div>

          {/* Amount */}
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', color: c.muted, marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Total Amount (₹)
            </label>
            <DarkInput
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              min="0"
              step="0.01"
            />
          </div>

          {/* Paid By */}
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: !paidBy ? c.danger : c.muted }}>
              Paid By {!paidBy && <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— select who paid</span>}
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {persons.map(p => {
                const active = paidBy === p
                const col = personColor(persons, p)
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPaidBy(p)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '7px 14px',
                      borderRadius: 999,
                      border: `1.5px solid ${col.border}`,
                      background: col.bg,
                      color: col.text,
                      fontWeight: 600,
                      fontSize: '0.88rem',
                      cursor: 'pointer',
                      outline: 'none',
                      boxShadow: active ? `0 0 0 2.5px ${col.border}` : 'none',
                      transition: 'box-shadow 0.15s',
                      opacity: active ? 1 : 0.5,
                    }}
                  >
                    {active && <span style={{ fontSize: '0.75rem', lineHeight: 1 }}>✓</span>}
                    {p}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Split Between */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ fontSize: '0.78rem', color: c.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Split Between
              </label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {mode === 'custom' && (
                  <button
                    onClick={() => setMode('equal')}
                    style={{ background: 'none', border: 'none', color: c.accent, fontSize: '0.8rem', cursor: 'pointer', padding: 0 }}
                  >
                    Reset equal
                  </button>
                )}
                <button
                  onClick={() => setSelected(prev => prev.size === persons.length ? new Set() : new Set(persons))}
                  style={{ background: 'none', border: `1px solid ${c.border}`, color: c.muted, fontSize: '0.75rem', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}
                >
                  {selected.size === persons.length ? 'Deselect all' : 'Select all'}
                </button>
              </div>
            </div>

            <div style={{ border: `1px solid ${c.border}`, borderRadius: 10, overflow: 'hidden' }}>
              {persons.map((p, idx) => {
                const col = personColor(persons, p)
                return (
                <div
                  key={p}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                    borderTop: idx !== 0 ? `1px solid ${c.border}` : 'none',
                    background: selected.has(p) ? col.bg : c.surface,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(p)}
                    onChange={() => togglePerson(p)}
                    style={{ width: 16, height: 16, accentColor: col.text, cursor: 'pointer', flexShrink: 0 }}
                  />
                  <span style={{ flex: 1, color: selected.has(p) ? col.text : c.faint, fontSize: '0.95rem', fontWeight: selected.has(p) ? 600 : 400 }}>{p}</span>
                  <input
                    type="number"
                    value={selected.has(p) ? (splits[p] ?? '') : ''}
                    onChange={e => handleSplitChange(p, e.target.value)}
                    disabled={!selected.has(p)}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    style={{
                      ...inp,
                      width: 90,
                      textAlign: 'right',
                      padding: '6px 10px',
                      fontSize: '0.88rem',
                      opacity: selected.has(p) ? 1 : 0.35,
                      cursor: selected.has(p) ? 'text' : 'not-allowed',
                    }}
                  />
                </div>
              )})}
            </div>

            {selected.size > 0 && expAmt > 0 && (
              <div style={{ marginTop: 6, textAlign: 'right', fontSize: '0.8rem', fontWeight: 600, color: splitOk ? c.success : c.danger }}>
                Split total: ₹{totalSplit.toFixed(2)} / ₹{expAmt.toFixed(2)}
                {!splitOk && ` (${diff > 0 ? '+' : ''}${diff.toFixed(2)} off)`}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px 20px', borderTop: `1px solid ${c.border}`, display: 'flex', gap: 12 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, background: c.surface, border: `1px solid ${c.border}`, color: c.text, borderRadius: 10, padding: '12px', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !desc.trim() || !expAmt || !paidBy || selected.size === 0}
            style={{
              flex: 1, background: c.accent, border: 'none', color: '#fff', borderRadius: 10,
              padding: '12px', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer',
              opacity: (saving || !desc.trim() || !expAmt || !paidBy || selected.size === 0) ? 0.45 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Expense'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Recent books localStorage helpers ──────────────────────────────────── */
interface RecentBook { id: string; name: string; lastVisited: number }
const LS_KEY = 'splitRecentBooks'

function getRecentBooks(): RecentBook[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] }
}

function saveRecentBook(id: string, name: string) {
  const books = getRecentBooks().filter(b => b.id !== id)
  books.unshift({ id, name, lastVisited: Date.now() })
  localStorage.setItem(LS_KEY, JSON.stringify(books.slice(0, 20)))
}

function removeRecentBook(id: string) {
  localStorage.setItem(LS_KEY, JSON.stringify(getRecentBooks().filter(b => b.id !== id)))
}

/* ── Main Component ──────────────────────────────────────────────────────── */
export function SplitExpense() {
  const { bookId } = useParams<{ bookId?: string }>()
  const navigate = useNavigate()

  // Landing
  const [newBookName, setNewBookName] = useState('')
  const [openId, setOpenId] = useState('')
  const [creating, setCreating] = useState(false)
  const [recentBooks, setRecentBooks] = useState<RecentBook[]>(() => getRecentBooks())

  // Book
  const [book, setBook] = useState<SplitBook | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // UI
  const [tab, setTab] = useState<'expenses' | 'summary' | 'audit'>('expenses')
  const [newPerson, setNewPerson] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [copied, setCopied] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [showPersonInput, setShowPersonInput] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  useEffect(() => {
    if (!bookId) { setLoading(false); return }
    setLoading(true); setNotFound(false)
    const u1 = subscribeToBook(bookId, b => {
      if (!b) { setNotFound(true); setLoading(false); return }
      setBook(b); setNameInput(b.name); setLoading(false)
      saveRecentBook(bookId, b.name)
      setRecentBooks(getRecentBooks())
    })
    const u2 = subscribeToExpenses(bookId, setExpenses)
    const u3 = subscribeToAuditLog(bookId, setAuditLog)
    return () => { u1(); u2(); u3() }
  }, [bookId])

  /* Landing handlers */
  const handleCreate = async () => {
    setCreating(true)
    try {
      const id = await createBook(newBookName)
      saveRecentBook(id, newBookName.trim() || 'My Expense Book')
      navigate(`/split/${id}`)
    } finally { setCreating(false) }
  }

  const handleOpen = () => { const id = openId.trim(); if (id) navigate(`/split/${id}`) }

  /* Book handlers */
  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const handleSaveName = async () => {
    if (!bookId || !nameInput.trim()) return
    await updateBookName(bookId, nameInput.trim()); setEditingName(false)
  }

  const handleAddPerson = async () => {
    if (!bookId || !book || !newPerson.trim()) return
    const name = newPerson.trim()
    if (book.persons.map(p => p.toLowerCase()).includes(name.toLowerCase())) return
    await addPersonToBook(bookId, book.persons, name)
    await addAuditEntry(bookId, 'add_person', `Added person: ${name}`)
    setNewPerson('')
  }

  const handleRemovePerson = async (name: string) => {
    if (!bookId || !book) return
    if (!confirm(`Remove "${name}" from this book?\n\nExisting expenses won't be deleted but this person won't appear in new splits.`)) return
    await removePersonFromBook(bookId, book.persons, name)
    await addAuditEntry(bookId, 'remove_person', `Removed person: ${name}`)
  }

  const handleSaveExpense = async (data: Omit<Expense, 'id'>) => {
    if (!bookId) return
    if (editingExpense) {
      await saveExpense(bookId, data, editingExpense.id)
      await addAuditEntry(bookId, 'edit_expense', `Edited: "${data.description}" ₹${data.amount} paid by ${data.paidBy}`)
    } else {
      await saveExpense(bookId, data)
      await addAuditEntry(bookId, 'add_expense', `Added: "${data.description}" ₹${data.amount} paid by ${data.paidBy}`)
    }
  }

  const handleDeleteExpense = async (exp: Expense) => {
    if (!bookId || !confirm(`Delete "${exp.description}"?`)) return
    await deleteExpense(bookId, exp.id)
    await addAuditEntry(bookId, 'delete_expense', `Deleted: "${exp.description}" ₹${exp.amount}`)
  }

  /* ── LANDING ─────────────────────────────────────────────────────────── */
  if (!bookId) {
    return (
      <div style={{ minHeight: '100vh', background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ ...card, width: '100%', maxWidth: 380, padding: '36px 28px' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: '3rem', marginBottom: 8 }}>💸</div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: c.text }}>Split Expense</h1>
            <p style={{ margin: '6px 0 0', color: c.muted, fontSize: '0.85rem' }}>
              Shared expense book · shareable via link
            </p>
          </div>

          <p style={{ margin: '0 0 8px', fontSize: '0.78rem', color: c.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            New Book
          </p>
          <DarkInput
            value={newBookName}
            onChange={e => setNewBookName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            placeholder="Book name (e.g. Goa Trip)"
            style={{ marginBottom: 10 }}
          />
          <button
            onClick={handleCreate}
            disabled={creating}
            style={{ width: '100%', background: c.accent, border: 'none', color: '#fff', borderRadius: 10, padding: '12px', fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer', opacity: creating ? 0.6 : 1, marginBottom: 24 }}
          >
            {creating ? 'Creating…' : 'Create Book'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <div style={{ flex: 1, height: 1, background: c.border }} />
            <span style={{ color: c.faint, fontSize: '0.75rem' }}>OR OPEN EXISTING</span>
            <div style={{ flex: 1, height: 1, background: c.border }} />
          </div>

          <DarkInput
            value={openId}
            onChange={e => setOpenId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleOpen()}
            placeholder="Enter Book ID…"
            style={{ marginBottom: 10 }}
          />
          <button
            onClick={handleOpen}
            disabled={!openId.trim()}
            style={{ width: '100%', background: 'none', border: `1px solid ${c.accent}`, color: c.accent, borderRadius: 10, padding: '12px', fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer', opacity: openId.trim() ? 1 : 0.4 }}
          >
            Open Book
          </button>

          {/* Recent books */}
          {recentBooks.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '24px 0 12px' }}>
                <div style={{ flex: 1, height: 1, background: c.border }} />
                <span style={{ color: c.faint, fontSize: '0.75rem' }}>THIS DEVICE</span>
                <div style={{ flex: 1, height: 1, background: c.border }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recentBooks.map(b => (
                  <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10, padding: '10px 14px', cursor: 'pointer' }}
                    onClick={() => navigate(`/split/${b.id}`)}
                  >
                    <span style={{ fontSize: '1.1rem' }}>📒</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: 600, color: c.text, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</p>
                      <p style={{ margin: 0, fontSize: '0.72rem', color: c.faint, fontFamily: 'monospace' }}>{b.id}</p>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); removeRecentBook(b.id); setRecentBooks(getRecentBooks()) }}
                      style={{ background: 'none', border: 'none', color: c.faint, fontSize: '1rem', cursor: 'pointer', padding: '2px 4px', flexShrink: 0 }}
                      title="Remove from list"
                    >✕</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  /* ── LOADING / NOT FOUND ─────────────────────────────────────────────── */
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: c.muted, fontSize: '0.9rem' }}>Loading…</span>
      </div>
    )
  }

  if (notFound || !book) {
    return (
      <div style={{ minHeight: '100vh', background: c.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <div style={{ fontSize: '3rem' }}>🔍</div>
        <p style={{ color: c.text, fontWeight: 600, margin: 0 }}>Book not found</p>
        <p style={{ color: c.muted, fontSize: '0.85rem', margin: 0 }}>ID: {bookId}</p>
        <button onClick={() => navigate('/split')} style={{ background: 'none', border: 'none', color: c.accent, cursor: 'pointer', textDecoration: 'underline', fontSize: '0.9rem' }}>
          Create a new book
        </button>
      </div>
    )
  }

  /* ── BOOK SCREEN ─────────────────────────────────────────────────────── */
  const { paid, owed, balance, settlements } = calculateSettlements(book.persons, expenses)
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0)

  return (
    <div style={{ minHeight: '100vh', background: c.bg, color: c.text }}>
      {/* Header */}
      <div style={{ background: c.surface, borderBottom: `1px solid ${c.border}`, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 30 }}>
        <button
          onClick={() => navigate('/')}
          style={{ background: 'none', border: 'none', color: c.muted, cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 4 }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>

        {editingName ? (
          <>
            <input
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') { setEditingName(false); setNameInput(book.name) } }}
              autoFocus
              style={{ ...inp, flex: 1, borderColor: c.borderFocus, boxShadow: `0 0 0 2px rgba(100,108,255,0.2)`, fontWeight: 700, fontSize: '1.05rem', padding: '6px 10px' }}
            />
            <button
              onClick={handleSaveName}
              style={{ background: 'none', border: 'none', color: c.success, fontSize: '1.3rem', cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
              title="Save"
            >✓</button>
            <button
              onClick={() => { setEditingName(false); setNameInput(book.name) }}
              style={{ background: 'none', border: 'none', color: c.danger, fontSize: '1.3rem', cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
              title="Cancel"
            >✕</button>
          </>
        ) : (
          <h1
            onClick={() => setEditingName(true)}
            style={{ flex: 1, margin: 0, fontSize: '1.05rem', fontWeight: 700, color: c.text, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            title="Click to rename"
          >
            {book.name} <span style={{ color: c.faint, fontSize: '0.75rem' }}>✏️</span>
          </h1>
        )}

        <button
          onClick={handleShare}
          style={{
            background: copied ? 'rgba(76,175,80,0.15)' : 'rgba(100,108,255,0.12)',
            border: `1px solid ${copied ? c.success : c.accent}`,
            color: copied ? c.success : c.accent,
            borderRadius: 8, padding: '6px 12px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          {copied ? '✓ Copied!' : '🔗 Share'}
        </button>
      </div>

      {/* Book ID badge */}
      <div style={{ background: 'rgba(100,108,255,0.07)', borderBottom: `1px solid rgba(100,108,255,0.15)`, padding: '6px 16px', textAlign: 'center' }}>
        <span style={{ fontSize: '0.75rem', color: c.accent, fontFamily: 'monospace' }}>
          Book ID: <strong>{bookId}</strong>
        </span>
        <span style={{ fontSize: '0.72rem', color: c.faint, marginLeft: 12 }}>• Anyone with this link can view &amp; edit</span>
      </div>

      {/* Offline banner */}
      {!isOnline && (
        <div style={{ background: 'rgba(245,158,11,0.12)', borderBottom: `1px solid rgba(245,158,11,0.3)`, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '1rem' }}>📵</span>
          <div>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: c.warn }}>You're offline</span>
            <span style={{ fontSize: '0.78rem', color: '#a37a30', marginLeft: 8 }}>Changes are saved locally and will sync when you reconnect</span>
          </div>
        </div>
      )}

      {/* Persons */}
      <div style={{ background: c.surface, borderBottom: `1px solid ${c.border}`, padding: '10px 16px' }}>
        {/* Person chips row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {book.persons.length === 0 && !showPersonInput && (
            <span style={{ fontSize: '0.82rem', color: c.faint }}>No persons yet — add people below</span>
          )}
          {book.persons.map(p => {
            const col = personColor(book.persons, p)
            return (
              <span key={p} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: col.bg, border: `1px solid ${col.border}`, color: col.text, borderRadius: 999, padding: '4px 12px', fontSize: '0.85rem', fontWeight: 500 }}>
                {p}
                <button
                  onClick={() => handleRemovePerson(p)}
                  style={{ background: 'none', border: 'none', color: col.text, cursor: 'pointer', padding: '0 0 0 2px', fontSize: '1.1rem', lineHeight: 1, opacity: 0.7 }}
                >
                  ×
                </button>
              </span>
            )
          })}

          {/* Collapse button (only when expenses exist) */}
          {expenses.length > 0 && (
            <button
              onClick={() => { setShowPersonInput(v => !v); setNewPerson('') }}
              style={{ background: 'none', border: `1px dashed ${c.border}`, color: c.muted, borderRadius: 999, padding: '4px 12px', fontSize: '0.82rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              {showPersonInput ? '✕ Cancel' : '＋ Add person'}
            </button>
          )}
        </div>

        {/* Input row — always shown when no expenses, toggled otherwise */}
        {(expenses.length === 0 || showPersonInput) && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <DarkInput
              value={newPerson}
              onChange={e => setNewPerson(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddPerson()}
              placeholder="Add person…"
              style={{ flex: 1, padding: '8px 12px' }}
            />
            <button
              onClick={handleAddPerson}
              disabled={!newPerson.trim()}
              style={{ background: c.accent, border: 'none', color: '#fff', borderRadius: 10, padding: '8px 16px', fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer', opacity: newPerson.trim() ? 1 : 0.4, flexShrink: 0 }}
            >
              Add
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ background: c.surface, borderBottom: `1px solid ${c.border}`, display: 'flex', position: 'sticky', top: 57, zIndex: 20 }}>
        {(['expenses', 'summary', 'audit'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1, padding: '12px 0', border: 'none', borderBottom: `2px solid ${tab === t ? c.accent : 'transparent'}`,
              background: 'none', color: tab === t ? c.accent : c.muted, fontSize: '0.88rem', fontWeight: 600,
              cursor: 'pointer', transition: 'color 0.15s',
              textTransform: 'capitalize',
            }}
          >
            {t === 'expenses' ? '💳 Expenses' : t === 'summary' ? '📊 Summary' : '📋 Log'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: '16px', maxWidth: 640, margin: '0 auto', paddingBottom: 100 }}>

        {/* ── EXPENSES TAB ── */}
        {tab === 'expenses' && (
          expenses.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: c.muted }}>
              <div style={{ fontSize: '3rem', marginBottom: 10 }}>🧾</div>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>No expenses yet</p>
              <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: c.faint }}>Tap + to add the first one</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {expenses.map(exp => {
                const payerCol = personColor(book.persons, exp.paidBy)
                return (
                  <div key={exp.id} style={card}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontWeight: 700, color: c.text, fontSize: '0.98rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {exp.description}
                        </p>
                        <p style={{ margin: '2px 0 8px', fontSize: '0.75rem', color: c.faint }}>{ts(exp.createdAt)}</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          <span style={{ background: payerCol.bg, border: `1px solid ${payerCol.border}`, color: payerCol.text, borderRadius: 999, padding: '3px 10px', fontSize: '0.78rem', fontWeight: 600 }}>
                            💳 {exp.paidBy}
                          </span>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {exp.splits.map(s => {
                              const sc = personColor(book.persons, s.personName)
                              return (
                                <span key={s.personName} style={{ background: sc.bg, border: `1px solid ${sc.border}`, color: sc.text, borderRadius: 999, padding: '3px 8px', fontSize: '0.75rem' }}>
                                  {s.personName} ₹{s.amount.toFixed(0)}
                                </span>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                        <span style={{ fontSize: '1.2rem', fontWeight: 800, color: c.text }}>{fmt(exp.amount)}</span>
                        <div style={{ display: 'flex', gap: 10 }}>
                          <button
                            onClick={() => { setEditingExpense(exp); setShowForm(true) }}
                            style={{ background: 'none', border: 'none', color: c.accent, fontSize: '0.8rem', cursor: 'pointer', padding: 0, fontWeight: 600 }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteExpense(exp)}
                            style={{ background: 'none', border: 'none', color: c.danger, fontSize: '0.8rem', cursor: 'pointer', padding: 0, fontWeight: 600 }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}

        {/* ── SUMMARY TAB ── */}
        {tab === 'summary' && (
          book.persons.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: c.muted, fontSize: '0.9rem' }}>
              Add persons to see the summary
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Total */}
              <div style={card}>
                <p style={{ margin: '0 0 4px', fontSize: '0.75rem', color: c.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Expenses</p>
                <p style={{ margin: '0 0 4px', fontSize: '2rem', fontWeight: 800, color: c.text }}>{fmt(totalExpenses)}</p>
                <p style={{ margin: 0, fontSize: '0.78rem', color: c.faint }}>{expenses.length} expense{expenses.length !== 1 ? 's' : ''}</p>
              </div>

              {/* Per-person table */}
              <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 0, padding: '8px 14px', background: 'rgba(255,255,255,0.03)', borderBottom: `1px solid ${c.border}` }}>
                  {['Person', 'Paid', 'Owed', 'Net'].map((h, i) => (
                    <span key={h} style={{ fontSize: '0.72rem', color: c.faint, fontWeight: 700, textTransform: 'uppercase', textAlign: i > 0 ? 'right' : 'left', paddingLeft: i > 0 ? 16 : 0 }}>
                      {h}
                    </span>
                  ))}
                </div>
                {book.persons.map((p, i) => {
                  const net = balance[p] ?? 0
                  const col = personColor(book.persons, p)
                  return (
                    <div key={p} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 0, padding: '11px 14px', borderTop: i !== 0 ? `1px solid rgba(255,255,255,0.04)` : 'none', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, color: col.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p}</span>
                      <span style={{ textAlign: 'right', color: c.muted, fontSize: '0.9rem', paddingLeft: 16 }}>{fmt(paid[p] ?? 0)}</span>
                      <span style={{ textAlign: 'right', color: c.muted, fontSize: '0.9rem', paddingLeft: 16 }}>{fmt(owed[p] ?? 0)}</span>
                      <span style={{ textAlign: 'right', fontWeight: 700, fontSize: '0.9rem', paddingLeft: 16, color: net > 0.005 ? c.success : net < -0.005 ? c.danger : c.faint }}>
                        {net > 0.005 ? '+' : ''}{net.toFixed(2)}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Settlements */}
              <div style={card}>
                <p style={{ margin: '0 0 12px', fontSize: '0.75rem', color: c.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Who Pays Whom</p>
                {settlements.length === 0 ? (
                  <p style={{ margin: 0, color: c.success, fontWeight: 600, fontSize: '0.9rem' }}>✅ All settled up!</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {settlements.map((s, i) => {
                      const fc = personColor(book.persons, s.from)
                      const tc = personColor(book.persons, s.to)
                      return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(245,158,11,0.06)', border: `1px solid rgba(245,158,11,0.18)`, borderRadius: 10, padding: '10px 14px' }}>
                        <span style={{ fontWeight: 700, color: fc.text, background: fc.bg, border: `1px solid ${fc.border}`, borderRadius: 999, padding: '2px 10px', fontSize: '0.88rem' }}>{s.from}</span>
                        <span style={{ color: c.faint, fontSize: '0.8rem', flex: 1, textAlign: 'center' }}>pays →</span>
                        <span style={{ fontWeight: 700, color: tc.text, background: tc.bg, border: `1px solid ${tc.border}`, borderRadius: 999, padding: '2px 10px', fontSize: '0.88rem' }}>{s.to}</span>
                        <span style={{ marginLeft: 8, fontWeight: 800, color: c.warn, fontSize: '1.05rem' }}>{fmt(s.amount)}</span>
                      </div>
                    )})}
                  </div>
                )}
              </div>
            </div>
          )
        )}

        {/* ── AUDIT LOG TAB ── */}
        {tab === 'audit' && (
          auditLog.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: c.muted }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>📋</div>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>No activity yet</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ margin: '0 0 4px', fontSize: '0.75rem', color: c.faint }}>
                Read-only · all changes are permanently recorded
              </p>
              {auditLog.map(entry => {
                const icon = entry.action === 'add_expense' ? '➕' : entry.action === 'edit_expense' ? '✏️' : entry.action === 'delete_expense' ? '🗑️' : entry.action === 'add_person' ? '👤' : entry.action === 'remove_person' ? '❌' : '📝'
                return (
                  <div key={entry.id} style={{ ...card, display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 14px' }}>
                    <span style={{ fontSize: '1.1rem', marginTop: 1 }}>{icon}</span>
                    <div>
                      <p style={{ margin: 0, fontSize: '0.88rem', color: c.text }}>{entry.description}</p>
                      <p style={{ margin: '3px 0 0', fontSize: '0.75rem', color: c.faint }}>{ts(entry.timestamp)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}
      </div>

      {/* FAB */}
      {tab === 'expenses' && book.persons.length > 0 && (
        <button
          onClick={() => { setEditingExpense(null); setShowForm(true) }}
          style={{ position: 'fixed', bottom: 24, right: 20, width: 56, height: 56, padding: 0, borderRadius: '50%', background: c.accent, border: 'none', color: '#fff', fontSize: '1.8rem', lineHeight: 1, cursor: 'pointer', boxShadow: '0 4px 20px rgba(100,108,255,0.45)', zIndex: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          aria-label="Add expense"
        >
          +
        </button>
      )}

      {/* Modal */}
      {showForm && (
        <ExpenseForm
          persons={book.persons}
          editing={editingExpense}
          onClose={() => setShowForm(false)}
          onSave={handleSaveExpense}
        />
      )}
    </div>
  )
}

export default SplitExpense
