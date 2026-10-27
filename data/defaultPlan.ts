import type { PlanDay, ExerciseData, Equipment } from '../types';
import { SEED_MUSCLES } from './seedMuscles';

/**
 * Default VOXA Plan: Balanced 6-Day Upper / Lower + 1 Weekly Rest Day
 * Alternates Upper and Lower body to manage localized muscle fatigue while providing
 * balanced exposure across free weights (barbell/dumbbell), machines, cables, and bodyweight.
 * Initial working volumes are deliberately moderate (2–3 sets per exercise) and editable.
 */
export const DEFAULT_UPPER_LOWER_DAYS: PlanDay[] = [
  {
    key: 'sat',
    weekday: 6,
    seqOrder: 0,
    isRest: false,
    name_ar: 'علوي أ — قوة وتوازن أفقي (Upper A)',
    name_en: 'Upper A — Horizontal Push & Pull',
    focus_ar: 'الصدر، الظهر، الأكتاف، الترايسبس والبايسبس',
    focus_en: 'Chest, Back, Shoulders, Triceps & Biceps',
    items: [
      { exerciseId: 'bench_press', sets: 3, reps: '6-8', rest: 150 },
      { exerciseId: 'barbell_row', sets: 3, reps: '6-10', rest: 150 },
      { exerciseId: 'db_shoulder_press', sets: 3, reps: '8-12', rest: 120 },
      { exerciseId: 'lat_pulldown', sets: 3, reps: '8-12', rest: 120 },
      { exerciseId: 'triceps_pushdown', sets: 2, reps: '10-15', rest: 60 },
      { exerciseId: 'barbell_curl', sets: 2, reps: '8-12', rest: 75 }
    ]
  },
  {
    key: 'sun',
    weekday: 0,
    seqOrder: 1,
    isRest: false,
    name_ar: 'سفلي أ — قرفصاء وسلسلة خلفية (Lower A)',
    name_en: 'Lower A — Squat & Posterior Chain',
    focus_ar: 'الرباعية، المأبضية، الألوية، السمانة والجذع',
    focus_en: 'Quads, Hamstrings, Glutes, Calves & Core',
    items: [
      { exerciseId: 'barbell_squat', sets: 3, reps: '5-8', rest: 180 },
      { exerciseId: 'romanian_deadlift', sets: 3, reps: '6-10', rest: 150 },
      { exerciseId: 'leg_press', sets: 3, reps: '10-12', rest: 120 },
      { exerciseId: 'leg_curl', sets: 2, reps: '10-15', rest: 75 },
      { exerciseId: 'standing_calf_raise', sets: 3, reps: '12-16', rest: 60 },
      { exerciseId: 'plank', sets: 3, reps: '30-60', rest: 60 }
    ]
  },
  {
    key: 'mon',
    weekday: 1,
    seqOrder: 2,
    isRest: false,
    name_ar: 'علوي ب — ضغط مائل وسحب رأسي (Upper B)',
    name_en: 'Upper B — Incline & Vertical Focus',
    focus_ar: 'أعلى الصدر، الظهرية العريضة، الدالية الجانبية والخلفية والذراعان',
    focus_en: 'Upper Chest, Lats, Side/Rear Delts & Arms',
    items: [
      { exerciseId: 'incline_db_press', sets: 3, reps: '8-12', rest: 120 },
      { exerciseId: 'pull_up', sets: 3, reps: '5-10', rest: 150 },
      { exerciseId: 'chest_supported_row', sets: 3, reps: '8-12', rest: 90 },
      { exerciseId: 'lateral_raise', sets: 3, reps: '12-15', rest: 60 },
      { exerciseId: 'face_pull', sets: 2, reps: '12-15', rest: 60 },
      { exerciseId: 'overhead_triceps_ext', sets: 2, reps: '10-15', rest: 75 },
      { exerciseId: 'hammer_curl', sets: 2, reps: '10-12', rest: 75 }
    ]
  },
  {
    key: 'tue',
    weekday: 2,
    seqOrder: 3,
    isRest: false,
    name_ar: 'سفلي ب — دفع الحوض وتوازن أحادي (Lower B)',
    name_en: 'Lower B — Hip Hinge & Unilateral',
    focus_ar: 'الألوية، الرباعية الأحادية، المأبضية، النعلية والبطن',
    focus_en: 'Glutes, Unilateral Quads, Hamstrings, Soleus & Abs',
    items: [
      { exerciseId: 'hip_thrust', sets: 3, reps: '8-12', rest: 120 },
      { exerciseId: 'bulgarian_split_squat', sets: 3, reps: '8-12', rest: 120 },
      { exerciseId: 'leg_extension', sets: 3, reps: '10-15', rest: 75 },
      { exerciseId: 'leg_curl', sets: 2, reps: '10-15', rest: 75 },
      { exerciseId: 'seated_calf_raise', sets: 3, reps: '12-20', rest: 60 },
      { exerciseId: 'hanging_leg_raise', sets: 3, reps: '10-15', rest: 75 }
    ]
  },
  {
    key: 'wed',
    weekday: 3,
    seqOrder: 4,
    isRest: false,
    name_ar: 'علوي ج — أجهزة وكابلات وتنوع زوايا (Upper C)',
    name_en: 'Upper C — Controlled Angles & Cables',
    focus_ar: 'الصدر، منتصف الظهر، الأكتاف والذراعان بإجهاد محوري منخفض',
    focus_en: 'Chest, Mid-Back, Delts & Arms with low axial fatigue',
    items: [
      { exerciseId: 'machine_chest_press', sets: 3, reps: '8-12', rest: 90 },
      { exerciseId: 'seated_cable_row', sets: 3, reps: '10-12', rest: 90 },
      { exerciseId: 'cable_crossover', sets: 2, reps: '10-15', rest: 75 },
      { exerciseId: 'arnold_press', sets: 2, reps: '8-12', rest: 90 },
      { exerciseId: 'cable_lateral_raise', sets: 3, reps: '12-15', rest: 60 },
      { exerciseId: 'rear_delt_fly', sets: 2, reps: '12-15', rest: 60 },
      { exerciseId: 'skull_crusher', sets: 2, reps: '8-12', rest: 90 },
      { exerciseId: 'preacher_curl', sets: 2, reps: '10-12', rest: 75 }
    ]
  },
  {
    key: 'thu',
    weekday: 4,
    seqOrder: 5,
    isRest: false,
    name_ar: 'سفلي ج — تكامل سفلي وجذع (Lower C)',
    name_en: 'Lower C — Lower Hypertrophy & Core',
    focus_ar: 'الرباعية، المأبضية، السمانة، البطن والعضلات المائلة',
    focus_en: 'Quads, Hamstrings, Calves, Abs & Obliques',
    items: [
      { exerciseId: 'goblet_squat', sets: 3, reps: '8-12', rest: 120 },
      { exerciseId: 'romanian_deadlift', sets: 2, reps: '8-10', rest: 150 },
      { exerciseId: 'leg_press', sets: 3, reps: '10-12', rest: 120 },
      { exerciseId: 'standing_calf_raise', sets: 3, reps: '12-16', rest: 60 },
      { exerciseId: 'cable_crunch', sets: 3, reps: '10-15', rest: 60 },
      { exerciseId: 'russian_twist', sets: 2, reps: '12-20', rest: 60 }
    ]
  },
  {
    key: 'fri',
    weekday: 5,
    seqOrder: 6,
    isRest: true,
    name_ar: 'يوم راحة واستشفاء',
    name_en: 'Rest & Recovery Day',
    focus_ar: 'تعافٍ عضلي وعصبي، مشي خفيف أو إطالة اختيارية',
    focus_en: 'Systemic recovery, light walking, and optional mobility',
    items: []
  }
];

