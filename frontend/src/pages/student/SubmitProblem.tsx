import { useEffect, useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import api from '@/api/client'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { ContentBlock, ProblemSubmission } from '@/types'
import ProblemSubmissionEditor from '@/components/ProblemSubmissionEditor'
import LessonRenderer from '@/components/LessonRenderer'
import { Lightbulb, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react'

export default function StudentSubmitProblem() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { t } = useI18n()
  const [title, setTitle] = useState('')
  const [blocks, setBlocks] = useState<ContentBlock[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [justSubmitted, setJustSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [mine, setMine] = useState<ProblemSubmission[]>([])
  const [loadingMine, setLoadingMine] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  async function loadMine() {
    setLoadingMine(true)
    const { data } = await api.get<ProblemSubmission[]>('/problem-submissions/mine')
    setMine(data)
    setLoadingMine(false)
  }

  useEffect(() => { if (!profile?.submission_disabled) loadMine() }, [profile?.submission_disabled])

  async function submit() {
    setError('')
    if (blocks.length === 0) { setError(t('submit.err_empty')); return }
    setSubmitting(true)
    try {
      await api.post('/problem-submissions', { title: title.trim() || null, content_blocks: blocks })
      setTitle('')
      setBlocks([])
      setJustSubmitted(true)
      await loadMine()
      setTimeout(() => setJustSubmitted(false), 4000)
    } catch (e: any) {
      setError(e.response?.data?.detail || t('submit.err_generic'))
    } finally {
      setSubmitting(false)
    }
  }

  if (profile?.submission_disabled) return <Navigate to="/student" replace />

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="font-display font-semibold text-2xl text-gray-900 mb-1 flex items-center gap-2">
        <Lightbulb className="w-6 h-6" style={{ color: 'var(--accent, #e8622c)' }} /> {t('submit.title')}
      </h1>
      <p className="text-sm text-muted mb-5">{t('submit.subtitle')}</p>

      <div className="card mb-3" style={{ boxShadow: '0 4px 16px -8px rgba(44,36,24,0.1)' }}>
        <label className="label">{t('submit.title_label')}</label>
        <input
          className="input mb-4" value={title} onChange={e => setTitle(e.target.value)}
          placeholder={t('submit.title_placeholder')}
        />
        <label className="label">{t('submit.content_label')}</label>
        <ProblemSubmissionEditor blocks={blocks} onChange={setBlocks} />
      </div>

      {error && <p className="text-sm text-danger mb-3">{error}</p>}
      {justSubmitted && (
        <div className="flex items-center gap-2 text-sm font-semibold text-success mb-3">
          <CheckCircle2 className="w-4 h-4" /> {t('submit.success')}
        </div>
      )}

      <button className="btn-primary w-full mb-8" disabled={submitting} onClick={submit}>
        {submitting ? t('submit.submitting') : t('submit.submit_cta')}
      </button>

      <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">{t('submit.mine_title')}</h2>
      {loadingMine ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        </div>
      ) : mine.length === 0 ? (
        <p className="text-sm text-muted text-center py-8">{t('submit.mine_empty')}</p>
      ) : (
        <div className="space-y-2">
          {mine.map(sub => {
            const isOpen = expanded === sub.id
            return (
              <div key={sub.id} className="bg-surface rounded-2xl border border-border overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : sub.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-bg transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {sub.title || t('submit.untitled')}
                    </p>
                    <p className="text-xs text-muted">{new Date(sub.created_at).toLocaleDateString()}</p>
                  </div>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-muted flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted flex-shrink-0" />}
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 border-t border-border pt-3">
                    <LessonRenderer blocks={sub.content_blocks} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <button className="btn-ghost w-full mt-6" onClick={() => navigate('/student')}>{t('testbank.back_home')}</button>
    </div>
  )
}
