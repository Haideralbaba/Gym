export type Lang = 'ar' | 'en';
export type WeightUnit = 'kg' | 'lb';
export type LengthUnit = 'cm' | 'in';
export type ScheduleMode = 'fixed' | 'flexible';
export type Equipment = 'bar' | 'dumbbell' | 'cable' | 'machine' | 'bodyweight' | 'smith';
export type MovementPattern = 'push' | 'pull' | 'squat' | 'hinge' | 'lunge' | 'carry' | 'rotation';
export type Difficulty = 'beginner' | 'intermediate' | 'advanced';
export type ImageStatus = 'draft' | 'pending_review' | 'published' | 'rejected';
export type SyncState = 'synced' | 'saved_local' | 'pending_sync' | 'offline' | 'conflict' | 'failed';

export interface MuscleInfo {
  id: string;
  ar: string;
  en: string;
  cat: 'chest' | 'back' | 'shoulders' | 'arms' | 'legs' | 'core';
  fn_ar: string;
  fn_en: string;
  notes_ar: string;
  notes_en: string;
}

export interface ExerciseData {
  id: string;
  ar: string;
  en: string;
  desc_ar: string;
  desc_en: string;
  primary: string;
  secondary: string[];
  equip: Equipment;
  pattern: MovementPattern;
  diff: Difficulty;
  diff_basis_ar: string;
  diff_basis_en: string;
  sets: number;
  reps: string;
  rest: number;
  isTimed?: boolean;
  steps_ar: string[];
  steps_en: string[];
  cues_ar: string[];
  cues_en: string[];
  breath_ar: string;
  breath_en: string;
  mistakes_ar: string[];
  mistakes_en: string[];
  safety_ar: string;
  safety_en: string;
  alts: string[];
}

export interface ExerciseImageRecord {
  id: string;
  exerciseId: string;
  imageUrl: string;
  sourceName: string;
  sourceUrl: string;
  license: string;
  status: ImageStatus;
  reviewNotes: string;
  isIllustration?: boolean;
  updatedAt: string;
}

export interface PlanDayItem {
  exerciseId: string;
  sets: number;
  reps: string;
  rest: number;
}

export interface PlanDay {
  key: string; // 'sat' | 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri'
  weekday: number; // JS getDay(): 6=Sat, 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri
  seqOrder: number; // 0..6
  isRest: boolean;
  name_ar: string;
  name_en: string;
  focus_ar: string;
  focus_en: string;
  items: PlanDayItem[];
}

export interface PlanVersion {
  id: string;
  versionNumber: number;
  isActive: boolean;
  scheduleMode: ScheduleMode;
  name_ar: string;
  name_en: string;
  days: PlanDay[];
  changeNote: string;
  createdAt: string;
}

export interface WorkoutSetRecord {
  id: string;
  sessionId: string;
  sessionExerciseId: string;
  exerciseId: string;
  setIndex: number;
  setType: 'working' | 'warmup';
  weightKg: number | null;
  enteredUnit: WeightUnit;
  reps: number | null;
  rir: number | null;
  done: boolean;
  completedAt: number | null;
  version: number;
  lastDeviceId: string;
  updatedAt: string;
}

export interface SessionExerciseRecord {
  id: string;
  sessionId: string;
  orderIndex: number;
  exerciseId: string;
  targetSets: number;
  targetReps: string;
  restSec: number;
  substitutedFromExerciseId: string | null;
  substitutionReason: string | null;
  substitutedAt: number | null;
  notes: string;
  sets: WorkoutSetRecord[];
}

export interface WorkoutSessionRecord {
  id: string;
  planVersionId: string | null;
  dayKey: string;
  sequenceIndex: number;
  name_ar: string;
  name_en: string;
  focus_ar: string;
  focus_en: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  restOverrideSec: number | null;
  startedAt: number;
  pausedAt: number | null;
  accumulatedPauseMs: number;
  endedAt: number | null;
  notes: string;
  version: number;
  lastDeviceId: string;
  updatedAt: string;
  exercises: SessionExerciseRecord[];
}

export interface BodyMetricRecord {
  id: string;
  recordedDate: string; // YYYY-MM-DD
  weightKg: number | null;
  heightCm: number | null;
  waistCm: number | null;
  chestCm: number | null;
  armCm: number | null;
  thighCm: number | null;
  bodyFatPct: number | null;
  customMetrics: Record<string, { value: number; unit: string }>;
  enteredWeightUnit: WeightUnit;
  enteredLengthUnit: LengthUnit;
  notes: string;
  version: number;
  updatedAt: string;
}

export interface UserSettings {
  language: Lang;
  weightUnit: WeightUnit;
  lengthUnit: LengthUnit;
  defaultRestSec: number;
  autoStartRest: boolean;
  hideWarmupInVolume: boolean;
  scheduleMode: ScheduleMode;
  sequencePointer: number;
  restDays: number[];
  reminderEnabled: boolean;
  reminderTime: string;
  goal: string;
  experience: Difficulty;
  favorites: string[];
  version: number;
  updatedAt: string;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  role: 'user' | 'owner';
  createdAt: string;
}

export interface SyncConflictRecord {
  id: string;
  entityType: 'workout_set';
  entityId: string;
  sessionId: string;
  exerciseId: string;
  serverSnapshot: WorkoutSetRecord;
  clientSnapshot: WorkoutSetRecord;
  status: 'open' | 'resolved';
  chosenSide: 'server' | 'client' | null;
  archivedOther: WorkoutSetRecord | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface LegacyArchiveRecord {
  id: string;
  fingerprint: string;
  sourceSystem: string;
  importedAt: string;
  originalSessionId: string | null;
  sessionName: string;
  focus: string;
  startedAt: number | null;
  endedAt: number | null;
  rawPayload: any;
  readOnly: boolean;
}

export interface CloudBackupSummary {
  id: string;
  label: string;
  triggerType: 'manual' | 'auto_pre_import' | 'auto_pre_restore' | 'scheduled_checkpoint';
  summary: {
    sessionsCount: number;
    setsCount: number;
    planVersionsCount: number;
    bodyMetricsCount: number;
    legacyCount: number;
  };
  checksumSha256: string;
  createdAt: string;
}
