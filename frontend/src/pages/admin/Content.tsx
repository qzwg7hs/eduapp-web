import { useCallback, useEffect, useRef, useState } from 'react'
import api from '@/api/client'
import { Topic, SubTopic, Lesson, Problem, ProblemType, UploadResult, ContentLanguage } from '@/types'
import { ContentBlock } from '@/types'
import LessonEditor from '@/components/LessonEditor'
import AdminImageUpload from '@/components/AdminImageUpload'
import LatexText from '@/components/LatexText'
import { useI18n } from '@/contexts/I18nContext'
import {
  Pencil, EyeOff, Globe, Trash2, ChevronRight, ChevronLeft,
  Upload, FileUp, Plus, BookOpen, Layers, FileText,
  HelpCircle, Search, X, AlertTriangle,
  type LucideIcon,
} from 'lucide-react'

type ModalMode =
  | 'add_topic' | 'edit_topic'
  | 'add_subtopic' | 'edit_subtopic'
  | 'add_sst' | 'edit_sst'
  | 'add_problem' | 'edit_problem'
  | null

type DrillView = 'topics' | 'subtopics' | 'lessons' | 'problems'

interface DeleteModalState {
  url: string
  label: string
  refresh: () => void
}

interface FormState {
  title: string
  desc: string
  expl: string
  question: string
  imageUrl: string
  problemType: ProblemType
  opts: string[]
  correctOpts: number[]
  openAnswerType: 'single' | 'set'
  openAnswerValue: string
  openAnswerValues: string
  hint: string
  isHard: boolean
  blocks: ContentBlock[]
  level: string
}

const defaultForm = (): FormState => ({
  title: '', desc: '', expl: '', question: '',
  imageUrl: '',
  problemType: 'mcq',
  opts: ['', '', '', ''],
  correctOpts: [0],
  openAnswerType: 'single',
  openAnswerValue: '',
  openAnswerValues: '',
  hint: '',
  isHard: false,
  blocks: [],
  level: 'A',
})

// High enough that topics/subtopics/lessons/tests all show on a single page in
// practice (current largest list is ~30 problems in one lesson) — pagination
// controls still kick in automatically if a list ever grows past this.
const PAGE_SIZE = 200

// ─── Shared mini-components ──────────────────────────────────────────────────

function StatusBadge({ isDraft, isPublished }: { isDraft: boolean; isPublished: boolean }) {
  const { t } = useI18n()
  if (isDraft) return <span className="badge bg-warning-light text-warning">{t('admin.draft')}</span>
  if (isPublished) return <span className="badge bg-success-light text-success">{t('admin.published')}</span>
  return <span className="badge bg-primary-light text-primary">{t('admin.saved')}</span>
}

