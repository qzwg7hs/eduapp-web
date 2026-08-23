import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '@/api/client'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'

interface Stats {
  total_students: number
  total_topics: number
  total_problems: number
  top_students: { name: string; surname: string; points: number }[]
}

export default function AdminDashboard() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const { t } = useI18n()
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    api.get<Stats>('/progress/admin/overview').then(r => setStats(r.data))
  }, [])

  const statCards = stats ? [
    { label: t('admin.stats.students'),   value: stats.total_students, icon: '👥', color: 'text-primary' },
    { label: t('admin.stats.topics'),     value: stats.total_topics,   icon: '📚', color: 'text-success' },
    { label: t('admin.stats.problems'),   value: stats.total_problems, icon: '✏️',  color: 'text-warning' },
  ] : []

  const quickActions = [
    { label: t('admin.action.add_student'),   emoji: '➕', route: '/admin/students' },
    { label: t('admin.action.add_topic'),     emoji: '📖', route: '/admin/content' },
    { label: t('admin.action.set_pod'),       emoji: '⚡', route: '/admin/pod' },
    { label: t('admin.action.view_students'), emoji: '👥', route: '/admin/students' },
  ]

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-8 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{t('admin.title')}</h1>
          <p className="text-sm text-muted mt-0.5">{t('admin.welcome', { name: profile?.name ?? '' })}</p>
        </div>
        <button onClick={signOut} className="btn-ghost text-sm">{t('admin.sign_out')}</button>
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-3 mb-8">
          {statCards.map(s => (
            <div key={s.label} className="card flex flex-col items-center py-4">
              <span className="text-2xl mb-1">{s.icon}</span>
              <span className={`text-2xl font-bold ${s.color}`}>{s.value}</span>
              <span className="text-xs text-muted mt-0.5">{s.label}</span>
            </div>
          ))}
        </div>
      )}

      <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">{t('admin.quick_actions')}</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {quickActions.map(a => (
          <button key={a.label} onClick={() => navigate(a.route)} className="card flex flex-col items-center py-4 hover:border-primary hover:bg-primary-light transition-colors cursor-pointer">
            <span className="text-2xl mb-2">{a.emoji}</span>
            <span className="text-sm font-medium text-gray-700 text-center">{a.label}</span>
          </button>
        ))}
      </div>

      {stats && stats.top_students.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">{t('admin.top_students')}</h2>
          <div className="card divide-y divide-border p-0 overflow-hidden">
            {stats.top_students.map((s, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <span className="text-sm font-bold text-muted w-6">#{i + 1}</span>
                <span className="flex-1 text-sm font-medium text-gray-900">{s.name} {s.surname}</span>
                <span className="text-sm font-semibold text-warning">⭐ {s.points}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
