import {
  initializeFirestore,
  getFirestore,
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
} from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';
import { firebaseConfig } from './firebaseConfig';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Enable offline persistence. If already initialized (by counterFirebase.ts), fall back to getFirestore.
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

export interface ExpenseSplit {
  personName: string;
  amount: number;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  paidBy: string;
  splits: ExpenseSplit[];
  createdAt: number;
  updatedAt: number;
}

export interface AuditEntry {
  id: string;
  action: string;
  description: string;
  timestamp: number;
}

export interface SplitBook {
  id: string;
  name: string;
  persons: string[];
  createdAt: number;
}

export interface Settlement {
  from: string;
  to: string;
  amount: number;
}

export const generateBookId = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

export const createBook = async (name: string): Promise<string> => {
  const bookId = generateBookId();
  await setDoc(doc(db, 'splitBooks', bookId), {
    name: name.trim() || 'My Expense Book',
    persons: [],
    createdAt: Date.now(),
  });
  return bookId;
};

export const updateBookName = async (bookId: string, name: string): Promise<void> => {
  await updateDoc(doc(db, 'splitBooks', bookId), { name });
};

export const addPersonToBook = async (bookId: string, currentPersons: string[], newPerson: string): Promise<void> => {
  await updateDoc(doc(db, 'splitBooks', bookId), { persons: [...currentPersons, newPerson.trim()] });
};

export const removePersonFromBook = async (bookId: string, currentPersons: string[], personName: string): Promise<void> => {
  await updateDoc(doc(db, 'splitBooks', bookId), { persons: currentPersons.filter(p => p !== personName) });
};

export const saveExpense = async (bookId: string, expense: Omit<Expense, 'id'>, existingId?: string): Promise<string> => {
  if (existingId) {
    await updateDoc(doc(db, 'splitBooks', bookId, 'expenses', existingId), { ...expense });
    return existingId;
  }
  const ref = await addDoc(collection(db, 'splitBooks', bookId, 'expenses'), expense);
  return ref.id;
};

export const deleteExpense = async (bookId: string, expenseId: string): Promise<void> => {
  await deleteDoc(doc(db, 'splitBooks', bookId, 'expenses', expenseId));
};

export const addAuditEntry = async (bookId: string, action: string, description: string): Promise<void> => {
  await addDoc(collection(db, 'splitBooks', bookId, 'auditLog'), {
    action,
    description,
    timestamp: Date.now(),
  });
};

export const subscribeToBook = (bookId: string, cb: (book: SplitBook | null) => void): Unsubscribe =>
  onSnapshot(doc(db, 'splitBooks', bookId), snap => {
    cb(snap.exists() ? ({ id: bookId, ...snap.data() } as SplitBook) : null);
  }, () => cb(null));

export const subscribeToExpenses = (bookId: string, cb: (expenses: Expense[]) => void): Unsubscribe =>
  onSnapshot(
    query(collection(db, 'splitBooks', bookId, 'expenses'), orderBy('createdAt', 'desc')),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as Expense))),
    () => cb([])
  );

export const subscribeToAuditLog = (bookId: string, cb: (entries: AuditEntry[]) => void): Unsubscribe =>
  onSnapshot(
    query(collection(db, 'splitBooks', bookId, 'auditLog'), orderBy('timestamp', 'desc')),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as AuditEntry))),
    () => cb([])
  );

export function calculateSettlements(persons: string[], expenses: Expense[]) {
  const paid: Record<string, number> = {};
  const owed: Record<string, number> = {};
  persons.forEach(p => { paid[p] = 0; owed[p] = 0; });

  expenses.forEach(exp => {
    if (paid[exp.paidBy] !== undefined) paid[exp.paidBy] += exp.amount;
    exp.splits.forEach(s => {
      if (owed[s.personName] !== undefined) owed[s.personName] += s.amount;
    });
  });

  const balance: Record<string, number> = {};
  persons.forEach(p => { balance[p] = (paid[p] || 0) - (owed[p] || 0); });

  const debtors = persons
    .filter(p => balance[p] < -0.005)
    .map(p => ({ name: p, amount: Math.abs(balance[p]) }))
    .sort((a, b) => b.amount - a.amount);

  const creditors = persons
    .filter(p => balance[p] > 0.005)
    .map(p => ({ name: p, amount: balance[p] }))
    .sort((a, b) => b.amount - a.amount);

  const settlements: Settlement[] = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const settle = Math.min(debtors[i].amount, creditors[j].amount);
    if (settle > 0.005) {
      settlements.push({ from: debtors[i].name, to: creditors[j].name, amount: Math.round(settle * 100) / 100 });
    }
    debtors[i].amount -= settle;
    creditors[j].amount -= settle;
    if (debtors[i].amount < 0.005) i++;
    if (creditors[j].amount < 0.005) j++;
  }

  return { paid, owed, balance, settlements };
}
