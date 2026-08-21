import { useEffect, useRef } from 'react'
import katex from 'katex'
import { ContentBlock, HeadingBlock } from '@/types'
import LatexText from '@/components/LatexText'

interface Props { blocks: ContentBlock[] }

export default function LessonRenderer({ blocks }: Props) {
  if (!blocks || blocks.length === 0) return null

  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        if (block.type === 'heading') {
          const { level, content } = block as HeadingBlock
          if (level === 1) return <h1 key={i} className="text-xl font-bold text-gray-900 mt-6 mb-1 pb-1 border-b border-border">{content}</h1>
          if (level === 2) return <h2 key={i} className="text-lg font-semibold text-gray-800 mt-4 mb-1">{content}</h2>
          return <h3 key={i} className="text-base font-semibold text-gray-700 mt-3 mb-0.5">{content}</h3>
        }
        if (block.type === 'text') {
          return (
            <p key={i} className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
              <LatexText text={block.content} />
            </p>
          )
        }
        if (block.type === 'formula') {
          return <FormulaBlock key={i} latex={block.latex} />
        }
        if (block.type === 'image') {
          return (
            <figure key={i} className="my-2">
              <img src={block.url} alt={block.caption || ''} className="rounded-lg max-w-full border border-border" />
              {block.caption && <figcaption className="text-xs text-muted mt-1 text-center">{block.caption}</figcaption>}
            </figure>
          )
        }
        return null
      })}
    </div>
  )
}

function FormulaBlock({ latex }: { latex: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) {
      try {
        katex.render(latex, ref.current, { displayMode: true, throwOnError: false })
      } catch {
        if (ref.current) ref.current.textContent = latex
      }
    }
  }, [latex])
  return <div ref={ref} className="overflow-x-auto py-2 text-center" />
}
