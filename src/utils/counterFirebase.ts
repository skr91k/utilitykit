import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  updateDoc
} from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';
import { firebaseConfig } from './firebaseConfig';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Initialize Firestore with offline persistence
const firestore = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

export interface CounterTask {
  id: string;
  name: string;
  targetCount: number | null; // null means indefinite
  countAtOnce: number;
  isDefault: boolean;
  createdAt: number;
}

export interface DayProgress {
  date: string; // YYYY-MM-DD format
  count: number;
  completed: boolean;
  lastUpdated: number;
}

export const DEFAULT_TASK: CounterTask = {
  id: 'default',
  name: 'Quick Count',
  targetCount: null,
  countAtOnce: 1,
  isDefault: true,
  createdAt: 0,
};

// Tasks CRUD
export const getUserTasksRef = (userId: string) =>
  collection(firestore, 'users', userId, 'counterTasks');

export const getTaskProgressRef = (userId: string, taskId: string) =>
  collection(firestore, 'users', userId, 'counterTasks', taskId, 'progress');

export const fetchUserTasks = async (userId: string): Promise<CounterTask[]> => {
  try {
    const tasksRef = getUserTasksRef(userId);
    const snapshot = await getDocs(tasksRef);
    const tasks: CounterTask[] = [DEFAULT_TASK];

    snapshot.forEach((doc) => {
      const data = doc.data() as Omit<CounterTask, 'id'>;
      tasks.push({ ...data, id: doc.id });
    });

    return tasks.sort((a, b) => {
      if (a.isDefault) return -1;
      if (b.isDefault) return 1;
      return a.createdAt - b.createdAt;
    });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return [DEFAULT_TASK];
  }
};

export const createTask = async (userId: string, task: Omit<CounterTask, 'id' | 'isDefault' | 'createdAt'>): Promise<CounterTask> => {
  const tasksRef = getUserTasksRef(userId);
  const newTaskRef = doc(tasksRef);
  const newTask: CounterTask = {
    ...task,
    id: newTaskRef.id,
    isDefault: false,
    createdAt: Date.now(),
  };

  await setDoc(newTaskRef, {
    name: newTask.name,
    targetCount: newTask.targetCount,
    countAtOnce: newTask.countAtOnce,
    isDefault: false,
    createdAt: newTask.createdAt,
  });

  return newTask;
};

export const updateTask = async (userId: string, taskId: string, updates: Partial<CounterTask>): Promise<void> => {
  if (taskId === 'default') return;
  const taskRef = doc(firestore, 'users', userId, 'counterTasks', taskId);
  await updateDoc(taskRef, updates);
};

export const deleteTask = async (userId: string, taskId: string): Promise<void> => {
  if (taskId === 'default') return;
  const taskRef = doc(firestore, 'users', userId, 'counterTasks', taskId);
  await deleteDoc(taskRef);
};

// Progress CRUD
export const fetchTaskProgress = async (userId: string, taskId: string, month: string): Promise<Record<string, DayProgress>> => {
  try {
    if (taskId === 'default') return {};

    const progressRef = getTaskProgressRef(userId, taskId);
    const snapshot = await getDocs(progressRef);
    const progress: Record<string, DayProgress> = {};

    snapshot.forEach((doc) => {
      const data = doc.data() as DayProgress;
      if (data.date.startsWith(month)) {
        progress[data.date] = data;
      }
    });

    return progress;
  } catch (error) {
    console.error('Error fetching progress:', error);
    return {};
  }
};

export const updateDayProgress = async (
  userId: string,
  taskId: string,
  date: string,
  count: number,
  completed: boolean
): Promise<void> => {
  if (taskId === 'default') return;

  const progressRef = doc(firestore, 'users', userId, 'counterTasks', taskId, 'progress', date);
  await setDoc(progressRef, {
    date,
    count,
    completed,
    lastUpdated: Date.now(),
  });
};

export const getDayProgress = async (userId: string, taskId: string, date: string): Promise<DayProgress | null> => {
  if (taskId === 'default') return null;

  try {
    const progressRef = doc(firestore, 'users', userId, 'counterTasks', taskId, 'progress', date);
    const snapshot = await getDoc(progressRef);

    if (snapshot.exists()) {
      return snapshot.data() as DayProgress;
    }
    return null;
  } catch (error) {
    console.error('Error getting day progress:', error);
    return null;
  }
};

// Default task count (no calendar, simple count stored in Firestore)
export const getDefaultTaskCount = async (userId: string): Promise<number> => {
  try {
    const countRef = doc(firestore, 'users', userId, 'defaultCounter', 'count');
    const snapshot = await getDoc(countRef);

    if (snapshot.exists()) {
      return snapshot.data().value || 0;
    }
    return 0;
  } catch (error) {
    console.error('Error getting default task count:', error);
    return 0;
  }
};

export const setDefaultTaskCount = async (userId: string, count: number): Promise<void> => {
  try {
    const countRef = doc(firestore, 'users', userId, 'defaultCounter', 'count');
    await setDoc(countRef, {
      value: count,
      lastUpdated: Date.now(),
    });
  } catch (error) {
    console.error('Error setting default task count:', error);
  }
};

export const resetDefaultTaskCount = async (userId: string): Promise<void> => {
  await setDefaultTaskCount(userId, 0);
};

export { firestore };
