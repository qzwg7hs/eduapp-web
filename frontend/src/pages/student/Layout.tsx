import { NavLink, Outlet, Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import type { Locale } from '@/i18n/translations'

export default function StudentLayout() {
  const { profile, loading } = useAuth()
  const { locale, setLocale, t } = useI18n()

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  )
  if (!profile || profile.role !== 'student') return <Navigate to="/login" replace />

  const nav = [
    { to: '/student',             label: t('nav.learn'),   end: true },
    { to: '/student/topics',      label: t('nav.topics')  },
    { to: '/student/pod',         label: t('nav.daily')  },
    { to: '/student/exam',        label: t('nav.testbank')  },
    { to: '/student/leaderboard', label: t('nav.ranks')  },
    { to: '/student/profile',     label: t('nav.profile') },
  ]

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <header
        className="bg-surface border-b border-border sticky top-0 z-10"
        style={{ boxShadow: '0 2px 12px -4px rgba(44,36,24,0.08)' }}
      >
        <div className="px-4 sm:px-6 h-16 flex items-center gap-2 sm:gap-4">

          {/* Logo */}
          <div className="flex items-center gap-2.5 flex-shrink-0 mr-1">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-display font-semibold text-lg leading-none flex-shrink-0"
              style={{ background: '#e8622c', boxShadow: '0 4px 12px -4px rgba(232,98,44,0.5)' }}
            >
              ∑
            </div>
            <span className="font-display font-semibold text-lg text-gray-900 hidden sm:block">EduApp</span>
          </div>

          {/* Nav links */}
          <nav className="flex items-center gap-0.5 flex-1">
            {nav.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `relative px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
                    isActive
                      ? 'text-primary'
                      : 'text-muted hover:text-gray-700 hover:bg-gray-50'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {item.label}
                    {isActive && (
                      <span
                        className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-primary"
                      />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">

            {/* Points chip */}
            <div
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-2xl"
              style={{ background: '#fdf1d6', border: '1px solid #f5d980' }}
            >
              <span className="font-display font-semibold text-sm text-warning">⭐ {profile.points}</span>
            </div>

            {/* Locale switcher */}
            <div className="flex rounded-lg overflow-hidden border border-border">
              {(['kz', 'ru'] as Locale[]).map(l => (
                <button
                  key={l}
                  onClick={() => setLocale(l)}
                  className="px-2.5 py-1 text-xs font-bold transition-colors"
                  style={locale === l
                    ? { background: '#e8622c', color: '#fff' }
                    : { background: '#fff', color: '#8a8072' }
                  }
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Avatar */}
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #178f8f, #0f6b6b)', boxShadow: '0 2px 8px -2px rgba(23,143,143,0.4)' }}
            >
              {profile.name[0]}{profile.surname[0]}
            </div>
          </div>

        </div>
      </header>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
