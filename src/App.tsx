import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Home,
  Calendar,
  Dumbbell,
  BookOpen,
  TrendingUp,
  Settings,
  Globe,
  RefreshCw,
  Timer as TimerIcon,
  LogIn
} from 'lucide-react';
import type {
  BodyMetricRecord,
  CloudBackupSummary,
  ExerciseData,
  ExerciseImageRecord,
  Lang,
  LegacyArchiveRecord,
  PlanDay,
  PlanVersion,
  ScheduleMode,
  SessionExerciseRecord,
  SyncConflictRecord,
  SyncState,
  UserProfile,
  UserSettings,
  WorkoutSessionRecord,
  WorkoutSetRecord
} from './types';
import { SEED_EXERCISES } from './data/seedExercises';
import { DEFAULT_UPPER_LOWER_DAYS } from './data/defaultPlan';
import { TRANSLATIONS } from './i18n/translations';
import {
  CachedUserWorkspace,
  clearProcessedFromQueue,
  enqueueMutation,
  generateUuid,
  getMutationQueue,
  getOrCreateDeviceId,
  idbGet,
  idbRemove,
  idbSet,
  wipeUserLocalCache
} from './services/offlineStore';
import { VoxaLogo } from './components/VoxaLogo';
import { ExerciseDetailModal } from './components/ExerciseDetailModal';
import { AuthWelcomeView } from './views/AuthWelcomeView';
import { DashboardView } from './views/DashboardView';
import { PlanView } from './views/PlanView';
import { WorkoutView } from './views/WorkoutView';
import { LibraryMusclesView } from './views/LibraryMusclesView';
import { ProgressView } from './views/ProgressView';
import { SettingsArchiveView } from './views/SettingsArchiveView';

type TabId = 'dashboard' | 'plan' | 'workout' | 'library' | 'progress' | 'settings';

const DEFAULT_GUEST_SETTINGS: UserSettings = {
  language: 'ar',
  weightUnit: 'kg',
  lengthUnit: 'cm',
  defaultRestSec: 90,
  autoStartRest: true,
  hideWarmupInVolume: true,
  scheduleMode: 'flexible',
  sequencePointer: 0,
  restDays: [5],
  reminderEnabled: false,
  reminderTime: '18:00',
  goal: '',
  experience: 'intermediate',
  favorites: [],
  version: 1,
  updatedAt: new Date().toISOString()
};

function playRestChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(784, ctx.currentTime);
    osc.frequency.setValueAtTime(1046.5, ctx.currentTime + 0.14);
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.46);
  } catch {}
}

