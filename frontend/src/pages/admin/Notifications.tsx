import { useEffect, useState } from 'react'
import api from '@/api/client'
import { useI18n } from '@/contexts/I18nContext'
import { Plus, Trash2, Bell } from 'lucide-react'
import { NotificationAdminOut } from '@/types'

export default function AdminNotifications() {
  const { t } = useI18n()
  const [items, setItems] = useState<NotificationAdminOut[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<NotificationAdminOut | null>(null)

  const [form, setForm] = useState({ icon: '', title_kz: '', title_ru: '', body_kz: '', body_ru: '' })

  async function load() {
    setLoading(true)
    const { data } = await api.get<NotificationAdminOut[]>('/notifications/admin')
    setItems(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function send() {
    setError('')
    if (!form.title_kz.trim() || !form.title_ru.trim() || !form.body_kz.trim() || !form.body_ru.trim()) {
      setError(t('admin.notif.err_required'))
      return
    }
    setSaving(true)
    try {
      await api.post('/notifications/admin', { ...form, icon: form.icon.trim() || null })
      setForm({ icon: '', title_kz: '', title_ru: '', body_kz: '', body_ru: '' })
      await load()
    } catch (e: any) {
      setError(e.response?.data?.detail || t('admin.notif.err_generic'))
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    await api.delete(`/notifications/admin/${deleteTarget.id}`)
    setDeleteTarget(null)
    load()
  }

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto px-4 lg:px-8 py-6">
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">{t('admin.notif.title')}</h1>
      <p className="text-sm text-muted mb-6">{t('admin.notif.subtitle')}</p>

      {/* Compose form */}
      <div className="card mb-8" style={{ boxShadow: '0 4px 16px -8px rgba(44,36,24,0.1)' }}>
        <h2 className="font-display font-semibold text-base text-gray-900 mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4" /> {t('admin.notif.new')}
        </h2>
        <div className="mb-3">
          <label className="label">{t('admin.notif.icon_label')}</label>
          <input
            className="input max-w-[120px]" maxLength={4} placeholder="🎉"
            value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="label">{t('admin.notif.title_kz_label')}</label>
            <input className="input" value={form.title_kz} onChange={e => setForm(f => ({ ...f, title_kz: e.target.value }))} />
          </div>
          <div>
            <label className="label">{t('admin.notif.title_ru_label')}</label>
            <input className="input" value={form.title_ru} onChange={e => setForm(f => ({ ...f, title_ru: e.target.value }))} />
          </div>
          <div>
            <label className="label">{t('admin.notif.body_kz_label')}</label>
            <textarea className="input min-h-[90px]" value={form.body_kz} onChange={e => setForm(f => ({ ...f, body_kz: e.target.value }))} />
          </div>
          <div>
            <label className="label">{t('admin.notif.body_ru_label')}</label>
            <textarea className="input min-h-[90px]" value={form.body_ru} onChange={e => setForm(f => ({ ...f, body_ru: e.target.value }))} />
          </div>
        </div>
        {error && <p className="text-sm text-danger mb-3">{error}</p>}
        <button className="btn-primary" onClick={send} disabled={saving}>
          {saving ? t('admin.saving') : t('admin.notif.send')}
        </button>
      </div>

      <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">{t('admin.notif.sent_list')}</h2>
      {items.length === 0 ? (
        <p className="text-center text-muted py-10 text-sm">{t('admin.notif.none')}</p>
      ) : (
        <div className="card divide-y divide-border p-0 overflow-hidden">
          {items.map(n => (
            <div key={n.id} className="flex items-start gap-3 px-4 py-3">
              <span className="w-4 h-4 flex-shrink-0 mt-0.5 flex items-center justify-center">
                {n.icon || <Bell className="w-4 h-4 text-primary" />}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{n.title_kz}</p>
                <p className="text-sm text-muted">{n.title_ru}</p>
                <p className="text-xs text-muted mt-1">{new Date(n.created_at).toLocaleDateString()}</p>
              </div>
              <button onClick={() => setDeleteTarget(n)} className="text-danger flex-shrink-0 p-1 hover:bg-danger-light rounded-lg transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-surface rounded-2xl p-5 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="font-display font-semibold text-base text-gray-900 mb-1">{t('admin.notif.delete_title')}</h3>
            <p className="text-sm text-muted mb-4">{deleteTarget.title_kz}</p>
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
