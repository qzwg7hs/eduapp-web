import { useRef, useState } from 'react'
import api from '@/api/client'
import { useI18n } from '@/contexts/I18nContext'
import { Upload, X, Loader2 } from 'lucide-react'

interface Props {
  value: string
  onChange: (url: string) => void
  className?: string
}

/** Shared admin image picker — uploads a local file to storage and stores the
 * resulting URL. Used anywhere an admin can attach an image (lesson content
 * blocks, problem/test images, etc.) instead of pasting a URL by hand. */
export default function AdminImageUpload({ value, onChange, className }: Props) {
  const { t } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const { data } = await api.post<{ url: string }>('/topics/admin/upload-image', fd)
      onChange(data.url)
    } catch (err: any) {
      setError(err.response?.data?.detail || t('admin.upload_image_failed'))
    }
    setUploading(false)
  }

  return (
    <div className={className}>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      {value ? (
        <div className="flex items-start gap-3">
          <img src={value} alt="" className="max-h-32 rounded-lg object-contain border border-border" />
          <button
            type="button"
            onClick={() => onChange('')}
            className="flex items-center gap-1.5 text-xs font-semibold text-danger hover:bg-danger/10 px-2.5 py-1.5 rounded-lg transition-colors"
          >
            <X className="w-3.5 h-3.5" /> {t('admin.remove_image')}
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-2 text-sm text-muted border border-dashed border-border rounded-lg px-4 py-3 hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-50 w-full justify-center"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploading ? t('admin.uploading_image') : t('admin.upload_image')}
        </button>
      )}
      {error && <p className="text-xs text-danger mt-1.5">{error}</p>}
    </div>
  )
}