export interface WeeklyVolumeBreakdown {
  muscleId: string;
  directSets: number;
  secondarySets: number;
  effectiveSets: number; // direct * 1.0 + secondary * 0.5
}

export function computePlanWeeklyVolume(
  days: PlanDay[],
  exercisesById: Record<string, ExerciseData>
): Record<string, WeeklyVolumeBreakdown> {
  const result: Record<string, WeeklyVolumeBreakdown> = {};
  for (const m of SEED_MUSCLES) {
    result[m.id] = { muscleId: m.id, directSets: 0, secondarySets: 0, effectiveSets: 0 };
  }
  for (const d of days) {
    if (d.isRest) continue;
    for (const item of d.items) {
      const ex = exercisesById[item.exerciseId];
      if (!ex) continue;
      const s = Math.max(0, Number(item.sets) || 0);
      if (!result[ex.primary]) {
        result[ex.primary] = { muscleId: ex.primary, directSets: 0, secondarySets: 0, effectiveSets: 0 };
      }
      result[ex.primary].directSets += s;
      for (const sec of ex.secondary || []) {
        if (!result[sec]) {
          result[sec] = { muscleId: sec, directSets: 0, secondarySets: 0, effectiveSets: 0 };
        }
        result[sec].secondarySets += s;
      }
    }
  }
  for (const k of Object.keys(result)) {
    result[k].effectiveSets = Math.round((result[k].directSets + result[k].secondarySets * 0.5) * 10) / 10;
  }
  return result;
}

