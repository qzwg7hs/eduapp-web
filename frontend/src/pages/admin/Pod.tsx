import { useCallback, useEffect, useRef, useState } from 'react'
import api from '@/api/client'
import { PodAdminOut } from '@/types'
import { useI18n } from '@/contexts/I18nContext'
import LatexText from '@/components/LatexText'
import { Upload, Trash2, ChevronUp, ChevronDown, Plus, Pencil, X, AlertTriangle } from 'lucide-react'

interface FormState {
  questionKz: string
  questionRu: string
  descriptionKz: string
  descriptionRu: string
  answer: string
  image: File | null
  imagePreview: string | null
  existingImageUrl: string | null
}

const defaultForm = (): FormState => ({
  questionKz: '', questionRu: '', descriptionKz: '', descriptionRu: '',
  answer: '', image: null, imagePreview: null, existingImageUrl: null,
})

export default function AdminPod() {
  const { t } = useI18n()

  const [pods, setPods] = useState<PodAdminOut[]>([])
  const [loading, setLoading] = useState(true)

  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ imported: number; errors: { number: number; reason: string }[] } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [deleteTarget, setDeleteTarget] = useState<PodAdminOut | null>(null)

  const [mode, setMode] = useState<'add' | 'edit' | null>(null)
  const [editing, setEditing] = useState<PodAdminOut | null>(null)
  const [form, setForm] = useState<FormState>(defaultForm())
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await api.get<PodAdminOut[]>('/pod/admin/list')
    setPods(data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function todayIso() { return new Date().toISOString().split('T')[0] }
  function tomorrowIso() {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().split('T')[0]
  }
  function nextQueueDate(): string {
    if (pods.length === 0) return todayIso()
    const last = pods[pods.length - 1].date
    const d = new Date(last + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + 1)
    return d.toISOString().split('T')[0]
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const { data } = await api.post('/pod/admin/upload', fd)
      setUploadResult(data)
      load()
    } catch (err: any) {
      const detail = err.response?.data?.detail
      alert(typeof detail === 'string' ? detail : 'Upload failed.')
    }
    setUploading(false)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    await api.delete(`/pod/admin/${deleteTarget.id}`)
    setDeleteTarget(null)
    load()
  }

  async function move(p: PodAdminOut, direction: 'up' | 'down') {
    await api.post(`/pod/admin/${p.id}/move`, null, { params: { direction } })
    load()
  }

  function openAdd() {
    setForm(defaultForm())
    setEditing(null); setFormError(''); setMode('add')
  }

  function openEdit(p: PodAdminOut) {
    setForm({
      questionKz: p.question_kz,
      questionRu: p.question_ru,
      descriptionKz: p.description_kz ?? '',
      descriptionRu: p.description_ru ?? '',
      answer: p.correct_answer,
      image: null,
      imagePreview: null,
      existingImageUrl: p.image_url ?? null,
    })
    setEditing(p); setFormError(''); setMode('edit')
  }

  function closeForm() { setMode(null); setEditing(null); setForm(defaultForm()) }

  function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setForm(f => ({ ...f, image: file, imagePreview: file ? URL.createObjectURL(file) : null }))
  }

  async function saveForm() {
    if (!form.questionKz.trim() || !form.questionRu.trim() || !form.answer.trim()) {
      setFormError(t('admin.modal.question_required'))
      return
    }
    setSaving(true); setFormError('')
    try {
      const fd = new FormData()
      fd.append('question_kz', form.questionKz)
      fd.append('question_ru', form.questionRu)
      fd.append('correct_answer', form.answer.trim().toLowerCase())
      if (form.descriptionKz.trim()) fd.append('description_kz', form.descriptionKz.trim())
      if (form.descriptionRu.trim()) fd.append('description_ru', form.descriptionRu.trim())
      if (form.image) fd.append('image', form.image)

      if (editing) {
        await api.put(`/pod/admin/${editing.id}`, fd)
      } else {
        fd.append('date', nextQueueDate())
        await api.post('/pod/admin', fd)
      }
      closeForm(); load()
    } catch (err: any) {
      const detail = err.response?.data?.detail
      setFormError(typeof detail === 'string' ? detail : 'Failed to save.')
    }
    setSaving(false)
  }

  const today = todayIso()
  const tomorrow = tomorrowIso()

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 lg:px-8 py-6">
      <input ref={fileInputRef} type="file" accept=".docx" className="hidden" onChange={handleUpload} />

      <div className="flex items-center justify-between mb-1 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-semibold text-gray-900">{t('admin.pod.title')}</h1>
          <p className="text-sm text-muted mt-0.5">{t('admin.pod.count', { n: pods.length })}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button className="btn-ghost flex items-center gap-2" onClick={openAdd}>
            <Plus className="w-4 h-4" /> {t('admin.pod.add')}
          </button>
          <button
            className="btn-primary flex items-center gap-2"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-4 h-4" /> {uploading ? t('admin.pod.uploading') : t('admin.pod.upload')}
          </button>
        </div>
      </div>

      <p className="text-xs text-muted mb-6 max-w-xl">{t('admin.pod.subtitle')}</p>

      {pods.length === 0 ? (
        <div className="text-center py-16 bg-surface rounded-2xl border border-dashed border-border">
          <p className="font-display font-semibold text-gray-900 text-lg">{t('admin.pod.no_problems_title')}</p>
          <p className="text-sm text-muted mt-1">{t('admin.pod.no_problems_sub')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pods.map((p, i) => (
            <div key={p.id} className="bg-surface rounded-2xl border overflow-hidden" style={{ borderColor: '#f0e5d4' }}>
              <div className="flex items-start gap-3 px-4 py-3">
                <div className="flex flex-col items-center gap-1 flex-shrink-0 pt-0.5">
                  <button
                    title={t('admin.pod.move_up')}
                    disabled={i === 0}
                    onClick={() => move(p, 'up')}
                    className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-muted hover:bg-gray-100 disabled:opacity-30 transition-colors"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    title={t('admin.pod.move_down')}
                    disabled={i === pods.length - 1}
                    onClick={() => move(p, 'down')}
                    className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-muted hover:bg-gray-100 disabled:opacity-30 transition-colors"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-shrink-0 w-24 text-center">
                  <span className="block text-sm font-bold text-gray-700">{p.date}</span>
                  {p.date === today && <span className="badge bg-teal-light text-teal text-[10px] mt-1">{t('admin.pod.today_badge')}</span>}
                  {p.date === tomorrow && <span className="badge bg-warning-light text-warning text-[10px] mt-1">{t('admin.pod.tomorrow_badge')}</span>}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 leading-snug">
                    <LatexText text={p.question_kz.slice(0, 110) + (p.question_kz.length > 110 ? '…' : '')} />
                  </p>
                  <p className="text-xs text-muted mt-1">{t('admin.pod.correct_answer_label', { answer: p.correct_answer })}</p>
                </div>

                {p.image_url && (
                  <img src={p.image_url} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-border" />
                )}

                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    title={t('admin.edit')}
                    onClick={() => openEdit(p)}
                    className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-muted hover:bg-gray-100 transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    title={t('admin.delete')}
                    onClick={() => setDeleteTarget(p)}
                    className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 bg-gray-50 border border-border rounded-xl p-4">
        <p className="text-sm font-semibold text-gray-700 mb-2">{t('admin.pod.rules_title')}</p>
        <ul className="space-y-1 text-xs text-muted">
          <li>• {t('admin.pod.rule1')}</li>
          <li>• {t('admin.pod.rule2')}</li>
          <li>• {t('admin.pod.rule3')}</li>
          <li>• {t('admin.pod.rule4')}</li>
          <li>• {t('admin.pod.rule5')}</li>
        </ul>
      </div>

      {/* Upload result modal */}
      {uploadResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto p-6 space-y-4 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">{t('admin.pod.upload_result_title')}</h2>
            <div className="bg-success-light border border-green-200 rounded-lg px-4 py-3 text-sm text-success">
              ✓ {t('admin.pod.imported', { n: uploadResult.imported })}
            </div>
            {uploadResult.errors.length > 0 && (
              <div className="bg-danger-light border border-red-200 rounded-lg px-4 py-3 text-sm text-danger">
                <p className="font-semibold mb-1">{t('admin.pod.needs_review', { n: uploadResult.errors.length })}</p>
                <ul className="space-y-0.5 list-disc list-inside">
                  {uploadResult.errors.map((e, i) => <li key={i}>Задача {e.number}: {e.reason}</li>)}
                </ul>
              </div>
            )}
            <button className="btn-primary w-full" onClick={() => setUploadResult(null)}>{t('admin.upload.done')}</button>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <div className="flex gap-4 mb-5">
              <div className="w-11 h-11 rounded-full bg-danger/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5 text-danger" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900 mb-1">{t('admin.pod.delete_title', { date: deleteTarget.date })}</h2>
                <p className="text-sm text-muted leading-snug">{t('admin.pod.delete_desc')}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="flex-1 py-2 rounded-xl border border-border text-sm font-semibold text-gray-700 hover:bg-gray-50" onClick={() => setDeleteTarget(null)}>
                {t('admin.cancel')}
              </button>
              <button className="flex-1 py-2 rounded-xl bg-danger text-white text-sm font-semibold hover:bg-red-700 flex items-center justify-center gap-1.5" onClick={confirmDelete}>
                <Trash2 className="w-4 h-4" /> {t('admin.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit modal */}
      {mode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold">{mode === 'add' ? t('admin.pod.new_title') : t('admin.pod.edit_title')}</h2>
              <button onClick={closeForm} className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-gray-700 hover:bg-gray-100 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {mode === 'add' && (
              <p className="text-xs text-muted">{t('admin.pod.scheduled_for', { date: nextQueueDate() })}</p>
            )}

            <div>
              <label className="label">{t('admin.pod.question_kz_label')}</label>
              <textarea
                className="input font-mono" rows={3}
                value={form.questionKz}
                onChange={e => setForm(f => ({ ...f, questionKz: e.target.value }))}
              />
              {form.questionKz && (
                <div className="mt-2 p-3 bg-gray-50 rounded-lg text-sm text-gray-800">
                  <LatexText text={form.questionKz} />
                </div>
              )}
            </div>

            <div>
              <label className="label">{t('admin.pod.question_ru_label')}</label>
              <textarea
                className="input font-mono" rows={3}
                value={form.questionRu}
                onChange={e => setForm(f => ({ ...f, questionRu: e.target.value }))}
              />
              {form.questionRu && (
                <div className="mt-2 p-3 bg-gray-50 rounded-lg text-sm text-gray-800">
                  <LatexText text={form.questionRu} />
                </div>
              )}
            </div>

            <div>
              <label className="label">{t('admin.pod.description_kz_label')}</label>
              <textarea
                className="input font-mono text-sm" rows={2}
                value={form.descriptionKz}
                onChange={e => setForm(f => ({ ...f, descriptionKz: e.target.value }))}
              />
            </div>

            <div>
              <label className="label">{t('admin.pod.description_ru_label')}</label>
              <textarea
                className="input font-mono text-sm" rows={2}
                value={form.descriptionRu}
                onChange={e => setForm(f => ({ ...f, descriptionRu: e.target.value }))}
              />
            </div>

            <div>
              <label className="label">{t('admin.pod.image')}</label>
              <input className="input" type="file" accept="image/*" onChange={handleImage} />
              {(form.imagePreview || form.existingImageUrl) && (
                <img src={form.imagePreview ?? form.existingImageUrl ?? ''} alt="" className="mt-2 rounded-lg max-h-40 object-contain border border-border" />
              )}
            </div>

            <div>
              <label className="label">{t('admin.pod.answer')}</label>
              <input
                className="input"
                type="text"
                value={form.answer}
                onChange={e => setForm(f => ({ ...f, answer: e.target.value }))}
                autoCapitalize="none"
                autoCorrect="off"
              />
              <p className="text-xs text-muted mt-1">{t('admin.pod.answer_note')}</p>
            </div>

            {formError && <div className="bg-danger-light border border-red-200 rounded-lg px-3 py-2 text-sm text-danger">{formError}</div>}

            <button className="btn-primary w-full" onClick={saveForm} disabled={saving}>
              {saving ? t('admin.saving') : t('admin.save')}
            </button>
            <button className="btn-ghost w-full" onClick={closeForm}>{t('admin.cancel')}</button>
          </div>
        </div>
      )}
    </div>
  )
}
