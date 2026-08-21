import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Eye, EyeOff } from 'lucide-react'

export default function Login() {
  const { signIn, profile } = useAuth()
  const navigate = useNavigate()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (profile) {
    navigate(profile.role === 'admin' ? '/admin' : '/student', { replace: true })
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: err } = await signIn(identifier, password)
    setLoading(false)
    if (err) { setError(err); return }
    navigate(profile?.role === 'admin' ? '/admin' : '/student', { replace: true })
    window.location.href = '/'
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-white text-3xl font-display font-semibold mb-4"
               style={{ boxShadow: '0 12px 28px -8px rgba(232,98,44,0.55)' }}>
            ∑
          </div>
          <h1 className="font-display font-semibold text-2xl text-gray-900">EduApp</h1>
        </div>

        {/* Card */}
        <form onSubmit={handleSubmit} className="bg-surface rounded-2xl border border-border p-6 space-y-4"
              style={{ boxShadow: '0 8px 32px -12px rgba(44,36,24,0.12)' }}>
          <div>
            <label className="label">Username</label>
            <input
              className="input"
              type="text"
              value={identifier}
              onChange={e => setIdentifier(e.target.value)}
              autoCapitalize="none"
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="label">Password</label>
            <div className="relative">
              <input
                className="input pr-11"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(s => !s)}
                className="absolute right-0 top-0 h-full w-11 flex items-center justify-center text-muted hover:text-gray-700 transition-colors"
                aria-label={showPassword ? 'Құпия сөзді жасыру / Скрыть пароль' : 'Құпия сөзді көрсету / Показать пароль'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-danger-light border border-red-200 rounded-xl px-3 py-2.5 text-sm text-danger font-semibold">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base">
            {loading ? 'Кіру… / Вход…' : 'Кіру / Войти →'}
          </button>
        </form>
      </div>
    </div>
  )
}
