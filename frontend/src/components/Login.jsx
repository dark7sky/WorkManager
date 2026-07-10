import { useState } from 'react'
import { Eye, ListTodo, LoaderCircle, RefreshCw } from 'lucide-react'
import { api } from '../api'

export default function Login({ error, googleEnabled, onRetry }) {
  const [demoBusy, setDemoBusy] = useState(false)
  const [demoError, setDemoError] = useState('')
  const startDemo = async () => {
    setDemoBusy(true)
    setDemoError('')
    try {
      await api.startDemo()
      location.reload()
    } catch (e) {
      setDemoError(e.message)
      setDemoBusy(false)
    }
  }
  return <div className="login-page"><section className="login-visual"><div className="visual-copy"><div className="login-logo"><ListTodo/> WorkManager</div><h1>오늘 해야 할 일을<br/>가볍게 정리하세요.</h1><p>업무, 일정, 기록을 한곳에서 관리하고<br/>AI와 함께 더 나은 하루를 계획합니다.</p></div></section><section className="login-panel"><div className="google-login-card"><div className="mobile-logo"><ListTodo/> WorkManager</div><h2>WorkManager 시작하기</h2><p className="muted">허용된 Google 계정으로 안전하게 로그인하세요.</p>{error?<div className="login-error" role="alert"><p>{error}</p><button className="secondary" onClick={onRetry}><RefreshCw/> 다시 확인</button></div>:null}{googleEnabled?<a className="google-button google-primary" href="/api/auth/google/start"><b>G</b> Google로 계속하기</a>:<p className="form-error">Google 로그인이 아직 설정되지 않았습니다. 관리자에게 문의해 주세요.</p>}<div className="or"><span>또는</span></div><button type="button" className="secondary full" disabled={demoBusy} onClick={startDemo}>{demoBusy?<LoaderCircle className="spin"/>:<Eye/>} 샘플로 미리 보기</button>{demoError?<p className="form-error">{demoError}</p>:null}<small className="login-note">샘플 계정은 미리 준비된 데이터만 보여주는 읽기 전용 체험판입니다. 실제 사용은 Google 로그인으로 시작하세요.</small></div></section></div>
}
