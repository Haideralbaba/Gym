import React, { useState } from 'react';
import { Play, AlertTriangle, Calendar, ChevronDown, ChevronUp, Dumbbell } from 'lucide-react';
import type {
  ExerciseData,
  Lang,
  PlanDay,
  PlanVersion,
  UserProfile,
  UserSettings,
  WorkoutSessionRecord
} from '../types';
import { TRANSLATIONS } from '../i18n/translations';
import { fromCanonicalKgNum, formatDurationMs } from '../utils/units';
import { DEFAULT_UPPER_LOWER_DAYS } from '../data/defaultPlan';

interface Props {
  lang: Lang;
  user: UserProfile | null;
  isGuest: boolean;
  settings: UserSettings;
  activePlan: PlanVersion | null;
  sessions: WorkoutSessionRecord[];
  exercisesMap: Record<string, ExerciseData>;
  openConflictsCount: number;
  onStartDaySession: (day: PlanDay, seqIdx: number) => void;
  onResumeActiveSession: () => void;
  onCancelActiveSession: () => void;
  onNavigate: (tab: 'plan' | 'workout' | 'library' | 'progress' | 'settings') => void;
  onRequireAuth: () => void;
}

export const DashboardView: React.FC<Props> = ({
  lang,
  user,
  isGuest,
  settings,
  activePlan,
  sessions,
  exercisesMap,
  openConflictsCount,
  onStartDaySession,
  onResumeActiveSession,
  onCancelActiveSession,
  onNavigate,
  onRequireAuth
}) => {
  const t = TRANSLATIONS[lang];
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);

  const days = activePlan?.days?.length ? activePlan.days : DEFAULT_UPPER_LOWER_DAYS;
  const activeSession = sessions.find((s) => s.status === 'active' || s.status === 'paused') || null;
  const completedSessions = sessions
    .filter((s) => s.status === 'completed')
    .sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0));

  // Determine scheduled day cleanly according to mode
  let targetSeqIdx = 0;
  let scheduledDay: PlanDay = days[0];
  if (settings.scheduleMode === 'flexible') {
    const ptr = Math.max(0, Math.min(days.length - 1, settings.sequencePointer || 0));
    if (!days[ptr]?.isRest) {
      targetSeqIdx = ptr;
      scheduledDay = days[ptr];
    } else {
      const nextTrainIdx = days.findIndex((d) => !d.isRest && d.items.length > 0);
      targetSeqIdx = nextTrainIdx >= 0 ? nextTrainIdx : 0;
      scheduledDay = days[targetSeqIdx];
    }
  } else {
    const todayW = new Date().getDay();
    const foundIdx = days.findIndex((d) => d.weekday === todayW);
    targetSeqIdx = foundIdx >= 0 ? foundIdx : 0;
    scheduledDay = days[targetSeqIdx];
  }

  // Honest 7-day metrics
  const cutoff7d = Date.now() - 7 * 86400000;
  const recent7d = completedSessions.filter((s) => (s.endedAt || 0) >= cutoff7d);
  let weekWorkingSets = 0;
  const musclesSet = new Set<string>();
  for (const s of recent7d) {
    for (const exB of s.exercises) {
      const doneSets = exB.sets.filter(
        (st) => st.done && (!settings.hideWarmupInVolume || st.setType === 'working')
      );
      weekWorkingSets += doneSets.length;
      if (doneSets.length > 0) {
        const meta = exercisesMap[exB.exerciseId];
        if (meta) {
          musclesSet.add(meta.primary);
          (meta.secondary || []).forEach((m) => musclesSet.add(m));
        }
      }
    }
  }

  const todayFormatted = new Date().toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });

  return (
    <div>
      <div className="page-head">
        <h1>
          {user ? `${t.dashboard.welcomeBack} ${user.displayName}` : t.dashboard.title}
        </h1>
        <p>{todayFormatted}</p>
      </div>

      {openConflictsCount > 0 && (
        <div
          className="notice-box notice-danger"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, cursor: 'pointer' }}
          onClick={() => onNavigate('progress')}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
            <AlertTriangle size={16} />
            {t.dashboard.openConflictsAlert} ({openConflictsCount})
          </span>
          <span style={{ textDecoration: 'underline', fontSize: 12 }}>
            {lang === 'ar' ? 'مراجعة' : 'Review'}
          </span>
        </div>
      )}

      {/* Active Incomplete Session Card */}
      {activeSession && !isGuest && (
        <div className="card card-gold" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span className="badge badge-gold">
              {activeSession.status === 'paused' ? t.dashboard.pausedBadge : t.dashboard.activeSessionBadge}
            </span>
            <span className="badge num">
              {activeSession.exercises.reduce((a, e) => a + e.sets.filter((st) => st.done).length, 0)} /{' '}
              {activeSession.exercises.reduce((a, e) => a + e.sets.length, 0)}{' '}
              {lang === 'ar' ? 'مجموعة' : 'sets'}
            </span>
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>
            {lang === 'ar' ? activeSession.name_ar : activeSession.name_en}
          </h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
            {lang === 'ar' ? activeSession.focus_ar : activeSession.focus_en}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-gold" style={{ flex: 1 }} onClick={onResumeActiveSession}>
              <Play size={15} />
              <span>{t.dashboard.resumeSession}</span>
            </button>
            <button className="btn btn-danger btn-sm" onClick={onCancelActiveSession}>
              {t.dashboard.discardSession}
            </button>
          </div>
        </div>
      )}

      {/* Next / Today's Scheduled Session */}
      <div className="card" style={{ borderColor: scheduledDay.isRest ? 'var(--line)' : 'var(--gold-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--gold-light)' }}>
            {settings.scheduleMode === 'flexible' ? t.dashboard.nextWorkout : t.dashboard.todayWorkout}
          </span>
          <span className="badge">
            <Calendar size={12} />
            {settings.scheduleMode === 'flexible' ? t.dashboard.sequenceModeTag : t.dashboard.fixedModeTag}
          </span>
        </div>

        {scheduledDay.isRest ? (
          <div>
            <h2 style={{ fontSize: 19, fontWeight: 800, marginBottom: 4 }}>{t.dashboard.restDayTitle}</h2>
            <p style={{ fontSize: 13.5, color: 'var(--muted)', marginBottom: 12 }}>{t.dashboard.restDaySub}</p>
            <button className="btn btn-ghost" onClick={() => onNavigate('plan')}>
              {t.workout.goToPlan}
            </button>
          </div>
        ) : (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>
              {lang === 'ar' ? scheduledDay.name_ar : scheduledDay.name_en}
            </h2>
            <p style={{ fontSize: 13.5, color: 'var(--muted)', marginBottom: 12 }}>
              {lang === 'ar' ? scheduledDay.focus_ar : scheduledDay.focus_en}
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {scheduledDay.items.map((it, idx) => {
                const ex = exercisesMap[it.exerciseId];
                return (
                  <span key={idx} className="badge">
                    {ex ? (lang === 'ar' ? ex.ar : ex.en) : it.exerciseId}{' '}
                    <strong className="num" style={{ color: 'var(--gold-light)' }}>
                      {it.sets}×{it.reps}
                    </strong>
                  </span>
                );
              })}
            </div>

            <button
              className="btn btn-gold btn-block"
              onClick={() => {
                if (isGuest) {
                  onRequireAuth();
                } else if (activeSession) {
                  onResumeActiveSession();
                } else {
                  onStartDaySession(scheduledDay, targetSeqIdx);
                }
              }}
            >
              <Dumbbell size={16} />
              <span>
                {activeSession && !isGuest ? t.dashboard.resumeSession : t.dashboard.startSession}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* 7-Day Summary */}
      <div className="section-header">
        <span>{t.dashboard.weekSummary}</span>
      </div>
      <div className="grid grid-3">
        <div className="stat-box">
          <div className="val num">{isGuest ? '—' : weekWorkingSets}</div>
          <div className="lbl">{t.dashboard.workingSets}</div>
        </div>
        <div className="stat-box">
          <div className="val num">{isGuest ? '—' : recent7d.length}</div>
          <div className="lbl">{t.dashboard.completedSessions}</div>
        </div>
        <div className="stat-box">
          <div className="val num">{isGuest ? '—' : musclesSet.size}</div>
          <div className="lbl">{t.dashboard.musclesCovered}</div>
        </div>
      </div>

      {/* Recent Performance Log */}
      <div className="section-header">
        <span>{t.dashboard.lastPerformance}</span>
        {completedSessions.length > 0 && (
          <button
            style={{ fontSize: 12.5, color: 'var(--gold-light)', fontWeight: 600 }}
            onClick={() => onNavigate('progress')}
          >
            {t.dashboard.viewAllHistory}
          </button>
        )}
      </div>

      {completedSessions.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '28px 18px' }}>
          <h3 style={{ fontSize: 15.5, fontWeight: 700, marginBottom: 4 }}>{t.dashboard.noSessionsYet}</h3>
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>{t.dashboard.noSessionsHint}</p>
        </div>
      ) : (
        completedSessions.slice(0, 4).map((sess) => {
          const isOpen = expandedSessionId === sess.id;
          const activeMs = Math.max(
            0,
            (sess.endedAt || sess.startedAt) - sess.startedAt - (sess.accumulatedPauseMs || 0)
          );
          return (
            <div key={sess.id} className="card" style={{ padding: 14 }}>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => setExpandedSessionId(isOpen ? null : sess.id)}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14.5 }}>
                    {lang === 'ar' ? sess.name_ar : sess.name_en}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    {new Date(sess.endedAt || sess.startedAt).toLocaleDateString(
                      lang === 'ar' ? 'ar-EG' : 'en-US',
                      { day: 'numeric', month: 'short', year: 'numeric' }
                    )}{' '}
                    • <span className="num">{formatDurationMs(activeMs)}</span> •{' '}
                    <span className="num">{sess.exercises.length}</span> {t.plan.exercisesCount}
                  </div>
                </div>
                <button className="btn btn-ghost btn-sm" aria-label="Toggle details">
                  {isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
              </div>

              {isOpen && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line)', display: 'grid', gap: 8 }}>
                  {sess.exercises.map((eb) => {
                    const meta = exercisesMap[eb.exerciseId];
                    const doneSets = eb.sets.filter((st) => st.done);
                    return (
                      <div key={eb.id} style={{ fontSize: 12.5 }}>
                        <div style={{ fontWeight: 700 }}>
                          {meta ? (lang === 'ar' ? meta.ar : meta.en) : eb.exerciseId}
                          {eb.substitutedFromExerciseId && (
                            <span className="badge badge-warn" style={{ marginInlineStart: 6 }}>
                              {t.workout.substitutedFrom}{' '}
                              {lang === 'ar'
                                ? exercisesMap[eb.substitutedFromExerciseId]?.ar
                                : exercisesMap[eb.substitutedFromExerciseId]?.en}
                            </span>
                          )}
                        </div>
                        <div className="num" style={{ color: 'var(--muted)', marginTop: 2 }}>
                          {doneSets.length > 0
                            ? doneSets
                                .map(
                                  (st, idx) =>
                                    `#${idx + 1}${st.setType === 'warmup' ? '(W)' : ''}: ${fromCanonicalKgNum(
                                      st.weightKg,
                                      settings.weightUnit
                                    )}${settings.weightUnit}×${st.reps}`
                                )
                                .join('  •  ')
                            : '—'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};
