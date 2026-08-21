import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '@/api/client'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { PodStatusOut, PodAttempt } from '@/types'
import LatexText from '@/components/LatexText'
import { AlertTriangle } from 'lucide-react'
import { secondsUntilNextUtcHour, formatCountdown } from '@/lib/dailyTimer'

const POD_RESET_UTC_HOUR = 7 // 12:00 UTC+5 — must match routers/pod.py's active_from calculation

type Phase = 'loading' | 'none' | 'rules' | 'solving' | 'result' | 'locked'

export default function StudentPod() {
  const navigate = useNavigate()
  const { refreshProfile } = useAuth()
  const { t, locale } = useI18n()

  const [phase, setPhase] = useState<Phase>('loading')
  const [pod, setPod] = useState<PodStatusOut | null>(null)
  const [answer, setAnswer] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [terminated, setTerminated] = useState(false)
  const [result, setResult] = useState<PodAttempt | null>(null)
  const [timeLeft, setTimeLeft] = useState('')

  // Refs so the leave/blur listener (registered once) always sees fresh state
  const solvingRef = useRef(false)
  const podIdRef = useRef<string | null>(null)
  const forfeitedRef = useRef(false)

  async function load() {
    setPhase('loading')
    const { data } = await api.get<PodStatusOut>('/pod/today', { params: { language: locale } })
    setPod(data)
    podIdRef.current = data.pod_id ?? null
    if (data.status === 'none') setPhase('none')
    else if (data.status === 'locked') setPhase('locked')
    else setPhase('rules')
  }

  useEffect(() => { load() }, [locale])

  useEffect(() => {
    function tick() { setTimeLeft(formatCountdown(secondsUntilNextUtcHour(POD_RESET_UTC_HOUR))) }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  function startSolving() {
    solvingRef.current = true
    setPhase('solving')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!answer.trim() || !podIdRef.current || submitting) return
    solvingRef.current = false
    setSubmitting(true)
    try {
      const { data } = await api.post<PodAttempt>('/pod/attempt', { pod_id: podIdRef.current, answer })
      setResult(data)
      setPhase('result')
      if (data.points_earned > 0) await refreshProfile()
    } catch {
      // Most likely a race with the leave-triggered forfeit — treat as locked.
      setPhase('locked')
    }
    setSubmitting(false)
  }

  // Strict anti-cheat: leaving the page while solving forfeits today's problem
  // with zero points, regardless of anything typed — no partial credit, unlike
  // the Test Bank exam.
  useEffect(() => {
    function forfeit() {
      if (!solvingRef.current || forfeitedRef.current) return
      forfeitedRef.current = true
      solvingRef.current = false
      setTerminated(true)
      if (podIdRef.current) {
        api.post('/pod/attempt', { pod_id: podIdRef.current, answer: '' }).catch(() => {})
      }
    }
    function onVisibility() { if (document.hidden) forfeit() }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', forfeit)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', forfeit)
    }
  }, [])

  // ─── Terminated overlay — takes priority over everything else ────────────

  if (terminated) {
    return (
      <div className="fixed inset-0 bg-danger flex flex-col items-center justify-center z-50 text-white text-center p-8">
        <AlertTriangle className="w-14 h-14 mb-4" />
        <h2 className="text-2xl font-bold mb-2">{t('pod.terminated_title')}</h2>
        <p className="text-base opacity-90 mb-6 max-w-sm">{t('pod.terminated_desc')}</p>
        <button
          className="px-8 py-3 rounded-xl bg-white text-danger font-bold text-base hover:bg-gray-100 transition-colors"
          onClick={() => navigate('/student')}
        >
          {t('testbank.back_home')}
        </button>
      </div>
    )
  }

  if (phase === 'loading') {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal" />
      </div>
    )
  }

  // ─── No problem scheduled right now ───────────────────────────────────────

  if (phase === 'none') {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="text-5xl mb-3">☀️</div>
        <p className="font-display font-semibold text-lg text-gray-900">{t('pod.no_problem_title')}</p>
        <p className="text-sm text-muted mt-1">{t('pod.no_problem_sub')}</p>
      </div>
    )
  }

  // ─── Already answered today — no review, no re-entry ──────────────────────

  if (phase === 'locked') {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="text-5xl mb-3">✅</div>
        <p className="font-display font-semibold text-lg text-gray-900">{t('pod.already_done_today')}</p>
        <span className="badge bg-teal-light text-teal mt-3 inline-block">{t('pod.resets_in', { time: timeLeft })}</span>
      </div>
    )
  }

  // ─── Immediate post-submit receipt — correct/incorrect only, never the answer ──

  if (phase === 'result' && result) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="text-5xl mb-3">{result.is_correct ? '🎉' : '💭'}</div>
        <div
          className={`rounded-2xl px-4 py-4 text-sm font-semibold mb-4 ${result.is_correct ? 'bg-success-light text-success' : 'bg-danger-light text-danger'}`}
        >
          {result.is_correct ? t('pod.result_correct') : t('pod.result_incorrect')}
        </div>
        <button className="btn-ghost w-full" onClick={() => navigate('/student')}>
          {t('testbank.back_home')}
        </button>
      </div>
    )
  }

  // ─── Rules screen — shown before the question, mirrors the Test Bank pattern ──

  if (phase === 'rules') {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="text-5xl mb-4">📝</div>
        <h1 className="font-display font-semibold text-2xl text-gray-900 mb-2">{t('pod.header')}</h1>
        <div
          className="rounded-2xl px-4 py-3 mb-4 text-sm text-left flex items-start gap-2"
          style={{ background: '#dff0f0', border: '1px solid #a9dede', color: '#0f6b6b' }}
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{t('pod.rules')}</span>
        </div>
        <p className="text-sm font-medium text-gray-700 mb-8">{t('pod.good_luck')}</p>
        <button
          className="px-8 py-3 rounded-xl font-display font-semibold text-base text-white transition-all active:scale-95"
          style={{ background: '#178f8f', boxShadow: '0 6px 16px -6px rgba(23,143,143,0.5)' }}
          onClick={startSolving}
        >
          {t('pod.start')}
        </button>
      </div>
    )
  }

  // ─── Solving ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="font-display font-semibold text-2xl text-gray-900 mb-5">{t('pod.header')}</h1>

      <div className="card mb-5 space-y-3" style={{ boxShadow: '0 4px 16px -8px rgba(44,36,24,0.1)' }}>
        <p className="text-base font-semibold text-gray-900 leading-relaxed">
          <LatexText text={pod?.question ?? ''} />
        </p>
        {pod?.image_url && (
          <img
            src={pod.image_url}
            alt={t('pod.img_alt')}
            className="rounded-xl max-h-72 w-full object-contain border border-border"
          />
        )}
        {pod?.description && (
          <div className="pt-2 border-t border-border text-sm text-gray-700 leading-relaxed">
            <LatexText text={pod.description} />
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="label">{t('pod.your_answer')}</label>
          <input
            className="input"
            type="text"
            placeholder={t('pod.answer_placeholder')}
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            required
          />
        </div>
        <button
          type="submit"
          disabled={!answer.trim() || submitting}
          className="w-full py-3 rounded-xl font-display font-semibold text-base text-white transition-all active:scale-95 disabled:opacity-50"
          style={{ background: '#178f8f', boxShadow: '0 6px 16px -6px rgba(23,143,143,0.5)' }}
        >
          {submitting ? t('pod.submitting') : t('pod.submit')}
        </button>
      </form>
    </div>
  )
}
