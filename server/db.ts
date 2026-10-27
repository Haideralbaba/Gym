import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { SEED_EXERCISES } from '../src/data/seedExercises';
import { DEFAULT_UPPER_LOWER_DAYS } from '../src/data/defaultPlan';

const DEFAULT_DB_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DEFAULT_DB_DIR)) {
  fs.mkdirSync(DEFAULT_DB_DIR, { recursive: true });
}

export function openVoxaDatabase(customPath?: string): Database.Database {
  const dbPath = customPath || process.env.VOXA_DB_PATH || path.join(DEFAULT_DB_DIR, 'voxa.sqlite');
  const dir = path.dirname(dbPath);
  if (dbPath !== ':memory:' && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  seedLibrary(db);
  return db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      display_name TEXT NOT NULL DEFAULT '',
      email_verified INTEGER NOT NULL DEFAULT 0,
      google_sub TEXT UNIQUE,
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'owner')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK (type IN ('session', 'verify_email', 'reset_password')),
      expires_at INTEGER NOT NULL,
      used_at INTEGER,
      user_agent TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      language TEXT NOT NULL DEFAULT 'ar' CHECK (language IN ('ar', 'en')),
      weight_unit TEXT NOT NULL DEFAULT 'kg' CHECK (weight_unit IN ('kg', 'lb')),
      length_unit TEXT NOT NULL DEFAULT 'cm' CHECK (length_unit IN ('cm', 'in')),
      default_rest_sec INTEGER NOT NULL DEFAULT 90,
      auto_start_rest INTEGER NOT NULL DEFAULT 1,
      hide_warmup_in_volume INTEGER NOT NULL DEFAULT 1,
      schedule_mode TEXT NOT NULL DEFAULT 'flexible' CHECK (schedule_mode IN ('fixed', 'flexible')),
      sequence_pointer INTEGER NOT NULL DEFAULT 0,
      rest_days_json TEXT NOT NULL DEFAULT '[5]',
      reminder_enabled INTEGER NOT NULL DEFAULT 0,
      reminder_time TEXT NOT NULL DEFAULT '18:00',
      goal TEXT NOT NULL DEFAULT '',
      experience TEXT NOT NULL DEFAULT 'intermediate',
      favorites_json TEXT NOT NULL DEFAULT '[]',
      version INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY,
      is_custom INTEGER NOT NULL DEFAULT 0,
      data_json TEXT NOT NULL,
      published INTEGER NOT NULL DEFAULT 1,
      updated_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS exercise_images (
      id TEXT PRIMARY KEY,
      exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
      image_url TEXT NOT NULL,
      source_name TEXT NOT NULL DEFAULT '',
      source_url TEXT NOT NULL DEFAULT '',
      license TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'published', 'rejected')),
      review_notes TEXT NOT NULL DEFAULT '',
      is_illustration INTEGER NOT NULL DEFAULT 0,
      submitted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS plan_versions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      schedule_mode TEXT NOT NULL DEFAULT 'flexible',
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      days_json TEXT NOT NULL,
      change_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      UNIQUE(user_id, version_number)
    );

    CREATE TABLE IF NOT EXISTS workout_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan_version_id TEXT REFERENCES plan_versions(id) ON DELETE SET NULL,
      day_key TEXT NOT NULL,
      sequence_index INTEGER NOT NULL DEFAULT 0,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      focus_ar TEXT NOT NULL DEFAULT '',
      focus_en TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
      rest_override_sec INTEGER,
      started_at INTEGER NOT NULL,
      paused_at INTEGER,
      accumulated_pause_ms INTEGER NOT NULL DEFAULT 0,
      ended_at INTEGER,
      notes TEXT NOT NULL DEFAULT '',
      version INTEGER NOT NULL DEFAULT 1,
      last_device_id TEXT NOT NULL DEFAULT '',
      deleted_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS session_exercises (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      order_index INTEGER NOT NULL,
      exercise_id TEXT NOT NULL,
      target_sets INTEGER NOT NULL DEFAULT 3,
      target_reps TEXT NOT NULL DEFAULT '8-12',
      rest_sec INTEGER NOT NULL DEFAULT 90,
      substituted_from_exercise_id TEXT,
      substitution_reason TEXT,
      substituted_at INTEGER,
      notes TEXT NOT NULL DEFAULT '',
      version INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workout_sets (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
      session_exercise_id TEXT NOT NULL REFERENCES session_exercises(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      exercise_id TEXT NOT NULL,
      set_index INTEGER NOT NULL,
      set_type TEXT NOT NULL DEFAULT 'working' CHECK (set_type IN ('working', 'warmup')),
      weight_kg REAL,
      entered_unit TEXT NOT NULL DEFAULT 'kg' CHECK (entered_unit IN ('kg', 'lb')),
      reps INTEGER,
      rir REAL,
      done INTEGER NOT NULL DEFAULT 0,
      completed_at INTEGER,
      version INTEGER NOT NULL DEFAULT 1,
      last_device_id TEXT NOT NULL DEFAULT '',
      deleted_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS body_metrics (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recorded_date TEXT NOT NULL,
      weight_kg REAL,
      height_cm REAL,
      waist_cm REAL,
      chest_cm REAL,
      arm_cm REAL,
      thigh_cm REAL,
      body_fat_pct REAL,
      custom_metrics_json TEXT NOT NULL DEFAULT '{}',
      entered_weight_unit TEXT NOT NULL DEFAULT 'kg',
      entered_length_unit TEXT NOT NULL DEFAULT 'cm',
      notes TEXT NOT NULL DEFAULT '',
      version INTEGER NOT NULL DEFAULT 1,
      deleted_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS legacy_archive (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      fingerprint TEXT NOT NULL,
      source_system TEXT NOT NULL DEFAULT 'IRON SYSTEM (ironsys_v2)',
      imported_at TEXT NOT NULL,
      original_session_id TEXT,
      session_name TEXT NOT NULL,
      focus TEXT NOT NULL DEFAULT '',
      started_at INTEGER,
      ended_at INTEGER,
      raw_payload_json TEXT NOT NULL,
      read_only INTEGER NOT NULL DEFAULT 1,
      UNIQUE(user_id, fingerprint)
    );

    CREATE TABLE IF NOT EXISTS sync_conflicts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      session_id TEXT,
      exercise_id TEXT,
      server_snapshot_json TEXT NOT NULL,
      client_snapshot_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
      chosen_side TEXT,
      archived_other_json TEXT,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS processed_mutations (
      mutation_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      processed_at TEXT NOT NULL,
      result_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cloud_backups (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      trigger_type TEXT NOT NULL,
      summary_json TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      checksum_sha256 TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action TEXT NOT null,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON workout_sessions(user_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sets_session ON workout_sets(session_id, set_index);
    CREATE INDEX IF NOT EXISTS idx_sets_user_ex ON workout_sets(user_id, exercise_id);
    CREATE INDEX IF NOT EXISTS idx_conflicts_user ON sync_conflicts(user_id, status);
  `);
}

function seedLibrary(db: Database.Database) {
  const now = new Date().toISOString();
  const insertEx = db.prepare(`
    INSERT OR IGNORE INTO exercises (id, is_custom, data_json, published, created_at, updated_at)
    VALUES (?, 0, ?, 1, ?, ?)
  `);
  const insertIllustration = db.prepare(`
    INSERT OR IGNORE INTO exercise_images (
      id, exercise_id, image_url, source_name, source_url, license, status, review_notes, is_illustration, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'published', ?, 1, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const ex of SEED_EXERCISES) {
      insertEx.run(ex.id, JSON.stringify(ex), now, now);
      insertIllustration.run(
        `illus_${ex.id}`,
        ex.id,
        `voxa-illustration://${ex.id}`,
        'VOXA Original Biomechanical Vector Studio',
        'https://voxa.local/assets/original-biomechanical-vectors',
        'CC0-1.0 / VOXA Original First-Party Illustration',
        'Verified original vector diagram generated by VOXA.',
        now,
        now
      );
    }
  });
  tx();
}

export function initializeUserDefaults(db: Database.Database, userId: string, lang: 'ar' | 'en' = 'ar') {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT OR IGNORE INTO user_settings (user_id, language, updated_at)
    VALUES (?, ?, ?)
  `).run(userId, lang, now);

  const existingPlan = db.prepare(`SELECT id FROM plan_versions WHERE user_id = ? LIMIT 1`).get(userId);
  if (!existingPlan) {
    db.prepare(`
      INSERT INTO plan_versions (
        id, user_id, version_number, is_active, schedule_mode, name_ar, name_en, days_json, change_note, created_at
      ) VALUES (?, ?, 1, 1, 'flexible', ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      userId,
      'خطة Upper / Lower المتوازنة (6 أيام + راحة)',
      'Balanced 6-Day Upper / Lower Split',
      JSON.stringify(DEFAULT_UPPER_LOWER_DAYS),
      'Initial balanced Upper/Lower plan',
      now
    );
  }
}

export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}
