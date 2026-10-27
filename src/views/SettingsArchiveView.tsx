import React, { useEffect, useState } from 'react';
import {
  Download,
  Upload,
  Cloud,
  Archive,
  Shield,
  LogOut,
  Trash2,
  Bell,
  CheckCircle
} from 'lucide-react';
import type {
  CloudBackupSummary,
  ExerciseData,
  Lang,
  LegacyArchiveRecord,
  UserProfile,
  UserSettings,
  WorkoutSessionRecord
} from '../types';
import { TRANSLATIONS } from '../i18n/translations';
import { SEED_MUSCLES } from '../data/seedMuscles';
import { fromCanonicalKgNum } from '../utils/units';

interface Props {
  lang: Lang;
  user: UserProfile;
  authToken: string | null;
  sandboxVerifyToken?: string;
  settings: UserSettings;
  sessions: WorkoutSessionRecord[];
  legacyArchive: LegacyArchiveRecord[];
  cloudBackups: CloudBackupSummary[];
  exercises: ExerciseData[];
  exercisesMap: Record<string, ExerciseData>;
  onUpdateSettings: (patch: Partial<UserSettings>) => void;
  onRefreshState: () => Promise<void>;
  onSignOut: () => void;
  onAccountDeleted: () => void;
  onToast: (msg: string) => void;
}

