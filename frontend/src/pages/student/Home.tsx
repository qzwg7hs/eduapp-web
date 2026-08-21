import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '@/api/client'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { TopicInTree, ContinueProgress, ExamStatusOut, PodStatusOut } from '@/types'
import { secondsUntilNextUtcHour, formatCountdown } from '@/lib/dailyTimer'

const TESTBANK_RESET_UTC_HOUR = 19 // 00:00 UTC+5
const POD_RESET_UTC_HOUR = 7       // 12:00 UTC+5

// Accent palette cycles per topic index
const ACCENTS = [
  { bg: '#fdeadd', color: '#e8622c' },
  { bg: '#dff0f0', color: '#178f8f' },
  { bg: '#fdf1d6', color: '#d99a10' },
  { bg: '#eae6fb', color: '#6a56cf' },
  { bg: '#e7f2ec', color: '#2a7d5f' },
]
function accent(i: number) { return ACCENTS[i % ACCENTS.length] }

export default function StudentHome() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { t, locale } = useI18n()
  const [topics, setTopics] = useState<TopicInTree[]>([])
  const [loading, setLoading] = useState(true)
  const [continueItem, setContinueItem] = useState<ContinueProgress | null>(null)
  const [examTaken, setExamTaken] = useState(false)
  const [podTaken, setPodTaken] = useState(false)
  const [testCountdown, setTestCountdown] = useState(0)
  const [podCountdown, setPodCountdown] = useState(0)

  async function load() {
    setLoading(true)
    const { data } = await api.get<TopicInTree[]>('/topics/tree', { params: { language: locale } })
    const published = data.filter(t => t.is_published)
    setTopics(published)
    setLoading(false)
  }

  useEffect(() => { load() }, [locale])

  // The specific subtopic/test the student most recently worked on and hasn't
  // finished — a precise "pick up right where you left off" reference point,
  // independent of the language toggle (it's about the student's own history).
  useEffect(() => {
    api.get<ContinueProgress | null>('/progress/continue')
      .then(r => setContinueItem(r.data))
      .catch(() => setContinueItem(null))
  }, [])

  // Whether today's exam/POD are already used up — drives CTA vs countdown below
  useEffect(() => {
    api.get<ExamStatusOut>('/test-bank/today', { params: { language: locale } })
      .then(r => setExamTaken(r.data.status === 'submitted'))
      .catch(() => setExamTaken(false))
  }, [locale])

  useEffect(() => {
    api.get<PodStatusOut>('/pod/today', { params: { language: locale } })
      .then(r => setPodTaken(r.data.status === 'locked'))
      .catch(() => setPodTaken(false))
  }, [locale])

  // Live countdowns — only actually shown once the respective daily item is taken
  useEffect(() => {
    function tick() {
      setTestCountdown(secondsUntilNextUtcHour(TESTBANK_RESET_UTC_HOUR))
      setPodCountdown(secondsUntilNextUtcHour(POD_RESET_UTC_HOUR))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // Every topic the student has started but not finished — shown as "continue"
  // cards. There can be any number of these (0, 1, or several); each always
  // opens the same topic page ("Тақырыптар" would show for that topic), never
  // a specific lesson directly, so the experience is identical either way.
  const inProgressTopics = topics.filter(t => t.completed_lessons > 0 && t.completed_lessons < t.total_lessons)

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-10">

      {/* Greeting row */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-display font-semibold text-2xl text-gray-900">
            {t('home.hello')}, {profile?.name}! 👋
          </h1>
          <p className="text-sm text-muted mt-0.5">{t('home.subtitle')}</p>
        </div>
        <div className="bg-warning-light border border-yellow-200 px-3 py-1.5 rounded-2xl flex-shrink-0">
          <span className="text-sm font-display font-semibold text-warning">⭐ {profile?.points ?? 0}</span>
        </div>
      </div>

      {/* Pick up exactly where you left off — the single most recently worked-on,
          not-yet-finished subtopic test (if any) */}
      {continueItem && (
        <button
          onClick={() => navigate(`/student/test/${continueItem.lesson_id}`, {
            state: { lessonTitle: continueItem.lesson_title },
          })}
          className="w-full text-left rounded-2xl p-5 mb-6 transition-all active:scale-[0.99]"
          style={{
            background: 'linear-gradient(120deg, #178f8f 0%, #1db8b8 100%)',
            boxShadow: '0 16px 32px -12px rgba(23,143,143,0.5)',
          }}
        >
          <p className="text-xs font-bold uppercase tracking-widest text-white/70 mb-1.5">
            {t('home.continue')}
          </p>
          <p className="font-display font-semibold text-xl text-white mb-0.5 leading-tight">
            {continueItem.subtopic_title}
          </p>
          <p className="text-sm text-white/80 mb-3">{continueItem.topic_title}</p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1 min-w-0 mr-4">
              <div className="flex-1 h-2.5 bg-white/30 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white rounded-full"
                  style={{ width: `${(continueItem.attempted_count / continueItem.total_count) * 100}%` }}
                />
              </div>
              <span className="text-xs font-bold text-white/90 flex-shrink-0">
                {continueItem.attempted_count} / {continueItem.total_count}
              </span>
            </div>
            <span className="flex-shrink-0 bg-white text-teal font-display font-semibold text-sm px-4 py-1.5 rounded-xl">
              {t('lesson.go_to_test')}
            </span>
          </div>
        </button>
      )}

      {/* Continue learning — one card per topic the student has started, in any number */}
      {inProgressTopics.length > 0 && (
        <>
          <p className="text-xs font-bold text-muted uppercase tracking-widest mb-3">{t('home.continue')}</p>
          <div className="flex gap-3 overflow-x-auto pb-1 mb-6 -mx-4 px-4 sm:mx-0 sm:px-0">
            {inProgressTopics.map(topic => {
              const pct = topic.total_lessons > 0 ? (topic.completed_lessons / topic.total_lessons) * 100 : 0
              return (
                <button
                  key={topic.id}
                  onClick={() => navigate(`/student/topic/${topic.id}`)}
                  className="flex-shrink-0 w-56 text-left rounded-2xl p-4 transition-all active:scale-[0.98]"
                  style={{
                    background: 'linear-gradient(120deg, #e8622c 0%, #f2953f 100%)',
                    boxShadow: '0 12px 24px -10px rgba(232,98,44,0.5)',
                  }}
                >
                  <p className="font-display font-semibold text-white leading-snug line-clamp-2 mb-3">
                    {topic.title}
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-white/30 rounded-full overflow-hidden">
                      <div className="h-full bg-white rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-bold text-white/90 flex-shrink-0">
                      {topic.completed_lessons}/{topic.total_lessons}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* Pick a topic label */}
      <p className="text-xs font-bold text-muted uppercase tracking-widest mb-3">{t('home.topics')}</p>

      {topics.length === 0 && (
        <div className="text-center py-16 text-muted">
          <div className="text-4xl mb-3">📭</div>
          <p className="font-semibold">{t('home.no_topics')}</p>
          <p className="text-sm mt-1">{t('home.no_topics_sub')}</p>
        </div>
      )}

      {/* 2-column grid of topic cards */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {topics.map((topic, topicIdx) => {
          const pct = topic.total_lessons > 0 ? (topic.completed_lessons / topic.total_lessons) * 100 : 0
          const done = topic.total_lessons > 0 && topic.completed_lessons >= topic.total_lessons
          const ac = accent(topicIdx)
          const initials = topic.title.slice(0, 2)

          return (
            <button
              key={topic.id}
              onClick={() => navigate(`/student/topic/${topic.id}`)}
              className="bg-surface rounded-2xl border text-left p-4 flex flex-col gap-3 transition-all active:scale-[0.98] hover:shadow-md"
              style={{
                borderColor: '#f0e5d4',
                boxShadow: '0 2px 12px -6px rgba(44,36,24,0.08)',
              }}
            >
              {/* Icon */}
              <div
                className="w-[52px] h-[52px] rounded-2xl flex items-center justify-center font-display font-semibold text-xl flex-shrink-0"
                style={{ background: ac.bg, color: ac.color }}
              >
                {done ? '✓' : initials}
              </div>

              {/* Title */}
              <div>
                <p className="font-display font-semibold text-base text-gray-900 leading-snug line-clamp-2">
                  {topic.title}
                </p>
                <p className="text-xs text-muted mt-0.5">
                  {topic.subtopics.filter(s => s.is_published).length} subtopics
                </p>
              </div>

              {/* Progress bar */}
              <div className="w-full space-y-1">
                <div className="h-2 rounded-full overflow-hidden" style={{ background: '#f0e5d4' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: done ? '#2a7d5f' : ac.color,
                    }}
                  />
                </div>
                <p className="text-xs font-medium" style={{ color: done ? '#2a7d5f' : ac.color }}>
                  {topic.completed_lessons}/{topic.total_lessons}
                </p>
              </div>
            </button>
          )
        })}
      </div>

      {/* Daily feature banners — Test and Problem of the Day. Each shows a plain
          "start" CTA while today's is still available, or a countdown to the
          next one once it's already been used up (never both at once). */}
      <button
        onClick={() => navigate('/student/exam')}
        className="w-full rounded-2xl p-5 mb-3 text-left flex items-center justify-between transition-all active:scale-[0.99]"
        style={{
          background: 'linear-gradient(120deg, #e8622c 0%, #f2953f 100%)',
          boxShadow: '0 8px 24px -8px rgba(232,98,44,0.45)',
        }}
      >
        <p className="font-display font-semibold text-lg text-white leading-tight">
          {t('testbank.title')}
        </p>
        {examTaken ? (
          <span className="flex-shrink-0 bg-white/20 text-white font-display font-semibold text-sm px-4 py-1.5 rounded-xl ml-4">
            ⏱ {formatCountdown(testCountdown)}
          </span>
        ) : (
          <span className="flex-shrink-0 bg-white text-primary font-display font-semibold text-sm px-4 py-1.5 rounded-xl ml-4">
            {t('pod.start')}
          </span>
        )}
      </button>

      <button
        onClick={() => navigate('/student/pod')}
        className="w-full rounded-2xl p-5 text-left flex items-center justify-between transition-all active:scale-[0.99]"
        style={{
          background: 'linear-gradient(120deg, #178f8f 0%, #1db8b8 100%)',
          boxShadow: '0 8px 24px -8px rgba(23,143,143,0.45)',
        }}
      >
        <p className="font-display font-semibold text-lg text-white leading-tight">
          {t('pod.title')}
        </p>
        {podTaken ? (
          <span className="flex-shrink-0 bg-white/20 text-white font-display font-semibold text-sm px-4 py-1.5 rounded-xl ml-4">
            ⏱ {formatCountdown(podCountdown)}
          </span>
        ) : (
          <span className="flex-shrink-0 bg-white text-teal font-display font-semibold text-sm px-4 py-1.5 rounded-xl ml-4">
            {t('pod.start')}
          </span>
        )}
      </button>
    </div>
  )
}
