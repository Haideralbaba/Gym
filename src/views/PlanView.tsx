import React, { useState } from 'react';
import { ArrowUp, ArrowDown, Trash2, Plus, History, Check, Play, Edit3 } from 'lucide-react';
import type {
  ExerciseData,
  Lang,
  PlanDay,
  PlanVersion,
  ScheduleMode,
  UserSettings
} from '../types';
import { TRANSLATIONS } from '../i18n/translations';
import { SEED_MUSCLES } from '../data/seedMuscles';
import { DEFAULT_UPPER_LOWER_DAYS, computePlanWeeklyVolume } from '../data/defaultPlan';

interface Props {
  lang: Lang;
  isGuest: boolean;
  settings: UserSettings;
  activePlan: PlanVersion | null;
  planVersions: PlanVersion[];
  exercises: ExerciseData[];
  exercisesMap: Record<string, ExerciseData>;
  onChangeScheduleMode: (mode: ScheduleMode) => void;
  onSaveNewPlanVersion: (days: PlanDay[], scheduleMode: ScheduleMode, changeNote: string) => void;
  onStartDaySession: (day: PlanDay, seqIdx: number) => void;
  onOpenExerciseDetail: (exId: string) => void;
  onRequireAuth: () => void;
}

export const PlanView: React.FC<Props> = ({
  lang,
  isGuest,
  settings,
  activePlan,
  planVersions,
  exercises,
  exercisesMap,
  onChangeScheduleMode,
  onSaveNewPlanVersion,
  onStartDaySession,
  onOpenExerciseDetail,
  onRequireAuth
}) => {
  const t = TRANSLATIONS[lang];
  const currentDays = activePlan?.days?.length ? activePlan.days : DEFAULT_UPPER_LOWER_DAYS;

  const [editing, setEditing] = useState(false);
  const [draftDays, setDraftDays] = useState<PlanDay[]>(() => JSON.parse(JSON.stringify(currentDays)));
  const [changeNote, setChangeNote] = useState('');
  const [expandedDayKey, setExpandedDayKey] = useState<string | null>(currentDays[0]?.key || null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);

  const displayedDays = editing ? draftDays : currentDays;
  const volumeMap = computePlanWeeklyVolume(displayedDays, exercisesMap);

  function startEdit() {
    if (isGuest) {
      onRequireAuth();
      return;
    }
    setDraftDays(JSON.parse(JSON.stringify(currentDays)));
    setChangeNote('');
    setEditing(true);
  }

  function updateDayItem(dayIdx: number, itemIdx: number, patch: Partial<PlanDay['items'][0]>) {
    setDraftDays((prev) => {
      const next = JSON.parse(JSON.stringify(prev)) as PlanDay[];
      next[dayIdx].items[itemIdx] = { ...next[dayIdx].items[itemIdx], ...patch };
      return next;
    });
  }

  function moveDayItem(dayIdx: number, itemIdx: number, dir: -1 | 1) {
    setDraftDays((prev) => {
      const next = JSON.parse(JSON.stringify(prev)) as PlanDay[];
      const items = next[dayIdx].items;
      const target = itemIdx + dir;
      if (target < 0 || target >= items.length) return prev;
      [items[itemIdx], items[target]] = [items[target], items[itemIdx]];
      return next;
    });
  }

  function removeDayItem(dayIdx: number, itemIdx: number) {
    setDraftDays((prev) => {
      const next = JSON.parse(JSON.stringify(prev)) as PlanDay[];
      next[dayIdx].items.splice(itemIdx, 1);
      return next;
    });
  }

  function addDayItem(dayIdx: number) {
    const fallbackEx = exercises[0];
    if (!fallbackEx) return;
    setDraftDays((prev) => {
      const next = JSON.parse(JSON.stringify(prev)) as PlanDay[];
      next[dayIdx].isRest = false;
      next[dayIdx].items.push({
        exerciseId: fallbackEx.id,
        sets: fallbackEx.sets || 3,
        reps: fallbackEx.reps || '8-12',
        rest: fallbackEx.rest || 90
      });
      return next;
    });
  }

  function toggleRest(dayIdx: number) {
    setDraftDays((prev) => {
      const next = JSON.parse(JSON.stringify(prev)) as PlanDay[];
      const d = next[dayIdx];
      d.isRest = !d.isRest;
      if (!d.isRest && d.items.length === 0 && exercises[0]) {
        d.items.push({ exerciseId: exercises[0].id, sets: 3, reps: '8-12', rest: 90 });
      }
      return next;
    });
  }

  function commitSave() {
    onSaveNewPlanVersion(draftDays, settings.scheduleMode, changeNote);
    setEditing(false);
  }

  return (
    <div>
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1>{t.plan.title}</h1>
          <p>{t.plan.subtitle}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {activePlan && (
            <button className="btn btn-ghost btn-sm" onClick={() => setShowVersionHistory(true)}>
              <History size={14} />
              <span>
                {t.plan.versionBadge} v{activePlan.versionNumber}
              </span>
            </button>
          )}
          {!editing ? (
            <button className="btn btn-outline-gold btn-sm" onClick={startEdit}>
              <Edit3 size={14} />
              <span>{t.plan.editPlan}</span>
            </button>
          ) : (
            <>
              <button className="btn btn-gold btn-sm" onClick={commitSave}>
                <Check size={14} />
                <span>{t.plan.saveNewVersion}</span>
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
                {t.plan.cancelEdit}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="notice-box notice-gold" style={{ marginBottom: 14 }}>
        {t.plan.disclaimer}
      </div>

      {/* Schedule Mode Selector: Flexible Sequence vs Fixed Calendar */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>
          {t.plan.scheduleMode}
        </div>
        <div className="seg-tabs" style={{ marginBottom: 0 }}>
          <button
            className={settings.scheduleMode === 'flexible' ? 'active' : ''}
            onClick={() => (isGuest ? onRequireAuth() : onChangeScheduleMode('flexible'))}
          >
            {t.plan.flexibleMode}
          </button>
          <button
            className={settings.scheduleMode === 'fixed' ? 'active' : ''}
            onClick={() => (isGuest ? onRequireAuth() : onChangeScheduleMode('fixed'))}
          >
            {t.plan.fixedMode}
          </button>
        </div>
      </div>

      {editing && (
        <div className="card" style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)', marginBottom: 6 }}>
            {t.plan.changeNotePlaceholder}
          </label>
          <input
            value={changeNote}
            onChange={(e) => setChangeNote(e.target.value)}
            placeholder={t.plan.changeNotePlaceholder}
          />
        </div>
      )}

      {/* Days List */}
      <div style={{ display: 'grid', gap: 10 }}>
        {displayedDays.map((day, dIdx) => {
          const isOpen = expandedDayKey === day.key || editing;
          const isCurrentSeq = settings.scheduleMode === 'flexible' && settings.sequencePointer === dIdx && !day.isRest;
          const weekdayLabel = (t.weekdays as any)[day.weekday] || day.key;

          return (
            <div
              key={day.key}
              className="card"
              style={{
                borderColor: isCurrentSeq ? 'var(--gold)' : 'var(--line)',
                opacity: day.isRest && !editing ? 0.78 : 1
              }}
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                onClick={() => !editing && setExpandedDayKey(isOpen ? null : day.key)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 11,
                      background: isCurrentSeq ? 'var(--gold-soft)' : 'var(--panel-2)',
                      border: `1px solid ${isCurrentSeq ? 'var(--gold-border)' : 'var(--line)'}`,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                      fontWeight: 700,
                      color: isCurrentSeq ? 'var(--gold-light)' : 'var(--muted)'
                    }}
                  >
                    <span className="num">#{dIdx + 1}</span>
                    <span style={{ fontSize: 9.5 }}>{weekdayLabel.slice(0, 5)}</span>
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <h3 style={{ fontSize: 15.5, fontWeight: 800 }}>
                        {lang === 'ar' ? day.name_ar : day.name_en}
                      </h3>
                      {isCurrentSeq && <span className="badge badge-gold">{t.plan.nextInSequence}</span>}
                    </div>
                    <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                      {lang === 'ar' ? day.focus_ar : day.focus_en}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {editing ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleRest(dIdx);
                      }}
                    >
                      {day.isRest ? t.plan.makeTrainingDay : t.plan.toggleRestDay}
                    </button>
                  ) : day.isRest ? (
                    <span className="badge">{lang === 'ar' ? 'راحة' : 'Rest'}</span>
                  ) : (
                    <span className="badge badge-gold num">
                      {day.items.length} {t.plan.exercisesCount}
                    </span>
                  )}
                </div>
              </div>

              {isOpen && !day.isRest && (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
                  {day.items.map((item, itIdx) => {
                    const ex = exercisesMap[item.exerciseId];
                    return (
                      <div
                        key={itIdx}
                        style={{
                          padding: '10px 0',
                          borderBottom: itIdx < day.items.length - 1 ? '1px solid var(--line)' : 'none',
                          display: 'grid',
                          gap: 8
                        }}
                      >
                        {!editing ? (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                            <div
                              style={{ cursor: 'pointer' }}
                              onClick={() => onOpenExerciseDetail(item.exerciseId)}
                            >
                              <div style={{ fontWeight: 700, fontSize: 14 }}>
                                {ex ? (lang === 'ar' ? ex.ar : ex.en) : item.exerciseId}
                              </div>
                              <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                                {ex ? t.equip[ex.equip] : ''}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <span className="badge badge-gold num">
                                {item.sets} × {item.reps}
                              </span>
                              <span className="badge num">{item.rest}s</span>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'grid', gap: 8 }}>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              <select
                                value={item.exerciseId}
                                onChange={(e) => {
                                  const picked = exercisesMap[e.target.value];
                                  updateDayItem(dIdx, itIdx, {
                                    exerciseId: e.target.value,
                                    reps: picked?.reps || item.reps,
                                    rest: picked?.rest || item.rest
                                  });
                                }}
                              >
                                {exercises.map((opt) => (
                                  <option key={opt.id} value={opt.id}>
                                    {lang === 'ar' ? `${opt.ar} (${opt.en})` : opt.en}
                                  </option>
                                ))}
                              </select>
                              <button className="btn btn-ghost btn-sm" onClick={() => moveDayItem(dIdx, itIdx, -1)} aria-label="Move up">
                                <ArrowUp size={14} />
                              </button>
                              <button className="btn btn-ghost btn-sm" onClick={() => moveDayItem(dIdx, itIdx, 1)} aria-label="Move down">
                                <ArrowDown size={14} />
                              </button>
                              <button className="btn btn-danger btn-sm" onClick={() => removeDayItem(dIdx, itIdx)} aria-label="Remove">
                                <Trash2 size={14} />
                              </button>
                            </div>
                            <div className="grid grid-3">
                              <div>
                                <label style={{ fontSize: 11, color: 'var(--muted)' }}>{t.plan.setsLabel}</label>
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={item.sets}
                                  onChange={(e) =>
                                    updateDayItem(dIdx, itIdx, { sets: Math.max(1, parseInt(e.target.value, 10) || 1) })
                                  }
                                />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, color: 'var(--muted)' }}>{t.plan.repsLabel}</label>
                                <input
                                  type="text"
                                  dir="ltr"
                                  value={item.reps}
                                  onChange={(e) => updateDayItem(dIdx, itIdx, { reps: e.target.value })}
                                />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, color: 'var(--muted)' }}>{t.plan.restLabel}</label>
                                <input
                                  type="number"
                                  min={15}
                                  max={600}
                                  step={15}
                                  value={item.rest}
                                  onChange={(e) =>
                                    updateDayItem(dIdx, itIdx, { rest: Math.max(15, parseInt(e.target.value, 10) || 60) })
                                  }
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    {editing ? (
                      <button className="btn btn-outline-gold btn-sm" onClick={() => addDayItem(dIdx)}>
                        <Plus size={14} />
                        <span>{t.plan.addExercise}</span>
                      </button>
                    ) : (
                      <button
                        className="btn btn-gold btn-block"
                        onClick={() => (isGuest ? onRequireAuth() : onStartDaySession(day, dIdx))}
                      >
                        <Play size={15} />
                        <span>{t.plan.startThisDay}</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Weekly Muscle Volume Impact Breakdown */}
      <div className="section-header">
        <span>{t.plan.volumeImpact}</span>
      </div>
      <div className="card">
        <div className="grid grid-2 grid-2-sm-1">
          {SEED_MUSCLES.filter((m) => (volumeMap[m.id]?.effectiveSets || 0) > 0).map((m) => {
            const v = volumeMap[m.id];
            return (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 10px',
                  borderRadius: 9,
                  background: 'var(--panel-2)',
                  border: '1px solid var(--line)'
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{lang === 'ar' ? m.ar : m.en}</div>
                  <div className="num" style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {lang === 'ar'
                      ? `مباشر: ${v.directSets} • ثانوي: ${v.secondarySets}`
                      : `Direct: ${v.directSets} • Secondary: ${v.secondarySets}`}
                  </div>
                </div>
                <span className="badge badge-gold num">{v.effectiveSets}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Immutable Plan Versions Modal */}
      {showVersionHistory && (
        <div className="modal-backdrop" onClick={() => setShowVersionHistory(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>{t.plan.versionHistory}</h3>
            <p style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 12 }}>
              {lang === 'ar'
                ? 'كل تعديل يحفظ نسخة مستقلة من الخطة بحيث تظل الجلسات السابقة مرتبطة بنسختها الأصلية دون تغيير.'
                : 'Every edit creates an immutable plan version so historical workout logs remain unaltered.'}
            </p>
            <div style={{ display: 'grid', gap: 8 }}>
              {planVersions.map((pv) => (
                <div key={pv.id} className="card" style={{ background: 'var(--panel-2)', padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong className="num">v{pv.versionNumber}</strong>
                    {pv.isActive && (
                      <span className="badge badge-gold">{lang === 'ar' ? 'نشطة' : 'Active'}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>
                    {new Date(pv.createdAt).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US')}
                    {pv.changeNote ? ` — ${pv.changeNote}` : ''}
                  </div>
                </div>
              ))}
            </div>
            <button className="btn btn-ghost btn-block" style={{ marginTop: 14 }} onClick={() => setShowVersionHistory(false)}>
              {lang === 'ar' ? 'إغلاق' : 'Close'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
