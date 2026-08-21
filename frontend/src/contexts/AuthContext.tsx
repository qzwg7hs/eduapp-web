import React, { createContext, useContext, useEffect, useState } from 'react'
import api from '@/api/client'
import { Profile } from '@/types'

interface AuthContextType {
  profile: Profile | null
  loading: boolean
  signIn: (username: string, password: string) => Promise<{ error: string | null }>
  signOut: () => void
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { setLoading(false); return }
    api.get<Profile>('/auth/me')
      .then(r => setProfile(r.data))
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false))
  }, [])

  async function signIn(username: string, password: string) {
    try {
      const { data } = await api.post<{ access_token: string }>('/auth/login', {
        username,
        password,
      })
      localStorage.setItem('token', data.access_token)
      const me = await api.get<Profile>('/auth/me')
      setProfile(me.data)
      return { error: null }
    } catch (err: any) {
      const status = err.response?.status
      const message = status === 403
        ? 'Есептік жазба өшірілген. Мұғаліміңізге хабарласыңыз. / Аккаунт деактивирован. Обратитесь к своему преподавателю.'
        : 'Пайдаланушы аты немесе құпия сөз қате. / Неверное имя пользователя или пароль.'
      return { error: message }
    }
  }

  function signOut() {
    localStorage.removeItem('token')
    setProfile(null)
    window.location.href = '/login'
  }

  async function refreshProfile() {
    try {
      const me = await api.get<Profile>('/auth/me')
      setProfile(me.data)
    } catch {}
  }

  return (
    <AuthContext.Provider value={{ profile, loading, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
