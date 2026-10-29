import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '@/api/client'
import { useI18n } from '@/contexts/I18nContext'
import { CommunityTestAttemptSummary } from '@/types'
import { formatUtc5DateTime } from '@/lib/dailyTimer'
import { AlertTriangle, ChevronRight } from 'lucide-react'

export default function StudentCommunityTestHistory() {
  const navigate = useNavigate()
  const { t, locale } = useI18n()
  const [loading, setLoading] = useState(true)
  const [attempts, setAttempts] = useState<CommunityTestAttemptSummary[]>([])

  useEffect(() => {
    setLoading(true)
    api.get<CommunityTestAttemptSummary[]>('/community-test/attempts', { params: { language: locale } })
      .then(r => setAttempts(r.data))
      .finally(() => setLoading(false))
  }, [locale])

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="font-display font-semibold text-2xl text-gray-900 mb-1">{t('communityTest.history_title')}</h1>
      <p className="text-sm text-muted mb-5">{t('communityTest.history_subtitle')}</p>

      {attempts.length === 0 ? (
        <p className="text-center text-muted py-10 text-sm">{t('communityTest.history_empty')}</p>
      ) : (
        <div className="space-y-2 mb-6">
          {attempts.map(a => (
            <button
              key={a.id}
              onClick={() => navigate(`/student/community-test/attempt/${a.id}`)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-surface rounded-2xl border border-border hover:bg-bg transition-colors text-left"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {t('communityTest.attempt_label', { n: a.attempt_number })} — {a.test_title}
                </p>
                <p className="text-xs text-muted truncate">
                  {a.submitted_at ? formatUtc5DateTime(a.submitted_at) : ''}
                  {a.terminated_early && (
                    <span className="inline-flex items-center gap-1 ml-2 text-danger">
                      <AlertTriangle className="w-3 h-3" />{t('communityTest.terminated_badge')}
                    </span>
                  )}
                </p>
              </div>
              <span className="text-sm font-display font-semibold flex-shrink-0" style={{ color: a.score > 0 ? '#2a7d5f' : '#374151' }}>
                {a.score}/{a.total}
              </span>
              <ChevronRight className="w-4 h-4 text-muted flex-shrink-0" />
            </button>
          ))}
        </div>
      )}

      <button className="btn-ghost w-full" onClick={() => navigate('/student/community-test')}>
        {t('communityTest.back_to_test')}
      </button>
    </div>
  )
}
