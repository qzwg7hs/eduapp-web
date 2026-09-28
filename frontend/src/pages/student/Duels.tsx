import { useEffect, useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import api from '@/api/client'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { DuelListItem, DuelOpponent } from '@/types'
import Avatar from '@/components/Avatar'
import { Swords, Search, X, Trophy, Clock, CheckCircle2, XCircle } from 'lucide-react'

function errMsg(t: (k: string) => string, code?: string) {
  const map: Record<string, string> = {
    duel_daily_cap_reached: 'duel.err_daily_cap',
    duel_pending_challenge_exists: 'duel.err_pending_exists',
    duel_opponent_invalid: 'duel.err_opponent_invalid',
    duel_opponent_not_found: 'duel.err_opponent_not_found',
  }
  return t(code && map[code] ? map[code] : 'duel.err_generic')
}

export default function StudentDuels() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { t, locale } = useI18n()
  const [loading, setLoading] = useState(true)
  const [duels, setDuels] = useState<DuelListItem[]>([])
  const [picking, setPicking] = useState(false)
  const [search, setSearch] = useState('')
  const [opponents, setOpponents] = useState<DuelOpponent[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [blocked, setBlocked] = useState<{ blocked: boolean; reason: 'pending' | 'daily_cap' | null }>({ blocked: false, reason: null })

  async function load() {
    setLoading(true)
    const [{ data }, { data: canChallenge }] = await Promise.all([
      api.get<DuelListItem[]>('/duels/mine'),
      api.get<{ blocked: boolean; reason: 'pending' | 'daily_cap' | null }>('/duels/can-challenge'),
    ])
    setDuels(data)
    setBlocked(canChallenge)
    setLoading(false)
  }

  useEffect(() => { if (!profile?.duel_disabled) load() }, [locale, profile?.duel_disabled])

  useEffect(() => {
    if (!picking) return
    const iv = setTimeout(() => {
      api.get<DuelOpponent[]>('/duels/opponents', { params: { q: search } }).then(r => setOpponents(r.data))
    }, 250)
    return () => clearTimeout(iv)
  }, [picking, search])

  async function sendChallenge(opponentId: string) {
    setSending(true)
    setError('')
    try {
      await api.post('/duels/challenge', { opponent_id: opponentId })
      setPicking(false)
      setSearch('')
      await load()
    } catch (e: any) {
      setError(errMsg(t, e.response?.data?.detail))
    } finally {
      setSending(false)
    }
  }

  async function respond(id: string, action: 'accept' | 'decline') {
    setError('')
    try {
      await api.post(`/duels/${id}/${action}`, null, { params: { language: locale } })
      if (action === 'accept') { navigate(`/student/duel/${id}`); return }
      await load()
    } catch (e: any) {
      setError(errMsg(t, e.response?.data?.detail))
    }
  }

  if (profile?.duel_disabled) return <Navigate to="/student" replace />

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  )

  const incoming = duels.filter(d => d.role === 'opponent' && d.status === 'pending')
  const outgoing = duels.filter(d => d.role === 'challenger' && d.status === 'pending')
  const active = duels.filter(d => d.status === 'active')
  const history = duels.filter(d => ['completed', 'declined', 'expired'].includes(d.status))

  function Row({ d, onClick, right }: { d: DuelListItem; onClick: () => void; right?: React.ReactNode }) {
    return (
      <button
        onClick={onClick}
        className="w-full flex items-center gap-3 px-4 py-3 bg-surface rounded-2xl border border-border hover:bg-bg transition-colors text-left"
      >
        <Avatar name={d.opponent.name} surname={d.opponent.surname} size="sm"
                borderColor={d.opponent.equipped_border_color} icon={d.opponent.equipped_avatar_icon} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{d.opponent.name} {d.opponent.surname}</p>
          <p className="text-xs text-muted truncate">{d.opponent.unique_id}</p>
        </div>
        {right}
      </button>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display font-semibold text-2xl text-gray-900 flex items-center gap-2">
          <Swords className="w-6 h-6" style={{ color: 'var(--accent, #e8622c)' }} /> {t('duel.title')}
        </h1>
      </div>
      <p className="text-sm text-muted mb-5">{t('duel.subtitle')}</p>

      <button
        className="btn-primary w-full mb-1.5 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={blocked.blocked}
        onClick={() => { setPicking(true); setOpponents([]) }}
      >
        <Swords className="w-4 h-4" /> {t('duel.challenge_someone')}
      </button>
      {blocked.blocked && (
        <p className="text-xs text-muted text-center mb-6">
          {blocked.reason === 'pending' ? t('duel.err_pending_exists') : t('duel.err_daily_cap')}
        </p>
      )}
      {!blocked.blocked && <div className="mb-6" />}

      {error && <p className="text-sm text-danger mb-4 text-center">{error}</p>}

      {incoming.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-2">{t('duel.incoming')}</h2>
          <div className="space-y-2">
            {incoming.map(d => (
              <div key={d.id} className="bg-surface rounded-2xl border border-border p-3 flex items-center gap-3">
                <Avatar name={d.opponent.name} surname={d.opponent.surname} size="sm"
                        borderColor={d.opponent.equipped_border_color} icon={d.opponent.equipped_avatar_icon} />
                <p className="flex-1 text-sm font-semibold text-gray-900 truncate">{d.opponent.name} {d.opponent.surname}</p>
                <button className="px-3 py-1.5 rounded-lg text-xs font-semibold text-muted hover:bg-gray-100" onClick={() => respond(d.id, 'decline')}>
                  {t('duel.decline')}
                </button>
                <button className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: 'var(--accent, #e8622c)' }} onClick={() => respond(d.id, 'accept')}>
                  {t('duel.accept')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {outgoing.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-2">{t('duel.outgoing')}</h2>
          <div className="space-y-2">
            {outgoing.map(d => (
              <Row key={d.id} d={d} onClick={() => {}} right={<span className="text-xs text-muted flex-shrink-0">{t('duel.pending_response')}</span>} />
            ))}
          </div>
        </div>
      )}

      {active.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-2">{t('duel.in_progress')}</h2>
          <div className="space-y-2">
            {active.map(d => (
              <Row
                key={d.id} d={d} onClick={() => navigate(`/student/duel/${d.id}`)}
                right={
                  d.my_submitted
                    ? <span className="flex items-center gap-1 text-xs font-semibold text-muted flex-shrink-0"><Clock className="w-3.5 h-3.5" />{t('duel.waiting_short')}</span>
                    : <span className="text-xs font-bold flex-shrink-0" style={{ color: 'var(--accent, #e8622c)' }}>{t('duel.your_turn')}</span>
                }
              />
            ))}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-2">{t('duel.history')}</h2>
          <div className="space-y-2">
            {history.map(d => (
              <Row
                key={d.id} d={d} onClick={() => navigate(`/student/duel/${d.id}`)}
                right={
                  d.status === 'completed' ? (
                    d.winner === 'me'
                      ? <span className="flex items-center gap-1 text-xs font-semibold text-success flex-shrink-0"><Trophy className="w-3.5 h-3.5" />{t('duel.you_won')}</span>
                      : d.winner === 'tie'
                      ? <span className="text-xs font-semibold text-muted flex-shrink-0">{t('duel.tie')}</span>
                      : <span className="flex items-center gap-1 text-xs font-semibold text-danger flex-shrink-0"><XCircle className="w-3.5 h-3.5" />{t('duel.you_lost')}</span>
                  ) : (
                    <span className="text-xs text-muted flex-shrink-0">
                      {d.status === 'declined' ? t('duel.status_declined') : t('duel.status_expired')}
                    </span>
                  )
                }
              />
            ))}
          </div>
        </div>
      )}

      {duels.length === 0 && (
        <p className="text-center text-muted py-10 text-sm">{t('duel.empty')}</p>
      )}

      {picking && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4" onClick={() => setPicking(false)}>
          <div className="bg-surface rounded-2xl p-5 max-w-sm w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-semibold text-base text-gray-900">{t('duel.challenge_someone')}</h3>
              <button onClick={() => setPicking(false)} className="text-muted hover:text-gray-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="relative mb-3">
              <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                className="input w-full pl-9" placeholder={t('duel.search_placeholder')}
                value={search} onChange={e => setSearch(e.target.value)} autoFocus
              />
            </div>
            {error && <p className="text-sm text-danger mb-2">{error}</p>}
            <div className="space-y-1.5 overflow-y-auto flex-1">
              {opponents.map(o => (
                <button
                  key={o.id} disabled={sending}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-bg transition-colors text-left disabled:opacity-50"
                  onClick={() => sendChallenge(o.id)}
                >
                  <Avatar name={o.name} surname={o.surname} size="sm" borderColor={o.equipped_border_color} icon={o.equipped_avatar_icon} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{o.name} {o.surname}</p>
                    <p className="text-xs text-muted truncate">{o.unique_id}</p>
                  </div>
                </button>
              ))}
              {opponents.length === 0 && (
                <p className="text-sm text-muted text-center py-6">{t('duel.no_opponents')}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
