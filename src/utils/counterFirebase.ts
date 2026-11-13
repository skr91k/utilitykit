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
  updateDoc,
  writeBatch
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
  order?: number; // manual sort position; tasks without it sort by createdAt (after ordered ones)
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

// Default adhkar tasks for new users (editable/deletable)
const DEFAULT_ADHKAR = [
  { name: 'أستغفر الله', targetCount: 100, countAtOnce: 1 },
  { name: 'اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ', targetCount: 100, countAtOnce: 1 },
  { name: 'لَا إِلٰهَ إِلَّا اللّٰهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ، وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ', targetCount: 100, countAtOnce: 1 },
];

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

    let hasActualTasks = false;
    snapshot.forEach((docSnap) => {
      // Skip the flag document
      if (docSnap.id === '_adhkarCreated') return;
      hasActualTasks = true;
      const data = docSnap.data() as Omit<CounterTask, 'id'>;
      tasks.push({ ...data, id: docSnap.id });
    });

    // Check if default adhkar were already created
    const adhkarCreated = await getDefaultAdhkarCreatedFlag(userId);

    if (!hasActualTasks && !adhkarCreated) {
      // First time user - create default adhkar
      const createdTasks = await createDefaultAdhkar(userId);
      tasks.push(...createdTasks);
      await setDefaultAdhkarCreatedFlag(userId);
    } else if (hasActualTasks && !adhkarCreated) {
      // Existing user with tasks but no flag - set the flag (migration)
      await setDefaultAdhkarCreatedFlag(userId);
    }

    // Manually ordered tasks use small indices (0..n); never-reordered and
    // newly created tasks fall back to createdAt, which sorts them after.
    return tasks.sort((a, b) => {
      if (a.isDefault) return -1;
      if (b.isDefault) return 1;
      return (a.order ?? a.createdAt) - (b.order ?? b.createdAt);
    });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return [DEFAULT_TASK];
  }
};

const getDefaultAdhkarCreatedFlag = async (userId: string): Promise<boolean> => {
  try {
    // Store flag in counterTasks collection as a special document (same rules as tasks)
    const flagRef = doc(firestore, 'users', userId, 'counterTasks', '_adhkarCreated');
    const snapshot = await getDoc(flagRef);
    return snapshot.exists() && snapshot.data()?.created === true;
  } catch (error) {
    console.error('Error getting adhkar flag:', error);
    return false;
  }
};

const setDefaultAdhkarCreatedFlag = async (userId: string): Promise<void> => {
  try {
    const flagRef = doc(firestore, 'users', userId, 'counterTasks', '_adhkarCreated');
    await setDoc(flagRef, { created: true, createdAt: Date.now(), isFlag: true });
  } catch (error) {
    console.error('Error setting adhkar flag:', error);
  }
};

const createDefaultAdhkar = async (userId: string): Promise<CounterTask[]> => {
  const createdTasks: CounterTask[] = [];
  const tasksRef = getUserTasksRef(userId);

  for (let i = 0; i < DEFAULT_ADHKAR.length; i++) {
    const adhkar = DEFAULT_ADHKAR[i];
    const newTaskRef = doc(tasksRef);
    const newTask: CounterTask = {
      id: newTaskRef.id,
      name: adhkar.name,
      targetCount: adhkar.targetCount,
      countAtOnce: adhkar.countAtOnce,
      isDefault: false,
      createdAt: Date.now() + i, // Offset to maintain order
    };

    await setDoc(newTaskRef, {
      name: newTask.name,
      targetCount: newTask.targetCount,
      countAtOnce: newTask.countAtOnce,
      isDefault: false,
      createdAt: newTask.createdAt,
    });

    createdTasks.push(newTask);
  }

  return createdTasks;
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

export const reorderTasks = async (userId: string, orderedIds: string[]): Promise<void> => {
  const batch = writeBatch(firestore);
  orderedIds.forEach((taskId, index) => {
    if (taskId === 'default') return;
    batch.update(doc(firestore, 'users', userId, 'counterTasks', taskId), { order: index });
  });
  await batch.commit();
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