export const SettingsArchiveView: React.FC<Props> = ({
  lang,
  user,
  authToken,
  sandboxVerifyToken,
  settings,
  sessions,
  legacyArchive,
  cloudBackups,
  exercises,
  exercisesMap,
  onUpdateSettings,
  onRefreshState,
  onSignOut,
  onAccountDeleted,
  onToast
}) => {
  const t = TRANSLATIONS[lang];
  const [verifyInput, setVerifyInput] = useState(sandboxVerifyToken || '');
  const [notifPerm, setNotifPerm] = useState<string>(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );

  // Legacy import preview modal state
  const [legacyPreview, setLegacyPreview] = useState<{ raw: any; summary: any } | null>(null);
  // Restore preview modal state
  const [restorePreview, setRestorePreview] = useState<{ raw: any; summary: any } | null>(null);
  // Account deletion state
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  // Owner Studio state
  const [ownerSecretInput, setOwnerSecretInput] = useState('');
  const [adminOverview, setAdminOverview] = useState<any | null>(null);
  const [newExId, setNewExId] = useState('');
  const [newExAr, setNewExAr] = useState('');
  const [newExEn, setNewExEn] = useState('');
  const [newExPrimary, setNewExPrimary] = useState('pec_major');
  const [newExEquip, setNewExEquip] = useState<'bar' | 'dumbbell' | 'cable' | 'machine' | 'bodyweight'>('dumbbell');

  const [imgExId, setImgExId] = useState(exercises[0]?.id || 'bench_press');
  const [imgUrl, setImgUrl] = useState('');
  const [imgSourceName, setImgSourceName] = useState('');
  const [imgSourceUrl, setImgSourceUrl] = useState('');
  const [imgLicense, setImgLicense] = useState('');
  const [imgStatus, setImgStatus] = useState<'draft' | 'pending_review' | 'published' | 'rejected'>('draft');
  const [adminMsg, setAdminMsg] = useState<string | null>(null);

  const authHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
  };

  useEffect(() => {
    if (user.role === 'owner') {
      loadAdminOverview();
    }
  }, [user.role]);

  async function loadAdminOverview() {
    try {
      const res = await fetch('/api/admin/overview', { headers: authHeaders });
      if (res.ok) {
        setAdminOverview(await res.json());
      }
    } catch {}
  }

  async function requestNotificationPermission() {
    if (typeof Notification === 'undefined') {
      setNotifPerm('unsupported');
      return;
    }
    try {
      const res = await Notification.requestPermission();
      setNotifPerm(res);
    } catch {
      setNotifPerm('denied');
    }
  }

  async function handleVerifyEmail() {
    if (!verifyInput.trim()) return;
    const res = await fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ token: verifyInput.trim() })
    });
    if (res.ok) {
      onToast(lang === 'ar' ? 'تم تأكيد البريد الإلكتروني بنجاح' : 'Email verified successfully');
      await onRefreshState();
    } else {
      onToast(lang === 'ar' ? 'رمز التأكيد غير صالح' : 'Invalid verification token');
    }
  }

  async function handleCreateCloudSnapshot() {
    const res = await fetch('/api/backups/create', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({})
    });
    if (res.ok) {
      onToast(lang === 'ar' ? 'تم حفظ لقطة احتياطية سحابية جديدة' : 'Cloud snapshot created');
      await onRefreshState();
    }
  }

  async function handleExportFullJson() {
    const res = await fetch('/api/account/export', { headers: authHeaders });
    if (!res.ok) return;
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `voxa-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onToast(lang === 'ar' ? 'تم تصدير ملف النسخة الكاملة JSON' : 'Full JSON backup exported');
  }

  function handleExportCsv() {
    const rows = [
      ['Date', 'Session', 'Exercise_AR', 'Exercise_EN', 'Set_Number', 'Set_Type', `Weight_${settings.weightUnit}`, 'Reps', 'RIR']
    ];
    for (const s of sessions.filter((x) => x.status === 'completed')) {
      const dStr = new Date(s.endedAt || s.startedAt).toISOString().slice(0, 10);
      for (const eb of s.exercises) {
        const ex = exercisesMap[eb.exerciseId];
        eb.sets
          .filter((st) => st.done)
          .forEach((st, idx) => {
            rows.push([
              dStr,
              lang === 'ar' ? s.name_ar : s.name_en,
              ex?.ar || eb.exerciseId,
              ex?.en || eb.exerciseId,
              String(idx + 1),
              st.setType,
              String(fromCanonicalKgNum(st.weightKg, settings.weightUnit)),
              String(st.reps ?? ''),
              String(st.rir ?? '')
            ]);
          });
      }
    }
    const csv = '\uFEFF' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `voxa-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onToast(lang === 'ar' ? 'تم تصدير السجلات بصيغة CSV' : 'CSV logs exported');
  }

  async function handleSelectRestoreFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await fetch('/api/backups/preview-restore', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ backup: parsed })
      });
      const out = await res.json();
      if (!res.ok || !out.valid) {
        throw new Error(out.error || 'Invalid VOXA backup file');
      }
      setRestorePreview({ raw: parsed, summary: out.summary });
    } catch (err: any) {
      alert((lang === 'ar' ? 'فشل التحقق من ملف النسخة: ' : 'Backup validation failed: ') + err.message);
    }
  }

  async function confirmRestoreBackup() {
    if (!restorePreview) return;
    const res = await fetch('/api/backups/restore', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ backup: restorePreview.raw, confirm: true })
    });
    if (res.ok) {
      setRestorePreview(null);
      await onRefreshState();
      onToast(
        lang === 'ar'
          ? 'تم حفظ لقطة أمان للحالة السابقة واستعادة النسخة بنجاح'
          : 'Pre-restore snapshot saved and backup restored successfully'
      );
    } else {
      const err = await res.json();
      alert(err.error || 'Restore failed');
    }
  }

  async function handleSelectLegacyFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await fetch('/api/legacy/preview', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ data: parsed })
      });
      const out = await res.json();
      if (!res.ok || !out.valid) {
        throw new Error(out.error || 'Invalid legacy JSON');
      }
      setLegacyPreview({ raw: parsed, summary: out.preview });
    } catch (err: any) {
      alert((lang === 'ar' ? 'ملف قديم غير صالح: ' : 'Invalid legacy JSON: ') + err.message);
    }
  }

  async function confirmLegacyImport() {
    if (!legacyPreview) return;
    const res = await fetch('/api/legacy/import', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ data: legacyPreview.raw, confirm: true, mergeFavorites: true })
    });
    const out = await res.json();
    if (res.ok) {
      setLegacyPreview(null);
      await onRefreshState();
      onToast(
        lang === 'ar'
          ? `تمت أرشفة ${out.importedCount} جلسة وتجاهل ${out.skippedDuplicates} مكررة`
          : `Archived ${out.importedCount} legacy sessions (${out.skippedDuplicates} duplicates skipped)`
      );
    } else {
      alert(out.error || 'Import failed');
    }
  }

  function exportLegacyArchiveJson() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            exportedFrom: 'VOXA Legacy Archive',
            exportedAt: new Date().toISOString(),
            records: legacyArchive
          },
          null,
          2
        )
      ],
      { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `voxa-legacy-archive-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleConfirmDeleteAccount() {
    const res = await fetch('/api/account', {
      method: 'DELETE',
      headers: authHeaders,
      body: JSON.stringify({ confirmText: deleteConfirmText })
    });
    if (res.ok) {
      setDeleteModalOpen(false);
      onAccountDeleted();
    } else {
      const err = await res.json();
      alert(err.message || 'Deletion failed');
    }
  }

  async function handleClaimOwner() {
    setAdminMsg(null);
    const res = await fetch('/api/admin/claim-owner', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ ownerSecret: ownerSecretInput })
    });
    const out = await res.json();
    if (res.ok) {
      setOwnerSecretInput('');
      await onRefreshState();
      await loadAdminOverview();
      onToast(lang === 'ar' ? 'تم تفعيل صلاحية المالك المخوّل' : 'Owner role verified on server');
    } else {
      setAdminMsg(out.message || out.error);
    }
  }

  async function handleSaveAdminExercise(e: React.FormEvent) {
    e.preventDefault();
    setAdminMsg(null);
    const exPayload: ExerciseData = {
      id: newExId,
      ar: newExAr,
      en: newExEn,
      desc_ar: newExAr,
      desc_en: newExEn,
      primary: newExPrimary,
      secondary: [],
      equip: newExEquip,
      pattern: 'push',
      diff: 'intermediate',
      diff_basis_ar: 'مضاف عبر لوحة المالك',
      diff_basis_en: 'Added via Owner Studio',
      sets: 3,
      reps: '8-12',
      rest: 90,
      steps_ar: [],
      steps_en: [],
      cues_ar: [],
      cues_en: [],
      breath_ar: 'شهيق نزولًا وزفير صعودًا',
      breath_en: 'Inhale eccentric, exhale concentric',
      mistakes_ar: [],
      mistakes_en: [],
      safety_ar: 'تحكم كامل بالمدى الحركي',
      safety_en: 'Maintain controlled range of motion',
      alts: []
    };
    const res = await fetch('/api/admin/exercises', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ exercise: exPayload, published: true })
    });
    const out = await res.json();
    if (res.ok) {
      setNewExId('');
      setNewExAr('');
      setNewExEn('');
      setAdminMsg(lang === 'ar' ? 'تم حفظ ونشر التمرين بنجاح' : 'Exercise saved & published');
      await onRefreshState();
      await loadAdminOverview();
    } else {
      setAdminMsg(out.message || out.error);
    }
  }

  async function handleSaveAdminImage(e: React.FormEvent) {
    e.preventDefault();
    setAdminMsg(null);
    const res = await fetch('/api/admin/images', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        exerciseId: imgExId,
        imageUrl: imgUrl,
        sourceName: imgSourceName,
        sourceUrl: imgSourceUrl,
        license: imgLicense,
        status: imgStatus
      })
    });
    const out = await res.json();
    if (res.ok) {
      setImgUrl('');
      setAdminMsg(lang === 'ar' ? `تم حفظ حالة الصورة (${out.status})` : `Image saved (${out.status})`);
      await onRefreshState();
      await loadAdminOverview();
    } else {
      setAdminMsg(out.message || out.error);
    }
  }

  return (
    <div>
      <div className="page-head">
        <h1>{t.settings.title}</h1>
      </div>

      {/* 1. General Preferences */}
      <div className="card">
        <h3 style={{ fontSize: 15.5, fontWeight: 800, marginBottom: 12 }}>{t.settings.generalPrefs}</h3>

        <div className="grid grid-2 grid-2-sm-1">
          <div className="field">
            <label>{t.settings.language}</label>
            <select
              value={settings.language}
              onChange={(e) => onUpdateSettings({ language: e.target.value as Lang })}
            >
              <option value="ar">العربية (RTL — افتراضي)</option>
              <option value="en">English (LTR)</option>
            </select>
          </div>

          <div className="field">
            <label>{t.settings.defaultRest}</label>
            <input
              type="number"
              min={15}
              max={600}
              step={15}
              dir="ltr"
              value={settings.defaultRestSec}
              onChange={(e) =>
                onUpdateSettings({ defaultRestSec: Math.max(15, parseInt(e.target.value, 10) || 90) })
              }
            />
          </div>

          <div className="field">
            <label>{t.settings.weightUnit}</label>
            <select
              value={settings.weightUnit}
              onChange={(e) => onUpdateSettings({ weightUnit: e.target.value as 'kg' | 'lb' })}
            >
              <option value="kg">kg (كغ — افتراضي)</option>
              <option value="lb">lb (باوند — تحويل تلقائي دون خلط)</option>
            </select>
          </div>

          <div className="field">
            <label>{t.settings.lengthUnit}</label>
            <select
              value={settings.lengthUnit}
              onChange={(e) => onUpdateSettings({ lengthUnit: e.target.value as 'cm' | 'in' })}
            >
              <option value="cm">cm (سم — افتراضي)</option>
              <option value="in">in (إنش)</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 10, marginTop: 6 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13.5 }}>
            <input
              type="checkbox"
              style={{ width: 18, height: 18 }}
              checked={settings.autoStartRest}
              onChange={(e) => onUpdateSettings({ autoStartRest: e.target.checked })}
            />
            <span>{t.settings.autoStartRest}</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13.5 }}>
            <input
              type="checkbox"
              style={{ width: 18, height: 18 }}
              checked={settings.hideWarmupInVolume}
              onChange={(e) => onUpdateSettings({ hideWarmupInVolume: e.target.checked })}
            />
            <span>{t.settings.hideWarmupVolume}</span>
          </label>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13.5 }}>
              <input
                type="checkbox"
                style={{ width: 18, height: 18 }}
                checked={settings.reminderEnabled}
                onChange={(e) => onUpdateSettings({ reminderEnabled: e.target.checked })}
              />
              <span>{t.settings.reminders}</span>
            </label>
            {settings.reminderEnabled && (
              <input
                type="time"
                dir="ltr"
                style={{ width: 'auto', padding: '5px 8px' }}
                value={settings.reminderTime}
                onChange={(e) => onUpdateSettings({ reminderTime: e.target.value })}
              />
            )}
          </div>
        </div>

        <div className="notice-box" style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span>
            <Bell size={14} style={{ verticalAlign: 'middle', marginInlineEnd: 6 }} />
            {notifPerm === 'granted'
              ? lang === 'ar'
                ? 'إشعارات المتصفح مفعّلة عند انتهاء المؤقت (ضمن حدود المتصفح في الخلفية).'
                : 'Browser notifications enabled (subject to OS/browser background limits).'
              : t.timer.notifDeniedNote}
          </span>
          {notifPerm !== 'granted' && notifPerm !== 'unsupported' && (
            <button className="btn btn-ghost btn-sm" onClick={requestNotificationPermission}>
              {lang === 'ar' ? 'تفعيل الإشعارات الاختيارية' : 'Enable Optional Alerts'}
            </button>
          )}
        </div>
      </div>

      {/* 2. Versioned Cloud Snapshots & Local Backups */}
      <div className="card">
        <h3 style={{ fontSize: 15.5, fontWeight: 800, marginBottom: 8 }}>{t.settings.backupsSection}</h3>
        <div className="notice-box notice-gold" style={{ marginBottom: 12 }}>
          {t.settings.backupHonestNote}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          <button className="btn btn-gold btn-sm" onClick={handleCreateCloudSnapshot}>
            <Cloud size={14} />
            <span>{t.settings.createCloudSnapshot}</span>
          </button>
          <button className="btn btn-ghost btn-sm" onClick={handleExportFullJson}>
            <Download size={14} />
            <span>{t.settings.exportFullJson}</span>
          </button>
          <button className="btn btn-ghost btn-sm" onClick={handleExportCsv}>
            <Download size={14} />
            <span>{t.settings.exportLogsCsv}</span>
          </button>
          <label className="btn btn-outline-gold btn-sm" style={{ cursor: 'pointer' }}>
            <Upload size={14} />
            <span>{t.settings.restoreFromJson}</span>
            <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleSelectRestoreFile} />
          </label>
        </div>

        {cloudBackups.length > 0 && (
          <div style={{ display: 'grid', gap: 6 }}>
            {cloudBackups.slice(0, 6).map((b) => (
              <div
                key={b.id}
                style={{
                  padding: '8px 12px',
                  borderRadius: 9,
                  background: 'var(--panel-2)',
                  border: '1px solid var(--line)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                  fontSize: 12.5
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{b.label}</div>
                  <div className="num" style={{ color: 'var(--muted)', fontSize: 11 }}>
                    {new Date(b.createdAt).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US')} •{' '}
                    {b.summary.sessionsCount} sessions • SHA256: {b.checksumSha256.slice(0, 10)}…
                  </div>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={async () => {
                    const res = await fetch(`/api/backups/${b.id}/download`, { headers: authHeaders });
                    if (res.ok) {
                      const parsed = await res.json();
                      setRestorePreview({ raw: parsed, summary: b.summary });
                    }
                  }}
                >
                  {lang === 'ar' ? 'معاينة واسترجاع' : 'Preview & Restore'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Isolated Read-Only Legacy Archive (IRON SYSTEM) */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <h3 style={{ fontSize: 15.5, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Archive size={17} color="var(--gold)" />
            <span>{t.settings.legacySection}</span>
          </h3>
          <span className="badge badge-warn">{t.settings.readOnlyTag}</span>
        </div>

        <div className="notice-box" style={{ marginBottom: 12 }}>
          {t.settings.legacyOriginNote}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <label className="btn btn-outline-gold btn-sm" style={{ cursor: 'pointer' }}>
            <Upload size={14} />
            <span>{t.settings.uploadLegacyJson}</span>
            <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleSelectLegacyFile} />
          </label>
          {legacyArchive.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={exportLegacyArchiveJson}>
              <Download size={14} />
              <span>{t.settings.exportLegacyJson}</span>
            </button>
          )}
        </div>

        {legacyArchive.length > 0 && (
          <div style={{ display: 'grid', gap: 8 }}>
            {legacyArchive.map((item) => (
              <details
                key={item.id}
                style={{
                  background: 'var(--panel-2)',
                  border: '1px solid var(--line)',
                  borderRadius: 10,
                  padding: '10px 12px'
                }}
              >
                <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 13.5 }}>
                  {item.sessionName}{' '}
                  <span style={{ fontWeight: 400, fontSize: 11.5, color: 'var(--muted)' }}>
                    — {item.sourceSystem} •{' '}
                    {lang === 'ar' ? 'استُورد في ' : 'Imported '}
                    {new Date(item.importedAt).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')}
                  </span>
                </summary>
                <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--muted)', display: 'grid', gap: 4 }}>
                  {(item.rawPayload?.exercises || []).map((ex: any, i: number) => (
                    <div key={i}>
                      <strong style={{ color: 'var(--text)' }}>
                        {exercisesMap[ex.exerciseId]?.ar || ex.exerciseId}:
                      </strong>{' '}
                      <span className="num">
                        {(ex.sets || [])
                          .map((st: any) => `${st.weight}${item.rawPayload?.legacyUnits || 'kg'}×${st.reps}`)
                          .join(' • ')}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </div>

      {/* 4. Owner Studio (Admin Console) */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ fontSize: 15.5, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Shield size={17} color="var(--gold)" />
            <span>{t.owner.title}</span>
          </h3>
          <span className={`badge ${user.role === 'owner' ? 'badge-gold' : ''}`}>
            {user.role === 'owner' ? 'OWNER' : 'USER'}
          </span>
        </div>

        {adminMsg && (
          <div className="notice-box notice-gold" style={{ marginBottom: 12 }}>
            {adminMsg}
          </div>
        )}

        {user.role !== 'owner' ? (
          <details>
            <summary style={{ fontSize: 12.5, color: 'var(--muted)', cursor: 'pointer' }}>
              {t.owner.claimOwnerTitle}
            </summary>
            <div style={{ marginTop: 10 }}>
              <p style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 8 }}>
                {t.owner.claimOwnerDesc}
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="password"
                  dir="ltr"
                  placeholder="VOXA_OWNER_SECRET"
                  value={ownerSecretInput}
                  onChange={(e) => setOwnerSecretInput(e.target.value)}
                />
                <button className="btn btn-outline-gold btn-sm" onClick={handleClaimOwner}>
                  {lang === 'ar' ? 'تحقق' : 'Verify'}
                </button>
              </div>
            </div>
          </details>
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>{t.owner.subtitle}</p>

            {/* Add / Edit Exercise */}
            <form onSubmit={handleSaveAdminExercise} style={{ background: 'var(--panel-2)', padding: 12, borderRadius: 11 }}>
              <h4 style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 8 }}>{t.owner.addExercise}</h4>
              <div className="grid grid-2 grid-2-sm-1">
                <input
                  placeholder="exercise_id (e.g. pendlay_row)"
                  dir="ltr"
                  value={newExId}
                  onChange={(e) => setNewExId(e.target.value)}
                  required
                />
                <select value={newExPrimary} onChange={(e) => setNewExPrimary(e.target.value)}>
                  {SEED_MUSCLES.map((m) => (
                    <option key={m.id} value={m.id}>
                      {lang === 'ar' ? m.ar : m.en}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="الاسم بالعربية"
                  value={newExAr}
                  onChange={(e) => setNewExAr(e.target.value)}
                  required
                />
                <input
                  placeholder="English Name"
                  dir="ltr"
                  value={newExEn}
                  onChange={(e) => setNewExEn(e.target.value)}
                  required
                />
                <select value={newExEquip} onChange={(e) => setNewExEquip(e.target.value as any)}>
                  <option value="bar">Barbell</option>
                  <option value="dumbbell">Dumbbell</option>
                  <option value="cable">Cable</option>
                  <option value="machine">Machine</option>
                  <option value="bodyweight">Bodyweight</option>
                </select>
                <button type="submit" className="btn btn-gold btn-sm">
                  {lang === 'ar' ? 'حفظ ونشر التمرين' : 'Save & Publish'}
                </button>
              </div>
            </form>

            {/* Image Provenance & Moderation */}
            <form onSubmit={handleSaveAdminImage} style={{ background: 'var(--panel-2)', padding: 12, borderRadius: 11 }}>
              <h4 style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}>{t.owner.mediaModeration}</h4>
              <p style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 8 }}>
                {t.owner.publishRequiresLicense}
              </p>
              <div className="grid grid-2 grid-2-sm-1">
                <select value={imgExId} onChange={(e) => setImgExId(e.target.value)}>
                  {exercises.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {lang === 'ar' ? ex.ar : ex.en}
                    </option>
                  ))}
                </select>
                <select value={imgStatus} onChange={(e) => setImgStatus(e.target.value as any)}>
                  <option value="draft">Draft (مسودة غير منشورة)</option>
                  <option value="pending_review">Pending Review (قيد المراجعة)</option>
                  <option value="published">Published (منشورة — تتطلب مصدر وترخيص)</option>
                  <option value="rejected">Rejected (مرفوضة)</option>
                </select>
                <input
                  placeholder="Image URL (https://...)"
                  dir="ltr"
                  value={imgUrl}
                  onChange={(e) => setImgUrl(e.target.value)}
                  required
                />
                <input
                  placeholder="Source Name (اسم المصدر)"
                  value={imgSourceName}
                  onChange={(e) => setImgSourceName(e.target.value)}
                />
                <input
                  placeholder="Source URL (رابط المصدر)"
                  dir="ltr"
                  value={imgSourceUrl}
                  onChange={(e) => setImgSourceUrl(e.target.value)}
                />
                <input
                  placeholder="License (e.g. CC-BY-SA 4.0 / Commercial License)"
                  dir="ltr"
                  value={imgLicense}
                  onChange={(e) => setImgLicense(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-outline-gold btn-sm" style={{ marginTop: 8 }}>
                {lang === 'ar' ? 'حفظ بيانات الصورة وحالتها' : 'Save Image & Moderation Status'}
              </button>
            </form>

            {/* Admin Audit Logs */}
            {adminOverview?.auditLogs?.length > 0 && (
              <div>
                <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{t.owner.auditLogs}</h4>
                <div style={{ maxHeight: 160, overflowY: 'auto', display: 'grid', gap: 4, fontSize: 11.5 }}>
                  {adminOverview.auditLogs.slice(0, 12).map((log: any) => (
                    <div
                      key={log.id}
                      style={{
                        padding: '6px 8px',
                        borderRadius: 7,
                        background: 'var(--panel-2)',
                        display: 'flex',
                        justifyContent: 'space-between'
                      }}
                    >
                      <span>
                        <strong>{log.action}</strong> → {log.targetId} ({log.actorEmail})
                      </span>
                      <span className="num" style={{ color: 'var(--muted)' }}>
                        {new Date(log.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. Account & Security Management */}
      <div className="card">
        <h3 style={{ fontSize: 15.5, fontWeight: 800, marginBottom: 10 }}>{t.settings.accountSection}</h3>

        <div style={{ fontSize: 13.5, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span className="num">{user.email}</span>
          <span className={`badge ${user.emailVerified ? 'badge-ok' : 'badge-warn'}`}>
            {user.emailVerified ? (
              <>
                <CheckCircle size={12} /> {lang === 'ar' ? 'بريد مؤكد' : 'Email Verified'}
              </>
            ) : lang === 'ar' ? (
              'بانتظار تأكيد البريد'
            ) : (
              'Unverified Email'
            )}
          </span>
        </div>

        {!user.emailVerified && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              dir="ltr"
              placeholder={lang === 'ar' ? 'رمز تأكيد البريد الإلكتروني' : 'Email verification token'}
              value={verifyInput}
              onChange={(e) => setVerifyInput(e.target.value)}
            />
            <button className="btn btn-outline-gold btn-sm" onClick={handleVerifyEmail}>
              {lang === 'ar' ? 'تأكيد' : 'Verify'}
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={onSignOut}>
            <LogOut size={15} />
            <span>{t.settings.signOut}</span>
          </button>
          <button className="btn btn-danger" onClick={() => setDeleteModalOpen(true)}>
            <Trash2 size={15} />
            <span>{t.settings.deleteAccountTitle}</span>
          </button>
        </div>
      </div>

      {/* Legacy Import Preview & Confirmation Modal */}
      {legacyPreview && (
        <div className="modal-backdrop" onClick={() => setLegacyPreview(null)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
              {lang === 'ar' ? 'معاينة استيراد بيانات IRON SYSTEM للأرشيف' : 'Preview Legacy IRON SYSTEM Import'}
            </h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
              {lang === 'ar'
                ? 'سيتم حفظ نسخة احتياطية تلقائية من بيانات VOXA الحالية قبل الاستيراد، وستوضع الجلسات القديمة في الأرشيف المستقل (للقراءة فقط) دون خلطها بالخطة الجديدة.'
                : 'An automatic VOXA safety snapshot will be saved first. Legacy sessions will be placed strictly inside the isolated read-only Legacy Archive.'}
            </p>
            <div className="notice-box notice-gold" style={{ marginBottom: 14, display: 'grid', gap: 4 }}>
              <div>
                {lang === 'ar' ? 'إجمالي الجلسات في الملف: ' : 'Total sessions in file: '}
                <strong className="num">{legacyPreview.summary.totalSessionsInFile}</strong>
              </div>
              <div>
                {lang === 'ar' ? 'جلسات جديدة ستُؤرشف: ' : 'New sessions to archive: '}
                <strong className="num">{legacyPreview.summary.newSessionsToArchive}</strong>
              </div>
              <div>
                {lang === 'ar' ? 'جلسات مكررة سيتم تجاهلها: ' : 'Duplicate sessions skipped: '}
                <strong className="num">{legacyPreview.summary.duplicateSessionsSkipped}</strong>
              </div>
              <div>
                {lang === 'ar' ? 'إجمالي المجموعات: ' : 'Total sets: '}
                <strong className="num">{legacyPreview.summary.totalSetsInFile}</strong>
              </div>
              <div>
                {lang === 'ar' ? 'تمارين مفضلة: ' : 'Favorites: '}
                <strong className="num">{legacyPreview.summary.favoritesCount}</strong>
              </div>
              {legacyPreview.summary.unverifiedDraftImagesCount > 0 && (
                <div>
                  {lang === 'ar'
                    ? `صور خارجية غير موثقة الترخيص (ستحفظ كمسودة غير منشورة): ${legacyPreview.summary.unverifiedDraftImagesCount}`
                    : `Unverified image URLs (kept as unpublished drafts): ${legacyPreview.summary.unverifiedDraftImagesCount}`}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-gold" style={{ flex: 1 }} onClick={confirmLegacyImport}>
                {lang === 'ar' ? 'موافقة وأرشفة البيانات' : 'Approve & Archive'}
              </button>
              <button className="btn btn-ghost" onClick={() => setLegacyPreview(null)}>
                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Backup Restore Preview & Confirmation Modal */}
      {restorePreview && (
        <div className="modal-backdrop" onClick={() => setRestorePreview(null)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
              {lang === 'ar' ? 'تأكيد استعادة النسخة الاحتياطية' : 'Confirm Backup Restore'}
            </h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
              {lang === 'ar'
                ? 'تم التحقق من سلامة بنية الملف والبصمة الرقمية. سيتم أخذ لقطة أمان لحالتك الحالية تلقائيًا قبل الاستعادة.'
                : 'Backup schema & SHA-256 checksum verified. A safety snapshot of your current state will be stored automatically prior to restoring.'}
            </p>
            <div className="notice-box notice-gold" style={{ marginBottom: 14 }}>
              <div>Sessions: <strong className="num">{restorePreview.summary.sessionsCount}</strong></div>
              <div>Sets: <strong className="num">{restorePreview.summary.setsCount}</strong></div>
              <div>Plan Versions: <strong className="num">{restorePreview.summary.planVersionsCount}</strong></div>
              <div>Body Metrics: <strong className="num">{restorePreview.summary.bodyMetricsCount}</strong></div>
              <div>Legacy Archive: <strong className="num">{restorePreview.summary.legacyCount}</strong></div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-gold" style={{ flex: 1 }} onClick={confirmRestoreBackup}>
                {lang === 'ar' ? 'تأكيد الاستعادة الآن' : 'Confirm Restore'}
              </button>
              <button className="btn btn-ghost" onClick={() => setRestorePreview(null)}>
                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Account Deletion Warning + Pre-Delete Export Modal */}
      {deleteModalOpen && (
        <div className="modal-backdrop" onClick={() => setDeleteModalOpen(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--danger)', marginBottom: 8 }}>
              {t.settings.deleteAccountTitle}
            </h3>
            <div className="notice-box notice-danger" style={{ marginBottom: 12 }}>
              {t.settings.deleteAccountWarn}
            </div>

            <button
              type="button"
              className="btn btn-outline-gold btn-block"
              style={{ marginBottom: 14 }}
              onClick={handleExportFullJson}
            >
              <Download size={15} />
              <span>{t.settings.exportBeforeDelete}</span>
            </button>

            <div className="field">
              <label>{t.settings.typeDeleteConfirm}</label>
              <input
                dir="ltr"
                placeholder="DELETE"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-danger"
                style={{ flex: 1 }}
                disabled={deleteConfirmText !== 'DELETE'}
                onClick={handleConfirmDeleteAccount}
              >
                {t.settings.confirmDeleteBtn}
              </button>
              <button className="btn btn-ghost" onClick={() => setDeleteModalOpen(false)}>
                {lang === 'ar' ? 'تراجع' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
