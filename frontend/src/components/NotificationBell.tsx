import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import api from '@/api/client'
import { useI18n } from '@/contexts/I18nContext'
import { NotificationOut } from '@/types'

// Social-media-style bell: a small unread badge in the header, opening a
// dropdown of broadcast announcements (new features, changes) on click.
// Unread state is derived server-side per student, not stored locally —
// opening an item (or "mark all read") tells the backend directly so the
// count stays correct across devices/tabs.
export default function NotificationBell() {
  const { t, locale } = useI18n()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationOut[]>([])
  const [unread, setUnread] = useState(0)
  const [expanded, setExpanded] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  function loadCount() {
    api.get<{ count: number }>('/notifications/unread-count').then(r => setUnread(r.data.count)).catch(() => {})
  }

  useEffect(() => {
    loadCount()
    const interval = setInterval(loadCount, 60_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function toggleOpen() {
    const next = !open
    setOpen(next)
    if (next) {
      api.get<NotificationOut[]>('/notifications', { params: { language: locale } }).then(r => setItems(r.data))
    }
  }

  async function openItem(n: NotificationOut) {
    setExpanded(expanded === n.id ? null : n.id)
    if (!n.is_read) {
      await api.post(`/notifications/${n.id}/read`)
      setItems(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x))
      setUnread(c => Math.max(0, c - 1))
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggleOpen}
        className="relative w-9 h-9 rounded-full flex items-center justify-center text-muted hover:bg-bg hover:text-gray-700 transition-colors"
        aria-label={t('notif.title')}
      >
        <Bell className="w-[18px] h-[18px]" />
        {unread > 0 && (
          <span
            className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center leading-none"
            style={{ background: '#d64545' }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-surface rounded-2xl border border-border overflow-hidden z-20"
          style={{ boxShadow: '0 12px 32px -8px rgba(44,36,24,0.2)' }}
        >
          <div className="px-4 py-3 border-b border-border">
            <p className="font-display font-semibold text-sm text-gray-900">{t('notif.title')}</p>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="text-sm text-muted text-center py-8">{t('notif.empty')}</p>
            ) : items.map(n => (
              <button
                key={n.id}
                onClick={() => openItem(n)}
                className={`w-full text-left px-4 py-3 border-b border-border last:border-b-0 transition-colors hover:bg-bg ${!n.is_read ? 'bg-primary-light' : ''}`}
              >
                <div className="flex items-start gap-2">
                  {!n.is_read && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5" style={{ background: 'var(--accent, #e8622c)' }} />}
                  <div className={`flex-1 min-w-0 ${n.is_read ? 'pl-3.5' : ''}`}>
                    <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                      {n.icon && <span>{n.icon}</span>}
                      <span className="truncate">{n.title}</span>
                    </p>
                    {expanded === n.id && (
                      <p className="text-sm text-gray-700 mt-1.5 whitespace-pre-line leading-relaxed">{n.body}</p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
