import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  onSnapshot,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import type { CollectionReference, Unsubscribe } from 'firebase/firestore';
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

export interface Paste {
  id: string;
  title: string;
  content: string;
  author: string;
  createdAt: number;
  updatedAt: number;
  /** Present on private pastes the owner has published a read-only share link for. */
  shareToken?: string;
}

export type PasteScope = 'public' | 'private';

const PUBLIC_LIMIT = 200;

/**
 * A Firestore document may not exceed 1 MiB (1,048,576 bytes) including field
 * names, timestamps and index overhead. We budget the rest of the document
 * (title, author, two numbers, field names) and cap the content field below it.
 */
export const FIRESTORE_DOC_MAX_BYTES = 1_048_576;
export const MAX_TITLE_LENGTH = 200;
export const MAX_CONTENT_BYTES = 1_000_000;

const encoder = new TextEncoder();

export const byteLength = (str: string): number => encoder.encode(str).length;

/** Cut a string to at most `maxBytes` UTF-8 bytes without splitting a character. */
export const truncateToBytes = (str: string, maxBytes: number = MAX_CONTENT_BYTES): string => {
  if (byteLength(str) <= maxBytes) return str;
  let low = 0;
  let high = str.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (byteLength(str.slice(0, mid)) <= maxBytes) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return str.slice(0, low);
};

const pastesRef = (scope: PasteScope, uid?: string | null): CollectionReference => {
  if (scope === 'private') {
    if (!uid) throw new Error('Sign in required for private pastes');
    return collection(db, 'users', uid, 'pastes');
  }
  return collection(db, 'publicPastes');
};

export const subscribeToPastes = (
  scope: PasteScope,
  uid: string | null,
  cb: (pastes: Paste[]) => void,
  onError?: (message: string) => void
): Unsubscribe => {
  return onSnapshot(
    query(pastesRef(scope, uid), orderBy('createdAt', 'desc'), limit(PUBLIC_LIMIT)),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as Paste))),
    err => {
      cb([]);
      onError?.(err.message);
    }
  );
};

export const createPaste = async (
  scope: PasteScope,
  uid: string | null,
  title: string,
  content: string,
  author: string
): Promise<string> => {
  const now = Date.now();
  const ref = await addDoc(pastesRef(scope, uid), {
    title: title.trim().slice(0, MAX_TITLE_LENGTH),
    content: truncateToBytes(content),
    author,
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
};

export const updatePaste = async (
  scope: PasteScope,
  uid: string | null,
  pasteId: string,
  title: string,
  content: string,
  shareToken?: string
): Promise<void> => {
  const cleanTitle = title.trim().slice(0, MAX_TITLE_LENGTH);
  const cleanContent = truncateToBytes(content);
  const updatedAt = Date.now();

  await updateDoc(doc(pastesRef(scope, uid), pasteId), {
    title: cleanTitle,
    content: cleanContent,
    updatedAt,
  });

  // Keep a published share link in sync with the paste it was made from.
  if (shareToken) {
    await updateDoc(doc(db, 'sharedPastes', shareToken), {
      title: cleanTitle,
      content: cleanContent,
      updatedAt,
    });
  }
};

export const deletePaste = async (
  scope: PasteScope,
  uid: string | null,
  pasteId: string,
  shareToken?: string
): Promise<void> => {
  // Revoke the share link first so a deleted paste can never outlive it.
  if (shareToken) {
    await deleteDoc(doc(db, 'sharedPastes', shareToken));
  }
  await deleteDoc(doc(pastesRef(scope, uid), pasteId));
};

// ============================================================
// SHARING
//
// Public pastes are world-readable, so their share link points straight at the
// document. Private pastes are owner-only by security rule, so sharing one
// publishes a read-only copy under an unguessable token that anyone with the
// link can read.
// ============================================================

export interface SharedPaste {
  title: string;
  content: string;
  author: string;
  ownerUid: string;
  createdAt: number;
  updatedAt: number;
}

export const generateShareToken = (): string => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
};

/** Publishes (or refreshes) the read-only copy of a private paste. Returns its token. */
export const sharePrivatePaste = async (uid: string, paste: Paste): Promise<string> => {
  const token = paste.shareToken || generateShareToken();
  await setDoc(doc(db, 'sharedPastes', token), {
    title: paste.title || '',
    content: truncateToBytes(paste.content),
    author: paste.author || '',
    ownerUid: uid,
    createdAt: paste.createdAt,
    updatedAt: Date.now(),
  });
  if (paste.shareToken !== token) {
    await updateDoc(doc(db, 'users', uid, 'pastes', paste.id), { shareToken: token });
  }
  return token;
};

/** Revokes a share link; the private paste itself is left untouched. */
export const unsharePrivatePaste = async (uid: string, pasteId: string, token: string): Promise<void> => {
  await deleteDoc(doc(db, 'sharedPastes', token));
  await updateDoc(doc(db, 'users', uid, 'pastes', pasteId), { shareToken: deleteField() });
};

export const getPublicPaste = async (pasteId: string): Promise<Paste | null> => {
  const snap = await getDoc(doc(db, 'publicPastes', pasteId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Paste) : null;
};

export const getSharedPaste = async (token: string): Promise<SharedPaste | null> => {
  const snap = await getDoc(doc(db, 'sharedPastes', token));
  return snap.exists() ? (snap.data() as SharedPaste) : null;
};

/** Absolute URL to hand to someone else. */
export const buildShareUrl = (scope: PasteScope, idOrToken: string): string =>
  `${window.location.origin}/paste/${scope === 'public' ? 'p' : 's'}/${idOrToken}`;
