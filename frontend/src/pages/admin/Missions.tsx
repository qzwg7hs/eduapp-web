import { useEffect, useState } from 'react'
import api from '@/api/client'
import { useI18n } from '@/contexts/I18nContext'
import { Plus, Trash2, Target } from 'lucide-react'

interface GoalType { goal_type: string; label: string }
interface MissionAdminOut {
  id: string
  goal_type: string
  target: number
  reward_points: number
  week_start: string
  week_end: string
  text_kz: string
  text_ru: string
}

// The backend's goal_type set is fixed and safe-by-construction (see
// backend/app/missions.py) — this just maps each key to a translated label
// for the dropdown instead of showing the backend's English admin-facing text.
const GOAL_TYPE_LABEL_KEYS: Record<string, string> = {
  pod_correct_count: 'admin.missions.goal.pod_correct_count',
  daily_exam_completed_count: 'admin.missions.goal.daily_exam_completed_count',
  daily_exam_score_sum: 'admin.missions.goal.daily_exam_score_sum',
  daily_exam_single_score: 'admin.missions.goal.daily_exam_single_score',
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}
function nextMondayIso() {
  const d = new Date()
  const day = d.getDay() // 0=Sun..6=Sat
  const diff = day === 1 ? 7 : (8 - day) % 7 || 7
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

export default function AdminMissions() {
  const { t } = useI18n()
  const [missions, setMissions] = useState<MissionAdminOut[]>([])
  const [goalTypes, setGoalTypes] = useState<GoalType[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<MissionAdminOut | null>(null)

  const [form, setForm] = useState({ goal_type: '', target: '3', reward_points: '20', week_start: nextMondayIso() })

  async function load() {
    setLoading(true)
    const [m, g] = await Promise.all([
      api.get<MissionAdminOut[]>('/missions/admin'),
      api.get<GoalType[]>('/missions/admin/goal-types'),
    ])
    setMissions(m.data)
    setGoalTypes(g.data)
    if (!form.goal_type && g.data.length > 0) setForm(f => ({ ...f, goal_type: g.data[0].goal_type }))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function createMission() {
    setError('')
    const target = parseInt(form.target, 10)
    const reward = parseInt(form.reward_points, 10)
    if (!form.goal_type) { setError(t('admin.missions.err_goal_type')); return }
    if (!target || target <= 0) { setError(t('admin.missions.err_target')); return }
    if (!reward || reward <= 0) { setError(t('admin.missions.err_reward')); return }

    setSaving(true)
    try {
      await api.post('/missions/admin', {
        goal_type: form.goal_type, target, reward_points: reward, week_start: form.week_start,
      })
      setForm(f => ({ ...f, target: '3', reward_points: '20' }))
      await load()
    } catch (e: any) {
      setError(e.response?.data?.detail || t('admin.missions.err_generic'))
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    await api.delete(`/missions/admin/${deleteTarget.id}`)
    setDeleteTarget(null)
    load()
  }

  const today = todayIso()
  const current = missions.filter(m => m.week_start <= today && m.week_end >= today)
  const upcoming = missions.filter(m => m.week_start > today)
  const past = missions.filter(m => m.week_end < today)

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto px-4 lg:px-8 py-6">
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">{t('admin.missions.title')}</h1>
      <p className="text-sm text-muted mb-6">{t('admin.missions.subtitle')}</p>

      {/* Create form */}
      <div className="card mb-8" style={{ boxShadow: '0 4px 16px -8px rgba(44,36,24,0.1)' }}>
        <h2 className="font-display font-semibold text-base text-gray-900 mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4" /> {t('admin.missions.new')}
        </h2>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="label">{t('admin.missions.goal_type_label')}</label>
            <select className="input" value={form.goal_type} onChange={e => setForm(f => ({ ...f, goal_type: e.target.value }))}>
              {goalTypes.map(g => (
                <option key={g.goal_type} value={g.goal_type}>
                  {GOAL_TYPE_LABEL_KEYS[g.goal_type] ? t(GOAL_TYPE_LABEL_KEYS[g.goal_type]) : g.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{t('admin.missions.week_start_label')}</label>
            <input type="date" className="input" value={form.week_start} onChange={e => setForm(f => ({ ...f, week_start: e.target.value }))} />
          </div>
          <div>
            <label className="label">{t('admin.missions.target_label')}</label>
            <input
              type="number" min={1} className="input" value={form.target}
              onChange={e => setForm(f => ({ ...f, target: e.target.value }))}
              onWheel={e => e.currentTarget.blur()}
            />
          </div>
          <div>
            <label className="label">{t('admin.missions.reward_label')}</label>
            <input
              type="number" min={1} className="input" value={form.reward_points}
              onChange={e => setForm(f => ({ ...f, reward_points: e.target.value }))}
              onWheel={e => e.currentTarget.blur()}
            />
          </div>
        </div>
        {error && <p className="text-sm text-danger mb-3">{error}</p>}
        <button className="btn-primary" onClick={createMission} disabled={saving}>
          {saving ? t('admin.saving') : t('admin.missions.create')}
        </button>
      </div>

      {[
        { label: t('admin.missions.current'), rows: current },
        { label: t('admin.missions.upcoming'), rows: upcoming },
        { label: t('admin.missions.past'), rows: past },
      ].map(section => section.rows.length > 0 && (
        <div key={section.label} className="mb-6">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">{section.label}</h2>
          <div className="card divide-y divide-border p-0 overflow-hidden">
            {section.rows.map(m => (
              <div key={m.id} className="flex items-start gap-3 px-4 py-3">
                <Target className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{m.text_kz}</p>
                  <p className="text-sm text-muted">{m.text_ru}</p>
                  <p className="text-xs text-muted mt-1">
                    {m.week_start} – {m.week_end} · +{m.reward_points} ⭐
                  </p>
                </div>
                <button onClick={() => setDeleteTarget(m)} className="text-danger flex-shrink-0 p-1 hover:bg-danger-light rounded-lg transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {missions.length === 0 && (
        <p className="text-center text-muted py-10 text-sm">{t('admin.missions.none')}</p>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-surface rounded-2xl p-5 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="font-display font-semibold text-base text-gray-900 mb-1">{t('admin.missions.delete_title')}</h3>
            <p className="text-sm text-muted mb-4">{deleteTarget.text_kz}</p>
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => setDeleteTarget(null)}>{t('admin.cancel')}</button>
              <button className="flex-1 py-2.5 rounded-xl bg-danger text-white font-semibold text-sm" onClick={confirmDelete}>{t('admin.delete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
