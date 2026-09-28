import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, Navigate } from 'react-router-dom'
import api from '@/api/client'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { DuelDetail, ExamQuestion } from '@/types'
import LatexText from '@/components/LatexText'
import Avatar from '@/components/Avatar'
import { AlertTriangle, CheckCircle2, XCircle, Swords, Clock, Trophy } from 'lucide-react'
import { parseServerUtc } from '@/lib/dailyTimer'

type Answer = { selected_options?: number[]; open_answer_given?: string }
type AnswerState = Record<number, Answer>

function fmtTime(totalSec: number) {
  const m = Math.floor(totalSec / 60).toString().padStart(2, '0')
  const s = (totalSec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function errMsg(t: (k: string) => string, code?: string) {
  const map: Record<string, string> = {
    duel_daily_cap_reached: 'duel.err_daily_cap',
    duel_pending_challenge_exists: 'duel.err_pending_exists',
    duel_opponent_invalid: 'duel.err_opponent_invalid',
    duel_opponent_not_found: 'duel.err_opponent_not_found',
    duel_not_active: 'duel.err_not_active',
  }
  return t(code && map[code] ? map[code] : 'duel.err_generic')
}

export default function StudentDuel() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t, locale } = useI18n()
  const { profile, refreshProfile } = useAuth()

  const [loading, setLoading] = useState(true)
  const [duel, setDuel] = useState<DuelDetail | null>(null)
  const [answers, setAnswers] = useState<AnswerState>({})
  const [curIdx, setCurIdx] = useState(0)
  const [remainingSec, setRemainingSec] = useState(0)
  const [terminated, setTerminated] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const answersRef = useRef<AnswerState>({})
  useEffect(() => { answersRef.current = answers }, [answers])
  const inProgressRef = useRef(false)
  const submittingRef = useRef(false)

  const questions: ExamQuestion[] = duel?.questions ?? []

  async function load() {
    const { data } = await api.get<DuelDetail>(`/duels/${id}`, { params: { language: locale } })
    setDuel(data)
    inProgressRef.current = data.my_state === 'in_progress'
    setLoading(false)
  }

  useEffect(() => {
    if (profile?.duel_disabled) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, locale, profile?.duel_disabled])

  // While waiting on the opponent to finish, poll for the result
  useEffect(() => {
    if (!duel || duel.my_state !== 'submitted' || duel.status === 'completed') return
    const iv = setInterval(load, 20_000)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duel?.my_state, duel?.status])

  async function submitDuel(terminatedFlag: boolean) {
    if (submittingRef.current || !id) return
    submittingRef.current = true
    inProgressRef.current = false
    setSubmitting(true)
    const payload: Record<string, Answer> = {}
    Object.entries(answersRef.current).forEach(([num, a]) => { payload[num] = a })
    try {
      const { data } = await api.post<DuelDetail>(
        `/duels/${id}/submit`, { answers: payload, terminated: terminatedFlag }, { params: { language: locale } },
      )
      setDuel(data)
      await refreshProfile()
    } finally {
      setSubmitting(false)
      submittingRef.current = false
    }
  }

  function isAnswered(a?: Answer) {
    if (!a) return false
    if (a.selected_options && a.selected_options.length > 0) return true
    if (a.open_answer_given && a.open_answer_given.trim()) return true
    return false
  }

  function setAnswer(number: number, a: Answer) {
    setAnswers(prev => ({ ...prev, [number]: a }))
  }

  async function handleManualSubmit() {
    const unanswered = questions.some(q => !isAnswered(answersRef.current[q.number]))
    if (unanswered && !window.confirm(t('testbank.unanswered_warning'))) return
    await submitDuel(false)
  }

  async function handleLeave() {
    if (!inProgressRef.current) return
    inProgressRef.current = false
    setTerminated(true)
    await submitDuel(true)
  }

  async function startDuel() {
    if (!id) return
    setLoading(true)
    const { data } = await api.post<DuelDetail>(`/duels/${id}/start`, null, { params: { language: locale } })
    setDuel(data)
    setAnswers({})
    setCurIdx(0)
    inProgressRef.current = data.my_state === 'in_progress'
    setLoading(false)
  }

  async function respond(action: 'accept' | 'decline') {
    if (!id) return
    setError('')
    try {
      const { data } = await api.post(`/duels/${id}/${action}`, null, { params: { language: locale } })
      if (action === 'decline') { navigate('/student/duels'); return }
      setDuel(data)
    } catch (e: any) {
      setError(errMsg(t, e.response?.data?.detail))
    }
  }

  // Effective per-sitting deadline — never lets the 6-minute timer outlive
  // the duel's own 24h expiry if a student starts late in the window.
  useEffect(() => {
    if (duel?.my_state !== 'in_progress' || !duel.my_started_at) return
    const deadline = Math.min(
      parseServerUtc(duel.my_started_at) + duel.duration_seconds * 1000,
      parseServerUtc(duel.expires_at),
    )
    function tick() {
      const secs = Math.max(0, Math.floor((deadline - Date.now()) / 1000))
      setRemainingSec(secs)
      if (secs <= 0 && inProgressRef.current) submitDuel(false)
    }
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duel?.my_state, duel?.my_started_at])

  // Strict anti-cheat — same as Test Bank: leaving the page during the duel ends it immediately
  useEffect(() => {
    function onVisibility() { if (document.hidden) handleLeave() }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', handleLeave)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', handleLeave)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (profile?.duel_disabled) return <Navigate to="/student" replace />

  if (terminated) {
    return (
      <div className="fixed inset-0 bg-danger flex flex-col items-center justify-center z-50 text-white text-center p-8">
        <AlertTriangle className="w-14 h-14 mb-4" />
        <h2 className="text-2xl font-bold mb-2">{t('testbank.terminated_title')}</h2>
        <p className="text-base opacity-90 mb-6 max-w-sm">{t('testbank.terminated_desc')}</p>
        <button className="px-8 py-3 rounded-xl bg-white text-danger font-bold text-base hover:bg-gray-100 transition-colors" onClick={() => navigate('/student')}>
          {t('testbank.back_home')}
        </button>
      </div>
    )
  }

  if (loading || !duel) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  const opp = duel.opponent

  // ─── Declined / expired — terminal informational screens ──────────────────
  if (duel.status === 'declined' || duel.status === 'expired') {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <Swords className="w-12 h-12 mx-auto mb-4 text-muted" />
        <h1 className="font-display font-semibold text-xl text-gray-900 mb-2">
          {duel.status === 'declined' ? t('duel.status_declined') : t('duel.status_expired')}
        </h1>
        <p className="text-sm text-muted mb-8">{opp.name} {opp.surname}</p>
        <button className="btn-ghost w-full" onClick={() => navigate('/student/duels')}>{t('duel.back_to_duels')}</button>
      </div>
    )
  }

  // ─── Pending — waiting for opponent to accept, or I need to accept/decline ─
  if (duel.status === 'pending') {
    const iAmOpponent = duel.role === 'opponent'
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <Swords className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--accent, #e8622c)' }} />
        <h1 className="font-display font-semibold text-xl text-gray-900 mb-1">
          {iAmOpponent ? t('duel.challenge_from', { name: `${opp.name} ${opp.surname}` }) : t('duel.waiting_accept', { name: `${opp.name} ${opp.surname}` })}
        </h1>
        <p className="text-sm text-muted mb-6">{t('duel.rules')}</p>
        {error && <p className="text-sm text-danger mb-4">{error}</p>}
        {iAmOpponent ? (
          <div className="flex gap-3">
            <button className="flex-1 py-3 rounded-xl border text-sm font-semibold text-muted hover:bg-gray-50" onClick={() => respond('decline')}>
              {t('duel.decline')}
            </button>
            <button className="flex-[2] py-3 rounded-xl text-sm font-bold text-white" style={{ background: 'var(--accent, #e8622c)' }} onClick={() => respond('accept')}>
              {t('duel.accept')}
            </button>
          </div>
        ) : (
          <p className="text-sm text-muted">{t('duel.expires_at_label')}</p>
        )}
      </div>
    )
  }

  // ─── Completed — head-to-head results ──────────────────────────────────────
  if (duel.status === 'completed') {
    const myResults = duel.my_results ?? []
    const oppResults = duel.opponent_results ?? []
    const won = duel.winner === 'me'
    const tie = duel.winner === 'tie'
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div
          className="rounded-2xl px-5 py-5 mb-6 text-center"
          style={{
            background: won ? '#e7f2ec' : tie ? '#fdf1d6' : '#fef2f2',
            border: `1px solid ${won ? '#b8dfca' : tie ? '#f5d980' : '#fca5a5'}`,
          }}
        >
          {won && <Trophy className="w-8 h-8 mx-auto mb-2" style={{ color: '#2a7d5f' }} />}
          <h1 className="font-display font-semibold text-xl mb-1" style={{ color: won ? '#2a7d5f' : tie ? '#9a6f0a' : '#dc2626' }}>
            {won ? t('duel.you_won') : tie ? t('duel.tie') : t('duel.you_lost')}
          </h1>
          <div className="flex items-center justify-center gap-6 mt-3">
            <div className="text-center">
              <Avatar name={profile?.name ?? ''} surname={profile?.surname ?? ''} size="sm" isMe
                      borderColor={profile?.equipped_border_color} icon={profile?.equipped_avatar_icon} />
              <p className="text-lg font-display font-semibold text-gray-900 mt-1">{duel.my_score}</p>
            </div>
            <span className="text-muted text-sm">{t('duel.vs')}</span>
            <div className="text-center">
              <Avatar name={opp.name} surname={opp.surname} size="sm"
                      borderColor={opp.equipped_border_color} icon={opp.equipped_avatar_icon} />
              <p className="text-lg font-display font-semibold text-gray-900 mt-1">{duel.opponent_score}</p>
            </div>
          </div>
          {duel.my_points_earned != null && (
            <p className="text-sm mt-3 text-gray-700">{t('duel.points_earned', { n: duel.my_points_earned })}</p>
          )}
        </div>

        <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-2">{t('duel.your_answers')}</h2>
        <div className="space-y-3 mb-6">
          {myResults.map(r => (
            <div key={r.number} className="bg-surface rounded-2xl border p-4" style={{ borderColor: r.is_correct ? '#b8dfca' : '#fca5a5' }}>
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-gray-900 flex-1"><LatexText text={r.question} /></p>
                {r.is_correct
                  ? <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
                  : <XCircle className="w-4 h-4 text-danger flex-shrink-0" />}
              </div>
            </div>
          ))}
        </div>

        <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-2">
          {t('duel.opponent_answers', { name: opp.name })}
        </h2>
        <div className="space-y-3">
          {oppResults.map(r => (
            <div key={r.number} className="bg-surface rounded-2xl border p-4" style={{ borderColor: r.is_correct ? '#b8dfca' : '#fca5a5' }}>
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-gray-900 flex-1"><LatexText text={r.question} /></p>
                {r.is_correct
                  ? <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
                  : <XCircle className="w-4 h-4 text-danger flex-shrink-0" />}
              </div>
            </div>
          ))}
        </div>

        <button className="btn-ghost w-full mt-6" onClick={() => navigate('/student/duels')}>{t('duel.back_to_duels')}</button>
      </div>
    )
  }

  // ─── Active, but I haven't started yet ─────────────────────────────────────
  if (duel.my_state === 'not_started') {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <Swords className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--accent, #e8622c)' }} />
        <h1 className="font-display font-semibold text-2xl text-gray-900 mb-2">{t('duel.vs_name', { name: `${opp.name} ${opp.surname}` })}</h1>
        <div
          className="rounded-2xl px-4 py-3 mb-6 text-sm text-left flex items-start gap-2"
          style={{ background: '#fdf1d6', border: '1px solid #f5d980', color: '#7a5a08' }}
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{t('duel.rules')}</span>
        </div>
        <button className="btn-primary px-8 py-3" onClick={startDuel}>{t('duel.start')}</button>
      </div>
    )
  }

  // ─── Active, submitted, waiting for opponent ───────────────────────────────
  if (duel.my_state === 'submitted') {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <Clock className="w-12 h-12 mx-auto mb-4 text-muted animate-pulse" />
        <h1 className="font-display font-semibold text-xl text-gray-900 mb-2">{t('duel.waiting_for_opponent', { name: opp.name })}</h1>
        <p className="text-sm text-muted">{t('duel.your_score_so_far', { n: duel.my_score ?? 0, total: duel.total })}</p>
      </div>
    )
  }

  // ─── In progress ────────────────────────────────────────────────────────────
  const q = questions[curIdx]
  if (!q) return null
  const isOpen = q.problem_type === 'open'
  const a = answers[q.number] ?? {}

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-display font-semibold text-lg text-gray-900 flex items-center gap-1.5">
          <Swords className="w-4 h-4" /> {opp.name}
        </h1>
        <div
          className="px-3 py-1.5 rounded-2xl text-sm font-display font-semibold"
          style={{
            background: remainingSec < 30 ? '#fef2f2' : '#fdf1d6',
            border: `1px solid ${remainingSec < 30 ? '#fca5a5' : '#f5d980'}`,
            color: remainingSec < 30 ? '#dc2626' : '#9a6f0a',
          }}
        >
          ⏱ {fmtTime(remainingSec)}
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap mb-5">
        {questions.map((qq, i) => {
          const answered = isAnswered(answers[qq.number])
          const isCur = i === curIdx
          return (
            <button
              key={qq.number}
              onClick={() => setCurIdx(i)}
              className="w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center transition-all"
              style={{
                background: isCur ? 'var(--accent, #e8622c)' : answered ? '#fdf1d6' : '#f0e5d4',
                color: isCur ? '#fff' : answered ? '#9a6f0a' : '#8a8072',
                border: `2px solid ${isCur ? 'var(--accent, #e8622c)' : '#f0e5d4'}`,
              }}
            >
              {i + 1}
            </button>
          )
        })}
      </div>

      <div className="bg-surface rounded-2xl border p-5 mb-4" style={{ borderColor: '#f0e5d4' }}>
        <span className="text-xs font-semibold text-muted">{curIdx + 1}/{questions.length}</span>
        <p className="text-base font-medium text-gray-900 leading-relaxed mt-1">
          <LatexText text={q.question} />
        </p>
        {q.image_url && <img src={q.image_url} alt="" className="mt-3 rounded-xl max-w-full max-h-60 object-contain" />}
      </div>

      {!isOpen ? (
        <div className="space-y-2 mb-6">
          {q.options.map((opt, i) => {
            const selected = a.selected_options?.[0] === i
            return (
              <button
                key={i}
                onClick={() => setAnswer(q.number, { selected_options: [i] })}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium text-left transition-all"
                style={{
                  background: selected ? '#fff5f0' : '#fff',
                  borderColor: selected ? 'var(--accent, #e8622c)' : '#f0e5d4',
                  color: selected ? 'var(--accent, #e8622c)' : '#374151',
                }}
              >
                <span
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: selected ? 'var(--accent, #e8622c)' : '#f0e5d4', color: selected ? '#fff' : '#8a8072' }}
                >
                  {['A', 'B', 'C', 'D', 'E', 'F'][i]}
                </span>
                <LatexText text={opt} />
              </button>
            )
          })}
        </div>
      ) : (
        <div className="mb-6">
          <input
            type="text" inputMode="decimal" className="input w-full"
            placeholder={t('testbank.enter_answer')}
            value={a.open_answer_given ?? ''}
            onChange={e => setAnswer(q.number, { open_answer_given: e.target.value })}
          />
        </div>
      )}

      <div className="flex gap-3">
        <button
          className="flex-1 py-3 rounded-xl border text-sm font-semibold text-muted hover:bg-gray-50 transition-colors disabled:opacity-40"
          style={{ borderColor: '#f0e5d4' }}
          disabled={curIdx === 0}
          onClick={() => setCurIdx(i => i - 1)}
        >
          ←
        </button>
        {curIdx < questions.length - 1 ? (
          <button className="flex-[3] py-3 rounded-xl text-sm font-bold text-white transition-all" style={{ background: 'var(--accent, #e8622c)' }} onClick={() => setCurIdx(i => i + 1)}>
            →
          </button>
        ) : (
          <button
            className="flex-[3] py-3 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50"
            style={{ background: 'var(--accent, #e8622c)' }}
            disabled={submitting}
            onClick={handleManualSubmit}
          >
            {submitting ? t('testbank.submitting') : t('duel.submit')}
          </button>
        )}
      </div>
    </div>
  )
}
