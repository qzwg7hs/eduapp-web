// Mirrors backend/app/cosmetics.py's COLORS catalog — kept small and static
// enough that duplicating it here (rather than fetching it on every page)
// is simpler than plumbing a shared source across the whole student layout.
export const COSMETIC_COLORS = [
  { key: 'blue',     hex: '#cfe3f0', accent: '#4a90c2' },
  { key: 'sage',     hex: '#d7e4d1', accent: '#5a9e6f' },
  { key: 'pink',     hex: '#f3dde0', accent: '#d97a94' },
  { key: 'lavender', hex: '#e3ddf0', accent: '#8b7fc7' },
  { key: 'sand',     hex: '#ede0c8', accent: '#c9a15a' },
  { key: 'mint',     hex: '#d3ede4', accent: '#3aab8f' },
  { key: 'peach',    hex: '#f2e0d0', accent: '#e0935a' },
  { key: 'rose',     hex: '#e8d5da', accent: '#c47a8f' },
  { key: 'gold',     hex: '#f2e2ad', accent: '#c99a2e' },
  { key: 'silver',   hex: '#e3e6ea', accent: '#7c8794' },
]

export function accentFor(equippedHex: string | null | undefined): string | null {
  return COSMETIC_COLORS.find(c => c.hex === equippedHex)?.accent ?? null
}

const DEFAULT_ACCENT = '#e8622c'
const DEFAULT_ACCENT_LIGHT = '#fdeadd'

// Applies (or clears) the personal theme CSS variables on <html>. Called
// from StudentLayout whenever the profile loads/changes, and from
// AdminLayout unconditionally on mount — admin always sees the default,
// regardless of any student session that used the same browser tab before.
export function applyThemeAccent(equippedHex: string | null | undefined) {
  const accent = accentFor(equippedHex)
  const root = document.documentElement.style
  root.setProperty('--accent', accent ?? DEFAULT_ACCENT)
  root.setProperty('--accent-light', equippedHex ?? DEFAULT_ACCENT_LIGHT)
}

export function resetThemeAccent() {
  const root = document.documentElement.style
  root.setProperty('--accent', DEFAULT_ACCENT)
  root.setProperty('--accent-light', DEFAULT_ACCENT_LIGHT)
}
