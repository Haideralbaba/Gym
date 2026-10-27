import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import type Database from 'better-sqlite3';
import { initializeUserDefaults, sha256Hex } from './db';
import { SEED_MUSCLES } from '../src/data/seedMuscles';
import { DEFAULT_UPPER_LOWER_DAYS } from '../src/data/defaultPlan';
import type {
  ExerciseData,
  WorkoutSessionRecord,
  SessionExerciseRecord,
  WorkoutSetRecord,
  UserSettings,
  PlanVersion,
  BodyMetricRecord,
  SyncConflictRecord,
  LegacyArchiveRecord,
  CloudBackupSummary
} from '../src/types';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  role: 'user' | 'owner';
  createdAt: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      rawToken?: string;
    }
  }
}

function getOwnerSecret(): string {
  // Server-only secret for authorizing the single Owner role.
  // Never exposed to non-authorized callers; configurable via VOXA_OWNER_SECRET env var.
  return process.env.VOXA_OWNER_SECRET || 'voxa-server-owner-key-2026';
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function createVoxaApp(db: Database.Database) {
  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.use(cookieParser());

  // Security headers compatible with iframe Live Preview
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Helper: parse authenticated session from cookie or Authorization header
  function extractUser(req: Request): AuthUser | undefined {
    const header = req.headers.authorization;
    const bearer = header && header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    const cookieTok = req.cookies?.voxa_session || null;
    const raw = bearer || cookieTok;
    if (!raw) return undefined;

    const hash = sha256Hex(raw);
    const row = db
      .prepare(
        `SELECT t.expires_at, u.id, u.email, u.display_name, u.email_verified, u.role, u.created_at
         FROM auth_tokens t
         JOIN users u ON u.id = t.user_id
         WHERE t.token_hash = ? AND t.type = 'session'`
      )
      .get(hash) as any;

    if (!row) return undefined;
    if (row.expires_at < Date.now()) {
      db.prepare(`DELETE FROM auth_tokens WHERE token_hash = ?`).run(hash);
      return undefined;
    }
    req.rawToken = raw;
    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      emailVerified: Boolean(row.email_verified),
      role: row.role,
      createdAt: row.created_at
    };
  }

  function requireAuth(req: Request, res: Response, next: NextFunction) {
    const u = extractUser(req);
    if (!u) {
      res.status(401).json({ error: 'AUTH_REQUIRED', message: 'Authentication required.' });
      return;
    }
    req.user = u;
    next();
  }

  function requireOwner(req: Request, res: Response, next: NextFunction) {
    const u = extractUser(req);
    if (!u) {
      res.status(401).json({ error: 'AUTH_REQUIRED', message: 'Authentication required.' });
      return;
    }
    // Always re-verify role directly from database on the server
    const fresh = db.prepare(`SELECT role FROM users WHERE id = ?`).get(u.id) as any;
    if (!fresh || fresh.role !== 'owner') {
      res.status(403).json({ error: 'OWNER_ONLY', message: 'Owner authorization required on server.' });
      return;
    }
    req.user = { ...u, role: 'owner' };
    next();
  }

  function issueSession(res: Response, userId: string, userAgent = ''): string {
    const raw = crypto.randomBytes(32).toString('hex');
    const hash = sha256Hex(raw);
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
    db.prepare(
      `INSERT INTO auth_tokens (id, user_id, token_hash, type, expires_at, user_agent, created_at)
       VALUES (?, ?, ?, 'session', ?, ?, ?)`
    ).run(crypto.randomUUID(), userId, hash, expiresAt, userAgent.slice(0, 200), new Date().toISOString());

    res.cookie('voxa_session', raw, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/'
    });
    return raw;
  }

  // Helper: Assemble public catalog (published exercises & published verified images only)
  function getPublicCatalog() {
    const exRows = db.prepare(`SELECT data_json FROM exercises WHERE published = 1 ORDER BY rowid ASC`).all() as any[];
    const exercises: ExerciseData[] = exRows.map((r) => JSON.parse(r.data_json));
    const imgRows = db
      .prepare(
        `SELECT id, exercise_id, image_url, source_name, source_url, license, status, review_notes, is_illustration, updated_at
         FROM exercise_images
         WHERE status = 'published'
         ORDER BY is_illustration ASC, updated_at DESC`
      )
      .all() as any[];

    const publishedImages = imgRows.map((r) => ({
      id: r.id,
      exerciseId: r.exercise_id,
      imageUrl: r.image_url,
      sourceName: r.source_name,
      sourceUrl: r.source_url,
      license: r.license,
      status: r.status,
      reviewNotes: r.review_notes,
      isIllustration: Boolean(r.is_illustration),
      updatedAt: r.updated_at
    }));

    return {
      exercises,
      muscles: SEED_MUSCLES,
      publishedImages,
      defaultPlanDays: DEFAULT_UPPER_LOWER_DAYS,
      authProviders: {
        googleConfigured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
        smtpConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER)
      }
    };
  }

  // Helper: Assemble full isolated user state
  function assembleUserState(userId: string) {
    initializeUserDefaults(db, userId);

    const sRow = db.prepare(`SELECT * FROM user_settings WHERE user_id = ?`).get(userId) as any;
    const settings: UserSettings = {
      language: sRow.language,
      weightUnit: sRow.weight_unit,
      lengthUnit: sRow.length_unit,
      defaultRestSec: sRow.default_rest_sec,
      autoStartRest: Boolean(sRow.auto_start_rest),
      hideWarmupInVolume: Boolean(sRow.hide_warmup_in_volume),
      scheduleMode: sRow.schedule_mode,
      sequencePointer: sRow.sequence_pointer,
      restDays: JSON.parse(sRow.rest_days_json || '[5]'),
      reminderEnabled: Boolean(sRow.reminder_enabled),
      reminderTime: sRow.reminder_time,
      goal: sRow.goal,
      experience: sRow.experience,
      favorites: JSON.parse(sRow.favorites_json || '[]'),
      version: sRow.version,
      updatedAt: sRow.updated_at
    };

    const planRows = db
      .prepare(`SELECT * FROM plan_versions WHERE user_id = ? ORDER BY version_number DESC`)
      .all(userId) as any[];
    const planVersions: PlanVersion[] = planRows.map((p) => ({
      id: p.id,
      versionNumber: p.version_number,
      isActive: Boolean(p.is_active),
      scheduleMode: p.schedule_mode,
      name_ar: p.name_ar,
      name_en: p.name_en,
      days: JSON.parse(p.days_json),
      changeNote: p.change_note,
      createdAt: p.created_at
    }));
    const activePlan = planVersions.find((p) => p.isActive) || planVersions[0] || null;

    const sessionRows = db
      .prepare(
        `SELECT * FROM workout_sessions
         WHERE user_id = ? AND deleted_at IS NULL
         ORDER BY started_at DESC`
      )
      .all(userId) as any[];

    const exBlockRows = db
      .prepare(
        `SELECT * FROM session_exercises
         WHERE user_id = ?
         ORDER BY order_index ASC`
      )
      .all(userId) as any[];

    const setRows = db
      .prepare(
        `SELECT * FROM workout_sets
         WHERE user_id = ? AND deleted_at IS NULL
         ORDER BY set_index ASC`
      )
      .all(userId) as any[];

    const setsByBlock = new Map<string, WorkoutSetRecord[]>();
    for (const st of setRows) {
      const list = setsByBlock.get(st.session_exercise_id) || [];
      list.push({
        id: st.id,
        sessionId: st.session_id,
        sessionExerciseId: st.session_exercise_id,
        exerciseId: st.exercise_id,
        setIndex: st.set_index,
        setType: st.set_type,
        weightKg: st.weight_kg,
        enteredUnit: st.entered_unit,
        reps: st.reps,
        rir: st.rir,
        done: Boolean(st.done),
        completedAt: st.completed_at,
        version: st.version,
        lastDeviceId: st.last_device_id,
        updatedAt: st.updated_at
      });
      setsByBlock.set(st.session_exercise_id, list);
    }

    const blocksBySession = new Map<string, SessionExerciseRecord[]>();
    for (const b of exBlockRows) {
      const list = blocksBySession.get(b.session_id) || [];
      list.push({
        id: b.id,
        sessionId: b.session_id,
        orderIndex: b.order_index,
        exerciseId: b.exercise_id,
        targetSets: b.target_sets,
        targetReps: b.target_reps,
        restSec: b.rest_sec,
        substitutedFromExerciseId: b.substituted_from_exercise_id,
        substitutionReason: b.substitution_reason,
        substitutedAt: b.substituted_at,
        notes: b.notes,
        sets: setsByBlock.get(b.id) || []
      });
      blocksBySession.set(b.session_id, list);
    }

    const sessions: WorkoutSessionRecord[] = sessionRows.map((s) => ({
      id: s.id,
      planVersionId: s.plan_version_id,
      dayKey: s.day_key,
      sequenceIndex: s.sequence_index,
      name_ar: s.name_ar,
      name_en: s.name_en,
      focus_ar: s.focus_ar,
      focus_en: s.focus_en,
      status: s.status,
      restOverrideSec: s.rest_override_sec,
      startedAt: s.started_at,
      pausedAt: s.paused_at,
      accumulatedPauseMs: s.accumulated_pause_ms,
      endedAt: s.ended_at,
      notes: s.notes,
      version: s.version,
      lastDeviceId: s.last_device_id,
      updatedAt: s.updated_at,
      exercises: blocksBySession.get(s.id) || []
    }));

    const metricRows = db
      .prepare(
        `SELECT * FROM body_metrics
         WHERE user_id = ? AND deleted_at IS NULL
         ORDER BY recorded_date DESC, created_at DESC`
      )
      .all(userId) as any[];

    const bodyMetrics: BodyMetricRecord[] = metricRows.map((m) => ({
      id: m.id,
      recordedDate: m.recorded_date,
      weightKg: m.weight_kg,
      heightCm: m.height_cm,
      waistCm: m.waist_cm,
      chestCm: m.chest_cm,
      armCm: m.arm_cm,
      thighCm: m.thigh_cm,
      bodyFatPct: m.body_fat_pct,
      customMetrics: JSON.parse(m.custom_metrics_json || '{}'),
      enteredWeightUnit: m.entered_weight_unit,
      enteredLengthUnit: m.entered_length_unit,
      notes: m.notes,
      version: m.version,
      updatedAt: m.updated_at
    }));

    const conflictRows = db
      .prepare(`SELECT * FROM sync_conflicts WHERE user_id = ? ORDER BY created_at DESC`)
      .all(userId) as any[];
    const conflicts: SyncConflictRecord[] = conflictRows.map((c) => ({
      id: c.id,
      entityType: c.entity_type,
      entityId: c.entity_id,
      sessionId: c.session_id,
      exerciseId: c.exercise_id,
      serverSnapshot: JSON.parse(c.server_snapshot_json),
      clientSnapshot: JSON.parse(c.client_snapshot_json),
      status: c.status,
      chosenSide: c.chosen_side,
      archivedOther: c.archived_other_json ? JSON.parse(c.archived_other_json) : null,
      createdAt: c.created_at,
      resolvedAt: c.resolved_at
    }));

    const legacyRows = db
      .prepare(`SELECT * FROM legacy_archive WHERE user_id = ? ORDER BY ended_at DESC, imported_at DESC`)
      .all(userId) as any[];
    const legacyArchive: LegacyArchiveRecord[] = legacyRows.map((l) => ({
      id: l.id,
      fingerprint: l.fingerprint,
      sourceSystem: l.source_system,
      importedAt: l.imported_at,
      originalSessionId: l.original_session_id,
      sessionName: l.session_name,
      focus: l.focus,
      startedAt: l.started_at,
      endedAt: l.ended_at,
      rawPayload: JSON.parse(l.raw_payload_json),
      readOnly: Boolean(l.read_only)
    }));

    const backupRows = db
      .prepare(
        `SELECT id, label, trigger_type, summary_json, checksum_sha256, created_at
         FROM cloud_backups WHERE user_id = ? ORDER BY created_at DESC LIMIT 30`
      )
      .all(userId) as any[];
    const cloudBackups: CloudBackupSummary[] = backupRows.map((b) => ({
      id: b.id,
      label: b.label,
      triggerType: b.trigger_type,
      summary: JSON.parse(b.summary_json),
      checksumSha256: b.checksum_sha256,
      createdAt: b.created_at
    }));

    return {
      settings,
      activePlan,
      planVersions,
      sessions,
      bodyMetrics,
      conflicts,
      legacyArchive,
      cloudBackups
    };
  }

  function createCloudSnapshotInternal(
    userId: string,
    label: string,
    triggerType: 'manual' | 'auto_pre_import' | 'auto_pre_restore' | 'scheduled_checkpoint'
  ): CloudBackupSummary {
    const state = assembleUserState(userId);
    const totalSets = state.sessions.reduce(
      (sum, s) => sum + s.exercises.reduce((a, e) => a + e.sets.length, 0),
      0
    );
    const payload = {
      schema: 'voxa_backup_v1',
      createdAt: new Date().toISOString(),
      settings: state.settings,
      planVersions: state.planVersions,
      sessions: state.sessions,
      bodyMetrics: state.bodyMetrics,
      legacyArchive: state.legacyArchive
    };
    const jsonStr = JSON.stringify(payload);
    const checksum = sha256Hex(jsonStr);
    const summary = {
      sessionsCount: state.sessions.length,
      setsCount: totalSets,
      planVersionsCount: state.planVersions.length,
      bodyMetricsCount: state.bodyMetrics.length,
      legacyCount: state.legacyArchive.length
    };
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO cloud_backups (id, user_id, label, trigger_type, summary_json, snapshot_json, checksum_sha256, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, userId, label, triggerType, JSON.stringify(summary), jsonStr, checksum, now);

    return {
      id,
      label,
      triggerType,
      summary,
      checksumSha256: checksum,
      createdAt: now
    };
  }

  // ==================== PUBLIC ROUTES ====================
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', product: 'VOXA', timestamp: new Date().toISOString() });
  });

  app.get('/api/public/catalog', (_req, res) => {
    res.json(getPublicCatalog());
  });

  // ==================== AUTH ROUTES ====================
  app.post('/api/auth/register', async (req, res) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      const displayName = String(req.body?.displayName || '').trim() || email.split('@')[0];
      const preferredLang = req.body?.language === 'en' ? 'en' : 'ar';

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ error: 'INVALID_EMAIL', message: 'Valid email is required.' });
        return;
      }
      if (password.length < 8) {
        res.status(400).json({ error: 'WEAK_PASSWORD', message: 'Password must be at least 8 characters.' });
        return;
      }

      const exists = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email);
      if (exists) {
        res.status(409).json({ error: 'EMAIL_EXISTS', message: 'An account with this email already exists.' });
        return;
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const userId = crypto.randomUUID();
      const now = new Date().toISOString();

      // CRITICAL RULE (Section 11): First user is NEVER automatically granted owner role!
      // Owner role is assigned ONLY if VOXA_OWNER_EMAIL is explicitly configured on server and matches.
      const configuredOwnerEmail = (process.env.VOXA_OWNER_EMAIL || '').trim().toLowerCase();
      const role: 'user' | 'owner' =
        configuredOwnerEmail && configuredOwnerEmail === email ? 'owner' : 'user';

      db.prepare(
        `INSERT INTO users (id, email, password_hash, display_name, email_verified, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, ?, ?)`
      ).run(userId, email, passwordHash, displayName, role, now, now);

      initializeUserDefaults(db, userId, preferredLang);

      // Create email verification token
      const verifyRaw = crypto.randomBytes(20).toString('hex');
      db.prepare(
        `INSERT INTO auth_tokens (id, user_id, token_hash, type, expires_at, user_agent, created_at)
         VALUES (?, ?, ?, 'verify_email', ?, '', ?)`
      ).run(crypto.randomUUID(), userId, sha256Hex(verifyRaw), Date.now() + 24 * 3600 * 1000, now);

      const sessionToken = issueSession(res, userId, String(req.headers['user-agent'] || ''));
      const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);

      res.status(201).json({
        user: {
          id: userId,
          email,
          displayName,
          emailVerified: false,
          role,
          createdAt: now
        },
        token: sessionToken,
        emailVerification: {
          smtpConfigured,
          // In local sandbox when external SMTP is not configured, expose verification code honestly for testing
          sandboxVerificationToken: smtpConfigured ? undefined : verifyRaw
        }
      });
    } catch (err) {
      res.status(500).json({ error: 'REGISTER_FAILED', message: 'Registration could not be completed.' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      const row = db
        .prepare(`SELECT id, email, password_hash, display_name, email_verified, role, created_at FROM users WHERE email = ?`)
        .get(email) as any;

      if (!row || !row.password_hash) {
        res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' });
        return;
      }

      const valid = await bcrypt.compare(password, row.password_hash);
      if (!valid) {
        res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' });
        return;
      }

      const token = issueSession(res, row.id, String(req.headers['user-agent'] || ''));
      res.json({
        user: {
          id: row.id,
          email: row.email,
          displayName: row.display_name,
          emailVerified: Boolean(row.email_verified),
          role: row.role,
          createdAt: row.created_at
        },
        token
      });
    } catch {
      res.status(500).json({ error: 'LOGIN_FAILED', message: 'Sign-in failed.' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    const u = extractUser(req);
    if (u && req.rawToken) {
      db.prepare(`DELETE FROM auth_tokens WHERE token_hash = ?`).run(sha256Hex(req.rawToken));
    }
    res.clearCookie('voxa_session', { path: '/' });
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({ user: req.user });
  });

  app.post('/api/auth/verify-email', (req, res) => {
    const rawToken = String(req.body?.token || '').trim();
    if (!rawToken) {
      res.status(400).json({ error: 'MISSING_TOKEN', message: 'Verification token is required.' });
      return;
    }
    const hash = sha256Hex(rawToken);
    const tRow = db
      .prepare(`SELECT id, user_id, expires_at, used_at FROM auth_tokens WHERE token_hash = ? AND type = 'verify_email'`)
      .get(hash) as any;

    if (!tRow || tRow.used_at || tRow.expires_at < Date.now()) {
      res.status(400).json({ error: 'INVALID_OR_EXPIRED_TOKEN', message: 'Invalid or expired verification token.' });
      return;
    }

    const now = new Date().toISOString();
    const tx = db.transaction(() => {
      db.prepare(`UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?`).run(now, tRow.user_id);
      db.prepare(`UPDATE auth_tokens SET used_at = ? WHERE id = ?`).run(Date.now(), tRow.id);
    });
    tx();
    res.json({ ok: true, emailVerified: true });
  });

  app.post('/api/auth/forgot-password', (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);
    const u = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email) as any;

    let sandboxResetToken: string | undefined;
    if (u) {
      const raw = crypto.randomBytes(20).toString('hex');
      db.prepare(
        `INSERT INTO auth_tokens (id, user_id, token_hash, type, expires_at, user_agent, created_at)
         VALUES (?, ?, ?, 'reset_password', ?, '', ?)`
      ).run(crypto.randomUUID(), u.id, sha256Hex(raw), Date.now() + 30 * 60 * 1000, new Date().toISOString());
      if (!smtpConfigured) {
        sandboxResetToken = raw;
      }
    }

    res.json({
      ok: true,
      smtpConfigured,
      sandboxResetToken,
      notice: smtpConfigured
        ? 'If the account exists, a reset email has been dispatched.'
        : 'SMTP provider is not configured in environment; sandbox reset token generated locally for testing.'
    });
  });

  app.post('/api/auth/reset-password', async (req, res) => {
    const rawToken = String(req.body?.token || '').trim();
    const newPassword = String(req.body?.newPassword || '');
    if (!rawToken || newPassword.length < 8) {
      res.status(400).json({ error: 'INVALID_INPUT', message: 'Valid reset token and 8+ char password required.' });
      return;
    }

    const hash = sha256Hex(rawToken);
    const tRow = db
      .prepare(`SELECT id, user_id, expires_at, used_at FROM auth_tokens WHERE token_hash = ? AND type = 'reset_password'`)
      .get(hash) as any;

    if (!tRow || tRow.used_at || tRow.expires_at < Date.now()) {
      res.status(400).json({ error: 'INVALID_OR_EXPIRED_TOKEN', message: 'Invalid or expired reset token.' });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const now = new Date().toISOString();
    const tx = db.transaction(() => {
      db.prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`).run(passwordHash, now, tRow.user_id);
      db.prepare(`UPDATE auth_tokens SET used_at = ? WHERE id = ?`).run(Date.now(), tRow.id);
      // Revoke existing sessions for security
      db.prepare(`DELETE FROM auth_tokens WHERE user_id = ? AND type = 'session'`).run(tRow.user_id);
    });
    tx();
    res.json({ ok: true });
  });

  // Real Google OAuth 2.0 endpoints (honest status when unconfigured)
  app.get('/api/auth/google/status', (_req, res) => {
    const configured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    res.json({
      configured,
      requiredEnv: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'],
      callbackPath: '/api/auth/google/callback'
    });
  });

  app.get('/api/auth/google/start', (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      res.status(503).json({
        error: 'GOOGLE_OAUTH_NOT_CONFIGURED',
        message: 'Google OAuth requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.'
      });
      return;
    }
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers.host;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${proto}://${host}/api/auth/google/callback`;
    const state = crypto.randomBytes(16).toString('hex');
    res.cookie('voxa_oauth_state', state, { httpOnly: true, sameSite: 'lax', maxAge: 600000 });
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account'
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  app.get('/api/auth/google/callback', async (req, res) => {
    try {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      const code = String(req.query.code || '');
      const state = String(req.query.state || '');
      if (!clientId || !clientSecret || !code || state !== req.cookies?.voxa_oauth_state) {
        res.status(400).send('Invalid OAuth state or missing Google OAuth configuration.');
        return;
      }
      const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const host = req.headers.host;
      const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${proto}://${host}/api/auth/google/callback`;

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code'
        })
      });
      const tokenData = (await tokenRes.json()) as any;
      if (!tokenData.access_token) {
        res.status(400).send('Google token exchange failed.');
        return;
      }

      const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      });
      const profile = (await profileRes.json()) as any;
      const email = String(profile.email || '').toLowerCase();
      const sub = String(profile.sub || '');
      if (!email || !sub) {
        res.status(400).send('Google account did not provide email.');
        return;
      }

      const now = new Date().toISOString();
      let userRow = db.prepare(`SELECT id FROM users WHERE google_sub = ? OR email = ?`).get(sub, email) as any;
      if (!userRow) {
        const newId = crypto.randomUUID();
        const configuredOwnerEmail = (process.env.VOXA_OWNER_EMAIL || '').trim().toLowerCase();
        const role = configuredOwnerEmail && configuredOwnerEmail === email ? 'owner' : 'user';
        db.prepare(
          `INSERT INTO users (id, email, password_hash, display_name, email_verified, google_sub, role, created_at, updated_at)
           VALUES (?, ?, NULL, ?, 1, ?, ?, ?, ?)`
        ).run(newId, email, profile.name || email.split('@')[0], sub, role, now, now);
        initializeUserDefaults(db, newId, 'ar');
        userRow = { id: newId };
      } else {
        db.prepare(`UPDATE users SET google_sub = ?, email_verified = 1, updated_at = ? WHERE id = ?`).run(
          sub,
          now,
          userRow.id
        );
      }

      issueSession(res, userRow.id, String(req.headers['user-agent'] || ''));
      res.clearCookie('voxa_oauth_state');
      res.redirect('/');
    } catch {
      res.status(500).send('OAuth callback processing failed.');
    }
  });

  // ==================== USER STATE & ISOLATED ACCESS ====================
  app.get('/api/state', requireAuth, (req, res) => {
    const userId = req.user!.id;
    res.json({
      user: req.user,
      ...assembleUserState(userId),
      catalog: getPublicCatalog()
    });
  });

  // Direct session access check (enforces strict user isolation — Acceptance Test #12)
  app.get('/api/sessions/:id', requireAuth, (req, res) => {
    const sessionId = String(req.params.id);
    const row = db.prepare(`SELECT * FROM workout_sessions WHERE id = ?`).get(sessionId) as any;
    if (!row || row.deleted_at) {
      res.status(404).json({ error: 'NOT_FOUND' });
      return;
    }
    if (row.user_id !== req.user!.id) {
      res.status(403).json({ error: 'FORBIDDEN_CROSS_ACCOUNT', message: 'Access to another user record is denied.' });
      return;
    }
    const state = assembleUserState(req.user!.id);
    const full = state.sessions.find((s) => s.id === sessionId);
    res.json({ session: full });
  });

  // ==================== IDEMPOTENT SYNC & CONFLICT ENGINE ====================
  app.post('/api/sync/push', requireAuth, (req, res) => {
    const userId = req.user!.id;
    const mutations: any[] = Array.isArray(req.body?.mutations) ? req.body.mutations : [];
    const results: any[] = [];
    const nowIso = new Date().toISOString();

    for (const mut of mutations) {
      const mutationId = String(mut?.mutationId || '');
      const type = String(mut?.type || '');
      const deviceId = String(mut?.deviceId || 'unknown_device');
      const p = mut?.payload || {};

      if (!mutationId || !type) {
        results.push({ mutationId, status: 'invalid' });
        continue;
      }

      // Check idempotency table first so retried offline requests NEVER duplicate sessions or sets!
      const already = db
        .prepare(`SELECT result_json FROM processed_mutations WHERE mutation_id = ? AND user_id = ?`)
        .get(mutationId, userId) as any;
      if (already) {
        results.push({ ...JSON.parse(already.result_json), deduplicated: true });
        continue;
      }

      try {
        let outcome: any = { mutationId, status: 'applied' };

        const runMut = db.transaction(() => {
          switch (type) {
            case 'START_SESSION': {
              const s = p.session as WorkoutSessionRecord;
              // Prevent cross-user ID collision
              const foreignCheck = db.prepare(`SELECT user_id FROM workout_sessions WHERE id = ?`).get(s.id) as any;
              if (foreignCheck && foreignCheck.user_id !== userId) {
                throw new Error('FORBIDDEN_ID');
              }
              db.prepare(
                `INSERT OR IGNORE INTO workout_sessions (
                   id, user_id, plan_version_id, day_key, sequence_index,
                   name_ar, name_en, focus_ar, focus_en, status, rest_override_sec,
                   started_at, paused_at, accumulated_pause_ms, ended_at, notes,
                   version, last_device_id, created_at, updated_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 1, ?, ?, ?)`
              ).run(
                s.id,
                userId,
                s.planVersionId || null,
                s.dayKey,
                s.sequenceIndex ?? 0,
                s.name_ar,
                s.name_en,
                s.focus_ar || '',
                s.focus_en || '',
                s.status === 'paused' ? 'paused' : 'active', // Never auto-completed on start!
                s.restOverrideSec ?? null,
                s.startedAt,
                s.pausedAt ?? null,
                s.accumulatedPauseMs ?? 0,
                s.notes || '',
                deviceId,
                nowIso,
                nowIso
              );

              for (const ex of s.exercises || []) {
                db.prepare(
                  `INSERT OR IGNORE INTO session_exercises (
                     id, session_id, user_id, order_index, exercise_id,
                     target_sets, target_reps, rest_sec, substituted_from_exercise_id,
                     substitution_reason, substituted_at, notes, version, updated_at
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
                ).run(
                  ex.id,
                  s.id,
                  userId,
                  ex.orderIndex,
                  ex.exerciseId,
                  ex.targetSets,
                  ex.targetReps,
                  ex.restSec,
                  ex.substitutedFromExerciseId || null,
                  ex.substitutionReason || null,
                  ex.substitutedAt || null,
                  ex.notes || '',
                  nowIso
                );

                for (const st of ex.sets || []) {
                  db.prepare(
                    `INSERT OR IGNORE INTO workout_sets (
                       id, session_id, session_exercise_id, user_id, exercise_id,
                       set_index, set_type, weight_kg, entered_unit, reps, rir,
                       done, completed_at, version, last_device_id, created_at, updated_at
                     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
                  ).run(
                    st.id,
                    s.id,
                    ex.id,
                    userId,
                    st.exerciseId,
                    st.setIndex,
                    st.setType || 'working',
                    st.weightKg ?? null,
                    st.enteredUnit || 'kg',
                    st.reps ?? null,
                    st.rir ?? null,
                    st.done ? 1 : 0,
                    st.completedAt ?? null,
                    deviceId,
                    nowIso,
                    nowIso
                  );
                }
              }
              break;
            }

            case 'UPSERT_SET': {
              const st = p.set as WorkoutSetRecord;
              const baseVersion = typeof p.baseVersion === 'number' ? p.baseVersion : 0;

              // Verify session belongs to user
              const sessOwner = db
                .prepare(`SELECT user_id FROM workout_sessions WHERE id = ?`)
                .get(st.sessionId) as any;
              if (!sessOwner || sessOwner.user_id !== userId) {
                throw new Error('SESSION_NOT_FOUND_OR_FORBIDDEN');
              }

              const existing = db
                .prepare(`SELECT * FROM workout_sets WHERE id = ? AND user_id = ?`)
                .get(st.id, userId) as any;

              if (!existing) {
                db.prepare(
                  `INSERT INTO workout_sets (
                     id, session_id, session_exercise_id, user_id, exercise_id,
                     set_index, set_type, weight_kg, entered_unit, reps, rir,
                     done, completed_at, version, last_device_id, created_at, updated_at
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
                ).run(
                  st.id,
                  st.sessionId,
                  st.sessionExerciseId,
                  userId,
                  st.exerciseId,
                  st.setIndex,
                  st.setType || 'working',
                  st.weightKg ?? null,
                  st.enteredUnit || 'kg',
                  st.reps ?? null,
                  st.rir ?? null,
                  st.done ? 1 : 0,
                  st.completedAt ?? null,
                  deviceId,
                  nowIso,
                  nowIso
                );
                outcome = { mutationId, status: 'applied', newVersion: 1 };
              } else {
                const sameValues =
                  (existing.weight_kg ?? null) === (st.weightKg ?? null) &&
                  (existing.reps ?? null) === (st.reps ?? null) &&
                  (existing.rir ?? null) === (st.rir ?? null) &&
                  Boolean(existing.done) === Boolean(st.done) &&
                  existing.set_type === (st.setType || 'working');

                const isConflictingConcurrentEdit =
                  !sameValues &&
                  existing.last_device_id &&
                  existing.last_device_id !== deviceId &&
                  baseVersion < existing.version;

                if (isConflictingConcurrentEdit) {
                  // Preserve BOTH versions without silent overwrite!
                  const serverSnap: WorkoutSetRecord = {
                    id: existing.id,
                    sessionId: existing.session_id,
                    sessionExerciseId: existing.session_exercise_id,
                    exerciseId: existing.exercise_id,
                    setIndex: existing.set_index,
                    setType: existing.set_type,
                    weightKg: existing.weight_kg,
                    enteredUnit: existing.entered_unit,
                    reps: existing.reps,
                    rir: existing.rir,
                    done: Boolean(existing.done),
                    completedAt: existing.completed_at,
                    version: existing.version,
                    lastDeviceId: existing.last_device_id,
                    updatedAt: existing.updated_at
                  };
                  const clientSnap: WorkoutSetRecord = {
                    ...st,
                    version: baseVersion + 1,
                    lastDeviceId: deviceId,
                    updatedAt: nowIso
                  };
                  const conflictId = crypto.randomUUID();
                  db.prepare(
                    `INSERT INTO sync_conflicts (
                       id, user_id, entity_type, entity_id, session_id, exercise_id,
                       server_snapshot_json, client_snapshot_json, status, created_at
                     ) VALUES (?, ?, 'workout_set', ?, ?, ?, ?, ?, 'open', ?)`
                  ).run(
                    conflictId,
                    userId,
                    existing.id,
                    existing.session_id,
                    existing.exercise_id,
                    JSON.stringify(serverSnap),
                    JSON.stringify(clientSnap),
                    nowIso
                  );
                  outcome = { mutationId, status: 'conflict', conflictId };
                } else {
                  const nextVer = existing.version + 1;
                  db.prepare(
                    `UPDATE workout_sets
                     SET set_index = ?, set_type = ?, weight_kg = ?, entered_unit = ?,
                         reps = ?, rir = ?, done = ?, completed_at = ?,
                         version = ?, last_device_id = ?, deleted_at = NULL, updated_at = ?
                     WHERE id = ? AND user_id = ?`
                  ).run(
                    st.setIndex,
                    st.setType || 'working',
                    st.weightKg ?? null,
                    st.enteredUnit || 'kg',
                    st.reps ?? null,
                    st.rir ?? null,
                    st.done ? 1 : 0,
                    st.completedAt ?? null,
                    nextVer,
                    deviceId,
                    nowIso,
                    st.id,
                    userId
                  );
                  outcome = { mutationId, status: 'applied', newVersion: nextVer };
                }
              }
              break;
            }

            case 'DELETE_SET': {
              const setId = String(p.setId || '');
              const baseVersion = typeof p.baseVersion === 'number' ? p.baseVersion : 999999;
              const existing = db
                .prepare(`SELECT * FROM workout_sets WHERE id = ? AND user_id = ?`)
                .get(setId, userId) as any;
              if (existing) {
                // Safe deletion policy: if another device updated the set more recently, do not silently delete!
                if (existing.last_device_id !== deviceId && baseVersion < existing.version) {
                  outcome = { mutationId, status: 'delete_blocked_newer_version' };
                } else {
                  db.prepare(
                    `UPDATE workout_sets SET deleted_at = ?, version = version + 1, updated_at = ? WHERE id = ? AND user_id = ?`
                  ).run(nowIso, nowIso, setId, userId);
                }
              }
              break;
            }

            case 'SUBSTITUTE_EXERCISE': {
              const sessionExerciseId = String(p.sessionExerciseId || '');
              const newExerciseId = String(p.newExerciseId || '');
              const reason = String(p.reason || 'equipment_busy');
              const substitutedAt = Number(p.substitutedAt) || Date.now();
              const newRestSec = Number(p.restSec) || 90;
              const newTargetReps = String(p.targetReps || '8-12');

              const block = db
                .prepare(`SELECT * FROM session_exercises WHERE id = ? AND user_id = ?`)
                .get(sessionExerciseId, userId) as any;
              if (!block) throw new Error('BLOCK_NOT_FOUND');

              const originalId = block.substituted_from_exercise_id || block.exercise_id;
              db.prepare(
                `UPDATE session_exercises
                 SET exercise_id = ?, substituted_from_exercise_id = ?, substitution_reason = ?,
                     substituted_at = ?, rest_sec = ?, target_reps = ?, version = version + 1, updated_at = ?
                 WHERE id = ? AND user_id = ?`
              ).run(
                newExerciseId,
                originalId,
                reason,
                substitutedAt,
                newRestSec,
                newTargetReps,
                nowIso,
                sessionExerciseId,
                userId
              );

              // Update sets in THIS session block to belong to newExerciseId so substitute history NEVER mixes with original!
              db.prepare(
                `UPDATE workout_sets
                 SET exercise_id = ?, version = version + 1, last_device_id = ?, updated_at = ?
                 WHERE session_exercise_id = ? AND user_id = ?`
              ).run(newExerciseId, deviceId, nowIso, sessionExerciseId, userId);
              break;
            }

            case 'ADD_SESSION_EXERCISE': {
              const ex = p.exerciseBlock as SessionExerciseRecord;
              db.prepare(
                `INSERT OR IGNORE INTO session_exercises (
                   id, session_id, user_id, order_index, exercise_id,
                   target_sets, target_reps, rest_sec, notes, version, updated_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
              ).run(
                ex.id,
                ex.sessionId,
                userId,
                ex.orderIndex,
                ex.exerciseId,
                ex.targetSets,
                ex.targetReps,
                ex.restSec,
                ex.notes || '',
                nowIso
              );
              for (const st of ex.sets || []) {
                db.prepare(
                  `INSERT OR IGNORE INTO workout_sets (
                     id, session_id, session_exercise_id, user_id, exercise_id,
                     set_index, set_type, weight_kg, entered_unit, reps, rir,
                     done, completed_at, version, last_device_id, created_at, updated_at
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
                ).run(
                  st.id,
                  ex.sessionId,
                  ex.id,
                  userId,
                  st.exerciseId,
                  st.setIndex,
                  st.setType || 'working',
                  st.weightKg ?? null,
                  st.enteredUnit || 'kg',
                  st.reps ?? null,
                  st.rir ?? null,
                  st.done ? 1 : 0,
                  st.completedAt ?? null,
                  deviceId,
                  nowIso,
                  nowIso
                );
              }
              break;
            }

            case 'UPDATE_SESSION_META': {
              const sessionId = String(p.sessionId || '');
              const status = p.status === 'paused' ? 'paused' : 'active';
              db.prepare(
                `UPDATE workout_sessions
                 SET status = ?, paused_at = ?, accumulated_pause_ms = ?,
                     rest_override_sec = ?, notes = ?, version = version + 1,
                     last_device_id = ?, updated_at = ?
                 WHERE id = ? AND user_id = ? AND status IN ('active', 'paused')`
              ).run(
                status,
                p.pausedAt ?? null,
                p.accumulatedPauseMs ?? 0,
                p.restOverrideSec ?? null,
                p.notes ?? '',
                deviceId,
                nowIso,
                sessionId,
                userId
              );
              break;
            }

            case 'FINISH_SESSION': {
              const sessionId = String(p.sessionId || '');
              const endedAt = Number(p.endedAt) || Date.now();
              const sess = db
                .prepare(`SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?`)
                .get(sessionId, userId) as any;
              if (sess && sess.status !== 'completed') {
                db.prepare(
                  `UPDATE workout_sessions
                   SET status = 'completed', paused_at = NULL, ended_at = ?,
                       accumulated_pause_ms = ?, notes = COALESCE(?, notes),
                       version = version + 1, last_device_id = ?, updated_at = ?
                   WHERE id = ? AND user_id = ?`
                ).run(
                  endedAt,
                  p.accumulatedPauseMs ?? sess.accumulated_pause_ms,
                  p.notes ?? null,
                  deviceId,
                  nowIso,
                  sessionId,
                  userId
                );

                // Advance flexible sequence pointer to NEXT training day (never merging missed days!)
                const planRow = db
                  .prepare(`SELECT days_json FROM plan_versions WHERE user_id = ? AND is_active = 1 LIMIT 1`)
                  .get(userId) as any;
                const days = planRow ? JSON.parse(planRow.days_json) : DEFAULT_UPPER_LOWER_DAYS;
                const trainingIndices = days
                  .map((d: any, idx: number) => ({ d, idx }))
                  .filter((x: any) => !x.d.isRest && x.d.items?.length > 0)
                  .map((x: any) => x.idx);

                if (trainingIndices.length > 0) {
                  const curSeq = sess.sequence_index ?? 0;
                  const pos = trainingIndices.indexOf(curSeq);
                  const nextSeq =
                    pos >= 0
                      ? trainingIndices[(pos + 1) % trainingIndices.length]
                      : trainingIndices[0];
                  db.prepare(
                    `UPDATE user_settings SET sequence_pointer = ?, version = version + 1, updated_at = ? WHERE user_id = ?`
                  ).run(nextSeq, nowIso, userId);
                }
              }
              break;
            }

            case 'CANCEL_SESSION': {
              const sessionId = String(p.sessionId || '');
              db.prepare(
                `UPDATE workout_sessions
                 SET status = 'cancelled', ended_at = ?, version = version + 1, updated_at = ?
                 WHERE id = ? AND user_id = ?`
              ).run(Date.now(), nowIso, sessionId, userId);
              break;
            }

            case 'SAVE_PLAN_VERSION': {
              const maxRow = db
                .prepare(`SELECT COALESCE(MAX(version_number), 0) AS max_v FROM plan_versions WHERE user_id = ?`)
                .get(userId) as any;
              const nextV = (maxRow?.max_v || 0) + 1;
              db.prepare(`UPDATE plan_versions SET is_active = 0 WHERE user_id = ?`).run(userId);
              const newPlanId = p.id || crypto.randomUUID();
              db.prepare(
                `INSERT INTO plan_versions (
                   id, user_id, version_number, is_active, schedule_mode,
                   name_ar, name_en, days_json, change_note, created_at
                 ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`
              ).run(
                newPlanId,
                userId,
                nextV,
                p.scheduleMode || 'flexible',
                p.name_ar || 'خطة Upper / Lower المخصصة',
                p.name_en || 'Customized Upper / Lower Plan',
                JSON.stringify(p.days || DEFAULT_UPPER_LOWER_DAYS),
                String(p.changeNote || ''),
                nowIso
              );
              if (p.scheduleMode) {
                db.prepare(`UPDATE user_settings SET schedule_mode = ?, updated_at = ? WHERE user_id = ?`).run(
                  p.scheduleMode,
                  nowIso,
                  userId
                );
              }
              break;
            }

            case 'UPDATE_SETTINGS': {
              const cur = db.prepare(`SELECT * FROM user_settings WHERE user_id = ?`).get(userId) as any;
              if (cur) {
                db.prepare(
                  `UPDATE user_settings
                   SET language = ?, weight_unit = ?, length_unit = ?, default_rest_sec = ?,
                       auto_start_rest = ?, hide_warmup_in_volume = ?, schedule_mode = ?,
                       sequence_pointer = ?, rest_days_json = ?, reminder_enabled = ?,
                       reminder_time = ?, goal = ?, experience = ?, favorites_json = ?,
                       version = version + 1, updated_at = ?
                   WHERE user_id = ?`
                ).run(
                  p.language ?? cur.language,
                  p.weightUnit ?? cur.weight_unit,
                  p.lengthUnit ?? cur.length_unit,
                  p.defaultRestSec ?? cur.default_rest_sec,
                  p.autoStartRest !== undefined ? (p.autoStartRest ? 1 : 0) : cur.auto_start_rest,
                  p.hideWarmupInVolume !== undefined ? (p.hideWarmupInVolume ? 1 : 0) : cur.hide_warmup_in_volume,
                  p.scheduleMode ?? cur.schedule_mode,
                  p.sequencePointer ?? cur.sequence_pointer,
                  p.restDays ? JSON.stringify(p.restDays) : cur.rest_days_json,
                  p.reminderEnabled !== undefined ? (p.reminderEnabled ? 1 : 0) : cur.reminder_enabled,
                  p.reminderTime ?? cur.reminder_time,
                  p.goal ?? cur.goal,
                  p.experience ?? cur.experience,
                  p.favorites ? JSON.stringify(p.favorites) : cur.favorites_json,
                  nowIso,
                  userId
                );
              }
              break;
            }

            case 'UPSERT_BODY_METRIC': {
              const m = p.metric as BodyMetricRecord;
              db.prepare(
                `INSERT INTO body_metrics (
                   id, user_id, recorded_date, weight_kg, height_cm, waist_cm, chest_cm,
                   arm_cm, thigh_cm, body_fat_pct, custom_metrics_json,
                   entered_weight_unit, entered_length_unit, notes, version, created_at, updated_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                 ON CONFLICT(id) DO UPDATE SET
                   recorded_date = excluded.recorded_date,
                   weight_kg = excluded.weight_kg,
                   height_cm = excluded.height_cm,
                   waist_cm = excluded.waist_cm,
                   chest_cm = excluded.chest_cm,
                   arm_cm = excluded.arm_cm,
                   thigh_cm = excluded.thigh_cm,
                   body_fat_pct = excluded.body_fat_pct,
                   custom_metrics_json = excluded.custom_metrics_json,
                   entered_weight_unit = excluded.entered_weight_unit,
                   entered_length_unit = excluded.entered_length_unit,
                   notes = excluded.notes,
                   deleted_at = NULL,
                   version = body_metrics.version + 1,
                   updated_at = excluded.updated_at
                 WHERE body_metrics.user_id = ?`
              ).run(
                m.id,
                userId,
                m.recordedDate,
                m.weightKg ?? null,
                m.heightCm ?? null,
                m.waistCm ?? null,
                m.chestCm ?? null,
                m.armCm ?? null,
                m.thighCm ?? null,
                m.bodyFatPct ?? null,
                JSON.stringify(m.customMetrics || {}),
                m.enteredWeightUnit || 'kg',
                m.enteredLengthUnit || 'cm',
                m.notes || '',
                nowIso,
                nowIso,
                userId
              );
              break;
            }

            case 'DELETE_BODY_METRIC': {
              db.prepare(`UPDATE body_metrics SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?`).run(
                nowIso,
                nowIso,
                String(p.metricId || ''),
                userId
              );
              break;
            }

            default:
              outcome = { mutationId, status: 'unknown_mutation_type' };
          }

          db.prepare(
            `INSERT INTO processed_mutations (mutation_id, user_id, processed_at, result_json)
             VALUES (?, ?, ?, ?)`
          ).run(mutationId, userId, nowIso, JSON.stringify(outcome));
        });

        runMut();
        results.push(outcome);
      } catch (err: any) {
        results.push({ mutationId, status: 'error', message: err?.message || 'Mutation error' });
      }
    }

    res.json({
      results,
      state: assembleUserState(userId)
    });
  });

  // Resolve a sync conflict while keeping unselected version archived & recoverable!
  app.post('/api/sync/conflicts/:id/resolve', requireAuth, (req, res) => {
    const userId = req.user!.id;
    const conflictId = String(req.params.id);
    const choose: 'server' | 'client' = req.body?.choose === 'client' ? 'client' : 'server';

    const row = db
      .prepare(`SELECT * FROM sync_conflicts WHERE id = ? AND user_id = ?`)
      .get(conflictId, userId) as any;
    if (!row) {
      res.status(404).json({ error: 'CONFLICT_NOT_FOUND' });
      return;
    }

    const serverSnap = JSON.parse(row.server_snapshot_json) as WorkoutSetRecord;
    const clientSnap = JSON.parse(row.client_snapshot_json) as WorkoutSetRecord;
    const winner = choose === 'client' ? clientSnap : serverSnap;
    const archivedOther = choose === 'client' ? serverSnap : clientSnap;
    const nowIso = new Date().toISOString();

    const tx = db.transaction(() => {
      db.prepare(
        `UPDATE workout_sets
         SET set_type = ?, weight_kg = ?, entered_unit = ?, reps = ?, rir = ?,
             done = ?, completed_at = ?, version = version + 1, updated_at = ?
         WHERE id = ? AND user_id = ?`
      ).run(
        winner.setType || 'working',
        winner.weightKg ?? null,
        winner.enteredUnit || 'kg',
        winner.reps ?? null,
        winner.rir ?? null,
        winner.done ? 1 : 0,
        winner.completedAt ?? null,
        nowIso,
        row.entity_id,
        userId
      );

      db.prepare(
        `UPDATE sync_conflicts
         SET status = 'resolved', chosen_side = ?, archived_other_json = ?, resolved_at = ?
         WHERE id = ? AND user_id = ?`
      ).run(choose, JSON.stringify(archivedOther), nowIso, conflictId, userId);
    });
    tx();

    res.json({ ok: true, state: assembleUserState(userId) });
  });

  // Restore the archived unselected version of a resolved conflict
  app.post('/api/sync/conflicts/:id/restore-other', requireAuth, (req, res) => {
    const userId = req.user!.id;
    const conflictId = String(req.params.id);
    const row = db
      .prepare(`SELECT * FROM sync_conflicts WHERE id = ? AND user_id = ?`)
      .get(conflictId, userId) as any;

    if (!row || !row.archived_other_json) {
      res.status(404).json({ error: 'NO_ARCHIVED_VERSION' });
      return;
    }

    const toRestore = JSON.parse(row.archived_other_json) as WorkoutSetRecord;
    const currentSet = db
      .prepare(`SELECT * FROM workout_sets WHERE id = ? AND user_id = ?`)
      .get(row.entity_id, userId) as any;
    const nowIso = new Date().toISOString();

    const previousWinnerSnap: WorkoutSetRecord | null = currentSet
      ? {
          id: currentSet.id,
          sessionId: currentSet.session_id,
          sessionExerciseId: currentSet.session_exercise_id,
          exerciseId: currentSet.exercise_id,
          setIndex: currentSet.set_index,
          setType: currentSet.set_type,
          weightKg: currentSet.weight_kg,
          enteredUnit: currentSet.entered_unit,
          reps: currentSet.reps,
          rir: currentSet.rir,
          done: Boolean(currentSet.done),
          completedAt: currentSet.completed_at,
          version: currentSet.version,
          lastDeviceId: currentSet.last_device_id,
          updatedAt: currentSet.updated_at
        }
      : null;

    const tx = db.transaction(() => {
      db.prepare(
        `UPDATE workout_sets
         SET set_type = ?, weight_kg = ?, entered_unit = ?, reps = ?, rir = ?,
             done = ?, completed_at = ?, version = version + 1, updated_at = ?
         WHERE id = ? AND user_id = ?`
      ).run(
        toRestore.setType || 'working',
        toRestore.weightKg ?? null,
        toRestore.enteredUnit || 'kg',
        toRestore.reps ?? null,
        toRestore.rir ?? null,
        toRestore.done ? 1 : 0,
        toRestore.completedAt ?? null,
        nowIso,
        row.entity_id,
        userId
      );

      db.prepare(
        `UPDATE sync_conflicts
         SET chosen_side = CASE WHEN chosen_side = 'client' THEN 'server' ELSE 'client' END,
             archived_other_json = ?, resolved_at = ?
         WHERE id = ? AND user_id = ?`
      ).run(previousWinnerSnap ? JSON.stringify(previousWinnerSnap) : row.archived_other_json, nowIso, conflictId, userId);
    });
    tx();

    res.json({ ok: true, state: assembleUserState(userId) });
  });

  // ==================== LEGACY IRON SYSTEM (ironsys_v2) MIGRATION ====================
  function computeLegacyFingerprint(sess: any): string {
    const canonical = JSON.stringify({
      startedAt: sess.startedAt || 0,
      endedAt: sess.endedAt || 0,
      dayIdx: sess.dayIdx ?? null,
      name: sess.name || '',
      exercises: (sess.exercises || []).map((e: any) => ({
        exerciseId: e.exerciseId,
        sets: (e.sets || []).map((st: any) => ({
          w: Number(st.weight) || 0,
          r: Number(st.reps) || 0
        }))
      }))
    });
    return sha256Hex(canonical);
  }

  function validateLegacyPayload(data: any) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('INVALID_JSON_OBJECT');
    }
    if (!Array.isArray(data.sessions)) {
      throw new Error('MISSING_SESSIONS_ARRAY');
    }
    return data;
  }

  app.post('/api/legacy/preview', requireAuth, (req, res) => {
    try {
      const userId = req.user!.id;
      const data = validateLegacyPayload(req.body?.data);
      const existingFps = new Set(
        (
          db.prepare(`SELECT fingerprint FROM legacy_archive WHERE user_id = ?`).all(userId) as any[]
        ).map((r) => r.fingerprint)
      );

      let newSessions = 0;
      let duplicateSessions = 0;
      let totalSets = 0;
      const seenInFile = new Set<string>();

      for (const s of data.sessions) {
        if (!s || typeof s !== 'object') continue;
        const fp = computeLegacyFingerprint(s);
        if (existingFps.has(fp) || seenInFile.has(fp)) {
          duplicateSessions++;
        } else {
          seenInFile.add(fp);
          newSessions++;
        }
        for (const e of s.exercises || []) {
          totalSets += Array.isArray(e.sets) ? e.sets.length : 0;
        }
      }

      const favoritesCount = Array.isArray(data.favorites) ? data.favorites.length : 0;
      const imageEntries =
        data.exerciseImages && typeof data.exerciseImages === 'object'
          ? Object.entries(data.exerciseImages).filter(([, u]) => typeof u === 'string' && u.trim().length > 0)
          : [];

      res.json({
        valid: true,
        sourceDetected: 'IRON SYSTEM (ironsys_v2)',
        preview: {
          totalSessionsInFile: data.sessions.length,
          newSessionsToArchive: newSessions,
          duplicateSessionsSkipped: duplicateSessions,
          totalSetsInFile: totalSets,
          hasActiveIncompleteLegacySession: Boolean(data.activeSession),
          favoritesCount,
          unverifiedDraftImagesCount: imageEntries.length,
          legacyUnits: data.settings?.units === 'lb' ? 'lb' : 'kg'
        }
      });
    } catch (err: any) {
      res.status(400).json({ valid: false, error: err?.message || 'INVALID_LEGACY_FILE' });
    }
  });

  app.post('/api/legacy/import', requireAuth, (req, res) => {
    try {
      const userId = req.user!.id;
      if (req.body?.confirm !== true) {
        res.status(400).json({ error: 'CONFIRMATION_REQUIRED' });
        return;
      }
      const data = validateLegacyPayload(req.body?.data);
      const mergeFavorites = req.body?.mergeFavorites !== false;

      // 1. Always preserve a backup snapshot of current VOXA state BEFORE any import!
      const preSnapshot = createCloudSnapshotInternal(
        userId,
        'Pre-Legacy-Import Automatic Safety Snapshot',
        'auto_pre_import'
      );

      const nowIso = new Date().toISOString();
      let importedCount = 0;
      let skippedDuplicates = 0;

      const insertLegacy = db.prepare(`
        INSERT OR IGNORE INTO legacy_archive (
          id, user_id, fingerprint, source_system, imported_at,
          original_session_id, session_name, focus, started_at, ended_at, raw_payload_json, read_only
        ) VALUES (?, ?, ?, 'IRON SYSTEM (ironsys_v2)', ?, ?, ?, ?, ?, ?, ?, 1)
      `);

      const tx = db.transaction(() => {
        for (const s of data.sessions) {
          if (!s || typeof s !== 'object') continue;
          const fp = computeLegacyFingerprint(s);
          const info = insertLegacy.run(
            crypto.randomUUID(),
            userId,
            fp,
            nowIso,
            s.id ? String(s.id) : null,
            String(s.name || 'Legacy Session'),
            String(s.focus || ''),
            typeof s.startedAt === 'number' ? s.startedAt : null,
            typeof s.endedAt === 'number' ? s.endedAt : null,
            JSON.stringify({ ...s, legacyUnits: data.settings?.units || 'kg' })
          );
          if (info.changes > 0) importedCount++;
          else skippedDuplicates++;
        }

        // Non-destructively union favorites if requested
        if (mergeFavorites && Array.isArray(data.favorites) && data.favorites.length > 0) {
          const curRow = db.prepare(`SELECT favorites_json FROM user_settings WHERE user_id = ?`).get(userId) as any;
          const curFavs: string[] = curRow ? JSON.parse(curRow.favorites_json || '[]') : [];
          const merged = Array.from(new Set([...curFavs, ...data.favorites.map(String)]));
          db.prepare(`UPDATE user_settings SET favorites_json = ?, updated_at = ? WHERE user_id = ?`).run(
            JSON.stringify(merged),
            nowIso,
            userId
          );
        }

        // Any legacy exerciseImages lack verified license/source -> store strictly as unpublished 'draft' for review!
        if (data.exerciseImages && typeof data.exerciseImages === 'object') {
          for (const [exId, urlVal] of Object.entries(data.exerciseImages)) {
            const cleanUrl = String(urlVal || '').trim();
            if (!cleanUrl) continue;
            const exExists = db.prepare(`SELECT id FROM exercises WHERE id = ?`).get(exId);
            if (!exExists) continue;
            const dupImg = db
              .prepare(`SELECT id FROM exercise_images WHERE exercise_id = ? AND image_url = ?`)
              .get(exId, cleanUrl);
            if (!dupImg) {
              db.prepare(
                `INSERT INTO exercise_images (
                   id, exercise_id, image_url, source_name, source_url, license,
                   status, review_notes, is_illustration, submitted_by, created_at, updated_at
                 ) VALUES (?, ?, ?, '', '', '', 'draft', 'Imported from legacy ironsys_v2 without license proof; kept unpublished.', 0, ?, ?, ?)`
              ).run(crypto.randomUUID(), exId, cleanUrl, userId, nowIso, nowIso);
            }
          }
        }
      });

      tx();
      res.json({
        ok: true,
        importedCount,
        skippedDuplicates,
        preImportBackup: preSnapshot,
        state: assembleUserState(userId)
      });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'IMPORT_FAILED' });
    }
  });

  // ==================== CLOUD SNAPSHOTS & SAFE RESTORE ====================
  app.post('/api/backups/create', requireAuth, (req, res) => {
    const userId = req.user!.id;
    const label = String(req.body?.label || '').trim() || `Manual Cloud Snapshot (${new Date().toISOString().slice(0, 16)})`;
    const created = createCloudSnapshotInternal(userId, label, 'manual');
    res.json({ ok: true, backup: created, state: assembleUserState(userId) });
  });

  app.get('/api/backups/:id/download', requireAuth, (req, res) => {
    const userId = req.user!.id;
    const row = db
      .prepare(`SELECT snapshot_json, checksum_sha256, created_at FROM cloud_backups WHERE id = ? AND user_id = ?`)
      .get(String(req.params.id), userId) as any;
    if (!row) {
      res.status(404).json({ error: 'NOT_FOUND' });
      return;
    }
    const parsed = JSON.parse(row.snapshot_json);
    res.json({
      ...parsed,
      checksumSha256: row.checksum_sha256
    });
  });

  function validateVoxaBackupObject(raw: any) {
    if (!raw || typeof raw !== 'object' || raw.schema !== 'voxa_backup_v1') {
      throw new Error('INVALID_VOXA_BACKUP_SCHEMA');
    }
    if (!Array.isArray(raw.sessions) || !Array.isArray(raw.planVersions) || !raw.settings) {
      throw new Error('CORRUPTED_BACKUP_STRUCTURE');
    }
    if (raw.checksumSha256) {
      const copy = { ...raw };
      delete copy.checksumSha256;
      const computed = sha256Hex(JSON.stringify(copy));
      if (computed !== raw.checksumSha256) {
        throw new Error('CHECKSUM_MISMATCH');
      }
    }
    return raw;
  }

  app.post('/api/backups/preview-restore', requireAuth, (req, res) => {
    try {
      const data = validateVoxaBackupObject(req.body?.backup);
      const setsCount = data.sessions.reduce(
        (sum: number, s: any) =>
          sum + (s.exercises || []).reduce((a: number, e: any) => a + (e.sets?.length || 0), 0),
        0
      );
      res.json({
        valid: true,
        summary: {
          createdAt: data.createdAt,
          sessionsCount: data.sessions.length,
          setsCount,
          planVersionsCount: data.planVersions.length,
          bodyMetricsCount: Array.isArray(data.bodyMetrics) ? data.bodyMetrics.length : 0,
          legacyCount: Array.isArray(data.legacyArchive) ? data.legacyArchive.length : 0
        }
      });
    } catch (err: any) {
      res.status(400).json({ valid: false, error: err?.message || 'INVALID_BACKUP' });
    }
  });

  app.post('/api/backups/restore', requireAuth, (req, res) => {
    try {
      const userId = req.user!.id;
      if (req.body?.confirm !== true) {
        res.status(400).json({ error: 'CONFIRMATION_REQUIRED' });
        return;
      }

      let data: any;
      if (req.body?.backupId) {
        const snapRow = db
          .prepare(`SELECT snapshot_json, checksum_sha256 FROM cloud_backups WHERE id = ? AND user_id = ?`)
          .get(String(req.body.backupId), userId) as any;
        if (!snapRow) {
          res.status(404).json({ error: 'BACKUP_NOT_FOUND' });
          return;
        }
        data = validateVoxaBackupObject({
          ...JSON.parse(snapRow.snapshot_json),
          checksumSha256: snapRow.checksum_sha256
        });
      } else {
        data = validateVoxaBackupObject(req.body?.backup);
      }

      // 1. Capture pre-restore safety snapshot FIRST
      const preRestoreSnap = createCloudSnapshotInternal(
        userId,
        'Pre-Restore Automatic Safety Snapshot',
        'auto_pre_restore'
      );

      const nowIso = new Date().toISOString();

      // 2. Atomic restore inside SQLite transaction (rolls back completely if any error occurs!)
      const restoreTx = db.transaction(() => {
        db.prepare(`DELETE FROM workout_sets WHERE user_id = ?`).run(userId);
        db.prepare(`DELETE FROM session_exercises WHERE user_id = ?`).run(userId);
        db.prepare(`DELETE FROM workout_sessions WHERE user_id = ?`).run(userId);
        db.prepare(`DELETE FROM plan_versions WHERE user_id = ?`).run(userId);
        db.prepare(`DELETE FROM body_metrics WHERE user_id = ?`).run(userId);
        db.prepare(`DELETE FROM legacy_archive WHERE user_id = ?`).run(userId);

        const st = data.settings;
        db.prepare(
          `UPDATE user_settings
           SET language = ?, weight_unit = ?, length_unit = ?, default_rest_sec = ?,
               auto_start_rest = ?, hide_warmup_in_volume = ?, schedule_mode = ?,
               sequence_pointer = ?, rest_days_json = ?, reminder_enabled = ?,
               reminder_time = ?, goal = ?, experience = ?, favorites_json = ?,
               version = version + 1, updated_at = ?
           WHERE user_id = ?`
        ).run(
          st.language === 'en' ? 'en' : 'ar',
          st.weightUnit === 'lb' ? 'lb' : 'kg',
          st.lengthUnit === 'in' ? 'in' : 'cm',
          Number(st.defaultRestSec) || 90,
          st.autoStartRest ? 1 : 0,
          st.hideWarmupInVolume !== false ? 1 : 0,
          st.scheduleMode === 'fixed' ? 'fixed' : 'flexible',
          Number(st.sequencePointer) || 0,
          JSON.stringify(st.restDays || [5]),
          st.reminderEnabled ? 1 : 0,
          st.reminderTime || '18:00',
          st.goal || '',
          st.experience || 'intermediate',
          JSON.stringify(st.favorites || []),
          nowIso,
          userId
        );

        for (const pv of data.planVersions) {
          db.prepare(
            `INSERT INTO plan_versions (
               id, user_id, version_number, is_active, schedule_mode, name_ar, name_en, days_json, change_note, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            crypto.randomUUID(),
            userId,
            pv.versionNumber,
            pv.isActive ? 1 : 0,
            pv.scheduleMode || 'flexible',
            pv.name_ar,
            pv.name_en,
            JSON.stringify(pv.days),
            pv.changeNote || '',
            pv.createdAt || nowIso
          );
        }

        for (const sess of data.sessions) {
          const newSessId = sess.id || crypto.randomUUID();
          db.prepare(
            `INSERT INTO workout_sessions (
               id, user_id, plan_version_id, day_key, sequence_index,
               name_ar, name_en, focus_ar, focus_en, status, rest_override_sec,
               started_at, paused_at, accumulated_pause_ms, ended_at, notes,
               version, last_device_id, created_at, updated_at
             ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'restored', ?, ?)`
          ).run(
            newSessId,
            userId,
            sess.dayKey || 'sat',
            sess.sequenceIndex ?? 0,
            sess.name_ar,
            sess.name_en,
            sess.focus_ar || '',
            sess.focus_en || '',
            sess.status || 'completed',
            sess.restOverrideSec ?? null,
            sess.startedAt,
            sess.pausedAt ?? null,
            sess.accumulatedPauseMs ?? 0,
            sess.endedAt ?? null,
            sess.notes || '',
            sess.version || 1,
            nowIso,
            nowIso
          );

          for (const ex of sess.exercises || []) {
            const newBlockId = ex.id || crypto.randomUUID();
            db.prepare(
              `INSERT INTO session_exercises (
                 id, session_id, user_id, order_index, exercise_id,
                 target_sets, target_reps, rest_sec, substituted_from_exercise_id,
                 substitution_reason, substituted_at, notes, version, updated_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
            ).run(
              newBlockId,
              newSessId,
              userId,
              ex.orderIndex ?? 0,
              ex.exerciseId,
              ex.targetSets || 3,
              ex.targetReps || '8-12',
              ex.restSec || 90,
              ex.substitutedFromExerciseId || null,
              ex.substitutionReason || null,
              ex.substitutedAt || null,
              ex.notes || '',
              nowIso
            );

            for (const sItem of ex.sets || []) {
              db.prepare(
                `INSERT INTO workout_sets (
                   id, session_id, session_exercise_id, user_id, exercise_id,
                   set_index, set_type, weight_kg, entered_unit, reps, rir,
                   done, completed_at, version, last_device_id, created_at, updated_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'restored', ?, ?)`
              ).run(
                sItem.id || crypto.randomUUID(),
                newSessId,
                newBlockId,
                userId,
                sItem.exerciseId,
                sItem.setIndex ?? 0,
                sItem.setType || 'working',
                sItem.weightKg ?? null,
                sItem.enteredUnit || 'kg',
                sItem.reps ?? null,
                sItem.rir ?? null,
                sItem.done ? 1 : 0,
                sItem.completedAt ?? null,
                sItem.version || 1,
                nowIso,
                nowIso
              );
            }
          }
        }

        for (const bm of data.bodyMetrics || []) {
          db.prepare(
            `INSERT INTO body_metrics (
               id, user_id, recorded_date, weight_kg, height_cm, waist_cm, chest_cm,
               arm_cm, thigh_cm, body_fat_pct, custom_metrics_json,
               entered_weight_unit, entered_length_unit, notes, version, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
          ).run(
            bm.id || crypto.randomUUID(),
            userId,
            bm.recordedDate,
            bm.weightKg ?? null,
            bm.heightCm ?? null,
            bm.waistCm ?? null,
            bm.chestCm ?? null,
            bm.armCm ?? null,
            bm.thighCm ?? null,
            bm.bodyFatPct ?? null,
            JSON.stringify(bm.customMetrics || {}),
            bm.enteredWeightUnit || 'kg',
            bm.enteredLengthUnit || 'cm',
            bm.notes || '',
            nowIso,
            nowIso
          );
        }

        for (const lg of data.legacyArchive || []) {
          db.prepare(
            `INSERT OR IGNORE INTO legacy_archive (
               id, user_id, fingerprint, source_system, imported_at,
               original_session_id, session_name, focus, started_at, ended_at, raw_payload_json, read_only
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
          ).run(
            crypto.randomUUID(),
            userId,
            lg.fingerprint || sha256Hex(JSON.stringify(lg.rawPayload || lg)),
            lg.sourceSystem || 'IRON SYSTEM (ironsys_v2)',
            lg.importedAt || nowIso,
            lg.originalSessionId || null,
            lg.sessionName || 'Legacy Session',
            lg.focus || '',
            lg.startedAt ?? null,
            lg.endedAt ?? null,
            JSON.stringify(lg.rawPayload || {})
          );
        }

        initializeUserDefaults(db, userId);
      });

      restoreTx();
      res.json({
        ok: true,
        preRestoreBackup: preRestoreSnap,
        state: assembleUserState(userId)
      });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'RESTORE_FAILED' });
    }
  });

  // ==================== ACCOUNT EXPORT & PERMANENT DELETION ====================
  app.get('/api/account/export', requireAuth, (req, res) => {
    const userId = req.user!.id;
    const state = assembleUserState(userId);
    const payload = {
      schema: 'voxa_backup_v1',
      createdAt: new Date().toISOString(),
      settings: state.settings,
      planVersions: state.planVersions,
      sessions: state.sessions,
      bodyMetrics: state.bodyMetrics,
      legacyArchive: state.legacyArchive
    };
    const checksumSha256 = sha256Hex(JSON.stringify(payload));
    res.json({ ...payload, checksumSha256 });
  });

  app.delete('/api/account', requireAuth, (req, res) => {
    const userId = req.user!.id;
    const confirmText = String(req.body?.confirmText || '').trim();
    if (confirmText !== 'DELETE') {
      res.status(400).json({ error: 'CONFIRM_DELETE_REQUIRED', message: 'Type DELETE to confirm account deletion.' });
      return;
    }
    db.prepare(`DELETE FROM users WHERE id = ?`).run(userId);
    res.clearCookie('voxa_session', { path: '/' });
    res.json({
      ok: true,
      deletedCloudData: true,
      localDownloadsNotice:
        'Cloud data associated with your account has been permanently removed. Previously downloaded local JSON/CSV files remain on your device unless deleted manually.'
    });
  });

  // ==================== OWNER ADMIN CONSOLE (SERVER-ENFORCED) ====================
  app.post('/api/admin/claim-owner', requireAuth, (req, res) => {
    const provided = String(req.body?.ownerSecret || '').trim();
    const expected = getOwnerSecret();
    if (!provided || !safeEqual(provided, expected)) {
      res.status(403).json({ error: 'INVALID_OWNER_SECRET', message: 'Invalid server owner secret.' });
      return;
    }

    const existingOwner = db
      .prepare(`SELECT id FROM users WHERE role = 'owner' AND id <> ?`)
      .get(req.user!.id) as any;
    if (existingOwner && process.env.VOXA_ALLOW_OWNER_ROTATION !== 'true') {
      res.status(409).json({
        error: 'SINGLE_OWNER_ALREADY_ASSIGNED',
        message: 'A single authorized Owner is already registered for VOXA.'
      });
      return;
    }

    const nowIso = new Date().toISOString();
    const tx = db.transaction(() => {
      db.prepare(`UPDATE users SET role = 'owner', updated_at = ? WHERE id = ?`).run(nowIso, req.user!.id);
      db.prepare(
        `INSERT INTO admin_audit_logs (id, actor_user_id, action, target_type, target_id, details_json, created_at)
         VALUES (?, ?, 'CLAIM_OWNER_ROLE', 'user', ?, ?, ?)`
      ).run(crypto.randomUUID(), req.user!.id, req.user!.id, JSON.stringify({ email: req.user!.email }), nowIso);
    });
    tx();

    res.json({ ok: true, role: 'owner' });
  });

  app.get('/api/admin/overview', requireOwner, (_req, res) => {
    const exRows = db.prepare(`SELECT id, is_custom, data_json, published, updated_at FROM exercises ORDER BY rowid DESC`).all() as any[];
    const imgRows = db
      .prepare(`SELECT * FROM exercise_images ORDER BY updated_at DESC`)
      .all() as any[];
    const auditRows = db
      .prepare(
        `SELECT a.*, u.email AS actor_email
         FROM admin_audit_logs a
         LEFT JOIN users u ON u.id = a.actor_user_id
         ORDER BY a.created_at DESC LIMIT 100`
      )
      .all() as any[];

    res.json({
      exercises: exRows.map((r) => ({
        id: r.id,
        isCustom: Boolean(r.is_custom),
        published: Boolean(r.published),
        updatedAt: r.updated_at,
        data: JSON.parse(r.data_json)
      })),
      images: imgRows.map((r) => ({
        id: r.id,
        exerciseId: r.exercise_id,
        imageUrl: r.image_url,
        sourceName: r.source_name,
        sourceUrl: r.source_url,
        license: r.license,
        status: r.status,
        reviewNotes: r.review_notes,
        isIllustration: Boolean(r.is_illustration),
        updatedAt: r.updated_at
      })),
      auditLogs: auditRows.map((a) => ({
        id: a.id,
        actorEmail: a.actor_email || a.actor_user_id,
        action: a.action,
        targetType: a.target_type,
        targetId: a.target_id,
        details: JSON.parse(a.details_json || '{}'),
        createdAt: a.created_at
      }))
    });
  });

  app.post('/api/admin/exercises', requireOwner, (req, res) => {
    const ex = req.body?.exercise as ExerciseData;
    const published = req.body?.published !== false;
    if (!ex || !ex.id || !ex.ar || !ex.en || !ex.primary) {
      res.status(400).json({ error: 'INVALID_EXERCISE_DATA', message: 'id, ar, en, and primary muscle are required.' });
      return;
    }
    const cleanId = ex.id.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const fullEx: ExerciseData = {
      ...ex,
      id: cleanId,
      secondary: ex.secondary || [],
      steps_ar: ex.steps_ar || [],
      steps_en: ex.steps_en || [],
      cues_ar: ex.cues_ar || [],
      cues_en: ex.cues_en || [],
      mistakes_ar: ex.mistakes_ar || [],
      mistakes_en: ex.mistakes_en || [],
      alts: ex.alts || []
    };
    const nowIso = new Date().toISOString();

    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO exercises (id, is_custom, data_json, published, updated_by, created_at, updated_at)
         VALUES (?, 1, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           data_json = excluded.data_json,
           published = excluded.published,
           updated_by = excluded.updated_by,
           updated_at = excluded.updated_at`
      ).run(cleanId, JSON.stringify(fullEx), published ? 1 : 0, req.user!.id, nowIso, nowIso);

      db.prepare(
        `INSERT INTO admin_audit_logs (id, actor_user_id, action, target_type, target_id, details_json, created_at)
         VALUES (?, ?, 'UPSERT_EXERCISE', 'exercise', ?, ?, ?)`
      ).run(
        crypto.randomUUID(),
        req.user!.id,
        cleanId,
        JSON.stringify({ ar: fullEx.ar, en: fullEx.en, published }),
        nowIso
      );
    });
    tx();
    res.json({ ok: true, exercise: fullEx });
  });

  app.post('/api/admin/images', requireOwner, (req, res) => {
    const exerciseId = String(req.body?.exerciseId || '').trim();
    const imageUrl = String(req.body?.imageUrl || '').trim();
    const sourceName = String(req.body?.sourceName || '').trim();
    const sourceUrl = String(req.body?.sourceUrl || '').trim();
    const license = String(req.body?.license || '').trim();
    const requestedStatus = String(req.body?.status || 'draft');
    const reviewNotes = String(req.body?.reviewNotes || '').trim();

    if (!exerciseId || !imageUrl) {
      res.status(400).json({ error: 'MISSING_FIELDS', message: 'exerciseId and imageUrl are required.' });
      return;
    }

    // CRITICAL RULE (Section 8 & Test #13): Never publish an image without documented source, sourceUrl, and license!
    if (requestedStatus === 'published' && (!sourceName || !sourceUrl || !license)) {
      res.status(400).json({
        error: 'PROVENANCE_REQUIRED_FOR_PUBLISH',
        message: 'Cannot publish an image without documented sourceName, sourceUrl, and license.'
      });
      return;
    }

    const validStatus = ['draft', 'pending_review', 'published', 'rejected'].includes(requestedStatus)
      ? requestedStatus
      : 'draft';

    const imgId = req.body?.id || crypto.randomUUID();
    const nowIso = new Date().toISOString();

    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO exercise_images (
           id, exercise_id, image_url, source_name, source_url, license,
           status, review_notes, is_illustration, submitted_by, reviewed_by, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           image_url = excluded.image_url,
           source_name = excluded.source_name,
           source_url = excluded.source_url,
           license = excluded.license,
           status = excluded.status,
           review_notes = excluded.review_notes,
           reviewed_by = excluded.reviewed_by,
           updated_at = excluded.updated_at`
      ).run(
        imgId,
        exerciseId,
        imageUrl,
        sourceName,
        sourceUrl,
        license,
        validStatus,
        reviewNotes,
        req.user!.id,
        req.user!.id,
        nowIso,
        nowIso
      );

      db.prepare(
        `INSERT INTO admin_audit_logs (id, actor_user_id, action, target_type, target_id, details_json, created_at)
         VALUES (?, ?, 'MODERATE_EXERCISE_IMAGE', 'exercise_image', ?, ?, ?)`
      ).run(
        crypto.randomUUID(),
        req.user!.id,
        imgId,
        JSON.stringify({ exerciseId, status: validStatus, sourceName, license }),
        nowIso
      );
    });
    tx();

    res.json({ ok: true, id: imgId, status: validStatus });
  });

  // ==================== STATIC FRONTEND & PWA SERVING ====================
  const builtDir = path.resolve(process.cwd(), 'public_app');
  const publicDir = path.resolve(process.cwd(), 'public');

  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
  }
  if (fs.existsSync(builtDir)) {
    app.use(express.static(builtDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(builtDir, 'index.html'));
    });
  }

  return app;
}
