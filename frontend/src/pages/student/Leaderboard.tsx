import { useEffect, useState } from 'react'
import api from '@/api/client'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { LeaderboardEntry } from '@/types'

function getRankTitle(pts: number, t: (key: string) => string) {
  if (pts >= 500) return { title: t('rank.scholar'),      color: '#d99a10' }
  if (pts >= 300) return { title: t('rank.advanced'),     color: '#178f8f' }
  if (pts >= 150) return { title: t('rank.intermediate'), color: '#2a7d5f' }
  if (pts >= 50)  return { title: t('rank.beginner'),     color: '#8a8072' }
  return              { title: t('rank.newcomer'),     color: '#aaa090' }
}

const MEDALS = ['🥇','🥈','🥉']
const MEDAL_COLORS = ['#d99a10','#9B9B9B','#CD7F32']

export default function StudentLeaderboard() {
  const { profile } = useAuth()
  const { t } = useI18n()
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    const { data } = await api.get<LeaderboardEntry[]>('/leaderboard')
    setEntries(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Use the backend's competition rank (ties share a rank; the next distinct
  // score skips ahead accordingly), not raw list position.
  const myRank = entries.find(e => e.unique_id === profile?.unique_id)?.rank ?? 0
  const rank = getRankTitle(profile?.points ?? 0, t)

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="font-display font-semibold text-2xl text-gray-900 mb-5">{t('lb.title')}</h1>

      {/* My rank card */}
      {myRank > 0 && (
        <div className="rounded-2xl p-5 text-center text-white mb-5"
             style={{ background: 'linear-gradient(135deg, #e8622c 0%, #d04f1a 100%)', boxShadow: '0 8px 24px -8px rgba(232,98,44,0.55)' }}>
          <p className="text-xs font-semibold uppercase tracking-wider opacity-75">{t('lb.your_rank')}</p>
          <p className="font-display font-semibold text-5xl my-1">#{myRank}</p>
          <p className="text-sm opacity-90">⭐ {profile?.points ?? 0} {t('topics.pts')}</p>
          <span className="inline-block mt-2 px-3 py-0.5 rounded-full text-xs font-bold"
                style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}>
            {rank.title}
          </span>
        </div>
      )}

      {/* Top 3 podium */}
      {entries.length >= 3 && (
        <div className="flex justify-center items-end gap-3 mb-5">
          {[1,0,2].map(i => {
            const e = entries[i]
            if (!e) return null
            const isMe = e.unique_id === profile?.unique_id
            return (
              <div key={i} className={`flex flex-col items-center flex-1 ${i === 0 ? 'mb-4' : ''}`}>
                <span className="text-2xl mb-1">{MEDALS[i]}</span>
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center border-2 mb-1 font-bold text-sm"
                  style={{ borderColor: MEDAL_COLORS[i], color: MEDAL_COLORS[i], backgroundColor: MEDAL_COLORS[i] + '22' }}
                >
                  {e.name[0]}{e.surname[0]}
                </div>
                <p className={`text-xs font-semibold truncate max-w-full text-center ${isMe ? 'text-primary' : 'text-gray-700'}`}>
                  {isMe ? t('lb.you') : e.name}
                </p>
                <p className="text-xs text-muted">⭐ {e.points}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Full list */}
      <div className="bg-surface rounded-2xl border border-border overflow-hidden divide-y divide-border"
           style={{ boxShadow: '0 2px 12px -6px rgba(44,36,24,0.08)' }}>
        {entries.map((e, i) => {
          const isMe = e.unique_id === profile?.unique_id
          const medalIdx = e.rank - 1
          const tied = entries.filter(x => x.rank === e.rank).length > 1
          return (
            <div key={e.unique_id ?? i}
                 className={`flex items-center gap-3 px-4 py-3 transition-colors ${isMe ? 'bg-primary-light' : 'hover:bg-bg'}`}>
              <span className="w-8 text-center text-sm font-semibold flex-shrink-0"
                    style={{ color: e.rank <= 3 ? MEDAL_COLORS[medalIdx] : '#8a8072' }}>
                {e.rank <= 3 ? MEDALS[medalIdx] : `${tied ? '=' : ''}#${e.rank}`}
              </span>
              <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                   style={{ background: isMe ? '#fdeadd' : '#dff0f0', color: isMe ? '#e8622c' : '#178f8f' }}>
                {e.name[0]}{e.surname[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold truncate ${isMe ? 'text-primary' : 'text-gray-900'}`}>
                  {isMe ? `${e.name} (${t('lb.you')})` : `${e.name} ${e.surname}`}
                </p>
                <p className="text-xs text-muted truncate">{e.unique_id}</p>
              </div>
              <span className="text-sm font-display font-semibold text-warning flex-shrink-0">⭐ {e.points}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
