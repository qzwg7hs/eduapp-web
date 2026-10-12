import { useState } from 'react'
import { useI18n } from '@/contexts/I18nContext'
import { ContentBlock } from '@/types'
import LessonRenderer from './LessonRenderer'
import SimpleFormulaInput from './SimpleFormulaInput'
import StudentImageUpload from './StudentImageUpload'
import { Plus, ArrowUp, ArrowDown, Trash2, Eye, Pencil } from 'lucide-react'

interface Props {
  blocks: ContentBlock[]
  onChange: (blocks: ContentBlock[]) => void
}

// The per-block type badge must be localized too — block.type is a raw
// English-only storage key ("text"/"formula"/...), never shown as-is.
const TYPE_LABEL_KEYS: Record<ContentBlock['type'], string> = {
  heading: 'submit.add_heading',
  text: 'submit.add_text',
  formula: 'submit.add_formula',
  image: 'submit.add_image',
}

// Same add/remove/move/update shape as LessonEditor (the admin lesson-content
// editor) — only the formula input (SimpleFormulaInput's template buttons
// instead of a raw-LaTeX field) and image picker (student upload endpoint)
// differ, since a student authoring their own problem can't be expected to
// already know LaTeX syntax or have admin upload access.
export default function ProblemSubmissionEditor({ blocks, onChange }: Props) {
  const { t } = useI18n()
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
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <button type="button" onClick={() => add('heading')} className="btn-ghost text-xs py-1.5 px-3 flex items-center gap-1"><Plus className="w-3.5 h-3.5" />{t('submit.add_heading')}</button>
        <button type="button" onClick={() => add('text')} className="btn-ghost text-xs py-1.5 px-3 flex items-center gap-1"><Plus className="w-3.5 h-3.5" />{t('submit.add_text')}</button>
        <button type="button" onClick={() => add('formula')} className="btn-ghost text-xs py-1.5 px-3 flex items-center gap-1"><Plus className="w-3.5 h-3.5" />{t('submit.add_formula')}</button>
        <button type="button" onClick={() => add('image')} className="btn-ghost text-xs py-1.5 px-3 flex items-center gap-1"><Plus className="w-3.5 h-3.5" />{t('submit.add_image')}</button>
        <button
          type="button" onClick={() => setPreview(p => !p)}
          className="ml-auto text-xs py-1.5 px-3 rounded-lg font-semibold flex items-center gap-1.5 transition-colors"
          style={preview ? { background: 'var(--accent, #e8622c)', color: '#fff' } : { background: '#f0e5d4', color: '#8a8072' }}
        >
          {preview ? <Pencil className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {preview ? t('submit.edit') : t('submit.preview')}
        </button>
      </div>

      {preview ? (
        <div className="border border-border rounded-xl p-4 min-h-20 bg-bg">
          {blocks.length === 0
            ? <p className="text-muted text-sm italic">{t('submit.no_content_yet')}</p>
            : <LessonRenderer blocks={blocks} />
          }
        </div>
      ) : (
        <div className="space-y-3">
          {blocks.length === 0 && (
            <p className="text-sm text-muted italic py-6 text-center border border-dashed border-border rounded-xl">
              {t('submit.empty_hint')}
            </p>
          )}
          {blocks.map((block, i) => (
            <div key={i} className="border border-border rounded-xl p-3 bg-surface">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-bg text-muted">{t(TYPE_LABEL_KEYS[block.type])}</span>
                <div className="ml-auto flex items-center gap-1">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="text-muted hover:text-gray-700 disabled:opacity-30 p-1"><ArrowUp className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === blocks.length - 1} className="text-muted hover:text-gray-700 disabled:opacity-30 p-1"><ArrowDown className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => remove(i)} className="text-danger hover:text-red-700 p-1 ml-1"><Trash2 className="w-3.5 h-3.5" /></button>
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
                    placeholder={t('submit.heading_placeholder')}
                  />
                </div>
              )}
              {block.type === 'text' && (
                <textarea
                  className="input resize-y"
                  rows={4}
                  value={block.content}
                  onChange={e => update(i, { content: e.target.value })}
                  placeholder={t('submit.text_placeholder')}
                />
              )}
              {block.type === 'formula' && (
                <SimpleFormulaInput value={block.latex} onChange={latex => update(i, { latex })} />
              )}
              {block.type === 'image' && (
                <div className="space-y-2">
                  <StudentImageUpload value={block.url} onChange={url => update(i, { url })} />
                  <input
                    className="input"
                    value={block.caption ?? ''}
                    onChange={e => update(i, { caption: e.target.value })}
                    placeholder={t('submit.caption_placeholder')}
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
