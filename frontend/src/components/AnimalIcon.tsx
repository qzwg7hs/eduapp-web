export type AnimalKey = 'cat' | 'dog' | 'fox' | 'panda' | 'owl' | 'rabbit' | 'lion' | 'koala' | 'eagle' | 'wolf'

interface Props {
  type: AnimalKey | string
  size?: number
  className?: string
}

// Minimal line-art critter faces — one shared "head" build (circle + dot
// eyes + small mouth), differentiated mainly by ear shape/placement, so the
// set reads as one consistent family rather than 8 unrelated styles. Kept
// to a single muted line color (no fills beyond the ears) so it sits
// quietly on any of the pastel cosmetic backgrounds behind it.
const STROKE = '#6b5d4f'
const W = 1.6

function Face({ children }: { children?: React.ReactNode }) {
  return (
    <>
      <circle cx="20" cy="22" r="12" fill="none" stroke={STROKE} strokeWidth={W} />
      <circle cx="15.5" cy="21" r="1.3" fill={STROKE} />
      <circle cx="24.5" cy="21" r="1.3" fill={STROKE} />
      <path d="M17 27q3 2.2 6 0" fill="none" stroke={STROKE} strokeWidth={W} strokeLinecap="round" />
      {children}
    </>
  )
}

function IconSvg({ type, size = 24, className }: Props) {
  const common = { width: size, height: size, viewBox: '0 0 40 40', className }

  switch (type) {
    case 'cat':
      return (
        <svg {...common}>
          <path d="M11 14 L16 11 L15 18 Z" fill="none" stroke={STROKE} strokeWidth={W} strokeLinejoin="round" />
          <path d="M29 14 L24 11 L25 18 Z" fill="none" stroke={STROKE} strokeWidth={W} strokeLinejoin="round" />
          <Face>
            <path d="M9 24h4M9 27h4M27 24h4M27 27h4" stroke={STROKE} strokeWidth={1} strokeLinecap="round" />
          </Face>
        </svg>
      )
    case 'dog':
      return (
        <svg {...common}>
          <path d="M10 14 Q6 22 11 27" fill="none" stroke={STROKE} strokeWidth={W} strokeLinecap="round" />
          <path d="M30 14 Q34 22 29 27" fill="none" stroke={STROKE} strokeWidth={W} strokeLinecap="round" />
          <Face>
            <ellipse cx="20" cy="27.5" rx="2.6" ry="1.8" fill={STROKE} opacity={0.85} />
          </Face>
        </svg>
      )
    case 'fox':
      return (
        <svg {...common}>
          <path d="M10 13 L17 12 L15 19 Z" fill="none" stroke={STROKE} strokeWidth={W} strokeLinejoin="round" />
          <path d="M30 13 L23 12 L25 19 Z" fill="none" stroke={STROKE} strokeWidth={W} strokeLinejoin="round" />
          <circle cx="20" cy="23" r="11" fill="none" stroke={STROKE} strokeWidth={W} />
          <circle cx="16" cy="22" r="1.3" fill={STROKE} />
          <circle cx="24" cy="22" r="1.3" fill={STROKE} />
          <path d="M17 20 Q20 27 23 20" fill="none" stroke={STROKE} strokeWidth={W} strokeLinejoin="round" />
        </svg>
      )
    case 'panda':
      return (
        <svg {...common}>
          <circle cx="10.5" cy="12.5" r="4" fill={STROKE} />
          <circle cx="29.5" cy="12.5" r="4" fill={STROKE} />
          <circle cx="20" cy="22" r="12" fill="none" stroke={STROKE} strokeWidth={W} />
          <ellipse cx="15.5" cy="21" rx="2.6" ry="3.2" fill={STROKE} opacity={0.9} />
          <ellipse cx="24.5" cy="21" rx="2.6" ry="3.2" fill={STROKE} opacity={0.9} />
          <circle cx="15.5" cy="21.5" r="1" fill="#fff" />
          <circle cx="24.5" cy="21.5" r="1" fill="#fff" />
          <path d="M17 27q3 2.2 6 0" fill="none" stroke={STROKE} strokeWidth={W} strokeLinecap="round" />
        </svg>
      )
    case 'owl':
      return (
        <svg {...common}>
          <circle cx="20" cy="22" r="12" fill="none" stroke={STROKE} strokeWidth={W} />
          <circle cx="15" cy="21" r="4" fill="none" stroke={STROKE} strokeWidth={W} />
          <circle cx="25" cy="21" r="4" fill="none" stroke={STROKE} strokeWidth={W} />
          <circle cx="15" cy="21" r="1.2" fill={STROKE} />
          <circle cx="25" cy="21" r="1.2" fill={STROKE} />
          <path d="M20 24 L18 28 L22 28 Z" fill={STROKE} />
          <path d="M12 12 L16 15 M28 12 L24 15" stroke={STROKE} strokeWidth={W} strokeLinecap="round" />
        </svg>
      )
    case 'rabbit':
      return (
        <svg {...common}>
          <path d="M14 15 Q13 5 17 6 Q19 6 18 15" fill="none" stroke={STROKE} strokeWidth={W} strokeLinejoin="round" />
          <path d="M26 15 Q27 5 23 6 Q21 6 22 15" fill="none" stroke={STROKE} strokeWidth={W} strokeLinejoin="round" />
          <Face>
            <ellipse cx="20" cy="27" rx="1.6" ry="1.2" fill={STROKE} opacity={0.85} />
          </Face>
        </svg>
      )
    case 'lion':
      return (
        <svg {...common}>
          <path
            d="M20 8c6 0 11 5 11 11 0 3-1 5.5-2.6 7.5.6-1 1-2 1-3.2 0-3.5-3.5-6.3-9.4-6.3s-9.4 2.8-9.4 6.3c0 1.2.4 2.2 1 3.2C8.9 24.6 8 22.1 8 19c0-6 5-11 11-11z"
            fill="none" stroke={STROKE} strokeWidth={W} strokeLinejoin="round"
          />
          <Face />
        </svg>
      )
    case 'eagle':
      // Same head shape as owl, but a brow ridge instead of round eye-rings
      // and a strong hooked beak — the "elite" tier, so it reads sharper.
      return (
        <svg {...common}>
          <circle cx="20" cy="22" r="12" fill="none" stroke={STROKE} strokeWidth={W} />
          <path d="M12.5 18.5 Q15.5 16.5 18 18.5" fill="none" stroke={STROKE} strokeWidth={W} strokeLinecap="round" />
          <path d="M22 18.5 Q24.5 16.5 27.5 18.5" fill="none" stroke={STROKE} strokeWidth={W} strokeLinecap="round" />
          <circle cx="15.5" cy="21" r="1.3" fill={STROKE} />
          <circle cx="24.5" cy="21" r="1.3" fill={STROKE} />
          <path d="M17.5 24.5 Q20 23.5 22.5 24.5 Q20.5 27.5 20 28 Q19.5 27.5 17.5 24.5 Z" fill={STROKE} />
          <path d="M11 11 L14 15 M29 11 L26 15" stroke={STROKE} strokeWidth={W} strokeLinecap="round" />
        </svg>
      )
    case 'wolf':
      // Fox's cousin: taller, narrower ears set closer together and a
      // longer pointed snout, for a leaner, more angular silhouette.
      return (
        <svg {...common}>
          <path d="M12 15 L15 8 L16.5 17 Z" fill="none" stroke={STROKE} strokeWidth={W} strokeLinejoin="round" />
          <path d="M28 15 L25 8 L23.5 17 Z" fill="none" stroke={STROKE} strokeWidth={W} strokeLinejoin="round" />
          <circle cx="20" cy="23" r="11" fill="none" stroke={STROKE} strokeWidth={W} />
          <circle cx="16" cy="21.5" r="1.3" fill={STROKE} />
          <circle cx="24" cy="21.5" r="1.3" fill={STROKE} />
          <path d="M17 26 L20 30 L23 26" fill="none" stroke={STROKE} strokeWidth={W} strokeLinejoin="round" />
        </svg>
      )
    case 'koala':
      return (
        <svg {...common}>
          <circle cx="9" cy="18" r="6" fill="none" stroke={STROKE} strokeWidth={W} />
          <circle cx="31" cy="18" r="6" fill="none" stroke={STROKE} strokeWidth={W} />
          <Face>
            <ellipse cx="20" cy="25.5" rx="2.4" ry="1.8" fill={STROKE} opacity={0.85} />
          </Face>
        </svg>
      )
    default:
      return (
        <svg {...common}>
          <Face />
        </svg>
      )
  }
}

export default function AnimalIcon(props: Props) {
  return <IconSvg {...props} />
}
