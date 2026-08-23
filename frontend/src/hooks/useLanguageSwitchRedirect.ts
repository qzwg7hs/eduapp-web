import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '@/api/client'
import { useI18n } from '@/contexts/I18nContext'
import { Locale } from '@/i18n/translations'

/**
 * Lets a student switch the KZ/RU toggle while viewing a specific
 * topic/lesson/test and land on the *same content* in the new language,
 * instead of the toggle only re-skinning the UI chrome around now-stale
 * (wrong-language) content — topics/lessons/problems are separate rows per
 * language, so the id in the URL is itself language-specific.
 *
 * `currentId` is the id currently loaded on the page (undefined while
 * loading — the effect no-ops until it's set). `buildPath` turns a
 * translated id into the route to navigate to.
 */
export function useLanguageSwitchRedirect(
  type: 'topic' | 'lesson',
  currentId: string | undefined,
  buildPath: (id: string) => string,
  navState?: unknown,
) {
  const { locale } = useI18n()
  const navigate = useNavigate()
  const prevLocale = useRef<Locale | null>(null)
  const prevId = useRef<string | undefined>(currentId)

  useEffect(() => {
    // Keep the "current id" ref fresh without treating a plain id change
    // (e.g. navigating to a different lesson entirely) as a language switch.
    if (currentId !== prevId.current) {
      prevId.current = currentId
      prevLocale.current = locale
      return
    }

    if (prevLocale.current === null) {
      prevLocale.current = locale
      return
    }
    if (prevLocale.current === locale || !currentId) {
      prevLocale.current = locale
      return
    }

    const targetLocale = locale
    prevLocale.current = locale
    api.get<{ id: string | null }>('/topics/translate', {
      params: { type, id: currentId, target_language: targetLocale },
    }).then(({ data }) => {
      if (data.id) {
        prevId.current = data.id
        navigate(buildPath(data.id), { replace: true, state: navState })
      }
      // No counterpart found: stay put — the page keeps showing the old
      // content rather than bouncing to a broken page. Shouldn't happen for
      // any content that's been through the pairing backfill.
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, currentId])
}
