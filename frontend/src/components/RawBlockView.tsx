import { useState } from 'react'
import { ContentBlock } from '@/types'
import { useI18n } from '@/contexts/I18nContext'
import { Copy, Check, Download } from 'lucide-react'

function CopyButton({ text }: { text: string }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard permission denied — nothing to fall back to */ }
  }
  return (
    <button
      type="button" onClick={copy}
      className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg transition-colors flex-shrink-0"
      style={copied ? { background: '#e7f2ec', color: '#2a7d5f' } : { background: '#f0e5d4', color: '#8a8072' }}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? t('admin.submissions.copied') : t('admin.submissions.copy')}
    </button>
  )
}

function RawField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-muted">{label}</span>
        <CopyButton text={value} />
      </div>
      <pre className="text-xs font-mono bg-bg border border-border rounded-lg p-2 whitespace-pre-wrap break-words select-all">
        {value || '—'}
      </pre>
    </div>
  )
}

interface Props { block: ContentBlock }

// The raw, underlying data behind one content block — shown alongside the
// pretty rendered preview (LessonRenderer) so an admin can copy the exact
// source (plain text, raw LaTeX, image URL) rather than only seeing the
// finished look of it, e.g. to paste a formula straight into the real
// Test Bank / lesson content editor elsewhere.
export default function RawBlockView({ block }: Props) {
  const { t } = useI18n()

  if (block.type === 'heading') {
    return <RawField label={`${t('admin.submissions.block_heading')} (H${block.level})`} value={block.content} />
  }
  if (block.type === 'text') {
    return <RawField label={t('admin.submissions.block_text')} value={block.content} />
  }
  if (block.type === 'formula') {
    return <RawField label={t('admin.submissions.block_formula_latex')} value={block.latex} />
  }
  if (block.type === 'image') {
    return (
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-muted">{t('admin.submissions.block_image')}</span>
          <div className="flex items-center gap-1.5">
            <CopyButton text={block.url} />
            {block.url && (
              <a
                href={block.url} download target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg bg-bg text-muted hover:text-primary transition-colors"
              >
                <Download className="w-3 h-3" /> {t('admin.submissions.download')}
              </a>
            )}
          </div>
        </div>
        {block.url
          ? <img src={block.url} alt="" className="max-h-28 rounded-lg border border-border object-contain" />
          : <p className="text-xs text-muted">—</p>}
        {block.caption && <p className="text-xs text-muted mt-1">{t('admin.submissions.block_caption')}: {block.caption}</p>}
      </div>
    )
  }
  return null
}
