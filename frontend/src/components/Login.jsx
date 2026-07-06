import { ListTodo, LockKeyhole, UserRound } from 'lucide-react'

export default function Login({ onLogin, busy, error, googleEnabled }) {
  const submit = e => { e.preventDefault(); const data = new FormData(e.currentTarget); onLogin(data.get('username'), data.get('password')) }
  return <div className="login-page">
    <section className="login-visual"><div className="visual-copy"><div className="login-logo"><ListTodo/> WorkManager</div><h1>오늘 해야 할 일을<br/>가볍게 정리하세요.</h1><p>업무, 일정, 기록을 한곳에서 관리하고<br/>AI와 함께 더 나은 하루를 계획합니다.</p></div><div className="visual-window"><span/><span/><span/><div className="visual-lines"><i/><i/><i/></div></div></section>
    <section className="login-panel"><form onSubmit={submit}><div className="mobile-logo"><ListTodo/> WorkManager</div><h2>로그인</h2><p className="muted">작업 공간으로 돌아오신 것을 환영합니다.</p><label>아이디<div className="input-with-icon"><UserRound/><input name="username" autoComplete="username" required placeholder="아이디 입력"/></div></label><label>비밀번호<div className="input-with-icon"><LockKeyhole/><input name="password" type="password" autoComplete="current-password" required placeholder="비밀번호 입력"/></div></label>{error ? <p className="form-error">{error}</p> : null}<button className="primary full" disabled={busy}>{busy ? '로그인 중...' : '로그인'}</button>{googleEnabled ? <><div className="or"><span>또는</span></div><a className="google-button" href="/api/auth/google/start"><b>G</b> Google로 계속하기</a></> : null}<small className="login-note">이 서비스는 개인용 작업 관리 도구입니다.</small></form></section>
  </div>
}
