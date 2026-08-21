import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import api from '@/api/client'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { Problem, ProblemAttempt } from '@/types'
import LatexText from '@/components/LatexText'
import { ChevronLeft, Lock, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'

// ─── Per-question state ───────────────────────────────────────────────────────

type QStatus = 'idle' | 'correct' | 'wrong' | 'skipped'

interface QState {
  picked:       number[]   // MCQ selected option indices
  open:         string     // open-answer text
  status:       QStatus
  hintOpen:     boolean    // student manually clicked Show Hint
  cheatFlagged: boolean    // window left while this was the active unanswered question
  earned:       number     // 0 or 1
  attempts:     number     // wrong submission count
}

const fresh = (): QState => ({
  picked: [], open: '', status: 'idle', hintOpen: false,
  cheatFlagged: false, earned: 0, attempts: 0,
})

// ─── Component ────────────────────────────────────────────────────────────────

export default function StudentTest() {
  const { id }    = useParams<{ id: string }>()
  const navigate  = useNavigate()
  const location  = useLocation()
  const { t }     = useI18n()
  const { refreshProfile } = useAuth()

  const state       = (location.state as any) ?? {}
  const lessonTitle = state.lessonTitle as string | undefined

  const [problems,  setProblems]  = useState<Problem[]>([])
  const [loading,   setLoading]   = useState(true)
  const [qStates,   setQStates]   = useState<Record<string, QState>>({})
  const [activeLevel, setActiveLevel] = useState<string>('')
  const [curIdx,    setCurIdx]    = useState(0)
  const [submitting,setSubmitting]= useState(false)
  const [cheatBanner, setCheatBanner] = useState(false)
  // Tracks which levels have been unlocked (monotonically grows, never shrinks)
  const [unlockedLevels, setUnlockedLevels] = useState<Set<string>>(new Set())

  // Stable ref to qStates to avoid stale closures in event handlers
  const qStatesRef = useRef(qStates)
  useEffect(() => { qStatesRef.current = qStates }, [qStates])

  // Persist unlocked levels to sessionStorage so they survive navigation away and back
  useEffect(() => {
    if (id && unlockedLevels.size > 0) {
      sessionStorage.setItem(`edu-unlocked-${id}`, JSON.stringify([...unlockedLevels]))
    }
  }, [unlockedLevels, id])

  // ─── Load ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setCurIdx(0)
    setCheatBanner(false)

    Promise.all([
      api.get<Problem[]>(`/problems/lesson/${id}`),
      api.get<ProblemAttempt[]>(`/problems/attempts/best/${id}`),
    ]).then(([pRes, aRes]) => {
      const pub = pRes.data.filter(p => p.is_published)
      setProblems(pub)

      const bestMap: Record<string, ProblemAttempt> = {}
      aRes.data.forEach(a => { bestMap[a.problem_id] = a })

      const init: Record<string, QState> = {}
      pub.forEach(p => {
        const best = bestMap[p.id]
        if (best?.is_correct) {
          init[p.id] = {
            picked: best.selected_options ?? [],
            open: best.open_answer_given ?? '',
            status: 'correct',
            hintOpen: false,
            cheatFlagged: false,
            earned: best.points_earned > 0 ? 1 : 0,
            attempts: 0,
          }
        } else if (best?.is_skip) {
          init[p.id] = { ...fresh(), status: 'skipped' }
        } else if (best) {
          init[p.id] = { ...fresh(), status: 'wrong', attempts: 1 }
        } else {
          init[p.id] = fresh()
        }
      })
      setQStates(init)

      // Compute levels
      const levels = [...new Set(pub.map(p => p.level ?? ''))].sort()
      const first = levels[0] ?? ''
      setActiveLevel(first)

      // Unlock levels based on prior attempts
      const groups: Record<string, Problem[]> = {}
      pub.forEach(p => {
        const lvl = p.level ?? ''
        if (!groups[lvl]) groups[lvl] = []
        groups[lvl].push(p)
      })

      const unlocked = new Set<string>([first])
      for (let i = 1; i < levels.length; i++) {
        const prev = levels[i - 1]
        const prevProblems = groups[prev] ?? []
        // Unlock the next level only once at least 70% (7/10) of the previous
        // level's problems have been answered correctly — however many
        // attempts that took.
        const correctCount = prevProblems.filter(p => bestMap[p.id]?.is_correct).length
        if (prevProblems.length > 0 && correctCount >= Math.ceil(prevProblems.length * 0.7)) {
          unlocked.add(levels[i])
        } else {
          break
        }
      }
      // Restore any levels unlocked in this browser session (survives navigation)
      const stored = sessionStorage.getItem(`edu-unlocked-${id}`)
      if (stored) {
        try { JSON.parse(stored).forEach((lv: string) => unlocked.add(lv)) } catch { /* ignore */ }
      }
      setUnlockedLevels(unlocked)

      setLoading(false)
    })
  }, [id])

  // ─── Derived ─────────────────────────────────────────────────────────────

  const levelOrder = useMemo(
    () => [...new Set(problems.map(p => p.level ?? ''))].sort(),
    [problems],
  )

  const levelGroups = useMemo(() => {
    const groups: Record<string, Problem[]> = {}
    problems.forEach(p => {
      const lvl = p.level ?? ''
      if (!groups[lvl]) groups[lvl] = []
      groups[lvl].push(p)
    })
    return groups
  }, [problems])

  const showLevelTabs = levelOrder.length > 1

  const curLevelProblems = levelGroups[activeLevel] ?? []
  const problem = curLevelProblems[curIdx] ?? null
  const qs      = problem ? (qStates[problem.id] ?? fresh()) : null

  // ─── Check level unlock after state change ────────────────────────────────

  function checkLevelUnlock(updated: Record<string, QState>) {
    const newUnlocked = new Set(unlockedLevels)
    for (let i = 1; i < levelOrder.length; i++) {
      const prev = levelOrder[i - 1]
      const next = levelOrder[i]
      if (newUnlocked.has(next)) continue
      const prevProblems = levelGroups[prev] ?? []
      // Unlock the next level only once at least 70% (7/10) of the previous
      // level's problems have been answered correctly — however many
      // attempts that took, not merely "attempted".
      const correctCount = prevProblems.filter(p => updated[p.id]?.status === 'correct').length
      if (prevProblems.length > 0 && correctCount >= Math.ceil(prevProblems.length * 0.7)) {
        newUnlocked.add(next)
      }
    }
    if (newUnlocked.size !== unlockedLevels.size) setUnlockedLevels(newUnlocked)
  }

  // ─── Anti-cheat ───────────────────────────────────────────────────────────

  const currentProblemId = problem?.id

  useEffect(() => {
    function handleHide() {
      if (!currentProblemId) return
      const q = qStatesRef.current[currentProblemId] ?? fresh()
      // Only flag if the question is completely fresh (never submitted)
      if (q.status === 'idle' && q.attempts === 0 && !q.cheatFlagged) {
        setQStates(prev => ({
          ...prev,
          [currentProblemId]: { ...prev[currentProblemId], cheatFlagged: true },
        }))
        setCheatBanner(true)
      }
    }

    function handleShow() {
      // Student returned — auto-dismiss the banner after 3 seconds
      setTimeout(() => setCheatBanner(false), 3000)
    }

    function handleVisibility() {
      document.hidden ? handleHide() : handleShow()
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('blur', handleHide)
    window.addEventListener('focus', handleShow)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('blur', handleHide)
      window.removeEventListener('focus', handleShow)
    }
  }, [currentProblemId])

  // ─── Helpers ─────────────────────────────────────────────────────────────

  function patch(pid: string, update: Partial<QState>) {
    setQStates(prev => {
      const next = { ...prev, [pid]: { ...(prev[pid] ?? fresh()), ...update } }
      checkLevelUnlock(next)
      return next
    })
  }

  function toggleOption(i: number) {
    if (!problem || !qs || qs.status === 'correct') return
    const multi = (problem.correct_options?.length ?? 0) > 1
    const next  = multi
      ? qs.picked.includes(i) ? qs.picked.filter(x => x !== i) : [...qs.picked, i]
      : [i]
    patch(problem.id, { picked: next })
  }

  function handleSkip() {
    if (!problem || !qs || qs.status === 'correct') return
    patch(problem.id, { status: 'skipped' })
    // Persist the skip so it survives a reload and counts toward level/lesson
    // completion the same way a real attempt does (fire-and-forget: the UI
    // already reflects the skip immediately regardless of network timing).
    api.post('/problems/skip', { problem_id: problem.id }).catch(() => {})
    // Advance to next unanswered question in this level
    const next = curLevelProblems.findIndex(
      (p, i) => i > curIdx && (qStates[p.id]?.status ?? 'idle') === 'idle',
    )
    if (next >= 0) setCurIdx(next)
  }

  function handleShowHint() {
    if (!problem || !qs || qs.hintOpen) return
    patch(problem.id, { hintOpen: true })
  }

  function handleTryAgain() {
    if (!problem) return
    patch(problem.id, {
      picked: [], open: '', status: 'idle', hintOpen: false,
      cheatFlagged: false, attempts: 0, earned: 0,
    })
  }

  async function handleSubmit() {
    if (!problem || !qs || qs.status === 'correct') return
    const isOpen = problem.problem_type === 'open'
    if (isOpen  && !qs.open.trim())       return
    if (!isOpen && qs.picked.length === 0) return

    // Points go to 0 if: already wrong before, hint open, or cheat flagged
    const isRetry      = qs.attempts > 0
    const givesNoPoint = isRetry || qs.hintOpen || qs.cheatFlagged
    const hintsUsed    = givesNoPoint ? 1 : 0

    setSubmitting(true)
    try {
      const res = await api.post<ProblemAttempt>('/problems/attempt', {
        problem_id:        problem.id,
        selected_options:  isOpen ? [] : qs.picked,
        open_answer_given: isOpen ? qs.open.trim() : null,
        hints_used:        hintsUsed,
      })

      if (res.data.is_correct) {
        const earned = res.data.points_earned  // backend now returns 0 or 1
        patch(problem.id, { status: 'correct', earned })
        if (earned > 0) await refreshProfile()
      } else {
        patch(problem.id, { status: 'wrong', attempts: qs.attempts + 1 })
      }
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (problems.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-muted font-medium">{t('test.no_problems')}</p>
        <button className="mt-4 text-sm text-primary font-semibold" onClick={() => navigate(-1)}>
          {t('topics.back_to_topics')}
        </button>
      </div>
    )
  }

  if (!problem || !qs) return null

  const isOpen      = problem.problem_type === 'open'
  const multi       = !isOpen && (problem.correct_options?.length ?? 0) > 1
  const canSubmit   = isOpen ? qs.open.trim().length > 0 : qs.picked.length > 0
  const correctOpts = problem.correct_options?.length ? problem.correct_options : [problem.correct_option]

  function levelTabStyle(level: string) {
    const isActive   = level === activeLevel
    const isUnlocked = unlockedLevels.has(level)
    const levelProbs = levelGroups[level] ?? []
    const isDone     = levelProbs.length > 0 && levelProbs.every(p => qStates[p.id]?.status === 'correct')
    const isAttempted = levelProbs.length > 0 && levelProbs.every(p => (qStates[p.id]?.status ?? 'idle') !== 'idle')

    if (!isUnlocked) {
      return {
        bg:    '#f5f5f5',
        color: '#9ca3af',
        border: '#e5e7eb',
        cursor: 'not-allowed' as const,
      }
    }
    if (isActive) {
      return { bg: '#e8622c', color: '#fff', border: '#e8622c', cursor: 'pointer' as const }
    }
    if (isDone) {
      return { bg: '#e7f2ec', color: '#2a7d5f', border: '#b8dfca', cursor: 'pointer' as const }
    }
    if (isAttempted) {
      return { bg: '#fdf1d6', color: '#d99a10', border: '#f5d980', cursor: 'pointer' as const }
    }
    return { bg: '#fff', color: '#6b7280', border: '#f0e5d4', cursor: 'pointer' as const }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">

      {/* ── Cheat warning ───────────────────────────────────────────────────── */}
      {cheatBanner && (
        <div
          className="rounded-2xl px-4 py-3 mb-4 flex items-start gap-3"
          style={{ background: '#fef9ec', border: '1.5px solid #f5d980' }}
        >
          <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
          <p className="text-sm font-medium text-gray-800 flex-1">{t('test.cheat_warning')}</p>
          <button
            className="text-xs font-semibold text-muted hover:text-gray-700 flex-shrink-0"
            onClick={() => setCheatBanner(false)}
          >
            {t('test.cheat_dismiss')}
          </button>
        </div>
      )}

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5">
        <button
          className="flex items-center gap-1 text-sm text-muted hover:text-primary transition-colors font-medium"
          onClick={() => navigate(-1)}
        >
          <ChevronLeft className="w-4 h-4" />
          {t('topics.back_to_topics')}
        </button>
      </div>

      {lessonTitle && (
        <h1 className="font-display font-semibold text-xl text-gray-900 mb-4">{lessonTitle}</h1>
      )}

      {/* ── Level tabs ──────────────────────────────────────────────────────── */}
      {showLevelTabs && (
        <div className="flex gap-2 mb-5 flex-wrap">
          {levelOrder.map(level => {
            const style  = levelTabStyle(level)
            const isUnlocked = unlockedLevels.has(level)
            const levelProbs = levelGroups[level] ?? []
            const isDone = levelProbs.every(p => qStates[p.id]?.status === 'correct')
            return (
              <button
                key={level}
                disabled={!isUnlocked}
                onClick={() => { setActiveLevel(level); setCurIdx(0) }}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-bold border transition-all"
                style={{
                  background: style.bg,
                  color:      style.color,
                  borderColor: style.border,
                  cursor:     style.cursor,
                  opacity:    isUnlocked ? 1 : 0.6,
                }}
              >
                {!isUnlocked && <Lock className="w-3 h-3" />}
                {isDone && isUnlocked && <CheckCircle2 className="w-3.5 h-3.5" />}
                {level}
              </button>
            )
          })}
        </div>
      )}

      {/* ── Navigator dots ──────────────────────────────────────────────────── */}
      <div className="flex gap-1.5 flex-wrap mb-5">
        {curLevelProblems.map((p, i) => {
          const q     = qStates[p.id] ?? fresh()
          const isCur = i === curIdx
          let bg = '#f0e5d4', fg = '#8a8072', border = '#f0e5d4'
          if (q.status === 'correct')   { bg = '#2a7d5f'; fg = '#fff'; border = '#2a7d5f' }
          else if (q.status === 'wrong')   { bg = '#fef2f2'; fg = '#dc2626'; border = '#fca5a5' }
          else if (q.status === 'skipped') { bg = '#f3f4f6'; fg = '#9ca3af'; border = '#d1d5db' }
          if (isCur) { border = '#e8622c' }
          return (
            <button
              key={p.id}
              onClick={() => setCurIdx(i)}
              className="w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center transition-all"
              style={{
                background: isCur ? '#e8622c' : bg,
                color:      isCur ? '#fff'    : fg,
                border:     `2px solid ${border}`,
              }}
            >
              {q.status === 'correct' ? '✓' : q.status === 'skipped' ? '—' : i + 1}
            </button>
          )
        })}
      </div>

      {/* ── Question card ────────────────────────────────────────────────────── */}
      <div
        className="bg-surface rounded-2xl border p-5 mb-4"
        style={{
          borderColor:
            qs.status === 'correct' ? '#b8dfca'
            : qs.status === 'wrong' ? '#fca5a5'
            : '#f0e5d4',
        }}
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <span className="text-xs font-semibold text-muted">
            {showLevelTabs ? `${activeLevel} · ` : ''}{curIdx + 1}/{curLevelProblems.length}
          </span>
          {qs.cheatFlagged && !qs.status.startsWith('correct') && (
            <span className="text-xs font-bold text-warning flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {t('topics.no_points_badge')}
            </span>
          )}
        </div>
        <p className="text-base font-medium text-gray-900 leading-relaxed">
          <LatexText text={problem.question} />
        </p>
        {problem.image_url && (
          <img
            src={problem.image_url}
            alt={t('pod.img_alt')}
            className="mt-3 rounded-xl max-w-full max-h-60 object-contain"
          />
        )}
      </div>

      {/* ── MCQ options ──────────────────────────────────────────────────────── */}
      {!isOpen && (
        <div className="space-y-2 mb-4">
          {(problem.options ?? []).map((opt, i) => {
            const isCorrectOpt = correctOpts.includes(i)
            const isSelected   = qs.picked.includes(i)
            const revealed     = qs.status !== 'idle'

            let bg = '#fff', borderColor = '#f0e5d4', textColor = '#374151'
            if (revealed && isCorrectOpt && qs.status === 'correct') {
              bg = '#e7f2ec'; borderColor = '#b8dfca'; textColor = '#2a7d5f'
            } else if (revealed && isSelected && qs.status === 'wrong') {
              bg = '#fef2f2'; borderColor = '#fca5a5'; textColor = '#dc2626'
            } else if (!revealed && isSelected) {
              bg = '#fff5f0'; borderColor = '#e8622c'; textColor = '#e8622c'
            }

            return (
              <button
                key={i}
                onClick={() => qs.status !== 'correct' && toggleOption(i)}
                disabled={qs.status === 'correct'}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium text-left transition-all disabled:cursor-default"
                style={{ background: bg, borderColor, color: textColor }}
              >
                <span
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{
                    background: isSelected && qs.status !== 'correct' ? '#e8622c' : '#f0e5d4',
                    color:      isSelected && qs.status !== 'correct' ? '#fff'    : '#8a8072',
                  }}
                >
                  {['A','B','C','D','E','F'][i]}
                </span>
                <LatexText text={opt} />
              </button>
            )
          })}
          {multi && qs.status !== 'correct' && (
            <p className="text-xs text-muted pl-1">{t('topics.select_all')}</p>
          )}
        </div>
      )}

      {/* ── Open answer ──────────────────────────────────────────────────────── */}
      {isOpen && (
        <div className="mb-4">
          <input
            type="text"
            inputMode="decimal"
            className="input w-full"
            placeholder={t('test.enter_answer')}
            value={qs.open}
            onChange={e => qs.status !== 'correct' && patch(problem.id, { open: e.target.value })}
            disabled={qs.status === 'correct'}
            onKeyDown={e => e.key === 'Enter' && qs.status !== 'correct' && handleSubmit()}
            style={
              qs.status === 'correct' ? { borderColor: '#b8dfca', background: '#e7f2ec' }
              : qs.status === 'wrong' ? { borderColor: '#fca5a5' }
              : {}
            }
          />
        </div>
      )}

      {/* ── Result feedback ──────────────────────────────────────────────────── */}
      {qs.status === 'correct' && (
        <div
          className="rounded-2xl px-4 py-3 mb-4 flex items-center justify-between gap-3"
          style={{ background: '#e7f2ec', border: '1px solid #b8dfca' }}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
            <span className="text-sm font-semibold text-success">
              {qs.earned > 0 ? t('test.correct_first') : t('test.correct_nopt')}
            </span>
          </div>
          <button
            className="text-xs text-muted hover:text-gray-700 font-medium"
            onClick={handleTryAgain}
          >
            {t('test.try_again')}
          </button>
        </div>
      )}

      {qs.status === 'wrong' && (
        <div
          className="rounded-2xl px-4 py-3 mb-4 flex items-center gap-2"
          style={{ background: '#fef2f2', border: '1px solid #fca5a5' }}
        >
          <XCircle className="w-4 h-4 text-danger flex-shrink-0" />
          <span className="text-sm font-semibold text-danger">{t('test.incorrect')}</span>
        </div>
      )}

      {qs.status === 'skipped' && (
        <div
          className="rounded-2xl px-4 py-3 mb-4 text-sm font-medium text-muted text-center"
          style={{ background: '#f3f4f6', border: '1px solid #d1d5db' }}
        >
          {t('test.skipped')}
        </div>
      )}

      {/* ── Hint section ─────────────────────────────────────────────────────── */}
      {qs.status !== 'correct' && (
        <div className="mb-4">
          {!qs.hintOpen && qs.status === 'wrong' && problem.hint1 && (
            <button
              onClick={handleShowHint}
              className="w-full py-2.5 rounded-xl border text-sm font-semibold transition-all hover:bg-yellow-50"
              style={{ borderColor: '#f5d980', color: '#d99a10', background: '#fff' }}
            >
              {t('test.show_hint')}
            </button>
          )}
          {qs.hintOpen && problem.hint1 && (
            <div
              className="rounded-xl px-4 py-3"
              style={{ background: '#fdf1d6', border: '1px solid #f5d980' }}
            >
              <p className="text-xs font-bold text-warning mb-1">{t('lesson.hint')}</p>
              <p className="text-sm text-gray-800">{problem.hint1}</p>
              <p className="text-xs text-muted mt-2">{t('test.hint_warning')}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Action buttons ───────────────────────────────────────────────────── */}
      {qs.status !== 'correct' && (
        <div className="flex gap-3">
          <button
            onClick={handleSkip}
            className="flex-1 py-3 rounded-xl border text-sm font-semibold text-muted hover:bg-gray-50 transition-colors"
            style={{ borderColor: '#f0e5d4' }}
          >
            {t('test.skip')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="flex-2 flex-grow-[2] py-3 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40"
            style={{ background: '#e8622c' }}
          >
            {submitting ? t('lesson.submitting') : t('test.submit')}
          </button>
        </div>
      )}

      {qs.status === 'correct' && curIdx < curLevelProblems.length - 1 && (
        <button
          onClick={() => {
            const next = curLevelProblems.findIndex(
              (p, i) => i > curIdx && qStates[p.id]?.status !== 'correct',
            )
            setCurIdx(next >= 0 ? next : curIdx + 1)
          }}
          className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all"
          style={{ background: '#e8622c' }}
        >
          {t('lesson.next')}
        </button>
      )}

      {/* ── Footer score ─────────────────────────────────────────────────────── */}
      {(() => {
        const answered = curLevelProblems.filter(p => (qStates[p.id]?.status ?? 'idle') !== 'idle').length
        if (answered < 2) return null
        return (
          <div className="mt-4 pt-4 border-t border-border flex justify-between text-xs text-muted">
            <span>{answered}/{curLevelProblems.length} {t('topics.answered')}</span>
          </div>
        )
      })()}
    </div>
  )
}
