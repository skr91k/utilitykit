import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  addDoc,
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

export interface SavedPassword {
  id: string;
  password: string;
  website: string;
  username: string;
  createdAt: number;
}

export const MAX_FIELD_LENGTH = 200;
export const MAX_PASSWORD_LENGTH = 256;

const entriesRef = (uid: string) => collection(db, 'users', uid, 'savedPasswords');

export const subscribeToSavedPasswords = (
  uid: string,
  cb: (entries: SavedPassword[]) => void,
  onError?: (message: string) => void
): Unsubscribe =>
  onSnapshot(
    query(entriesRef(uid), orderBy('createdAt', 'desc')),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as SavedPassword))),
    err => {
      cb([]);
      onError?.(err.message);
    }
  );

export const savePassword = async (uid: string, password: string, website: string, username: string): Promise<void> => {
  await addDoc(entriesRef(uid), {
    password: password.slice(0, MAX_PASSWORD_LENGTH),
    website: website.trim().slice(0, MAX_FIELD_LENGTH),
    username: username.trim().slice(0, MAX_FIELD_LENGTH),
    createdAt: Date.now(),
  });
};

export const deleteSavedPassword = (uid: string, id: string): Promise<void> =>
  deleteDoc(doc(db, 'users', uid, 'savedPasswords', id));
