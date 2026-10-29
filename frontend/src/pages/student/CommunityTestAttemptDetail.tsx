import { useEffect, useState } from 'react'
import { useNavigate, useParams, Navigate } from 'react-router-dom'
import api from '@/api/client'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { CommunityTestStatus } from '@/types'
import LatexText from '@/components/LatexText'
import { CheckCircle2, XCircle } from 'lucide-react'

export default function StudentCommunityTestAttemptDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { t, locale } = useI18n()
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<CommunityTestStatus | null>(null)

  useEffect(() => {
    if (!id || profile?.community_test_disabled) return
    setLoading(true)
    api.get<CommunityTestStatus>(`/community-test/attempts/${id}`, { params: { language: locale } })
      .then(r => setStatus(r.data))
      .finally(() => setLoading(false))
  }, [id, locale, profile?.community_test_disabled])

  if (profile?.community_test_disabled) return <Navigate to="/student" replace />

  if (loading || !status) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  const results = status.results ?? []
  const total = status.total ?? results.length

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="font-display font-semibold text-2xl text-gray-900 mb-1">{status.title}</h1>
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
      <button className="btn-ghost w-full" onClick={() => navigate('/student/community-test/history')}>
        {t('communityTest.back_to_history')}
      </button>
    </div>
  )
}
