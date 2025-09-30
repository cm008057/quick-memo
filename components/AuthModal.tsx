'use client'

import { useState } from 'react'
import { authService } from '@/lib/auth'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const { error: authError } = isLogin
        ? await authService.signIn(email, password)
        : await authService.signUp(email, password)

      if (authError) {
        setError(authError.message)
      } else {
        if (!isLogin) {
          setError('確認メールをお送りしました。メールを確認してアカウントを有効化してください。')
        } else {
          onSuccess()
          onClose()
        }
      }
    } catch {
      setError('認証に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setLoading(true)
    try {
      const { error } = await authService.signInWithGoogle()
      if (error) {
        setError(error.message)
      }
    } catch {
      setError('Google認証に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal active">
      <div className="modal-content" style={{ maxWidth: '400px' }}>
        <div className="modal-header">
          <h2 className="modal-title">
            {isLogin ? 'ログイン' : 'アカウント作成'}
          </h2>
          <button className="close-btn" onClick={onClose}>
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>
              メールアドレス
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>
              パスワード
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}
            />
          </div>

          {error && (
            <div style={{
              color: error.includes('確認メール') ? '#10b981' : '#ef4444',
              fontSize: '14px',
              marginBottom: '15px',
              padding: '10px',
              background: error.includes('確認メール') ? '#f0f9ff' : '#fef2f2',
              borderRadius: '6px'
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '16px',
              cursor: loading ? 'not-allowed' : 'pointer',
              marginBottom: '15px'
            }}
          >
            {loading ? '処理中...' : isLogin ? 'ログイン' : 'アカウント作成'}
          </button>
        </form>

        <div style={{ textAlign: 'center', margin: '15px 0', color: '#666' }}>
          または
        </div>

        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          style={{
            width: '100%',
            padding: '12px',
            background: '#ffffff',
            color: '#333',
            border: '1px solid #ddd',
            borderRadius: '6px',
            fontSize: '16px',
            cursor: loading ? 'not-allowed' : 'pointer',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
        >
          🌐 Googleでログイン
        </button>

        <div style={{ textAlign: 'center' }}>
          <button
            type="button"
            onClick={() => setIsLogin(!isLogin)}
            style={{
              background: 'none',
              border: 'none',
              color: '#3b82f6',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            {isLogin ? 'アカウントを作成' : 'ログインに戻る'}
          </button>
        </div>
      </div>
    </div>
  )
}