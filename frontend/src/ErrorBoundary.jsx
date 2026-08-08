import { Component } from 'react'

export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[树洞] 页面渲染出错:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="error-boundary">
        <div className="glass-card error-boundary-card">
          <div className="error-boundary-icon">🌲</div>
          <h2>树洞好像出了点问题</h2>
          <p className="error-boundary-desc">页面加载失败了，刷新一下通常就好。如果一直这样，麻烦把下面的信息发给管理员。</p>
          <div className="error-boundary-actions">
            <button className="glass-button btn-primary" onClick={() => window.location.reload()}>刷新页面</button>
            <button className="glass-button" onClick={() => { localStorage.clear(); window.location.reload() }}>清除本地数据并刷新</button>
          </div>
          <pre className="error-boundary-detail">{String(this.state.error?.stack || this.state.error)}</pre>
        </div>
      </div>
    )
  }
}
