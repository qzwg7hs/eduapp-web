import { useEffect, useState } from 'react'
import api from '@/api/client'
import { useI18n } from '@/contexts/I18nContext'
import {
  CommunityTestAdmin, CommunityTestAdminAttemptRow, CommunityTestAdminAttemptDetail,
  CommunityTestStudentOverview,
} from '@/types'
import { formatUtc5DateTime } from '@/lib/dailyTimer'
import { CheckCircle2, XCircle, AlertTriangle, Pencil, ChevronRight, ChevronLeft } from 'lucide-react'

export default function AdminCommunityTest() {
  const { t } = useI18n()
  const [tests, setTests] = useState<CommunityTestAdmin[]>([])
  const [students, setStudents] = useState<CommunityTestStudentOverview[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<CommunityTestAdmin | null>(null)
  const [form, setForm] = useState({ title_kz: '', title_ru: '', description_kz: '', description_ru: '', time_limit_minutes: 60 })
  const [saving, setSaving] = useState(false)

  // Student drill-down: click a student row -> their own attempt list;
  // click one of those -> the full per-question detail (chosen vs correct).
  const [drillStudent, setDrillStudent] = useState<CommunityTestStudentOverview | null>(null)
  const [drillAttempts, setDrillAttempts] = useState<CommunityTestAdminAttemptRow[]>([])
  const [loadingDrill, setLoadingDrill] = useState(false)
  const [detail, setDetail] = useState<CommunityTestAdminAttemptDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  async function loadTests() {
    const { data } = await api.get<CommunityTestAdmin[]>('/community-test/admin/tests')
    setTests(data)
  }

  async function loadStudents() {
    const { data } = await api.get<CommunityTestStudentOverview[]>('/community-test/admin/students-overview')
    setStudents(data)
  }

  useEffect(() => {
    Promise.all([loadTests(), loadStudents()]).finally(() => setLoading(false))
  }, [])

  function openEdit(test: CommunityTestAdmin) {
    setEditing(test)
    setForm({
      title_kz: test.title_kz ?? '', title_ru: test.title_ru ?? '',
      description_kz: test.description_kz ?? '', description_ru: test.description_ru ?? '',
      time_limit_minutes: test.time_limit_minutes,
    })
  }

  async function saveSettings() {
    if (!editing) return
    setSaving(true)
    try {
      await api.post(`/community-test/admin/tests/${editing.id}/settings`, form)
      setEditing(null)
      await loadTests()
    } finally {
      setSaving(false)
    }
  }

  async function deactivate(test: CommunityTestAdmin) {
    if (!confirm(t('admin.communityTest.confirm_deactivate'))) return
    await api.post(`/community-test/admin/tests/${test.id}/deactivate`)
    await loadTests()
  }

  async function openStudent(s: CommunityTestStudentOverview) {
    setDrillStudent(s)
    setLoadingDrill(true)
    setDrillAttempts([])
    const { data } = await api.get<CommunityTestAdminAttemptRow[]>('/community-test/admin/attempts', { params: { student_id: s.student_id } })
    setDrillAttempts(data)
    setLoadingDrill(false)
  }

  async function openDetail(attemptId: string) {
    setLoadingDetail(true)
    setDetail(null)
    const { data } = await api.get<CommunityTestAdminAttemptDetail>(`/community-test/admin/attempts/${attemptId}`)
    setDetail(data)
    setLoadingDetail(false)
  }

  if (loading) return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>

  return (
    <div className="max-w-3xl mx-auto px-4 lg:px-8 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('admin.communityTest.title')}</h1>

      {tests.length === 0 ? (
        <div className="text-center py-16 text-muted">
          <div className="text-4xl mb-3">🧮</div>
          <p className="font-medium">{t('admin.communityTest.no_tests')}</p>
        </div>
      ) : (
        <>
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">{t('admin.communityTest.editions')}</p>
          <div className="space-y-3 mb-8">
            {tests.map(test => (
              <div key={test.id} className="card">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900 truncate">{test.title_kz || test.title_ru}</p>
                      {test.is_active ? (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-50 text-success flex-shrink-0">
                          {t('admin.communityTest.active_badge')}
                        </span>
                      ) : (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-muted flex-shrink-0">
                          {t('admin.communityTest.closed_badge')}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted">
                      {t('admin.communityTest.meta', { q: test.question_count, a: test.attempt_count, m: test.time_limit_minutes })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border">
                  <button className="text-sm text-primary font-medium flex items-center gap-1" onClick={() => openEdit(test)}>
                    <Pencil className="w-3.5 h-3.5" /> {t('admin.communityTest.edit')}
                  </button>
                  {test.is_active && (
                    <button className="text-sm text-danger font-medium" onClick={() => deactivate(test)}>
                      {t('admin.communityTest.deactivate')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
        {t('admin.communityTest.students_heading', { n: students.length })}
      </p>
      {students.length === 0 ? (
        <p className="text-center text-muted py-10 text-sm">{t('admin.communityTest.no_students')}</p>
      ) : (
        <div className="space-y-2">
          {students.map(s => (
            <button
              key={s.student_id}
              onClick={() => openStudent(s)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-surface rounded-2xl border border-border hover:bg-bg transition-colors text-left"
            >
              <span className="flex-1 text-sm font-semibold text-gray-900 truncate">{s.name} {s.surname}</span>
              <span
                className="text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0"
                style={s.attempt_count > 0 ? { background: '#e7f2ec', color: '#2a7d5f' } : { background: '#f3f4f6', color: '#9ca3af' }}
              >
                {t('admin.communityTest.attempt_count', { n: s.attempt_count })}
              </span>
              <ChevronRight className="w-4 h-4 text-muted flex-shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* ── Settings modal ───────────────────────────────────────────────── */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-end lg:items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold">{t('admin.communityTest.edit_title')}</h2>
              <button onClick={() => setEditing(null)} className="text-muted text-xl leading-none">✕</button>
            </div>
            <div>
              <label className="label">{t('admin.communityTest.title_kz_label')}</label>
              <input className="input" value={form.title_kz} onChange={e => setForm(f => ({ ...f, title_kz: e.target.value }))} />
            </div>
            <div>
              <label className="label">{t('admin.communityTest.title_ru_label')}</label>
              <input className="input" value={form.title_ru} onChange={e => setForm(f => ({ ...f, title_ru: e.target.value }))} />
            </div>
            <div>
              <label className="label">{t('admin.communityTest.description_kz_label')}</label>
              <textarea className="input" rows={2} value={form.description_kz} onChange={e => setForm(f => ({ ...f, description_kz: e.target.value }))} />
            </div>
            <div>
              <label className="label">{t('admin.communityTest.description_ru_label')}</label>
              <textarea className="input" rows={2} value={form.description_ru} onChange={e => setForm(f => ({ ...f, description_ru: e.target.value }))} />
            </div>
            <div>
              <label className="label">{t('admin.communityTest.time_limit_label')}</label>
              <input
                className="input" type="number" min={1} value={form.time_limit_minutes}
                onChange={e => setForm(f => ({ ...f, time_limit_minutes: Number(e.target.value) || 1 }))}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button className="btn-primary flex-1" onClick={saveSettings} disabled={saving}>
                {saving ? t('admin.saving') : t('admin.communityTest.save')}
              </button>
              <button className="btn-ghost flex-1" onClick={() => setEditing(null)}>{t('admin.cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Student drill-down: their own attempt list ──────────────────────── */}
      {drillStudent && (
        <div className="fixed inset-0 bg-black/50 flex items-end lg:items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-start justify-between mb-5">
              <h2 className="text-xl font-bold text-gray-900">{drillStudent.name} {drillStudent.surname}</h2>
              <button onClick={() => setDrillStudent(null)} className="text-muted text-xl leading-none ml-4">✕</button>
            </div>
            {loadingDrill ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : drillAttempts.length === 0 ? (
              <p className="text-center text-muted py-8">{t('admin.communityTest.no_attempts')}</p>
            ) : (
              <div className="space-y-2">
                {drillAttempts.map(a => (
                  <button
                    key={a.id}
                    onClick={() => openDetail(a.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-bg rounded-2xl border border-border hover:bg-gray-100 transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {a.test_title} — {t('communityTest.attempt_label', { n: a.attempt_number })}
                      </p>
                      <p className="text-xs text-muted truncate">
                        {a.submitted_at ? formatUtc5DateTime(a.submitted_at) : ''}
                        {a.terminated_early && (
                          <span className="inline-flex items-center gap-1 ml-2 text-danger">
                            <AlertTriangle className="w-3 h-3" />{t('communityTest.terminated_badge')}
                          </span>
                        )}
                      </p>
                    </div>
                    <span className="text-sm font-display font-semibold flex-shrink-0" style={{ color: a.score > 0 ? '#2a7d5f' : '#374151' }}>
                      {a.score}/{a.total}
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Attempt detail modal (stacks on top of the student drill-down) ──── */}
      {(detail || loadingDetail) && (
        <div className="fixed inset-0 bg-black/60 flex items-end lg:items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            {loadingDetail && (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            )}
            {detail && (
              <>
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <button
                      onClick={() => setDetail(null)}
                      className="text-sm text-muted font-medium flex items-center gap-1 mb-2 hover:text-gray-700"
                    >
                      <ChevronLeft className="w-4 h-4" /> {t('admin.communityTest.back_to_attempts')}
                    </button>
                    <h2 className="text-xl font-bold text-gray-900">{detail.student_name} {detail.student_surname}</h2>
                    <p className="text-sm text-muted mt-0.5">
                      {detail.test_title} — {t('communityTest.attempt_label', { n: detail.attempt_number })}
                    </p>
                  </div>
                </div>
                <div className="rounded-xl px-4 py-3 mb-5 text-center" style={{ background: '#f9f6f1', border: '1px solid #f0e5d4' }}>
                  <p className="text-xl font-display font-bold" style={{ color: detail.score > 0 ? '#2a7d5f' : '#374151' }}>
                    {detail.score} / {detail.total}
                  </p>
                  {detail.terminated_early && (
                    <p className="text-xs text-danger mt-1 flex items-center justify-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> {t('admin.communityTest.terminated_note')}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  {detail.results.map(r => (
                    <div key={r.number} className="rounded-xl px-3 py-2.5" style={{ background: '#f9f6f1', border: '1px solid #f0e5d4' }}>
                      <div className="flex items-start gap-2">
                        {r.is_correct
                          ? <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                          : <XCircle className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />}
                        <p className="text-xs text-gray-700 leading-snug flex-1">
                          <span className="font-bold text-primary mr-1">#{r.number}</span>{r.question}
                        </p>
                      </div>
                      <div className="flex gap-4 mt-1.5 ml-6 text-[11px]">
                        <span className="text-muted">
                          {t('admin.communityTest.chosen')}: {r.given_selected_option != null ? `${['A', 'B', 'C', 'D'][r.given_selected_option]}) ${r.options[r.given_selected_option]}` : '—'}
                        </span>
                        <span className="text-success font-medium">
                          {t('admin.communityTest.correct_label')}: {['A', 'B', 'C', 'D'][r.correct_option]}) {r.options[r.correct_option]}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
