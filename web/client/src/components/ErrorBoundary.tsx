import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { t } from '../i18n.js'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Pixel Agents] React error:', error, info.componentStack)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: 'var(--pixel-bg)',
          color: 'var(--pixel-text)',
          fontFamily: 'var(--pixel-font)',
          gap: '16px',
          padding: '24px',
        }}>
          <div style={{
            fontSize: '18px',
            border: '2px solid var(--pixel-border)',
            padding: '16px 24px',
            background: 'var(--pixel-surface)',
            boxShadow: '2px 2px 0px #0a0a14',
            maxWidth: '480px',
            textAlign: 'center',
          }}>
            <div style={{ marginBottom: '12px', fontWeight: 'bold' }}>
              {t.errorOccurred}
            </div>
            {this.state.error && (
              <div style={{
                fontSize: '12px',
                color: 'var(--pixel-muted)',
                marginBottom: '12px',
                wordBreak: 'break-word',
              }}>
                {this.state.error.message}
              </div>
            )}
            <button
              onClick={this.handleRetry}
              style={{
                background: 'var(--pixel-accent)',
                color: 'var(--pixel-bg)',
                border: '2px solid var(--pixel-border)',
                padding: '8px 20px',
                cursor: 'pointer',
                fontFamily: 'var(--pixel-font)',
                fontSize: '14px',
                boxShadow: '2px 2px 0px #0a0a14',
              }}
            >
              {t.retry}
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
