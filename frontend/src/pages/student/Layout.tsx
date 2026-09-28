import { useEffect } from 'react'
import { NavLink, Outlet, Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import type { Locale } from '@/i18n/translations'
import Avatar from '@/components/Avatar'
import NotificationBell from '@/components/NotificationBell'
import DuelBadge from '@/components/DuelBadge'
import { applyThemeAccent, resetThemeAccent } from '@/lib/cosmeticColors'

export default function StudentLayout() {
  const { profile, loading } = useAuth()
  const { locale, setLocale, t } = useI18n()

  useEffect(() => {
    applyThemeAccent(profile?.equipped_border_color)
    return () => resetThemeAccent()
  }, [profile?.equipped_border_color])

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
    // Duel is a per-student opt-out (see Profile.duel_disabled) — omit the
    // tab entirely for a student it's disabled for, rather than showing it
    // disabled/greyed, so there's no trace of the feature for them at all.
    ...(profile.duel_disabled ? [] : [{ to: '/student/duels', label: t('nav.duels') }]),
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
              style={{ background: 'var(--accent, #e8622c)', boxShadow: '0 4px 12px -4px color-mix(in srgb, var(--accent, #e8622c) 50%, transparent)' }}
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
                    {item.to === '/student/duels' && <DuelBadge />}
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

            {/* Streak chip — only once there's something to show */}
            {profile.current_streak > 0 && (
              <div
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-2xl"
                style={{ background: 'var(--accent-light, #fdeadd)', border: '1px solid #f5c9a9' }}
              >
                <span className="font-display font-semibold text-sm text-primary">🔥 {profile.current_streak}</span>
              </div>
            )}

            {/* Notifications */}
            <NotificationBell />

            {/* Locale switcher */}
            <div className="flex rounded-lg overflow-hidden border border-border">
              {(['kz', 'ru'] as Locale[]).map(l => (
                <button
                  key={l}
                  onClick={() => setLocale(l)}
                  className="px-2.5 py-1 text-xs font-bold transition-colors"
                  style={locale === l
                    ? { background: 'var(--accent, #e8622c)', color: '#fff' }
                    : { background: '#fff', color: '#8a8072' }
                  }
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Avatar */}
            <Avatar
              name={profile.name} surname={profile.surname} size="sm" isMe
              borderColor={profile.equipped_border_color} icon={profile.equipped_avatar_icon}
            />
          </div>

        </div>
      </header>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
