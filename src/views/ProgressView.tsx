import React, { useState } from 'react';
import { Trash2, Plus, RefreshCcw, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import type {
  BodyMetricRecord,
  ExerciseData,
  Lang,
  SyncConflictRecord,
  UserSettings,
  WorkoutSessionRecord
} from '../types';
import { TRANSLATIONS } from '../i18n/translations';
import {
  fromCanonicalCm,
  fromCanonicalKg,
  fromCanonicalKgNum,
  toCanonicalCm,
  toCanonicalKg,
  formatDurationMs
} from '../utils/units';
import { generateUuid } from '../services/offlineStore';

interface Props {
  lang: Lang;
  settings: UserSettings;
  sessions: WorkoutSessionRecord[];
  bodyMetrics: BodyMetricRecord[];
  conflicts: SyncConflictRecord[];
  exercises: ExerciseData[];
  exercisesMap: Record<string, ExerciseData>;
  onSaveBodyMetric: (metric: BodyMetricRecord) => void;
  onDeleteBodyMetric: (metricId: string) => void;
  onResolveConflict: (conflictId: string, choose: 'server' | 'client') => void;
  onRestoreArchivedConflict: (conflictId: string) => void;
}

export const ProgressView: React.FC<Props> = ({
  lang,
  settings,
  sessions,
  bodyMetrics,
  conflicts,
  exercises,
  exercisesMap,
  onSaveBodyMetric,
  onDeleteBodyMetric,
  onResolveConflict,
  onRestoreArchivedConflict
}) => {
  const t = TRANSLATIONS[lang];
  const openConflicts = conflicts.filter((c) => c.status === 'open');
  const [tab, setTab] = useState<'analytics' | 'body' | 'conflicts'>(
    openConflicts.length > 0 ? 'conflicts' : 'analytics'
  );
  const [range, setRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [selectedExId, setSelectedExId] = useState<string>(exercises[0]?.id || 'bench_press');
  const [expandedSessId, setExpandedSessId] = useState<string | null>(null);

  // Body metric form state
  const [mDate, setMDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [mWeight, setMWeight] = useState('');
  const [mHeight, setMHeight] = useState('');
  const [mWaist, setMWaist] = useState('');
  const [mChest, setMChest] = useState('');
  const [mArm, setMArm] = useState('');
  const [mThigh, setMThigh] = useState('');
  const [mBodyFat, setMBodyFat] = useState('');
  const [customKey, setCustomKey] = useState('');
  const [customVal, setCustomVal] = useState('');

  const cutoffMs =
    range === '7d'
      ? Date.now() - 7 * 86400000
      : range === '30d'
      ? Date.now() - 30 * 86400000
      : range === '90d'
      ? Date.now() - 90 * 86400000
      : 0;

  const completedInRange = sessions
    .filter((s) => s.status === 'completed' && (s.endedAt || s.startedAt) >= cutoffMs)
    .sort((a, b) => (a.endedAt || a.startedAt) - (b.endedAt || b.startedAt));

  // Exercise Top Working Weight series
  const exPoints = completedInRange
    .map((s) => {
      const b = s.exercises.find((eb) => eb.exerciseId === selectedExId);
      const wSets = (b?.sets || []).filter(
        (st) => st.done && st.setType === 'working' && st.weightKg !== null
      );
      if (!wSets.length) return null;
      const topKg = Math.max(...wSets.map((st) => st.weightKg || 0));
      return {
        ts: s.endedAt || s.startedAt,
        val: fromCanonicalKgNum(topKg, settings.weightUnit)
      };
    })
    .filter(Boolean) as { ts: number; val: number }[];

  // Session Working Volume series
  const volPoints = completedInRange.map((s) => {
    let vol = 0;
    for (const eb of s.exercises) {
      for (const st of eb.sets) {
        if (st.done && (!settings.hideWarmupInVolume || st.setType === 'working')) {
          vol += fromCanonicalKgNum(st.weightKg, settings.weightUnit) * (st.reps || 0);
        }
      }
    }
    return { ts: s.endedAt || s.startedAt, val: Math.round(vol) };
  });

  // Body weight series
  const bodyWeightPoints = [...bodyMetrics]
    .filter((m) => m.weightKg !== null)
    .sort((a, b) => a.recordedDate.localeCompare(b.recordedDate))
    .map((m) => ({
      ts: new Date(m.recordedDate).getTime(),
      val: fromCanonicalKgNum(m.weightKg, settings.weightUnit)
    }));

  function handleSaveMetric(e: React.FormEvent) {
    e.preventDefault();
    const customMetrics: Record<string, { value: number; unit: string }> = {};
    if (customKey.trim() && customVal !== '') {
      const num = parseFloat(customVal);
      if (Number.isFinite(num)) {
        customMetrics[customKey.trim()] = { value: num, unit: settings.lengthUnit };
      }
    }

    const record: BodyMetricRecord = {
      id: generateUuid(),
      recordedDate: mDate,
      weightKg: toCanonicalKg(mWeight, settings.weightUnit),
      heightCm: toCanonicalCm(mHeight, settings.lengthUnit),
      waistCm: toCanonicalCm(mWaist, settings.lengthUnit),
      chestCm: toCanonicalCm(mChest, settings.lengthUnit),
      armCm: toCanonicalCm(mArm, settings.lengthUnit),
      thighCm: toCanonicalCm(mThigh, settings.lengthUnit),
      bodyFatPct: mBodyFat !== '' ? parseFloat(mBodyFat) : null,
      customMetrics,
      enteredWeightUnit: settings.weightUnit,
      enteredLengthUnit: settings.lengthUnit,
      notes: '',
      version: 1,
      updatedAt: new Date().toISOString()
    };

    onSaveBodyMetric(record);
    setMWeight('');
    setMWaist('');
    setMChest('');
    setMArm('');
    setMThigh('');
    setMBodyFat('');
    setCustomKey('');
    setCustomVal('');
  }

  return (
    <div>
      <div className="page-head">
        <h1>{t.progress.title}</h1>
      </div>

      <div className="seg-tabs">
        <button className={tab === 'analytics' ? 'active' : ''} onClick={() => setTab('analytics')}>
          {t.progress.tabAnalytics}
        </button>
        <button className={tab === 'body' ? 'active' : ''} onClick={() => setTab('body')}>
          {t.progress.tabBody}
        </button>
        <button className={tab === 'conflicts' ? 'active' : ''} onClick={() => setTab('conflicts')}>
          {t.progress.tabConflicts} {openConflicts.length > 0 ? `(${openConflicts.length})` : ''}
        </button>
      </div>

      {tab === 'analytics' && (
        <div>
          {/* Timeframe Selector */}
          <div className="chip-scroll" style={{ marginBottom: 14 }}>
            {(
              [
                ['7d', t.progress.range7d],
                ['30d', t.progress.range30d],
                ['90d', t.progress.range90d],
                ['all', t.progress.rangeAll]
              ] as const
            ).map(([k, lbl]) => (
              <button
                key={k}
                className={`chip ${range === k ? 'active' : ''}`}
                onClick={() => setRange(k)}
              >
                {lbl}
              </button>
            ))}
          </div>

          {/* Exercise Top Weight Chart */}
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>
                {t.progress.topWeightChart} ({settings.weightUnit})
              </span>
              <select
                style={{ width: 'auto', maxWidth: 240, padding: '6px 10px', fontSize: 12.5 }}
                value={selectedExId}
                onChange={(e) => setSelectedExId(e.target.value)}
              >
                {exercises.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {lang === 'ar' ? ex.ar : ex.en}
                  </option>
                ))}
              </select>
            </div>
            <SvgTrendChart points={exPoints} lang={lang} emptyLabel={t.progress.needTwoPoints} />
          </div>

          {/* Session Working Volume Chart */}
          <div className="card" style={{ marginBottom: 18 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>
              {t.progress.sessionVolumeChart} ({settings.weightUnit})
            </div>
            <SvgTrendChart points={volPoints} lang={lang} emptyLabel={t.progress.needTwoPoints} />
          </div>

          {/* Completed Sessions History */}
          <div className="section-header">
            <span>{t.dashboard.lastPerformance}</span>
            <span className="badge num">{completedInRange.length}</span>
          </div>

          {completedInRange.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', color: 'var(--muted)', padding: 26 }}>
              {t.dashboard.noSessionsYet}
            </div>
          ) : (
            [...completedInRange].reverse().map((s) => {
              const open = expandedSessId === s.id;
              const dur = Math.max(0, (s.endedAt || s.startedAt) - s.startedAt - (s.accumulatedPauseMs || 0));
              return (
                <div key={s.id} className="card" style={{ padding: 14 }}>
                  <div
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                    onClick={() => setExpandedSessId(open ? null : s.id)}
                  >
                    <div>
                      <div style={{ fontWeight: 700 }}>{lang === 'ar' ? s.name_ar : s.name_en}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {new Date(s.endedAt || s.startedAt).toLocaleDateString(
                          lang === 'ar' ? 'ar-EG' : 'en-US',
                          { day: 'numeric', month: 'short', year: 'numeric' }
                        )}{' '}
                        • <span className="num">{formatDurationMs(dur)}</span>
                      </div>
                    </div>
                    {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>

                  {open && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)', display: 'grid', gap: 8 }}>
                      {s.exercises.map((eb) => (
                        <div key={eb.id} style={{ fontSize: 12.5 }}>
                          <div style={{ fontWeight: 700 }}>
                            {lang === 'ar'
                              ? exercisesMap[eb.exerciseId]?.ar || eb.exerciseId
                              : exercisesMap[eb.exerciseId]?.en || eb.exerciseId}
                          </div>
                          <div className="num" style={{ color: 'var(--muted)' }}>
                            {eb.sets
                              .filter((st) => st.done)
                              .map(
                                (st, i) =>
                                  `#${i + 1}${st.setType === 'warmup' ? '(W)' : ''}: ${fromCanonicalKgNum(
                                    st.weightKg,
                                    settings.weightUnit
                                  )}${settings.weightUnit}×${st.reps}${st.rir !== null ? ` @RIR ${st.rir}` : ''}`
                              )
                              .join('  •  ')}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === 'body' && (
        <div>
          <div className="notice-box" style={{ marginBottom: 14 }}>
            {t.progress.neutralBodyNote}
          </div>

          {/* Body Metrics Entry Form */}
          <form className="card" onSubmit={handleSaveMetric} style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>{t.progress.logBodyMetric}</h3>
            <div className="grid grid-2 grid-2-sm-1">
              <div className="field">
                <label>{t.progress.date}</label>
                <input type="date" dir="ltr" value={mDate} onChange={(e) => setMDate(e.target.value)} required />
              </div>
              <div className="field">
                <label>
                  {t.progress.bodyWeight} ({settings.weightUnit})
                </label>
                <input
                  type="number"
                  step="0.1"
                  dir="ltr"
                  value={mWeight}
                  onChange={(e) => setMWeight(e.target.value)}
                />
              </div>
              <div className="field">
                <label>
                  {t.progress.height} ({settings.lengthUnit})
                </label>
                <input
                  type="number"
                  step="0.1"
                  dir="ltr"
                  value={mHeight}
                  onChange={(e) => setMHeight(e.target.value)}
                />
              </div>
              <div className="field">
                <label>
                  {t.progress.waist} ({settings.lengthUnit})
                </label>
                <input
                  type="number"
                  step="0.1"
                  dir="ltr"
                  value={mWaist}
                  onChange={(e) => setMWaist(e.target.value)}
                />
              </div>
              <div className="field">
                <label>
                  {t.progress.chest} ({settings.lengthUnit})
                </label>
                <input
                  type="number"
                  step="0.1"
                  dir="ltr"
                  value={mChest}
                  onChange={(e) => setMChest(e.target.value)}
                />
              </div>
              <div className="field">
                <label>
                  {t.progress.arm} ({settings.lengthUnit})
                </label>
                <input
                  type="number"
                  step="0.1"
                  dir="ltr"
                  value={mArm}
                  onChange={(e) => setMArm(e.target.value)}
                />
              </div>
              <div className="field">
                <label>
                  {t.progress.thigh} ({settings.lengthUnit})
                </label>
                <input
                  type="number"
                  step="0.1"
                  dir="ltr"
                  value={mThigh}
                  onChange={(e) => setMThigh(e.target.value)}
                />
              </div>
              <div className="field">
                <label>{t.progress.bodyFat}</label>
                <input
                  type="number"
                  step="0.1"
                  dir="ltr"
                  value={mBodyFat}
                  onChange={(e) => setMBodyFat(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-2 grid-2-sm-1">
              <div className="field">
                <label>{t.progress.customMetricName}</label>
                <input value={customKey} onChange={(e) => setCustomKey(e.target.value)} />
              </div>
              <div className="field">
                <label>
                  {t.progress.customMetricVal} ({settings.lengthUnit})
                </label>
                <input
                  type="number"
                  step="0.1"
                  dir="ltr"
                  value={customVal}
                  onChange={(e) => setCustomVal(e.target.value)}
                />
              </div>
            </div>

            <button type="submit" className="btn btn-gold">
              <Plus size={15} />
              <span>{t.progress.saveMetric}</span>
            </button>
          </form>

          {/* Body Weight Trend Chart */}
          {bodyWeightPoints.length >= 2 && (
            <div className="card" style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
                {t.progress.bodyWeight} ({settings.weightUnit})
              </div>
              <SvgTrendChart points={bodyWeightPoints} lang={lang} emptyLabel={t.progress.needTwoPoints} />
            </div>
          )}

          {/* Recorded Body Metrics List */}
          <div style={{ display: 'grid', gap: 8 }}>
            {bodyMetrics.map((bm) => (
              <div
                key={bm.id}
                className="card"
                style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}
              >
                <div>
                  <div className="num" style={{ fontWeight: 700, fontSize: 13.5 }}>
                    {bm.recordedDate}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    {bm.weightKg !== null && (
                      <span className="badge badge-gold num">
                        {fromCanonicalKg(bm.weightKg, settings.weightUnit)} {settings.weightUnit}
                      </span>
                    )}
                    {bm.heightCm !== null && (
                      <span className="badge num">
                        {t.progress.height}: {fromCanonicalCm(bm.heightCm, settings.lengthUnit)} {settings.lengthUnit}
                      </span>
                    )}
                    {bm.waistCm !== null && (
                      <span className="badge num">
                        {t.progress.waist}: {fromCanonicalCm(bm.waistCm, settings.lengthUnit)} {settings.lengthUnit}
                      </span>
                    )}
                    {bm.armCm !== null && (
                      <span className="badge num">
                        {t.progress.arm}: {fromCanonicalCm(bm.armCm, settings.lengthUnit)} {settings.lengthUnit}
                      </span>
                    )}
                    {bm.bodyFatPct !== null && (
                      <span className="badge num">BF: {bm.bodyFatPct}%</span>
                    )}
                    {Object.entries(bm.customMetrics || {}).map(([k, v]) => (
                      <span key={k} className="badge num">
                        {k}: {v.value} {v.unit}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => onDeleteBodyMetric(bm.id)}
                  aria-label="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'conflicts' && (
        <div>
          <div className="notice-box notice-gold" style={{ marginBottom: 14 }}>
            {t.progress.conflictExplain}
          </div>

          {conflicts.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', color: 'var(--muted)', padding: 28 }}>
              {t.progress.noConflicts}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {conflicts.map((c) => {
                const ex = exercisesMap[c.exerciseId || ''];
                const sSnap = c.serverSnapshot;
                const cSnap = c.clientSnapshot;
                return (
                  <div
                    key={c.id}
                    className={`card ${c.status === 'open' ? 'card-gold' : ''}`}
                    style={{ padding: 14 }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {c.status === 'open' && <AlertTriangle size={15} color="var(--warn)" />}
                        <span>{ex ? (lang === 'ar' ? ex.ar : ex.en) : c.exerciseId}</span>
                      </div>
                      <span className={`badge ${c.status === 'open' ? 'badge-warn' : 'badge-ok'}`}>
                        {c.status === 'open'
                          ? lang === 'ar'
                            ? 'مفتوح'
                            : 'Open'
                          : lang === 'ar'
                          ? 'تم الحل (محفوظ بديل)'
                          : 'Resolved (Recoverable)'}
                      </span>
                    </div>

                    {c.status === 'open' ? (
                      <div className="grid grid-2 grid-2-sm-1">
                        <div className="card" style={{ background: 'var(--panel-2)', padding: 12 }}>
                          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
                            {lang === 'ar' ? 'نسخة الخادم الحالية' : 'Server Version'} ({sSnap.lastDeviceId})
                          </div>
                          <div className="num" style={{ fontWeight: 800, fontSize: 15, marginBottom: 8 }}>
                            {fromCanonicalKgNum(sSnap.weightKg, settings.weightUnit)} {settings.weightUnit} ×{' '}
                            {sSnap.reps ?? 0} {sSnap.rir !== null ? `(RIR ${sSnap.rir})` : ''}
                          </div>
                          <button
                            className="btn btn-outline-gold btn-sm btn-block"
                            onClick={() => onResolveConflict(c.id, 'server')}
                          >
                            {t.progress.keepServer}
                          </button>
                        </div>

                        <div className="card" style={{ background: 'var(--panel-2)', padding: 12 }}>
                          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
                            {lang === 'ar' ? 'نسخة التعديل الواردة' : 'Incoming Device Version'} ({cSnap.lastDeviceId})
                          </div>
                          <div className="num" style={{ fontWeight: 800, fontSize: 15, marginBottom: 8 }}>
                            {fromCanonicalKgNum(cSnap.weightKg, settings.weightUnit)} {settings.weightUnit} ×{' '}
                            {cSnap.reps ?? 0} {cSnap.rir !== null ? `(RIR ${cSnap.rir})` : ''}
                          </div>
                          <button
                            className="btn btn-gold btn-sm btn-block"
                            onClick={() => onResolveConflict(c.id, 'client')}
                          >
                            {t.progress.keepClient}
                          </button>
                        </div>
                      </div>
                    ) : (
                      c.archivedOther && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                            {lang === 'ar' ? 'النسخة البديلة المحفوظة: ' : 'Archived unselected copy: '}
                            <strong className="num" style={{ color: 'var(--text)' }}>
                              {fromCanonicalKgNum(c.archivedOther.weightKg, settings.weightUnit)}{' '}
                              {settings.weightUnit} × {c.archivedOther.reps ?? 0}
                            </strong>
                          </div>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => onRestoreArchivedConflict(c.id)}
                          >
                            <RefreshCcw size={13} />
                            <span>{t.progress.restoreArchived}</span>
                          </button>
                        </div>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const SvgTrendChart: React.FC<{
  points: { ts: number; val: number }[];
  lang: Lang;
  emptyLabel: string;
}> = ({ points, lang, emptyLabel }) => {
  if (points.length < 2) {
    return (
      <div style={{ textAlign: 'center', padding: '22px 12px', color: 'var(--muted)', fontSize: 12.5 }}>
        {emptyLabel}
      </div>
    );
  }

  const W = 520;
  const H = 160;
  const padX = 32;
  const padY = 26;
  const vals = points.map((p) => p.val);
  const maxV = Math.max(...vals);
  const minV = Math.min(...vals);
  const span = maxV - minV || 1;
  const stepX = (W - padX * 2) / (points.length - 1);

  const coords = points.map((p, idx) => ({
    // Keep chronological progression clear (left-to-right on numeric chart with explicit dates)
    x: padX + idx * stepX,
    y: H - padY - ((p.val - minV) / span) * (H - padY * 2),
    val: p.val,
    ts: p.ts
  }));

  const dPath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const areaPath = `${dPath} L${coords[coords.length - 1].x.toFixed(1)},${H - padY} L${coords[0].x.toFixed(
    1
  )},${H - padY} Z`;

  const gradId = React.useId();

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', direction: 'ltr' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#D4AF37" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#D4AF37" stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={dPath} fill="none" stroke="#D4AF37" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {coords.map((c, idx) => (
        <g key={idx}>
          <circle cx={c.x} cy={c.y} r="4.2" fill="#08080A" stroke="#EDD37C" strokeWidth="2.2" />
          <text x={c.x} y={c.y - 9} textAnchor="middle" fill="#F5F5F7" fontSize="10.5" fontWeight="700">
            {c.val}
          </text>
        </g>
      ))}
      <text x={padX} y={H - 6} textAnchor="start" fill="#8E8E9E" fontSize="10">
        {new Date(points[0].ts).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', {
          month: 'short',
          day: 'numeric'
        })}
      </text>
      <text x={W - padX} y={H - 6} textAnchor="end" fill="#8E8E9E" fontSize="10">
        {new Date(points[points.length - 1].ts).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', {
          month: 'short',
          day: 'numeric'
        })}
      </text>
    </svg>
  );
};
