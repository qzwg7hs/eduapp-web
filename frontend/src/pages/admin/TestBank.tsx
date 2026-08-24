import { useCallback, useEffect, useRef, useState } from 'react'
import api from '@/api/client'
import { TestBankProblem, ContentLanguage, ProblemType } from '@/types'
import { useI18n } from '@/contexts/I18nContext'
import LatexText from '@/components/LatexText'
import AdminImageUpload from '@/components/AdminImageUpload'
import {
  Upload, Trash2, Globe, EyeOff, Search, X, AlertTriangle, ChevronLeft, ChevronRight, Plus, Pencil,
} from 'lucide-react'

const PAGE_SIZE = 15

interface FormState {
  number: string
  question: string
  problemType: ProblemType
  opts: string[]
  correctOpts: number[]
  answerValue: string
  imageUrl: string
}

const defaultForm = (): FormState => ({
  number: '', question: '', problemType: 'mcq',
  opts: ['', '', '', ''], correctOpts: [0], answerValue: '', imageUrl: '',
})

// Editable "page N / total" between the prev/next buttons — lets the admin
// jump straight to a page instead of clicking through one at a time.
// Local input state so the field can be freely cleared/retyped while
// editing; the jump only commits (clamped to [1, totalPages]) on blur/Enter.
function PageJumpInput({ page, totalPages, onJump }: { page: number; totalPages: number; onJump: (p: number) => void }) {
  const [text, setText] = useState(String(page + 1))
  useEffect(() => { setText(String(page + 1)) }, [page])

  function commit() {
    const n = parseInt(text, 10)
    if (Number.isFinite(n)) {
      onJump(Math.min(Math.max(n, 1), totalPages) - 1)
    } else {
      setText(String(page + 1))
    }
  }

  return (
    <span className="flex items-center gap-1 px-1 text-xs text-muted font-medium">
      <input
        type="number"
        min={1}
        max={totalPages}
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        className="w-12 text-center rounded-md border border-border py-1 text-xs"
      />
      / {totalPages}
    </span>
  )
}

