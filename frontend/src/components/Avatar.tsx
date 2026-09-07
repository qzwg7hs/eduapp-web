import AnimalIcon from './AnimalIcon'

interface Props {
  name: string
  surname: string
  borderColor?: string | null
  icon?: string | null
  size?: 'sm' | 'md' | 'lg'
  isMe?: boolean
}

const SIZES = {
  sm: { box: 'w-9 h-9', text: 'text-xs', iconPx: 20 },
  md: { box: 'w-12 h-12', text: 'text-sm', iconPx: 28 },
  lg: { box: 'w-20 h-20', text: 'text-2xl', iconPx: 48 },
}

// Consistent avatar rendering everywhere a student's initials-circle shows
// (nav bar, profile, leaderboard) — respects their equipped cosmetic
// border color / animal icon so an unlock is actually visible wherever
// other students would see it, not just on the owner's own profile.
export default function Avatar({ name, surname, borderColor, icon, size = 'md', isMe = false }: Props) {
  const s = SIZES[size]
  const style: React.CSSProperties = borderColor
    ? { background: borderColor, color: '#4b4136' }
    : isMe
      ? { background: 'var(--accent-light, #fdeadd)', color: 'var(--accent, #e8622c)' }
      : { background: '#dff0f0', color: '#178f8f' }

  return (
    <div
      className={`${s.box} rounded-full flex items-center justify-center flex-shrink-0 font-bold ${s.text}`}
      style={style}
    >
      {icon ? <AnimalIcon type={icon} size={s.iconPx} /> : `${name[0]}${surname[0]}`}
    </div>
  )
}
