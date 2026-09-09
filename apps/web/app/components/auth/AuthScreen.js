'use client';

import { useId } from 'react';

export function AuthScreen({
  appVersion,
  viewportWidth,
  isMobile,
  isWebView,
  authMode,
  authName,
  authUsername,
  authPassword,
  authPasswordConfirm,
  rememberLogin,
  authError,
  setAuthMode,
  setAuthName,
  setAuthUsername,
  setAuthPassword,
  setAuthPasswordConfirm,
  setRememberLogin,
  setAuthError,
  onLogin,
  onRegister,
  styles,
}) {
  const nameId = useId();
  const usernameId = useId();
  const passwordId = useId();
  const passwordConfirmId = useId();
  const rememberId = useId();
  const rememberDescriptionId = useId();
  const {
    pageWrap,
    heroCard,
    versionBadge,
    card,
    inputStyle,
    btnPrimary,
    btnSecondary,
  } = styles;
  const clearError = () => {
    if (authError) setAuthError('');
  };

  return (
    <main style={{ ...pageWrap, minHeight: '100vh', display: 'grid', placeItems: 'center', padding: viewportWidth < 735 ? 10 : pageWrap.padding, paddingTop: (isMobile || isWebView) ? 'calc(34px + env(safe-area-inset-top, 0px))' : (viewportWidth < 735 ? 10 : pageWrap.padding), paddingBottom: (isMobile || isWebView) ? 'calc(86px + env(safe-area-inset-bottom, 0px))' : (viewportWidth < 735 ? 10 : pageWrap.padding) }}>
      <section style={{ width: '100%', maxWidth: viewportWidth < 735 ? 640 : 920, display: 'grid', gridTemplateColumns: viewportWidth < 735 ? '1fr' : 'repeat(auto-fit,minmax(320px,1fr))', gap: 14 }}>
        <section style={{ ...heroCard, marginBottom: 0, minHeight: viewportWidth < 735 ? 220 : 280, alignItems: viewportWidth < 735 ? 'flex-start' : 'flex-end' }}>
          <div>
            <div style={{ fontSize: 13, color: '#bfdbfe', marginBottom: 8 }}>TEACHER NOTEBOOK</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: viewportWidth < 735 ? 26 : 30 }}>디지털 교무수첩</h1>
              <span style={versionBadge}>{appVersion}</span>
            </div>
            <p style={{ marginTop: 8, color: '#dbeafe', lineHeight: 1.6 }}>학급 일지, 상담 기록, 출석 메모를 한 곳에서 관리하세요.</p>
          </div>
        </section>

        <section style={{ ...card, marginBottom: 0, boxShadow: '0 14px 36px rgba(15,23,42,0.10)' }}>
          <h2 style={{ marginTop: 0 }}>{authMode === 'login' ? '교사 로그인' : '교사 회원가입'}</h2>
          <form onSubmit={(event) => {
            event.preventDefault();
            if (authMode === 'login') onLogin();
            else onRegister();
          }}>
            {authMode === 'register' && (
              <input
                id={nameId}
                aria-label='교사 이름'
                autoComplete='name'
                style={{ ...inputStyle, width: '100%', marginBottom: 8, boxSizing: 'border-box' }}
                value={authName}
                onChange={(event) => {
                  setAuthName(event.target.value);
                  clearError();
                }}
                placeholder='이름'
              />
            )}
            <input
              id={usernameId}
              aria-label='아이디'
              autoComplete='username'
              style={{ ...inputStyle, width: '100%', marginBottom: 8, boxSizing: 'border-box' }}
              value={authUsername}
              onChange={(event) => {
                setAuthUsername(event.target.value);
                clearError();
              }}
              placeholder='아이디'
            />
            <input
              id={passwordId}
              aria-label='비밀번호'
              autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
              style={{ ...inputStyle, width: '100%', marginBottom: authMode === 'register' ? 8 : 0, boxSizing: 'border-box' }}
              type='password'
              value={authPassword}
              onChange={(event) => {
                setAuthPassword(event.target.value);
                clearError();
              }}
              placeholder='비밀번호'
            />
            {authMode === 'register' && (
              <input
                id={passwordConfirmId}
                aria-label='비밀번호 확인'
                autoComplete='new-password'
                style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
                type='password'
                value={authPasswordConfirm}
                onChange={(event) => {
                  setAuthPasswordConfirm(event.target.value);
                  clearError();
                }}
                placeholder='비밀번호 확인'
              />
            )}
            {authMode === 'login' && (
              <div style={{ marginTop: 9 }}>
                <label htmlFor={rememberId} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: '#475569', fontSize: 13, cursor: 'pointer', fontWeight: 700 }}>
                  <input id={rememberId} type='checkbox' checked={rememberLogin} onChange={(event) => setRememberLogin(event.target.checked)} aria-describedby={rememberDescriptionId} />
                  로그인 유지
                </label>
                <div id={rememberDescriptionId} style={{ marginTop: 3, color: '#64748b', fontSize: 11, lineHeight: 1.4 }}>
                  선택하지 않으면 1시간 후 세션이 만료됩니다. 공용 기기에서는 선택하지 마세요.
                </div>
              </div>
            )}
            {!!authError && (
              <div role='alert' aria-live='assertive' style={{ marginTop: 8, fontSize: 13, color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 10px' }}>
                {authError}
              </div>
            )}

            <button type='submit' style={{ ...btnPrimary, width: '100%', marginTop: 10 }}>{authMode === 'login' ? '로그인' : '회원가입'}</button>
          </form>
          <button
            type='button'
            style={{ ...btnSecondary, width: '100%', marginTop: 8 }}
            onClick={() => {
              setAuthMode((mode) => (mode === 'login' ? 'register' : 'login'));
              setAuthError('');
            }}
          >
            {authMode === 'login' ? '회원가입' : '로그인'}
          </button>
        </section>
      </section>
    </main>
  );
}
