import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
} from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';
import { firebaseConfig } from './firebaseConfig';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Enable offline persistence. If already initialized (by another util), fall back to getFirestore.
let db: ReturnType<typeof getFirestore>;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
} catch {
  db = getFirestore(app);
}

export interface Bookmark {
  id: string;
  url: string;
  title: string;
  createdAt: number;
}

export const MAX_URL_LENGTH = 2048;
export const MAX_TITLE_LENGTH = 500;

const bookmarksRef = (uid: string) => collection(db, 'users', uid, 'bookmarks');
const bookmarkDoc = (uid: string, id: string) => doc(db, 'users', uid, 'bookmarks', id);

// 'example.com/x' -> 'https://example.com/x'; null when it isn't an http(s) link
export const normalizeUrl = (raw: string): string | null => {
  const s = raw.trim();
  if (!s || /\s/.test(s)) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : 'https://' + s);
    if ((u.protocol !== 'http:' && u.protocol !== 'https:') || !u.hostname.includes('.')) return null;
    return u.href.length <= MAX_URL_LENGTH ? u.href : null;
  } catch {
    return null;
  }
};

export const hostOf = (url: string) => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
};

// Google's favicon service: a plain <img>, so no CORS involved.
export const faviconOf = (url: string) =>
  `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostOf(url))}&sz=64`;

// A browser can't read another site's HTML (CORS), so the page title comes from microlink.io's
// free CORS-enabled API — best effort: null when it fails, is rate-limited or times out.
export const fetchTitle = async (url: string): Promise<string | null> => {
  try {
    const r = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(8000) });
    const j = await r.json();
    const t = typeof j?.data?.title === 'string' ? j.data.title.trim() : '';
    return j?.status === 'success' && t ? t.slice(0, MAX_TITLE_LENGTH) : null;
  } catch {
    return null;
  }
};

export const subscribeToBookmarks = (
  uid: string,
  cb: (bookmarks: Bookmark[]) => void,
  onError?: (message: string) => void
): Unsubscribe =>
  onSnapshot(
    query(bookmarksRef(uid), orderBy('createdAt', 'desc')),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as Bookmark))),
    err => {
      cb([]);
      onError?.(err.message);
    }
  );

// The id is known before the write lands, so the fetched title can be saved onto it straight away.
export const addBookmark = (uid: string, url: string, title: string): { id: string; saved: Promise<void> } => {
  const ref = doc(bookmarksRef(uid));
  return {
    id: ref.id,
    saved: setDoc(ref, { url, title: title.trim().slice(0, MAX_TITLE_LENGTH), createdAt: Date.now() }),
  };
};

export const updateBookmark = (uid: string, id: string, changes: Partial<Pick<Bookmark, 'title' | 'url'>>): Promise<void> =>
  updateDoc(bookmarkDoc(uid, id), {
    ...changes,
    ...(changes.title !== undefined && { title: changes.title.trim().slice(0, MAX_TITLE_LENGTH) }),
  });

export const deleteBookmark = (uid: string, id: string): Promise<void> =>
  deleteDoc(bookmarkDoc(uid, id));
