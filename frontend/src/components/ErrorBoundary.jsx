import { Component } from 'react'
import { CircleAlert, RefreshCw } from 'lucide-react'

export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('WorkManager 화면 오류', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return <main className="fatal-error" role="alert">
      <span className="fatal-error-icon"><CircleAlert aria-hidden="true"/></span>
      <h1>화면을 불러오지 못했습니다</h1>
      <p>입력하던 내용은 브라우저에 남아 있을 수 있습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.</p>
      <button className="primary" type="button" onClick={() => location.reload()}><RefreshCw aria-hidden="true"/> 새로고침</button>
    </main>
  }
}
