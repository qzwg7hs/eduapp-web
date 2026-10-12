import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/contexts/I18nContext'
import { CalendarDays } from 'lucide-react'

interface Props {
  value: string // "YYYY-MM-DD", or "" if not set
  onChange: (iso: string) => void
  className?: string
}

function isoToDisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

function pad2(n: number) { return String(n).padStart(2, '0') }

const MONTH_NAMES: Record<'ru' | 'kz', string[]> = {
  ru: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
  kz: ['Қаңтар', 'Ақпан', 'Наурыз', 'Сәуір', 'Мамыр', 'Маусым', 'Шілде', 'Тамыз', 'Қыркүйек', 'Қазан', 'Қараша', 'Желтоқсан'],
}
const WEEKDAY_NAMES: Record<'ru' | 'kz', string[]> = {
  ru: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'],
  kz: ['Дс', 'Сс', 'Ср', 'Бс', 'Жм', 'Сб', 'Жк'],
}

// A native <input type="date"> has a built-in calendar popup, but its text
// display follows whatever format the viewer's OS/browser locale dictates
// (often mm/dd/yyyy) — there's no standard way to force dd/mm/yyyy on it.
// This re-implements just enough of a calendar popup ourselves (month grid,
// prev/next navigation) to get both: a guaranteed dd/mm/yyyy text field
// (still directly typeable, auto-inserting slashes) AND click-to-pick.
export default function DateInputDDMMYYYY({ value, onChange, className }: Props) {
  const { locale } = useI18n()
  const lang: 'ru' | 'kz' = locale === 'kz' ? 'kz' : 'ru'
  const [text, setText] = useState(() => isoToDisplay(value))
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(() => (value ? Number(value.slice(0, 4)) : new Date().getFullYear()))
  const [viewMonth, setViewMonth] = useState(() => (value ? Number(value.slice(5, 7)) - 1 : new Date().getMonth()))
  const lastEmitted = useRef(value)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value
      setText(isoToDisplay(value))
    }
  }, [value])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function emit(iso: string) {
    lastEmitted.current = iso
    onChange(iso)
  }

  function handleChange(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 8)
    let formatted = digits
    if (digits.length > 4) formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
    else if (digits.length > 2) formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`
    setText(formatted)

    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(formatted)
    emit(m ? `${m[3]}-${m[2]}-${m[1]}` : '')
  }

  function openCalendar() {
    if (value) {
      setViewYear(Number(value.slice(0, 4)))
      setViewMonth(Number(value.slice(5, 7)) - 1)
    }
    setOpen(o => !o)
  }

  function pick(day: number) {
    const iso = `${viewYear}-${pad2(viewMonth + 1)}-${pad2(day)}`
    emit(iso)
    setText(isoToDisplay(iso))
    setOpen(false)
  }

  function changeMonth(delta: number) {
    let m = viewMonth + delta
    let y = viewYear
    if (m < 0) { m = 11; y -= 1 }
    if (m > 11) { m = 0; y += 1 }
    setViewMonth(m)
    setViewYear(y)
  }

  const firstOfMonth = new Date(viewYear, viewMonth, 1)
  const startWeekday = (firstOfMonth.getDay() + 6) % 7 // Monday = 0
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const todayIso = new Date().toISOString().slice(0, 10)
  const cells: (number | null)[] = [...Array(startWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  return (
    <div className="relative inline-block" ref={wrapRef}>
      <div className="flex items-center">
        <input
          type="text" inputMode="numeric" placeholder="дд/мм/гггг" maxLength={10}
          className={className ?? 'input w-auto rounded-r-none'}
          value={text}
          onChange={e => handleChange(e.target.value)}
        />
        <button
          type="button" onClick={openCalendar}
          className="input rounded-l-none border-l-0 px-2 flex items-center justify-center text-muted hover:text-primary"
          style={{ width: '2.25rem' }}
        >
          <CalendarDays className="w-4 h-4" />
        </button>
      </div>

      {open && (
        <div
          className="absolute left-0 top-full mt-1 z-20 bg-surface border border-border rounded-xl p-3 w-64"
          style={{ boxShadow: '0 12px 28px -10px rgba(44,36,24,0.25)' }}
        >
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => changeMonth(-1)} className="px-2 py-1 rounded-lg hover:bg-bg text-muted">‹</button>
            <span className="text-sm font-semibold text-gray-900">{MONTH_NAMES[lang][viewMonth]} {viewYear}</span>
            <button type="button" onClick={() => changeMonth(1)} className="px-2 py-1 rounded-lg hover:bg-bg text-muted">›</button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAY_NAMES[lang].map(w => (
              <span key={w} className="text-[10px] font-semibold text-muted text-center">{w}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (day === null) return <span key={i} />
              const iso = `${viewYear}-${pad2(viewMonth + 1)}-${pad2(day)}`
              const isSelected = iso === value
              const isToday = iso === todayIso
              return (
                <button
                  key={i} type="button" onClick={() => pick(day)}
                  className="w-7 h-7 rounded-lg text-xs flex items-center justify-center transition-colors"
                  style={isSelected
                    ? { background: 'var(--accent, #e8622c)', color: '#fff', fontWeight: 600 }
                    : isToday
                    ? { border: '1px solid var(--accent, #e8622c)', color: '#374151' }
                    : { color: '#374151' }}
                  onMouseOver={e => { if (!isSelected) e.currentTarget.style.background = '#f0e5d4' }}
                  onMouseOut={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                >
                  {day}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
