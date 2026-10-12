import { useEffect, useRef, useState } from 'react'

interface Props {
  value: string // "YYYY-MM-DD", or "" if not set
  onChange: (iso: string) => void
  className?: string
}

function isoToDisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

// A native <input type="date"> displays in whatever format the viewer's
// OS/browser locale dictates (often mm/dd/yyyy) — there's no standard way
// to force a different display format on it. This is a plain text field
// that always shows/accepts dd/mm/yyyy regardless of locale, auto-inserting
// the slashes as the admin types, and only calls onChange with a real ISO
// date once all three parts are filled in.
export default function DateInputDDMMYYYY({ value, onChange, className }: Props) {
  const [text, setText] = useState(() => isoToDisplay(value))
  const lastEmitted = useRef(value)

  // Resync only when `value` changed from OUTSIDE this field (e.g. a parent
  // "reset filters" action) — never fight the admin's own typing, which
  // already drives `value` via onChange below.
  useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value
      setText(isoToDisplay(value))
    }
  }, [value])

  function handleChange(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 8)
    let formatted = digits
    if (digits.length > 4) formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
    else if (digits.length > 2) formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`
    setText(formatted)

    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(formatted)
    const iso = m ? `${m[3]}-${m[2]}-${m[1]}` : ''
    lastEmitted.current = iso
    onChange(iso)
  }

  return (
    <input
      type="text" inputMode="numeric" placeholder="дд/мм/гггг" maxLength={10}
      className={className ?? 'input w-auto'}
      value={text}
      onChange={e => handleChange(e.target.value)}
    />
  )
}
