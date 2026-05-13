import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import * as CF from '../utils/cricketFirebase'

// ── Design tokens ─────────────────────────────────────────────────────────────
const c = {
  bg: '#1a1a1a',
  surface: '#242424',
  hover: '#2e2e2e',
  border: '#333',
  text: 'rgba(255,255,255,0.87)',
  muted: '#888',
  faint: '#444',
  green: '#4caf50',
  greenDim: 'rgba(76,175,80,0.18)',
  red: '#ff4757',
  redDim: 'rgba(255,71,87,0.18)',
  blue: '#646cff',
  blueDim: 'rgba(100,108,255,0.18)',
  purple: '#a855f7',
  purpleDim: 'rgba(168,85,247,0.18)',
  yellow: '#f59e0b',
  yellowDim: 'rgba(245,158,11,0.18)',
  orange: '#f97316',
  orangeDim: 'rgba(249,115,22,0.18)',
  gray7: '#777',
}

const card: React.CSSProperties = {
  background: c.surface, border: `1px solid ${c.border}`,
  borderRadius: 12, padding: 16,
}

const btn = (bg: string, fg = c.text): React.CSSProperties => ({
  background: bg, color: fg, border: 'none', borderRadius: 10, padding: '10px 16px',
  fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer',
})

const inp: React.CSSProperties = {
  background: '#1e1e1e', border: `1px solid ${c.border}`, borderRadius: 10,
  color: c.text, padding: '10px 14px', fontSize: '0.9rem', outline: 'none', width: '100%',
  boxSizing: 'border-box',
}

const tag = (bg: string, fg: string): React.CSSProperties => ({
  background: bg, color: fg, borderRadius: 20, padding: '2px 10px', fontSize: '0.72rem', fontWeight: 600,
})

// ── Recent series localStorage ────────────────────────────────────────────────
interface RecentSeries { token: string; name: string; isReadOnly: boolean; lastVisited: number }
const LS_CRICKET = 'cricketRecentSeries'

function getRecentSeries(): RecentSeries[] {
  try { return JSON.parse(localStorage.getItem(LS_CRICKET) || '[]') } catch { return [] }
}
function saveRecentSeries(token: string, name: string, isReadOnly: boolean) {
  const list = getRecentSeries().filter(s => s.token !== token)
  list.unshift({ token, name, isReadOnly, lastVisited: Date.now() })
  localStorage.setItem(LS_CRICKET, JSON.stringify(list.slice(0, 20)))
}
function removeRecentSeries(token: string) {
  localStorage.setItem(LS_CRICKET, JSON.stringify(getRecentSeries().filter(s => s.token !== token)))
}
function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

// ── Ball chip ─────────────────────────────────────────────────────────────────
function BallChip({ d }: { d: CF.Delivery }) {
  let bg = c.surface, fg = c.muted, label = String(d.runs)
  if (d.isWicket) { bg = c.redDim; fg = c.red; label = 'W' }
  else if (d.isWide) { bg = c.yellowDim; fg = c.yellow; label = d.runs > 1 ? `WD+${d.runs - 1}` : 'WD' }
  else if (d.isNoBall) { bg = c.orangeDim; fg = c.orange; label = d.runs > 1 ? `NB+${d.runs - 1}` : 'NB' }
  else if (d.runs === 4) { bg = c.blueDim; fg = c.blue }
  else if (d.runs === 6) { bg = c.purpleDim; fg = c.purple }
  else if (d.runs > 0) { fg = c.text }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: 32, height: 32, borderRadius: '50%', fontSize: '0.72rem', fontWeight: 700,
      background: bg, color: fg, border: `1px solid ${c.border}`,
    }}>{label}</span>
  )
}

