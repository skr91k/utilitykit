import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  limit as qLimit,
  startAfter,
  Timestamp,
  GeoPoint,
  Bytes,
  DocumentReference,
} from 'firebase/firestore';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';
import { firebaseConfig } from './firebaseConfig';
import type { User } from './firebase';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Same init dance as the other firestore utils: whichever module loads first wins,
// the rest fall back to the already-created instance.
let db: ReturnType<typeof getFirestore>;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
} catch {
  db = getFirestore(app);
}

// ============================================================
// Who gets in
// ============================================================

/** Mirror of the isAdmin() allow-list in firestore.rules — keep both in sync. */
export const ADMIN_EMAILS = [
  'emst.shakir@gmail.com',
  'shakir.kadakkadan@gmail.com',
];

export function isAdminUser(user: User | null): boolean {
  const email = user?.email?.toLowerCase();
  return !!email && ADMIN_EMAILS.includes(email);
}

// ============================================================
// Schema registry
// ============================================================
//
// The Firestore *web* SDK has no listCollections() — only the server Admin SDK
// does — so a browser-only console cannot discover collection names on its own.
// This registry names every path in firestore.rules; anything outside it is still
// reachable through the "open any path" box and through collection-group queries.

/** Every collection path in the database, as a template ('{x}' = any doc id). */
export const COLLECTION_TEMPLATES = [
  'users',
  'users/{uid}/counterTasks',
  'users/{uid}/counterTasks/{taskId}/progress',
  'users/{uid}/defaultCounter',
  'users/{uid}/pastes',
  'users/{uid}/fuelTrips',
  'users/{uid}/moneyTransactions',
  'chatRooms',
  'chatRooms/{chatRoomId}/messages',
  'presence',
  'splitBooks',
  'splitBooks/{bookId}/expenses',
  'splitBooks/{bookId}/auditLog',
  'cricketSeries',
  'cricketSeries/{editToken}/matches',
  'cricketSeries/{editToken}/matches/{matchId}/innings',
  'cricketSeries/{editToken}/matches/{matchId}/innings/{inningsId}/deliveries',
  'cricketSeries/{editToken}/log',
  'cricketViewIndex',
  'publicPastes',
  'sharedPastes',
];

export interface RootCollection {
  path: string;
  label: string;
  note: string;
}

/** Top-level collections — the entry points of the sidebar. */
export const ROOT_COLLECTIONS: RootCollection[] = [
  { path: 'users', label: 'users', note: 'per-account data (counter, pastes, fuel, money)' },
  { path: 'chatRooms', label: 'chatRooms', note: 'support chat, one room per user' },
  { path: 'presence', label: 'presence', note: 'support online/offline state' },
  { path: 'splitBooks', label: 'splitBooks', note: 'split expense books' },
  { path: 'cricketSeries', label: 'cricketSeries', note: 'cricket tracker series' },
  { path: 'cricketViewIndex', label: 'cricketViewIndex', note: 'view-token → series lookup' },
  { path: 'publicPastes', label: 'publicPastes', note: 'public paste board' },
  { path: 'sharedPastes', label: 'sharedPastes', note: 'published copies of private pastes' },
];

export interface GroupCollection {
  id: string;
  note: string;
}

/**
 * Collection-group ids: one query returns that subcollection across *every*
 * parent. This is also the only reliable way to reach documents whose parent
 * document was never created (Firestore hides those from a plain list).
 */
export const GROUP_COLLECTIONS: GroupCollection[] = [
  { id: 'counterTasks', note: 'all counter tasks, all users' },
  { id: 'progress', note: 'all counter task progress' },
  { id: 'defaultCounter', note: 'all quick-count docs' },
  { id: 'pastes', note: 'all private pastes' },
  { id: 'fuelTrips', note: 'all fuel/trip logs' },
  { id: 'moneyTransactions', note: 'all MoneyFlow transactions' },
  { id: 'messages', note: 'all support chat messages' },
  { id: 'expenses', note: 'all split expenses' },
  { id: 'auditLog', note: 'all split audit entries' },
  { id: 'matches', note: 'all cricket matches' },
  { id: 'innings', note: 'all cricket innings' },
  { id: 'deliveries', note: 'all cricket deliveries' },
  { id: 'log', note: 'all cricket log entries' },
];

/** Subcollections a user document can own — used to reconstruct the uid list. */
export const USER_SUBCOLLECTIONS = [
  'counterTasks',
  'defaultCounter',
  'pastes',
  'fuelTrips',
  'moneyTransactions',
];

function segmentsMatch(template: string[], actual: string[]): boolean {
  if (template.length !== actual.length) return false;
  return template.every((seg, i) => (seg.startsWith('{') ? true : seg === actual[i]));
}

