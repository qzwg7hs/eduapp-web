import { useEffect, useState } from 'react'
import api from '@/api/client'

// A small count pill for things needing the student's action in Duel (an
// incoming challenge to accept/decline, or an active duel they haven't
// answered yet). Same 60s-poll pattern as NotificationBell's unread count,
// but rendered inline next to the "Duel" nav tab rather than as its own
// icon+dropdown — Duel already has a full nav tab (it needs a real page,
// not a quick preview), so this only adds the glanceable urgency signal,
// not a second entry point to the same page.
export default function DuelBadge() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    function load() {
      api.get<{ count: number }>('/duels/pending-count').then(r => setCount(r.data.count)).catch(() => {})
    }
    load()
    const iv = setInterval(load, 60_000)
    return () => clearInterval(iv)
  }, [])

  if (count === 0) return null
  return (
    <span
      className="ml-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold text-white inline-flex items-center justify-center leading-none"
      style={{ background: 'var(--accent, #e8622c)' }}
    >
      {count > 9 ? '9+' : count}
    </span>
  )
}
