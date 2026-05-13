import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  getDoc,
} from 'firebase/firestore'
import type { Unsubscribe } from 'firebase/firestore'
import { getApps, initializeApp } from 'firebase/app'
import { firebaseConfig } from './firebaseConfig'

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]

let db: ReturnType<typeof getFirestore>
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  })
} catch {
  db = getFirestore(app)
}

function genToken(len = 10): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let r = ''
  for (let i = 0; i < len; i++) r += chars[Math.floor(Math.random() * chars.length)]
  return r
}

export interface CricketSeries {
  id: string
  name: string
  teams: string[]
  viewToken: string
  createdAt: number
}

export interface CricketMatch {
  id: string
  team1: string
  team2: string
  status: 'upcoming' | 'live' | 'completed'
  tossWinner: string
  battingFirst: string
  maxOvers: number
  result: string
  createdAt: number
}

export interface Innings {
  id: string
  battingTeam: string
  bowlingTeam: string
  inningsNumber: number
  createdAt: number
}

export interface Delivery {
  id: string
  runs: number
  isWide: boolean
  isNoBall: boolean
  isWicket: boolean
  createdAt: number
}

export interface LogEntry {
  id: string
  action: string
  detail: string
  timestamp: number
}

export interface Score {
  runs: number
  wickets: number
  legalBalls: number
  overs: string
  extras: number
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export const createSeries = async (name: string): Promise<{ editToken: string; viewToken: string }> => {
  const editToken = genToken()
  const viewToken = genToken()
  await setDoc(doc(db, 'cricketSeries', editToken), {
    name: name.trim() || 'My Cricket Series',
    teams: [],
    viewToken,
    createdAt: Date.now(),
  })
  await setDoc(doc(db, 'cricketViewIndex', viewToken), { editToken })
  return { editToken, viewToken }
}

export const resolveToken = async (token: string): Promise<{ editToken: string; isReadOnly: boolean } | null> => {
  const direct = await getDoc(doc(db, 'cricketSeries', token))
  if (direct.exists()) return { editToken: token, isReadOnly: false }
  const idx = await getDoc(doc(db, 'cricketViewIndex', token))
  if (idx.exists()) return { editToken: idx.data().editToken as string, isReadOnly: true }
  return null
}

export const updateSeriesName = async (editToken: string, name: string) =>
  updateDoc(doc(db, 'cricketSeries', editToken), { name })

export const addTeam = async (editToken: string, teams: string[], team: string) =>
  updateDoc(doc(db, 'cricketSeries', editToken), { teams: [...teams, team.trim()] })

export const removeTeam = async (editToken: string, teams: string[], team: string) =>
  updateDoc(doc(db, 'cricketSeries', editToken), { teams: teams.filter(t => t !== team) })

export const addMatch = async (editToken: string, match: Omit<CricketMatch, 'id'>): Promise<string> => {
  const ref = await addDoc(collection(db, 'cricketSeries', editToken, 'matches'), match)
  return ref.id
}

export const updateMatch = async (editToken: string, matchId: string, data: Partial<Omit<CricketMatch, 'id'>>) =>
  updateDoc(doc(db, 'cricketSeries', editToken, 'matches', matchId), data)

export const deleteMatch = async (editToken: string, matchId: string) =>
  deleteDoc(doc(db, 'cricketSeries', editToken, 'matches', matchId))

export const addInnings = async (editToken: string, matchId: string, innings: Omit<Innings, 'id'>): Promise<string> => {
  const ref = await addDoc(collection(db, 'cricketSeries', editToken, 'matches', matchId, 'innings'), innings)
  return ref.id
}

export const addDelivery = async (
  editToken: string, matchId: string, inningsId: string,
  delivery: Omit<Delivery, 'id'>
): Promise<string> => {
  const ref = await addDoc(
    collection(db, 'cricketSeries', editToken, 'matches', matchId, 'innings', inningsId, 'deliveries'),
    delivery
  )
  return ref.id
}

export const removeDelivery = async (
  editToken: string, matchId: string, inningsId: string, deliveryId: string
) =>
  deleteDoc(doc(db, 'cricketSeries', editToken, 'matches', matchId, 'innings', inningsId, 'deliveries', deliveryId))

export const addLog = async (editToken: string, action: string, detail: string) =>
  addDoc(collection(db, 'cricketSeries', editToken, 'log'), { action, detail, timestamp: Date.now() })

// ── Subscriptions ─────────────────────────────────────────────────────────────

export const subSeries = (editToken: string, cb: (s: CricketSeries | null) => void): Unsubscribe =>
  onSnapshot(doc(db, 'cricketSeries', editToken),
    snap => cb(snap.exists() ? ({ id: editToken, ...snap.data() } as CricketSeries) : null),
    () => cb(null))

export const subMatches = (editToken: string, cb: (m: CricketMatch[]) => void): Unsubscribe =>
  onSnapshot(
    query(collection(db, 'cricketSeries', editToken, 'matches'), orderBy('createdAt', 'asc')),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as CricketMatch))),
    () => cb([]))

export const subInnings = (editToken: string, matchId: string, cb: (i: Innings[]) => void): Unsubscribe =>
  onSnapshot(
    query(collection(db, 'cricketSeries', editToken, 'matches', matchId, 'innings'), orderBy('inningsNumber', 'asc')),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as Innings))),
    () => cb([]))

export const subDeliveries = (
  editToken: string, matchId: string, inningsId: string,
  cb: (d: Delivery[]) => void
): Unsubscribe =>
  onSnapshot(
    query(
      collection(db, 'cricketSeries', editToken, 'matches', matchId, 'innings', inningsId, 'deliveries'),
      orderBy('createdAt', 'asc')
    ),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as Delivery))),
    () => cb([]))

export const subLog = (editToken: string, cb: (e: LogEntry[]) => void): Unsubscribe =>
  onSnapshot(
    query(collection(db, 'cricketSeries', editToken, 'log'), orderBy('timestamp', 'desc')),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as LogEntry))),
    () => cb([]))

// ── Scoring helpers ───────────────────────────────────────────────────────────

export function computeScore(deliveries: Delivery[]): Score {
  let runs = 0, wickets = 0, legalBalls = 0, extras = 0
  for (const d of deliveries) {
    runs += d.runs
    if (d.isWide || d.isNoBall) extras++
    if (d.isWicket) wickets++
    if (!d.isWide && !d.isNoBall) legalBalls++
  }
  return { runs, wickets, legalBalls, overs: `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`, extras }
}

export function getOverBalls(deliveries: Delivery[], overNum: number): Delivery[] {
  let legal = 0
  const result: Delivery[] = []
  for (const d of deliveries) {
    const isLegal = !d.isWide && !d.isNoBall
    const curOver = Math.floor(legal / 6)
    if (curOver === overNum) result.push(d)
    else if (curOver > overNum) break
    if (isLegal) legal++
  }
  return result
}

export function getCurrentOver(deliveries: Delivery[]): number {
  const legal = deliveries.filter(d => !d.isWide && !d.isNoBall).length
  return Math.floor(legal / 6)
}
