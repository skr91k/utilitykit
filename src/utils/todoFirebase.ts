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

export interface Todo {
  id: string;
  title: string;
  date: string;     // 'YYYY-MM-DD' in local time, '' = no date
  done: boolean;
  createdAt: number;
}

export const MAX_TITLE_LENGTH = 500;

const todosRef = (uid: string) => collection(db, 'users', uid, 'todos');
const todoDoc = (uid: string, id: string) => doc(db, 'users', uid, 'todos', id);

export const subscribeToTodos = (
  uid: string,
  cb: (todos: Todo[]) => void,
  onError?: (message: string) => void
): Unsubscribe =>
  onSnapshot(
    query(todosRef(uid), orderBy('createdAt', 'asc')),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() } as Todo))),
    err => {
      cb([]);
      onError?.(err.message);
    }
  );

export const addTodo = async (uid: string, title: string, date: string): Promise<void> => {
  await addDoc(todosRef(uid), {
    title: title.trim().slice(0, MAX_TITLE_LENGTH),
    date,
    done: false,
    createdAt: Date.now(),
  });
};

export const updateTodo = (uid: string, id: string, changes: Partial<Pick<Todo, 'title' | 'date' | 'done'>>): Promise<void> =>
  updateDoc(todoDoc(uid, id), {
    ...changes,
    ...(changes.title !== undefined && { title: changes.title.trim().slice(0, MAX_TITLE_LENGTH) }),
  });

export const deleteTodo = (uid: string, id: string): Promise<void> =>
  deleteDoc(todoDoc(uid, id));
