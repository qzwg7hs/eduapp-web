import { useEffect, useState } from 'react'
import api from '@/api/client'
import { Profile } from '@/types'
import { useI18n } from '@/contexts/I18nContext'
import { CheckCircle2, XCircle, ChevronDown, ChevronUp, Search, X } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ResultRow {
  problem_id:     string
  question:       string
  level:          string | null
  problem_type:   string
  is_correct:     boolean
  points_earned:  number
  hints_used:     number
  answer_given:   string | null
  attempted_at:   string | null
  lesson_title:   string | null
  subtopic_title: string | null
  topic_title:    string | null
}

interface TestBankExamRow {
  exam_date:        string
  language:         string
  score:            number
  total:            number
  terminated_early: boolean
  submitted_at:     string | null
}

interface StudentResults {
  student: {
    id: string; name: string; surname: string
    username: string; plain_password: string
    points: number; is_active: boolean
  }
  total_attempts: number
  correct_count:  number
  total_points:   number
  results:        ResultRow[]
  test_bank_exams: TestBankExamRow[]
}

// ─── Edit modal state ─────────────────────────────────────────────────────────

interface Modal {
  open: boolean
  editing: Profile | null
  name: string; surname: string; username: string; password: string
  showPassword: boolean; changingPassword: boolean
  newPassword: string; currentPassword: string; showCurrent: boolean
}

