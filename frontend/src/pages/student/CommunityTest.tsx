import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '@/api/client'
import { useI18n } from '@/contexts/I18nContext'
import { CommunityTestStatus, CommunityTestQuestion } from '@/types'
import LatexText from '@/components/LatexText'
import { AlertTriangle, CheckCircle2, XCircle, History } from 'lucide-react'
import { parseServerUtc } from '@/lib/dailyTimer'

type AnswerState = Record<number, number>   // question number -> selected option index

function fmtTime(totalSec: number) {
  const m = Math.floor(totalSec / 60).toString().padStart(2, '0')
  const s = (totalSec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export default function StudentCommunityTest() {
  const navigate = useNavigate()
  const { t, locale } = useI18n()

  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<CommunityTestStatus | null>(null)
  const [answers, setAnswers] = useState<AnswerState>({})
  const [curIdx, setCurIdx] = useState(0)
  const [remainingSec, setRemainingSec] = useState(0)
  const [terminated, setTerminated] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const answersRef = useRef<AnswerState>({})
  useEffect(() => { answersRef.current = answers }, [answers])
  const inProgressRef = useRef(false)
  const submittingRef = useRef(false)

  const questions: CommunityTestQuestion[] = status?.questions ?? []

  async function load() {
    setLoading(true)
    const { data } = await api.get<CommunityTestStatus>('/community-test/status', { params: { language: locale } })
    setStatus(data)
    setAnswers({})
    setCurIdx(0)
    inProgressRef.current = data.status === 'in_progress'
    setLoading(false)
  }

  useEffect(() => { load() }, [locale])

  async function submitAttempt(terminatedFlag: boolean) {
    if (submittingRef.current) return
    submittingRef.current = true
    inProgressRef.current = false
    setSubmitting(true)
    const payload: Record<string, { selected_option: number | null }> = {}
    Object.entries(answersRef.current).forEach(([num, i]) => { payload[num] = { selected_option: i } })
    try {
      const { data } = await api.post<CommunityTestStatus>(
        '/community-test/submit',
        { answers: payload, terminated: terminatedFlag },
        { params: { language: locale } },
      )
      setStatus(data)
    } finally {
      setSubmitting(false)
      submittingRef.current = false
    }
  }

  async function handleManualSubmit() {
    const unanswered = questions.some(q => answersRef.current[q.number] === undefined)
    if (unanswered && !window.confirm(t('communityTest.unanswered_warning'))) return
    await submitAttempt(false)
  }

  async function handleLeave() {
    if (!inProgressRef.current) return
    inProgressRef.current = false
    setTerminated(true)
    await submitAttempt(true)
  }

  // Countdown timer — recomputed from started_at on every mount, so a
  // refresh/close-tab never resets it; auto-submits at zero.
  useEffect(() => {
    if (status?.status !== 'in_progress' || !status.started_at || !status.time_limit_minutes) return
    const deadline = parseServerUtc(status.started_at) + status.time_limit_minutes * 60 * 1000
    function tick() {
      const secs = Math.max(0, Math.floor((deadline - Date.now()) / 1000))
      setRemainingSec(secs)
      if (secs <= 0 && inProgressRef.current) submitAttempt(false)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [status?.status, status?.started_at, status?.time_limit_minutes])

  // Strict anti-cheat: leaving the page during the attempt ends it immediately
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

  function setAnswer(number: number, optionIdx: number) {
    setAnswers(prev => ({ ...prev, [number]: optionIdx }))
  }

  async function startAttempt() {
    setLoading(true)
    const { data } = await api.post<CommunityTestStatus>('/community-test/start', null, { params: { language: locale } })
    setStatus(data)
    setAnswers({})
    setCurIdx(0)
    inProgressRef.current = data.status === 'in_progress'
    setLoading(false)
  }

  // ─── Terminated overlay ─────────────────────────────────────────────────

  if (terminated) {
    return (
      <div className="fixed inset-0 bg-danger flex flex-col items-center justify-center z-50 text-white text-center p-8">
        <AlertTriangle className="w-14 h-14 mb-4" />
        <h2 className="text-2xl font-bold mb-2">{t('communityTest.terminated_title')}</h2>
        <p className="text-base opacity-90 mb-6 max-w-sm">{t('communityTest.terminated_desc')}</p>
        <button
          className="px-8 py-3 rounded-xl bg-white text-danger font-bold text-base hover:bg-gray-100 transition-colors"
          onClick={() => navigate('/student')}
        >
          {t('communityTest.back_home')}
        </button>
      </div>
    )
  }

  if (loading || !status) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  // ─── No active test ─────────────────────────────────────────────────────

  if (status.status === 'no_active_test') {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="text-5xl mb-4">🧮</div>
        <p className="text-muted mb-6">{t('communityTest.none_active')}</p>
        <button className="btn-ghost" onClick={() => navigate('/student')}>{t('communityTest.back_home')}</button>
      </div>
    )
  }

  // ─── Not started ────────────────────────────────────────────────────────

  if (status.status === 'not_started') {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="text-5xl mb-4">🧮</div>
        <h1 className="font-display font-semibold text-2xl text-gray-900 mb-2">{status.title}</h1>
        {status.description && <p className="text-muted mb-4">{status.description}</p>}
        <div
          className="rounded-2xl px-4 py-3 mb-6 text-sm text-left flex items-start gap-2"
          style={{ background: '#fdf1d6', border: '1px solid #f5d980', color: '#7a5a08' }}
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{t('communityTest.rules', { minutes: status.time_limit_minutes ?? 60 })}</span>
        </div>
        {!!status.attempts_count && status.attempts_count > 0 && status.last_attempt && (
          <p className="text-sm font-medium text-gray-700 mb-4">
            {t('communityTest.last_attempt_summary', {
              n: status.last_attempt.attempt_number, score: status.last_attempt.score, total: status.last_attempt.total,
            })}
          </p>
        )}
        <button className="btn-primary px-8 py-3 mb-3" onClick={startAttempt}>
          {status.attempts_count && status.attempts_count > 0 ? t('communityTest.start_again') : t('communityTest.start')}
        </button>
        {!!status.attempts_count && status.attempts_count > 0 && (
          <div>
            <button
              className="text-sm font-semibold inline-flex items-center gap-1.5"
              style={{ color: 'var(--accent, #e8622c)' }}
              onClick={() => navigate('/student/community-test/history')}
            >
              <History className="w-4 h-4" /> {t('communityTest.view_past_attempts', { n: status.attempts_count })}
            </button>
          </div>
        )}
      </div>
    )
  }

  // ─── Submitted — results review (no correct answers ever shown) ─────────

  if (status.status === 'submitted') {
    const results = status.results ?? []
    const total = status.total ?? results.length
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="font-display font-semibold text-2xl text-gray-900 mb-1">{t('communityTest.your_score')}</h1>
        <div
          className="rounded-2xl px-4 py-3 mb-6 text-center font-display font-semibold text-lg"
          style={{ background: '#fdf1d6', border: '1px solid #f5d980', color: '#9a6f0a' }}
        >
          ⭐ {t('communityTest.correct_count', { correct: status.score ?? 0, total })}
        </div>
        <div className="space-y-3 mb-6">
          {results.map(r => (
            <div key={r.number} className="bg-surface rounded-2xl border p-4" style={{ borderColor: r.is_correct ? '#b8dfca' : '#fca5a5' }}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <p className="text-sm font-medium text-gray-900 flex-1"><LatexText text={r.question} /></p>
                {r.is_correct
                  ? <span className="flex items-center gap-1 text-xs font-semibold text-success flex-shrink-0"><CheckCircle2 className="w-4 h-4" />{t('communityTest.correct_badge')}</span>
                  : <span className="flex items-center gap-1 text-xs font-semibold text-danger flex-shrink-0"><XCircle className="w-4 h-4" />{t('communityTest.incorrect_badge')}</span>
                }
              </div>
              <p className="text-xs text-muted">
                {t('communityTest.your_answer_label')}{' '}
                {r.given_selected_option != null ? ['A', 'B', 'C', 'D'][r.given_selected_option] : t('communityTest.no_answer')}
              </p>
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <button className="flex-1 btn-ghost" onClick={() => navigate('/student/community-test/history')}>
            {t('communityTest.view_all_attempts')}
          </button>
          <button className="flex-1 btn-primary" onClick={startAttempt}>
            {t('communityTest.start_again')}
          </button>
        </div>
      </div>
    )
  }

  // ─── In progress ────────────────────────────────────────────────────────

  const q = questions[curIdx]
  if (!q) return null
  const selected = answers[q.number]

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-display font-semibold text-lg text-gray-900">{status.title}</h1>
        <div
          className="px-3 py-1.5 rounded-2xl text-sm font-display font-semibold"
          style={{
            background: remainingSec < 60 ? '#fef2f2' : '#fdf1d6',
            border: `1px solid ${remainingSec < 60 ? '#fca5a5' : '#f5d980'}`,
            color: remainingSec < 60 ? '#dc2626' : '#9a6f0a',
          }}
        >
          ⏱ {t('communityTest.time_left')}: {fmtTime(remainingSec)}
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap mb-5">
        {questions.map((qq, i) => {
          const answered = answers[qq.number] !== undefined
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
      </div>

      <div className="space-y-2 mb-6">
        {q.options.map((opt, i) => {
          const isSel = selected === i
          return (
            <button
              key={i}
              onClick={() => setAnswer(q.number, i)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium text-left transition-all"
              style={{
                background: isSel ? '#fff5f0' : '#fff',
                borderColor: isSel ? 'var(--accent, #e8622c)' : '#f0e5d4',
                color: isSel ? 'var(--accent, #e8622c)' : '#374151',
              }}
            >
              <span
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{ background: isSel ? 'var(--accent, #e8622c)' : '#f0e5d4', color: isSel ? '#fff' : '#8a8072' }}
              >
                {['A', 'B', 'C', 'D'][i]}
              </span>
              <LatexText text={opt} />
            </button>
          )
        })}
      </div>

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
            {submitting ? t('communityTest.submitting') : t('communityTest.submit')}
          </button>
        )}
      </div>
    </div>
  )
}
