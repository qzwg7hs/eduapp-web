import { useEffect, useState } from 'react'
import api from '@/api/client'
import { ProblemReport } from '@/types'
import { useI18n } from '@/contexts/I18nContext'

interface ReportWithProblem extends ProblemReport {
  problem_question?: string
  problem_type?: string
  current_correct_options?: number[]
  current_open_answer?: any
  options?: string[]
}

type ResolveState = {
  reportId: string
  action: 'fix' | 'dismiss'
  adminNote: string
  newCorrectOptions: number[]
  openAnswerType: 'single' | 'set'
  openAnswerValue: string
  openAnswerValues: string
  problem: ReportWithProblem | null
}

const defaultResolve = (): ResolveState => ({
  reportId: '',
  action: 'dismiss',
  adminNote: '',
  newCorrectOptions: [],
  openAnswerType: 'single',
  openAnswerValue: '',
  openAnswerValues: '',
  problem: null,
})

export default function AdminReports() {
  const { t } = useI18n()
  const [reports, setReports] = useState<ReportWithProblem[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'pending' | 'resolved' | 'dismissed'>('pending')
  const [resolving, setResolving] = useState(false)
  const [modal, setModal] = useState<ResolveState | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await api.get<ProblemReport[]>(`/reports?status=${statusFilter}`)
    setReports(data as ReportWithProblem[])
    setLoading(false)
  }

  useEffect(() => { load() }, [statusFilter])

  async function openResolve(report: ProblemReport) {
    const problem: ReportWithProblem = { ...report }
    setModal({ ...defaultResolve(), reportId: report.id, problem })
  }

  async function submitResolve() {
    if (!modal) return
    setResolving(true)
    try {
      const body: any = {
        action: modal.action,
        admin_note: modal.adminNote || null,
      }
      if (modal.action === 'fix') {
        if (modal.problem?.problem_type === 'open' || !modal.problem?.problem_type) {
          if (modal.openAnswerType === 'single') {
            body.new_open_answer = { type: 'single', value: parseFloat(modal.openAnswerValue) }
          } else {
            body.new_open_answer = {
              type: 'set',
              values: modal.openAnswerValues.split(',').map(v => parseFloat(v.trim())).filter(n => !isNaN(n))
            }
          }
        } else {
          body.new_correct_options = modal.newCorrectOptions
        }
      }
      await api.post(`/reports/${modal.reportId}/resolve`, body)
      setModal(null)
      load()
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to resolve report')
    }
    setResolving(false)
  }

  function formatDate(s: string) {
    return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const statuses = ['pending', 'resolved', 'dismissed'] as const

  return (
    <div className="max-w-3xl mx-auto px-4 lg:px-8 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('admin.reports.title')}</h1>
        <div className="flex rounded-lg overflow-hidden border border-border">
          {statuses.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                statusFilter === s ? 'bg-primary text-white' : 'bg-surface text-muted hover:bg-gray-100'
              }`}
            >
              {t(`admin.reports.${s}`)}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}

      {!loading && reports.length === 0 && (
        <div className="text-center py-16 text-muted">
          <div className="text-4xl mb-3">🚩</div>
          <p className="font-medium">{t('admin.reports.no_reports', { status: t(`admin.reports.${statusFilter}`) })}</p>
        </div>
      )}

      <div className="space-y-3">
        {reports.map(r => (
          <div key={r.id} className="card">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`badge text-xs ${
                    r.status === 'pending' ? 'bg-warning-light text-warning' :
                    r.status === 'resolved' ? 'bg-success-light text-success' :
                    'bg-gray-100 text-muted'
                  }`}>
                    {t(`admin.reports.${r.status}`)}
                  </span>
                  <span className="text-xs text-muted">{formatDate(r.created_at)}</span>
                </div>
                <p className="text-sm text-gray-900 font-medium mb-1">{r.description}</p>
                <p className="text-xs text-muted">Problem ID: {r.problem_id.slice(0, 8)}…</p>
                {r.admin_note && (
                  <p className="text-xs text-primary mt-1">Admin: {r.admin_note}</p>
                )}
              </div>
              {r.status === 'pending' && (
                <button className="btn-primary text-sm py-1.5 px-3 flex-shrink-0" onClick={() => openResolve(r)}>
                  {t('admin.reports.resolve')}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-end lg:items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{t('admin.reports.resolve_title')}</h2>
              <button onClick={() => setModal(null)} className="text-muted text-xl leading-none">✕</button>
            </div>

            <div>
              <label className="label">{t('admin.reports.action')}</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setModal(m => m && ({ ...m, action: 'fix' }))}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    modal.action === 'fix' ? 'border-primary bg-primary-light text-primary' : 'border-border text-muted'
                  }`}
                >
                  {t('admin.reports.fix')}
                </button>
                <button
                  onClick={() => setModal(m => m && ({ ...m, action: 'dismiss' }))}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    modal.action === 'dismiss' ? 'border-danger bg-danger-light text-danger' : 'border-border text-muted'
                  }`}
                >
                  {t('admin.reports.dismiss_action')}
                </button>
              </div>
            </div>

            {modal.action === 'fix' && (
              <>
                <div className="bg-warning-light border border-yellow-200 rounded-lg p-3 text-xs text-warning">
                  {t('admin.reports.retro_note')}
                </div>

                <div>
                  <label className="label">{t('admin.reports.problem_type')}</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setModal(m => m && ({ ...m, problem: { ...m.problem!, problem_type: 'mcq' } }))}
                      className={`flex-1 py-2 rounded-lg border text-sm font-medium ${
                        modal.problem?.problem_type !== 'open' ? 'border-primary bg-primary-light text-primary' : 'border-border text-muted'
                      }`}
                    >
                      MCQ
                    </button>
                    <button
                      onClick={() => setModal(m => m && ({ ...m, problem: { ...m.problem!, problem_type: 'open' } }))}
                      className={`flex-1 py-2 rounded-lg border text-sm font-medium ${
                        modal.problem?.problem_type === 'open' ? 'border-primary bg-primary-light text-primary' : 'border-border text-muted'
                      }`}
                    >
                      Open
                    </button>
                  </div>
                </div>

                {modal.problem?.problem_type === 'open' ? (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setModal(m => m && ({ ...m, openAnswerType: 'single' }))}
                        className={`flex-1 py-2 rounded-lg border text-sm ${modal.openAnswerType === 'single' ? 'border-primary text-primary' : 'border-border text-muted'}`}
                      >
                        Single number
                      </button>
                      <button
                        onClick={() => setModal(m => m && ({ ...m, openAnswerType: 'set' }))}
                        className={`flex-1 py-2 rounded-lg border text-sm ${modal.openAnswerType === 'set' ? 'border-primary text-primary' : 'border-border text-muted'}`}
                      >
                        Set of numbers
                      </button>
                    </div>
                    {modal.openAnswerType === 'single' ? (
                      <div>
                        <label className="label">Correct answer (number)</label>
                        <input className="input" type="number" value={modal.openAnswerValue} onChange={e => setModal(m => m && ({ ...m, openAnswerValue: e.target.value }))} placeholder="e.g. 42" />
                      </div>
                    ) : (
                      <div>
                        <label className="label">Correct answers (comma-separated)</label>
                        <input className="input" value={modal.openAnswerValues} onChange={e => setModal(m => m && ({ ...m, openAnswerValues: e.target.value }))} placeholder="e.g. 1, 2, 3" />
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="label">Correct option indices (0-based, comma-separated)</label>
                    <input
                      className="input"
                      value={modal.newCorrectOptions.join(', ')}
                      onChange={e => {
                        const vals = e.target.value.split(',').map(v => parseInt(v.trim())).filter(n => !isNaN(n))
                        setModal(m => m && ({ ...m, newCorrectOptions: vals }))
                      }}
                      placeholder="e.g. 0 or 0, 2"
                    />
                    <p className="text-xs text-muted mt-1">Option A = 0, B = 1, C = 2, D = 3…</p>
                  </div>
                )}
              </>
            )}

            <div>
              <label className="label">{t('admin.reports.admin_note')}</label>
              <textarea
                className="input w-full resize-none"
                rows={2}
                value={modal.adminNote}
                onChange={e => setModal(m => m && ({ ...m, adminNote: e.target.value }))}
                placeholder="Internal note…"
              />
            </div>

            <div className="flex gap-3">
              <button className="btn-primary flex-1" onClick={submitResolve} disabled={resolving}>
                {resolving ? t('admin.saving') : t('admin.reports.confirm')}
              </button>
              <button className="btn-ghost flex-1" onClick={() => setModal(null)}>{t('admin.cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