const defaultModal = (): Modal => ({
  open: false, editing: null, name: '', surname: '', username: '', password: '',
  showPassword: false, changingPassword: false, newPassword: '', currentPassword: '', showCurrent: false,
})

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminStudents() {
  const { t } = useI18n()
  const [students, setStudents] = useState<Profile[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [m,        setM]        = useState<Modal>(defaultModal())
  const [error,    setError]    = useState('')
  const [results,  setResults]  = useState<StudentResults | null>(null)
  const [loadingResults, setLoadingResults] = useState(false)
  const [search, setSearch] = useState('')

  async function load() {
    const { data } = await api.get<Profile[]>('/students')
    setStudents(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function close()        { setM(defaultModal()); setError('') }
  function closeResults() { setResults(null) }

  async function openEdit(s: Profile) {
    const pwRes = await api.get<{ plain_password: string }>(`/students/${s.id}/plain-password`)
    setM({ ...defaultModal(), open: true, editing: s, name: s.name, surname: s.surname, username: s.username ?? '', currentPassword: pwRes.data.plain_password })
    setError('')
  }

  async function openResults(s: Profile) {
    setLoadingResults(true)
    setResults(null)
    const { data } = await api.get<StudentResults>(`/students/${s.id}/results`)
    setResults(data)
    setLoadingResults(false)
  }

  async function save() {
    if (!m.name || !m.surname || !m.username) { setError('Имя, фамилия и логин обязательны.'); return }
    setSaving(true); setError('')
    try {
      if (m.editing) {
        await api.put(`/students/${m.editing.id}`, {
          name: m.name, surname: m.surname, username: m.username,
          ...(m.changingPassword && m.newPassword ? { new_password: m.newPassword } : {}),
        })
      } else {
        if (!m.password) { setError('Пароль обязателен.'); setSaving(false); return }
        await api.post('/students', { name: m.name, surname: m.surname, username: m.username, password: m.password })
      }
      close(); load()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Что-то пошло не так.')
    }
    setSaving(false)
  }

  async function resetPoints(s: Profile) {
    if (!confirm(`Сбросить очки ${s.name} до 0?`)) return
    await api.post(`/students/${s.id}/reset-points`)
    load()
  }

  async function toggleActive(s: Profile) {
    const action = s.is_active ? t('admin.students.deactivate') : t('admin.students.activate')
    if (!confirm(`${action} ${s.name} ${s.surname}?`)) return
    await api.post(`/students/${s.id}/toggle-active`)
    load()
  }

  async function deleteStudent(s: Profile) {
    if (!confirm(`Удалить ${s.name} ${s.surname}? Все их данные будут утеряны.`)) return
    await api.delete(`/students/${s.id}`)
    load()
  }

  if (loading) return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>

  const q = search.trim().toLowerCase()
  const filtered = q
    ? students.filter(s =>
        `${s.name} ${s.surname}`.toLowerCase().includes(q) ||
        (s.username ?? '').toLowerCase().includes(q))
    : students
  const active   = filtered.filter(s => s.is_active)
  const inactive = filtered.filter(s => !s.is_active)

  return (
    <div className="max-w-3xl mx-auto px-4 lg:px-8 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('admin.students.title')} ({students.length})</h1>
        <button className="btn-primary" onClick={() => { setM(prev => ({ ...defaultModal(), open: true })); setError('') }}>
          {t('admin.students.add')}
        </button>
      </div>

      {students.length > 0 && (
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
          <input
            className="w-full pl-9 pr-9 py-2 rounded-xl border border-border bg-surface text-sm text-gray-900 placeholder:text-muted focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
            placeholder={t('admin.students.search_placeholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-gray-700" onClick={() => setSearch('')}>
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {students.length === 0 && (
        <div className="text-center py-16 text-muted">
          <div className="text-4xl mb-3">👥</div>
          <p className="font-medium">{t('admin.students.no_students')}</p>
        </div>
      )}

      {students.length > 0 && filtered.length === 0 && (
        <div className="text-center py-16 text-muted">
          <div className="text-4xl mb-3">🔍</div>
          <p className="font-medium">{t('admin.students.no_results')}</p>
        </div>
      )}

      {active.length > 0 && (
        <>
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">{t('admin.students.active')} ({active.length})</p>
          <div className="space-y-3 mb-6">
            {active.map(s => (
              <StudentCard key={s.id} s={s} t={t}
                onEdit={openEdit} onReset={resetPoints} onToggle={toggleActive}
                onDelete={deleteStudent} onResults={openResults}
              />
            ))}
          </div>
        </>
      )}

      {inactive.length > 0 && (
        <>
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">{t('admin.students.deactivated')} ({inactive.length})</p>
          <div className="space-y-3 mb-6 opacity-70">
            {inactive.map(s => (
              <StudentCard key={s.id} s={s} t={t}
                onEdit={openEdit} onReset={resetPoints} onToggle={toggleActive}
                onDelete={deleteStudent} onResults={openResults}
              />
            ))}
          </div>
        </>
      )}

      {/* ── Edit / Create modal ─────────────────────────────────────────────── */}
      {m.open && (
        <div className="fixed inset-0 bg-black/50 flex items-end lg:items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold">
                {m.editing ? t('admin.students.edit_title') : t('admin.students.new_title')}
              </h2>
              <button onClick={close} className="text-muted text-xl leading-none">✕</button>
            </div>

            <div>
              <label className="label">{t('admin.students.first_name')}</label>
              <input className="input" value={m.name} onChange={e => setM(p => ({ ...p, name: e.target.value }))} placeholder="Бериk" />
            </div>
            <div>
              <label className="label">{t('admin.students.last_name')}</label>
              <input className="input" value={m.surname} onChange={e => setM(p => ({ ...p, surname: e.target.value }))} placeholder="Миндетбаев" />
            </div>
            <div>
              <label className="label">{t('admin.students.username')}</label>
              <input className="input" value={m.username} onChange={e => setM(p => ({ ...p, username: e.target.value }))} placeholder="berik_m" autoCapitalize="none" />
            </div>

            {!m.editing && (
              <div>
                <label className="label">{t('admin.students.password')}</label>
                <div className="relative">
                  <input
                    className="input pr-10"
                    type={m.showPassword ? 'text' : 'password'}
                    value={m.password}
                    onChange={e => setM(p => ({ ...p, password: e.target.value }))}
                    placeholder="••••••••"
                  />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted"
                    onClick={() => setM(p => ({ ...p, showPassword: !p.showPassword }))}>
                    {m.showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
            )}

            {m.editing && (
              <>
                <div>
                  <label className="label">{t('admin.students.current_password')}</label>
                  <div className="relative">
                    <input className="input pr-10 bg-gray-50" type={m.showCurrent ? 'text' : 'password'} value={m.currentPassword} readOnly />
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted"
                      onClick={() => setM(p => ({ ...p, showCurrent: !p.showCurrent }))}>
                      {m.showCurrent ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>
                <button type="button" className="text-sm text-primary font-medium"
                  onClick={() => setM(p => ({ ...p, changingPassword: !p.changingPassword, newPassword: '' }))}>
                  {m.changingPassword ? t('admin.students.cancel_pw') : t('admin.students.change_password')}
                </button>
                {m.changingPassword && (
                  <div>
                    <label className="label">{t('admin.students.new_password')}</label>
                    <input className="input" type="password" value={m.newPassword}
                      onChange={e => setM(p => ({ ...p, newPassword: e.target.value }))} placeholder="••••••••" />
                  </div>
                )}
              </>
            )}

            {error && <div className="bg-danger-light border border-red-200 rounded-lg px-3 py-2 text-sm text-danger">{error}</div>}

            <div className="flex gap-3 pt-2">
              <button className="btn-primary flex-1" onClick={save} disabled={saving}>
                {saving ? t('admin.saving') : m.editing ? t('admin.students.save_changes') : t('admin.students.create')}
              </button>
              <button className="btn-ghost flex-1" onClick={close}>{t('admin.cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Results modal ────────────────────────────────────────────────────── */}
      {(results || loadingResults) && (
        <div className="fixed inset-0 bg-black/50 flex items-end lg:items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            {loadingResults && (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            )}
            {results && <ResultsView results={results} onClose={closeResults} t={t} />}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Student card ─────────────────────────────────────────────────────────────

function StudentCard({
  s, t, onEdit, onReset, onToggle, onDelete, onResults
}: {
  s: Profile
  t: (key: string, vars?: Record<string, string | number>) => string
  onEdit:    (s: Profile) => void
  onReset:   (s: Profile) => void
  onToggle:  (s: Profile) => void
  onDelete:  (s: Profile) => void
  onResults: (s: Profile) => void
}) {
  return (
    <div className="card">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
          s.is_active ? 'bg-primary-light text-primary' : 'bg-gray-100 text-gray-400'
        }`}>
          {s.name[0]}{s.surname[0]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-gray-900">{s.name} {s.surname}</p>
            {!s.is_active && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-50 text-danger">
                {t('admin.students.inactive_badge')}
              </span>
            )}
          </div>
          <p className="text-sm text-muted">@{s.username ?? '—'}</p>
        </div>
        <span className="text-sm font-semibold text-warning flex-shrink-0">⭐ {s.points}</span>
      </div>
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border flex-wrap">
        <button className="text-sm text-primary font-medium" onClick={() => onEdit(s)}>
          {t('admin.students.edit')}
        </button>
        <button className="text-sm font-medium" style={{ color: '#178f8f' }} onClick={() => onResults(s)}>
          {t('admin.students.results')}
        </button>
        <button className="text-sm text-warning font-medium" onClick={() => onReset(s)}>
          {t('admin.students.reset_pts')}
        </button>
        <button className={`text-sm font-medium ${s.is_active ? 'text-muted' : 'text-success'}`} onClick={() => onToggle(s)}>
          {s.is_active ? t('admin.students.deactivate') : t('admin.students.activate')}
        </button>
        <button className="text-sm text-danger font-medium" onClick={() => onDelete(s)}>
          {t('admin.students.delete')}
        </button>
      </div>
    </div>
  )
}

// ─── Results view ─────────────────────────────────────────────────────────────

function ResultsView({
  results, onClose, t
}: {
  results: StudentResults
  onClose: () => void
  t: (key: string, vars?: Record<string, string | number>) => string
}) {
  const { student, correct_count, total_attempts, results: rows, test_bank_exams: exams } = results
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggleGroup(key: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  // Group by topic → subtopic → lesson
  const grouped: Record<string, Record<string, Record<string, ResultRow[]>>> = {}
  rows.forEach(r => {
    const tp  = r.topic_title    ?? '—'
    const sub = r.subtopic_title ?? '—'
    const les = r.lesson_title   ?? '—'
    if (!grouped[tp])      grouped[tp]      = {}
    if (!grouped[tp][sub]) grouped[tp][sub] = {}
    if (!grouped[tp][sub][les]) grouped[tp][sub][les] = []
    grouped[tp][sub][les].push(r)
  })

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{student.name} {student.surname}</h2>
          <p className="text-sm text-muted mt-0.5">@{student.username}</p>
        </div>
        <button onClick={onClose} className="text-muted text-xl leading-none ml-4">✕</button>
      </div>

      {/* Account info */}
      <div
        className="rounded-xl px-4 py-3 mb-5 grid grid-cols-2 gap-3 text-sm"
        style={{ background: '#f9f6f1', border: '1px solid #f0e5d4' }}
      >
        <div>
          <p className="text-xs text-muted mb-0.5">{t('admin.students.username')}</p>
          <p className="font-mono font-semibold text-gray-900">{student.username}</p>
        </div>
        <div>
          <p className="text-xs text-muted mb-0.5">{t('admin.students.password_label')}</p>
          <p className="font-mono font-semibold text-gray-900">{student.plain_password}</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Всего вопросов', value: total_attempts },
          { label: 'Правильно',      value: correct_count,
            color: correct_count > 0 ? '#2a7d5f' : undefined },
          { label: '⭐ Очков',       value: student.points, color: '#d99a10' },
        ].map(stat => (
          <div key={stat.label} className="rounded-xl p-3 text-center" style={{ background: '#f9f6f1', border: '1px solid #f0e5d4' }}>
            <p className="text-xl font-display font-bold" style={{ color: stat.color ?? '#374151' }}>{stat.value}</p>
            <p className="text-xs text-muted mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Test Bank (daily exam) history — separate from the topic/subtopic tests below */}
      {exams.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">Тест банкі / Банк тестов</p>
          <div className="space-y-1.5">
            {exams.map(e => (
              <div key={e.exam_date} className="flex items-center justify-between px-3 py-2 rounded-lg text-sm" style={{ background: '#f9f6f1', border: '1px solid #f0e5d4' }}>
                <div className="flex items-center gap-2">
                  <span className="text-gray-900 font-medium">{e.exam_date}</span>
                  <span className="badge bg-gray-100 text-gray-600 text-xs uppercase">{e.language}</span>
                  {e.terminated_early && (
                    <span className="badge bg-danger-light text-danger text-xs">⚠ покинул страницу</span>
                  )}
                </div>
                <span className="font-display font-semibold" style={{ color: e.score > 0 ? '#2a7d5f' : '#374151' }}>
                  {e.score} / {e.total}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">Тақырып тесттері / Тесты по темам</p>
      )}
      {rows.length === 0 ? (
        exams.length === 0 && <p className="text-center text-muted py-8">Нет попыток</p>
      ) : (
        <div className="space-y-3">
          {Object.entries(grouped).map(([topic, subs]) => (
            <div key={topic} className="rounded-xl border border-border overflow-hidden">
              {/* Topic header */}
              <button
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 text-left"
                onClick={() => toggleGroup(topic)}
              >
                <span className="font-semibold text-sm text-gray-900">{topic}</span>
                {expanded.has(topic) ? <ChevronUp className="w-4 h-4 text-muted" /> : <ChevronDown className="w-4 h-4 text-muted" />}
              </button>

              {expanded.has(topic) && Object.entries(subs).map(([sub, lessons]) => (
                <div key={sub} className="border-t border-border">
                  <p className="px-4 py-2 text-xs font-bold text-muted uppercase tracking-wider bg-gray-50/50">{sub}</p>
                  {Object.entries(lessons).map(([les, problems]) => (
                    <div key={les} className="px-4 py-2 border-t border-border/50">
                      <p className="text-xs font-semibold text-gray-700 mb-2">{les}</p>
                      <div className="space-y-1.5">
                        {problems.map(r => (
                          <div key={r.problem_id} className="flex items-start gap-2">
                            {r.is_correct
                              ? <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                              : <XCircle     className="w-4 h-4 text-danger  flex-shrink-0 mt-0.5" />
                            }
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-gray-700 leading-snug">
                                {r.level && <span className="font-bold text-primary mr-1">Ур.{r.level}</span>}
                                {r.question}
                              </p>
                              <div className="flex gap-3 mt-0.5 text-[10px] text-muted">
                                {r.points_earned > 0 && <span className="text-success font-semibold">+{r.points_earned} очк.</span>}
                                {r.hints_used > 0    && <span>💡 подсказка</span>}
                                {r.answer_given      && <span>Ответ: {r.answer_given}</span>}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
