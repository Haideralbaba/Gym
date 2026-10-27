import React, { useEffect, useState } from 'react';
import {
  Pause,
  Play,
  CheckCircle2,
  RefreshCw,
  Timer,
  Plus,
  Trash2,
  Info,
  Sparkles,
  X
} from 'lucide-react';
import type {
  ExerciseData,
  ExerciseImageRecord,
  Lang,
  SessionExerciseRecord,
  SyncState,
  UserSettings,
  WorkoutSessionRecord,
  WorkoutSetRecord
} from '../types';
import { TRANSLATIONS } from '../i18n/translations';
import { MUSCLES_MAP } from '../data/seedMuscles';
import { rankSubstitutions } from '../data/defaultPlan';
import {
  fromCanonicalKg,
  fromCanonicalKgNum,
  toCanonicalKg,
  formatDurationMs
} from '../utils/units';
import { evaluateProgression } from '../utils/progression';
import { ExerciseMedia } from '../components/ExerciseMedia';

interface Props {
  lang: Lang;
  isGuest: boolean;
  syncState: SyncState;
  settings: UserSettings;
  activeSession: WorkoutSessionRecord | null;
  completedSessions: WorkoutSessionRecord[];
  exercises: ExerciseData[];
  exercisesMap: Record<string, ExerciseData>;
  publishedImages: ExerciseImageRecord[];
  onUpsertSet: (sessionExerciseId: string, updatedSet: WorkoutSetRecord, triggerRestSec?: number) => void;
  onAddSet: (sessionExerciseId: string, setType: 'working' | 'warmup') => void;
  onDeleteSet: (sessionExerciseId: string, setId: string) => void;
  onSubstituteExercise: (
    sessionExerciseId: string,
    newExerciseId: string,
    reason: string,
    restSec: number,
    targetReps: string
  ) => void;
  onAddSessionExercise: (exerciseId: string) => void;
  onTogglePauseSession: () => void;
  onUpdateSessionRestOverride: (sec: number | null) => void;
  onFinishSession: (notes: string) => void;
  onStartRestTimer: (sec: number) => void;
  onOpenExerciseDetail: (exId: string) => void;
  onGoToPlan: () => void;
}

