import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { Locale, translations } from '@/i18n/translations'

// BCP-47 tag per locale — 'kz' here is our internal app code (matches the
// country), the real language tag for Kazakh is 'kk'.
const HTML_LANG: Record<Locale, string> = { kz: 'kk', ru: 'ru' }

interface I18nContextValue {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'ru',
  setLocale: () => {},
  t: (k) => k,
})

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem('locale')
    return (saved === 'kz' || saved === 'ru') ? saved as Locale : 'kz'
  })

  function setLocale(l: Locale) {
    setLocaleState(l)
    localStorage.setItem('locale', l)
  }

  // Keep <html lang> matching what's actually on screen — a mismatch (it was
  // hardcoded "en" before) is one of the signals that makes browsers offer/
  // trigger auto-translate, which mangles this app's own curated bilingual
  // content (see index.html's translate="no"/notranslate for the primary fix).
  useEffect(() => {
    document.documentElement.lang = HTML_LANG[locale]
  }, [locale])

  function t(key: string, vars?: Record<string, string | number>): string {
    let str = translations[locale]?.[key] ?? key
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        str = str.replace(`{${k}}`, String(v))
      })
    }
    return str
  }

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  return useContext(I18nContext)
}
