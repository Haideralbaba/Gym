import assert from 'node:assert/strict';
import http from 'node:http';
import { openVoxaDatabase } from '../server/db';
import { createVoxaApp } from '../server/app';
import { evaluateProgression } from '../src/utils/progression';
import { toCanonicalKg, fromCanonicalKgNum, toCanonicalCm, fromCanonicalCm } from '../src/utils/units';
import { SEED_EXERCISES, EXERCISES_MAP } from '../src/data/seedExercises';

async function runAcceptanceSuite() {
  console.log('=== VOXA End-to-End Acceptance Test Suite (15 Criteria) ===\n');

  process.env.VOXA_OWNER_SECRET = 'test-owner-secret-999';
  const db = openVoxaDatabase(':memory:');
  const app = createVoxaApp(db);
  const server = http.createServer(app);

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address() as { port: number };
  const base = `http://127.0.0.1:${addr.port}`;

  async function api(path: string, opts: RequestInit = {}, token?: string) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(opts.headers as any)
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${base}${path}`, { ...opts, headers });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, data: json };
  }

  try {
    // ------------------------------------------------------------------------
    // 1. Visitor (Guest) can preview catalog & CANNOT save sessions or progress
    // ------------------------------------------------------------------------
    const pubCat = await api('/api/public/catalog');
    assert.equal(pubCat.status, 200);
    assert.ok(pubCat.data.exercises.length >= 39, 'Expected >= 39 bilingual exercises');
    assert.equal(pubCat.data.muscles.length, 24, 'Expected 24 anatomical muscles');
    assert.equal(pubCat.data.defaultPlanDays.length, 7, 'Expected 6-day Upper/Lower + 1 Rest Day');

    const guestStateAttempt = await api('/api/state');
    assert.equal(guestStateAttempt.status, 401, 'Visitor cannot read user workspace');
    const guestSyncAttempt = await api('/api/sync/push', {
      method: 'POST',
      body: JSON.stringify({ mutations: [{ mutationId: 'm1', type: 'START_SESSION', payload: {} }] })
    });
    assert.equal(guestSyncAttempt.status, 401, 'Visitor cannot save workout sessions');
    console.log('✅ [1/15] Guest preview works; unauthenticated writes rejected with 401.');

    // ------------------------------------------------------------------------
    // 2. Email registration, verification, password reset & Google OAuth status
    // ------------------------------------------------------------------------
    const regA = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: 'alice@voxa.test',
        password: 'Password123!',
        displayName: 'Alice',
        language: 'ar'
      })
    });
    assert.equal(regA.status, 201);
    assert.equal(regA.data.user.role, 'user', 'First registered user MUST NOT become owner automatically');
    let aliceToken = regA.data.token as string;
    const verifyToken = regA.data.emailVerification.sandboxVerificationToken as string;
    assert.ok(verifyToken, 'Verification token generated');

    const verRes = await api('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token: verifyToken })
    }, aliceToken);
    assert.equal(verRes.status, 200);
    assert.equal(verRes.data.emailVerified, true);

    // Forgot & Reset password flow
    const forgotRes = await api('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: 'alice@voxa.test' })
    });
    assert.equal(forgotRes.status, 200);
    assert.ok(forgotRes.data.sandboxResetToken);

    const resetRes = await api('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        token: forgotRes.data.sandboxResetToken,
        newPassword: 'NewPassword456!'
      })
    });
    assert.equal(resetRes.status, 200);

    // Old token should be invalidated after password reset
    const oldMe = await api('/api/auth/me', {}, aliceToken);
    assert.equal(oldMe.status, 401, 'Old session revoked after password reset');

    // Login with new password
    const loginA = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'alice@voxa.test', password: 'NewPassword456!' })
    });
    assert.equal(loginA.status, 200);
    aliceToken = loginA.data.token;

    // Google OAuth honest status when unconfigured
    const gStatus = await api('/api/auth/google/status');
    assert.equal(gStatus.data.configured, false);
    const gStart = await api('/api/auth/google/start');
    assert.equal(gStart.status, 503, 'Honest 503 when Google OAuth env vars are not set');
    console.log('✅ [2/15] Email auth, verification, password reset & honest Google OAuth check verified.');

    // ------------------------------------------------------------------------
    // 3. Account state loads directly & AR/EN language preference persists
    // ------------------------------------------------------------------------
    const st1 = await api('/api/state', {}, aliceToken);
    assert.equal(st1.status, 200);
    assert.equal(st1.data.settings.language, 'ar');
    assert.equal(st1.data.activePlan.days[0].name_en.includes('Upper A'), true);
    assert.equal(st1.data.activePlan.days[1].name_en.includes('Lower A'), true);

    await api('/api/sync/push', {
      method: 'POST',
      body: JSON.stringify({
        mutations: [
          {
            mutationId: 'mut_lang_en',
            type: 'UPDATE_SETTINGS',
            deviceId: 'dev_a',
            payload: { language: 'en' }
          }
        ]
      })
    }, aliceToken);
    const stAfterLang = await api('/api/state', {}, aliceToken);
    assert.equal(stAfterLang.data.settings.language, 'en');
    console.log('✅ [3/15] Dashboard state & AR/EN per-account language persistence verified.');

    // ------------------------------------------------------------------------
    // 4 & 5. Per-set saving, reload persistence & explicit Finish Session
    // ------------------------------------------------------------------------
    const sess1Id = '11111111-1111-4111-8111-111111111111';
    const block1Id = '22222222-2222-4222-8222-222222222222';
    const set1Id = '33333333-3333-4333-8333-333333333331';
    const setWarmId = '33333333-3333-4333-8333-333333333332';

    await api('/api/sync/push', {
      method: 'POST',
      body: JSON.stringify({
        mutations: [
          {
            mutationId: 'mut_start_s1',
            type: 'START_SESSION',
            deviceId: 'dev_phone',
            payload: {
              session: {
                id: sess1Id,
                planVersionId: st1.data.activePlan.id,
                dayKey: 'sat',
                sequenceIndex: 0,
                name_ar: 'علوي أ',
                name_en: 'Upper A',
                focus_ar: 'الصدر والظهر',
                focus_en: 'Chest & Back',
                status: 'active',
                startedAt: Date.now() - 1800000,
                accumulatedPauseMs: 0,
                exercises: [
                  {
                    id: block1Id,
                    sessionId: sess1Id,
                    orderIndex: 0,
                    exerciseId: 'bench_press',
                    targetSets: 2,
                    targetReps: '6-8',
                    restSec: 150,
                    sets: [
                      {
                        id: setWarmId,
                        sessionId: sess1Id,
                        sessionExerciseId: block1Id,
                        exerciseId: 'bench_press',
                        setIndex: 0,
                        setType: 'warmup',
                        weightKg: 40,
                        enteredUnit: 'kg',
                        reps: 10,
                        rir: null,
                        done: true,
                        completedAt: Date.now() - 1700000,
                        version: 1,
                        lastDeviceId: 'dev_phone'
                      },
                      {
                        id: set1Id,
                        sessionId: sess1Id,
                        sessionExerciseId: block1Id,
                        exerciseId: 'bench_press',
                        setIndex: 1,
                        setType: 'working',
                        weightKg: 80,
                        enteredUnit: 'kg',
                        reps: 8,
                        rir: null, // Optional RIR left blank!
                        done: true,
                        completedAt: Date.now() - 1600000,
                        version: 1,
                        lastDeviceId: 'dev_phone'
                      }
                    ]
                  }
                ]
              }
            }
          }
        ]
      })
    }, aliceToken);

    // Reload state BEFORE finishing session -> must still be 'active', NOT completed!
    const midReload = await api('/api/state', {}, aliceToken);
    const activeLoaded = midReload.data.sessions.find((s: any) => s.id === sess1Id);
    assert.ok(activeLoaded, 'Active session persisted');
    assert.equal(activeLoaded.status, 'active', 'Session MUST NOT auto-complete before explicit finish');
    assert.equal(activeLoaded.exercises[0].sets[1].weightKg, 80);
    assert.equal(activeLoaded.exercises[0].sets[1].rir, null);
    console.log('✅ [4/15] Individual working & warmup sets saved with blank optional RIR and restored on reload.');

    // Explicitly finish session
    await api('/api/sync/push', {
      method: 'POST',
      body: JSON.stringify({
        mutations: [
          {
            mutationId: 'mut_finish_s1',
            type: 'FINISH_SESSION',
            deviceId: 'dev_phone',
            payload: { sessionId: sess1Id, endedAt: Date.now() - 1200000, accumulatedPauseMs: 0 }
          }
        ]
      })
    }, aliceToken);

    const afterFinish = await api('/api/state', {}, aliceToken);
    const completedLoaded = afterFinish.data.sessions.find((s: any) => s.id === sess1Id);
    assert.equal(completedLoaded.status, 'completed');
    console.log('✅ [5/15] Session transitions to completed ONLY upon explicit FINISH_SESSION.');

    // ------------------------------------------------------------------------
    // 6. Missed days not marked completed; flexible sequence advances cleanly; plan versions immutable
    // ------------------------------------------------------------------------
    assert.equal(afterFinish.data.settings.sequencePointer, 1, 'Flexible pointer moved from 0 (Upper A) to 1 (Lower A)');
    assert.equal(afterFinish.data.sessions.length, 1, 'No missed days auto-marked completed or merged');

    // Save edited Plan Version v2 -> verify session 1 still references Plan v1!
    await api('/api/sync/push', {
      method: 'POST',
      body: JSON.stringify({
        mutations: [
          {
            mutationId: 'mut_plan_v2',
            type: 'SAVE_PLAN_VERSION',
            deviceId: 'dev_phone',
            payload: {
              scheduleMode: 'flexible',
              days: st1.data.activePlan.days,
              changeNote: 'Adjusted accessory sets'
            }
          }
        ]
      })
    }, aliceToken);
    const afterPlanEdit = await api('/api/state', {}, aliceToken);
    assert.equal(afterPlanEdit.data.activePlan.versionNumber, 2);
    assert.equal(afterPlanEdit.data.planVersions.length, 2);
    assert.equal(
      afterPlanEdit.data.sessions.find((s: any) => s.id === sess1Id).planVersionId,
      st1.data.activePlan.id,
      'Historical session preserved original planVersionId'
    );
    console.log('✅ [6/15] Flexible sequence pointer & immutable plan versioning verified.');

    // ------------------------------------------------------------------------
    // 7. Exercise Substitution keeps independent histories without mixing
    // ------------------------------------------------------------------------
    const sess2Id = '44444444-4444-4444-8444-444444444444';
    const subBlockId = '55555555-5555-4555-8555-555555555555';
    const subSetId = '66666666-6666-4666-8666-666666666666';

    await api('/api/sync/push', {
      method: 'POST',
      body: JSON.stringify({
        mutations: [
          {
            mutationId: 'mut_start_s2',
            type: 'START_SESSION',
            deviceId: 'dev_phone',
            payload: {
              session: {
                id: sess2Id,
                planVersionId: afterPlanEdit.data.activePlan.id,
                dayKey: 'sun',
                sequenceIndex: 1,
                name_ar: 'سفلي أ',
                name_en: 'Lower A',
                status: 'active',
                startedAt: Date.now() - 600000,
                accumulatedPauseMs: 0,
                exercises: [
                  {
                    id: subBlockId,
                    sessionId: sess2Id,
                    orderIndex: 0,
                    exerciseId: 'barbell_squat',
                    targetSets: 1,
                    targetReps: '5-8',
                    restSec: 180,
                    sets: [
                      {
                        id: subSetId,
                        sessionId: sess2Id,
                        sessionExerciseId: subBlockId,
                        exerciseId: 'barbell_squat',
                        setIndex: 0,
                        setType: 'working',
                        weightKg: null,
                        enteredUnit: 'kg',
                        reps: null,
                        rir: null,
                        done: false
                      }
                    ]
                  }
                ]
              }
            }
          },
          {
            mutationId: 'mut_sub_squat_to_legpress',
            type: 'SUBSTITUTE_EXERCISE',
            deviceId: 'dev_phone',
            payload: {
              sessionExerciseId: subBlockId,
              newExerciseId: 'leg_press',
              reason: 'equipment_busy',
              substitutedAt: Date.now() - 500000,
              restSec: 120,
              targetReps: '10-12'
            }
          },
          {
            mutationId: 'mut_log_legpress',
            type: 'UPSERT_SET',
            deviceId: 'dev_phone',
            payload: {
              baseVersion: 2,
              set: {
                id: subSetId,
                sessionId: sess2Id,
                sessionExerciseId: subBlockId,
                exerciseId: 'leg_press',
                setIndex: 0,
                setType: 'working',
                weightKg: 180,
                enteredUnit: 'kg',
                reps: 12,
                rir: 2,
                done: true,
                completedAt: Date.now() - 400000
              }
            }
          },
          {
            mutationId: 'mut_finish_s2',
            type: 'FINISH_SESSION',
            deviceId: 'dev_phone',
            payload: { sessionId: sess2Id, endedAt: Date.now() - 300000 }
          }
        ]
      })
    }, aliceToken);

    const stSub = await api('/api/state', {}, aliceToken);
    const s2 = stSub.data.sessions.find((s: any) => s.id === sess2Id);
    assert.equal(s2.exercises[0].exerciseId, 'leg_press');
    assert.equal(s2.exercises[0].substitutedFromExerciseId, 'barbell_squat');
    assert.equal(s2.exercises[0].sets[0].exerciseId, 'leg_press');
    const squatSetsInDb = db
      .prepare(`SELECT COUNT(*) AS c FROM workout_sets WHERE exercise_id = 'barbell_squat'`)
      .get() as any;
    assert.equal(squatSetsInDb.c, 0, 'Original barbell_squat history was NOT polluted by leg_press weights');
    console.log('✅ [7/15] Exercise substitution preserves relational link without mixing exercise histories.');

    // ------------------------------------------------------------------------
    // 8. Offline Sync Idempotency: Retrying identical queued batch creates ZERO duplicates
    // ------------------------------------------------------------------------
    const offlineBatch = [
      {
        mutationId: 'offline_retry_set_1',
        type: 'UPSERT_SET',
        deviceId: 'dev_phone',
        payload: {
          baseVersion: 3,
          set: {
            id: set1Id,
            sessionId: sess1Id,
            sessionExerciseId: block1Id,
            exerciseId: 'bench_press',
            setIndex: 1,
            setType: 'working',
            weightKg: 82.5,
            enteredUnit: 'kg',
            reps: 8,
            rir: 1.5,
            done: true,
            completedAt: Date.now()
          }
        }
      }
    ];

    const push1 = await api('/api/sync/push', {
      method: 'POST',
      body: JSON.stringify({ mutations: offlineBatch })
    }, aliceToken);
    const push2 = await api('/api/sync/push', {
      method: 'POST',
      body: JSON.stringify({ mutations: offlineBatch })
    }, aliceToken);
    const push3 = await api('/api/sync/push', {
      method: 'POST',
      body: JSON.stringify({ mutations: offlineBatch })
    }, aliceToken);

    assert.equal(push1.data.results[0].status, 'applied');
    assert.equal(push2.data.results[0].deduplicated, true);
    assert.equal(push3.data.results[0].deduplicated, true);
    const totalSessCount = (db.prepare(`SELECT COUNT(*) AS c FROM workout_sessions WHERE user_id = ?`).get(regA.data.user.id) as any).c;
    assert.equal(totalSessCount, 2, 'Zero duplicate sessions after 3 sync retries');
    console.log('✅ [8/15] Offline queue retries are 100% idempotent with zero duplicate sessions or sets.');

    // ------------------------------------------------------------------------
    // 9. Multi-device Set Conflict Detection, Resolution & Archived Recovery
    // ------------------------------------------------------------------------
    // Device B ('dev_tablet') was offline at baseVersion=1 and pushes conflicting weight (85kg x 6) to set1Id
    const conflictPush = await api('/api/sync/push', {
      method: 'POST',
      body: JSON.stringify({
        mutations: [
          {
            mutationId: 'mut_tablet_conflict',
            type: 'UPSERT_SET',
            deviceId: 'dev_tablet',
            payload: {
              baseVersion: 1, // Stale base version! Server is already ahead from dev_phone
              set: {
                id: set1Id,
                sessionId: sess1Id,
                sessionExerciseId: block1Id,
                exerciseId: 'bench_press',
                setIndex: 1,
                setType: 'working',
                weightKg: 85,
                enteredUnit: 'kg',
                reps: 6,
                rir: 0.5,
                done: true,
                completedAt: Date.now()
              }
            }
          }
        ]
      })
    }, aliceToken);

    assert.equal(conflictPush.data.results[0].status, 'conflict');
    const conflictId = conflictPush.data.results[0].conflictId;
    assert.ok(conflictId, 'Conflict ID created');
    assert.equal(conflictPush.data.state.conflicts.length, 1);
    assert.equal(conflictPush.data.state.conflicts[0].serverSnapshot.weightKg, 82.5);
    assert.equal(conflictPush.data.state.conflicts[0].clientSnapshot.weightKg, 85);

    // Resolve choosing 'client' (85kg) -> 82.5kg must be archived for recovery
    const resolveRes = await api(`/api/sync/conflicts/${conflictId}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ choose: 'client' })
    }, aliceToken);
    assert.equal(resolveRes.status, 200);
    const setAfterResolve = resolveRes.data.state.sessions
      .find((s: any) => s.id === sess1Id)
      .exercises[0].sets.find((x: any) => x.id === set1Id);
    assert.equal(setAfterResolve.weightKg, 85);
    assert.equal(resolveRes.data.state.conflicts[0].archivedOther.weightKg, 82.5);

    // Recover archived version (82.5kg)
    const recoverRes = await api(`/api/sync/conflicts/${conflictId}/restore-other`, {
      method: 'POST'
    }, aliceToken);
    assert.equal(recoverRes.status, 200);
    const setAfterRecover = recoverRes.data.state.sessions
      .find((s: any) => s.id === sess1Id)
      .exercises[0].sets.find((x: any) => x.id === set1Id);
    assert.equal(setAfterRecover.weightKg, 82.5, 'Archived unselected version successfully recovered');
    console.log('✅ [9/15] Multi-device set conflict detected, resolved, and unselected version recovered.');

    // ------------------------------------------------------------------------
    // 10 & 11. Legacy IRON SYSTEM (ironsys_v2) Preview, Deduplication, Isolated Archive & Safe Backup Restore
    // ------------------------------------------------------------------------
    const legacyJson = {
      version: 2,
      exportedAt: '2026-09-01T10:00:00.000Z',
      settings: { name: 'Alice Old', units: 'kg', defaultRest: 90 },
      favorites: ['bench_press', 'pull_up'],
      exerciseImages: {
        bench_press: 'https://unverified-random-site.example/bench.jpg'
      },
      sessions: [
        {
          id: 's_legacy_1',
          dayIdx: 6,
          name: 'Push A',
          focus: 'الصدر والأكتاف والترايسبس',
          startedAt: 1750000000000,
          endedAt: 1750003600000,
          exercises: [{ exerciseId: 'bench_press', sets: [{ weight: 75, reps: 8 }] }]
        },
        {
          id: 's_legacy_2',
          dayIdx: 0,
          name: 'Pull A',
          focus: 'الظهر والبايسبس',
          startedAt: 1750100000000,
          endedAt: 1750103600000,
          exercises: [{ exerciseId: 'lat_pulldown', sets: [{ weight: 60, reps: 10 }] }]
        }
      ]
    };

    const legPrev = await api('/api/legacy/preview', {
      method: 'POST',
      body: JSON.stringify({ data: legacyJson })
    }, aliceToken);
    assert.equal(legPrev.status, 200);
    assert.equal(legPrev.data.preview.newSessionsToArchive, 2);
    assert.equal(legPrev.data.preview.unverifiedDraftImagesCount, 1);

    const legImp1 = await api('/api/legacy/import', {
      method: 'POST',
      body: JSON.stringify({ data: legacyJson, confirm: true })
    }, aliceToken);
    assert.equal(legImp1.status, 200);
    assert.equal(legImp1.data.importedCount, 2);
    assert.ok(legImp1.data.preImportBackup.id, 'Pre-import safety snapshot created');
    assert.equal(legImp1.data.state.legacyArchive.length, 2);
    assert.equal(legImp1.data.state.sessions.length, 2, 'Legacy PPL sessions MUST NOT mix into VOXA active sessions');

    // Re-importing the exact same legacy file -> 0 duplicates created!
    const legImp2 = await api('/api/legacy/import', {
      method: 'POST',
      body: JSON.stringify({ data: legacyJson, confirm: true })
    }, aliceToken);
    assert.equal(legImp2.data.importedCount, 0);
    assert.equal(legImp2.data.skippedDuplicates, 2);

    // Full Backup Export + Checksum Tamper Protection + Valid Restore
    const fullExport = await api('/api/account/export', {}, aliceToken);
    assert.equal(fullExport.status, 200);
    assert.equal(fullExport.data.schema, 'voxa_backup_v1');

    // Tampered backup must fail WITHOUT corrupting existing data
    const tampered = { ...fullExport.data, sessions: [] };
    const badRestore = await api('/api/backups/restore', {
      method: 'POST',
      body: JSON.stringify({ backup: tampered, confirm: true })
    }, aliceToken);
    assert.equal(badRestore.status, 400);
    const checkIntact = await api('/api/state', {}, aliceToken);
    assert.equal(checkIntact.data.sessions.length, 2, 'Current data completely unharmed after failed restore');

    // Valid restore succeeds and creates auto_pre_restore snapshot
    const goodRestore = await api('/api/backups/restore', {
      method: 'POST',
      body: JSON.stringify({ backup: fullExport.data, confirm: true })
    }, aliceToken);
    assert.equal(goodRestore.status, 200);
    assert.ok(goodRestore.data.preRestoreBackup.id);
    console.log('✅ [10 & 11/15] Legacy ironsys_v2 archive isolation, deduplication, export & safe restore verified.');

    // ------------------------------------------------------------------------
    // 12. Strict Per-User Isolation & Unauthorized Owner Blocking
    // ------------------------------------------------------------------------
    const regBob = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: 'bob@voxa.test', password: 'BobPassword123!' })
    });
    const bobToken = regBob.data.token;

    // Bob tries to read Alice's session directly by ID
    const crossRead = await api(`/api/sessions/${sess1Id}`, {}, bobToken);
    assert.equal(crossRead.status, 403, 'Bob blocked from reading Alice session');

    // Bob tries direct admin calls
    const bobAdminAttempt = await api('/api/admin/overview', {}, bobToken);
    assert.equal(bobAdminAttempt.status, 403, 'Normal user blocked from Owner overview');
    const bobExAttempt = await api('/api/admin/exercises', {
      method: 'POST',
      body: JSON.stringify({ exercise: { id: 'hack_ex', ar: 'تجربة', en: 'Hack', primary: 'pec_major' } })
    }, bobToken);
    assert.equal(bobExAttempt.status, 403, 'Normal user blocked from creating global exercises');

    const wrongSecretClaim = await api('/api/admin/claim-owner', {
      method: 'POST',
      body: JSON.stringify({ ownerSecret: 'wrong-secret' })
    }, bobToken);
    assert.equal(wrongSecretClaim.status, 403);
    console.log('✅ [12/15] Cross-account access & unauthorized admin API calls strictly blocked (403).');

    // ------------------------------------------------------------------------
    // 13. Published Images Require Verified Source & License; Unverified Remain Draft
    // ------------------------------------------------------------------------
    const pubCatCheck = await api('/api/public/catalog');
    const leakedUnverified = pubCatCheck.data.publishedImages.find((img: any) =>
      img.imageUrl.includes('unverified-random-site')
    );
    assert.equal(leakedUnverified, undefined, 'Unverified legacy image MUST NOT be auto-published');

    // Authorize Alice as single Owner via server secret
    const claimAlice = await api('/api/admin/claim-owner', {
      method: 'POST',
      body: JSON.stringify({ ownerSecret: 'test-owner-secret-999' })
    }, aliceToken);
    assert.equal(claimAlice.status, 200);

    // Second user Bob cannot claim owner once single owner exists!
    const bobClaimAfter = await api('/api/admin/claim-owner', {
      method: 'POST',
      body: JSON.stringify({ ownerSecret: 'test-owner-secret-999' })
    }, bobToken);
    assert.equal(bobClaimAfter.status, 409, 'Single owner constraint enforced');

    // Owner tries publishing image WITHOUT license -> rejected 400!
    const noLicensePub = await api('/api/admin/images', {
      method: 'POST',
      body: JSON.stringify({
        exerciseId: 'bench_press',
        imageUrl: 'https://example.org/bench-diagram.png',
        sourceName: 'Example Anatomy',
        sourceUrl: 'https://example.org/bench',
        license: '', // Missing license!
        status: 'published'
      })
    }, aliceToken);
    assert.equal(noLicensePub.status, 400, 'Cannot publish image without license');

    // Owner publishes image WITH complete provenance -> succeeds & logs audit entry
    const validPub = await api('/api/admin/images', {
      method: 'POST',
      body: JSON.stringify({
        exerciseId: 'bench_press',
        imageUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Bench-press-1.png',
        sourceName: 'Wikimedia Commons — Everkinetic',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Bench-press-1.png',
        license: 'CC-BY-SA-3.0',
        status: 'published'
      })
    }, aliceToken);
    assert.equal(validPub.status, 200);

    const adminOv = await api('/api/admin/overview', {}, aliceToken);
    assert.ok(adminOv.data.auditLogs.length >= 2, 'Admin actions recorded in audit log');
    console.log('✅ [13/15] Image provenance & license enforcement + Owner audit trail verified.');

    // ------------------------------------------------------------------------
    // 14. Canonical Units & Conservative Progression Engine Verification
    // ------------------------------------------------------------------------
    const kgCanonical = toCanonicalKg('100', 'kg');
    assert.equal(kgCanonical, 100);
    const lbDisplay = fromCanonicalKgNum(kgCanonical, 'lb');
    assert.equal(lbDisplay, 220.5);
    const cmCanonical = toCanonicalCm('32', 'in');
    assert.equal(cmCanonical, 81.28);
    assert.equal(fromCanonicalCm(cmCanonical, 'in'), '32');

    // Insufficient data check (< 2 sessions)
    const benchMeta = EXERCISES_MAP['bench_press'];
    const recInsufficient = evaluateProgression(benchMeta, '6-8', [completedLoaded], 'kg');
    assert.equal(recInsufficient.status, 'insufficient_data');

    // 2 completed sessions hitting max target reps (8) with good RIR -> conservative +2.5kg
    const mockSecondBench = {
      ...completedLoaded,
      id: 'sess_second_bench',
      endedAt: Date.now(),
      exercises: [
        {
          ...completedLoaded.exercises[0],
          sets: [
            { ...completedLoaded.exercises[0].sets[1], weightKg: 80, reps: 8, rir: 2, done: true },
            { ...completedLoaded.exercises[0].sets[1], id: 'set_b2', weightKg: 80, reps: 8, rir: 1.5, done: true }
          ]
        }
      ]
    };
    const recReady = evaluateProgression(benchMeta, '6-8', [completedLoaded, mockSecondBench], 'kg');
    assert.equal(recReady.status, 'increase_weight');
    assert.equal(recReady.suggestedWeightKg, 82.5);
    assert.equal(recReady.basis, 'reps_and_rir');
    console.log('✅ [14/15] Canonical unit conversion & conservative progression engine verified.');

    // ------------------------------------------------------------------------
    // 15. Account Deletion Confirmation & Complete Cloud Cascade Cleanup
    // ------------------------------------------------------------------------
    const delWithoutConfirm = await api('/api/account', {
      method: 'DELETE',
      body: JSON.stringify({ confirmText: 'no' })
    }, bobToken);
    assert.equal(delWithoutConfirm.status, 400);

    const delBob = await api('/api/account', {
      method: 'DELETE',
      body: JSON.stringify({ confirmText: 'DELETE' })
    }, bobToken);
    assert.equal(delBob.status, 200);
    assert.equal(delBob.data.deletedCloudData, true);
    assert.ok(delBob.data.localDownloadsNotice.includes('local'));

    const bobMeAfter = await api('/api/auth/me', {}, bobToken);
    assert.equal(bobMeAfter.status, 401);
    console.log('✅ [15/15] Account deletion confirmation, notice & cloud cascade cleanup verified.');

    console.log('\n🎉 ALL 15 ACCEPTANCE TESTS PASSED SUCCESSFULLY!');
  } finally {
    server.close();
    db.close();
  }
}

runAcceptanceSuite().catch((err) => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
