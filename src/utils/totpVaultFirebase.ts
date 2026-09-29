import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
} from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';
import { firebaseConfig } from './firebaseConfig';
import { normalizeSecret } from './totp';
import type { TotpAlgorithm } from './totp';

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

export interface TotpEntry {
  id: string;
  issuer: string;
  account: string;
  secret: string;
  digits: number;
  period: number;
  algorithm: TotpAlgorithm;
  createdAt: number;
}

export type NewTotpEntry = Omit<TotpEntry, 'id' | 'createdAt'>;

export const MAX_LABEL_LENGTH = 200;
export const MAX_SECRET_LENGTH = 256;

const entriesRef = (uid: string) => collection(db, 'users', uid, 'totpSecrets');

export const subscribeToTotpEntries = (
  uid: string,
  cb: (entries: TotpEntry[]) => void,
  onError?: (message: string) => void
): Unsubscribe =>
  onSnapshot(
    query(entriesRef(uid), orderBy('createdAt', 'desc')),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as TotpEntry))),
    err => {
      cb([]);
      onError?.(err.message);
    }
  );

export const addTotpEntry = async (uid: string, entry: NewTotpEntry): Promise<void> => {
  await addDoc(entriesRef(uid), {
    issuer: entry.issuer.trim().slice(0, MAX_LABEL_LENGTH),
    account: entry.account.trim().slice(0, MAX_LABEL_LENGTH),
    secret: normalizeSecret(entry.secret).slice(0, MAX_SECRET_LENGTH),
    digits: entry.digits,
    period: entry.period,
    algorithm: entry.algorithm,
    createdAt: Date.now(),
  });
};

// Only the labels are editable; the secret and code settings stay as scanned.
export const renameTotpEntry = (uid: string, id: string, issuer: string, account: string): Promise<void> =>
  updateDoc(doc(db, 'users', uid, 'totpSecrets', id), {
    issuer: issuer.trim().slice(0, MAX_LABEL_LENGTH),
    account: account.trim().slice(0, MAX_LABEL_LENGTH),
  });

export const deleteTotpEntry = (uid: string, id: string): Promise<void> =>
  deleteDoc(doc(db, 'users', uid, 'totpSecrets', id));
