import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '@/api/client'
import { TopicInTree, SubTopicInTree, LessonInTree } from '@/types'
import { useI18n } from '@/contexts/I18nContext'
import {
  ChevronRight, ChevronLeft, PlayCircle, ClipboardList,
  CheckCircle2, AlertCircle, Lock,
} from 'lucide-react'

// ─── Lesson card (lesson row + test row) ──────────────────────────────────────

export function LessonCard({
  lesson,
  index,
  prevLesson,
  lessonIds,
  navigate,
  t,
}: {
  lesson:     LessonInTree
  index:      number
  prevLesson: LessonInTree | null
  lessonIds:  string[]
  navigate:   ReturnType<typeof useNavigate>
  t: (k: string, v?: Record<string, string | number>) => string
}) {
  const locked      = prevLesson !== null && !prevLesson.is_completed
  const completed   = lesson.is_completed
  const inProgress  = !completed && lesson.attempted_count > 0
  const progressPct = completed
    ? 100
    : lesson.problem_count > 0 ? (lesson.attempted_count / lesson.problem_count) * 100 : 0

  const cardStyle = locked
    ? { borderColor: '#f0e5d4' }
    : completed
    ? { borderColor: '#b8dfca', boxShadow: '0 2px 12px -6px rgba(42,125,95,0.12)' }
    : { borderColor: '#f0e5d4', boxShadow: '0 2px 12px -6px rgba(44,36,24,0.08)' }

  return (
    <div
      className={`bg-surface rounded-2xl border overflow-hidden transition-all duration-150 ${
        locked ? 'opacity-60' : completed ? '' : 'hover:shadow-md hover:border-primary/25'
      }`}
      style={cardStyle}
    >
      {/* Header */}
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {locked && <Lock className="w-4 h-4 text-muted flex-shrink-0" />}
            <h3 className={`font-display font-semibold truncate ${locked ? 'text-muted' : 'text-gray-900'}`}>
              {lesson.title}
            </h3>
          </div>
          {completed && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-success bg-success/10 px-2.5 py-0.5 rounded-full flex-shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {t('topics.completed')}
            </span>
          )}
          {inProgress && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full flex-shrink-0">
              {lesson.attempted_count}/{lesson.problem_count} · {t('topics.in_progress')}
            </span>
          )}
          {!completed && !inProgress && !locked && lesson.problem_count > 0 && (
            <span className="text-xs font-medium text-muted flex-shrink-0">
              {t('topics.not_started')}
            </span>
          )}
        </div>

        {/* Progress bar — reflects real attempted/total, not a placeholder */}
        <div className="mt-2.5 h-1.5 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${locked ? 0 : progressPct}%`,
              background: completed ? '#2a7d5f' : '#e8622c',
            }}
          />
        </div>
      </div>

      {/* Body */}
      {locked ? (
        <div className="px-5 pb-4 flex items-start gap-2 text-sm text-muted">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            {prevLesson
              ? t('topics.locked_until', { prev: prevLesson.title })
              : t('topics.locked')}
          </span>
        </div>
      ) : (
        <div className="border-t border-border">
          {/* Lesson row */}
          {lesson.has_content && (
            <>
              <button
                onClick={() =>
                  navigate(`/student/lesson/${lesson.id}`, {
                    state: { lessonIds, lessonIndex: index },
                  })
                }
                className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors group text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-primary-light flex items-center justify-center flex-shrink-0">
                  <PlayCircle className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted leading-none mb-0.5">{t('topics.lesson')}</p>
                  <p className="text-sm font-medium text-gray-800 truncate">{lesson.title}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0" />
              </button>
              {lesson.problem_count > 0 && <div className="mx-5 border-t border-border" />}
            </>
          )}

          {/* Test row */}
          {lesson.problem_count > 0 && (
            <button
              onClick={() =>
                navigate(`/student/test/${lesson.id}`, {
                  state: { lessonIds, lessonIndex: index, lessonTitle: lesson.title },
                })
              }
              className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors group text-left"
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: '#dff0f0' }}
              >
                <ClipboardList className="w-4 h-4" style={{ color: '#178f8f' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted leading-none mb-0.5">{t('topics.test')}</p>
                <p className="text-sm font-medium text-gray-800">
                  {lesson.problem_count} {t('topics.questions')}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Subtopics view ───────────────────────────────────────────────────────────

export function SubtopicsView({
  topic,
  onBack,
  navigate,
  t,
}: {
  topic:    TopicInTree
  onBack:   () => void
  navigate: ReturnType<typeof useNavigate>
  t: (k: string, v?: Record<string, string | number>) => string
}) {
  const publishedSubs = topic.subtopics.filter(s => s.is_published)

  // All lesson IDs across all subtopics for sequential prev/next navigation
  const allLessons = publishedSubs.flatMap(sub => sub.lessons.filter(l => l.is_published))
  const lessonIds  = allLessons.map(l => l.id)

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">

      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm font-medium text-muted hover:text-primary transition-colors mb-5"
      >
        <ChevronLeft className="w-4 h-4" />
        {t('topics.back_to_topics')}
      </button>

      {/* Topic title */}
      <h1 className="font-display font-bold text-2xl text-gray-900 mb-7">{topic.title}</h1>

      {publishedSubs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-4xl mb-3">📭</div>
          <p className="font-semibold text-gray-900">{t('topics.no_subtopics')}</p>
        </div>
      ) : (
        <div className="space-y-8">
          {publishedSubs.map(sub => {
            const lessons = sub.lessons.filter(l => l.is_published)
            const subDone = lessons.length > 0 && lessons.every(l => l.is_completed)
            const subStarted = lessons.some(l => l.attempted_count > 0)
            const subInProgress = !subDone && subStarted

            return (
              <div key={sub.id}>
                {/* Subtopic header — 3-state: finished (green check) / in progress (filled orange dot) / not started (empty outline) */}
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
                  {subDone
                    ? <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
                    : subInProgress
                    ? <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: '#e8622c' }} />
                    : <div className="w-4 h-4 rounded-full border-2 flex-shrink-0" style={{ borderColor: '#d1d5db' }} />
                  }
                  <h2 className="font-display font-semibold text-base text-gray-800 truncate">
                    {sub.title}
                  </h2>
                </div>

                {lessons.length === 0 ? (
                  <p className="text-sm text-muted pl-2">{t('topics.no_topics')}</p>
                ) : (
                  <div className="space-y-3">
                    {lessons.map((lesson, i) => (
                      <LessonCard
                        key={lesson.id}
                        lesson={lesson}
                        index={allLessons.indexOf(lesson)}
                        prevLesson={i > 0 ? lessons[i - 1] : null}
                        lessonIds={lessonIds}
                        navigate={navigate}
                        t={t}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Topic progress card ──────────────────────────────────────────────────────

function TopicProgressCard({
  topic,
  onClick,
  t,
}: {
  topic:   TopicInTree
  onClick: () => void
  t: (k: string, v?: Record<string, string | number>) => string
}) {
  const subs  = topic.subtopics.filter(s => s.is_published)
  const total = subs.length
  const done  = subs.filter(sub => {
    const ls = sub.lessons.filter(l => l.is_published)
    return ls.length > 0 && ls.every(l => l.is_completed)
  }).length
  const isComplete = total > 0 && done === total
  // Any real activity anywhere in the topic — even a single problem answered
  // in an otherwise-untouched lesson — so a topic isn't shown as flatly "not
  // started" just because no subtopic has been fully finished yet.
  const anyAttempted = subs.some(sub => sub.lessons.some(l => l.attempted_count > 0))
  const totalProblems    = subs.reduce((s, sub) => s + sub.lessons.reduce((s2, l) => s2 + l.problem_count, 0), 0)
  const attemptedProblems = subs.reduce((s, sub) => s + sub.lessons.reduce((s2, l) => s2 + l.attempted_count, 0), 0)
  // Sections-completed drives the bar once at least one is fully done;
  // before that, the finer per-problem ratio gives visible feedback instead
  // of a flat empty bar while the student is still partway through the
  // first lesson.
  const pct = done > 0
    ? done / total
    : totalProblems > 0 ? attemptedProblems / totalProblems : 0

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-surface rounded-2xl border p-5 transition-all hover:shadow-md group"
      style={
        isComplete
          ? { borderColor: '#b8dfca', boxShadow: '0 2px 12px -6px rgba(42,125,95,0.1)' }
          : anyAttempted
          ? { borderColor: '#f5d9c2', boxShadow: '0 2px 12px -6px rgba(232,98,44,0.08)' }
          : { borderColor: '#f0e5d4' }
      }
    >
      {/* Title row */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="font-display font-semibold text-gray-900 leading-snug group-hover:text-primary transition-colors">
          {topic.title}
        </h3>
        {isComplete
          ? <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
          : anyAttempted
          ? <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5" style={{ background: '#e8622c' }} />
          : <ChevronRight className="w-5 h-5 text-muted flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-60 transition-opacity" />
        }
      </div>

      {/* Progress */}
      <div className="mt-1">
        <div className="flex justify-between items-center text-xs text-muted mb-1.5">
          <span>
            {done}/{total} {t('topics.sections')}
          </span>
          {isComplete ? (
            <span className="font-semibold text-success">{t('topics.completed')}</span>
          ) : done > 0 ? (
            <span>{Math.round(pct * 100)}%</span>
          ) : anyAttempted ? (
            <span className="font-semibold" style={{ color: '#e8622c' }}>{t('topics.in_progress')}</span>
          ) : total > 0 ? (
            <span>{t('topics.not_started')}</span>
          ) : null}
        </div>
        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${pct * 100}%`,
              background: isComplete ? '#2a7d5f' : '#e8622c',
            }}
          />
        </div>
      </div>
    </button>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StudentTopics() {
  const { t, locale } = useI18n()
  const navigate = useNavigate()

  const [treeData,    setTreeData]    = useState<TopicInTree[]>([])
  const [activeTopic, setActiveTopic] = useState<TopicInTree | null>(null)
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get<TopicInTree[]>('/topics/tree', { params: { language: locale } }).then(r => {
      const published = r.data.filter(tp => tp.is_published)
      setTreeData(published)

      // Restore the last-viewed topic so the student returns to the subtopics
      // view after navigating to a lesson and pressing back.
      const savedId = sessionStorage.getItem('edu-active-topic')
      if (savedId) {
        const found = published.find(tp => tp.id === savedId)
        if (found) setActiveTopic(found)
      }

      setLoading(false)
    })
  }, [locale])

  // Keep sessionStorage in sync with activeTopic
  useEffect(() => {
    if (activeTopic) {
      sessionStorage.setItem('edu-active-topic', activeTopic.id)
    } else {
      sessionStorage.removeItem('edu-active-topic')
    }
  }, [activeTopic])

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (treeData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-4">
        <div className="text-4xl mb-3">📭</div>
        <p className="font-semibold text-gray-900 text-lg">{t('topics.no_subtopics')}</p>
      </div>
    )
  }

  // ── Subtopics view ──────────────────────────────────────────────────────────
  if (activeTopic) {
    return (
      <SubtopicsView
        topic={activeTopic}
        onBack={() => setActiveTopic(null)}
        navigate={navigate}
        t={t}
      />
    )
  }

  // ── Topics list view ────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
      <h1 className="font-display font-bold text-2xl text-gray-900 mb-6">
        {t('topics.title')}
      </h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {treeData.map(topic => (
          <TopicProgressCard
            key={topic.id}
            topic={topic}
            onClick={() => setActiveTopic(topic)}
            t={t}
          />
        ))}
      </div>
    </div>
  )
}
