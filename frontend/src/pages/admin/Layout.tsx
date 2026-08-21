import { NavLink, Outlet, Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import type { Locale } from '@/i18n/translations'
import { LayoutDashboard, Users, BookOpen, Zap, ClipboardList, type LucideIcon } from 'lucide-react'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

export default function AdminLayout() {
  const { profile, loading, signOut } = useAuth()
  const { locale, setLocale, t } = useI18n()

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
  if (!profile || profile.role !== 'admin') return <Navigate to="/login" replace />

  const nav: NavItem[] = [
    { to: '/admin',          label: t('admin.nav.overview'), icon: LayoutDashboard, end: true },
    { to: '/admin/students', label: t('admin.nav.students'), icon: Users },
    { to: '/admin/content',  label: t('admin.nav.content'),  icon: BookOpen },
    { to: '/admin/pod',      label: t('admin.nav.pod'),      icon: Zap },
    { to: '/admin/test-bank',label: t('admin.nav.testbank'), icon: ClipboardList },
  ]

  const localeSwitcher = (
    <div className="flex rounded-lg overflow-hidden border border-border">
      {(['kz', 'ru'] as Locale[]).map(l => (
        <button
          key={l}
          onClick={() => setLocale(l)}
          className={`flex-1 py-1 text-xs font-semibold transition-colors ${
            locale === l ? 'bg-primary text-white' : 'bg-surface text-muted hover:bg-gray-100'
          }`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  )

  return (
    <div className="min-h-screen flex flex-col bg-bg lg:flex-row">
      {/* Sidebar (desktop) */}
      <aside className="hidden lg:flex flex-col w-60 bg-surface border-r border-border h-screen sticky top-0 self-start">
        <div className="p-5 border-b border-border flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center text-white font-display font-semibold text-base leading-none flex-shrink-0"
            style={{ boxShadow: '0 4px 12px -4px rgba(232,98,44,0.5)' }}
          >
            ∑
          </div>
          <div>
            <span className="font-display font-semibold text-base text-gray-900">EduApp</span>
            <p className="text-xs text-muted leading-none mt-0.5">Admin Panel</p>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  isActive
                    ? 'bg-primary-light text-primary'
                    : 'text-muted hover:bg-bg hover:text-gray-700'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={`w-4 h-4 flex-shrink-0 transition-colors ${isActive ? 'text-primary' : 'text-muted'}`} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-border space-y-3">
          {localeSwitcher}
          <p className="text-xs text-muted truncate">{profile.name} {profile.surname}</p>
          <button onClick={signOut} className="text-xs text-danger font-medium hover:text-red-700 transition-colors">
            {t('admin.sign_out')}
          </button>
        </div>
      </aside>

      {/* Content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar (mobile) */}
        <header className="lg:hidden bg-surface border-b border-border px-4 py-3 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-white font-display font-semibold text-sm leading-none">∑</div>
            <span className="font-display font-semibold text-base text-gray-900">EduApp Admin</span>
          </div>
          {localeSwitcher}
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>

        {/* Bottom nav (mobile) */}
        <nav className="lg:hidden bg-surface border-t border-border flex sticky bottom-0 z-10">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-semibold transition-colors ${
                  isActive ? 'text-primary' : 'text-muted hover:text-gray-700'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={`w-5 h-5 transition-colors ${isActive ? 'text-primary' : 'text-muted'}`} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
