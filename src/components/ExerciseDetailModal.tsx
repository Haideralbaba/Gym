import React from 'react';
import { X, Star } from 'lucide-react';
import type {
  ExerciseData,
  ExerciseImageRecord,
  Lang,
  WeightUnit,
  WorkoutSessionRecord
} from '../types';
import { MUSCLES_MAP } from '../data/seedMuscles';
import { TRANSLATIONS } from '../i18n/translations';
import { ExerciseMedia } from './ExerciseMedia';
import { fromCanonicalKgNum } from '../utils/units';

interface Props {
  exercise: ExerciseData;
  allExercisesMap: Record<string, ExerciseData>;
  publishedImages: ExerciseImageRecord[];
  sessions: WorkoutSessionRecord[];
  favorites: string[];
  lang: Lang;
  weightUnit: WeightUnit;
  isGuest: boolean;
  onToggleFavorite: (exerciseId: string) => void;
  onSelectExercise: (exerciseId: string) => void;
  onClose: () => void;
}

export const ExerciseDetailModal: React.FC<Props> = ({
  exercise,
  allExercisesMap,
  publishedImages,
  sessions,
  favorites,
  lang,
  weightUnit,
  isGuest,
  onToggleFavorite,
  onSelectExercise,
  onClose
}) => {
  const t = TRANSLATIONS[lang];
  const isFav = favorites.includes(exercise.id);
  const primaryMuscle = MUSCLES_MAP[exercise.primary];
  const secondaryNames = (exercise.secondary || [])
    .map((mId) => (lang === 'ar' ? MUSCLES_MAP[mId]?.ar : MUSCLES_MAP[mId]?.en))
    .filter(Boolean)
    .join(lang === 'ar' ? '، ' : ', ');

  // 1. Direct historical performance (sets logged directly under this exerciseId)
  const completedSessions = sessions
    .filter((s) => s.status === 'completed')
    .sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0));

  const lastDirect = completedSessions
    .map((s) => {
      const block = s.exercises.find((b) => b.exerciseId === exercise.id);
      const sets = (block?.sets || []).filter((st) => st.done && st.setType === 'working');
      return sets.length ? { session: s, sets } : null;
    })
    .find(Boolean);

  // 2. Indirect related performance (when this exercise substituted another OR another substituted this exercise)
  const lastIndirect = completedSessions
    .map((s) => {
      const relatedBlock = s.exercises.find(
        (b) =>
          (b.substitutedFromExerciseId === exercise.id && b.exerciseId !== exercise.id) ||
          (b.exerciseId !== exercise.id && (exercise.alts || []).includes(b.exerciseId) && b.substitutedFromExerciseId)
      );
      if (!relatedBlock) return null;
      const sets = relatedBlock.sets.filter((st) => st.done && st.setType === 'working');
      if (!sets.length) return null;
      return { session: s, block: relatedBlock, sets };
    })
    .find(Boolean);

  const steps = lang === 'ar' ? exercise.steps_ar : exercise.steps_en;
  const cues = lang === 'ar' ? exercise.cues_ar : exercise.cues_en;
  const mistakes = lang === 'ar' ? exercise.mistakes_ar : exercise.mistakes_en;

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet" role="dialog" aria-modal="true">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <div>
            <h2 style={{ fontSize: 19, fontWeight: 800 }}>
              {lang === 'ar' ? exercise.ar : exercise.en}
            </h2>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
              {lang === 'ar' ? exercise.en : exercise.ar}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {!isGuest && (
              <button
                className={`btn btn-sm ${isFav ? 'btn-outline-gold' : 'btn-ghost'}`}
                onClick={() => onToggleFavorite(exercise.id)}
                aria-label={t.library.favoritesOnly}
              >
                <Star size={15} fill={isFav ? 'currentColor' : 'none'} />
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
              <X size={16} />
            </button>
          </div>
        </div>

        <ExerciseMedia
          exercise={exercise}
          publishedImages={publishedImages}
          lang={lang}
          size="hero"
        />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '12px 0' }}>
          <span className="badge badge-gold">
            {primaryMuscle ? (lang === 'ar' ? primaryMuscle.ar : primaryMuscle.en) : exercise.primary}
          </span>
          <span className="badge">{t.equip[exercise.equip] || exercise.equip}</span>
          <span className="badge">{t.diff[exercise.diff]}</span>
          <span className="badge num">
            {exercise.sets} × {exercise.reps} {exercise.isTimed ? 's' : ''}
          </span>
          <span className="badge num">{exercise.rest}s</span>
        </div>

        <p style={{ fontSize: 13.5, color: 'var(--text)', marginBottom: 14 }}>
          {lang === 'ar' ? exercise.desc_ar : exercise.desc_en}
        </p>

        {/* Direct & Indirect Related Performance History */}
        {!isGuest && (
          <div className="card" style={{ background: 'var(--panel-2)', padding: 12, marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold-light)', marginBottom: 4 }}>
              {t.workout.directHistory}
            </div>
            {lastDirect ? (
              <div style={{ fontSize: 13 }}>
                <span className="num" style={{ color: 'var(--muted)', marginInlineEnd: 8 }}>
                  {new Date(lastDirect.session.endedAt || lastDirect.session.startedAt).toLocaleDateString(
                    lang === 'ar' ? 'ar-EG' : 'en-US'
                  )}
                  :
                </span>
                <span className="num">
                  {lastDirect.sets
                    .map((st) => `${fromCanonicalKgNum(st.weightKg, weightUnit)}${weightUnit} × ${st.reps}`)
                    .join('  •  ')}
                </span>
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{t.workout.noPreviousDirect}</div>
            )}

            {lastIndirect && (
              <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed var(--line)' }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--warn)' }}>
                  {t.workout.indirectHistory} (
                  {lang === 'ar'
                    ? allExercisesMap[lastIndirect.block.exerciseId]?.ar
                    : allExercisesMap[lastIndirect.block.exerciseId]?.en}
                  )
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }} className="num">
                  {lastIndirect.sets
                    .map((st) => `${fromCanonicalKgNum(st.weightKg, weightUnit)}${weightUnit} × ${st.reps}`)
                    .join('  •  ')}
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'grid', gap: 12, fontSize: 13.5 }}>
          <div>
            <h4 style={{ fontSize: 12, color: 'var(--gold-light)', marginBottom: 4 }}>
              {t.library.secondaryMuscles}
            </h4>
            <p style={{ color: 'var(--muted)' }}>{secondaryNames || '—'}</p>
          </div>

          <div>
            <h4 style={{ fontSize: 12, color: 'var(--gold-light)', marginBottom: 4 }}>
              {t.library.difficultyBasis}
            </h4>
            <p style={{ color: 'var(--muted)' }}>
              {lang === 'ar' ? exercise.diff_basis_ar : exercise.diff_basis_en}
            </p>
          </div>

          {steps.length > 0 && (
            <div>
              <h4 style={{ fontSize: 12, color: 'var(--gold-light)', marginBottom: 4 }}>{t.library.steps}</h4>
              <ol style={{ paddingInlineStart: 18, display: 'grid', gap: 4 }}>
                {steps.map((s, idx) => (
                  <li key={idx}>{s}</li>
                ))}
              </ol>
            </div>
          )}

          {cues.length > 0 && (
            <div>
              <h4 style={{ fontSize: 12, color: 'var(--gold-light)', marginBottom: 4 }}>{t.library.cues}</h4>
              <ul style={{ paddingInlineStart: 18, display: 'grid', gap: 3 }}>
                {cues.map((c, idx) => (
                  <li key={idx}>{c}</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h4 style={{ fontSize: 12, color: 'var(--gold-light)', marginBottom: 4 }}>{t.library.breathing}</h4>
            <p>{lang === 'ar' ? exercise.breath_ar : exercise.breath_en}</p>
          </div>

          {mistakes.length > 0 && (
            <div>
              <h4 style={{ fontSize: 12, color: 'var(--gold-light)', marginBottom: 4 }}>
                {t.library.commonMistakes}
              </h4>
              <ul style={{ paddingInlineStart: 18, color: 'var(--muted)', display: 'grid', gap: 3 }}>
                {mistakes.map((m, idx) => (
                  <li key={idx}>{m}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="notice-box notice-gold">
            <strong>{t.library.safetyNotes}: </strong>
            {lang === 'ar' ? exercise.safety_ar : exercise.safety_en}
          </div>

          {exercise.alts?.length > 0 && (
            <div>
              <h4 style={{ fontSize: 12, color: 'var(--gold-light)', marginBottom: 6 }}>
                {t.library.alternatives}
              </h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {exercise.alts.map((altId) => {
                  const alt = allExercisesMap[altId];
                  if (!alt) return null;
                  return (
                    <button
                      key={altId}
                      className="btn btn-ghost btn-sm"
                      onClick={() => onSelectExercise(altId)}
                    >
                      {lang === 'ar' ? alt.ar : alt.en}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
