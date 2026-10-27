import React, { useState } from 'react';
import { ShieldCheck, WifiOff, Layers, Eye, Globe } from 'lucide-react';
import type { Lang, UserProfile } from '../types';
import { TRANSLATIONS } from '../i18n/translations';
import { VoxaLogo } from '../components/VoxaLogo';

interface Props {
  lang: Lang;
  onChangeLang: (lang: Lang) => void;
  googleConfigured: boolean;
  onAuthSuccess: (user: UserProfile, token: string, sandboxVerifyToken?: string) => void;
  onEnterGuestPreview: () => void;
}

export const AuthWelcomeView: React.FC<Props> = ({
  lang,
  onChangeLang,
  googleConfigured,
  onAuthSuccess,
  onEnterGuestPreview
}) => {
  const t = TRANSLATIONS[lang];
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetRequestedInfo, setResetRequestedInfo] = useState<string | null>(null);
  const [googleNoticeOpen, setGoogleNoticeOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      if (mode === 'login') {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Sign-in failed');
        onAuthSuccess(data.user, data.token);
      } else if (mode === 'register') {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, displayName, language: lang })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Registration failed');
        onAuthSuccess(data.user, data.token, data.emailVerification?.sandboxVerificationToken);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRequestReset() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Request failed');
      if (data.sandboxResetToken) {
        setResetToken(data.sandboxResetToken);
        setResetRequestedInfo(
          lang === 'ar'
            ? `بيئة محلية بدون مزود SMTP خارجي: تم توليد رمز الاستعادة الفعلي للاختبار (${data.sandboxResetToken}).`
            : `Local sandbox without external SMTP: generated real reset token (${data.sandboxResetToken}).`
        );
      } else {
        setResetRequestedInfo(data.notice);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Reset failed');
      setSuccessMsg(
        lang === 'ar'
          ? 'تم تحديث كلمة المرور بنجاح. يمكنك تسجيل الدخول الآن.'
          : 'Password updated successfully. You may now sign in.'
      );
      setMode('login');
      setPassword('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleGoogleClick() {
    if (googleConfigured) {
      window.location.href = '/api/auth/google/start';
    } else {
      setGoogleNoticeOpen(true);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      {/* Top header */}
      <header className="voxa-topbar">
        <VoxaLogo variant="horizontal" size={38} subtitle={t.brandSubtitle} />
        <div className="topbar-actions">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => onChangeLang(lang === 'ar' ? 'en' : 'ar')}
          >
            <Globe size={14} />
            <span>{lang === 'ar' ? 'English' : 'العربية'}</span>
          </button>
          <button className="btn btn-outline-gold btn-sm" onClick={onEnterGuestPreview}>
            <Eye size={14} />
            <span>{t.welcome.guestPreview}</span>
          </button>
        </div>
      </header>

      <div
        style={{
          flex: 1,
          maxWidth: 1080,
          width: '100%',
          margin: '0 auto',
          padding: '28px 18px 48px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
          gap: 28,
          alignItems: 'center'
        }}
      >
        {/* Left / Start Brand Value Proposition */}
        <div>
          <span className="badge badge-gold" style={{ marginBottom: 14 }}>
            {t.welcome.badge}
          </span>
          <h1 style={{ fontSize: 'clamp(26px, 4vw, 38px)', fontWeight: 900, lineHeight: 1.2, marginBottom: 14 }}>
            {t.welcome.heroTitle}
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 15, lineHeight: 1.7, marginBottom: 22 }}>
            {t.welcome.heroSub}
          </p>

          <div style={{ display: 'grid', gap: 10, marginBottom: 22 }}>
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px' }}>
              <Layers size={20} color="var(--gold)" />
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{t.welcome.featurePlan}</span>
            </div>
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px' }}>
              <WifiOff size={20} color="var(--gold)" />
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{t.welcome.featureOffline}</span>
            </div>
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px' }}>
              <ShieldCheck size={20} color="var(--gold)" />
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{t.welcome.featureArchive}</span>
            </div>
          </div>

          <button className="btn btn-ghost" onClick={onEnterGuestPreview}>
            <Eye size={16} />
            <span>{t.welcome.guestPreview}</span>
          </button>
        </div>

        {/* Auth Card */}
        <div className="card card-gold" style={{ padding: 24 }}>
          {mode !== 'reset' && (
            <div className="seg-tabs">
              <button className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(null); }}>
                {t.welcome.signIn}
              </button>
              <button className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(null); }}>
                {t.welcome.signUp}
              </button>
            </div>
          )}

          {error && (
            <div className="notice-box notice-danger" style={{ marginBottom: 12 }}>
              {error}
            </div>
          )}
          {successMsg && (
            <div className="notice-box notice-ok" style={{ marginBottom: 12 }}>
              {successMsg}
            </div>
          )}

          {mode !== 'reset' ? (
            <form onSubmit={handleSubmit}>
              {mode === 'register' && (
                <div className="field">
                  <label>{t.welcome.displayName}</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={lang === 'ar' ? 'مثال: أحمد' : 'e.g. Alex'}
                  />
                </div>
              )}
              <div className="field">
                <label>{t.welcome.email}</label>
                <input
                  type="email"
                  required
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                />
              </div>
              <div className="field">
                <label>{t.welcome.password}</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              <button type="submit" className="btn btn-gold btn-block" disabled={loading} style={{ marginTop: 6 }}>
                {loading ? '...' : mode === 'login' ? t.welcome.signIn : t.welcome.signUp}
              </button>

              {mode === 'login' && (
                <div style={{ textAlign: 'center', marginTop: 10 }}>
                  <button
                    type="button"
                    style={{ fontSize: 12.5, color: 'var(--gold-light)' }}
                    onClick={() => { setMode('reset'); setError(null); }}
                  >
                    {t.welcome.forgotPassword}
                  </button>
                </div>
              )}

              <div style={{ height: 1, background: 'var(--line)', margin: '16px 0' }} />

              <button
                type="button"
                className="btn btn-ghost btn-block"
                onClick={handleGoogleClick}
              >
                <span>G</span>
                <span>{t.welcome.continueGoogle}</span>
              </button>
            </form>
          ) : (
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 10 }}>{t.welcome.resetPasswordTitle}</h3>
              <div className="field">
                <label>{t.welcome.email}</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="email"
                    dir="ltr"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                  />
                  <button type="button" className="btn btn-outline-gold btn-sm" onClick={handleRequestReset} disabled={!email || loading}>
                    {t.welcome.sendResetLink}
                  </button>
                </div>
              </div>

              {resetRequestedInfo && (
                <div className="notice-box notice-gold" style={{ marginBottom: 12 }}>
                  {resetRequestedInfo}
                </div>
              )}

              <form onSubmit={handleConfirmReset}>
                <div className="field">
                  <label>{t.welcome.resetToken}</label>
                  <input
                    type="text"
                    dir="ltr"
                    required
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>{t.welcome.newPassword}</label>
                  <input
                    type="password"
                    dir="ltr"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" className="btn btn-gold" style={{ flex: 1 }} disabled={loading}>
                    {t.welcome.confirmReset}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setMode('login')}>
                    {t.welcome.exitGuest}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Honest Google OAuth Configuration Modal (Never fakes OAuth success!) */}
      {googleNoticeOpen && (
        <div className="modal-backdrop" onClick={() => setGoogleNoticeOpen(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>
              {lang === 'ar' ? 'إعداد الدخول عبر Google OAuth 2.0' : 'Google OAuth 2.0 Provider Setup Required'}
            </h3>
            <p style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.7, marginBottom: 12 }}>
              {lang === 'ar'
                ? 'تم تنفيذ مسار المصادقة الحقيقي (/api/auth/google/start و /api/auth/google/callback) على الخادم، لكن مفاتيح Google السحابية غير مضبوطة حاليًا في متغيرات البيئة. التزامًا بالشفافية، لا يحاكي VOXA تسجيل دخول وهميًا.'
                : 'The real server OAuth endpoints (/api/auth/google/start & /api/auth/google/callback) are implemented, but Google credentials are not yet set in environment variables. VOXA never simulates fake OAuth sign-ins.'}
            </p>
            <div className="notice-box" dir="ltr" style={{ fontFamily: 'monospace', fontSize: 12, marginBottom: 14 }}>
              GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com{'\n'}
              <br />
              GOOGLE_CLIENT_SECRET=your_client_secret{'\n'}
              <br />
              Callback URI: {window.location.origin}/api/auth/google/callback
            </div>
            <button className="btn btn-gold btn-block" onClick={() => setGoogleNoticeOpen(false)}>
              {lang === 'ar' ? 'حسناً، فهمت' : 'Understood'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