export const App: React.FC = () => {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem('voxa_auth_token');
    } catch {
      return null;
    }
  });
  const [sandboxVerifyToken, setSandboxVerifyToken] = useState<string | undefined>();
  const [isGuestPreview, setIsGuestPreview] = useState(false);
  const [guestLang, setGuestLang] = useState<Lang>('ar');

  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [detailExerciseId, setDetailExerciseId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Catalog
  const [exercises, setExercises] = useState<ExerciseData[]>(SEED_EXERCISES);
  const [publishedImages, setPublishedImages] = useState<ExerciseImageRecord[]>([]);
  const [googleConfigured, setGoogleConfigured] = useState(false);

  // Authenticated User Workspace State
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_GUEST_SETTINGS);
  const [activePlan, setActivePlan] = useState<PlanVersion | null>(null);
  const [planVersions, setPlanVersions] = useState<PlanVersion[]>([]);
  const [sessions, setSessions] = useState<WorkoutSessionRecord[]>([]);
  const [bodyMetrics, setBodyMetrics] = useState<BodyMetricRecord[]>([]);
  const [conflicts, setConflicts] = useState<SyncConflictRecord[]>([]);
  const [legacyArchive, setLegacyArchive] = useState<LegacyArchiveRecord[]>([]);
  const [cloudBackups, setCloudBackups] = useState<CloudBackupSummary[]>([]);

  const [syncState, setSyncState] = useState<SyncState>('synced');
  const [pendingQueueCount, setPendingQueueCount] = useState(0);
  const syncingRef = useRef(false);
  const deviceId = useMemo(() => getOrCreateDeviceId(), []);

  // Persistent Rest Timer state (based on saved `endsAt` timestamp)
  const [restTimer, setRestTimer] = useState<{
    active: boolean;
    paused: boolean;
    endsAt: number | null;
    pausedRemainingSec: number;
    displaySec: number;
  }>({
    active: false,
    paused: false,
    endsAt: null,
    pausedRemainingSec: 0,
    displaySec: 0
  });

  const lang: Lang = user ? settings.language : guestLang;
  const t = TRANSLATIONS[lang];

  const exercisesMap = useMemo(
    () => Object.fromEntries(exercises.map((e) => [e.id, e])),
    [exercises]
  );

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((cur) => (cur === msg ? null : cur));
    }, 3000);
  }, []);

  // Synchronize HTML dir & lang across entire document whenever language changes
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.title =
      lang === 'ar' ? 'VOXA — منظومة التدريب الذكية' : 'VOXA — Intelligent Strength System';
  }, [lang]);

  // Warn before accidental tab closure if user has unsynced pending mutations in an active session
  useEffect(() => {
    const hasActive = sessions.some((s) => s.status === 'active' || s.status === 'paused');
    const handler = (e: BeforeUnloadEvent) => {
      if (hasActive && pendingQueueCount > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [sessions, pendingQueueCount]);

  // Persist workspace snapshot locally in IndexedDB
  const persistLocalWorkspace = useCallback(
    async (
      uid: string,
      patch: Partial<CachedUserWorkspace>,
      currentBase?: Partial<CachedUserWorkspace>
    ) => {
      const existing = (await idbGet<CachedUserWorkspace>(`workspace_${uid}`)) || {
        settings: currentBase?.settings || settings,
        activePlan: currentBase?.activePlan ?? activePlan,
        planVersions: currentBase?.planVersions || planVersions,
        sessions: currentBase?.sessions || sessions,
        bodyMetrics: currentBase?.bodyMetrics || bodyMetrics,
        conflicts: currentBase?.conflicts || conflicts,
        legacyArchive: currentBase?.legacyArchive || legacyArchive,
        cloudBackups: currentBase?.cloudBackups || cloudBackups,
        updatedAt: Date.now()
      };
      const merged: CachedUserWorkspace = {
        ...existing,
        ...patch,
        updatedAt: Date.now()
      };
      await idbSet(`workspace_${uid}`, merged);
    },
    [settings, activePlan, planVersions, sessions, bodyMetrics, conflicts, legacyArchive, cloudBackups]
  );

  const applyServerState = useCallback(
    async (uid: string, data: any) => {
      if (data.user) setUser(data.user);
      if (data.settings) setSettings(data.settings);
      if (data.activePlan !== undefined) setActivePlan(data.activePlan);
      if (data.planVersions) setPlanVersions(data.planVersions);
      if (data.sessions) setSessions(data.sessions);
      if (data.bodyMetrics) setBodyMetrics(data.bodyMetrics);
      if (data.conflicts) setConflicts(data.conflicts);
      if (data.legacyArchive) setLegacyArchive(data.legacyArchive);
      if (data.cloudBackups) setCloudBackups(data.cloudBackups);
      if (data.catalog) {
        if (data.catalog.exercises?.length) setExercises(data.catalog.exercises);
        if (data.catalog.publishedImages) setPublishedImages(data.catalog.publishedImages);
        if (data.catalog.authProviders) {
          setGoogleConfigured(Boolean(data.catalog.authProviders.googleConfigured));
        }
      }

      await idbSet<CachedUserWorkspace>(`workspace_${uid}`, {
        settings: data.settings || settings,
        activePlan: data.activePlan ?? activePlan,
        planVersions: data.planVersions || planVersions,
        sessions: data.sessions || sessions,
        bodyMetrics: data.bodyMetrics || bodyMetrics,
        conflicts: data.conflicts || conflicts,
        legacyArchive: data.legacyArchive || legacyArchive,
        cloudBackups: data.cloudBackups || cloudBackups,
        updatedAt: Date.now()
      });

      const openC = (data.conflicts || []).filter((c: SyncConflictRecord) => c.status === 'open').length;
      if (openC > 0) setSyncState('conflict');
    },
    [settings, activePlan, planVersions, sessions, bodyMetrics, conflicts, legacyArchive, cloudBackups]
  );

  // Flush queued mutations idempotently to server
  const flushSyncQueue = useCallback(
    async (uidOverride?: string, tokenOverride?: string | null) => {
      const uid = uidOverride || user?.id;
      const tok = tokenOverride !== undefined ? tokenOverride : authToken;
      if (!uid || syncingRef.current) return;

      const queue = await getMutationQueue(uid);
      setPendingQueueCount(queue.length);

      if (!navigator.onLine) {
        setSyncState(queue.length > 0 ? 'offline' : 'saved_local');
        return;
      }

      if (queue.length === 0) {
        return;
      }

      syncingRef.current = true;
      setSyncState('pending_sync');

      try {
        const res = await fetch('/api/sync/push', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(tok ? { Authorization: `Bearer ${tok}` } : {})
          },
          body: JSON.stringify({ mutations: queue })
        });

        if (!res.ok) {
          setSyncState('failed');
          syncingRef.current = false;
          return;
        }

        const out = await res.json();
        const processedIds = new Set<string>(
          (out.results || [])
            .filter((r: any) => r.status !== 'error')
            .map((r: any) => String(r.mutationId))
        );

        const rem = await clearProcessedFromQueue(uid, processedIds);
        setPendingQueueCount(rem.length);

        if (out.state) {
          await applyServerState(uid, out.state);
        }

        const anyConflict =
          (out.results || []).some((r: any) => r.status === 'conflict') ||
          (out.state?.conflicts || []).some((c: SyncConflictRecord) => c.status === 'open');

        if (anyConflict) {
          setSyncState('conflict');
        } else if (rem.length > 0) {
          setSyncState('failed');
        } else {
          setSyncState('synced');
        }
      } catch {
        setSyncState(navigator.onLine ? 'failed' : 'offline');
      } finally {
        syncingRef.current = false;
      }
    },
    [user?.id, authToken, applyServerState]
  );

  const refreshServerState = useCallback(
    async (uidOverride?: string, tokenOverride?: string | null) => {
      const uid = uidOverride || user?.id;
      const tok = tokenOverride !== undefined ? tokenOverride : authToken;
      if (!uid) return;
      await flushSyncQueue(uid, tok);
      try {
        const res = await fetch('/api/state', {
          headers: tok ? { Authorization: `Bearer ${tok}` } : {}
        });
        if (res.ok) {
          const data = await res.json();
          await applyServerState(uid, data);
          const q = await getMutationQueue(uid);
          const hasOpen = (data.conflicts || []).some((c: SyncConflictRecord) => c.status === 'open');
          setSyncState(hasOpen ? 'conflict' : q.length > 0 ? 'pending_sync' : 'synced');
        }
      } catch {
        setSyncState('offline');
      }
    },
    [user?.id, authToken, flushSyncQueue, applyServerState]
  );

  // Initial Boot: Load Catalog + Restore Authenticated User Directly to Dashboard
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const catRes = await fetch('/api/public/catalog');
        if (catRes.ok) {
          const cat = await catRes.json();
          if (!cancelled) {
            if (cat.exercises?.length) setExercises(cat.exercises);
            if (cat.publishedImages) setPublishedImages(cat.publishedImages);
            setGoogleConfigured(Boolean(cat.authProviders?.googleConfigured));
          }
          await idbSet('public_catalog', cat);
        }
      } catch {
        const cachedCat = await idbGet<any>('public_catalog');
        if (cachedCat && !cancelled) {
          if (cachedCat.exercises?.length) setExercises(cachedCat.exercises);
          if (cachedCat.publishedImages) setPublishedImages(cachedCat.publishedImages);
        }
      }

      // Check authenticated session
      try {
        const meRes = await fetch('/api/auth/me', {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
        });
        if (meRes.ok) {
          const meData = await meRes.json();
          const u = meData.user as UserProfile;
          if (!cancelled) {
            setUser(u);
            await idbSet('cached_user_profile', u);
          }
          // Load local cached workspace first for instant resilience, then sync
          const localWs = await idbGet<CachedUserWorkspace>(`workspace_${u.id}`);
          if (localWs && !cancelled) {
            setSettings(localWs.settings);
            setActivePlan(localWs.activePlan);
            setPlanVersions(localWs.planVersions);
            setSessions(localWs.sessions);
            setBodyMetrics(localWs.bodyMetrics);
            setConflicts(localWs.conflicts);
            setLegacyArchive(localWs.legacyArchive);
            setCloudBackups(localWs.cloudBackups);
          }
          await refreshServerState(u.id, authToken);
        } else {
          await idbRemove('cached_user_profile');
          try {
            localStorage.removeItem('voxa_auth_token');
          } catch {}
          if (!cancelled) setAuthToken(null);
        }
      } catch {
        // Offline boot fallback: restore cached authenticated user & IndexedDB workspace!
        const cachedProfile = await idbGet<UserProfile>('cached_user_profile');
        if (cachedProfile && !cancelled) {
          setUser(cachedProfile);
          const localWs = await idbGet<CachedUserWorkspace>(`workspace_${cachedProfile.id}`);
          if (localWs) {
            setSettings(localWs.settings);
            setActivePlan(localWs.activePlan);
            setPlanVersions(localWs.planVersions);
            setSessions(localWs.sessions);
            setBodyMetrics(localWs.bodyMetrics);
            setConflicts(localWs.conflicts);
            setLegacyArchive(localWs.legacyArchive);
            setCloudBackups(localWs.cloudBackups);
          }
          setSyncState('offline');
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Online / Offline event listeners
  useEffect(() => {
    const onOnline = () => {
      if (user) flushSyncQueue(user.id, authToken);
    };
    const onOffline = () => {
      setSyncState('offline');
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [user, authToken, flushSyncQueue]);

  // Restore Persistent Rest Timer via `endsAt` when user changes or loads
  const timerStorageKey = `voxa_timer_${user?.id || 'guest'}`;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(timerStorageKey);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.paused && saved.pausedRemainingSec > 0) {
        setRestTimer({
          active: true,
          paused: true,
          endsAt: null,
          pausedRemainingSec: saved.pausedRemainingSec,
          displaySec: saved.pausedRemainingSec
        });
      } else if (saved.endsAt && saved.endsAt > Date.now()) {
        const rem = Math.ceil((saved.endsAt - Date.now()) / 1000);
        setRestTimer({
          active: true,
          paused: false,
          endsAt: saved.endsAt,
          pausedRemainingSec: 0,
          displaySec: rem
        });
      } else {
        localStorage.removeItem(timerStorageKey);
      }
    } catch {}
  }, [timerStorageKey]);

  // Rest Timer Tick Interval
  useEffect(() => {
    if (!restTimer.active || restTimer.paused || !restTimer.endsAt) return;
    const id = setInterval(() => {
      const rem = Math.max(0, Math.ceil((restTimer.endsAt! - Date.now()) / 1000));
      if (rem <= 0) {
        localStorage.removeItem(timerStorageKey);
        setRestTimer({ active: false, paused: false, endsAt: null, pausedRemainingSec: 0, displaySec: 0 });
        playRestChime();
        showToast(t.timer.finishedToast);
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          try {
            new Notification('VOXA', { body: t.timer.finishedToast });
          } catch {}
        }
      } else {
        setRestTimer((prev) => ({ ...prev, displaySec: rem }));
      }
    }, 250);
    return () => clearInterval(id);
  }, [restTimer.active, restTimer.paused, restTimer.endsAt, timerStorageKey, t.timer.finishedToast, showToast]);

  function startRestTimer(sec: number) {
    const endsAt = Date.now() + sec * 1000;
    try {
      localStorage.setItem(timerStorageKey, JSON.stringify({ endsAt, paused: false, pausedRemainingSec: 0 }));
    } catch {}
    setRestTimer({
      active: true,
      paused: false,
      endsAt,
      pausedRemainingSec: 0,
      displaySec: sec
    });
  }

  function adjustRestTimer(deltaSec: number) {
    setRestTimer((prev) => {
      if (!prev.active) return prev;
      if (prev.paused) {
        const nextRem = Math.max(5, prev.pausedRemainingSec + deltaSec);
        try {
          localStorage.setItem(
            timerStorageKey,
            JSON.stringify({ endsAt: null, paused: true, pausedRemainingSec: nextRem })
          );
        } catch {}
        return { ...prev, pausedRemainingSec: nextRem, displaySec: nextRem };
      } else if (prev.endsAt) {
        const nextEnds = Math.max(Date.now() + 5000, prev.endsAt + deltaSec * 1000);
        const nextRem = Math.ceil((nextEnds - Date.now()) / 1000);
        try {
          localStorage.setItem(
            timerStorageKey,
            JSON.stringify({ endsAt: nextEnds, paused: false, pausedRemainingSec: 0 })
          );
        } catch {}
        return { ...prev, endsAt: nextEnds, displaySec: nextRem };
      }
      return prev;
    });
  }

  function togglePauseRestTimer() {
    setRestTimer((prev) => {
      if (!prev.active) return prev;
      if (!prev.paused && prev.endsAt) {
        const rem = Math.max(1, Math.ceil((prev.endsAt - Date.now()) / 1000));
        try {
          localStorage.setItem(
            timerStorageKey,
            JSON.stringify({ endsAt: null, paused: true, pausedRemainingSec: rem })
          );
        } catch {}
        return { active: true, paused: true, endsAt: null, pausedRemainingSec: rem, displaySec: rem };
      } else {
        const endsAt = Date.now() + prev.pausedRemainingSec * 1000;
        try {
          localStorage.setItem(
            timerStorageKey,
            JSON.stringify({ endsAt, paused: false, pausedRemainingSec: 0 })
          );
        } catch {}
        return {
          active: true,
          paused: false,
          endsAt,
          pausedRemainingSec: 0,
          displaySec: prev.pausedRemainingSec
        };
      }
    });
  }

  function stopRestTimer() {
    try {
      localStorage.removeItem(timerStorageKey);
    } catch {}
    setRestTimer({ active: false, paused: false, endsAt: null, pausedRemainingSec: 0, displaySec: 0 });
  }

  // Helper: Optimistic Local Update + Enqueue Idempotent Mutation + Trigger Sync
  async function commitMutation(type: string, payload: any, optimisticPatch: Partial<CachedUserWorkspace>) {
    if (!user) return;
    setSyncState('saved_local');
    await persistLocalWorkspace(user.id, optimisticPatch);
    await enqueueMutation(user.id, { type, payload, deviceId });
    const q = await getMutationQueue(user.id);
    setPendingQueueCount(q.length);
    flushSyncQueue(user.id, authToken);
  }

  // ==================== WORKOUT & USER ACTIONS ====================
  async function handleStartDaySession(day: PlanDay, seqIdx: number) {
    if (!user) {
      setIsGuestPreview(false);
      return;
    }
    const existingActive = sessions.find((s) => s.status === 'active' || s.status === 'paused');
    if (existingActive) {
      setActiveTab('workout');
      return;
    }

    const sessionId = generateUuid();
    const nowIso = new Date().toISOString();
    const exBlocks: SessionExerciseRecord[] = day.items.map((item, idx) => {
      const blockId = generateUuid();
      const sets: WorkoutSetRecord[] = Array.from({ length: item.sets }, (_, sIdx) => ({
        id: generateUuid(),
        sessionId,
        sessionExerciseId: blockId,
        exerciseId: item.exerciseId,
        setIndex: sIdx,
        setType: 'working',
        weightKg: null,
        enteredUnit: settings.weightUnit,
        reps: null,
        rir: null,
        done: false,
        completedAt: null,
        version: 1,
        lastDeviceId: deviceId,
        updatedAt: nowIso
      }));
      return {
        id: blockId,
        sessionId,
        orderIndex: idx,
        exerciseId: item.exerciseId,
        targetSets: item.sets,
        targetReps: item.reps,
        restSec: item.rest,
        substitutedFromExerciseId: null,
        substitutionReason: null,
        substitutedAt: null,
        notes: '',
        sets
      };
    });

    const newSession: WorkoutSessionRecord = {
      id: sessionId,
      planVersionId: activePlan?.id || null,
      dayKey: day.key,
      sequenceIndex: seqIdx,
      name_ar: day.name_ar,
      name_en: day.name_en,
      focus_ar: day.focus_ar,
      focus_en: day.focus_en,
      status: 'active',
      restOverrideSec: null,
      startedAt: Date.now(),
      pausedAt: null,
      accumulatedPauseMs: 0,
      endedAt: null,
      notes: '',
      version: 1,
      lastDeviceId: deviceId,
      updatedAt: nowIso,
      exercises: exBlocks
    };

    const nextSessions = [newSession, ...sessions];
    setSessions(nextSessions);
    setActiveTab('workout');
    await commitMutation('START_SESSION', { session: newSession }, { sessions: nextSessions });
  }

  async function handleUpsertSet(
    sessionExerciseId: string,
    updatedSet: WorkoutSetRecord,
    triggerRestSec?: number
  ) {
    if (!user) return;
    const baseVersion = updatedSet.version || 1;
    const stamped: WorkoutSetRecord = {
      ...updatedSet,
      lastDeviceId: deviceId,
      updatedAt: new Date().toISOString()
    };

    const nextSessions = sessions.map((s) => {
      if (s.id !== stamped.sessionId) return s;
      return {
        ...s,
        exercises: s.exercises.map((eb) => {
          if (eb.id !== sessionExerciseId) return eb;
          const exists = eb.sets.some((x) => x.id === stamped.id);
          return {
            ...eb,
            sets: exists
              ? eb.sets.map((x) => (x.id === stamped.id ? stamped : x))
              : [...eb.sets, stamped]
          };
        })
      };
    });

    setSessions(nextSessions);
    if (triggerRestSec && triggerRestSec > 0) {
      startRestTimer(triggerRestSec);
    }

    await commitMutation(
      'UPSERT_SET',
      { set: stamped, baseVersion },
      { sessions: nextSessions }
    );
  }

  async function handleAddSet(sessionExerciseId: string, setType: 'working' | 'warmup') {
    const active = sessions.find((s) => s.status === 'active' || s.status === 'paused');
    if (!active || !user) return;
    const block = active.exercises.find((eb) => eb.id === sessionExerciseId);
    if (!block) return;
    const prevSet = block.sets[block.sets.length - 1];
    const newSet: WorkoutSetRecord = {
      id: generateUuid(),
      sessionId: active.id,
      sessionExerciseId: block.id,
      exerciseId: block.exerciseId,
      setIndex: block.sets.length,
      setType,
      weightKg: setType === 'working' ? prevSet?.weightKg ?? null : null,
      enteredUnit: settings.weightUnit,
      reps: null,
      rir: null,
      done: false,
      completedAt: null,
      version: 1,
      lastDeviceId: deviceId,
      updatedAt: new Date().toISOString()
    };
    await handleUpsertSet(sessionExerciseId, newSet);
  }

  async function handleDeleteSet(sessionExerciseId: string, setId: string) {
    const active = sessions.find((s) => s.status === 'active' || s.status === 'paused');
    if (!active || !user) return;
    const block = active.exercises.find((eb) => eb.id === sessionExerciseId);
    const targetSet = block?.sets.find((x) => x.id === setId);
    if (!targetSet) return;

    const nextSessions = sessions.map((s) =>
      s.id !== active.id
        ? s
        : {
            ...s,
            exercises: s.exercises.map((eb) =>
              eb.id !== sessionExerciseId
                ? eb
                : { ...eb, sets: eb.sets.filter((x) => x.id !== setId) }
            )
          }
    );
    setSessions(nextSessions);
    await commitMutation(
      'DELETE_SET',
      { setId, baseVersion: targetSet.version },
      { sessions: nextSessions }
    );
  }

  async function handleSubstituteExercise(
    sessionExerciseId: string,
    newExerciseId: string,
    reason: string,
    restSec: number,
    targetReps: string
  ) {
    const active = sessions.find((s) => s.status === 'active' || s.status === 'paused');
    if (!active || !user) return;
    const substitutedAt = Date.now();

    const nextSessions = sessions.map((s) =>
      s.id !== active.id
        ? s
        : {
            ...s,
            exercises: s.exercises.map((eb) => {
              if (eb.id !== sessionExerciseId) return eb;
              const origId = eb.substitutedFromExerciseId || eb.exerciseId;
              return {
                ...eb,
                exerciseId: newExerciseId,
                substitutedFromExerciseId: origId,
                substitutionReason: reason,
                substitutedAt,
                restSec,
                targetReps,
                sets: eb.sets.map((st) => ({ ...st, exerciseId: newExerciseId }))
              };
            })
          }
    );

    setSessions(nextSessions);
    await commitMutation(
      'SUBSTITUTE_EXERCISE',
      { sessionExerciseId, newExerciseId, reason, substitutedAt, restSec, targetReps },
      { sessions: nextSessions }
    );
  }

  async function handleAddSessionExercise(exerciseId: string) {
    const active = sessions.find((s) => s.status === 'active' || s.status === 'paused');
    const ex = exercisesMap[exerciseId];
    if (!active || !ex || !user) return;
    const blockId = generateUuid();
    const nowIso = new Date().toISOString();
    const newBlock: SessionExerciseRecord = {
      id: blockId,
      sessionId: active.id,
      orderIndex: active.exercises.length,
      exerciseId: ex.id,
      targetSets: ex.sets || 3,
      targetReps: ex.reps || '8-12',
      restSec: ex.rest || 90,
      substitutedFromExerciseId: null,
      substitutionReason: null,
      substitutedAt: null,
      notes: '',
      sets: Array.from({ length: ex.sets || 3 }, (_, idx) => ({
        id: generateUuid(),
        sessionId: active.id,
        sessionExerciseId: blockId,
        exerciseId: ex.id,
        setIndex: idx,
        setType: 'working',
        weightKg: null,
        enteredUnit: settings.weightUnit,
        reps: null,
        rir: null,
        done: false,
        completedAt: null,
        version: 1,
        lastDeviceId: deviceId,
        updatedAt: nowIso
      }))
    };

    const nextSessions = sessions.map((s) =>
      s.id !== active.id ? s : { ...s, exercises: [...s.exercises, newBlock] }
    );
    setSessions(nextSessions);
    await commitMutation(
      'ADD_SESSION_EXERCISE',
      { exerciseBlock: newBlock },
      { sessions: nextSessions }
    );
  }

  async function handleTogglePauseSession() {
    const active = sessions.find((s) => s.status === 'active' || s.status === 'paused');
    if (!active || !user) return;
    const now = Date.now();
    const nextStatus: 'active' | 'paused' = active.status === 'paused' ? 'active' : 'paused';
    const nextPausedAt = nextStatus === 'paused' ? now : null;
    const nextAccPause =
      nextStatus === 'active' && active.pausedAt
        ? (active.accumulatedPauseMs || 0) + Math.max(0, now - active.pausedAt)
        : active.accumulatedPauseMs || 0;

    const nextSessions = sessions.map((s) =>
      s.id !== active.id
        ? s
        : { ...s, status: nextStatus, pausedAt: nextPausedAt, accumulatedPauseMs: nextAccPause }
    );
    setSessions(nextSessions);
    await commitMutation(
      'UPDATE_SESSION_META',
      {
        sessionId: active.id,
        status: nextStatus,
        pausedAt: nextPausedAt,
        accumulatedPauseMs: nextAccPause,
        restOverrideSec: active.restOverrideSec,
        notes: active.notes
      },
      { sessions: nextSessions }
    );
  }

  async function handleUpdateSessionRestOverride(sec: number | null) {
    const active = sessions.find((s) => s.status === 'active' || s.status === 'paused');
    if (!active || !user) return;
    const nextSessions = sessions.map((s) =>
      s.id !== active.id ? s : { ...s, restOverrideSec: sec }
    );
    setSessions(nextSessions);
    await commitMutation(
      'UPDATE_SESSION_META',
      {
        sessionId: active.id,
        status: active.status,
        pausedAt: active.pausedAt,
        accumulatedPauseMs: active.accumulatedPauseMs,
        restOverrideSec: sec,
        notes: active.notes
      },
      { sessions: nextSessions }
    );
  }

  async function handleFinishSession(notes: string) {
    const active = sessions.find((s) => s.status === 'active' || s.status === 'paused');
    if (!active || !user) return;
    const endedAt = Date.now();
    const finalAccPause =
      active.status === 'paused' && active.pausedAt
        ? (active.accumulatedPauseMs || 0) + Math.max(0, endedAt - active.pausedAt)
        : active.accumulatedPauseMs || 0;

    // Advance sequence pointer locally to match server
    const days = activePlan?.days || DEFAULT_UPPER_LOWER_DAYS;
    const trainIndices = days
      .map((d, i) => ({ d, i }))
      .filter((x) => !x.d.isRest && x.d.items.length > 0)
      .map((x) => x.i);
    const pos = trainIndices.indexOf(active.sequenceIndex);
    const nextPtr = pos >= 0 ? trainIndices[(pos + 1) % trainIndices.length] : trainIndices[0] || 0;

    const nextSettings = { ...settings, sequencePointer: nextPtr };
    const nextSessions = sessions.map((s) =>
      s.id !== active.id
        ? s
        : {
            ...s,
            status: 'completed' as const,
            pausedAt: null,
            accumulatedPauseMs: finalAccPause,
            endedAt,
            notes
          }
    );

    setSettings(nextSettings);
    setSessions(nextSessions);
    stopRestTimer();
    setActiveTab('dashboard');
    showToast(lang === 'ar' ? 'تم إنهاء الجلسة وحفظها في السجل' : 'Session completed and saved');

    await commitMutation(
      'FINISH_SESSION',
      { sessionId: active.id, endedAt, accumulatedPauseMs: finalAccPause, notes },
      { sessions: nextSessions, settings: nextSettings }
    );
  }

  async function handleCancelActiveSession() {
    const active = sessions.find((s) => s.status === 'active' || s.status === 'paused');
    if (!active || !user) return;
    const ok = window.confirm(
      lang === 'ar'
        ? 'هل تريد إلغاء هذه الجلسة النشطة؟ لن تُحتسب كجلسة مكتملة.'
        : 'Cancel this active session? It will not be counted as completed.'
    );
    if (!ok) return;
    const nextSessions = sessions.map((s) =>
      s.id !== active.id ? s : { ...s, status: 'cancelled' as const, endedAt: Date.now() }
    );
    setSessions(nextSessions);
    stopRestTimer();
    await commitMutation('CANCEL_SESSION', { sessionId: active.id }, { sessions: nextSessions });
  }

  async function handleUpdateSettings(patch: Partial<UserSettings>) {
    if (!user) {
      if (patch.language) setGuestLang(patch.language);
      return;
    }
    const next = { ...settings, ...patch, updatedAt: new Date().toISOString() };
    setSettings(next);
    await commitMutation('UPDATE_SETTINGS', next, { settings: next });
  }

  async function handleToggleFavorite(exId: string) {
    if (!user) return;
    const exists = settings.favorites.includes(exId);
    const nextFavs = exists
      ? settings.favorites.filter((x) => x !== exId)
      : [...settings.favorites, exId];
    await handleUpdateSettings({ favorites: nextFavs });
  }

  async function handleSaveNewPlanVersion(
    days: PlanDay[],
    scheduleMode: ScheduleMode,
    changeNote: string
  ) {
    if (!user) return;
    const newId = generateUuid();
    const nextVer = (planVersions[0]?.versionNumber || 1) + 1;
    const newPv: PlanVersion = {
      id: newId,
      versionNumber: nextVer,
      isActive: true,
      scheduleMode,
      name_ar: 'خطة Upper / Lower المخصصة',
      name_en: 'Customized Upper / Lower Plan',
      days,
      changeNote,
      createdAt: new Date().toISOString()
    };
    const nextVersions = [
      newPv,
      ...planVersions.map((pv) => ({ ...pv, isActive: false }))
    ];
    setActivePlan(newPv);
    setPlanVersions(nextVersions);
    showToast(
      lang === 'ar'
        ? `تم حفظ نسخة الخطة الجديدة (v${nextVer}) دون المساس بسجل الجلسات السابقة`
        : `Saved new immutable Plan Version (v${nextVer})`
    );
    await commitMutation(
      'SAVE_PLAN_VERSION',
      { id: newId, days, scheduleMode, changeNote },
      { activePlan: newPv, planVersions: nextVersions }
    );
  }

  async function handleSaveBodyMetric(metric: BodyMetricRecord) {
    if (!user) return;
    const next = [metric, ...bodyMetrics];
    setBodyMetrics(next);
    showToast(lang === 'ar' ? 'تم حفظ قياس الجسم' : 'Body measurement saved');
    await commitMutation('UPSERT_BODY_METRIC', { metric }, { bodyMetrics: next });
  }

  async function handleDeleteBodyMetric(metricId: string) {
    if (!user) return;
    const next = bodyMetrics.filter((m) => m.id !== metricId);
    setBodyMetrics(next);
    await commitMutation('DELETE_BODY_METRIC', { metricId }, { bodyMetrics: next });
  }

  async function handleResolveConflict(conflictId: string, choose: 'server' | 'client') {
    if (!user) return;
    const res = await fetch(`/api/sync/conflicts/${conflictId}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
      },
      body: JSON.stringify({ choose })
    });
    if (res.ok) {
      const out = await res.json();
      await applyServerState(user.id, out.state);
      const stillOpen = (out.state.conflicts || []).some((c: SyncConflictRecord) => c.status === 'open');
      setSyncState(stillOpen ? 'conflict' : 'synced');
      showToast(
        lang === 'ar'
          ? 'تم اعتماد النسخة المختارة وحفظ الأخرى للاسترجاع'
          : 'Selected version applied; alternate version archived for recovery'
      );
    }
  }

  async function handleRestoreArchivedConflict(conflictId: string) {
    if (!user) return;
    const res = await fetch(`/api/sync/conflicts/${conflictId}/restore-other`, {
      method: 'POST',
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
    });
    if (res.ok) {
      const out = await res.json();
      await applyServerState(user.id, out.state);
      showToast(lang === 'ar' ? 'تم استرجاع النسخة البديلة بنجاح' : 'Restored archived version');
    }
  }

  async function handleAuthSuccess(u: UserProfile, token: string, verifyTok?: string) {
    try {
      localStorage.setItem('voxa_auth_token', token);
    } catch {}
    setAuthToken(token);
    setSandboxVerifyToken(verifyTok);
    setUser(u);
    setIsGuestPreview(false);
    // Navigate logged-in user directly to Dashboard (Section 2 & Test #3)
    setActiveTab('dashboard');
    await idbSet('cached_user_profile', u);
    await refreshServerState(u.id, token);
  }

  async function handleSignOut() {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
      });
    } catch {}
    try {
      localStorage.removeItem('voxa_auth_token');
    } catch {}
    await idbRemove('cached_user_profile');
    setAuthToken(null);
    setUser(null);
    setSessions([]);
    setBodyMetrics([]);
    setConflicts([]);
    setLegacyArchive([]);
    setCloudBackups([]);
    setIsGuestPreview(false);
  }

  async function handleAccountDeleted() {
    if (user) {
      await wipeUserLocalCache(user.id);
    }
    try {
      localStorage.removeItem('voxa_auth_token');
    } catch {}
    await idbRemove('cached_user_profile');
    setAuthToken(null);
    setUser(null);
    setSessions([]);
    setBodyMetrics([]);
    setConflicts([]);
    setLegacyArchive([]);
    setCloudBackups([]);
    showToast(
      lang === 'ar'
        ? 'تم حذف الحساب وبيانات السحابة نهائيًا.'
        : 'Account and cloud data permanently deleted.'
    );
  }

  if (booting) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg)'
        }}
      >
        <VoxaLogo variant="horizontal" size={44} subtitle="LOADING..." />
      </div>
    );
  }

  // Unauthenticated Visitor Screen (unless exploring limited Guest Preview)
  if (!user && !isGuestPreview) {
    return (
      <AuthWelcomeView
        lang={lang}
        onChangeLang={setGuestLang}
        googleConfigured={googleConfigured}
        onAuthSuccess={handleAuthSuccess}
        onEnterGuestPreview={() => {
          setIsGuestPreview(true);
          setActiveTab('dashboard');
        }}
      />
    );
  }

  const isGuest = !user;
  const activeSession = sessions.find((s) => s.status === 'active' || s.status === 'paused') || null;
  const completedSessions = sessions.filter((s) => s.status === 'completed');
  const openConflictsCount = conflicts.filter((c) => c.status === 'open').length;

  const navItems: { id: TabId; label: string; icon: React.ReactNode; guestAllowed: boolean }[] = [
    { id: 'dashboard', label: t.nav.dashboard, icon: <Home size={19} />, guestAllowed: true },
    { id: 'plan', label: t.nav.plan, icon: <Calendar size={19} />, guestAllowed: true },
    { id: 'workout', label: t.nav.workout, icon: <Dumbbell size={19} />, guestAllowed: false },
    { id: 'library', label: t.nav.library, icon: <BookOpen size={19} />, guestAllowed: true },
    { id: 'progress', label: t.nav.progress, icon: <TrendingUp size={19} />, guestAllowed: false },
    { id: 'settings', label: t.nav.settings, icon: <Settings size={19} />, guestAllowed: false }
  ];

  const fmtRestTime = `${Math.floor(restTimer.displaySec / 60)}:${String(
    restTimer.displaySec % 60
  ).padStart(2, '0')}`;

  return (
    <div className="voxa-shell">
      {/* Guest Mode Limited Preview Banner */}
      {isGuest && (
        <div className="guest-banner">
          <span>{t.welcome.guestBanner}</span>
          <button className="btn btn-gold btn-sm" onClick={() => setIsGuestPreview(false)}>
            <LogIn size={14} />
            <span>{t.welcome.signIn}</span>
          </button>
        </div>
      )}

      {/* Top Sticky Header */}
      <header className="voxa-topbar">
        <div style={{ cursor: 'pointer' }} onClick={() => setActiveTab('dashboard')}>
          <VoxaLogo variant="horizontal" size={34} subtitle={t.brandSubtitle} />
        </div>

        <div className="topbar-actions">
          {/* Persistent Rest Timer Pill */}
          {restTimer.active && (
            <div className="rest-pill">
              <TimerIcon size={14} color="var(--gold)" />
              <strong className="num" style={{ color: 'var(--gold-light)', minWidth: 38, textAlign: 'center' }}>
                {fmtRestTime}
              </strong>
              <button
                style={{ fontSize: 11, color: 'var(--muted)', padding: '2px 4px' }}
                onClick={() => adjustRestTimer(-15)}
              >
                -15
              </button>
              <button
                style={{ fontSize: 11, color: 'var(--muted)', padding: '2px 4px' }}
                onClick={() => adjustRestTimer(15)}
              >
                +15
              </button>
              <button
                style={{ fontSize: 11, color: 'var(--gold-light)', padding: '2px 4px' }}
                onClick={togglePauseRestTimer}
              >
                {restTimer.paused ? '▶' : '❚❚'}
              </button>
              <button
                style={{ fontSize: 11, color: 'var(--danger)', padding: '2px 4px' }}
                onClick={stopRestTimer}
              >
                ✕
              </button>
            </div>
          )}

          {/* Honest Sync Status Indicator */}
          {!isGuest && (
            <button
              className={`badge ${
                syncState === 'synced'
                  ? 'badge-ok'
                  : syncState === 'conflict' || syncState === 'failed'
                  ? 'badge-danger'
                  : 'badge-gold'
              }`}
              onClick={() => flushSyncQueue()}
              title={t.sync.syncNow}
              style={{ cursor: 'pointer' }}
            >
              <RefreshCw size={11} />
              <span>
                {t.sync[syncState]}
                {pendingQueueCount > 0 ? ` (${pendingQueueCount})` : ''}
              </span>
            </button>
          )}

          {/* Quick Language Switcher (AR RTL <-> EN LTR) */}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => handleUpdateSettings({ language: lang === 'ar' ? 'en' : 'ar' })}
          >
            <Globe size={14} />
            <span>{lang === 'ar' ? 'EN' : 'عربي'}</span>
          </button>
        </div>
      </header>

      <div className="voxa-body">
        {/* Desktop Sidebar */}
        <aside className="voxa-sidebar" aria-label="Main navigation">
          {navItems
            .filter((it) => !isGuest || it.guestAllowed)
            .map((it) => (
              <button
                key={it.id}
                className={activeTab === it.id ? 'active' : ''}
                onClick={() => setActiveTab(it.id)}
              >
                {it.icon}
                <span>{it.label}</span>
              </button>
            ))}
        </aside>

        {/* Main View Area */}
        <main className="voxa-main">
          {activeTab === 'dashboard' && (
            <DashboardView
              lang={lang}
              user={user}
              isGuest={isGuest}
              settings={settings}
              activePlan={activePlan}
              sessions={sessions}
              exercisesMap={exercisesMap}
              openConflictsCount={openConflictsCount}
              onStartDaySession={handleStartDaySession}
              onResumeActiveSession={() => setActiveTab('workout')}
              onCancelActiveSession={handleCancelActiveSession}
              onNavigate={(tab) => {
                if (isGuest && !['plan', 'library'].includes(tab)) {
                  showToast(t.welcome.guestLockedAction);
                  setIsGuestPreview(false);
                } else {
                  setActiveTab(tab);
                }
              }}
              onRequireAuth={() => {
                showToast(t.welcome.guestLockedAction);
                setIsGuestPreview(false);
              }}
            />
          )}

          {activeTab === 'plan' && (
            <PlanView
              lang={lang}
              isGuest={isGuest}
              settings={settings}
              activePlan={activePlan}
              planVersions={planVersions}
              exercises={exercises}
              exercisesMap={exercisesMap}
              onChangeScheduleMode={(mode) => handleUpdateSettings({ scheduleMode: mode })}
              onSaveNewPlanVersion={handleSaveNewPlanVersion}
              onStartDaySession={handleStartDaySession}
              onOpenExerciseDetail={setDetailExerciseId}
              onRequireAuth={() => {
                showToast(t.welcome.guestLockedAction);
                setIsGuestPreview(false);
              }}
            />
          )}

          {activeTab === 'workout' && !isGuest && (
            <WorkoutView
              lang={lang}
              isGuest={false}
              syncState={syncState}
              settings={settings}
              activeSession={activeSession}
              completedSessions={completedSessions}
              exercises={exercises}
              exercisesMap={exercisesMap}
              publishedImages={publishedImages}
              onUpsertSet={handleUpsertSet}
              onAddSet={handleAddSet}
              onDeleteSet={handleDeleteSet}
              onSubstituteExercise={handleSubstituteExercise}
              onAddSessionExercise={handleAddSessionExercise}
              onTogglePauseSession={handleTogglePauseSession}
              onUpdateSessionRestOverride={handleUpdateSessionRestOverride}
              onFinishSession={handleFinishSession}
              onStartRestTimer={startRestTimer}
              onOpenExerciseDetail={setDetailExerciseId}
              onGoToPlan={() => setActiveTab('plan')}
            />
          )}

          {activeTab === 'library' && (
            <LibraryMusclesView
              lang={lang}
              isGuest={isGuest}
              settings={settings}
              exercises={exercises}
              publishedImages={publishedImages}
              sessions={sessions}
              onToggleFavorite={handleToggleFavorite}
              onOpenExerciseDetail={setDetailExerciseId}
              onRequireAuth={() => {
                showToast(t.welcome.guestLockedAction);
                setIsGuestPreview(false);
              }}
            />
          )}

          {activeTab === 'progress' && !isGuest && (
            <ProgressView
              lang={lang}
              settings={settings}
              sessions={sessions}
              bodyMetrics={bodyMetrics}
              conflicts={conflicts}
              exercises={exercises}
              exercisesMap={exercisesMap}
              onSaveBodyMetric={handleSaveBodyMetric}
              onDeleteBodyMetric={handleDeleteBodyMetric}
              onResolveConflict={handleResolveConflict}
              onRestoreArchivedConflict={handleRestoreArchivedConflict}
            />
          )}

          {activeTab === 'settings' && user && (
            <SettingsArchiveView
              lang={lang}
              user={user}
              authToken={authToken}
              sandboxVerifyToken={sandboxVerifyToken}
              settings={settings}
              sessions={sessions}
              legacyArchive={legacyArchive}
              cloudBackups={cloudBackups}
              exercises={exercises}
              exercisesMap={exercisesMap}
              onUpdateSettings={handleUpdateSettings}
              onRefreshState={() => refreshServerState(user.id, authToken)}
              onSignOut={handleSignOut}
              onAccountDeleted={handleAccountDeleted}
              onToast={showToast}
            />
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="voxa-bottomnav" aria-label="Mobile navigation">
        {navItems
          .filter((it) => !isGuest || it.guestAllowed)
          .map((it) => (
            <button
              key={it.id}
              className={activeTab === it.id ? 'active' : ''}
              onClick={() => setActiveTab(it.id)}
            >
              {it.icon}
              <span>{it.label}</span>
            </button>
          ))}
      </nav>

      {/* Exercise Detail Modal */}
      {detailExerciseId && exercisesMap[detailExerciseId] && (
        <ExerciseDetailModal
          exercise={exercisesMap[detailExerciseId]}
          allExercisesMap={exercisesMap}
          publishedImages={publishedImages}
          sessions={sessions}
          favorites={settings.favorites}
          lang={lang}
          weightUnit={settings.weightUnit}
          isGuest={isGuest}
          onToggleFavorite={handleToggleFavorite}
          onSelectExercise={setDetailExerciseId}
          onClose={() => setDetailExerciseId(null)}
        />
      )}

      {/* Toast Notification */}
      {toastMsg && <div className="toast-bar">{toastMsg}</div>}
    </div>
  );
};