export default function AdminTestBank() {
  const { t } = useI18n()

  const [contentLang, setContentLang] = useState<ContentLanguage>(
    () => (localStorage.getItem('admin-testbank-lang') as ContentLanguage) || 'kz',
  )
  const [problems, setProblems] = useState<TestBankProblem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ imported: number; errors: { number: number; reason: string }[] } | null>(null)
  const [publishOnUpload, setPublishOnUpload] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [deleteTarget, setDeleteTarget] = useState<TestBankProblem | null>(null)

  const [mode, setMode] = useState<'add' | 'edit' | null>(null)
  const [editing, setEditing] = useState<TestBankProblem | null>(null)
  const [form, setForm] = useState<FormState>(defaultForm())
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await api.get<TestBankProblem[]>('/test-bank/admin', { params: { language: contentLang } })
    setProblems(data)
    setLoading(false)
  }, [contentLang])

  useEffect(() => { load() }, [load])

  function switchLang(lang: ContentLanguage) {
    localStorage.setItem('admin-testbank-lang', lang)
    setContentLang(lang)
    setSearch(''); setPage(0)
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('language', contentLang)
      fd.append('publish', String(publishOnUpload))
      const { data } = await api.post('/test-bank/admin/upload', fd)
      setUploadResult(data)
      load()
    } catch (err: any) {
      const detail = err.response?.data?.detail
      alert(typeof detail === 'string' ? detail : 'Upload failed.')
    }
    setUploading(false)
  }

  async function togglePublish(p: TestBankProblem) {
    await api.post(`/test-bank/admin/${p.id}/${p.is_published ? 'unpublish' : 'publish'}`)
    load()
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    await api.delete(`/test-bank/admin/${deleteTarget.id}`)
    setDeleteTarget(null)
    load()
  }

  function openAdd() {
    const nextNumber = problems.length > 0 ? Math.max(...problems.map(p => p.number)) + 1 : 1
    setForm({ ...defaultForm(), number: String(nextNumber) })
    setEditing(null); setFormError(''); setMode('add')
  }

  function openEdit(p: TestBankProblem) {
    let answerValue = ''
    if (p.problem_type === 'open' && p.open_answer) {
      answerValue = String((p.open_answer as any).value ?? '')
    }
    setForm({
      number: String(p.number),
      question: p.question,
      problemType: p.problem_type,
      opts: p.options?.length ? [...p.options] : ['', '', '', ''],
      correctOpts: p.correct_options?.length ? p.correct_options : [p.correct_option ?? 0],
      answerValue,
      imageUrl: p.image_url ?? '',
    })
    setEditing(p); setFormError(''); setMode('edit')
  }

  function closeForm() { setMode(null); setEditing(null); setForm(defaultForm()) }

  function toggleCorrectOpt(i: number) {
    setForm(f => ({ ...f, correctOpts: [i] }))
  }

  async function saveForm(isDraft: boolean) {
    if (!form.question.trim()) { setFormError(t('admin.modal.question_required')); return }
    if (form.problemType === 'mcq') {
      if (form.opts.filter(o => o.trim()).length < 2) { setFormError(t('admin.testbank.options_required')); return }
      if (form.correctOpts.length === 0) { setFormError(t('admin.testbank.correct_required')); return }
    } else if (!form.answerValue.trim()) {
      setFormError(t('admin.testbank.answer_required')); return
    }

    setSaving(true); setFormError('')
    const payload: any = {
      number: parseInt(form.number, 10) || 0,
      language: contentLang,
      question: form.question,
      problem_type: form.problemType,
      options: form.problemType === 'mcq' ? form.opts.filter(o => o.trim()) : [],
      correct_option: form.correctOpts[0] ?? 0,
      correct_options: form.correctOpts,
      open_answer: form.problemType === 'open' ? { type: 'single', value: parseInt(form.answerValue, 10) } : null,
      image_url: form.imageUrl.trim() || null,
      is_draft: isDraft,
    }
    try {
      if (editing) {
        delete payload.language // language is fixed once created
        await api.put(`/test-bank/admin/${editing.id}`, payload)
      } else {
        await api.post('/test-bank/admin', payload)
      }
      closeForm(); load()
    } catch (err: any) {
      setFormError(err.response?.data?.detail || 'Failed to save.')
    }
    setSaving(false)
  }

  const filtered = problems.filter(p => !search || p.question.toLowerCase().includes(search.toLowerCase()) || String(p.number).includes(search))
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const publishedCount = problems.filter(p => p.is_published).length

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-8 py-6">
      <input ref={fileInputRef} type="file" accept=".docx" className="hidden" onChange={handleUpload} />

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-semibold text-gray-900">{t('admin.testbank.title')}</h1>
          <p className="text-sm text-muted mt-0.5">
            {t('admin.testbank.count', { n: problems.length, m: publishedCount })}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="inline-flex rounded-lg border border-border overflow-hidden">
            {(['kz', 'ru'] as ContentLanguage[]).map(lang => (
              <button
                key={lang}
                onClick={() => switchLang(lang)}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                  contentLang === lang ? 'bg-primary text-white' : 'bg-surface text-muted hover:bg-gray-50'
                }`}
              >
                {lang === 'kz' ? 'Қазақша' : 'Русский'}
              </button>
            ))}
          </div>
          <button className="btn-ghost flex items-center gap-2" onClick={openAdd}>
            <Plus className="w-4 h-4" /> {t('admin.testbank.add')}
          </button>
          <label className="flex items-center gap-1.5 text-xs text-muted font-medium">
            <input type="checkbox" checked={publishOnUpload} onChange={e => setPublishOnUpload(e.target.checked)} className="accent-primary" />
            {t('admin.testbank.publish_on_upload')}
          </label>
          <button
            className="btn-primary flex items-center gap-2"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-4 h-4" /> {uploading ? t('admin.testbank.uploading') : t('admin.testbank.upload')}
          </button>
        </div>
      </div>

      <p className="text-xs text-muted mb-4">{t('admin.testbank.format_note')}</p>

      {loading ? (
        <div className="flex justify-center items-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : problems.length === 0 ? (
        <div className="text-center py-16 bg-surface rounded-2xl border border-dashed border-border">
          <p className="font-display font-semibold text-gray-900 text-lg">{t('admin.testbank.no_questions_title')}</p>
          <p className="text-sm text-muted mt-1">{t('admin.testbank.no_questions_sub')}</p>
        </div>
      ) : (
        <>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
            <input
              className="w-full pl-9 pr-9 py-2 rounded-xl border border-border bg-surface text-sm text-gray-900 placeholder:text-muted focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
              placeholder={t('admin.testbank.search_placeholder')}
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0) }}
            />
            {search && (
              <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-gray-700" onClick={() => { setSearch(''); setPage(0) }}>
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="space-y-2">
            {paged.map(p => (
              <div key={p.id} className="bg-surface rounded-2xl border overflow-hidden" style={{ borderColor: '#f0e5d4' }}>
                <div className="flex items-start gap-3 px-4 py-3">
                  <span className="flex-shrink-0 w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600">
                    #{p.number}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`badge text-xs ${p.problem_type === 'open' ? 'bg-primary-light text-primary' : 'bg-gray-100 text-gray-600'}`}>
                        {p.problem_type === 'open' ? t('admin.testbank.open') : t('admin.testbank.mcq')}
                      </span>
                      {p.is_published
                        ? <span className="badge bg-success-light text-success">{t('admin.published')}</span>
                        : <span className="badge bg-warning-light text-warning">{t('admin.draft')}</span>}
                    </div>
                    <p className="text-sm text-gray-700 leading-snug">
                      <LatexText text={p.question.slice(0, 140) + (p.question.length > 140 ? '…' : '')} />
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      title={t('admin.edit')}
                      onClick={() => openEdit(p)}
                      className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-muted hover:bg-gray-100 transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      title={p.is_published ? t('admin.unpublish') : t('admin.publish')}
                      onClick={() => togglePublish(p)}
                      className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-muted hover:bg-gray-100 transition-colors"
                    >
                      {p.is_published ? <EyeOff className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
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

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
              <span className="text-xs text-muted">{t('admin.content.n_items', { n: filtered.length })}</span>
              <div className="flex items-center gap-1">
                <button className="p-1.5 rounded-lg border border-border text-muted hover:bg-gray-50 disabled:opacity-40" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <PageJumpInput page={page} totalPages={totalPages} onJump={setPage} />
                <button className="p-1.5 rounded-lg border border-border text-muted hover:bg-gray-50 disabled:opacity-40" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Upload result modal */}
      {uploadResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto p-6 space-y-4 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">{t('admin.testbank.upload_result_title')}</h2>
            <div className="bg-success-light border border-green-200 rounded-lg px-4 py-3 text-sm text-success">
              ✓ {t('admin.testbank.imported', { n: uploadResult.imported })}
            </div>
            {uploadResult.errors.length > 0 && (
              <div className="bg-danger-light border border-red-200 rounded-lg px-4 py-3 text-sm text-danger">
                <p className="font-semibold mb-1">{t('admin.testbank.needs_review', { n: uploadResult.errors.length })}</p>
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
                <h2 className="text-base font-bold text-gray-900 mb-1">{t('admin.testbank.delete_title', { n: deleteTarget.number })}</h2>
                <p className="text-sm text-muted leading-snug">{t('admin.testbank.delete_desc')}</p>
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
              <h2 className="text-lg font-bold">{mode === 'add' ? t('admin.testbank.new_title') : t('admin.testbank.edit_title')}</h2>
              <button onClick={closeForm} className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-gray-700 hover:bg-gray-100 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="label">{t('admin.testbank.number_label')}</label>
              <input
                className="input" type="number" value={form.number}
                onChange={e => setForm(f => ({ ...f, number: e.target.value }))}
              />
            </div>

            <div>
              <label className="label">{t('admin.testbank.question_label')}</label>
              <textarea
                className="input font-mono" rows={3}
                value={form.question}
                onChange={e => setForm(f => ({ ...f, question: e.target.value }))}
                placeholder="$2x + 3 = 7$ ..."
              />
              {form.question && (
                <div className="mt-2 p-3 bg-gray-50 rounded-lg text-sm text-gray-800">
                  <LatexText text={form.question} />
                </div>
              )}
            </div>

            <div>
              <label className="label">{t('admin.upload_image')}</label>
              <AdminImageUpload value={form.imageUrl} onChange={url => setForm(f => ({ ...f, imageUrl: url }))} />
            </div>

            <div>
              <label className="label">{t('admin.testbank.type_label')}</label>
              <div className="flex gap-2">
                {(['mcq', 'open'] as ProblemType[]).map(pt => (
                  <button
                    key={pt}
                    onClick={() => setForm(f => ({ ...f, problemType: pt }))}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      form.problemType === pt ? 'border-primary bg-primary-light text-primary' : 'border-border text-muted hover:bg-gray-50'
                    }`}
                  >
                    {pt === 'mcq' ? `☑ ${t('admin.testbank.mcq')}` : `✏️ ${t('admin.testbank.open')}`}
                  </button>
                ))}
              </div>
            </div>

            {form.problemType === 'mcq' ? (
              <div>
                <label className="label">{t('admin.testbank.options_label')}</label>
                <p className="text-xs text-muted mb-2">{t('admin.testbank.options_hint')}</p>
                {form.opts.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => toggleCorrectOpt(i)}
                      className={`w-8 h-8 rounded-full text-sm font-bold flex-shrink-0 transition-colors ${
                        form.correctOpts.includes(i) ? 'bg-success text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {['A', 'B', 'C', 'D', 'E', 'F'][i]}
                    </button>
                    <input
                      className="input"
                      value={opt}
                      onChange={e => { const o = [...form.opts]; o[i] = e.target.value; setForm(f => ({ ...f, opts: o })) }}
                      placeholder={`${['A', 'B', 'C', 'D', 'E', 'F'][i]}`}
                    />
                  </div>
                ))}
                <button type="button" className="text-xs text-primary font-medium" onClick={() => setForm(f => ({ ...f, opts: [...f.opts, ''] }))} disabled={form.opts.length >= 6}>
                  {t('admin.testbank.add_option')}
                </button>
              </div>
            ) : (
              <div>
                <label className="label">{t('admin.testbank.answer_label')}</label>
                <input
                  className="input" type="number" step="1"
                  value={form.answerValue}
                  onChange={e => setForm(f => ({ ...f, answerValue: e.target.value }))}
                  placeholder="42"
                />
              </div>
            )}

            {formError && <div className="bg-danger-light border border-red-200 rounded-lg px-3 py-2 text-sm text-danger">{formError}</div>}

            <div className="flex gap-2">
              <button className="btn-primary flex-1" onClick={() => saveForm(true)} disabled={saving}>
                {saving ? t('admin.saving') : t('admin.save')}
              </button>
              <button className="btn-secondary flex-1" onClick={() => saveForm(false)} disabled={saving}>
                {t('admin.modal.save_publish')}
              </button>
            </div>
            <button className="btn-ghost w-full" onClick={closeForm}>{t('admin.cancel')}</button>
          </div>
        </div>
      )}
    </div>
  )
}
