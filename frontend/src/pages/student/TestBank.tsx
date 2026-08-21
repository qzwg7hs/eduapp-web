import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '@/api/client'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { ExamStatusOut, ExamQuestion } from '@/types'
import LatexText from '@/components/LatexText'
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import { parseServerUtc, secondsUntilNextUtcHour, formatCountdown } from '@/lib/dailyTimer'

const TESTBANK_RESET_UTC_HOUR = 19 // 00:00 UTC+5

type Answer = { selected_options?: number[]; open_answer_given?: string }
type AnswerState = Record<number, Answer>

function fmtTime(totalSec: number) {
  const m = Math.floor(totalSec / 60).toString().padStart(2, '0')
  const s = (totalSec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export default function StudentTestBank() {
  const navigate = useNavigate()
  const { t, locale } = useI18n()
  const { refreshProfile } = useAuth()

  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<ExamStatusOut | null>(null)
  const [answers, setAnswers] = useState<AnswerState>({})
  const [curIdx, setCurIdx] = useState(0)
  const [remainingSec, setRemainingSec] = useState(0)
  const [nextResetSec, setNextResetSec] = useState(0)
  const [terminated, setTerminated] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Refs so the leave/blur listener (registered once) always sees fresh state
  const answersRef = useRef<AnswerState>({})
  useEffect(() => { answersRef.current = answers }, [answers])
  const inProgressRef = useRef(false)
  const submittingRef = useRef(false)

  const questions: ExamQuestion[] = status?.questions ?? []

  async function load() {
    setLoading(true)
    const { data } = await api.get<ExamStatusOut>('/test-bank/today', { params: { language: locale } })
    setStatus(data)
    setAnswers({})
    setCurIdx(0)
    inProgressRef.current = data.status === 'in_progress'
    setLoading(false)
  }

  useEffect(() => { load() }, [locale])

  async function submitExam(terminatedFlag: boolean) {
    if (submittingRef.current) return
    submittingRef.current = true
    inProgressRef.current = false
    setSubmitting(true)
    const payload: Record<string, Answer> = {}
    Object.entries(answersRef.current).forEach(([num, a]) => { payload[num] = a })
    try {
      const { data } = await api.post<ExamStatusOut>('/test-bank/submit', { answers: payload, terminated: terminatedFlag })
      setStatus(data)
      await refreshProfile()
    } finally {
      setSubmitting(false)
      submittingRef.current = false
    }
  }

  async function handleManualSubmit() {
    const unanswered = questions.some(q => !isAnswered(answersRef.current[q.number]))
    if (unanswered && !window.confirm(t('testbank.unanswered_warning'))) return
    await submitExam(false)
  }

  async function handleLeave() {
    if (!inProgressRef.current) return
    inProgressRef.current = false
    setTerminated(true)
    await submitExam(true)
  }

  // Countdown timer — auto-submits (not a violation) when it hits zero
  useEffect(() => {
    if (status?.status !== 'in_progress' || !status.started_at) return
    const deadline = parseServerUtc(status.started_at) + status.duration_seconds * 1000
    function tick() {
      const secs = Math.max(0, Math.floor((deadline - Date.now()) / 1000))
      setRemainingSec(secs)
      if (secs <= 0 && inProgressRef.current) {
        submitExam(false)
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [status?.status, status?.started_at])

  // Countdown to tomorrow's exam — only relevant once today's is already used up
  useEffect(() => {
    if (status?.status !== 'submitted') return
    function tick() { setNextResetSec(secondsUntilNextUtcHour(TESTBANK_RESET_UTC_HOUR)) }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [status?.status])

  // Strict anti-cheat: leaving the page during the exam ends it immediately
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

  function isAnswered(a?: Answer) {
    if (!a) return false
    if (a.selected_options && a.selected_options.length > 0) return true
    if (a.open_answer_given && a.open_answer_given.trim()) return true
    return false
  }

  function setAnswer(number: number, a: Answer) {
    setAnswers(prev => ({ ...prev, [number]: a }))
  }

  async function startExam() {
    setLoading(true)
    const { data } = await api.post<ExamStatusOut>('/test-bank/start', null, { params: { language: locale } })
    setStatus(data)
    setAnswers({})
    setCurIdx(0)
    inProgressRef.current = data.status === 'in_progress'
    setLoading(false)
  }

  // ─── Terminated overlay — takes priority over everything else ────────────

  if (terminated) {
    return (
      <div className="fixed inset-0 bg-danger flex flex-col items-center justify-center z-50 text-white text-center p-8">
        <AlertTriangle className="w-14 h-14 mb-4" />
        <h2 className="text-2xl font-bold mb-2">{t('testbank.terminated_title')}</h2>
        <p className="text-base opacity-90 mb-6 max-w-sm">{t('testbank.terminated_desc')}</p>
        <button
          className="px-8 py-3 rounded-xl bg-white text-danger font-bold text-base hover:bg-gray-100 transition-colors"
          onClick={() => navigate('/student')}
        >
          {t('testbank.back_home')}
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

  // ─── Not started ───────────────────────────────────────────────────────────

  if (status.status === 'not_started') {
    const noQuestions = (status.total ?? 0) === 0
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="text-5xl mb-4">📝</div>
        <h1 className="font-display font-semibold text-2xl text-gray-900 mb-2">{t('testbank.title')}</h1>
        <p className="text-muted mb-4">{t('testbank.subtitle')}</p>
        <div
          className="rounded-2xl px-4 py-3 mb-4 text-sm text-left flex items-start gap-2"
          style={{ background: '#fdf1d6', border: '1px solid #f5d980', color: '#7a5a08' }}
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{t('testbank.rules')}</span>
        </div>
        <p className="text-sm font-medium text-gray-700 mb-8">{t('testbank.good_luck')}</p>
        {noQuestions ? (
          <p className="text-sm text-muted">{t('testbank.no_questions')}</p>
        ) : (
          <button className="btn-primary px-8 py-3" onClick={startExam}>
            {t('testbank.start_exam')}
          </button>
        )}
      </div>
    )
  }

  // ─── Submitted — results review ────────────────────────────────────────────

  if (status.status === 'submitted') {
    const results = status.results ?? []
    const total = status.total ?? results.length
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="font-display font-semibold text-2xl text-gray-900 mb-1">{t('testbank.your_score')}</h1>
        <p className="text-sm text-muted mb-4">⏱ {t('pod.resets_in', { time: formatCountdown(nextResetSec) })}</p>
        <div
          className="rounded-2xl px-4 py-3 mb-6 text-center font-display font-semibold text-lg"
          style={{ background: '#fdf1d6', border: '1px solid #f5d980', color: '#9a6f0a' }}
        >
          ⭐ {t('testbank.correct_count', { correct: status.score ?? 0, total })}
        </div>
        <div className="space-y-3">
          {results.map(r => (
            <div key={r.number} className="bg-surface rounded-2xl border p-4" style={{ borderColor: r.is_correct ? '#b8dfca' : '#fca5a5' }}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <p className="text-sm font-medium text-gray-900 flex-1"><LatexText text={r.question} /></p>
                {r.is_correct
                  ? <span className="flex items-center gap-1 text-xs font-semibold text-success flex-shrink-0"><CheckCircle2 className="w-4 h-4" />{t('testbank.correct_badge')}</span>
                  : <span className="flex items-center gap-1 text-xs font-semibold text-danger flex-shrink-0"><XCircle className="w-4 h-4" />{t('testbank.incorrect_badge')}</span>
                }
              </div>
              <p className="text-xs text-muted">
                {t('testbank.your_answer_label')}{' '}
                {r.given_open_answer
                  ? r.given_open_answer
                  : r.given_selected_options && r.given_selected_options.length > 0
                  ? r.given_selected_options.map(i => ['A', 'B', 'C', 'D', 'E', 'F'][i]).join(', ')
                  : t('testbank.no_answer')}
              </p>
            </div>
          ))}
        </div>
        <button className="btn-ghost w-full mt-6" onClick={() => navigate('/student')}>
          {t('testbank.back_home')}
        </button>
      </div>
    )
  }

  // ─── In progress ───────────────────────────────────────────────────────────

  const q = questions[curIdx]
  if (!q) return null
  const isOpen = q.problem_type === 'open'
  const a = answers[q.number] ?? {}

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-display font-semibold text-lg text-gray-900">{t('testbank.title')}</h1>
        <div
          className="px-3 py-1.5 rounded-2xl text-sm font-display font-semibold"
          style={{
            background: remainingSec < 60 ? '#fef2f2' : '#fdf1d6',
            border: `1px solid ${remainingSec < 60 ? '#fca5a5' : '#f5d980'}`,
            color: remainingSec < 60 ? '#dc2626' : '#9a6f0a',
          }}
        >
          ⏱ {t('testbank.time_left')}: {fmtTime(remainingSec)}
        </div>
      </div>

      {/* Navigator — answered vs unanswered only, no correctness known yet */}
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
                background: isCur ? '#e8622c' : answered ? '#fdf1d6' : '#f0e5d4',
                color: isCur ? '#fff' : answered ? '#9a6f0a' : '#8a8072',
                border: `2px solid ${isCur ? '#e8622c' : '#f0e5d4'}`,
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
        {q.image_url && (
          <img src={q.image_url} alt="" className="mt-3 rounded-xl max-w-full max-h-60 object-contain" />
        )}
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
                  borderColor: selected ? '#e8622c' : '#f0e5d4',
                  color: selected ? '#e8622c' : '#374151',
                }}
              >
                <span
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: selected ? '#e8622c' : '#f0e5d4', color: selected ? '#fff' : '#8a8072' }}
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
            type="text"
            inputMode="decimal"
            className="input w-full"
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
          <button className="flex-[3] py-3 rounded-xl text-sm font-bold text-white transition-all" style={{ background: '#e8622c' }} onClick={() => setCurIdx(i => i + 1)}>
            →
          </button>
        ) : (
          <button
            className="flex-[3] py-3 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50"
            style={{ background: '#e8622c' }}
            disabled={submitting}
            onClick={handleManualSubmit}
          >
            {submitting ? t('testbank.submitting') : t('testbank.submit_exam')}
          </button>
        )}
      </div>
    </div>
  )
}
