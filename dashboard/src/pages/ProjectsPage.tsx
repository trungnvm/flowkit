import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Plus, X } from 'lucide-react'
import { fetchAPI, postAPI } from '../api/client'
import type { Project } from '../types'
import ProjectDetailPage from './ProjectDetailPage'
import { useI18n } from '../language-toggle-and-bilingual-ui-context'

type FilterTab = 'ACTIVE' | 'ARCHIVED' | 'ALL'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString()
}

function TierBadge({ tier }: { tier: string | null }) {
  if (!tier) return null
  const isTwo = tier.includes('TWO')
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold"
      style={{ background: isTwo ? 'rgba(245,158,11,0.2)' : 'rgba(59,130,246,0.2)', color: isTwo ? 'var(--yellow)' : 'var(--accent)' }}
    >
      {isTwo ? 'TIER 2' : 'TIER 1'}
    </span>
  )
}

function ProjectCard({ project, onClick }: { project: Project; onClick: () => void }) {
  return (
    <div
      className="rounded-lg p-4 cursor-pointer transition-opacity hover:opacity-80 flex flex-col gap-2"
      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
      onClick={onClick}
    >
      <div className="font-bold text-sm" style={{ color: 'var(--text)' }}>
        {project.name}
      </div>
      {project.description && (
        <div
          className="text-xs overflow-hidden"
          style={{
            color: 'var(--muted)',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {project.description}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 mt-auto pt-2" style={{ borderTop: '1px solid var(--border)' }}>
        {project.material && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold" style={{ background: 'rgba(100,116,139,0.2)', color: 'var(--muted)' }}>
            {project.material}
          </span>
        )}
        <TierBadge tier={project.user_paygate_tier} />
        <span className="text-xs ml-auto" style={{ color: 'var(--muted)' }}>
          {formatDate(project.created_at)}
        </span>
      </div>
    </div>
  )
}

function NewProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [story, setStory] = useState('')
  const [material, setMaterial] = useState('realistic')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError('')
    try {
      const proj = await postAPI<Project>('/api/projects', { name: name.trim(), story: story.trim(), material })
      onCreated(proj.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project')
    } finally {
      setSaving(false)
    }
  }

  const MATERIALS = ['realistic', '3d_pixar', 'anime', 'stop_motion', 'oil_painting', 'minecraft']

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="rounded-xl p-6 w-full max-w-md flex flex-col gap-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-sm" style={{ color: 'var(--text)' }}>{t('Dự án mới', 'New Project')}</h2>
          <button onClick={onClose}><X size={16} style={{ color: 'var(--muted)' }} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: 'var(--muted)' }}>{t('TÊN DỰ ÁN *', 'PROJECT NAME *')}</label>
            <input
              value={name} onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 rounded text-xs outline-none"
              style={{ background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--border)' }}
              placeholder={t('Video tuyệt vời của tôi', 'My awesome video')}
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: 'var(--muted)' }}>{t('CÂU CHUYỆN', 'STORY')}</label>
            <textarea
              value={story} onChange={e => setStory(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 rounded text-xs outline-none resize-none"
              style={{ background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--border)' }}
              placeholder={t('Mô tả câu chuyện...', 'Describe the story...')}
            />
          </div>
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: 'var(--muted)' }}>{t('PHONG CÁCH CHẤT LIỆU', 'MATERIAL STYLE')}</label>
            <select
              value={material} onChange={e => setMaterial(e.target.value)}
              className="w-full px-3 py-2 rounded text-xs outline-none"
              style={{ background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--border)' }}
            >
              {MATERIALS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          {error && <p className="text-xs" style={{ color: 'var(--red)' }}>{error}</p>}
          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} className="px-4 py-1.5 rounded text-xs" style={{ background: 'var(--card)', color: 'var(--muted)', border: '1px solid var(--border)' }}>{t('Huỷ', 'Cancel')}</button>
            <button type="submit" disabled={saving || !name.trim()} className="px-4 py-1.5 rounded text-xs font-semibold" style={{ background: 'var(--accent)', color: '#fff', opacity: saving || !name.trim() ? 0.6 : 1 }}>
              {saving ? t('Đang tạo...', 'Creating...') : t('Tạo', 'Create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function ProjectsPage() {
  const { t } = useI18n()
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const [tab, setTab] = useState<FilterTab>('ACTIVE')
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)

  function loadProjects() {
    setLoading(true)
    fetchAPI<Project[]>('/api/projects')
      .then(setProjects)
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadProjects() }, [])

  // If there's an :id param, show detail page
  if (id) {
    return <ProjectDetailPage projectId={id} onBack={() => navigate('/projects')} />
  }

  const filtered = projects.filter(p => {
    if (tab === 'ALL') return p.status !== 'DELETED'
    return p.status === tab
  })

  const tabs: FilterTab[] = ['ACTIVE', 'ARCHIVED', 'ALL']

  return (
    <div className="flex flex-col gap-4">
      {showNew && (
        <NewProjectModal
          onClose={() => setShowNew(false)}
          onCreated={(newId) => { setShowNew(false); navigate(`/projects/${newId}`) }}
        />
      )}
      {/* Filter tabs + New button */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {tabs.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-3 py-1.5 rounded text-xs font-semibold transition-colors"
              style={{
                background: tab === t ? 'var(--accent)' : 'var(--card)',
                color: tab === t ? '#fff' : 'var(--muted)',
                border: '1px solid var(--border)',
              }}
            >
              {t}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          <Plus size={13} /> {t('Dự án mới', 'New Project')}
        </button>
      </div>

      {loading ? (
        <div className="text-xs" style={{ color: 'var(--muted)' }}>{t('Đang tải dự án...', 'Loading projects...')}</div>
      ) : filtered.length === 0 ? (
        <div className="text-xs" style={{ color: 'var(--muted)' }}>{t(`Không có dự án ${tab.toLowerCase()}.`, `No ${tab.toLowerCase()} projects.`)}</div>
      ) : (
        <div className="grid grid-cols-1 gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {filtered.map(p => (
            <ProjectCard
              key={p.id}
              project={p}
              onClick={() => navigate(`/projects/${p.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
