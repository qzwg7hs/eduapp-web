import { useEffect, useState } from 'react'
import api from '@/api/client'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import ScoreTrendChart from '@/components/ScoreTrendChart'
import Avatar from '@/components/Avatar'
import AnimalIcon from '@/components/AnimalIcon'
import { MonthlyLeaderboardOut, MissionOut, CosmeticOptions } from '@/types'

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
  const { profile, signOut, refreshProfile } = useAuth()
  const { t, locale } = useI18n()
  const [stats, setStats] = useState({ total_attempts: 0, correct_attempts: 0, problems_solved: 0, pod_solved: 0, lessons_completed: 0 })
  const [loading, setLoading] = useState(true)
  const [examHistory, setExamHistory] = useState<ExamHistoryPoint[]>([])
  const [monthly, setMonthly] = useState<{ label: string; points: number } | null>(null)
  const [missions, setMissions] = useState<MissionOut[]>([])
  const [cosmetics, setCosmetics] = useState<CosmeticOptions | null>(null)
  const [equipping, setEquipping] = useState(false)

  useEffect(() => {
    api.get('/progress/stats').then(r => { setStats(r.data); setLoading(false) })
    api.get<ExamHistoryPoint[]>('/test-bank/history').then(r => setExamHistory(r.data)).catch(() => setExamHistory([]))
  }, [])

  useEffect(() => {
    api.get<MonthlyLeaderboardOut>('/leaderboard/monthly', { params: { language: locale } })
      .then(r => setMonthly({ label: r.data.period_label, points: r.data.my_points }))
      .catch(() => setMonthly(null))
    api.get<MissionOut[]>('/missions/current', { params: { language: locale } })
      .then(r => setMissions(r.data)).catch(() => setMissions([]))
    loadCosmetics()
  }, [locale])

  function loadCosmetics() {
    api.get<CosmeticOptions>('/cosmetics/options').then(r => setCosmetics(r.data)).catch(() => setCosmetics(null))
  }

  async function equip(field: 'border_color' | 'avatar_icon', value: string, unlocked: boolean) {
    if (equipping || !unlocked) return
    setEquipping(true)
    const current = field === 'border_color' ? cosmetics?.equipped_border_color : cosmetics?.equipped_avatar_icon
    const next = current === value ? '' : value  // click again to unequip
    try {
      await api.post('/cosmetics/equip', { [field]: next })
      loadCosmetics()
      await refreshProfile()
    } finally {
      setEquipping(false)
    }
  }

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
        <div className="mb-3">
          <Avatar name={profile.name} surname={profile.surname} size="lg" isMe
                  borderColor={profile.equipped_border_color} icon={profile.equipped_avatar_icon} />
        </div>
        <h2 className="font-display font-semibold text-xl text-gray-900">{profile.name} {profile.surname}</h2>
        <p className="text-sm text-muted mt-0.5">ID: {profile.unique_id}</p>
        <span className="mt-2.5 px-3 py-1 rounded-full text-sm font-semibold"
              style={{ color: rank.color, background: rank.bg }}>
          {rank.title}
        </span>
      </div>

      {/* Streak */}
      {profile.current_streak > 0 && (
        <div className="card flex items-center justify-between" style={{ boxShadow: '0 4px 16px -8px rgba(44,36,24,0.1)', background: 'var(--accent-light, #fdeadd)', border: '1px solid #f5c9a9' }}>
          <div className="flex items-center gap-3">
            <span className="text-3xl">🔥</span>
            <div>
              <p className="font-display font-semibold text-xl text-gray-900">{t('profile.streak_days', { n: profile.current_streak })}</p>
              <p className="text-xs text-muted">{t('profile.streak_sub')}</p>
            </div>
          </div>
          {profile.longest_streak > profile.current_streak && (
            <span className="text-xs text-muted text-right">{t('profile.streak_best', { n: profile.longest_streak })}</span>
          )}
        </div>
      )}

      {/* Points */}
      <div className="card text-center" style={{ boxShadow: '0 4px 16px -8px rgba(44,36,24,0.1)' }}>
        <p className="font-display font-semibold text-5xl text-gray-900 mb-0.5">⭐ {formatPoints(profile.points)}</p>
        <p className="text-sm text-muted mb-2">{t('profile.total_points')}</p>
        {monthly && (
          <p className="inline-block mb-3 px-3 py-1 rounded-full text-xs font-semibold" style={{ background: 'var(--accent-light, #fdeadd)', color: 'var(--accent, #e8622c)' }}>
            {monthly.label}: ⭐ {monthly.points}
          </p>
        )}
        <div className="flex justify-between text-xs text-muted mb-1.5">
          <span>{t('profile.next_goal', { n: nextGoal })}</span>
          <span>{profile.points} / {nextGoal}</span>
        </div>
        <div className="h-2.5 bg-border rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(goalPct, 100)}%`, backgroundColor: rank.color }} />
        </div>
      </div>

      {/* Weekly missions */}
      {missions.length > 0 && (
        <div className="card" style={{ boxShadow: '0 4px 16px -8px rgba(44,36,24,0.1)' }}>
          <h3 className="font-display font-semibold text-base text-gray-900 mb-3">{t('profile.missions_title')}</h3>
          <div className="space-y-2.5">
            {missions.map(m => {
              const pct = Math.min(100, (m.progress / m.target) * 100)
              return (
                <div key={m.id} className={`rounded-xl p-3 ${m.completed ? '' : 'bg-bg'}`} style={m.completed ? { background: '#e7f2ec', border: '1px solid #b8dfca' } : {}}>
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <p className={`text-sm font-medium flex-1 ${m.completed ? 'text-success' : 'text-gray-800'}`}>
                      {m.completed && '✓ '}{m.text}
                    </p>
                    <span className="text-xs font-semibold text-warning flex-shrink-0">+{m.reward_points} ⭐</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: m.completed ? '#2a7d5f' : 'var(--accent, #e8622c)' }} />
                    </div>
                    <span className="text-xs text-muted flex-shrink-0">{Math.min(m.progress, m.target)}/{m.target}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Cosmetics */}
      {cosmetics && (
        <div className="card" style={{ boxShadow: '0 4px 16px -8px rgba(44,36,24,0.1)' }}>
          <h3 className="font-display font-semibold text-base text-gray-900 mb-1">{t('profile.customize_title')}</h3>
          <p className="text-xs text-muted mb-3">
            {cosmetics.next_unlock_at
              ? t('profile.customize_sub', { have: cosmetics.current_month_points, next: cosmetics.next_unlock_at })
              : t('profile.customize_sub_maxed', { have: cosmetics.current_month_points })}
          </p>

          <div className="mb-3">
            <p className="text-xs font-semibold text-muted mb-1.5">{t('profile.customize_colors')}</p>
            <div className="flex flex-wrap gap-2">
              {cosmetics.colors.map(c => (
                <button
                  key={c.key}
                  disabled={equipping || !c.unlocked}
                  onClick={() => equip('border_color', c.hex, c.unlocked)}
                  className={`relative w-9 h-9 rounded-full transition-transform ${c.unlocked ? '' : 'cursor-default'}`}
                  style={{
                    background: c.hex,
                    opacity: c.unlocked ? 1 : 0.35,
                    boxShadow: cosmetics.equipped_border_color === c.hex ? '0 0 0 3px #fff, 0 0 0 5px var(--accent, #e8622c)' : '0 0 0 1px rgba(0,0,0,0.06)',
                  }}
                  title={c.unlocked ? c.key : t('profile.customize_locked_at', { n: c.unlock_at })}
                >
                  {!c.unlocked && (
                    <span className="absolute inset-0 flex items-center justify-center text-[10px]">🔒</span>
                  )}
                </button>
              ))}
            </div>
            {cosmetics.equipped_border_color && (
              <p className="text-xs text-muted mt-1.5">{t('profile.customize_theme_hint')}</p>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold text-muted mb-1.5">{t('profile.customize_icons')}</p>
            <div className="flex flex-wrap gap-2">
              {cosmetics.icons.map(icon => (
                <button
                  key={icon.key}
                  disabled={equipping || !icon.unlocked}
                  onClick={() => equip('avatar_icon', icon.key, icon.unlocked)}
                  className={`relative w-9 h-9 rounded-full flex items-center justify-center transition-transform bg-bg ${icon.unlocked ? '' : 'cursor-default'}`}
                  style={{
                    opacity: icon.unlocked ? 1 : 0.35,
                    boxShadow: cosmetics.equipped_avatar_icon === icon.key ? '0 0 0 3px #fff, 0 0 0 5px var(--accent, #e8622c)' : '0 0 0 1px rgba(0,0,0,0.06)',
                  }}
                  title={icon.unlocked ? icon.key : t('profile.customize_locked_at', { n: icon.unlock_at })}
                >
                  {icon.unlocked ? <AnimalIcon type={icon.key} size={20} /> : <span className="text-[10px]">🔒</span>}
                </button>
              ))}
            </div>
          </div>

          {cosmetics.current_month_points === 0 && (
            <p className="text-sm text-muted mt-3">{t('profile.customize_none_yet')}</p>
          )}
        </div>
      )}

      {/* Daily exam score trend */}
      <div className="card" style={{ boxShadow: '0 4px 16px -8px rgba(44,36,24,0.1)' }}>
        <h3 className="font-display font-semibold text-base text-gray-900 mb-3">{t('profile.score_trend')}</h3>
        <ScoreTrendChart data={examHistory} emptyLabel={t('profile.score_trend_empty')} />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: t('stats.lessons_done'),   value: stats.lessons_completed, icon: '📚', accent: 'var(--accent, #e8622c)', bg: 'var(--accent-light, #fdeadd)' },
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
      <div className="rounded-2xl p-4" style={{ background: 'var(--accent-light, #fdeadd)', border: '1px solid #f5c9a9' }}>
        <p className="text-sm font-semibold text-primary mb-1">{t('profile.rewards_title')}</p>
        <p className="text-sm text-gray-700 leading-relaxed">
          {t('profile.rewards_desc')}
        </p>
      </div>

      <button onClick={signOut} className="btn-ghost w-full">{t('profile.sign_out')}</button>
    </div>
  )
}
