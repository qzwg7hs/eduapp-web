import { useRef } from 'react'
import { useI18n } from '@/contexts/I18nContext'
import FormulaPreview from '@/components/FormulaPreview'

interface Props {
  value: string
  onChange: (latex: string) => void
}

// A snippet, as (textBefore, textAfter, cursorBack) — inserted at the
// cursor (or wrapped around a selection, for the ones that take an
// argument), with the cursor left `cursorBack` characters from the end of
// the inserted text so it lands inside the first empty {} rather than
// after the whole snippet.
const BUTTONS: { label: string; before: string; after: string; cursorBack: number }[] = [
  { label: 'a/b', before: '\\frac{', after: '}{}', cursorBack: 2 },
  { label: 'xⁿ', before: '', after: '^{}', cursorBack: 1 },
  { label: '√', before: '\\sqrt{', after: '}', cursorBack: 1 },
  { label: 'x₍ᵢ₎', before: '', after: '_{}', cursorBack: 1 },
  { label: '( )', before: '(', after: ')', cursorBack: 1 },
  { label: '×', before: '', after: '\\times ', cursorBack: 0 },
  { label: '÷', before: '', after: '\\div ', cursorBack: 0 },
  { label: '±', before: '', after: '\\pm ', cursorBack: 0 },
  { label: '≤', before: '', after: '\\leq ', cursorBack: 0 },
  { label: '≥', before: '', after: '\\geq ', cursorBack: 0 },
  { label: '≠', before: '', after: '\\neq ', cursorBack: 0 },
  { label: '°', before: '', after: '^\\circ ', cursorBack: 0 },
  { label: 'π', before: '', after: '\\pi ', cursorBack: 0 },
  { label: 'α', before: '', after: '\\alpha ', cursorBack: 0 },
  { label: 'β', before: '', after: '\\beta ', cursorBack: 0 },
  { label: 'θ', before: '', after: '\\theta ', cursorBack: 0 },
]

// A small set of insert-at-cursor template buttons over a plain text
// field, instead of a full LaTeX syntax requirement — a student who
// doesn't know LaTeX can build e.g. "a/b" or "√" by tapping a button; one
// who does already know the syntax can just type it directly, since this
// is still a normal editable text field underneath (the buttons are a
// shortcut, not the only way in). The field stores real LaTeX either way,
// rendered live below exactly as it will appear once saved (FormulaPreview
// is the same renderer LessonRenderer uses for a saved formula block).
export default function SimpleFormulaInput({ value, onChange }: Props) {
  const { t } = useI18n()
  const ref = useRef<HTMLTextAreaElement>(null)

  function insert(before: string, after: string, cursorBack: number) {
    const el = ref.current
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    const selected = value.slice(start, end)
    const inserted = before + selected + after
    const next = value.slice(0, start) + inserted + value.slice(end)
    onChange(next)
    const caret = start + inserted.length - cursorBack
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(caret, caret)
    })
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-1.5">
        {BUTTONS.map(b => (
          <button
            key={b.label}
            type="button"
            onClick={() => insert(b.before, b.after, b.cursorBack)}
            className="w-9 h-8 rounded-lg border border-border bg-surface text-sm font-medium text-gray-700 hover:bg-bg hover:border-primary/40 transition-colors flex-shrink-0"
          >
            {b.label}
          </button>
        ))}
      </div>
      <textarea
        ref={ref}
        className="input font-mono text-sm resize-y w-full"
        rows={2}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={t('submit.formula_placeholder')}
      />
      {value.trim() && (
        <div className="mt-1 border border-border rounded-lg bg-bg">
          <FormulaPreview latex={value} />
        </div>
      )}
    </div>
  )
}
