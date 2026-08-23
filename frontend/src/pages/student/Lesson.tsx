import { useEffect, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import api from '@/api/client'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { Lesson, Problem, ProblemAttempt } from '@/types'
import LessonRenderer from '@/components/LessonRenderer'
import LatexText from '@/components/LatexText'
import { useLanguageSwitchRedirect } from '@/hooks/useLanguageSwitchRedirect'

type Phase = 'explanation' | 'problems' | 'hard_problems' | 'completed'


function Timer({ active }: { active: boolean }) {
  const { t } = useI18n()
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setSecs(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [active])
  const m = Math.floor(secs / 60).toString().padStart(2, '0')
  const s = (secs % 60).toString().padStart(2, '0')
  return (
    <span className="text-xs font-mono text-muted bg-bg border border-border px-2.5 py-1 rounded-lg">
      {t('lesson.timer')} {m}:{s}
    </span>
  )
}

export default function StudentLesson() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const topicId    = (location.state as any)?.topicId    as string | undefined
  const goBack = () => navigate(topicId ? `/student/topic/${topicId}` : '/student')
  const { refreshProfile } = useAuth()
  const { t } = useI18n()

  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [problems, setProblems] = useState<Problem[]>([])
  const [hardProblems, setHardProblems] = useState<Problem[]>([])
  // bestAttempts: last correct (or latest) attempt per problem
  const [bestAttempts, setBestAttempts] = useState<Record<string, ProblemAttempt>>({})
  const [phase, setPhase] = useState<Phase>('explanation')
  const [idx, setIdx] = useState(0)
  // MCQ selection (list of indices)
  const [selectedOpts, setSelectedOpts] = useState<number[]>([])
  // Open question answer
  const [openInput, setOpenInput] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  // wasWrong: this question has been submitted incorrectly at least once (this session or before)
  const [wasWrong, setWasWrong] = useState(false)
  const [hintOpen, setHintOpen] = useState(false)
  // showWrongFlash: brief "Incorrect" flash before the question resets for a retry
  const [showWrongFlash, setShowWrongFlash] = useState(false)
  const [cheatFlagged, setCheatFlagged] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [sessionPoints, setSessionPoints] = useState(0)
  const [isAlreadyCompleted, setIsAlreadyCompleted] = useState(false)
  // Whether this lesson has a dedicated leveled A/B/C test attached
  const [hasLeveledTest, setHasLeveledTest] = useState(false)

  // Anti-cheat state
  const [cheatDetected, setCheatDetected] = useState(false)

  const inTestPhase = phase === 'problems' || phase === 'hard_problems'

  // Anti-cheat: detect tab switch or window blur during test.
  // Shows a dismissible warning and, if the current question hasn't been
  // answered correctly yet, marks it so no point is awarded — but never
  // navigates away; the student confirms the warning and resumes right where they left off.
  useEffect(() => {
    if (!inTestPhase) return
    function handleCheat() {
      if (cheatDetected) return
      setCheatDetected(true)
      if (!confirmed) setCheatFlagged(true)
    }
    const onVisibility = () => { if (document.visibilityState === 'hidden') handleCheat() }
    const onBlur = () => handleCheat()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', onBlur)
    }
  }, [inTestPhase, cheatDetected, confirmed])

  useEffect(() => {
    if (!id) return
    setPhase('explanation'); setIdx(0); resetProblemState()
    setSessionPoints(0); setLoading(true); setCheatDetected(false)
    loadAll()
  }, [id])

  useLanguageSwitchRedirect('lesson', id, (newId) => `/student/lesson/${newId}`, location.state)

  async function loadAll() {
    const [lessonRes, problemsRes, bestRes, progressRes] = await Promise.all([
      api.get<Lesson>(`/topics/lessons/${id}`),
      api.get<Problem[]>(`/problems/lesson/${id}`),
      api.get<ProblemAttempt[]>(`/problems/attempts/best/${id}`),
      api.get<any[]>('/progress/my'),
    ])
    setLesson(lessonRes.data)
    const allProblems = problemsRes.data
    // Leveled (A/B/C) problems belong exclusively to the dedicated Test page
    // (level-gated, correct/incorrect/skipped coloring) — the lesson's own
    // embedded quiz only ever handles problems with no level assigned.
    const unleveled = allProblems.filter(p => !p.level)
    setProblems(unleveled.filter(p => !p.is_hard && p.is_published))
    setHardProblems(unleveled.filter(p => p.is_hard && p.is_published))
    setHasLeveledTest(allProblems.some(p => p.level && p.is_published))
    const map: Record<string, ProblemAttempt> = {}
    bestRes.data.forEach(a => { map[a.problem_id] = a })
    setBestAttempts(map)
    setIsAlreadyCompleted(progressRes.data.some((p: any) => p.subsubtopic_id === id && p.is_completed))
    setLoading(false)
  }

  function currentList() { return phase === 'hard_problems' ? hardProblems : problems }
  function currentProblem() { return currentList()[idx] ?? null }

  function resetProblemState() {
    setSelectedOpts([]); setOpenInput(''); setConfirmed(false)
    setWasWrong(false); setHintOpen(false); setShowWrongFlash(false); setCheatFlagged(false)
  }

  // Pre-fill state from existing best attempt
  useEffect(() => {
    const p = currentProblem()
    if (!p) return
    const attempt = bestAttempts[p.id]
    if (attempt && attempt.is_correct) {
      setConfirmed(true)
      setSelectedOpts(attempt.selected_options || [])
      setOpenInput(attempt.open_answer_given || '')
      setWasWrong(false); setHintOpen(false); setShowWrongFlash(false); setCheatFlagged(false)
    } else {
      resetProblemState()
      if (attempt) setWasWrong(true) // previously attempted (elsewhere/before) but not correct
    }
  }, [phase, idx])

  async function markComplete() {
    await api.post('/progress/complete', { subsubtopic_id: id })
    setIsAlreadyCompleted(true)
  }

  async function handleConfirm() {
    const p = currentProblem()!
    const alreadyCorrect = bestAttempts[p.id]?.is_correct
    if (alreadyCorrect) return

    if (p.problem_type === 'open' && !openInput.trim()) return
    if (p.problem_type === 'mcq' && selectedOpts.length === 0) return

    const givesNoPoint = wasWrong || hintOpen || cheatFlagged
    setSubmitting(true)
    const res = await api.post<ProblemAttempt>('/problems/attempt', {
      problem_id: p.id,
      selected_options: p.problem_type === 'mcq' ? selectedOpts : [],
      open_answer_given: p.problem_type === 'open' ? openInput.trim() : null,
      hints_used: givesNoPoint ? 1 : 0,
    })
    const attempt = res.data
    setSubmitting(false)

    if (attempt.is_correct) {
      setBestAttempts(prev => ({ ...prev, [p.id]: attempt }))
      if (attempt.points_earned > 0) {
        setSessionPoints(sp => sp + attempt.points_earned)
        await refreshProfile()
      }
      setConfirmed(true)
    } else {
      // Don't reveal the correct answer — briefly flag this attempt as wrong,
      // then reset so the student gets a clean retry (no point on retries).
      setWasWrong(true)
      setShowWrongFlash(true)
      setTimeout(() => {
        setShowWrongFlash(false)
        setSelectedOpts([])
        setOpenInput('')
      }, 1200)
    }
  }

  async function handleNext() {
    if (phase === 'explanation') {
      if (problems.length > 0) { setPhase('problems'); setIdx(0); resetProblemState() }
      else { await markComplete(); setPhase('completed') }
      return
    }
    const list = currentList()
    if (idx < list.length - 1) {
      setIdx(i => i + 1)
      resetProblemState()
      return
    }
    if (phase === 'problems') {
      if (hardProblems.length > 0) { setPhase('hard_problems'); setIdx(0); resetProblemState() }
      else { await markComplete(); setPhase('completed') }
    } else {
      await markComplete()
      setPhase('completed')
    }
  }

  function toggleMcqOption(i: number, multiCorrect: boolean) {
    if (multiCorrect) {
      setSelectedOpts(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])
    } else {
      setSelectedOpts([i])
    }
  }

  if (loading) return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>

  // Anti-cheat overlay — dismissible, resumes the same question afterward
  if (cheatDetected) {
    return (
      <div className="fixed inset-0 bg-danger flex flex-col items-center justify-center z-50 text-white text-center p-8">
        <div className="text-5xl mb-4">⚠️</div>
        <h2 className="text-2xl font-bold mb-6 max-w-sm">{t('test.cheat_warning')}</h2>
        <button
          className="px-8 py-3 rounded-xl bg-white text-danger font-bold text-base hover:bg-gray-100 transition-colors"
          onClick={() => setCheatDetected(false)}
        >
          {t('test.cheat_dismiss')}
        </button>
      </div>
    )
  }

  // Completed
  if (phase === 'completed') {
    const hadEmbeddedQuiz = problems.length > 0 || hardProblems.length > 0
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="text-6xl mb-4">🎉</div>
        <h2 className="font-display font-semibold text-2xl text-gray-900 mb-2">
          {t('lesson.complete_title')}
        </h2>
        {hadEmbeddedQuiz && (
          <p className="text-muted mb-8">
            {sessionPoints > 0 ? t('lesson.earned', { n: sessionPoints }) : t('lesson.no_new_pts')}
          </p>
        )}
        {/* Always exactly two options: go take the test (if this lesson has one), or back to topics */}
        <div className={`flex flex-col gap-3 items-center ${hadEmbeddedQuiz ? '' : 'mt-8'}`}>
          {hasLeveledTest && (
            <button
              className="btn-primary w-56"
              onClick={() => navigate(`/student/test/${id}`, { state: { lessonTitle: lesson?.title } })}
            >
              {t('lesson.go_to_test')}
            </button>
          )}
          <button className="btn-ghost w-56" onClick={goBack}>{t('lesson.back_topics')}</button>
        </div>
      </div>
    )
  }

  // Explanation
  if (phase === 'explanation') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <button className="text-sm text-primary font-medium mb-4" onClick={goBack}>{t('lesson.back')}</button>
        <h1 className="font-display font-semibold text-xl text-gray-900 mb-2">{lesson?.title}</h1>
        <span className="badge bg-primary-light text-primary mb-4 inline-block">{t('lesson.explanation')}</span>

        {isAlreadyCompleted && (
          <div className="bg-success-light border border-green-200 rounded-xl px-3 py-2.5 text-sm text-success mb-4 font-semibold">
            ✓ {t('lesson.already_done')}
          </div>
        )}

        <div className="card mt-2">
          {lesson?.content_blocks && lesson.content_blocks.length > 0
            ? <LessonRenderer blocks={lesson.content_blocks} />
            : <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{lesson?.explanation}</p>
          }
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <button className="btn-primary" onClick={handleNext}>
            {problems.length > 0
              ? `${isAlreadyCompleted ? t('lesson.review_problems') : t('lesson.start_problems')} (${problems.length}) →`
              : t('lesson.mark_done')}
          </button>
          {isAlreadyCompleted && (
            <button className="btn-ghost" onClick={() => navigate('/student')}>{t('lesson.back_topics')}</button>
          )}
        </div>
      </div>
    )
  }

  // Problem phase
  const problem = currentProblem()
  if (!problem) return null
  const list = currentList()
  const isHard = phase === 'hard_problems'
  const bestAttempt = bestAttempts[problem.id]
  const alreadyCorrect = bestAttempt?.is_correct === true
  const maxPts = (wasWrong || hintOpen) ? 0 : 1
  const progressPct = ((idx + (confirmed ? 1 : 0)) / list.length) * 100
  const isOpen = problem.problem_type === 'open'
  // Multiple correct options = multi-select MCQ
  const multiCorrect = !isOpen && (problem.correct_options?.length ?? 0) > 1

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-3">
        <button className="text-sm text-primary font-medium" onClick={goBack}>{t('lesson.back')}</button>
        <div className="flex items-center gap-3">
          <Timer active={inTestPhase && !cheatDetected} />
          <span className="text-sm text-muted font-medium">{idx + 1} / {list.length}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-border rounded-full mb-3 overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progressPct}%` }} />
      </div>

      {/* Problem navigator */}
      <div className="flex gap-1.5 flex-wrap mb-4">
        {list.map((p, i) => {
          const a = bestAttempts[p.id]
          const isCur = i === idx
          return (
            <button
              key={p.id}
              onClick={() => { setIdx(i); resetProblemState() }}
              className={`w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center border-2 transition-colors ${
                isCur
                  ? 'border-primary bg-primary text-white'
                  : a?.is_correct
                  ? 'border-success bg-success-light text-success'
                  : a
                  ? 'border-danger bg-danger-light text-danger'
                  : 'border-border bg-surface text-gray-500 hover:border-primary hover:text-primary'
              }`}
            >
              {i + 1}
            </button>
          )
        })}
      </div>

      {isHard && (
        <span className="badge bg-warning-light text-warning mb-3 inline-block">⚡ {t('lesson.challenge')}</span>
      )}

      {!alreadyCorrect && !confirmed && (
        <p className="text-xs text-primary font-medium mb-3">
          {t('lesson.max_pts')}: {maxPts}
        </p>
      )}

      {alreadyCorrect && (
        <div className="bg-success-light border border-green-200 rounded-xl px-3 py-2.5 text-sm text-success font-semibold mb-3">
          ✓ {t('lesson.already_correct')} (+{bestAttempt.points_earned} pts)
        </div>
      )}

      {/* Question with inline LaTeX */}
      <div className="card mb-4">
        <p className="text-base font-medium text-gray-900 leading-relaxed">
          <LatexText text={problem.question} />
        </p>
        {problem.image_url && (
          <img src={problem.image_url} alt={t('pod.img_alt')} className="mt-3 rounded-lg max-w-full max-h-64 object-contain" />
        )}
      </div>

      {/* MCQ options */}
      {!isOpen && (
        <div className="space-y-2 mb-6">
          {(problem.options || []).map((opt, i) => {
            const correctOpts = problem.correct_options?.length ? problem.correct_options : [problem.correct_option]
            const isCorrectOpt = correctOpts.includes(i)
            const isSelected = selectedOpts.includes(i)

            let cls = 'w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium text-left transition-all '
            if (confirmed || alreadyCorrect) {
              // Only ever reached once the question was answered CORRECTLY — wrong
              // answers never reveal which option was right (see showWrongFlash below).
              if (isCorrectOpt) cls += 'border-success bg-success-light text-success'
              else cls += 'border-border bg-surface text-gray-700'
            } else if (showWrongFlash && isSelected) {
              cls += 'border-danger bg-danger-light text-danger'
            } else if (isSelected) {
              cls += 'border-primary bg-primary-light text-primary'
            } else {
              cls += 'border-border bg-surface text-gray-700 hover:border-primary hover:bg-primary-light cursor-pointer'
            }

            return (
              <button
                key={i}
                className={cls}
                onClick={() => !confirmed && !alreadyCorrect && !showWrongFlash && toggleMcqOption(i, multiCorrect)}
                disabled={confirmed || alreadyCorrect || showWrongFlash}
              >
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  !confirmed && !alreadyCorrect && isSelected ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'
                }`}>
                  {multiCorrect ? (isSelected ? '✓' : ['A','B','C','D','E','F'][i]) : ['A','B','C','D','E','F'][i]}
                </span>
                <LatexText text={opt} />
              </button>
            )
          })}
          {multiCorrect && !confirmed && !alreadyCorrect && (
            <p className="text-xs text-muted">{t('topics.select_all')}</p>
          )}
        </div>
      )}

      {/* Open question input */}
      {isOpen && (
        <div className="mb-6">
          <input
            type="text"
            className={`input w-full ${confirmed || alreadyCorrect ? 'bg-gray-50 cursor-not-allowed' : ''}`}
            placeholder={t('lesson.open_placeholder')}
            value={openInput}
            onChange={e => setOpenInput(e.target.value)}
            disabled={confirmed || alreadyCorrect || showWrongFlash}
            style={showWrongFlash ? { borderColor: '#fca5a5', background: '#fef2f2' } : {}}
            onKeyDown={e => e.key === 'Enter' && !confirmed && !alreadyCorrect && !showWrongFlash && handleConfirm()}
          />
        </div>
      )}

      {/* Hint — available after the first wrong attempt; regular problems only */}
      {!confirmed && !alreadyCorrect && !isHard && wasWrong && problem.hint1 && (
        <div className="mb-6">
          {!hintOpen ? (
            <button
              onClick={() => setHintOpen(true)}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm text-left transition-colors border-border bg-surface text-gray-700 hover:bg-bg cursor-pointer"
            >
              <span>💡</span> {t('lesson.hint')}
            </button>
          ) : (
            <div className="bg-warning-light border border-yellow-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-warning mb-1">{t('lesson.hint')}</p>
              <p className="text-sm text-gray-800">{problem.hint1}</p>
            </div>
          )}
        </div>
      )}

      {/* Brief "incorrect" flash — then the question resets for a clean retry */}
      {showWrongFlash && (
        <div className="rounded-2xl px-4 py-3 mb-3 text-sm font-semibold text-center bg-danger-light text-danger">
          {t('lesson.incorrect')}
        </div>
      )}

      {/* Confirm / Next buttons */}
      {!confirmed && !alreadyCorrect ? (
        <button
          className="btn-primary w-full"
          disabled={(isOpen ? !openInput.trim() : selectedOpts.length === 0) || submitting || showWrongFlash}
          onClick={handleConfirm}
        >
          {submitting ? t('lesson.submitting') : t('lesson.confirm')}
        </button>
      ) : (
        <div className="space-y-3">
          {/* Result banner — only reached once the question was answered correctly */}
          <div className="rounded-2xl px-4 py-3 text-sm font-semibold text-center bg-success-light text-success">
            {(bestAttempts[problem.id]?.points_earned ?? 0) > 0 ? t('test.correct_first') : t('test.correct_nopt')}
          </div>
          {/* Next — always available after confirmation */}
          <button className="btn-primary w-full" onClick={handleNext}>{t('lesson.next')}</button>
        </div>
      )}
    </div>
  )
}