// ── Overlay modal wrapper ─────────────────────────────────────────────────────
function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100, padding: 16,
    }} onClick={onClose}>
      <div style={{ ...card, width: '100%', maxWidth: 440, marginBottom: 8, maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

// ── Home screen ───────────────────────────────────────────────────────────────
function CricketHome({
  onCreate,
  recentSeries,
  onRemove,
}: {
  onCreate: (name: string) => void
  recentSeries: RecentSeries[]
  onRemove: (token: string) => void
}) {
  const [name, setName] = useState('')
  const [joinToken, setJoinToken] = useState('')
  const navigate = useNavigate()

  return (
    <div style={{ minHeight: '100vh', background: c.bg, color: c.text, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 20, paddingTop: 48, paddingBottom: 48 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 52, marginBottom: 8 }}>🏏</div>
          <h1 style={{ margin: 0, fontSize: '1.6rem' }}>Cricket Tracker</h1>
          <p style={{ color: c.muted, marginTop: 6, fontSize: '0.9rem' }}>Track series, matches & live ball-by-ball scores</p>
        </div>

        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 12, color: c.muted, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: 1 }}>Create New Series</div>
          <input style={inp} placeholder="Series name (e.g. Office T20 League)"
            value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && name.trim() && onCreate(name)} />
          <button style={{ ...btn(c.green), width: '100%', marginTop: 10 }}
            onClick={() => name.trim() && onCreate(name)}>
            Create Series
          </button>
        </div>

        <div style={{ ...card, marginBottom: 24 }}>
          <div style={{ fontWeight: 600, marginBottom: 12, color: c.muted, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: 1 }}>Join Existing Series</div>
          <input style={inp} placeholder="Paste edit or view link / token"
            value={joinToken} onChange={e => setJoinToken(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && joinToken.trim() && navigate(`/cricket/${joinToken.trim().split('/').pop() || joinToken.trim()}`)} />
          <button style={{ ...btn(c.blue), width: '100%', marginTop: 10 }}
            onClick={() => joinToken.trim() && navigate(`/cricket/${joinToken.trim().split('/').pop() || joinToken.trim()}`)}>
            Open Series
          </button>
        </div>

        {/* Recent series — stored on this device */}
        {recentSeries.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0 14px' }}>
              <div style={{ flex: 1, height: 1, background: c.border }} />
              <span style={{ color: c.faint, fontSize: '0.72rem', letterSpacing: 1 }}>THIS DEVICE</span>
              <div style={{ flex: 1, height: 1, background: c.border }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
              {recentSeries.map(s => (
                <div key={s.token}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, background: c.surface, border: `1px solid ${c.border}`, borderRadius: 10, padding: '10px 14px', cursor: 'pointer' }}
                  onClick={() => navigate(`/cricket/${s.token}`)}>
                  <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>🏏</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 600, color: c.text, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.name}
                    </p>
                    <p style={{ margin: 0, fontSize: '0.72rem', color: c.faint, fontFamily: 'monospace' }}>
                      {s.token} · {timeAgo(s.lastVisited)}
                    </p>
                  </div>
                  <span style={s.isReadOnly ? tag(c.blueDim, c.blue) : tag(c.greenDim, c.green)}>
                    {s.isReadOnly ? '👁 View' : '✏️ Edit'}
                  </span>
                  <button
                    onClick={e => { e.stopPropagation(); onRemove(s.token) }}
                    style={{ background: 'none', border: 'none', color: c.faint, fontSize: '1rem', cursor: 'pointer', padding: '2px 4px', flexShrink: 0 }}
                    title="Remove from list">✕</button>
                </div>
              ))}
            </div>
          </>
        )}

        <div style={{ textAlign: 'center' }}>
          <Link to="/" style={{ color: c.muted, fontSize: '0.85rem' }}>← Back to Home</Link>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function CricketTracker() {
  const { token } = useParams<{ token?: string }>()
  const navigate = useNavigate()

  // Resolution
  const [loadState, setLoadState] = useState<'idle' | 'resolving' | 'ready' | 'notFound'>('idle')
  const [editToken, setEditToken] = useState('')
  const [isReadOnly, setIsReadOnly] = useState(false)

  // Recent series (localStorage)
  const [recentSeries, setRecentSeries] = useState<RecentSeries[]>(() => getRecentSeries())

  // Series data
  const [series, setSeries] = useState<CF.CricketSeries | null>(null)
  const [matches, setMatches] = useState<CF.CricketMatch[]>([])
  const [log, setLog] = useState<CF.LogEntry[]>([])

  // Match view
  const [matchId, setMatchId] = useState<string | null>(null)
  const [innings, setInnings] = useState<CF.Innings[]>([])
  const [inningsIdx, setInningsIdx] = useState(0)
  const [allDeliveries, setAllDeliveries] = useState<Record<string, CF.Delivery[]>>({})

  // Scoring
  const [pendingExtra, setPendingExtra] = useState<null | 'wide' | 'noBall'>(null)

  // UI forms
  const [newTeam, setNewTeam] = useState('')
  const [showAddTeam, setShowAddTeam] = useState(false)
  const [showAddMatch, setShowAddMatch] = useState(false)
  const [matchForm, setMatchForm] = useState({ team1: '', team2: '', tossWinner: '', battingFirst: '', maxOvers: '20' })
  const [showShare, setShowShare] = useState(false)
  const [showLog, setShowLog] = useState(false)
  const [showAddInnings, setShowAddInnings] = useState(false)
  const [inningsForm, setInningsForm] = useState({ battingTeam: '', bowlingTeam: '' })
  const [showResult, setShowResult] = useState(false)
  const [resultText, setResultText] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [newName, setNewName] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  // ── Token resolution ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) { setLoadState('idle'); return }
    setLoadState('resolving')
    CF.resolveToken(token).then(result => {
      if (!result) { setLoadState('notFound'); return }
      setEditToken(result.editToken)
      setIsReadOnly(result.isReadOnly)
      setLoadState('ready')
    })
  }, [token])

  // ── Series subscriptions ────────────────────────────────────────────────────
  useEffect(() => {
    if (loadState !== 'ready' || !editToken) return
    const unsubs = [
      CF.subSeries(editToken, setSeries),
      CF.subMatches(editToken, setMatches),
      CF.subLog(editToken, setLog),
    ]
    return () => unsubs.forEach(u => u())
  }, [loadState, editToken])

  // ── Innings subscription ────────────────────────────────────────────────────
  useEffect(() => {
    if (!matchId || !editToken) { setInnings([]); setAllDeliveries({}); return }
    const unsub = CF.subInnings(editToken, matchId, newInnings => {
      setInnings(newInnings)
    })
    return unsub
  }, [matchId, editToken])

  // Auto-select latest innings
  useEffect(() => {
    if (innings.length > 0) setInningsIdx(innings.length - 1)
  }, [innings.length])

  // ── Deliveries subscriptions for all innings ────────────────────────────────
  useEffect(() => {
    if (!matchId || !editToken || innings.length === 0) return
    const unsubs = innings.map(inn =>
      CF.subDeliveries(editToken, matchId, inn.id, delivs =>
        setAllDeliveries(prev => ({ ...prev, [inn.id]: delivs }))
      )
    )
    return () => unsubs.forEach(u => u())
  }, [matchId, editToken, innings.map(i => i.id).join(',')])  // eslint-disable-line

  // ── Save to recent list whenever series loads / name changes ───────────────
  useEffect(() => {
    if (series && token) {
      saveRecentSeries(token, series.name, isReadOnly)
      setRecentSeries(getRecentSeries())
    }
  }, [series?.name, token, isReadOnly])  // eslint-disable-line

  // ── Derived ─────────────────────────────────────────────────────────────────
  const selectedMatch = matches.find(m => m.id === matchId) ?? null
  const currentInnings = innings[inningsIdx] ?? null
  const deliveries = currentInnings ? (allDeliveries[currentInnings.id] ?? []) : []
  const score = CF.computeScore(deliveries)
  const currentOverNum = CF.getCurrentOver(deliveries)
  const currentOverBalls = CF.getOverBalls(deliveries, currentOverNum)

  // Target for 2nd innings
  const inn1Score = innings[0] ? CF.computeScore(allDeliveries[innings[0].id] ?? []) : null
  const target = inn1Score ? inn1Score.runs + 1 : null
  const runsNeeded = (target && inningsIdx === 1) ? target - score.runs : null
  const ballsLeft = selectedMatch ? selectedMatch.maxOvers * 6 - score.legalBalls : null

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const doDelivery = async (runs: number, isWide: boolean, isNoBall: boolean, isWicket: boolean) => {
    if (!editToken || !matchId || !currentInnings) return
    await CF.addDelivery(editToken, matchId, currentInnings.id, {
      runs, isWide, isNoBall, isWicket, createdAt: Date.now(),
    })
    if (isWicket) {
      const newScore = CF.computeScore([...deliveries, { id: '', runs, isWide, isNoBall, isWicket, createdAt: 0 }])
      await CF.addLog(editToken, 'wicket', `Wicket! ${currentInnings.battingTeam} ${newScore.runs}/${newScore.wickets}`)
    }
  }

  const handleBall = async (runs: number) => {
    if (pendingExtra === 'wide') {
      await doDelivery(runs + 1, true, false, false)
      setPendingExtra(null)
    } else if (pendingExtra === 'noBall') {
      await doDelivery(runs + 1, false, true, false)
      setPendingExtra(null)
    } else {
      await doDelivery(runs, false, false, false)
    }
  }

  const handleWicket = async () => {
    if (pendingExtra) { setPendingExtra(null); return }
    await doDelivery(0, false, false, true)
  }

  const handleUndo = async () => {
    if (!editToken || !matchId || !currentInnings || deliveries.length === 0) return
    const last = deliveries[deliveries.length - 1]
    await CF.removeDelivery(editToken, matchId, currentInnings.id, last.id)
  }

  const openMatchScorer = (id: string) => {
    setMatchId(id)
    setInnings([])
    setAllDeliveries({})
    setPendingExtra(null)
  }

  const closeMatch = () => {
    setMatchId(null)
    setInnings([])
    setAllDeliveries({})
    setPendingExtra(null)
  }

  // ── Render: No token (home) ─────────────────────────────────────────────────
  if (!token || loadState === 'idle') {
    return (
      <CricketHome
        recentSeries={recentSeries}
        onRemove={t => { removeRecentSeries(t); setRecentSeries(getRecentSeries()) }}
        onCreate={async name => {
          const { editToken: et } = await CF.createSeries(name)
          saveRecentSeries(et, name.trim() || 'My Cricket Series', false)
          setRecentSeries(getRecentSeries())
          navigate(`/cricket/${et}`)
        }}
      />
    )
  }

  if (loadState === 'resolving') {
    return (
      <div style={{ minHeight: '100vh', background: c.bg, color: c.muted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        Loading…
      </div>
    )
  }

  if (loadState === 'notFound') {
    return (
      <div style={{ minHeight: '100vh', background: c.bg, color: c.text, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <div style={{ fontSize: 48 }}>🏏</div>
        <p style={{ color: c.muted }}>Series not found</p>
        <Link to="/cricket" style={{ color: c.blue, fontSize: '0.9rem' }}>Create new series</Link>
      </div>
    )
  }

  const editUrl = `${window.location.origin}/cricket/${editToken}`
  const viewUrl = series ? `${window.location.origin}/cricket/${series.viewToken}` : ''

  // ── Match Scorer View ───────────────────────────────────────────────────────
  if (matchId && selectedMatch) {
    return (
      <div style={{ minHeight: '100vh', background: c.bg, color: c.text, fontFamily: 'inherit' }}>
        {/* Header */}
        <div style={{ background: c.surface, borderBottom: `1px solid ${c.border}`, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 10 }}>
          <button onClick={closeMatch} style={{ background: 'none', border: 'none', color: c.muted, cursor: 'pointer', fontSize: '0.9rem', padding: 0 }}>
            ← Back
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedMatch.team1} vs {selectedMatch.team2}
            </div>
            <div style={{ fontSize: '0.75rem', color: c.muted }}>
              {selectedMatch.maxOvers} overs · Toss: {selectedMatch.tossWinner} · {selectedMatch.battingFirst} bats first
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {selectedMatch.status === 'live' && (
              <span style={{ ...tag(c.redDim, c.red), animation: 'pulse 1.5s infinite' }}>● Live</span>
            )}
            {selectedMatch.status === 'completed' && (
              <span style={tag(c.faint, c.muted)}>Done</span>
            )}
            {!isReadOnly && selectedMatch.status === 'live' && (
              <button onClick={() => { setResultText(''); setShowResult(true) }}
                style={{ ...btn(c.faint), padding: '6px 12px', fontSize: '0.8rem' }}>
                End
              </button>
            )}
            {isReadOnly && <span style={tag(c.faint, c.muted)}>View only</span>}
          </div>
        </div>

        <div style={{ padding: 16, maxWidth: 480, margin: '0 auto', paddingBottom: 40 }}>

          {/* Innings tabs */}
          {innings.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {innings.map((inn, i) => {
                const s = CF.computeScore(allDeliveries[inn.id] ?? [])
                return (
                  <button key={inn.id} onClick={() => setInningsIdx(i)}
                    style={{
                      flex: 1, padding: '8px 10px', borderRadius: 10, border: 'none', cursor: 'pointer',
                      background: i === inningsIdx ? c.greenDim : c.surface,
                      color: i === inningsIdx ? c.green : c.muted,
                      outline: i === inningsIdx ? `1px solid ${c.green}` : `1px solid ${c.border}`,
                      fontSize: '0.78rem', fontWeight: 700, textAlign: 'center',
                    }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inn.battingTeam}</div>
                    <div style={{ fontSize: '0.85rem', color: i === inningsIdx ? c.green : c.text }}>{s.runs}/{s.wickets} ({s.overs})</div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Scorecard */}
          {currentInnings ? (
            <div style={{ ...card, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: '2.8rem', fontWeight: 800, letterSpacing: -1, lineHeight: 1 }}>
                    {score.runs}/{score.wickets}
                  </div>
                  <div style={{ color: c.muted, fontSize: '0.85rem', marginTop: 4 }}>
                    {score.overs} overs · Extras: {score.extras}
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: '0.85rem', color: c.muted }}>
                  <div>{currentInnings.battingTeam}</div>
                  <div>vs {currentInnings.bowlingTeam}</div>
                </div>
              </div>
              {/* Target info */}
              {runsNeeded !== null && ballsLeft !== null && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${c.border}`, fontSize: '0.85rem' }}>
                  {runsNeeded <= 0
                    ? <span style={{ color: c.green, fontWeight: 700 }}>🏆 {currentInnings.battingTeam} won!</span>
                    : <span style={{ color: c.yellow }}>
                        Target: {target} · Need <b>{runsNeeded}</b> from {ballsLeft} balls
                        · RRR: {ballsLeft > 0 ? ((runsNeeded / ballsLeft) * 6).toFixed(2) : '—'}
                      </span>
                  }
                </div>
              )}
              {/* Current over */}
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${c.border}` }}>
                <div style={{ fontSize: '0.75rem', color: c.gray7, marginBottom: 6 }}>
                  Over {currentOverNum + 1} ({currentOverBalls.filter(d => !d.isWide && !d.isNoBall).length}/6 legal)
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {currentOverBalls.map(d => <BallChip key={d.id} d={d} />)}
                  {currentOverBalls.length === 0 && <span style={{ color: c.faint, fontSize: '0.85rem' }}>–</span>}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ ...card, textAlign: 'center', color: c.muted, marginBottom: 12 }}>No innings started</div>
          )}

          {/* Ball entry controls */}
          {!isReadOnly && selectedMatch.status === 'live' && currentInnings && (
            <div style={{ ...card, marginBottom: 12 }}>
              {pendingExtra && (
                <div style={{ textAlign: 'center', fontSize: '0.85rem', color: c.yellow, fontWeight: 600, marginBottom: 10 }}>
                  {pendingExtra === 'wide' ? '🟡 Wide' : '🟠 No Ball'} — tap run value
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 8, marginBottom: 8 }}>
                {[0, 1, 2, 3, 4, 6].map(r => (
                  <button key={r} onClick={() => handleBall(r)}
                    style={{
                      height: 56, borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: '1.1rem',
                      background: r === 4 ? c.blueDim : r === 6 ? c.purpleDim : c.hover,
                      color: r === 4 ? c.blue : r === 6 ? c.purple : c.text,
                      outline: r === 4 ? `1px solid ${c.blue}33` : r === 6 ? `1px solid ${c.purple}33` : `1px solid ${c.border}`,
                    }}>
                    {r}
                  </button>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                <button onClick={handleWicket}
                  style={{ height: 56, borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: '1rem', background: c.redDim, color: c.red, outline: `1px solid ${c.red}33` }}>
                  W
                </button>
                <button onClick={() => setPendingExtra(p => p === 'wide' ? null : 'wide')}
                  style={{ height: 56, borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem', background: pendingExtra === 'wide' ? c.yellow : c.yellowDim, color: pendingExtra === 'wide' ? '#000' : c.yellow, outline: `1px solid ${c.yellow}33` }}>
                  WD
                </button>
                <button onClick={() => setPendingExtra(p => p === 'noBall' ? null : 'noBall')}
                  style={{ height: 56, borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem', background: pendingExtra === 'noBall' ? c.orange : c.orangeDim, color: pendingExtra === 'noBall' ? '#000' : c.orange, outline: `1px solid ${c.orange}33` }}>
                  NB
                </button>
                <button onClick={handleUndo}
                  style={{ height: 56, borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', background: c.hover, color: c.muted, outline: `1px solid ${c.border}` }}>
                  Undo
                </button>
              </div>
              <div style={{ fontSize: '0.72rem', color: c.faint, marginTop: 8, textAlign: 'center' }}>
                WD/NB: tap extra type, then tap runs scored. W: instant wicket.
              </div>
            </div>
          )}

          {/* Start innings / match controls */}
          {!isReadOnly && selectedMatch.status === 'upcoming' && (
            <button
              onClick={() => {
                const other = selectedMatch.battingFirst === selectedMatch.team1 ? selectedMatch.team2 : selectedMatch.team1
                setInningsForm({ battingTeam: selectedMatch.battingFirst, bowlingTeam: other })
                setShowAddInnings(true)
              }}
              style={{ ...btn(c.green), width: '100%', marginBottom: 12 }}>
              ▶ Start Match — Begin Innings 1
            </button>
          )}
          {!isReadOnly && selectedMatch.status === 'live' && innings.length === 1 && (
            <button
              onClick={() => {
                const inn2Bat = innings[0].battingTeam === selectedMatch.team1 ? selectedMatch.team2 : selectedMatch.team1
                const inn2Bowl = innings[0].bowlingTeam
                setInningsForm({ battingTeam: inn2Bat, bowlingTeam: inn2Bowl })
                setShowAddInnings(true)
              }}
              style={{ ...btn(c.blue), width: '100%', marginBottom: 12, fontSize: '0.85rem' }}>
              + Start Innings 2
            </button>
          )}

          {/* Match result */}
          {selectedMatch.result && (
            <div style={{ ...card, textAlign: 'center', marginBottom: 12 }}>
              <div style={{ color: c.green, fontWeight: 700, marginBottom: 4 }}>🏆 Result</div>
              <div style={{ fontSize: '0.9rem' }}>{selectedMatch.result}</div>
            </div>
          )}

          {/* Ball history (overs) */}
          {deliveries.length > 0 && (
            <div style={{ ...card }}>
              <div style={{ fontSize: '0.75rem', color: c.gray7, marginBottom: 10 }}>Ball History</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {Array.from({ length: currentOverNum + 1 }, (_, i) => currentOverNum - i).map(ovNum => {
                  const balls = CF.getOverBalls(deliveries, ovNum)
                  if (balls.length === 0) return null
                  const ovRuns = balls.reduce((s, d) => s + d.runs, 0)
                  const wkts = balls.filter(d => d.isWicket).length
                  return (
                    <div key={ovNum} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ fontSize: '0.72rem', color: c.muted, width: 36, flexShrink: 0 }}>Ov {ovNum + 1}</div>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', flex: 1 }}>
                        {balls.map(d => <BallChip key={d.id} d={d} />)}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: wkts ? c.red : c.muted, fontWeight: 600, flexShrink: 0 }}>
                        {ovRuns}{wkts ? `-${wkts}W` : ''}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Add Innings Modal */}
        {showAddInnings && !isReadOnly && (
          <Modal onClose={() => setShowAddInnings(false)}>
            <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem' }}>Start Innings {innings.length + 1}</h3>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: '0.78rem', color: c.muted, marginBottom: 6 }}>Batting Team</div>
              <select style={{ ...inp }}
                value={inningsForm.battingTeam}
                onChange={e => {
                  const bt = e.target.value
                  const bl = bt === selectedMatch.team1 ? selectedMatch.team2 : selectedMatch.team1
                  setInningsForm({ battingTeam: bt, bowlingTeam: bl })
                }}>
                <option value="">Select</option>
                <option value={selectedMatch.team1}>{selectedMatch.team1}</option>
                <option value={selectedMatch.team2}>{selectedMatch.team2}</option>
              </select>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: '0.78rem', color: c.muted, marginBottom: 6 }}>Bowling Team</div>
              <input style={{ ...inp, opacity: 0.6 }} value={inningsForm.bowlingTeam} readOnly />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ ...btn(c.hover, c.muted), flex: 1 }} onClick={() => setShowAddInnings(false)}>Cancel</button>
              <button style={{ ...btn(c.green), flex: 1 }}
                onClick={async () => {
                  if (!inningsForm.battingTeam) return
                  await CF.addInnings(editToken, matchId!, {
                    battingTeam: inningsForm.battingTeam,
                    bowlingTeam: inningsForm.bowlingTeam,
                    inningsNumber: innings.length + 1,
                    createdAt: Date.now(),
                  })
                  await CF.updateMatch(editToken, matchId!, { status: 'live' })
                  await CF.addLog(editToken, 'innings', `Innings ${innings.length + 1} started: ${inningsForm.battingTeam} batting`)
                  setShowAddInnings(false)
                }}>
                Start
              </button>
            </div>
          </Modal>
        )}

        {/* End Match Modal */}
        {showResult && !isReadOnly && (
          <Modal onClose={() => setShowResult(false)}>
            <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem' }}>Match Result</h3>
            <input style={{ ...inp, marginBottom: 16 }}
              placeholder="e.g. Team A won by 5 wickets"
              value={resultText}
              onChange={e => setResultText(e.target.value)} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ ...btn(c.hover, c.muted), flex: 1 }} onClick={() => setShowResult(false)}>Cancel</button>
              <button style={{ ...btn(c.green), flex: 1 }}
                onClick={async () => {
                  await CF.updateMatch(editToken, matchId!, { status: 'completed', result: resultText })
                  await CF.addLog(editToken, 'result', `Match result: ${resultText}`)
                  setShowResult(false)
                }}>
                Save
              </button>
            </div>
          </Modal>
        )}
      </div>
    )
  }

  // ── Series View ─────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: c.bg, color: c.text, fontFamily: 'inherit' }}>
      {/* Header */}
      <div style={{ background: c.surface, borderBottom: `1px solid ${c.border}`, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 10 }}>
        <Link to="/" style={{ color: c.muted, fontSize: '0.85rem', textDecoration: 'none' }}>← Home</Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editingName ? (
            <input autoFocus style={{ ...inp, padding: '6px 10px', fontSize: '1rem' }}
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onBlur={async () => {
                if (newName.trim() && newName !== series?.name) {
                  await CF.updateSeriesName(editToken, newName)
                  await CF.addLog(editToken, 'rename', `Series renamed to "${newName}"`)
                }
                setEditingName(false)
              }}
              onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          ) : (
            <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: isReadOnly ? 'default' : 'pointer' }}
              onClick={() => { if (!isReadOnly) { setNewName(series?.name ?? ''); setEditingName(true) } }}>
              🏏 {series?.name ?? '…'}
            </div>
          )}
        </div>
        {!isReadOnly && (
          <button onClick={() => setShowShare(true)}
            style={{ background: 'none', border: 'none', color: c.muted, cursor: 'pointer', fontSize: '1.1rem', padding: 4 }}
            title="Share">🔗</button>
        )}
        {isReadOnly && (
          <button onClick={() => setShowShare(true)}
            style={{ ...tag(c.blueDim, c.blue), border: 'none', cursor: 'pointer' }}>👁 View only</button>
        )}
      </div>

      <div style={{ padding: 16, maxWidth: 480, margin: '0 auto', paddingBottom: 40 }}>

        {/* Teams */}
        <div style={{ ...card, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: 1, color: c.muted }}>Teams</h2>
            {!isReadOnly && (
              <button onClick={() => setShowAddTeam(!showAddTeam)}
                style={{ background: 'none', border: 'none', color: c.green, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
                + Add
              </button>
            )}
          </div>
          {showAddTeam && !isReadOnly && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input autoFocus style={{ ...inp }} placeholder="Team name"
                value={newTeam} onChange={e => setNewTeam(e.target.value)}
                onKeyDown={async e => {
                  if (e.key === 'Enter' && newTeam.trim()) {
                    await CF.addTeam(editToken, series?.teams ?? [], newTeam)
                    await CF.addLog(editToken, 'team', `Added team: ${newTeam}`)
                    setNewTeam(''); setShowAddTeam(false)
                  }
                }} />
              <button style={{ ...btn(c.green), padding: '10px 16px', flexShrink: 0 }}
                onClick={async () => {
                  if (!newTeam.trim()) return
                  await CF.addTeam(editToken, series?.teams ?? [], newTeam)
                  await CF.addLog(editToken, 'team', `Added team: ${newTeam}`)
                  setNewTeam(''); setShowAddTeam(false)
                }}>
                Add
              </button>
            </div>
          )}
          {(series?.teams ?? []).length === 0
            ? <div style={{ color: c.faint, fontSize: '0.85rem' }}>No teams yet</div>
            : (series?.teams ?? []).map(t => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${c.faint}` }}>
                  <span style={{ fontSize: '0.9rem' }}>🏏 {t}</span>
                  {!isReadOnly && (
                    <button style={{ background: 'none', border: 'none', color: c.faint, cursor: 'pointer', fontSize: '0.8rem' }}
                      onClick={async () => {
                        await CF.removeTeam(editToken, series?.teams ?? [], t)
                        await CF.addLog(editToken, 'team', `Removed team: ${t}`)
                      }}>✕</button>
                  )}
                </div>
              ))
          }
        </div>

        {/* Matches */}
        <div style={{ ...card, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: 1, color: c.muted }}>Matches</h2>
            {!isReadOnly && (
              <button onClick={() => { setMatchForm({ team1: '', team2: '', tossWinner: '', battingFirst: '', maxOvers: '20' }); setShowAddMatch(true) }}
                style={{ background: 'none', border: 'none', color: c.green, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
                + Add
              </button>
            )}
          </div>
          {matches.length === 0
            ? <div style={{ color: c.faint, fontSize: '0.85rem' }}>No matches yet</div>
            : matches.map(m => (
                <div key={m.id}
                  onClick={() => openMatchScorer(m.id)}
                  style={{ background: c.hover, borderRadius: 10, padding: '12px 14px', marginBottom: 8, cursor: 'pointer', border: `1px solid ${c.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{m.team1} vs {m.team2}</div>
                    <span style={m.status === 'live' ? tag(c.redDim, c.red) : m.status === 'completed' ? tag(c.faint, c.muted) : tag(c.blueDim, c.blue)}>
                      {m.status === 'live' ? '● Live' : m.status === 'completed' ? 'Done' : 'Upcoming'}
                    </span>
                  </div>
                  {m.result && <div style={{ fontSize: '0.8rem', color: c.green }}>{m.result}</div>}
                  <div style={{ fontSize: '0.75rem', color: c.muted, marginTop: 2 }}>
                    {m.maxOvers} overs · Toss: {m.tossWinner || '—'} · {m.battingFirst || '—'} bats first
                  </div>
                </div>
              ))
          }
        </div>

        {/* Activity Log */}
        <div style={{ ...card }}>
          <button onClick={() => setShowLog(!showLog)}
            style={{ background: 'none', border: 'none', color: c.text, cursor: 'pointer', width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 0, fontWeight: 600, fontSize: '0.9rem' }}>
            <span style={{ textTransform: 'uppercase', letterSpacing: 1, fontSize: '0.85rem', color: c.muted }}>Activity Log</span>
            <span style={{ color: c.faint, fontSize: '0.8rem' }}>{showLog ? '▲' : '▼'} {log.length}</span>
          </button>
          {showLog && (
            <div style={{ marginTop: 12, maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {log.length === 0
                ? <div style={{ color: c.faint, fontSize: '0.85rem' }}>No activity yet</div>
                : log.map(e => (
                    <div key={e.id} style={{ display: 'flex', gap: 10, fontSize: '0.82rem' }}>
                      <span style={{ color: c.faint, flexShrink: 0, fontSize: '0.72rem', marginTop: 2 }}>
                        {new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span style={{ color: c.text }}>{e.detail}</span>
                    </div>
                  ))
              }
            </div>
          )}
        </div>
      </div>

      {/* Share Modal */}
      {showShare && (
        <Modal onClose={() => setShowShare(false)}>
          <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem' }}>Share Series</h3>
          {[
            { label: '✏️ Edit Link', sub: 'anyone with this link can edit', url: editUrl, key: 'edit', color: c.green },
            { label: '👁 View Link', sub: 'anyone with this link can view only', url: viewUrl, key: 'view', color: c.blue },
          ].map(({ label, sub, url, key, color }) => (
            <div key={key} style={{ background: c.hover, borderRadius: 10, padding: '12px 14px', marginBottom: 12, border: `1px solid ${c.border}` }}>
              <div style={{ fontWeight: 700, color, fontSize: '0.9rem', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: '0.72rem', color: c.muted, marginBottom: 8 }}>{sub}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input readOnly value={url} style={{ ...inp, fontSize: '0.78rem', padding: '8px 10px', flex: 1 }} onClick={e => (e.target as HTMLInputElement).select()} />
                <button onClick={() => copy(url, key)}
                  style={{ ...btn(c.surface), padding: '8px 14px', fontSize: '0.82rem', flexShrink: 0, outline: `1px solid ${c.border}` }}>
                  {copied === key ? '✓' : 'Copy'}
                </button>
              </div>
            </div>
          ))}
          <button style={{ ...btn(c.hover, c.muted), width: '100%' }} onClick={() => setShowShare(false)}>Close</button>
        </Modal>
      )}

      {/* Add Match Modal */}
      {showAddMatch && !isReadOnly && (
        <Modal onClose={() => setShowAddMatch(false)}>
          <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem' }}>Add Match</h3>
          {(['team1', 'team2', 'tossWinner', 'battingFirst'] as const).map(field => {
            const teams = series?.teams ?? []
            const availableTeams = field === 'team2'
              ? teams.filter(t => t !== matchForm.team1)
              : field === 'tossWinner' || field === 'battingFirst'
              ? teams.filter(t => t === matchForm.team1 || t === matchForm.team2)
              : teams
            return (
              <div key={field} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: '0.78rem', color: c.muted, marginBottom: 6 }}>
                  {{ team1: 'Team 1', team2: 'Team 2', tossWinner: 'Toss Winner', battingFirst: 'Batting First' }[field]}
                </div>
                {teams.length > 0 ? (
                  <select style={{ ...inp }}
                    value={matchForm[field]}
                    onChange={e => {
                      const val = e.target.value
                      setMatchForm(f => {
                        const updated = { ...f, [field]: val }
                        // Clear team2 if it now equals team1
                        if (field === 'team1' && updated.team2 === val) updated.team2 = ''
                        // Reset toss/batting if they no longer match either team
                        if ((field === 'team1' || field === 'team2') && updated.tossWinner !== updated.team1 && updated.tossWinner !== updated.team2) updated.tossWinner = ''
                        if ((field === 'team1' || field === 'team2') && updated.battingFirst !== updated.team1 && updated.battingFirst !== updated.team2) updated.battingFirst = ''
                        return updated
                      })
                    }}>
                    <option value="">Select team</option>
                    {availableTeams.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                ) : (
                  <input style={{ ...inp, ...(field === 'team2' && matchForm.team2 && matchForm.team2 === matchForm.team1 ? { borderColor: c.red } : {}) }}
                    placeholder={{ team1: 'Team 1', team2: 'Team 2', tossWinner: 'Toss winner', battingFirst: 'Batting first' }[field]}
                    value={matchForm[field]}
                    onChange={e => setMatchForm(f => ({ ...f, [field]: e.target.value }))} />
                )}
                {field === 'team2' && matchForm.team2 && matchForm.team2 === matchForm.team1 && (
                  <div style={{ fontSize: '0.75rem', color: c.red, marginTop: 4 }}>Team 2 must be different from Team 1</div>
                )}
              </div>
            )
          })}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: '0.78rem', color: c.muted, marginBottom: 6 }}>Max Overs</div>
            <input type="number" style={inp} min={1} max={50}
              value={matchForm.maxOvers}
              onChange={e => setMatchForm(f => ({ ...f, maxOvers: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ ...btn(c.hover, c.muted), flex: 1 }} onClick={() => setShowAddMatch(false)}>Cancel</button>
            <button style={{ ...btn(c.green), flex: 1 }}
              onClick={async () => {
                const { team1, team2, tossWinner, battingFirst, maxOvers } = matchForm
                if (!team1 || !team2 || team1 === team2) return
                const id = await CF.addMatch(editToken, {
                  team1, team2,
                  tossWinner: tossWinner || team1,
                  battingFirst: battingFirst || team1,
                  maxOvers: parseInt(maxOvers) || 20,
                  status: 'upcoming', result: '',
                  createdAt: Date.now(),
                })
                await CF.addLog(editToken, 'match', `Match added: ${team1} vs ${team2}`)
                setShowAddMatch(false)
                openMatchScorer(id)
              }}>
              Add & Open
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
