import React, { useState } from 'react';
import { Search, Star, X } from 'lucide-react';
import type {
  Equipment,
  ExerciseData,
  ExerciseImageRecord,
  Lang,
  MuscleInfo,
  UserSettings,
  WorkoutSessionRecord
} from '../types';
import { TRANSLATIONS } from '../i18n/translations';
import { SEED_MUSCLES, MUSCLES_MAP } from '../data/seedMuscles';
import { ExerciseMedia } from '../components/ExerciseMedia';

interface Props {
  lang: Lang;
  isGuest: boolean;
  settings: UserSettings;
  exercises: ExerciseData[];
  publishedImages: ExerciseImageRecord[];
  sessions: WorkoutSessionRecord[];
  onToggleFavorite: (exId: string) => void;
  onOpenExerciseDetail: (exId: string) => void;
  onRequireAuth: () => void;
}

export const LibraryMusclesView: React.FC<Props> = ({
  lang,
  isGuest,
  settings,
  exercises,
  publishedImages,
  sessions,
  onToggleFavorite,
  onOpenExerciseDetail,
  onRequireAuth
}) => {
  const t = TRANSLATIONS[lang];
  const [subTab, setSubTab] = useState<'exercises' | 'muscles'>('exercises');
  const [query, setQuery] = useState('');
  const [muscleFilter, setMuscleFilter] = useState('');
  const [equipFilter, setEquipFilter] = useState('');
  const [onlyFavs, setOnlyFavs] = useState(false);
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleInfo | null>(null);

  const filteredExercises = exercises.filter((ex) => {
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      if (!ex.ar.includes(query.trim()) && !ex.en.toLowerCase().includes(q)) return false;
    }
    if (muscleFilter && ex.primary !== muscleFilter && !(ex.secondary || []).includes(muscleFilter)) {
      return false;
    }
    if (equipFilter && ex.equip !== equipFilter) return false;
    if (onlyFavs && !settings.favorites.includes(ex.id)) return false;
    return true;
  });

  // 7-day working set muscle coverage (100% direct + 50% secondary, excluding warmup sets)
  const cutoff7d = Date.now() - 7 * 86400000;
  const direct7d: Record<string, number> = {};
  const secondary7d: Record<string, number> = {};
  const exMap = Object.fromEntries(exercises.map((e) => [e.id, e]));

  for (const s of sessions) {
    if (s.status !== 'completed' || (s.endedAt || 0) < cutoff7d) continue;
    for (const eb of s.exercises) {
      const ex = exMap[eb.exerciseId];
      if (!ex) continue;
      const workingCount = eb.sets.filter((st) => st.done && st.setType === 'working').length;
      if (workingCount <= 0) continue;
      direct7d[ex.primary] = (direct7d[ex.primary] || 0) + workingCount;
      for (const sec of ex.secondary || []) {
        secondary7d[sec] = (secondary7d[sec] || 0) + workingCount;
      }
    }
  }

  const primaryMuscleIds = Array.from(new Set(exercises.map((e) => e.primary)));
  const equipKeys: Equipment[] = ['bar', 'dumbbell', 'cable', 'machine', 'bodyweight'];
  const catOrder: MuscleInfo['cat'][] = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core'];

  return (
    <div>
      <div className="page-head">
        <h1>{t.library.title}</h1>
        <p>
          {exercises.length} {lang === 'ar' ? 'تمرين ثنائي اللغة • 24 عضلة تشريحية' : 'Bilingual Exercises • 24 Anatomical Muscles'}
        </p>
      </div>

      <div className="seg-tabs">
        <button className={subTab === 'exercises' ? 'active' : ''} onClick={() => setSubTab('exercises')}>
          {t.library.tabExercises}
        </button>
        <button className={subTab === 'muscles' ? 'active' : ''} onClick={() => setSubTab('muscles')}>
          {t.library.tabMuscles}
        </button>
      </div>

      {subTab === 'exercises' ? (
        <div>
          {/* Bilingual Search */}
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <input
              type="search"
              placeholder={t.library.searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ paddingInlineStart: 38 }}
            />
            <Search
              size={16}
              color="var(--muted)"
              style={{
                position: 'absolute',
                insetInlineStart: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none'
              }}
            />
          </div>

          {/* Muscle Filter Chips */}
          <div className="chip-scroll" style={{ marginBottom: 8 }}>
            <button
              className={`chip ${!muscleFilter ? 'active' : ''}`}
              onClick={() => setMuscleFilter('')}
            >
              {t.library.allMuscles}
            </button>
            <button
              className={`chip ${onlyFavs ? 'active' : ''}`}
              onClick={() => (isGuest ? onRequireAuth() : setOnlyFavs(!onlyFavs))}
            >
              ★ {t.library.favoritesOnly}
            </button>
            {primaryMuscleIds.map((mId) => (
              <button
                key={mId}
                className={`chip ${muscleFilter === mId ? 'active' : ''}`}
                onClick={() => setMuscleFilter(muscleFilter === mId ? '' : mId)}
              >
                {lang === 'ar' ? MUSCLES_MAP[mId]?.ar : MUSCLES_MAP[mId]?.en}
              </button>
            ))}
          </div>

          {/* Equipment Filter Chips */}
          <div className="chip-scroll" style={{ marginBottom: 14 }}>
            <button
              className={`chip ${!equipFilter ? 'active' : ''}`}
              onClick={() => setEquipFilter('')}
            >
              {t.library.allEquip}
            </button>
            {equipKeys.map((eq) => (
              <button
                key={eq}
                className={`chip ${equipFilter === eq ? 'active' : ''}`}
                onClick={() => setEquipFilter(equipFilter === eq ? '' : eq)}
              >
                {t.equip[eq]}
              </button>
            ))}
          </div>

          {/* Results List */}
          <div style={{ display: 'grid', gap: 10 }}>
            {filteredExercises.map((ex) => {
              const isFav = settings.favorites.includes(ex.id);
              const pm = MUSCLES_MAP[ex.primary];
              return (
                <div
                  key={ex.id}
                  className="card"
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, cursor: 'pointer' }}
                  onClick={() => onOpenExerciseDetail(ex.id)}
                >
                  <ExerciseMedia
                    exercise={ex}
                    publishedImages={publishedImages}
                    lang={lang}
                    size="thumb"
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 14.5 }}>
                      {lang === 'ar' ? ex.ar : ex.en}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 5 }}>
                      {lang === 'ar' ? ex.en : ex.ar}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      <span className="badge badge-gold">
                        {pm ? (lang === 'ar' ? pm.ar : pm.en) : ex.primary}
                      </span>
                      <span className="badge">{t.equip[ex.equip]}</span>
                      <span className="badge">{t.diff[ex.diff]}</span>
                    </div>
                  </div>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ color: isFav ? 'var(--gold-light)' : 'var(--dim)' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isGuest) onRequireAuth();
                      else onToggleFavorite(ex.id);
                    }}
                    aria-label="Favorite"
                  >
                    <Star size={17} fill={isFav ? 'currentColor' : 'none'} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div>
          <div className="notice-box notice-gold" style={{ marginBottom: 14 }}>
            {t.library.muscleVolumeExplain}
          </div>

          {catOrder.map((cat) => {
            const list = SEED_MUSCLES.filter((m) => m.cat === cat);
            return (
              <div key={cat}>
                <div className="section-header">
                  <span>{t.muscleCats[cat]}</span>
                </div>
                <div className="grid grid-2 grid-2-sm-1">
                  {list.map((m) => {
                    const dSets = direct7d[m.id] || 0;
                    const sSets = secondary7d[m.id] || 0;
                    const eff = Math.round((dSets + sSets * 0.5) * 10) / 10;
                    const barPct = Math.min(100, eff * 8);
                    return (
                      <div
                        key={m.id}
                        className="card"
                        style={{ padding: 12, cursor: 'pointer' }}
                        onClick={() => setSelectedMuscle(m)}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 14 }}>
                              {lang === 'ar' ? m.ar : m.en}
                            </div>
                            <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                              {lang === 'ar' ? m.en : m.ar}
                            </div>
                          </div>
                          <span className="badge badge-gold num">{isGuest ? '—' : eff}</span>
                        </div>
                        {!isGuest && (
                          <>
                            <div
                              style={{
                                height: 5,
                                background: 'var(--panel-2)',
                                borderRadius: 99,
                                marginTop: 8,
                                overflow: 'hidden'
                              }}
                            >
                              <div
                                style={{
                                  height: '100%',
                                  width: `${barPct}%`,
                                  background: dSets > 0 ? 'var(--gold)' : 'var(--muted)'
                                }}
                              />
                            </div>
                            <div className="num" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                              {lang === 'ar'
                                ? `مباشر: ${dSets} • ثانوي (×0.5): ${sSets}`
                                : `Direct: ${dSets} • Secondary (×0.5): ${sSets}`}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Muscle Detail Modal */}
      {selectedMuscle && (
        <div className="modal-backdrop" onClick={() => setSelectedMuscle(null)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 800 }}>
                  {lang === 'ar' ? selectedMuscle.ar : selectedMuscle.en}
                </h3>
                <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                  {lang === 'ar' ? selectedMuscle.en : selectedMuscle.ar}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedMuscle(null)}>
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'grid', gap: 12, fontSize: 13.5 }}>
              <div>
                <h4 style={{ fontSize: 12, color: 'var(--gold-light)', marginBottom: 4 }}>
                  {lang === 'ar' ? 'الوظيفة التشريحية والميكانيكية' : 'Biomechanical Function'}
                </h4>
                <p>{lang === 'ar' ? selectedMuscle.fn_ar : selectedMuscle.fn_en}</p>
              </div>
              <div>
                <h4 style={{ fontSize: 12, color: 'var(--gold-light)', marginBottom: 4 }}>
                  {lang === 'ar' ? 'ملاحظات التدريب وتوزيع الحجم' : 'Training Notes'}
                </h4>
                <p style={{ color: 'var(--muted)' }}>
                  {lang === 'ar' ? selectedMuscle.notes_ar : selectedMuscle.notes_en}
                </p>
              </div>
              <div>
                <h4 style={{ fontSize: 12, color: 'var(--gold-light)', marginBottom: 6 }}>
                  {lang === 'ar' ? 'تمارين تستهدفها مباشرة (100%)' : 'Direct Target Exercises (100%)'}
                </h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {exercises
                    .filter((e) => e.primary === selectedMuscle.id)
                    .map((e) => (
                      <button
                        key={e.id}
                        className="btn btn-outline-gold btn-sm"
                        onClick={() => {
                          setSelectedMuscle(null);
                          onOpenExerciseDetail(e.id);
                        }}
                      >
                        {lang === 'ar' ? e.ar : e.en}
                      </button>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
