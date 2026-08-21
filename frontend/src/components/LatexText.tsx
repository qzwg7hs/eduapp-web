import katex from 'katex'
import type { ReactNode } from 'react'

interface Props {
  text: string
  className?: string
}

// ── Lightweight rich-text markup (no HTML, no dangerouslySetInnerHTML) ─────────
// Supports: **bold** and [[color:text]] with a small fixed color palette,
// e.g. "[[red:important]]". Used inside plain (non-LaTeX) text segments.

const RICH_COLORS: Record<string, string> = {
  red: '#dc2626',
  blue: '#2563eb',
  green: '#16a34a',
  orange: '#e8622c',
}

function renderRichText(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const re = /\*\*([^*]+)\*\*|\[\[(red|blue|green|orange):([^\]]+)\]\]/g
  let last = 0
  let key = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    if (m[1] !== undefined) {
      nodes.push(<strong key={key++}>{m[1]}</strong>)
    } else {
      nodes.push(<span key={key++} style={{ color: RICH_COLORS[m[2]] }}>{m[3]}</span>)
    }
    last = m.index + m[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

type Part =
  | { type: 'text'; content: string }
  | { type: 'inline'; content: string }
  | { type: 'display'; content: string }

function parse(text: string): Part[] {
  const parts: Part[] = []
  // Match $$...$$ (display) before $...$ (inline) to avoid greedy conflicts
  const re = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      parts.push({ type: 'text', content: text.slice(last, match.index) })
    }
    const raw = match[0]
    if (raw.startsWith('$$')) {
      parts.push({ type: 'display', content: raw.slice(2, -2).trim() })
    } else {
      parts.push({ type: 'inline', content: raw.slice(1, -1).trim() })
    }
    last = match.index + raw.length
  }
  if (last < text.length) {
    parts.push({ type: 'text', content: text.slice(last) })
  }
  return parts
}

function renderLatex(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex, { displayMode, throwOnError: false, output: 'html' })
  } catch {
    return latex
  }
}

export default function LatexText({ text, className }: Props) {
  const parts = parse(text)

  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (part.type === 'display') {
          return (
            <span
              key={i}
              className="block overflow-x-auto py-2 text-center"
              dangerouslySetInnerHTML={{ __html: renderLatex(part.content, true) }}
            />
          )
        }
        if (part.type === 'inline') {
          return (
            <span
              key={i}
              dangerouslySetInnerHTML={{ __html: renderLatex(part.content, false) }}
            />
          )
        }
        return <span key={i} className="whitespace-pre-wrap">{renderRichText(part.content)}</span>
      })}
    </span>
  )
}