function IconBtn({
  icon: Icon, title, onClick, variant = 'default', disabled,
}: {
  icon: LucideIcon; title: string; onClick: () => void
  variant?: 'default' | 'danger' | 'success' | 'muted'; disabled?: boolean
}) {
  const variantCls = {
    default: 'text-muted hover:text-gray-700 hover:bg-gray-100 focus:ring-gray-200',
    danger:  'text-muted hover:text-danger  hover:bg-danger/10  focus:ring-danger/20',
    success: 'text-muted hover:text-success hover:bg-success/10 focus:ring-success/20',
    muted:   'text-muted hover:text-gray-600 hover:bg-gray-100 focus:ring-gray-200',
  }[variant]

  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`w-8 h-8 inline-flex items-center justify-center rounded-lg transition-colors disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-offset-1 ${variantCls}`}
    >
      <Icon className="w-4 h-4" />
    </button>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminContent() {
  const { t } = useI18n()

  const [contentLang, setContentLang] = useState<ContentLanguage>(
    () => (localStorage.getItem('admin-content-lang') as ContentLanguage) || 'kz',
  )

  const [topics,    setTopics]    = useState<Topic[]>([])
  const [subtopics, setSubtopics] = useState<Record<string, SubTopic[]>>({})
  const [lessons,   setLessons]   = useState<Record<string, Lesson[]>>({})
  const [problems,  setProblems]  = useState<Record<string, Problem[]>>({})

  const [view,              setView]             = useState<DrillView>('topics')
  const [selectedTopic,     setSelectedTopic]    = useState<Topic | null>(null)
  const [selectedSubtopic,  setSelectedSubtopic] = useState<SubTopic | null>(null)
  const [selectedLesson,    setSelectedLesson]   = useState<Lesson | null>(null)

  function switchContentLang(lang: ContentLanguage) {
    localStorage.setItem('admin-content-lang', lang)
    setContentLang(lang)
    setView('topics'); setSelectedTopic(null); setSelectedSubtopic(null); setSelectedLesson(null)
  }

  const [exTopics] = useState<Set<string>>(new Set())
  const [exSubs]   = useState<Set<string>>(new Set())
  const [exSSTs]   = useState<Set<string>>(new Set())

  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [mode,    setMode]    = useState<ModalMode>(null)
  const [ctxTopic,   setCtxTopic]   = useState<Topic | null>(null)
  const [ctxSub,     setCtxSub]     = useState<SubTopic | null>(null)
  const [ctxSST,     setCtxSST]     = useState<Lesson | null>(null)
  const [ctxProblem, setCtxProblem] = useState<Problem | null>(null)
  const [form, setForm] = useState<FormState>(defaultForm())

  const lessonInputRef = useRef<HTMLInputElement>(null)
  const [lessonUploadSubId, setLessonUploadSubId] = useState<string | null>(null)
  const [lessonUploading,   setLessonUploading]   = useState(false)

  const testInputRef = useRef<HTMLInputElement>(null)
  const [testUploadSubId, setTestUploadSubId] = useState<string | null>(null)
  const [testUploading,   setTestUploading]   = useState(false)
  const [testResult,      setTestResult]      = useState<UploadResult | null>(null)

  const [deleteModal, setDeleteModal] = useState<DeleteModalState | null>(null)
  const [search, setSearch] = useState('')
  const [page,   setPage]   = useState(0)

  useEffect(() => { setSearch(''); setPage(0) }, [view])

  // ─── Data loaders ────────────────────────────────────────────────────────────

  const loadTopics = useCallback(async () => {
    const { data } = await api.get<Topic[]>('/topics', { params: { language: contentLang } })
    setTopics(data); setLoading(false)
  }, [contentLang])

  useEffect(() => { loadTopics() }, [loadTopics])

  async function loadSubs(tid: string) {
    const { data } = await api.get<SubTopic[]>(`/topics/${tid}/subtopics`)
    setSubtopics(p => ({ ...p, [tid]: data }))
    return data
  }
  async function loadLessons(sid: string) {
    const { data } = await api.get<Lesson[]>(`/topics/subtopics/${sid}/lessons`)
    setLessons(p => ({ ...p, [sid]: data }))
    return data
  }
  async function loadProblems(lid: string) {
    const { data } = await api.get<Problem[]>(`/problems/lesson/${lid}`)
    setProblems(p => ({ ...p, [lid]: data }))
    return data
  }

  // ─── Navigation ──────────────────────────────────────────────────────────────

  async function openTopic(topic: Topic) {
    setSelectedTopic(topic); setView('subtopics')
    if (!subtopics[topic.id]) await loadSubs(topic.id)
  }
  async function openSubtopic(sub: SubTopic) {
    setSelectedSubtopic(sub); setView('lessons')
    if (!lessons[sub.id]) await loadLessons(sub.id)
  }
  async function openLesson(lesson: Lesson) {
    setSelectedLesson(lesson); setView('problems')
    if (!problems[lesson.id]) await loadProblems(lesson.id)
  }

  // ─── Modal helpers ───────────────────────────────────────────────────────────

  function openAdd(m: ModalMode, topic?: Topic, sub?: SubTopic, sst?: Lesson) {
    setForm(defaultForm()); setMode(m)
    setCtxTopic(topic ?? null); setCtxSub(sub ?? null)
    setCtxSST(sst ?? null); setCtxProblem(null)
  }

  function openEdit(item: any, m: ModalMode, topic?: Topic, sub?: SubTopic, sst?: Lesson) {
    setMode(m)
    setCtxTopic(m === 'edit_topic'   ? item : topic ?? null)
    setCtxSub  (m === 'edit_subtopic'? item : sub   ?? null)
    setCtxSST  (m === 'edit_sst'     ? item : sst   ?? null)
    setCtxProblem(m === 'edit_problem' ? item : null)

    if (m === 'edit_problem') {
      const p = item as Problem
      const pType = p.problem_type || 'mcq'
      const correctOpts = p.correct_options?.length ? p.correct_options : [p.correct_option ?? 0]
      let oaType: 'single' | 'set' = 'single', oaVal = '', oaVals = ''
      if (pType === 'open' && p.open_answer) {
        oaType = p.open_answer.type
        if (oaType === 'single') oaVal = String(p.open_answer.value ?? '')
        else oaVals = (p.open_answer.values ?? []).join(', ')
      }
      setForm({
        title: p.title ?? '', desc: '', expl: '', question: p.question ?? '',
        imageUrl: p.image_url ?? '', problemType: pType,
        opts: Array.isArray(p.options) && p.options.length ? [...p.options] : ['', '', '', ''],
        correctOpts, openAnswerType: oaType, openAnswerValue: oaVal, openAnswerValues: oaVals,
        hint: p.hint1 ?? '',
        isHard: p.is_hard ?? false, blocks: [],
        level: p.level ?? 'A',
      })
    } else {
      setForm({
        title: item.title ?? '', desc: item.description ?? '', expl: item.explanation ?? '',
        question: item.question ?? '', imageUrl: '',
        problemType: 'mcq',
        opts: Array.isArray(item.options) ? [...item.options] : ['', '', '', ''],
        correctOpts: [item.correct_option ?? 0],
        openAnswerType: 'single', openAnswerValue: '', openAnswerValues: '',
        hint: item.hint1 ?? '',
        isHard: item.is_hard ?? false,
        blocks: Array.isArray(item.content_blocks) ? item.content_blocks : [],
        level: 'A',
      })
    }
  }

  function closeModal() { setMode(null); setForm(defaultForm()) }

  // ─── CRUD helpers ────────────────────────────────────────────────────────────

  function doDelete(url: string, label: string, refresh: () => void) {
    setDeleteModal({ url, label, refresh })
  }

  async function confirmDelete() {
    if (!deleteModal) return
    await api.delete(deleteModal.url)
    deleteModal.refresh()
    setDeleteModal(null)
  }

  async function doPublish(url: string)   { await api.post(url); reloadAll() }
  async function doUnpublish(url: string) { await api.post(url); reloadAll() }

  async function reloadAll() {
    await loadTopics()
    if (selectedTopic)    await loadSubs(selectedTopic.id)
    if (selectedSubtopic) await loadLessons(selectedSubtopic.id)
    if (selectedLesson)   await loadProblems(selectedLesson.id)
    for (const id of exTopics) await loadSubs(id)
    for (const id of exSubs)   await loadLessons(id)
    for (const id of exSSTs)   await loadProblems(id)
  }

  // ─── Save functions ──────────────────────────────────────────────────────────

  // "Save" always writes is_draft:false (a plain saved-not-yet-published state) and never
  // touches is_published, so editing an already-published entity and pressing "Save" keeps
  // it published — only the explicit "Save and Publish" path calls the /publish endpoint.
  async function saveTopic(andPublish = false) {
    if (!form.title.trim()) { alert(t('admin.modal.title_required')); return }
    setSaving(true)
    let id: string
    if (mode === 'edit_topic' && ctxTopic) {
      await api.put(`/topics/${ctxTopic.id}`, { title: form.title, description: form.desc, is_draft: false })
      id = ctxTopic.id
    } else {
      const { data } = await api.post<Topic>('/topics', { title: form.title, description: form.desc, is_draft: false, language: contentLang })
      id = data.id
    }
    if (andPublish) await api.post(`/topics/${id}/publish`)
    setSaving(false); closeModal(); loadTopics()
  }

  async function saveSubtopic(andPublish = false) {
    if (!form.title.trim() || !ctxTopic) { alert(t('admin.modal.title_required')); return }
    setSaving(true)
    let id: string
    if (mode === 'edit_subtopic' && ctxSub) {
      await api.put(`/topics/subtopics/${ctxSub.id}`, { title: form.title, is_draft: false })
      id = ctxSub.id
    } else {
      const { data } = await api.post<SubTopic>('/topics/subtopics', { topic_id: ctxTopic.id, title: form.title, is_draft: false, language: ctxTopic.language })
      id = data.id
    }
    if (andPublish) await api.post(`/topics/subtopics/${id}/publish`)
    setSaving(false); closeModal(); loadSubs(ctxTopic.id)
  }

  async function saveLesson(andPublish = false) {
    if (!form.title.trim() || !ctxSub) { alert(t('admin.modal.title_required')); return }
    setSaving(true)
    let id: string
    if (mode === 'edit_sst' && ctxSST) {
      await api.put(`/topics/lessons/${ctxSST.id}`, { title: form.title, explanation: form.expl, content_blocks: form.blocks, is_draft: false })
      id = ctxSST.id
    } else {
      const { data } = await api.post<Lesson>('/topics/lessons', { subtopic_id: ctxSub.id, title: form.title, explanation: form.expl, content_blocks: form.blocks, is_draft: false, language: ctxSub.language })
      id = data.id
    }
    if (andPublish) await api.post(`/topics/lessons/${id}/publish`)
    setSaving(false); closeModal(); loadLessons(ctxSub.id)
  }

  async function saveProblem(andPublish = false) {
    if (!form.question.trim() || !ctxSST) { alert(t('admin.modal.question_required')); return }
    if (form.problemType === 'mcq') {
      if (form.opts.filter(o => o.trim()).length < 2) { alert('At least 2 options are required for MCQ.'); return }
      if (form.correctOpts.length === 0) { alert('Select at least one correct answer.'); return }
    } else {
      if (form.openAnswerType === 'single' && !form.openAnswerValue.trim()) { alert('Enter the correct answer.'); return }
      if (form.openAnswerType === 'set'    && !form.openAnswerValues.trim()) { alert('Enter the correct answers.'); return }
    }
    setSaving(true)
    let openAnswer = null
    if (form.problemType === 'open') {
      if (form.openAnswerType === 'single') {
        openAnswer = { type: 'single', value: parseFloat(form.openAnswerValue) }
      } else {
        openAnswer = { type: 'set', values: form.openAnswerValues.split(',').map(v => parseFloat(v.trim())).filter(n => !isNaN(n)) }
      }
    }
    const payload: any = {
      subsubtopic_id: ctxSST.id, question: form.question,
      problem_type: form.problemType,
      options: form.problemType === 'mcq' ? form.opts.filter(o => o.trim()) : [],
      correct_option: form.correctOpts[0] ?? 0, correct_options: form.correctOpts,
      open_answer: openAnswer, image_url: form.imageUrl.trim() || null,
      hint1: form.hint || 'Think carefully.',
      is_hard: form.isHard, is_draft: false,
      level: form.level || null,
    }
    try {
      let id: string
      if (mode === 'edit_problem' && ctxProblem) {
        await api.put(`/problems/${ctxProblem.id}`, payload)
        id = ctxProblem.id
      } else {
        const { data } = await api.post<Problem>('/problems', payload)
        id = data.id
      }
      if (andPublish) await api.post(`/problems/${id}/publish`)
      closeModal(); loadProblems(ctxSST.id)
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to save problem')
    }
    setSaving(false)
  }

  function toggleCorrectOpt(i: number) {
    setForm(f => {
      const has = f.correctOpts.includes(i)
      return { ...f, correctOpts: has ? f.correctOpts.filter(x => x !== i) : [...f.correctOpts, i] }
    })
  }

  // ─── File upload handlers ────────────────────────────────────────────────────

  async function handleLessonUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !lessonUploadSubId) return
    e.target.value = ''
    setLessonUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('subtopic_id', lessonUploadSubId)
      await api.post('/topics/lessons/upload-docx', fd)
      loadLessons(lessonUploadSubId)
    } catch (err: any) {
      const detail = err.response?.data?.detail
      alert(typeof detail === 'string' ? detail : 'Lesson upload failed.')
    }
    setLessonUploading(false); setLessonUploadSubId(null)
  }

  async function handleTestUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !testUploadSubId) return
    e.target.value = ''
    setTestUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('subtopic_id', testUploadSubId)
      const { data } = await api.post<UploadResult>('/problems/admin/upload', fd)
      setTestResult(data)
      loadLessons(testUploadSubId)
    } catch (err: any) {
      const detail = err.response?.data?.detail
      alert(typeof detail === 'string' ? detail : 'Test upload failed.')
    }
    setTestUploading(false); setTestUploadSubId(null)
  }

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  )

  // ─── Inner UI helpers ────────────────────────────────────────────────────────

  function Breadcrumb() {
    return (
      <nav className="flex items-center gap-1.5 text-sm text-muted mb-6">
        <button className="font-semibold text-gray-900 hover:text-primary transition-colors" onClick={() => setView('topics')}>
          {t('admin.content.title')}
        </button>
        {selectedTopic && (
          <>
            <span>/</span>
            <button
              className={`hover:text-primary transition-colors ${view === 'subtopics' ? 'text-gray-900 font-semibold' : ''}`}
              onClick={() => setView('subtopics')}
            >
              {selectedTopic.title}
            </button>
          </>
        )}
        {selectedSubtopic && view !== 'subtopics' && (
          <>
            <span>/</span>
            <button
              className={`hover:text-primary transition-colors ${view === 'lessons' ? 'text-gray-900 font-semibold' : ''}`}
              onClick={() => setView('lessons')}
            >
              {selectedSubtopic.title}
            </button>
          </>
        )}
        {selectedLesson && view === 'problems' && (
          <>
            <span>/</span>
            <span className="text-gray-900 font-semibold">{selectedLesson.title}</span>
          </>
        )}
      </nav>
    )
  }

  function SearchInput({ placeholder }: { placeholder?: string }) {
    return (
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
        <input
          className="w-full pl-9 pr-9 py-2 rounded-xl border border-border bg-surface text-sm text-gray-900 placeholder:text-muted focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
          placeholder={placeholder ?? 'Search…'}
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0) }}
        />
        {search && (
          <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-gray-700 transition-colors" onClick={() => { setSearch(''); setPage(0) }}>
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    )
  }

  function Pager({ total }: { total: number }) {
    const totalPgs = Math.ceil(total / PAGE_SIZE)
    if (totalPgs <= 1) return null
    return (
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
        <span className="text-xs text-muted">{t('admin.content.n_items', { n: total })}</span>
        <div className="flex items-center gap-1">
          <button className="p-1.5 rounded-lg border border-border text-muted hover:bg-gray-50 disabled:opacity-40 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-3 text-xs text-muted font-medium">{page + 1} / {totalPgs}</span>
          <button className="p-1.5 rounded-lg border border-border text-muted hover:bg-gray-50 disabled:opacity-40 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20" disabled={page >= totalPgs - 1} onClick={() => setPage(p => p + 1)}>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    )
  }

  const cardCls = 'group bg-surface rounded-2xl border overflow-hidden transition-all duration-150 hover:shadow-md hover:border-primary/25 focus-within:ring-2 focus-within:ring-primary/10'
  const cardStyle = { borderColor: '#f0e5d4', boxShadow: '0 2px 12px -6px rgba(44,36,24,0.08)' }

  function OpenBtn({ onClick, label }: { onClick: () => void; label?: string }) {
    return (
      <button className="flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary-light hover:bg-primary hover:text-white px-3 py-1.5 rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-primary/30" onClick={onClick}>
        {label ?? t('admin.content.open')} <ChevronRight className="w-3.5 h-3.5" />
      </button>
    )
  }

  function UploadBtn({ label, icon: Icon, onClick, loading: busy }: {
    label: string; icon: LucideIcon; onClick: () => void; loading?: boolean
  }) {
    return (
      <button
        className="flex items-center gap-1.5 text-xs font-medium text-gray-600 border border-border hover:border-primary/30 hover:text-primary hover:bg-primary-light/60 px-2.5 py-1.5 rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-primary/10 disabled:opacity-50"
        disabled={busy}
        onClick={onClick}
      >
        <Icon className="w-3.5 h-3.5 flex-shrink-0" />
        {busy ? t('admin.uploading') : label}
      </button>
    )
  }

  const Divider = () => <div className="w-px h-5 bg-border mx-0.5" />

  function AddAnotherLink({ label, onClick }: { label: string; onClick: () => void }) {
    return (
      <div className="mt-4 flex justify-center">
        <button className="flex items-center gap-1.5 text-sm text-muted hover:text-primary transition-colors py-1.5 focus:outline-none" onClick={onClick}>
          <Plus className="w-4 h-4" /> {label}
        </button>
      </div>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-8 py-6">
      <input ref={lessonInputRef} type="file" accept=".docx" className="hidden" onChange={handleLessonUpload} />
      <input ref={testInputRef}   type="file" accept=".docx" className="hidden" onChange={handleTestUpload} />

      {/* ═══════════════════ Content language switcher ════════════════════════ */}
      <div className="flex items-center justify-end gap-2 mb-4">
        <span className="text-xs font-medium text-muted">Content language:</span>
        <div className="inline-flex rounded-lg border border-border overflow-hidden">
          {(['kz', 'ru'] as ContentLanguage[]).map(lang => (
            <button
              key={lang}
              onClick={() => switchContentLang(lang)}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                contentLang === lang ? 'bg-primary text-white' : 'bg-surface text-muted hover:bg-gray-50'
              }`}
            >
              {lang === 'kz' ? 'Қазақша' : 'Русский'}
            </button>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════ TOPICS VIEW ═════════════════════════════ */}
      {view === 'topics' && (
        <>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-display font-semibold text-gray-900">{t('admin.content.title')}</h1>
              <p className="text-sm text-muted mt-0.5">{t('admin.content.n_topics', { n: topics.length })}</p>
            </div>
            <button className="btn-primary flex items-center gap-2" onClick={() => openAdd('add_topic')}>
              <Plus className="w-4 h-4" /> {t('admin.content.add_topic')}
            </button>
          </div>

          {topics.length === 0 ? (
            <div className="text-center py-16 bg-surface rounded-2xl border border-dashed border-border">
              <div className="w-14 h-14 rounded-2xl bg-primary-light flex items-center justify-center mx-auto mb-3">
                <BookOpen className="w-7 h-7 text-primary" />
              </div>
              <p className="font-display font-semibold text-gray-900 text-lg">{t('admin.content.no_topics')}</p>
              <p className="text-sm text-muted mt-1 mb-5">{t('admin.content.no_topics_sub')}</p>
              <button className="btn-primary inline-flex items-center gap-2" onClick={() => openAdd('add_topic')}>
                <Plus className="w-4 h-4" /> {t('admin.content.add_topic')}
              </button>
            </div>
          ) : (
            <>
              <SearchInput placeholder={t('admin.content.search_topics')} />
              {(() => {
                const filtered = topics.filter(t2 => !search || t2.title.toLowerCase().includes(search.toLowerCase()))
                const paged    = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
                return (
                  <>
                    {filtered.length === 0 && (
                      <div className="text-center py-12 text-muted">
                        <p className="font-medium">{t('admin.content.no_match', { q: search })}</p>
                      </div>
                    )}
                    <div className="space-y-2">
                      {paged.map(topic => (
                        <div key={topic.id} className={cardCls} style={cardStyle}>
                          <div className="flex items-center gap-3 px-4 py-3">
                            <div className="w-9 h-9 rounded-xl bg-primary-light flex items-center justify-center flex-shrink-0">
                              <BookOpen className="w-4 h-4 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-display font-semibold text-gray-900 group-hover:text-primary transition-colors">{topic.title}</span>
                                <StatusBadge isDraft={topic.is_draft} isPublished={topic.is_published} />
                              </div>
                              {topic.description && <p className="text-xs text-muted mt-0.5 truncate">{topic.description}</p>}
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <IconBtn icon={Pencil} title={t('admin.edit')} onClick={() => openEdit(topic, 'edit_topic')} />
                              {!topic.is_draft && !topic.is_published && (
                                <IconBtn icon={Globe} title={t('admin.publish')} variant="success" onClick={() => doPublish(`/topics/${topic.id}/publish`)} />
                              )}
                              {topic.is_published && (
                                <IconBtn icon={EyeOff} title={t('admin.unpublish')} variant="muted" onClick={() => doUnpublish(`/topics/${topic.id}/unpublish`)} />
                              )}
                              <IconBtn icon={Trash2} title={t('admin.delete')} variant="danger" onClick={() => doDelete(`/topics/${topic.id}`, topic.title, loadTopics)} />
                              <Divider />
                              <OpenBtn onClick={() => openTopic(topic)} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <Pager total={filtered.length} />
                    {filtered.length > 0 && <AddAnotherLink label={t('admin.content.add_another_topic')} onClick={() => openAdd('add_topic')} />}
                  </>
                )
              })()}
            </>
          )}
        </>
      )}

      {/* ══════════════════════════ SUBTOPICS VIEW ════════════════════════════ */}
      {view === 'subtopics' && selectedTopic && (
        <>
          <Breadcrumb />
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-display font-semibold text-gray-900">{selectedTopic.title}</h1>
              <p className="text-sm text-muted mt-0.5">{t('admin.content.n_subtopics', { n: (subtopics[selectedTopic.id] ?? []).length })}</p>
            </div>
            <button className="btn-primary flex items-center gap-2" onClick={() => openAdd('add_subtopic', selectedTopic)}>
              <Plus className="w-4 h-4" /> {t('admin.content.add_subtopic')}
            </button>
          </div>

          {(subtopics[selectedTopic.id] ?? []).length === 0 ? (
            <div className="text-center py-16 bg-surface rounded-2xl border border-dashed border-border">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: '#dff0f0' }}>
                <Layers className="w-7 h-7" style={{ color: '#178f8f' }} />
              </div>
              <p className="font-display font-semibold text-gray-900 text-lg">{t('admin.content.no_subtopics')}</p>
              <p className="text-sm text-muted mt-1 mb-5">{t('admin.content.no_subtopics_sub')}</p>
              <button className="btn-primary inline-flex items-center gap-2" onClick={() => openAdd('add_subtopic', selectedTopic)}>
                <Plus className="w-4 h-4" /> {t('admin.content.add_subtopic')}
              </button>
            </div>
          ) : (
            <>
              <SearchInput placeholder={t('admin.content.search_subtopics')} />
              {(() => {
                const all      = subtopics[selectedTopic.id] ?? []
                const filtered = all.filter(s => !search || s.title.toLowerCase().includes(search.toLowerCase()))
                const paged    = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
                return (
                  <>
                    {filtered.length === 0 && (
                      <div className="text-center py-12 text-muted">
                        <p className="font-medium">{t('admin.content.no_match', { q: search })}</p>
                      </div>
                    )}
                    <div className="space-y-2">
                      {paged.map(sub => (
                        <div key={sub.id} className={cardCls} style={cardStyle}>
                          <div className="flex items-center gap-3 px-4 py-3 flex-wrap sm:flex-nowrap">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#dff0f0' }}>
                              <Layers className="w-4 h-4" style={{ color: '#178f8f' }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-display font-semibold text-gray-900 group-hover:text-primary transition-colors">{sub.title}</span>
                                <StatusBadge isDraft={sub.is_draft} isPublished={sub.is_published} />
                              </div>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0 flex-wrap justify-end">
                              <IconBtn icon={Pencil} title={t('admin.edit')} onClick={() => openEdit(sub, 'edit_subtopic', selectedTopic)} />
                              {!sub.is_draft && !sub.is_published && (
                                <IconBtn icon={Globe} title={t('admin.publish')} variant="success" onClick={() => doPublish(`/topics/subtopics/${sub.id}/publish`)} />
                              )}
                              {sub.is_published && (
                                <IconBtn icon={EyeOff} title={t('admin.unpublish')} variant="muted" onClick={() => doUnpublish(`/topics/subtopics/${sub.id}/unpublish`)} />
                              )}
                              <IconBtn icon={Trash2} title={t('admin.delete')} variant="danger" onClick={() => doDelete(`/topics/subtopics/${sub.id}`, sub.title, () => loadSubs(selectedTopic.id))} />
                              <Divider />
                              <UploadBtn
                                label={t('admin.content.upload_lesson')}
                                icon={Upload}
                                loading={lessonUploading && lessonUploadSubId === sub.id}
                                onClick={() => { setLessonUploadSubId(sub.id); lessonInputRef.current?.click() }}
                              />
                              <UploadBtn
                                label={t('admin.content.upload_test')}
                                icon={FileUp}
                                loading={testUploading && testUploadSubId === sub.id}
                                onClick={() => { setTestUploadSubId(sub.id); testInputRef.current?.click() }}
                              />
                              <Divider />
                              <OpenBtn onClick={() => openSubtopic(sub)} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <Pager total={filtered.length} />
                    {filtered.length > 0 && <AddAnotherLink label={t('admin.content.add_another_subtopic')} onClick={() => openAdd('add_subtopic', selectedTopic)} />}
                  </>
                )
              })()}
            </>
          )}
        </>
      )}

      {/* ═══════════════════════════ LESSONS VIEW ════════════════════════════ */}
      {view === 'lessons' && selectedTopic && selectedSubtopic && (
        <>
          <Breadcrumb />
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-display font-semibold text-gray-900">{selectedSubtopic.title}</h1>
              <p className="text-sm text-muted mt-0.5">{t('admin.content.n_lessons', { n: (lessons[selectedSubtopic.id] ?? []).length })}</p>
            </div>
            <button className="btn-primary flex items-center gap-2" onClick={() => openAdd('add_sst', selectedTopic, selectedSubtopic)}>
              <Plus className="w-4 h-4" /> {t('admin.content.add_lesson')}
            </button>
          </div>

          {(lessons[selectedSubtopic.id] ?? []).length === 0 ? (
            <div className="text-center py-16 bg-surface rounded-2xl border border-dashed border-border">
              <div className="w-14 h-14 rounded-2xl bg-warning-light flex items-center justify-center mx-auto mb-3">
                <FileText className="w-7 h-7 text-warning" />
              </div>
              <p className="font-display font-semibold text-gray-900 text-lg">{t('admin.content.no_lessons')}</p>
              <p className="text-sm text-muted mt-1 mb-5">{t('admin.content.no_lessons_sub')}</p>
              <button className="btn-primary inline-flex items-center gap-2" onClick={() => openAdd('add_sst', selectedTopic, selectedSubtopic)}>
                <Plus className="w-4 h-4" /> {t('admin.content.add_lesson')}
              </button>
            </div>
          ) : (
            <>
              <SearchInput placeholder={t('admin.content.search_lessons')} />
              {(() => {
                const all      = lessons[selectedSubtopic.id] ?? []
                const filtered = all.filter(l => !search || l.title.toLowerCase().includes(search.toLowerCase()))
                const paged    = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
                return (
                  <>
                    {filtered.length === 0 && (
                      <div className="text-center py-12 text-muted">
                        <p className="font-medium">{t('admin.content.no_match', { q: search })}</p>
                      </div>
                    )}
                    <div className="space-y-2">
                      {paged.map(lesson => (
                        <div key={lesson.id} className={cardCls} style={cardStyle}>
                          <div className="flex items-center gap-3 px-4 py-3">
                            <div className="w-9 h-9 rounded-xl bg-warning-light flex items-center justify-center flex-shrink-0">
                              <FileText className="w-4 h-4 text-warning" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-display font-semibold text-gray-900 group-hover:text-primary transition-colors">{lesson.title}</span>
                                <StatusBadge isDraft={lesson.is_draft} isPublished={lesson.is_published} />
                              </div>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <IconBtn icon={Pencil} title={t('admin.edit')} onClick={() => openEdit(lesson, 'edit_sst', selectedTopic, selectedSubtopic)} />
                              {!lesson.is_draft && !lesson.is_published && (
                                <IconBtn icon={Globe} title={t('admin.publish')} variant="success" onClick={() => doPublish(`/topics/lessons/${lesson.id}/publish`)} />
                              )}
                              {lesson.is_published && (
                                <IconBtn icon={EyeOff} title={t('admin.unpublish')} variant="muted" onClick={() => doUnpublish(`/topics/lessons/${lesson.id}/unpublish`)} />
                              )}
                              <IconBtn icon={Trash2} title={t('admin.delete')} variant="danger" onClick={() => doDelete(`/topics/lessons/${lesson.id}`, lesson.title, () => loadLessons(selectedSubtopic.id))} />
                              <Divider />
                              <OpenBtn onClick={() => openLesson(lesson)} label={t('admin.content.open_test')} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <Pager total={filtered.length} />
                    {filtered.length > 0 && <AddAnotherLink label={t('admin.content.add_another_lesson')} onClick={() => openAdd('add_sst', selectedTopic, selectedSubtopic)} />}
                  </>
                )
              })()}
            </>
          )}
        </>
      )}

      {/* ══════════════════════════ PROBLEMS VIEW ════════════════════════════ */}
      {view === 'problems' && selectedTopic && selectedSubtopic && selectedLesson && (
        <>
          <Breadcrumb />
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-display font-semibold text-gray-900">{selectedLesson.title}</h1>
              <p className="text-sm text-muted mt-0.5">{t('admin.content.n_problems', { n: (problems[selectedLesson.id] ?? []).length })}</p>
            </div>
            <button className="btn-primary flex items-center gap-2" onClick={() => openAdd('add_problem', selectedTopic, selectedSubtopic, selectedLesson)}>
              <Plus className="w-4 h-4" /> {t('admin.content.add_problem')}
            </button>
          </div>

          {(problems[selectedLesson.id] ?? []).length === 0 ? (
            <div className="text-center py-16 bg-surface rounded-2xl border border-dashed border-border">
              <div className="w-14 h-14 rounded-2xl bg-primary-light flex items-center justify-center mx-auto mb-3">
                <HelpCircle className="w-7 h-7 text-primary" />
              </div>
              <p className="font-display font-semibold text-gray-900 text-lg">{t('admin.content.no_problems')}</p>
              <p className="text-sm text-muted mt-1 mb-5">{t('admin.content.no_problems_sub')}</p>
              <button className="btn-primary inline-flex items-center gap-2" onClick={() => openAdd('add_problem', selectedTopic, selectedSubtopic, selectedLesson)}>
                <Plus className="w-4 h-4" /> {t('admin.content.add_problem')}
              </button>
            </div>
          ) : (
            <>
              <SearchInput placeholder={t('admin.content.search_problems')} />
              {(() => {
                const all      = problems[selectedLesson.id] ?? []
                // Stable per-level numbering (A1, A2… B1… C10), independent of
                // search/pagination, so admins can spot "which test this belongs
                // to" at a glance — mirrors the Test Bank's "#N" badge.
                const levelCounters: Record<string, number> = {}
                const numberById = new Map<string, string>()
                all.forEach(p => {
                  const lvl = p.level || '—'
                  levelCounters[lvl] = (levelCounters[lvl] ?? 0) + 1
                  numberById.set(p.id, p.level ? `${p.level}${levelCounters[lvl]}` : `${levelCounters[lvl]}`)
                })
                const filtered = all.filter(p => !search || p.question.toLowerCase().includes(search.toLowerCase()))
                const paged    = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
                return (
                  <>
                    {filtered.length === 0 && (
                      <div className="text-center py-12 text-muted">
                        <p className="font-medium">{t('admin.content.no_match', { q: search })}</p>
                      </div>
                    )}
                    <div className="space-y-2">
                      {paged.map(prob => (
                        <div key={prob.id} className={cardCls} style={cardStyle}>
                          <div className="flex items-start gap-3 px-4 py-3">
                            <span className="flex-shrink-0 w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600 mt-0.5">
                              {numberById.get(prob.id)}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className={`badge text-xs ${prob.problem_type === 'open' ? 'bg-primary-light text-primary' : 'bg-gray-100 text-gray-600'}`}>
                                  {prob.problem_type === 'open' ? t('admin.testbank.open') : t('admin.testbank.mcq')}
                                </span>
                                <StatusBadge isDraft={prob.is_draft} isPublished={prob.is_published} />
                                {prob.is_hard && <span className="badge bg-warning-light text-warning">⚡ {t('admin.problem.hard_badge')}</span>}
                                {prob.level && <span className="badge bg-gray-100 text-gray-600">{t('admin.problem.level_badge', { level: prob.level })}</span>}
                              </div>
                              <p className="text-sm text-gray-700 leading-snug">
                                <LatexText text={prob.question.slice(0, 120) + (prob.question.length > 120 ? '…' : '')} />
                              </p>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <IconBtn icon={Pencil} title={t('admin.edit')} onClick={() => openEdit(prob, 'edit_problem', selectedTopic, selectedSubtopic, selectedLesson)} />
                              {!prob.is_draft && !prob.is_published && (
                                <IconBtn icon={Globe} title={t('admin.publish')} variant="success" onClick={() => doPublish(`/problems/${prob.id}/publish`)} />
                              )}
                              {prob.is_published && (
                                <IconBtn icon={EyeOff} title={t('admin.unpublish')} variant="muted" onClick={() => doUnpublish(`/problems/${prob.id}/unpublish`)} />
                              )}
                              <IconBtn icon={Trash2} title={t('admin.delete')} variant="danger" onClick={() => doDelete(`/problems/${prob.id}`, 'this problem', () => loadProblems(selectedLesson.id))} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <Pager total={filtered.length} />
                    {filtered.length > 0 && <AddAnotherLink label={t('admin.content.add_another_problem')} onClick={() => openAdd('add_problem', selectedTopic, selectedSubtopic, selectedLesson)} />}
                  </>
                )
              })()}
            </>
          )}
        </>
      )}

      {/* ════════════════════ Upload Test result modal ════════════════════════ */}
      {testResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto p-6 space-y-4 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">{t('admin.upload.result')}</h2>
            <div className="bg-success-light border border-green-200 rounded-lg px-4 py-3 text-sm text-success">
              ✓ {t('admin.upload.summary', { n1: testResult.lessons_created, n2: testResult.imported })}{' '}
              {testResult.auto_published ? t('admin.upload.auto_published') : t('admin.upload.as_drafts')}
            </div>
            {testResult.errors.length > 0 && (
              <div className="bg-danger-light border border-red-200 rounded-lg px-4 py-3 text-sm text-danger">
                <p className="font-semibold mb-1">{t('admin.upload.errors_title', { n: testResult.errors.length })}</p>
                <ul className="space-y-0.5 list-disc list-inside">
                  {testResult.errors.map((e, i) => <li key={i}>Задача {e.zadacha}: {e.reason}</li>)}
                </ul>
              </div>
            )}
            {testResult.skipped.length > 0 && (
              <div className="bg-warning-light border border-yellow-200 rounded-lg px-4 py-3 text-sm text-warning">
                <p className="font-semibold mb-1">{t('admin.upload.skipped_title', { n: testResult.skipped.length })}</p>
                <ul className="space-y-0.5 list-disc list-inside font-mono text-xs">
                  {testResult.skipped.map((s, i) => <li key={i}>"{s.text}" — {s.reason}</li>)}
                </ul>
              </div>
            )}
            <button className="btn-primary w-full" onClick={() => setTestResult(null)}>{t('admin.upload.done')}</button>
          </div>
        </div>
      )}

      {/* ═══════════════════ Delete confirmation modal ════════════════════════ */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <div className="flex gap-4 mb-5">
              <div className="w-11 h-11 rounded-full bg-danger/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5 text-danger" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900 mb-1">
                  {t('admin.delete.title', { label: deleteModal.label })}
                </h2>
                <p className="text-sm text-muted leading-snug">{t('admin.delete.desc')}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                className="flex-1 py-2 rounded-xl border border-border text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-200"
                onClick={() => setDeleteModal(null)}
              >
                {t('admin.cancel')}
              </button>
              <button
                className="flex-1 py-2 rounded-xl bg-danger text-white text-sm font-semibold hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-danger/30 flex items-center justify-center gap-1.5"
                onClick={confirmDelete}
              >
                <Trash2 className="w-4 h-4" /> {t('admin.delete.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════ Main modal ═══════════════════════════════ */}
      {mode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold">
                {mode === 'add_topic'      ? t('admin.modal.new_topic')
                 : mode === 'edit_topic'   ? t('admin.modal.edit_topic')
                 : mode === 'add_subtopic' ? t('admin.modal.new_subtopic', { ctx: ctxTopic?.title ?? '' })
                 : mode === 'edit_subtopic'? t('admin.modal.edit_subtopic')
                 : mode === 'add_sst'      ? t('admin.modal.new_lesson', { ctx: ctxSub?.title ?? '' })
                 : mode === 'edit_sst'     ? t('admin.modal.edit_lesson')
                 : mode === 'add_problem'  ? t('admin.modal.new_problem', { ctx: ctxSST?.title ?? '' })
                 : t('admin.modal.edit_problem')}
              </h2>
              <button onClick={closeModal} className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-gray-700 hover:bg-gray-100 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Topic form */}
            {(mode === 'add_topic' || mode === 'edit_topic') && <>
              <div><label className="label">{t('admin.modal.field_title')}</label><input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Algebra" /></div>
              <div><label className="label">{t('admin.modal.field_desc')}</label><textarea className="input" rows={2} value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))} placeholder="Brief description" /></div>
              <div className="flex gap-2">
                <button className="btn-primary flex-1"   onClick={() => saveTopic()} disabled={saving}>{t('admin.save')}</button>
                <button className="btn-secondary flex-1" onClick={() => saveTopic(true)} disabled={saving}>{t('admin.modal.save_publish')}</button>
              </div>
            </>}

            {/* Subtopic form */}
            {(mode === 'add_subtopic' || mode === 'edit_subtopic') && <>
              <div><label className="label">{t('admin.modal.field_title')}</label><input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Linear Equations" /></div>
              <div className="flex gap-2">
                <button className="btn-primary flex-1"   onClick={() => saveSubtopic()} disabled={saving}>{t('admin.save')}</button>
                <button className="btn-secondary flex-1" onClick={() => saveSubtopic(true)} disabled={saving}>{t('admin.modal.save_publish')}</button>
              </div>
            </>}

            {/* Lesson form */}
            {(mode === 'add_sst' || mode === 'edit_sst') && <>
              <div><label className="label">Lesson title</label><input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Introduction to variables" /></div>
              <div>
                <label className="label">Lesson content</label>
                <p className="text-xs text-muted mb-2">
                  Add headings, text, formulas and images in any order. In text blocks: use $...$ or $$...$$ for LaTeX,
                  **bold** for bold, and [[red:text]] / [[blue:text]] / [[green:text]] / [[orange:text]] for colored emphasis.
                </p>
                <LessonEditor blocks={form.blocks} onChange={blocks => setForm(f => ({ ...f, blocks }))} />
              </div>
              <div className="flex gap-2">
                <button className="btn-primary flex-1"   onClick={() => saveLesson()} disabled={saving}>{t('admin.save')}</button>
                <button className="btn-secondary flex-1" onClick={() => saveLesson(true)} disabled={saving}>{t('admin.modal.save_publish')}</button>
              </div>
            </>}

            {/* Problem form */}
            {(mode === 'add_problem' || mode === 'edit_problem') && <>
              <div className="flex items-center justify-between">
                <label className="label mb-0">{t('admin.problem.hard_label')}</label>
                <input type="checkbox" checked={form.isHard} onChange={e => setForm(f => ({ ...f, isHard: e.target.checked }))} className="w-5 h-5 accent-primary" />
              </div>
              <div>
                <label className="label">{t('admin.problem.level_label')}</label>
                <div className="flex gap-2">
                  {['A', 'B', 'C'].map(lv => (
                    <button
                      key={lv}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, level: lv }))}
                      className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        form.level === lv ? 'border-primary bg-primary-light text-primary' : 'border-border text-muted hover:bg-gray-50'
                      }`}
                    >
                      {lv}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">{t('admin.problem.type_label')}</label>
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
              <div>
                <label className="label">{t('admin.problem.question_label')}</label>
                <p className="text-xs text-muted mb-1">{t('admin.problem.formula_hint')}</p>
                <textarea
                  className="input font-mono" rows={3}
                  value={form.question}
                  onChange={e => setForm(f => ({ ...f, question: e.target.value }))}
                  placeholder={t('admin.problem.question_placeholder')}
                />
                {form.question && (
                  <div className="mt-2 p-3 bg-gray-50 rounded-lg text-sm text-gray-800">
                    <p className="text-xs text-muted mb-1">{t('admin.problem.preview_label')}</p>
                    <LatexText text={form.question} />
                  </div>
                )}
              </div>
              <div>
                <label className="label">{t('admin.problem.image_label')}</label>
                <AdminImageUpload value={form.imageUrl} onChange={url => setForm(f => ({ ...f, imageUrl: url }))} />
              </div>
              {form.problemType === 'mcq' && (
                <div>
                  <label className="label">{t('admin.problem.options_label')}</label>
                  <p className="text-xs text-muted mb-2">{t('admin.problem.options_hint')}</p>
                  {form.opts.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2 mb-2">
                      <button
                        type="button"
                        onClick={() => toggleCorrectOpt(i)}
                        className={`w-8 h-8 rounded-full text-sm font-bold flex-shrink-0 transition-colors ${
                          form.correctOpts.includes(i) ? 'bg-success text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {['A','B','C','D','E','F'][i]}
                      </button>
                      <div className="flex-1">
                        <input
                          className="input"
                          value={opt}
                          onChange={e => { const o = [...form.opts]; o[i] = e.target.value; setForm(f => ({ ...f, opts: o })) }}
                          placeholder={t('admin.problem.option_placeholder', { letter: ['A','B','C','D','E','F'][i] })}
                        />
                        {opt && (
                          <div className="mt-1 px-2.5 py-1.5 bg-gray-50 rounded-lg text-sm text-gray-800">
                            <LatexText text={opt} />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  <button type="button" className="text-xs text-primary font-medium" onClick={() => setForm(f => ({ ...f, opts: [...f.opts, ''] }))} disabled={form.opts.length >= 6}>
                    {t('admin.problem.add_option')}
                  </button>
                  <p className="text-xs text-muted mt-1">
                    {t('admin.problem.correct_label', { opts: form.correctOpts.map(i => ['A','B','C','D','E','F'][i]).join(', ') || t('admin.problem.none_selected') })}
                  </p>
                </div>
              )}
              {form.problemType === 'open' && (
                <div className="space-y-3">
                  <div>
                    <label className="label">{t('admin.problem.answer_type_label')}</label>
                    <div className="flex gap-2">
                      {(['single', 'set'] as const).map(tp => (
                        <button
                          key={tp}
                          onClick={() => setForm(f => ({ ...f, openAnswerType: tp }))}
                          className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                            form.openAnswerType === tp ? 'border-primary bg-primary-light text-primary' : 'border-border text-muted'
                          }`}
                        >
                          {tp === 'single' ? t('admin.problem.single_number') : t('admin.problem.set_numbers')}
                        </button>
                      ))}
                    </div>
                  </div>
                  {form.openAnswerType === 'single' ? (
                    <div>
                      <label className="label">{t('admin.problem.correct_answer_label')}</label>
                      <input className="input" type="number" step="any" value={form.openAnswerValue} onChange={e => setForm(f => ({ ...f, openAnswerValue: e.target.value }))} placeholder={t('admin.problem.answer_placeholder')} />
                    </div>
                  ) : (
                    <div>
                      <label className="label">{t('admin.problem.correct_answers_set_label')}</label>
                      <input className="input" value={form.openAnswerValues} onChange={e => setForm(f => ({ ...f, openAnswerValues: e.target.value }))} placeholder={t('admin.problem.answers_placeholder')} />
                    </div>
                  )}
                </div>
              )}
              {!form.isHard && (
                <div>
                  <label className="label border-t border-border pt-3 mt-1">{t('admin.problem.hint_label')}</label>
                  <input
                    className="input" value={form.hint}
                    onChange={e => setForm(f => ({ ...f, hint: e.target.value }))}
                    placeholder={t('admin.problem.hint_placeholder')}
                  />
                  {form.hint && (
                    <div className="mt-2 p-3 bg-gray-50 rounded-lg text-sm text-gray-800">
                      <LatexText text={form.hint} />
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-3">
                <button className="btn-primary flex-1"   onClick={() => saveProblem()} disabled={saving}>{t('admin.save')}</button>
                <button className="btn-secondary flex-1" onClick={() => saveProblem(true)} disabled={saving}>{t('admin.modal.save_publish')}</button>
              </div>
            </>}

            <button className="btn-ghost w-full" onClick={closeModal}>{t('admin.cancel')}</button>
          </div>
        </div>
      )}
    </div>
  )
}
