import { useEffect, useState } from 'react'
import api from '@/api/client'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import ScoreTrendChart from '@/components/ScoreTrendChart'

interface ExamHistoryPoint { exam_date: string; score: number; total: number }

type T = (key: string, vars?: Record<string, string | number>) => string

function getAchievements(t: T) {
  return [
    { id: 'first_solve', icon: '🌱', title: t('ach.first_solve.title'), desc: t('ach.first_solve.desc'), threshold: 1 },
    { id: 'scholar',     icon: '📖', title: t('ach.scholar.title'),     desc: t('ach.scholar.desc'),     threshold: 50 },
    { id: 'on_target',   icon: '🎯', title: t('ach.on_target.title'),   desc: t('ach.on_target.desc'),   threshold: 150 },
    { id: 'advanced',    icon: '🚀', title: t('ach.advanced.title'),    desc: t('ach.advanced.desc'),    threshold: 300 },
    { id: 'master',      icon: '👑', title: t('ach.master.title'),      desc: t('ach.master.desc'),      threshold: 500 },
    { id: 'pod_first',   icon: '⚡', title: t('ach.pod_first.title'),   desc: t('ach.pod_first.desc'),   threshold: -1 },
  ]
}

function getRankTitle(pts: number, t: T) {
  if (pts >= 500) return { title: t('rank.scholar'),      color: '#d99a10', bg: '#fdf1d6' }
  if (pts >= 300) return { title: t('rank.advanced'),     color: '#178f8f', bg: '#dff0f0' }
  if (pts >= 150) return { title: t('rank.intermediate'), color: '#2a7d5f', bg: '#e7f2ec' }
  if (pts >= 50)  return { title: t('rank.beginner'),     color: '#8a8072', bg: '#f5f0e8' }
  return              { title: t('rank.newcomer'),     color: '#aaa090', bg: '#f5f0e8' }
}

function formatPoints(pts: number) {
  return pts >= 1000 ? `${(pts / 1000).toFixed(1)}k` : String(pts)
}

export default function StudentProfile() {
  const { profile, signOut } = useAuth()
  const { t } = useI18n()
  const [stats, setStats] = useState({ total_attempts: 0, correct_attempts: 0, problems_solved: 0, pod_solved: 0, lessons_completed: 0 })
  const [loading, setLoading] = useState(true)
  const [examHistory, setExamHistory] = useState<ExamHistoryPoint[]>([])

  useEffect(() => {
    api.get('/progress/stats').then(r => { setStats(r.data); setLoading(false) })
    api.get<ExamHistoryPoint[]>('/test-bank/history').then(r => setExamHistory(r.data)).catch(() => setExamHistory([]))
  }, [])

  if (!profile || loading) return (
    <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  )

  const rank = getRankTitle(profile.points, t)
  const achievements = getAchievements(t)
  const accuracy = stats.total_attempts > 0 ? Math.round((stats.correct_attempts / stats.total_attempts) * 100) : 0
  const nextGoals = [50, 150, 300, 500, 1000]
  const nextGoal = nextGoals.find(g => g > profile.points) ?? 1000
  const prevGoal = nextGoals.filter(g => g <= profile.points).pop() ?? 0
  const goalPct = ((profile.points - prevGoal) / (nextGoal - prevGoal)) * 100

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      {/* Profile card */}
      <div className="card flex flex-col items-center text-center py-6"
           style={{ boxShadow: '0 4px 16px -8px rgba(44,36,24,0.1)' }}>
        <div className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-display font-semibold mb-3"
             style={{ background: 'linear-gradient(135deg, #178f8f 0%, #0f6b6b 100%)', boxShadow: '0 8px 20px -8px rgba(23,143,143,0.5)' }}>
          {profile.name[0]}{profile.surname[0]}
        </div>
        <h2 className="font-display font-semibold text-xl text-gray-900">{profile.name} {profile.surname}</h2>
        <p className="text-sm text-muted mt-0.5">ID: {profile.unique_id}</p>
        <span className="mt-2.5 px-3 py-1 rounded-full text-sm font-semibold"
              style={{ color: rank.color, background: rank.bg }}>
          {rank.title}
        </span>
      </div>

      {/* Points */}
      <div className="card text-center" style={{ boxShadow: '0 4px 16px -8px rgba(44,36,24,0.1)' }}>
        <p className="font-display font-semibold text-5xl text-gray-900 mb-0.5">⭐ {formatPoints(profile.points)}</p>
        <p className="text-sm text-muted mb-3">{t('profile.total_points')}</p>
        <div className="flex justify-between text-xs text-muted mb-1.5">
          <span>{t('profile.next_goal', { n: nextGoal })}</span>
          <span>{profile.points} / {nextGoal}</span>
        </div>
        <div className="h-2.5 bg-border rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(goalPct, 100)}%`, backgroundColor: rank.color }} />
        </div>
      </div>

      {/* Daily exam score trend */}
      <div className="card" style={{ boxShadow: '0 4px 16px -8px rgba(44,36,24,0.1)' }}>
        <h3 className="font-display font-semibold text-base text-gray-900 mb-3">{t('profile.score_trend')}</h3>
        <ScoreTrendChart data={examHistory} emptyLabel={t('profile.score_trend_empty')} />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: t('stats.lessons_done'),   value: stats.lessons_completed, icon: '📚', accent: '#e8622c', bg: '#fdeadd' },
          { label: t('stats.accuracy'),       value: `${accuracy}%`,          icon: '🎯', accent: '#178f8f', bg: '#dff0f0' },
          { label: t('stats.problems_tried'), value: stats.problems_solved,   icon: '✏️', accent: '#2a7d5f', bg: '#e7f2ec' },
          { label: t('stats.daily_solved'),   value: stats.pod_solved,        icon: '⚡', accent: '#d99a10', bg: '#fdf1d6' },
        ].map(s => (
          <div key={s.label} className="card flex flex-col items-center py-4"
               style={{ boxShadow: '0 2px 8px -4px rgba(44,36,24,0.08)' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-2"
                 style={{ background: s.bg }}>
              {s.icon}
            </div>
            <span className="font-display font-semibold text-2xl text-gray-900">{s.value}</span>
            <span className="text-xs text-muted mt-0.5 text-center">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Achievements */}
      <div>
        <h3 className="font-display font-semibold text-base text-gray-900 mb-3">{t('profile.achievements')}</h3>
        <div className="grid grid-cols-3 gap-2">
          {achievements.map(a => {
            const earned = a.threshold === -1 ? stats.pod_solved > 0 : profile.points >= a.threshold
            return (
              <div key={a.id}
                   className={`card flex flex-col items-center text-center py-3 transition-opacity ${!earned ? 'opacity-35' : ''}`}
                   style={earned ? { boxShadow: '0 2px 8px -4px rgba(44,36,24,0.08)' } : {}}>
                <span className="text-2xl mb-1">{a.icon}</span>
                <p className="text-xs font-semibold text-gray-800">{a.title}</p>
                <p className="text-xs text-muted mt-0.5 leading-tight">{a.desc}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Rewards info */}
      <div className="rounded-2xl p-4" style={{ background: '#fdeadd', border: '1px solid #f5c9a9' }}>
        <p className="text-sm font-semibold text-primary mb-1">{t('profile.rewards_title')}</p>
        <p className="text-sm text-gray-700 leading-relaxed">
          {t('profile.rewards_desc')}
        </p>
      </div>

      <button onClick={signOut} className="btn-ghost w-full">{t('profile.sign_out')}</button>
    </div>
  )
}
