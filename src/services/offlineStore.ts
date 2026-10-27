import type {
  WorkoutSessionRecord,
  UserSettings,
  PlanVersion,
  BodyMetricRecord,
  SyncConflictRecord,
  LegacyArchiveRecord,
  CloudBackupSummary,
  ExerciseData,
  ExerciseImageRecord
} from '../types';

export interface QueuedMutation {
  mutationId: string;
  type: string;
  payload: any;
  deviceId: string;
  clientTimestamp: number;
}

export interface CachedUserWorkspace {
  settings: UserSettings;
  activePlan: PlanVersion | null;
  planVersions: PlanVersion[];
  sessions: WorkoutSessionRecord[];
  bodyMetrics: BodyMetricRecord[];
  conflicts: SyncConflictRecord[];
  legacyArchive: LegacyArchiveRecord[];
  cloudBackups: CloudBackupSummary[];
  updatedAt: number;
}

export interface CachedCatalog {
  exercises: ExerciseData[];
  publishedImages: ExerciseImageRecord[];
  authProviders?: { googleConfigured: boolean; smtpConfigured: boolean };
}

const DB_NAME = 'voxa_pwa_db_v1';
const STORE_KV = 'kv_store';

function openIdb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_KV)) {
          db.createObjectStore(STORE_KV);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openIdb();
  if (db) {
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_KV, 'readonly');
        const req = tx.objectStore(STORE_KV).get(key);
        req.onsuccess = () => resolve((req.result as T) ?? null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  try {
    const raw = localStorage.getItem(`voxa_kv_${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function idbSet<T>(key: string, val: T): Promise<void> {
  const db = await openIdb();
  if (db) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_KV, 'readwrite');
        tx.objectStore(STORE_KV).put(val, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
  try {
    localStorage.setItem(`voxa_kv_${key}`, JSON.stringify(val));
  } catch {
    // Quota fallback handled by IndexedDB above
  }
}

export async function idbRemove(key: string): Promise<void> {
  const db = await openIdb();
  if (db) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_KV, 'readwrite');
        tx.objectStore(STORE_KV).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
  try {
    localStorage.removeItem(`voxa_kv_${key}`);
  } catch {}
}

export function getOrCreateDeviceId(): string {
  try {
    let id = localStorage.getItem('voxa_device_id');
    if (!id) {
      id = 'dev_' + (crypto.randomUUID ? crypto.randomUUID().slice(0, 12) : Math.random().toString(36).slice(2, 12));
      localStorage.setItem('voxa_device_id', id);
    }
    return id;
  } catch {
    return 'dev_session';
  }
}

export function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function getMutationQueue(userId: string): Promise<QueuedMutation[]> {
  return (await idbGet<QueuedMutation[]>(`queue_${userId}`)) || [];
}

export async function enqueueMutation(userId: string, mut: Omit<QueuedMutation, 'mutationId' | 'clientTimestamp'>): Promise<QueuedMutation> {
  const full: QueuedMutation = {
    ...mut,
    mutationId: generateUuid(),
    clientTimestamp: Date.now()
  };
  const queue = await getMutationQueue(userId);
  queue.push(full);
  await idbSet(`queue_${userId}`, queue);
  return full;
}

export async function clearProcessedFromQueue(userId: string, processedIds: Set<string>): Promise<QueuedMutation[]> {
  const queue = await getMutationQueue(userId);
  const remaining = queue.filter((m) => !processedIds.has(m.mutationId));
  await idbSet(`queue_${userId}`, remaining);
  return remaining;
}

export async function wipeUserLocalCache(userId: string): Promise<void> {
  await idbRemove(`workspace_${userId}`);
  await idbRemove(`queue_${userId}`);
  try {
    localStorage.removeItem(`voxa_timer_${userId}`);
  } catch {}
}
