import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '@/api/client'
import { useI18n } from '@/contexts/I18nContext'
import { TopicInTree } from '@/types'
import { SubtopicsView } from './Topics'
import { useLanguageSwitchRedirect } from '@/hooks/useLanguageSwitchRedirect'

// Renders the exact same subtopic/lesson/test browsing UI as "Тақырыптар"
// (Topics.tsx's SubtopicsView) so a topic looks and behaves identically
// no matter which page a student entered it from.
export default function StudentTopic() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t, locale } = useI18n()
  const [topic, setTopic] = useState<TopicInTree | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await api.get<TopicInTree[]>('/topics/tree', { params: { language: locale } })
      const published = data.filter(t => t.is_published)
      setTopic(published.find(t => t.id === id) ?? null)
      setLoading(false)
    }
    load()
    // Deliberately NOT keyed on `locale`: a locale change while viewing a
    // specific topic is handled entirely by useLanguageSwitchRedirect below,
    // which resolves the counterpart id and updates the `id` route param —
    // that's what re-triggers this fetch (with the fresh locale value read
    // above). Reacting to `locale` directly here too would race the redirect
    // (this effect refetching the tree in the new language before the id has
    // been translated, briefly showing "not found").
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useLanguageSwitchRedirect('topic', id, (newId) => `/student/topic/${newId}`)

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!topic) {
    return (
      <div className="text-center py-16 text-muted">
        <p className="font-semibold">{t('topics.not_found')}</p>
      </div>
    )
  }

  return (
    <SubtopicsView
      topic={topic}
      onBack={() => navigate('/student')}
      navigate={navigate}
      t={t}
    />
  )
}