/** Known child collections of a document path, e.g. 'users/abc' → its 5 subcollections. */
export function childCollectionsOf(docPath: string): string[] {
  const actual = docPath.split('/');
  const children: string[] = [];
  for (const template of COLLECTION_TEMPLATES) {
    const segs = template.split('/');
    if (segs.length < 3) continue; // top-level collection, has no parent doc
    if (segmentsMatch(segs.slice(0, -1), actual)) children.push(segs[segs.length - 1]);
  }
  return children;
}

// ============================================================
// Value formatting
// ============================================================

/** Firestore's own types don't survive JSON.stringify — spell them out instead. */
export function toPlain(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Timestamp) {
    return `${value.toDate().toISOString()}  (timestamp)`;
  }
  if (value instanceof GeoPoint) {
    return `${value.latitude}, ${value.longitude}  (geopoint)`;
  }
  if (value instanceof DocumentReference) {
    return `${value.path}  (reference)`;
  }
  if (value instanceof Bytes) {
    return `${value.toBase64().slice(0, 120)}…  (bytes)`;
  }
  if (Array.isArray(value)) return value.map(toPlain);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = toPlain(v);
    return out;
  }
  return value;
}

export interface AdminDoc {
  id: string;
  path: string;
  data: Record<string, unknown>;
  /** Present when the document itself is missing but subcollections live under it. */
  missing?: boolean;
}

function toAdminDoc(snap: QueryDocumentSnapshot<DocumentData>): AdminDoc {
  return {
    id: snap.id,
    path: snap.ref.path,
    data: toPlain(snap.data()) as Record<string, unknown>,
  };
}

export interface Page {
  docs: AdminDoc[];
  /** Opaque cursor for the next page — pass it straight back in. */
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

/** One page of a collection (odd number of path segments) in default id order. */
export async function loadCollection(
  path: string,
  pageSize: number,
  cursor: QueryDocumentSnapshot<DocumentData> | null,
): Promise<Page> {
  const base = collection(db, path);
  const q = cursor
    ? query(base, startAfter(cursor), qLimit(pageSize))
    : query(base, qLimit(pageSize));
  const snap = await getDocs(q);
  return {
    docs: snap.docs.map(toAdminDoc),
    cursor: snap.docs[snap.docs.length - 1] ?? null,
    hasMore: snap.docs.length === pageSize,
  };
}

/** One page of a collection-group query — the same subcollection under every parent. */
export async function loadGroup(
  groupId: string,
  pageSize: number,
  cursor: QueryDocumentSnapshot<DocumentData> | null,
): Promise<Page> {
  const base = collectionGroup(db, groupId);
  const q = cursor
    ? query(base, startAfter(cursor), qLimit(pageSize))
    : query(base, qLimit(pageSize));
  const snap = await getDocs(q);
  return {
    docs: snap.docs.map(toAdminDoc),
    cursor: snap.docs[snap.docs.length - 1] ?? null,
    hasMore: snap.docs.length === pageSize,
  };
}

/** A single document (even number of path segments). Missing docs come back flagged. */
export async function loadDoc(path: string): Promise<AdminDoc> {
  const snap = await getDoc(doc(db, path));
  if (!snap.exists()) return { id: snap.id, path, data: {}, missing: true };
  return { id: snap.id, path, data: toPlain(snap.data()) as Record<string, unknown> };
}

/**
 * Rebuilds the list of user ids by sweeping their subcollections.
 * A `users/{uid}` document is often never written — the app only creates docs
 * *under* it — and Firestore omits such phantom parents from a list query, so
 * the users collection can read as empty while holding plenty of data.
 */
export async function scanUserIds(perGroup = 300): Promise<string[]> {
  const ids = new Set<string>();
  await Promise.all(
    USER_SUBCOLLECTIONS.map(async (name) => {
      try {
        const snap = await getDocs(query(collectionGroup(db, name), qLimit(perGroup)));
        for (const d of snap.docs) {
          const segs = d.ref.path.split('/');
          if (segs[0] === 'users' && segs[1]) ids.add(segs[1]);
        }
      } catch {
        // A group with no documents (or no index yet) simply contributes nothing.
      }
    }),
  );
  return [...ids].sort();
}

/** Turns a raw path into something we can route on, or explains why we can't. */
export function classifyPath(path: string): 'collection' | 'document' | 'invalid' {
  const segs = path.split('/').filter(Boolean);
  if (segs.length === 0) return 'invalid';
  return segs.length % 2 === 1 ? 'collection' : 'document';
}

export { db };
