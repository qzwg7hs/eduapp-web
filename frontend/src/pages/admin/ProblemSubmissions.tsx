import { useEffect, useState } from 'react'
import api from '@/api/client'
import { useI18n } from '@/contexts/I18nContext'
import { ProblemSubmissionAdmin } from '@/types'
import LessonRenderer from '@/components/LessonRenderer'
import RawBlockView from '@/components/RawBlockView'
import { formatUtc5DateTime } from '@/lib/dailyTimer'
import { Lightbulb, Trash2, ChevronDown, ChevronUp } from 'lucide-react'

export default function AdminProblemSubmissions() {
  const { t } = useI18n()
  const [items, setItems] = useState<ProblemSubmissionAdmin[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ProblemSubmissionAdmin | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await api.get<ProblemSubmissionAdmin[]>('/problem-submissions/admin')
    setItems(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function open(sub: ProblemSubmissionAdmin) {
    const next = expanded === sub.id ? null : sub.id
    setExpanded(next)
    // Opening marks it seen server-side — refetch the detail (which does
    // the marking) then patch just that row's is_seen locally, instead of
    // reloading the whole list and losing scroll position.
    if (next && !sub.is_seen) {
      await api.get(`/problem-submissions/admin/${sub.id}`)
      setItems(prev => prev.map(x => x.id === sub.id ? { ...x, is_seen: true } : x))
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    await api.delete(`/problem-submissions/admin/${deleteTarget.id}`)
    setDeleteTarget(null)
    load()
  }

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto px-4 lg:px-8 py-6">
      <h1 className="text-2xl font-semibold text-gray-900 mb-1 flex items-center gap-2">
        <Lightbulb className="w-6 h-6 text-primary" /> {t('admin.submissions.title')}
      </h1>
      <p className="text-sm text-muted mb-6">{t('admin.submissions.subtitle')}</p>

      {items.length === 0 ? (
        <p className="text-center text-muted py-10 text-sm">{t('admin.submissions.none')}</p>
      ) : (
        <div className="space-y-2">
          {items.map(sub => {
            const isOpen = expanded === sub.id
            return (
              <div
                key={sub.id}
                className="rounded-2xl border overflow-hidden"
                style={sub.is_seen
                  ? { background: '#fff', borderColor: '#f0e5d4' }
                  : { background: 'var(--accent-light, #fdeadd)', borderColor: '#f5c9a9' }}
              >
                <button onClick={() => open(sub)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-black/[0.02] transition-colors">
                  {!sub.is_seen && (
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--accent, #e8622c)' }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {sub.title || t('admin.submissions.untitled')}
                      {!sub.is_seen && (
                        <span className="ml-2 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md text-white" style={{ background: 'var(--accent, #e8622c)' }}>
                          {t('admin.submissions.new_badge')}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted truncate">
                      {sub.student_name} {sub.student_surname} ({sub.student_unique_id}) · {formatUtc5DateTime(sub.created_at)} (UTC+5)
                    </p>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); setDeleteTarget(sub) }}
                    className="text-danger flex-shrink-0 p-1.5 hover:bg-danger-light rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-muted flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted flex-shrink-0" />}
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 border-t border-border pt-3 bg-white space-y-4">
                    <div>
                      <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">{t('admin.submissions.preview_label')}</p>
                      <div className="border border-border rounded-xl p-3 bg-bg">
                        <LessonRenderer blocks={sub.content_blocks} />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">{t('admin.submissions.raw_label')}</p>
                      <div className="space-y-3">
                        {sub.content_blocks.map((block, i) => <RawBlockView key={i} block={block} />)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-surface rounded-2xl p-5 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="font-display font-semibold text-base text-gray-900 mb-1">{t('admin.submissions.delete_title')}</h3>
            <p className="text-sm text-muted mb-4">{deleteTarget.title || t('admin.submissions.untitled')}</p>
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => setDeleteTarget(null)}>{t('admin.cancel')}</button>
              <button className="flex-1 py-2.5 rounded-xl bg-danger text-white font-semibold text-sm" onClick={confirmDelete}>{t('admin.delete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
