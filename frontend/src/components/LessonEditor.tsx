import { useState } from 'react'
import { ContentBlock, TextBlock, FormulaBlock, ImageBlock } from '@/types'
import LessonRenderer from './LessonRenderer'
import AdminImageUpload from './AdminImageUpload'

interface Props {
  blocks: ContentBlock[]
  onChange: (blocks: ContentBlock[]) => void
}

export default function LessonEditor({ blocks, onChange }: Props) {
  const [preview, setPreview] = useState(false)

  function add(type: ContentBlock['type']) {
    const newBlock: ContentBlock =
      type === 'text' ? { type: 'text', content: '' } :
      type === 'formula' ? { type: 'formula', latex: '' } :
      type === 'heading' ? { type: 'heading', level: 2, content: '' } :
      { type: 'image', url: '', caption: '' }
    onChange([...blocks, newBlock])
  }

  function remove(i: number) {
    onChange(blocks.filter((_, idx) => idx !== i))
  }

  function move(i: number, dir: -1 | 1) {
    const next = [...blocks]
    const j = i + dir
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }

  function update(i: number, patch: Partial<ContentBlock>) {
    onChange(blocks.map((b, idx) => idx === i ? { ...b, ...patch } as ContentBlock : b))
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <button type="button" onClick={() => add('heading')} className="btn-ghost text-xs py-1.5 px-3">+ Heading</button>
        <button type="button" onClick={() => add('text')} className="btn-ghost text-xs py-1.5 px-3">+ Text</button>
        <button type="button" onClick={() => add('formula')} className="btn-ghost text-xs py-1.5 px-3">+ Formula</button>
        <button type="button" onClick={() => add('image')} className="btn-ghost text-xs py-1.5 px-3">+ Image</button>
        <button type="button" onClick={() => setPreview(p => !p)} className={`ml-auto text-xs py-1.5 px-3 btn ${preview ? 'btn-primary' : 'btn-ghost'}`}>
          {preview ? 'Edit' : 'Preview'}
        </button>
      </div>

      {preview ? (
        <div className="border border-border rounded-lg p-4 min-h-20 bg-bg">
          {blocks.length === 0
            ? <p className="text-muted text-sm italic">No content yet.</p>
            : <LessonRenderer blocks={blocks} />
          }
        </div>
      ) : (
        <div className="space-y-3">
          {blocks.length === 0 && (
            <p className="text-sm text-muted italic py-4 text-center border border-dashed border-border rounded-lg">
              Add blocks above to build lesson content.
            </p>
          )}
          {blocks.map((block, i) => (
            <div key={i} className="border border-border rounded-lg p-3 bg-surface">
              <div className="flex items-center gap-2 mb-2">
                <span className="badge bg-gray-100 text-gray-600 capitalize">{block.type}</span>
                <div className="ml-auto flex items-center gap-1">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="text-muted hover:text-gray-700 disabled:opacity-30 px-1">↑</button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === blocks.length - 1} className="text-muted hover:text-gray-700 disabled:opacity-30 px-1">↓</button>
                  <button type="button" onClick={() => remove(i)} className="text-danger hover:text-red-700 px-1 ml-1">✕</button>
                </div>
              </div>

              {block.type === 'heading' && (
                <div className="flex items-center gap-2">
                  <select
                    className="input w-20 flex-shrink-0"
                    value={block.level}
                    onChange={e => update(i, { level: Number(e.target.value) as 1 | 2 | 3 })}
                  >
                    <option value={1}>H1</option>
                    <option value={2}>H2</option>
                    <option value={3}>H3</option>
                  </select>
                  <input
                    className="input"
                    value={block.content}
                    onChange={e => update(i, { content: e.target.value })}
                    placeholder="Heading text…"
                  />
                </div>
              )}
              {block.type === 'text' && (
                <textarea
                  className="input resize-y"
                  rows={4}
                  value={block.content}
                  onChange={e => update(i, { content: e.target.value })}
                  placeholder="Enter text content… Use **bold**, [[red:text]]/[[blue:...]]/[[green:...]]/[[orange:...]] for emphasis, and $formula$ or $$formula$$ for LaTeX."
                />
              )}
              {block.type === 'formula' && (
                <input
                  className="input font-mono"
                  value={block.latex}
                  onChange={e => update(i, { latex: e.target.value })}
                  placeholder="LaTeX formula, e.g. x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}"
                />
              )}
              {block.type === 'image' && (
                <div className="space-y-2">
                  <AdminImageUpload value={block.url} onChange={url => update(i, { url })} />
                  <input
                    className="input"
                    value={block.caption ?? ''}
                    onChange={e => update(i, { caption: e.target.value })}
                    placeholder="Caption (optional)"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