export const WorkoutView: React.FC<Props> = ({
  lang,
  syncState,
  settings,
  activeSession,
  completedSessions,
  exercises,
  exercisesMap,
  publishedImages,
  onUpsertSet,
  onAddSet,
  onDeleteSet,
  onSubstituteExercise,
  onAddSessionExercise,
  onTogglePauseSession,
  onUpdateSessionRestOverride,
  onFinishSession,
  onStartRestTimer,
  onOpenExerciseDetail,
  onGoToPlan
}) => {
  const t = TRANSLATIONS[lang];
  const [selectedExIdx, setSelectedExIdx] = useState(0);
  const [nowTick, setNowTick] = useState(Date.now());
  const [subModalForBlock, setSubModalForBlock] = useState<SessionExerciseRecord | null>(null);
  const [subReason, setSubReason] = useState('equipment_busy');
  const [subSearch, setSubSearch] = useState('');
  const [subTab, setSubTab] = useState<'smart' | 'manual'>('smart');
  const [finishModalOpen, setFinishModalOpen] = useState(false);
  const [sessionNotes, setSessionNotes] = useState(activeSession?.notes || '');
  const [addExModalOpen, setAddExModalOpen] = useState(false);
  const [dismissedOverloadIds, setDismissedOverloadIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (activeSession && selectedExIdx >= activeSession.exercises.length) {
      setSelectedExIdx(Math.max(0, activeSession.exercises.length - 1));
    }
  }, [activeSession, selectedExIdx]);

  if (!activeSession) {
    return (
      <div>
        <div className="page-head">
          <h1>{t.workout.title}</h1>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '42px 20px' }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>{t.workout.noActiveTitle}</h2>
          <p style={{ fontSize: 13.5, color: 'var(--muted)', marginBottom: 16 }}>{t.workout.noActiveSub}</p>
          <button className="btn btn-gold" onClick={onGoToPlan}>
            {t.workout.goToPlan}
          </button>
        </div>
      </div>
    );
  }

  const isPaused = activeSession.status === 'paused';
  const currentPauseExtra =
    isPaused && activeSession.pausedAt ? Math.max(0, nowTick - activeSession.pausedAt) : 0;
  const activeElapsedMs = Math.max(
    0,
    nowTick - activeSession.startedAt - (activeSession.accumulatedPauseMs || 0) - currentPauseExtra
  );

  // Honest Session Summary Counts
  let totalSetsCount = 0;
  let completedSetsCount = 0;
  let workingVolumeDisplay = 0;

  for (const exB of activeSession.exercises) {
    for (const st of exB.sets) {
      totalSetsCount++;
      if (st.done) {
        completedSetsCount++;
        const includeInVol = !settings.hideWarmupInVolume || st.setType === 'working';
        if (includeInVol && st.weightKg !== null && st.reps !== null) {
          workingVolumeDisplay += fromCanonicalKgNum(st.weightKg, settings.weightUnit) * st.reps;
        }
      }
    }
  }

  const remainingSetsCount = Math.max(0, totalSetsCount - completedSetsCount);
  const progressPct = totalSetsCount > 0 ? Math.round((completedSetsCount / totalSetsCount) * 100) : 0;

  const currentBlock = activeSession.exercises[selectedExIdx] || activeSession.exercises[0];
  const currentEx = currentBlock ? exercisesMap[currentBlock.exerciseId] : undefined;

  const effectiveRestSec =
    activeSession.restOverrideSec || currentBlock?.restSec || settings.defaultRestSec || 90;

  // Compute Conservative Progression Recommendation
  const overloadRec =
    currentEx && currentBlock
      ? evaluateProgression(currentEx, currentBlock.targetReps, completedSessions, settings.weightUnit)
      : null;

  // Direct vs Indirect historical performance for active exercise
  const sortedDone = [...completedSessions].sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0));
  const lastDirect = currentEx
    ? sortedDone
        .map((s) => {
          const b = s.exercises.find((eb) => eb.exerciseId === currentEx.id);
          const sets = (b?.sets || []).filter((st) => st.done && st.setType === 'working');
          return sets.length ? { s, sets } : null;
        })
        .find(Boolean)
    : null;

  const lastIndirectFromOriginal =
    currentBlock?.substitutedFromExerciseId
      ? sortedDone
          .map((s) => {
            const b = s.exercises.find((eb) => eb.exerciseId === currentBlock.substitutedFromExerciseId);
            const sets = (b?.sets || []).filter((st) => st.done && st.setType === 'working');
            return sets.length ? { s, sets, origId: currentBlock.substitutedFromExerciseId! } : null;
          })
          .find(Boolean)
      : null;

  function applySuggestedWeightToRemaining() {
    if (!currentBlock || !overloadRec || overloadRec.suggestedWeightKg === null) return;
    for (const st of currentBlock.sets) {
      if (!st.done && st.setType === 'working') {
        onUpsertSet(currentBlock.id, {
          ...st,
          weightKg: overloadRec.suggestedWeightKg,
          enteredUnit: settings.weightUnit
        });
      }
    }
  }

  return (
    <div>
      {/* Session Header & Honest Progress */}
      <div className="card card-gold" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
              <span className={`badge ${isPaused ? 'badge-warn' : 'badge-gold'}`}>
                {isPaused ? t.dashboard.pausedBadge : t.sync[syncState]}
              </span>
              <span className="badge num">{formatDurationMs(activeElapsedMs)}</span>
            </div>
            <h1 style={{ fontSize: 19, fontWeight: 800 }}>
              {lang === 'ar' ? activeSession.name_ar : activeSession.name_en}
            </h1>
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="btn btn-ghost btn-sm" onClick={onTogglePauseSession}>
              {isPaused ? <Play size={14} /> : <Pause size={14} />}
              <span>{isPaused ? t.workout.resume : t.workout.pause}</span>
            </button>
            <button className="btn btn-gold btn-sm" onClick={() => setFinishModalOpen(true)}>
              <CheckCircle2 size={14} />
              <span>{t.workout.finishExplicit}</span>
            </button>
          </div>
        </div>

        {/* Metrics Row */}
        <div className="grid grid-3" style={{ marginTop: 12 }}>
          <div className="stat-box" style={{ padding: 8 }}>
            <div className="val num" style={{ fontSize: 17 }}>
              {completedSetsCount}/{totalSetsCount}
            </div>
            <div className="lbl">
              {t.workout.progressSets} ({t.workout.remainingSets}: {remainingSetsCount})
            </div>
          </div>
          <div className="stat-box" style={{ padding: 8 }}>
            <div className="val num" style={{ fontSize: 17 }}>
              {Math.round(workingVolumeDisplay).toLocaleString()} {settings.weightUnit}
            </div>
            <div className="lbl">{t.workout.workingVolume}</div>
          </div>
          <div className="stat-box" style={{ padding: 8 }}>
            <div className="val num" style={{ fontSize: 17 }}>
              {formatDurationMs(activeElapsedMs)}
            </div>
            <div className="lbl">{t.workout.duration}</div>
          </div>
        </div>

        <div
          style={{
            height: 6,
            borderRadius: 99,
            background: 'var(--panel-2)',
            marginTop: 12,
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progressPct}%`,
              background: 'linear-gradient(90deg, var(--gold), var(--gold-light))',
              transition: 'width 0.25s ease'
            }}
          />
        </div>
      </div>

      {/* Horizontal Exercise Selector Tabs */}
      <div className="chip-scroll" style={{ marginBottom: 14 }}>
        {activeSession.exercises.map((eb, idx) => {
          const ex = exercisesMap[eb.exerciseId];
          const doneC = eb.sets.filter((s) => s.done).length;
          return (
            <button
              key={eb.id}
              className={`chip ${selectedExIdx === idx ? 'active' : ''}`}
              onClick={() => setSelectedExIdx(idx)}
            >
              <span>
                {idx + 1}. {ex ? (lang === 'ar' ? ex.ar : ex.en) : eb.exerciseId}
              </span>{' '}
              <span className="num" style={{ opacity: 0.8 }}>
                ({doneC}/{eb.sets.length})
              </span>
            </button>
          );
        })}
        <button className="chip" onClick={() => setAddExModalOpen(true)}>
          <Plus size={13} style={{ verticalAlign: 'middle' }} />{' '}
          {lang === 'ar' ? 'تمرين إضافي' : 'Add Exercise'}
        </button>
      </div>

      {/* Active Exercise Logging Card */}
      {currentBlock && currentEx && (
        <div className="card">
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
            <ExerciseMedia
              exercise={currentEx}
              publishedImages={publishedImages}
              lang={lang}
              size="thumb"
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div>
                  <h2 style={{ fontSize: 17, fontWeight: 800 }}>
                    {lang === 'ar' ? currentEx.ar : currentEx.en}
                  </h2>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {lang === 'ar' ? currentEx.en : currentEx.ar}
                  </div>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => onOpenExerciseDetail(currentEx.id)}
                  aria-label="Details"
                >
                  <Info size={15} />
                </button>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                <span className="badge badge-gold">
                  {lang === 'ar'
                    ? MUSCLES_MAP[currentEx.primary]?.ar
                    : MUSCLES_MAP[currentEx.primary]?.en}
                </span>
                <span className="badge">{t.equip[currentEx.equip]}</span>
                <span className="badge num">
                  {currentBlock.targetReps} {currentEx.isTimed ? 's' : ''}
                </span>
                {currentBlock.substitutedFromExerciseId && (
                  <span className="badge badge-warn">
                    {t.workout.substitutedFrom}{' '}
                    {lang === 'ar'
                      ? exercisesMap[currentBlock.substitutedFromExerciseId]?.ar
                      : exercisesMap[currentBlock.substitutedFromExerciseId]?.en}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Direct & Indirect Previous Performance Reference */}
          <div className="notice-box" style={{ marginBottom: 12 }}>
            <div>
              <strong style={{ color: 'var(--text)' }}>{t.workout.directHistory}: </strong>
              {lastDirect ? (
                <span className="num">
                  {lastDirect.sets
                    .map((st) => `${fromCanonicalKgNum(st.weightKg, settings.weightUnit)}${settings.weightUnit}×${st.reps}`)
                    .join(' • ')}
                </span>
              ) : (
                <span>{t.workout.noPreviousDirect}</span>
              )}
            </div>
            {lastIndirectFromOriginal && (
              <div style={{ marginTop: 4, color: 'var(--warn)' }}>
                <strong>
                  {t.workout.indirectHistory} (
                  {lang === 'ar'
                    ? exercisesMap[lastIndirectFromOriginal.origId]?.ar
                    : exercisesMap[lastIndirectFromOriginal.origId]?.en}
                  ):{' '}
                </strong>
                <span className="num">
                  {lastIndirectFromOriginal.sets
                    .map((st) => `${fromCanonicalKgNum(st.weightKg, settings.weightUnit)}${settings.weightUnit}×${st.reps}`)
                    .join(' • ')}
                </span>
              </div>
            )}
          </div>

          {/* Conservative Progressive Overload Card */}
          {overloadRec && !dismissedOverloadIds[currentBlock.id] && (
            <div
              className={`notice-box ${overloadRec.status === 'increase_weight' ? 'notice-gold' : ''}`}
              style={{ marginBottom: 14 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ fontWeight: 700, color: 'var(--gold-light)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={14} />
                  <span>{lang === 'ar' ? overloadRec.title_ar : overloadRec.title_en}</span>
                </div>
                {overloadRec.basis !== 'none' && (
                  <span className="badge" style={{ fontSize: 10.5 }}>
                    {overloadRec.basis === 'reps_and_rir'
                      ? t.workout.basisRepsRir
                      : t.workout.basisRepsOnly}
                  </span>
                )}
              </div>
              <p style={{ marginTop: 4 }}>
                {lang === 'ar' ? overloadRec.explanation_ar : overloadRec.explanation_en}
              </p>
              <div style={{ fontSize: 11.5, opacity: 0.85, marginTop: 3 }}>
                {lang === 'ar' ? overloadRec.evidenceSummary_ar : overloadRec.evidenceSummary_en}
              </div>

              {overloadRec.status === 'increase_weight' && overloadRec.suggestedWeightKg !== null && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="btn btn-gold btn-sm" onClick={applySuggestedWeightToRemaining}>
                    {t.workout.applySuggestedWeight}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() =>
                      setDismissedOverloadIds((p) => ({ ...p, [currentBlock.id]: true }))
                    }
                  >
                    {lang === 'ar' ? 'إبقاء الوزن الحالي' : 'Dismiss'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Set Table Header */}
          <div className="set-grid-header">
            <span>#</span>
            <span>
              {t.workout.weight} ({settings.weightUnit})
            </span>
            <span>{currentEx.isTimed ? t.workout.seconds : t.workout.reps}</span>
            <span>{t.workout.rirOptional}</span>
            <span>{t.workout.done}</span>
            <span />
          </div>

          {/* Sets Rows */}
          {currentBlock.sets.map((st, sIdx) => {
            const dispWeight = fromCanonicalKg(st.weightKg, settings.weightUnit);
            return (
              <div
                key={st.id}
                className={`set-grid-row ${st.done ? 'done' : ''} ${st.setType === 'warmup' ? 'warmup' : ''}`}
              >
                <button
                  type="button"
                  className={`badge ${st.setType === 'warmup' ? 'badge-warn' : ''}`}
                  style={{ justifyContent: 'center', cursor: 'pointer', padding: '4px 4px', fontSize: 10.5 }}
                  title={lang === 'ar' ? 'تبديل إحماء / عمل' : 'Toggle Warmup / Working'}
                  onClick={() =>
                    onUpsertSet(currentBlock.id, {
                      ...st,
                      setType: st.setType === 'warmup' ? 'working' : 'warmup'
                    })
                  }
                >
                  {st.setType === 'warmup' ? t.workout.warmupSet : `#${sIdx + 1}`}
                </button>

                <input
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  min="0"
                  className="num"
                  placeholder={currentEx.equip === 'bodyweight' ? '0' : settings.weightUnit}
                  value={dispWeight}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const kg = raw === '' ? null : toCanonicalKg(raw, settings.weightUnit);
                    onUpsertSet(currentBlock.id, {
                      ...st,
                      weightKg: kg,
                      enteredUnit: settings.weightUnit
                    });
                  }}
                />

                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  className="num"
                  placeholder={currentBlock.targetReps}
                  value={st.reps ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const r = raw === '' ? null : Math.max(0, parseInt(raw, 10) || 0);
                    onUpsertSet(currentBlock.id, {
                      ...st,
                      reps: r
                    });
                  }}
                />

                {/* Optional RIR — leaving blank is completely allowed */}
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  min="0"
                  max="10"
                  className="num"
                  placeholder="—"
                  value={st.rir ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const rirVal = raw === '' ? null : Math.max(0, Math.min(10, parseFloat(raw)));
                    onUpsertSet(currentBlock.id, {
                      ...st,
                      rir: Number.isFinite(rirVal as number) ? rirVal : null
                    });
                  }}
                />

                <button
                  type="button"
                  className="set-check-btn"
                  aria-label={t.workout.done}
                  onClick={() => {
                    if (!st.done) {
                      const resolvedWeightKg =
                        st.weightKg !== null
                          ? st.weightKg
                          : currentEx.equip === 'bodyweight'
                          ? 0
                          : null;
                      if (resolvedWeightKg === null || st.reps === null || st.reps <= 0) {
                        alert(
                          lang === 'ar'
                            ? 'يرجى إدخال الوزن وعدد التكرارات أولًا (حقل RIR اختياري).'
                            : 'Please enter weight and reps first (RIR is optional).'
                        );
                        return;
                      }
                      onUpsertSet(
                        currentBlock.id,
                        {
                          ...st,
                          weightKg: resolvedWeightKg,
                          done: true,
                          completedAt: Date.now()
                        },
                        settings.autoStartRest ? effectiveRestSec : undefined
                      );
                    } else {
                      onUpsertSet(currentBlock.id, {
                        ...st,
                        done: false,
                        completedAt: null
                      });
                    }
                  }}
                >
                  {st.done ? '✓' : '○'}
                </button>

                <button
                  type="button"
                  style={{ color: 'var(--dim)', display: 'flex', justifyContent: 'center' }}
                  aria-label="Delete set"
                  onClick={() => onDeleteSet(currentBlock.id, st.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}

          {/* Set & Exercise Actions */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => onAddSet(currentBlock.id, 'working')}
            >
              {t.workout.addWorkingSet}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => onAddSet(currentBlock.id, 'warmup')}
            >
              {t.workout.addWarmupSet}
            </button>
            <button
              className="btn btn-outline-gold btn-sm"
              onClick={() => {
                setSubModalForBlock(currentBlock);
                setSubSearch('');
              }}
            >
              <RefreshCw size={13} />
              <span>{t.workout.substituteBtn}</span>
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => onStartRestTimer(effectiveRestSec)}
            >
              <Timer size={13} />
              <span className="num">{effectiveRestSec}s</span>
            </button>
          </div>
        </div>
      )}

      {/* Session Rest Timer Presets */}
      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{t.timer.restTimer}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{t.workout.sessionRestOverride}:</span>
            <select
              style={{ width: 'auto', padding: '4px 8px', fontSize: 12 }}
              value={activeSession.restOverrideSec ?? ''}
              onChange={(e) =>
                onUpdateSessionRestOverride(e.target.value ? parseInt(e.target.value, 10) : null)
              }
            >
              <option value="">{lang === 'ar' ? 'افتراضي التمرين' : 'Per-Exercise'}</option>
              <option value="60">60s</option>
              <option value="90">90s</option>
              <option value="120">120s</option>
              <option value="150">150s</option>
              <option value="180">180s</option>
            </select>
          </div>
        </div>
        <div className="chip-scroll">
          {[45, 60, 90, 120, 150, 180].map((sec) => (
            <button key={sec} className="chip num" onClick={() => onStartRestTimer(sec)}>
              {sec}s
            </button>
          ))}
        </div>
      </div>

      {/* Exercise Substitution Modal */}
      {subModalForBlock && currentEx && (
        <div className="modal-backdrop" onClick={() => setSubModalForBlock(null)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 800 }}>{t.substitute.title}</h3>
                <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>{t.substitute.subtitle}</p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setSubModalForBlock(null)}>
                <X size={15} />
              </button>
            </div>

            <div className="field">
              <label>{t.substitute.reasonLabel}</label>
              <select value={subReason} onChange={(e) => setSubReason(e.target.value)}>
                {Object.entries(t.substitute.reasons).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="seg-tabs">
              <button className={subTab === 'smart' ? 'active' : ''} onClick={() => setSubTab('smart')}>
                {t.substitute.smartSuggestions}
              </button>
              <button className={subTab === 'manual' ? 'active' : ''} onClick={() => setSubTab('manual')}>
                {t.substitute.manualPick}
              </button>
            </div>

            {subTab === 'smart' ? (
              <div style={{ display: 'grid', gap: 8 }}>
                {rankSubstitutions(currentEx, exercises).map((cand) => (
                  <div
                    key={cand.exercise.id}
                    className="card"
                    style={{ background: 'var(--panel-2)', padding: 12 }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>
                          {lang === 'ar' ? cand.exercise.ar : cand.exercise.en}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
                          {lang === 'ar' ? cand.reason_ar : cand.reason_en}
                        </div>
                      </div>
                      <span className="badge badge-gold num">
                        {t.substitute.similarity} {cand.score}%
                      </span>
                    </div>
                    <button
                      className="btn btn-outline-gold btn-sm"
                      style={{ marginTop: 8 }}
                      onClick={() => {
                        onSubstituteExercise(
                          subModalForBlock.id,
                          cand.exercise.id,
                          subReason,
                          cand.exercise.rest,
                          cand.exercise.reps
                        );
                        setSubModalForBlock(null);
                      }}
                    >
                      {t.substitute.selectThis}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div>
                <input
                  type="search"
                  placeholder={t.library.searchPlaceholder}
                  value={subSearch}
                  onChange={(e) => setSubSearch(e.target.value)}
                  style={{ marginBottom: 10 }}
                />
                <div style={{ display: 'grid', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
                  {exercises
                    .filter(
                      (e) =>
                        e.id !== currentEx.id &&
                        (!subSearch ||
                          e.ar.includes(subSearch) ||
                          e.en.toLowerCase().includes(subSearch.toLowerCase()))
                    )
                    .map((exOpt) => (
                      <div
                        key={exOpt.id}
                        className="card"
                        style={{
                          background: 'var(--panel-2)',
                          padding: '10px 12px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                            {lang === 'ar' ? exOpt.ar : exOpt.en}
                          </div>
                          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                            {t.equip[exOpt.equip]}
                          </div>
                        </div>
                        <button
                          className="btn btn-outline-gold btn-sm"
                          onClick={() => {
                            onSubstituteExercise(
                              subModalForBlock.id,
                              exOpt.id,
                              subReason,
                              exOpt.rest,
                              exOpt.reps
                            );
                            setSubModalForBlock(null);
                          }}
                        >
                          {t.substitute.selectThis}
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Exercise to Active Session Modal */}
      {addExModalOpen && (
        <div className="modal-backdrop" onClick={() => setAddExModalOpen(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 10 }}>
              {lang === 'ar' ? 'إضافة تمرين للجلسة الحالية' : 'Add Exercise to Session'}
            </h3>
            <div style={{ display: 'grid', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
              {exercises.map((exOpt) => (
                <div
                  key={exOpt.id}
                  className="card"
                  style={{
                    background: 'var(--panel-2)',
                    padding: '10px 12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                      {lang === 'ar' ? exOpt.ar : exOpt.en}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{t.equip[exOpt.equip]}</div>
                  </div>
                  <button
                    className="btn btn-gold btn-sm"
                    onClick={() => {
                      onAddSessionExercise(exOpt.id);
                      setAddExModalOpen(false);
                    }}
                  >
                    +
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Explicit Finish Session Modal */}
      {finishModalOpen && (
        <div className="modal-backdrop" onClick={() => setFinishModalOpen(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
              {t.workout.finishModalTitle}
            </h3>
            <p style={{ fontSize: 13.5, color: 'var(--muted)', marginBottom: 14 }}>
              {t.workout.finishModalDesc}
            </p>
            <div className="notice-box notice-gold" style={{ marginBottom: 12 }}>
              {lang === 'ar'
                ? `المجموعات المنجزة: ${completedSetsCount} من ${totalSetsCount} • حجم العمل: ${Math.round(
                    workingVolumeDisplay
                  )} ${settings.weightUnit}`
                : `Completed sets: ${completedSetsCount} of ${totalSetsCount} • Working volume: ${Math.round(
                    workingVolumeDisplay
                  )} ${settings.weightUnit}`}
            </div>
            <div className="field">
              <label>{lang === 'ar' ? 'ملاحظات الجلسة (اختياري)' : 'Session Notes (Optional)'}</label>
              <textarea
                rows={2}
                value={sessionNotes}
                onChange={(e) => setSessionNotes(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-gold"
                style={{ flex: 1 }}
                onClick={() => {
                  setFinishModalOpen(false);
                  onFinishSession(sessionNotes);
                }}
              >
                {t.workout.confirmFinish}
              </button>
              <button className="btn btn-ghost" onClick={() => setFinishModalOpen(false)}>
                {t.workout.keepTraining}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
