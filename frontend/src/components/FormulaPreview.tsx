import { useEffect, useRef } from 'react'
import katex from 'katex'

interface Props { latex: string; className?: string }

// Shared KaTeX render target — used by LessonRenderer's formula blocks and
// by SimpleFormulaInput's live preview while composing one, so both show
// exactly the same rendering (no risk of the editor preview looking
// different from how it actually displays once saved).
export default function FormulaPreview({ latex, className }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    if (!latex.trim()) {
      ref.current.textContent = ''
      return
    }
    try {
      katex.render(latex, ref.current, { displayMode: true, throwOnError: false })
    } catch {
      if (ref.current) ref.current.textContent = latex
    }
  }, [latex])
  return <div ref={ref} className={className ?? 'overflow-x-auto py-2 text-center'} />
}