export interface SubstitutionCandidate {
  exercise: ExerciseData;
  score: number; // 0..100
  isCuratedAlt: boolean;
  samePrimary: boolean;
  samePattern: boolean;
  sameEquip: boolean;
  secondaryOverlapPct: number;
  reason_ar: string;
  reason_en: string;
}

export function rankSubstitutions(
  original: ExerciseData,
  allExercises: ExerciseData[]
): SubstitutionCandidate[] {
  const candidates: SubstitutionCandidate[] = [];
  const origSec = new Set(original.secondary || []);

  for (const cand of allExercises) {
    if (cand.id === original.id) continue;
    const isCuratedAlt = (original.alts || []).includes(cand.id);
    const samePrimary = cand.primary === original.primary;
    const samePattern = cand.pattern === original.pattern;
    const sameEquip: boolean = cand.equip === original.equip;

    const candSec = cand.secondary || [];
    const overlapCount = candSec.filter((m) => origSec.has(m)).length;
    const unionCount = new Set([...origSec, ...candSec]).size || 1;
    const secondaryOverlapPct = Math.round((overlapCount / unionCount) * 100);

    if (!samePrimary && !isCuratedAlt) continue;

    let score = 0;
    if (samePrimary) score += 50;
    if (samePattern) score += 20;
    if (isCuratedAlt) score += 15;
    if (sameEquip) score += 10;
    score += Math.round(secondaryOverlapPct * 0.05);
    score = Math.min(99, score);

    const reasonsAr: string[] = [];
    const reasonsEn: string[] = [];
    if (samePrimary) {
      reasonsAr.push('نفس العضلة الأساسية المستهدفة');
      reasonsEn.push('Targets the exact same primary muscle');
    }
    if (samePattern) {
      reasonsAr.push('نفس النمط الحركي الميكانيكي');
      reasonsEn.push('Matches movement pattern biomechanics');
    }
    if (sameEquip) {
      reasonsAr.push('نفس المعدات المتاحة');
      reasonsEn.push('Uses the same equipment');
    } else {
      const equipNameAr: Record<Equipment, string> = {
        bar: 'بار حر',
        dumbbell: 'دمبل',
        cable: 'كابل',
        machine: 'جهاز مستقر',
        bodyweight: 'وزن الجسم',
        smith: 'جهاز سميث'
      };
      const equipNameEn: Record<Equipment, string> = {
        bar: 'barbell',
        dumbbell: 'dumbbell',
        cable: 'cable',
        machine: 'guided machine',
        bodyweight: 'bodyweight',
        smith: 'Smith machine'
      };
      reasonsAr.push(`بديل عملي عبر (${equipNameAr[cand.equip]}) عند انشغال المعدات`);
      reasonsEn.push(`Practical ${equipNameEn[cand.equip]} option when equipment is busy`);
    }

    candidates.push({
      exercise: cand,
      score,
      isCuratedAlt,
      samePrimary,
      samePattern,
      sameEquip,
      secondaryOverlapPct,
      reason_ar: reasonsAr.join(' • '),
      reason_en: reasonsEn.join(' • ')
    });
  }

  return candidates.sort((a, b) => b.score - a.score);
}
