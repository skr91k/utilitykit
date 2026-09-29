import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSEO } from '../utils/useSEO'
import { useAuth } from '../utils/useAuth'
import { subscribeToTodos, addTodo, updateTodo, deleteTodo, MAX_TITLE_LENGTH } from '../utils/todoFirebase'
import type { Todo } from '../utils/todoFirebase'

type View = 'list' | 'calendar'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Local-time 'YYYY-MM-DD' — toISOString() would shift the day for anyone east/west of UTC
const toKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const fromKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const prettyDate = (key: string) =>
  fromKey(key).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

const inputCls = 'p-2 rounded-md border border-[#333] bg-[#1e1e1e] text-sm focus:outline-none focus:border-[#00bfff]'
const tabCls = (active: boolean) =>
  `flex-1 p-2 rounded-md text-sm font-semibold cursor-pointer border! ${active ? 'bg-[#00bfff]! text-[#0b0b0b] border-[#00bfff]!' : 'bg-[#1e1e1e]! text-gray-300 border-[#333]! hover:border-[#555]!'}`

export function TodoApp() {
  useSEO({
    title: 'Todo',
    description: 'Simple todo list with a calendar view — sign in with Google or as a guest, synced with Firebase.',
    keywords: 'todo, todo list, tasks, calendar, planner, checklist',
  })

  const { user, loading, login, loginAnonymous, logout } = useAuth()
  const uid = user?.uid ?? null
  const today = toKey(new Date())

  const [todos, setTodos] = useState<Todo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>('list')
  const [showDone, setShowDone] = useState(false)

  const [title, setTitle] = useState('')
  const [date, setDate] = useState(today)

  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [selectedDay, setSelectedDay] = useState(today)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDate, setEditDate] = useState('')

  useEffect(() => {
    if (!uid) { setTodos([]); return }
    setError(null)
    return subscribeToTodos(uid, setTodos, setError)
  }, [uid])

  const run = (p: Promise<unknown>) => p.catch(e => setError((e as Error).message))

  const submitAdd = (e: React.FormEvent) => {
    e.preventDefault()
    if (!uid || !title.trim()) return
    // In calendar view new todos land on the day you're looking at
    run(addTodo(uid, title, view === 'calendar' ? selectedDay : date))
    setTitle('')
  }

  const startEdit = (t: Todo) => {
    setEditingId(t.id)
    setEditTitle(t.title)
    setEditDate(t.date)
  }

  const saveEdit = () => {
    if (!uid || !editingId || !editTitle.trim()) return
    run(updateTodo(uid, editingId, { title: editTitle, date: editDate }))
    setEditingId(null)
  }

  const remove = (t: Todo) => {
    if (!uid || !confirm(`Delete "${t.title}"?`)) return
    run(deleteTodo(uid, t.id))
  }

  const byDate = useMemo(() => {
    const map: Record<string, Todo[]> = {}
    for (const t of todos) if (t.date) (map[t.date] ??= []).push(t)
    return map
  }, [todos])

  const pending = todos.filter(t => !t.done)
  const done = todos.filter(t => t.done)
  const sortByDate = (a: Todo, b: Todo) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt
  const sections: { label: string; items: Todo[]; tone?: string }[] = [
    { label: 'Overdue', items: pending.filter(t => t.date && t.date < today).sort(sortByDate), tone: 'text-red-400' },
    { label: 'Today', items: pending.filter(t => t.date === today), tone: 'text-[#00bfff]' },
    { label: 'Upcoming', items: pending.filter(t => t.date > today).sort(sortByDate) },
    { label: 'No date', items: pending.filter(t => !t.date) },
  ]

  const calendarCells = useMemo(() => {
    const first = month.getDay()
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
    const cells: (string | null)[] = Array(first).fill(null)
    for (let d = 1; d <= days; d++) cells.push(toKey(new Date(month.getFullYear(), month.getMonth(), d)))
    return cells
  }, [month])

  const shiftMonth = (delta: number) => setMonth(m => new Date(m.getFullYear(), m.getMonth() + delta, 1))
  const goToday = () => {
    const d = new Date()
    setMonth(new Date(d.getFullYear(), d.getMonth(), 1))
    setSelectedDay(today)
  }

  const renderTodo = (t: Todo, showDate: boolean) => (
    <li key={t.id} className="rounded-md border border-[#333] bg-[#1e1e1e] p-2.5">
      {editingId === t.id ? (
        <form onSubmit={e => { e.preventDefault(); saveEdit() }} className="flex flex-col sm:flex-row gap-2">
          <input autoFocus value={editTitle} onChange={e => setEditTitle(e.target.value)} maxLength={MAX_TITLE_LENGTH} className={`${inputCls} flex-1 min-w-0`} />
          <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className={inputCls} />
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditingId(null)} className="flex-1 px-3 py-2 rounded-md bg-[#262626]! text-gray-300 text-sm cursor-pointer">Cancel</button>
            <button type="submit" disabled={!editTitle.trim()} className="flex-1 px-3 py-2 rounded-md bg-[#00bfff]! text-[#0b0b0b] text-sm font-bold cursor-pointer disabled:opacity-50">Save</button>
          </div>
        </form>
      ) : (
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={t.done}
            onChange={() => uid && run(updateTodo(uid, t.id, { done: !t.done }))}
            className="mt-1 w-4 h-4 accent-[#00bfff] cursor-pointer shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className={`text-sm break-words ${t.done ? 'line-through text-gray-500' : 'text-gray-200'}`}>{t.title}</div>
            {showDate && t.date && (
              <div className={`text-xs mt-0.5 ${!t.done && t.date < today ? 'text-red-400' : 'text-[#888]'}`}>{prettyDate(t.date)}</div>
            )}
          </div>
          <button onClick={() => startEdit(t)} className="text-xs text-gray-400 hover:text-white cursor-pointer shrink-0">Edit</button>
          <button onClick={() => remove(t)} className="text-xs text-red-400 hover:text-red-300 cursor-pointer shrink-0">Delete</button>
        </div>
      )}
    </li>
  )

  const addForm = (
    <form onSubmit={submitAdd} className="flex flex-col sm:flex-row gap-2 mb-4">
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        maxLength={MAX_TITLE_LENGTH}
        placeholder={view === 'calendar' ? `Add a todo for ${prettyDate(selectedDay)}...` : 'What needs doing?'}
        className={`${inputCls} flex-1 min-w-0`}
      />
      {view === 'list' && <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />}
      <button
        type="submit"
        disabled={!title.trim()}
        className="px-4 py-2 rounded-md bg-gradient-to-r from-[#8a2be2] to-[#00bfff] text-white font-bold cursor-pointer disabled:opacity-50"
      >
        Add
      </button>
    </form>
  )

  const dayTodos = byDate[selectedDay] ?? []

  return (
    <div className="min-h-screen bg-[#121212] text-[#f0f0f0] flex flex-col items-center p-4 pt-8">
      <div className="w-full max-w-[640px]">
        <Link to="/" className="inline-flex items-center gap-1.5 mb-4 px-3 py-1.5 rounded border border-[#333] text-sm text-gray-400 hover:border-[#555] hover:text-gray-200 transition-all">← Home</Link>
        <h1 className="text-center text-[#00bfff] text-2xl font-bold mb-2">Todo</h1>
        <p className="text-center text-gray-500 text-sm mb-6">Your todos, as a list or on a calendar</p>

        {loading ? (
          <div className="text-center text-gray-500 py-8">Loading...</div>
        ) : !uid ? (
          <div className="rounded-lg border border-[#333] bg-[#1a1a1a] p-6 text-center">
            <p className="text-sm text-gray-400 mb-4">
              Sign in with Google to keep your todos on every device, or continue as a guest to try it out.
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
                {user?.isAnonymous ? 'Guest — todos are saved only in this browser' : `Signed in as ${user?.email}`}
              </span>
              <button onClick={logout} className="text-gray-400 hover:text-white cursor-pointer shrink-0">Sign out</button>
            </div>

            <div className="flex gap-2 mb-4">
              <button onClick={() => setView('list')} className={tabCls(view === 'list')}>List</button>
              <button onClick={() => setView('calendar')} className={tabCls(view === 'calendar')}>Calendar</button>
            </div>

            {error && (
              <div className="mb-3 p-3 rounded-md bg-red-900/50 border border-red-700 text-red-300 text-sm">{error}</div>
            )}

            {view === 'list' ? (
              <>
                {addForm}
                {pending.length === 0 && (
                  <div className="text-center text-gray-500 text-sm py-6">Nothing to do — add your first todo above.</div>
                )}
                {sections.filter(s => s.items.length).map(s => (
                  <section key={s.label} className="mb-4">
                    <h2 className={`text-xs font-bold uppercase tracking-wide mb-2 ${s.tone ?? 'text-gray-400'}`}>
                      {s.label} <span className="text-gray-600">· {s.items.length}</span>
                    </h2>
                    <ul className="space-y-2">{s.items.map(t => renderTodo(t, s.label !== 'Today'))}</ul>
                  </section>
                ))}
                {done.length > 0 && (
                  <section>
                    <button onClick={() => setShowDone(v => !v)} className="text-xs font-bold uppercase tracking-wide text-gray-500 hover:text-gray-300 cursor-pointer mb-2">
                      {showDone ? '▾' : '▸'} Done · {done.length}
                    </button>
                    {showDone && <ul className="space-y-2">{done.map(t => renderTodo(t, true))}</ul>}
                  </section>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center justify-between mb-2">
                  <button onClick={() => shiftMonth(-1)} className="px-3 py-1 rounded-md bg-[#1e1e1e]! border! border-[#333]! cursor-pointer hover:border-[#555]!">‹</button>
                  <button onClick={goToday} className="font-semibold text-gray-200 cursor-pointer bg-transparent! border-0!" title="Go to today">
                    {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                  </button>
                  <button onClick={() => shiftMonth(1)} className="px-3 py-1 rounded-md bg-[#1e1e1e]! border! border-[#333]! cursor-pointer hover:border-[#555]!">›</button>
                </div>

                <div className="grid grid-cols-7 gap-1 mb-4">
                  {WEEKDAYS.map(d => <div key={d} className="text-center text-[11px] text-gray-500 py-1">{d}</div>)}
                  {calendarCells.map((key, i) => {
                    if (!key) return <div key={`blank-${i}`} />
                    const items = byDate[key] ?? []
                    const open = items.filter(t => !t.done).length
                    const selected = key === selectedDay
                    return (
                      <button
                        key={key}
                        onClick={() => setSelectedDay(key)}
                        className={`min-h-[64px] sm:min-h-[84px] p-1 rounded-md border! text-left flex flex-col cursor-pointer overflow-hidden
                          ${selected ? 'border-[#00bfff]! bg-[#00bfff]/10!' : 'border-[#2a2a2a]! bg-[#1a1a1a]! hover:border-[#444]!'}`}
                      >
                        <span className={`text-xs font-semibold ${key === today ? 'text-[#00bfff]' : 'text-gray-400'}`}>
                          {fromKey(key).getDate()}
                        </span>
                        {/* Titles on wide screens, a count badge on phones where cells are too narrow */}
                        <div className="hidden sm:block mt-0.5 space-y-0.5 w-full">
                          {items.slice(0, 2).map(t => (
                            <div key={t.id} className={`text-[10px] leading-tight truncate ${t.done ? 'line-through text-gray-600' : key < today ? 'text-red-300' : 'text-gray-300'}`}>
                              {t.title}
                            </div>
                          ))}
                          {items.length > 2 && <div className="text-[10px] text-gray-500">+{items.length - 2} more</div>}
                        </div>
                        {items.length > 0 && (
                          <span className={`sm:hidden mt-auto self-end text-[10px] font-bold px-1.5 rounded-full ${open ? (key < today ? 'bg-red-500/80 text-white' : 'bg-[#00bfff] text-[#0b0b0b]') : 'bg-[#333] text-gray-400'}`}>
                            {open || '✓'}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>

                <h2 className="text-sm font-semibold text-gray-300 mb-2">{prettyDate(selectedDay)}</h2>
                {addForm}
                {dayTodos.length === 0 ? (
                  <div className="text-center text-gray-500 text-sm py-4">No todos on this day.</div>
                ) : (
                  <ul className="space-y-2">{dayTodos.map(t => renderTodo(t, false))}</ul>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
