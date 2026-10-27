import type { MuscleInfo } from '../types';

export const SEED_MUSCLES: MuscleInfo[] = [
  {
    id: 'pec_major',
    ar: 'العضلة الصدرية الكبرى',
    en: 'Pectoralis Major',
    cat: 'chest',
    fn_ar: 'ضم الذراع أفقيًا ودفعها بعيدًا عن الصدر؛ تشمل الرأس الترقوي (العلوي) والرأس القصّي الضلعي (الأوسط والسفلي).',
    fn_en: 'Horizontal shoulder adduction and pressing away from the torso; comprises clavicular (upper) and sternocostal (mid/lower) heads.',
    notes_ar: 'العضلة الرئيسية لحركات الدفع الأفقي والمائل. تنويع زوايا المقعد (مستوٍ ومائل 30°) يغطي أليافها بكفاءة.',
    notes_en: 'Primary prime mover in horizontal and incline pressing. Varying bench angles (flat and ~30° incline) provides thorough fiber coverage.'
  },
  {
    id: 'pec_minor',
    ar: 'العضلة الصدرية الصغرى',
    en: 'Pectoralis Minor',
    cat: 'chest',
    fn_ar: 'سحب لوح الكتف للأمام والأسفل والمساهمة في استقرار الحزام الكتفي.',
    fn_en: 'Scapular protraction and depression, assisting shoulder girdle stabilization.',
    notes_ar: 'تعمل كعضلة مساندة في حركات الضغط والغطس؛ لا تتطلب تمرين عزل مستقل عادةً.',
    notes_en: 'Acts synergistically during presses and dips; rarely requires dedicated isolation work.'
  },
  {
    id: 'ant_delt',
    ar: 'الدالية الأمامية',
    en: 'Anterior Deltoid',
    cat: 'shoulders',
    fn_ar: 'ثني الكتف ورفع الذراع للأمام والمساهمة القوية في كل تمارين الضغط.',
    fn_en: 'Shoulder flexion and strong assistance across horizontal and vertical pressing movements.',
    notes_ar: 'تنال حجمًا غير مباشر مرتفعًا من ضغط الصدر؛ أضف ضغطًا رأسيًا باعتدال دون إفراط.',
    notes_en: 'Receives substantial indirect volume from chest pressing; add overhead pressing in moderate doses.'
  },
  {
    id: 'lat_delt',
    ar: 'الدالية الجانبية',
    en: 'Lateral Deltoid',
    cat: 'shoulders',
    fn_ar: 'إبعاد الذراع جانبيًا عن الجذع (Shoulder Abduction) وإبراز عرض الكتفين.',
    fn_en: 'Shoulder abduction in the scapular plane, contributing to shoulder width.',
    notes_ar: 'تستجيب جيدًا للرفرفة الجانبية بالدمبل أو الكابل بتحكم كامل وأوزان معتدلة.',
    notes_en: 'Responds well to controlled dumbbell or cable lateral raises with moderate loads.'
  },
  {
    id: 'post_delt',
    ar: 'الدالية الخلفية',
    en: 'Posterior Deltoid',
    cat: 'shoulders',
    fn_ar: 'إبعاد الذراع أفقيًا للخلف وتدوير الكتف خارجيًا وموازنة الدالية الأمامية.',
    fn_en: 'Horizontal shoulder abduction and external rotation assistance, balancing anterior pressing.',
    notes_ar: 'مهمة لتوازن الكتف؛ استهدفها بسحب الوجه والرفرفة الخلفية إلى جانب تمارين السحب.',
    notes_en: 'Essential for balanced shoulder mechanics; train with face pulls and rear delt flyes alongside rows.'
  },
  {
    id: 'lat',
    ar: 'الظهرية العريضة',
    en: 'Latissimus Dorsi',
    cat: 'back',
    fn_ar: 'بسط الكتف وتقريب الذراع للجذع من الأعلى والأمام، وتمنح الظهر اتساعه.',
    fn_en: 'Shoulder extension and adduction, providing upper-body pulling power and back width.',
    notes_ar: 'تُستهدف بالسحب الرأسي (العقلة والسحب الأمامي) والسحب الأفقي القريب من الجذع.',
    notes_en: 'Targeted through vertical pulls (pull-ups, pulldowns) and rows performed close to the torso.'
  },
  {
    id: 'trap',
    ar: 'شبه المنحرفة (الترابيس)',
    en: 'Trapezius',
    cat: 'back',
    fn_ar: 'رفع وضم وخفض لوح الكتف عبر أليافها العلوية والوسطى والسفلية.',
    fn_en: 'Scapular elevation, retraction, and depression across upper, middle, and lower fibers.',
    notes_ar: 'الألياف الوسطى والسفلية أساسية لثبات لوح الكتف في السحب الأفقي وسحب الوجه.',
    notes_en: 'Middle and lower fibers are vital for scapular stability during rows and face pulls.'
  },
  {
    id: 'rhomboids',
    ar: 'العضلات المعينية',
    en: 'Rhomboids',
    cat: 'back',
    fn_ar: 'ضم لوحي الكتف للداخل وتثبيتهما على القفص الصدري.',
    fn_en: 'Scapular retraction and downward rotation stability.',
    notes_ar: 'تعمل بقوة في تمارين السحب الأفقي بالبار والكابل والأجهزة المدعومة للصدر.',
    notes_en: 'Heavily engaged in barbell, cable, and chest-supported horizontal rows.'
  },
  {
    id: 'erector',
    ar: 'الناصبة للفقرات',
    en: 'Erector Spinae',
    cat: 'back',
    fn_ar: 'بسط العمود الفقري ومقاومة الانثناء الأمامي أثناء الرفعات المركبة.',
    fn_en: 'Spinal extension and anti-flexion isometric stabilization during compound lifts.',
    notes_ar: 'تتحمل جهدًا عاليًا في القرفصاء والرفعة الرومانية؛ راقب التعافي الكلي لأسفل الظهر.',
    notes_en: 'Heavily loaded in squats and Romanian deadlifts; manage cumulative axial fatigue carefully.'
  },
  {
    id: 'biceps',
    ar: 'ذات الرأسين العضدية (البايسبس)',
    en: 'Biceps Brachii',
    cat: 'arms',
    fn_ar: 'ثني المرفق ولف الساعد للخارج (Supination).',
    fn_en: 'Elbow flexion and forearm supination.',
    notes_ar: 'تشارك في كل تمارين السحب؛ أضف تمارين مرجحة مباشرة بحجم معتدل.',
    notes_en: 'Assists in all pulling movements; add moderate direct curl volume for complete development.'
  },
  {
    id: 'triceps',
    ar: 'ثلاثية الرؤوس العضدية (الترايسبس)',
    en: 'Triceps Brachii',
    cat: 'arms',
    fn_ar: 'بسط المرفق عبر رؤوسها الثلاثة (الطويلة، الجانبية، الإنسية).',
    fn_en: 'Elbow extension across long, lateral, and medial heads; long head also assists shoulder extension.',
    notes_ar: 'الجمع بين الدفع بالكابل والتمديد فوق الرأس يغطي الرؤوس الثلاثة بفعالية.',
    notes_en: 'Combining pushdowns with overhead extensions trains both shortened and lengthened positions.'
  },
  {
    id: 'brachialis',
    ar: 'العضلة العضدية',
    en: 'Brachialis',
    cat: 'arms',
    fn_ar: 'ثني المرفق بقوة بغض النظر عن دوران الساعد.',
    fn_en: 'Pure elbow flexor regardless of forearm rotation.',
    notes_ar: 'تُستهدف بفعالية في المرجحة بالمطرقة (Hammer Curl).',
    notes_en: 'Effectively targeted with neutral-grip hammer curls.'
  },
  {
    id: 'brachioradialis',
    ar: 'العضدية الكعبرية',
    en: 'Brachioradialis',
    cat: 'arms',
    fn_ar: 'ثني المرفق خصوصًا في القبضة المحايدة والعلوية ودعم الساعد.',
    fn_en: 'Assists elbow flexion, especially in neutral and pronated forearm positions.',
    notes_ar: 'تعمل في المرجحة بالمطرقة وتمارين السحب الثقيلة.',
    notes_en: 'Trained via hammer curls and heavy pulling movements.'
  },
  {
    id: 'wrist_flex',
    ar: 'مثنيات الرسغ',
    en: 'Wrist Flexors',
    cat: 'arms',
    fn_ar: 'ثني الرسغ وإحكام القبضة.',
    fn_en: 'Wrist flexion and grip strength support.',
    notes_ar: 'تدعم قوة القبضة في السحب والرفعات.',
    notes_en: 'Supports grip endurance in pulling and deadlift variations.'
  },
  {
    id: 'wrist_ext',
    ar: 'باسطات الرسغ',
    en: 'Wrist Extensors',
    cat: 'arms',
    fn_ar: 'بسط الرسغ وتثبيته وموازنة المثنيات.',
    fn_en: 'Wrist extension and stabilization during gripping.',
    notes_ar: 'موازنتها تقلل الإجهاد حول مفصل المرفق.',
    notes_en: 'Balanced forearm strength helps reduce elbow tendon strain.'
  },
  {
    id: 'quad',
    ar: 'الرباعية الفخذية',
    en: 'Quadriceps',
    cat: 'legs',
    fn_ar: 'بسط الركبة والمساهمة في ثني الورك (المستقيمة الفخذية).',
    fn_en: 'Knee extension; rectus femoris also contributes to hip flexion.',
    notes_ar: 'تُستهدف بالقرفصاء ودفع الأرجل وتمديد الأرجل لاستكمال تحفيز المستقيمة الفخذية.',
    notes_en: 'Trained with squats and leg presses, plus leg extensions to fully recruit rectus femoris.'
  },
  {
    id: 'hamstring',
    ar: 'المأبضية (الخلفية)',
    en: 'Hamstrings',
    cat: 'legs',
    fn_ar: 'بسط الورك وثني الركبة.',
    fn_en: 'Hip extension and knee flexion.',
    notes_ar: 'الأفضل الجمع بين نمط مفصلة الورك (الرفعة الرومانية) ونمط ثني الركبة (Leg Curl).',
    notes_en: 'Best trained by pairing a hip-hinge movement (RDL) with a knee-flexion curl.'
  },
  {
    id: 'glute_max',
    ar: 'الألوية الكبرى',
    en: 'Gluteus Maximus',
    cat: 'legs',
    fn_ar: 'بسط الورك وتدويره للخارج وتثبيت الحوض.',
    fn_en: 'Powerful hip extension, external rotation, and pelvic control.',
    notes_ar: 'تعمل بقوة في دفع الحوض، القرفصاء العميقة، القرفصاء البلغارية، والرفعة الرومانية.',
    notes_en: 'Strongly recruited in hip thrusts, deep squats, split squats, and RDLs.'
  },
  {
    id: 'glute_med',
    ar: 'الألوية المتوسطة',
    en: 'Gluteus Medius',
    cat: 'legs',
    fn_ar: 'إبعاد الورك وتثبيت الحوض أفقيًا أثناء الوقوف على قدم واحدة.',
    fn_en: 'Hip abduction and frontal-plane pelvic stabilization in unilateral stances.',
    notes_ar: 'تنشط بقوة في التمارين الأحادية مثل القرفصاء البلغارية.',
    notes_en: 'Highly active during single-leg movements like Bulgarian split squats.'
  },
  {
    id: 'calves',
    ar: 'السمانة (التوأمية والنعلية)',
    en: 'Gastrocnemius & Soleus',
    cat: 'legs',
    fn_ar: 'ثني الكاحل أخمصيًا (Plantarflexion) ودفع القدم.',
    fn_en: 'Ankle plantarflexion in straight-knee (gastrocnemius) and bent-knee (soleus) positions.',
    notes_ar: 'الجمع بين الرفع واقفًا وجالسًا مع توقف في التمدد والقمة يعطي تحفيزًا متكاملًا.',
    notes_en: 'Pairing standing and seated calf raises with controlled pauses at stretch and peak works well.'
  },
  {
    id: 'abs',
    ar: 'مستقيمة البطن',
    en: 'Rectus Abdominis',
    cat: 'core',
    fn_ar: 'ثني العمود الفقري ومقاومة التمدد القطني.',
    fn_en: 'Spinal flexion and anti-extension trunk control.',
    notes_ar: 'تُستهدف برفع الأرجل معلقًا وطحن الكابل مع ثني فعلي للعمود الفقري.',
    notes_en: 'Targeted through hanging leg raises and cable crunches with controlled spinal flexion.'
  },
  {
    id: 'obliques',
    ar: 'العضلات المائلة',
    en: 'Obliques',
    cat: 'core',
    fn_ar: 'تدوير الجذع والميل الجانبي ومقاومة الدوران.',
    fn_en: 'Trunk rotation, lateral flexion, and anti-rotation stability.',
    notes_ar: 'تحكم في الدوران من الجذع لا من الذراعين.',
    notes_en: 'Focus on controlled ribcage-to-pelvis rotation rather than swinging the arms.'
  },
  {
    id: 'transverse',
    ar: 'المستعرضة البطنية',
    en: 'Transverse Abdominis',
    cat: 'core',
    fn_ar: 'تنظيم الضغط داخل البطن وتثبيت العمود الفقري.',
    fn_en: 'Intra-abdominal pressure regulation and deep core bracing.',
    notes_ar: 'أساسية في البلانك وفي التثبيت التنفسي قبل القرفصاء والرفعات.',
    notes_en: 'Essential during planks and bracing prior to heavy compound lifts.'
  },
  {
    id: 'serratus',
    ar: 'المنشارية الأمامية',
    en: 'Serratus Anterior',
    cat: 'core',
    fn_ar: 'دفع لوح الكتف للأمام وتدويره للأعلى أثناء الرفع فوق الرأس.',
    fn_en: 'Scapular protraction and upward rotation during pressing and overhead reach.',
    notes_ar: 'تشارك في الضغط والبلانك والعقلة وتدعم صحة الكتف.',
    notes_en: 'Supports healthy scapular rhythm in presses, planks, and overhead movements.'
  }
];

export const MUSCLES_MAP: Record<string, MuscleInfo> = Object.fromEntries(
  SEED_MUSCLES.map((m) => [m.id, m])
);
