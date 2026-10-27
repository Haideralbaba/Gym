import type { ExerciseData, WorkoutSessionRecord, WeightUnit } from '../types';
import { fromCanonicalKgNum, KG_TO_LB } from './units';

export interface ProgressionRecommendation {
  status: 'insufficient_data' | 'increase_weight' | 'progress_reps' | 'hold_steady';
  basis: 'reps_and_rir' | 'reps_only' | 'none';
  suggestedWeightKg: number | null;
  incrementDisplay: string | null;
  suggestedDisplayWeight: string | null;
  title_ar: string;
  title_en: string;
  explanation_ar: string;
  explanation_en: string;
  evidenceSummary_ar: string;
  evidenceSummary_en: string;
}

/**
 * Conservative, transparent progressive overload evaluator (Section 9):
 * - Requires at least 2 completed historical sessions with working sets for this exact exercise.
 * - Never invents history or recommends increases solely because a new week started.
 * - Records explicitly whether recommendation used optional RIR or rep performance only.
 * - Leaves final approval strictly to the user.
 */
export function evaluateProgression(
  exercise: ExerciseData,
  targetRepsStr: string,
  completedSessions: WorkoutSessionRecord[],
  displayUnit: WeightUnit
): ProgressionRecommendation {
  // Gather direct completed working sets from completed sessions (newest first)
  const matchingSessions = completedSessions
    .filter((s) => s.status === 'completed')
    .map((s) => {
      const exBlock = s.exercises.find((e) => e.exerciseId === exercise.id);
      const workingDone = (exBlock?.sets || []).filter(
        (st) => st.done && st.setType === 'working' && st.reps !== null && st.reps > 0
      );
      return { session: s, workingDone };
    })
    .filter((x) => x.workingDone.length > 0)
    .sort((a, b) => (b.session.endedAt || 0) - (a.session.endedAt || 0));

  if (matchingSessions.length < 2) {
    return {
      status: 'insufficient_data',
      basis: 'none',
      suggestedWeightKg: null,
      incrementDisplay: null,
      suggestedDisplayWeight: null,
      title_ar: 'بيانات غير كافية لتوصية موثوقة',
      title_en: 'Insufficient data for a reliable recommendation',
      explanation_ar:
        matchingSessions.length === 0
          ? 'لم تُسجّل جلسات مكتملة سابقة لهذا التمرين بعد. سجّل جلستين مكتملتين على الأقل لبناء توصية محافظة وموثوقة.'
          : 'تتوفر جلسة مكتملة واحدة فقط لهذا التمرين. نحتاج جلستين مكتملتين على الأقل للتحقق من ثبات الأداء قبل اقتراح زيادة الحمل.',
      explanation_en:
        matchingSessions.length === 0
          ? 'No completed sessions exist for this exercise yet. Complete at least two sessions to establish a reliable baseline.'
          : 'Only one completed session is recorded for this exercise. At least two completed sessions are required before recommending a load increase.',
      evidenceSummary_ar: `الجلسات المكتملة المسجلة: ${matchingSessions.length} من أصل 2 مطلوبة كحد أدنى.`,
      evidenceSummary_en: `Recorded completed sessions: ${matchingSessions.length} of 2 minimum required.`
    };
  }

  const latest = matchingSessions[0];
  const prev = matchingSessions[1];
  const latestSets = latest.workingDone;
  const hasRir = latestSets.some((st) => st.rir !== null && st.rir !== undefined);
  const basis: 'reps_and_rir' | 'reps_only' = hasRir ? 'reps_and_rir' : 'reps_only';

  const rangeMatch = (targetRepsStr || exercise.reps).match(/(\d+)\s*[-–]\s*(\d+)/);
  const minTarget = rangeMatch ? parseInt(rangeMatch[1], 10) : parseInt(targetRepsStr, 10) || 8;
  const maxTarget = rangeMatch ? parseInt(rangeMatch[2], 10) : minTarget;

  const topWeightKg = Math.max(...latestSets.map((s) => s.weightKg ?? 0));
  const repsList = latestSets.map((s) => s.reps ?? 0);
  const allHitMax = repsList.length >= 2 && repsList.every((r) => r >= maxTarget);
  const allHitMin = repsList.every((r) => r >= minTarget);
  const avgRir = hasRir
    ? latestSets.reduce((acc, s) => acc + (s.rir ?? 1.5), 0) / latestSets.length
    : null;

  const latestDateAr = new Date(latest.session.endedAt || latest.session.startedAt).toLocaleDateString('ar-EG', {
    day: 'numeric',
    month: 'short'
  });
  const prevDateAr = new Date(prev.session.endedAt || prev.session.startedAt).toLocaleDateString('ar-EG', {
    day: 'numeric',
    month: 'short'
  });
  const latestDateEn = new Date(latest.session.endedAt || latest.session.startedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
  const prevDateEn = new Date(prev.session.endedAt || prev.session.startedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });

  const dispWeight = fromCanonicalKgNum(topWeightKg, displayUnit);
  const setsSummary = latestSets.map((s) => `${fromCanonicalKgNum(s.weightKg, displayUnit)}${displayUnit}×${s.reps}`).join('، ');
  const setsSummaryEn = latestSets.map((s) => `${fromCanonicalKgNum(s.weightKg, displayUnit)}${displayUnit}×${s.reps}`).join(', ');

  // Bodyweight exercises focus on rep/duration progression
  if (exercise.equip === 'bodyweight' && topWeightKg === 0) {
    return {
      status: allHitMax ? 'progress_reps' : 'hold_steady',
      basis,
      suggestedWeightKg: 0,
      incrementDisplay: null,
      suggestedDisplayWeight: null,
      title_ar: allHitMax ? 'جاهز لإضافة تكرار أو ثانية بتحكم' : 'واصل التدرج داخل النطاق المستهدف',
      title_en: allHitMax ? 'Ready to add +1 controlled rep / +5s hold' : 'Continue building reps within target range',
      explanation_ar: allHitMax
        ? `حققت أعلى النطاق المستهدف (${maxTarget}) في جميع مجموعات العمل خلال آخر جلسة.`
        : `حافظ على جودة المدى الحركي وأضف تكرارًا تدريجيًا حتى تصل إلى ${maxTarget} في كل المجموعات.`,
      explanation_en: allHitMax
        ? `You reached the top of the target range (${maxTarget}) across all working sets in your last session.`
        : `Maintain strict form and build toward ${maxTarget} across all working sets.`,
      evidenceSummary_ar: `معتمد على جلستي ${latestDateAr} و${prevDateAr} (${repsList.join('، ')} تكرار).`,
      evidenceSummary_en: `Based on sessions on ${latestDateEn} & ${prevDateEn} (reps: ${repsList.join(', ')}).`
    };
  }

  // Check if RIR was logged and indicates excessive grind (< 0.5 average RIR)
  const rirTooLow = avgRir !== null && avgRir < 0.5;

  if (allHitMax && !rirTooLow && topWeightKg > 0) {
    const incKg =
      exercise.equip === 'dumbbell' || exercise.equip === 'cable'
        ? displayUnit === 'lb'
          ? 2.5 / KG_TO_LB
          : 1.0
        : displayUnit === 'lb'
        ? 5.0 / KG_TO_LB
        : 2.5;

    const newWeightKg = Math.round((topWeightKg + incKg) * 1000) / 1000;
    const newDisp = fromCanonicalKgNum(newWeightKg, displayUnit);
    const incDisp = displayUnit === 'kg' ? (exercise.equip === 'dumbbell' || exercise.equip === 'cable' ? '1' : '2.5') : (exercise.equip === 'dumbbell' || exercise.equip === 'cable' ? '2.5' : '5');

    return {
      status: 'increase_weight',
      basis,
      suggestedWeightKg: newWeightKg,
      incrementDisplay: `+${incDisp} ${displayUnit}`,
      suggestedDisplayWeight: `${newDisp} ${displayUnit}`,
      title_ar: `اقتراح محافظ: زيادة +${incDisp} ${displayUnit} (ليصبح ${newDisp} ${displayUnit})`,
      title_en: `Conservative suggestion: +${incDisp} ${displayUnit} (to ${newDisp} ${displayUnit})`,
      explanation_ar: hasRir
        ? `أتممت جميع مجموعات العمل عند الحد الأعلى للنطاق (${maxTarget} تكرار) بمتوسط جهد متبقٍ (RIR ${avgRir!.toFixed(1)}) يسمح بزيادة تدريجية آمنة. القرار النهائي لك.`
        : `أتممت جميع مجموعات العمل عند الحد الأعلى للنطاق (${maxTarget} تكرار) بثبات. يمكنك تجربة زيادة طفيفة مع الحفاظ على الأداء الفني.`,
      explanation_en: hasRir
        ? `You hit the top of your ${minTarget}–${maxTarget} rep range on every working set with controlled reserve (avg RIR ${avgRir!.toFixed(1)}). Approval is optional.`
        : `You hit the top of your ${minTarget}–${maxTarget} rep range across all working sets. Consider a small conservative load step if form feels crisp.`,
      evidenceSummary_ar: `البيانات المعتمدة (${latestDateAr} و${prevDateAr}): ${setsSummary}`,
      evidenceSummary_en: `Evidence (${latestDateEn} & ${prevDateEn}): ${setsSummaryEn}`
    };
  }

  return {
    status: allHitMin ? 'progress_reps' : 'hold_steady',
    basis,
    suggestedWeightKg: topWeightKg > 0 ? topWeightKg : null,
    incrementDisplay: null,
    suggestedDisplayWeight: topWeightKg > 0 ? `${dispWeight} ${displayUnit}` : null,
    title_ar: allHitMin
      ? `ثبّت الوزن عند ${dispWeight} ${displayUnit} واستهدف إضافة تكرار واحد`
      : `حافظ على الوزن الحالي (${dispWeight} ${displayUnit}) أو خففه قليلًا لإتقان النطاق`,
    title_en: allHitMin
      ? `Hold ${dispWeight} ${displayUnit} and aim for +1 rep within ${minTarget}–${maxTarget}`
      : `Stay at ${dispWeight} ${displayUnit} to consolidate ${minTarget}–${maxTarget} reps cleanly`,
    explanation_ar: rirTooLow
      ? `رغم بلوغ أعلى النطاق، أشار RIR المسجل (${avgRir!.toFixed(1)}) إلى اقتراب شديد من الفشل؛ تثبيت الوزن لجلسة إضافية أكثر أمانًا من زيادته.`
      : `تدرّج بالتكرارات أولًا حتى تحقق ${maxTarget} تكرار في جميع مجموعات العمل قبل رفع الوزن.`,
    explanation_en: rirTooLow
      ? `Although top reps were reached, logged RIR (${avgRir!.toFixed(1)}) indicates maximal effort—consolidating this weight first is safer.`
      : `Build reps cleanly across all working sets up to ${maxTarget} before adding load.`,
    evidenceSummary_ar: `البيانات المعتمدة (${latestDateAr} و${prevDateAr}): ${setsSummary}`,
    evidenceSummary_en: `Evidence (${latestDateEn} & ${prevDateEn}): ${setsSummaryEn}`
  };
}
