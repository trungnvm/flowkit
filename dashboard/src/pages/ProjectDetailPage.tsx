import { useState, useEffect } from 'react'
import { Wand2, Loader, Copy, Check, Mic, Image, Film } from 'lucide-react'
import { fetchAPI, patchAPI, postAPI } from '../api/client'
import type { Project, Character, Video, Scene } from '../types'
import EditableText from '../components/projects/EditableText'
import ImagesWorkspaceTab from '../components/projects/images-workspace-tab'
import VideosWorkspaceTab from '../components/projects/videos-workspace-tab'
import CharactersWorkspaceTab from '../components/projects/characters-workspace-tab'
import ProjectScriptGenerationWorkspaceTab from '../components/projects/project-script-generation-workspace-tab'
import ProjectPromptEditorWorkspaceTab from '../components/projects/project-prompt-editor-workspace-tab'
import { useWebSocket } from '../api/useWebSocket'
import { useI18n } from '../language-toggle-and-bilingual-ui-context'

type Tab = 'Overview' | 'Characters' | 'Images' | 'Videos' | 'Script' | 'Prompt' | 'Pipeline'

interface Props { projectId: string; onBack: () => void }

function formatDate(iso: string) { return new Date(iso).toLocaleString() }

function Badge({ label, color }: { label: string; color?: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold"
      style={{ background: color ?? 'rgba(100,116,139,0.2)', color: 'var(--muted)' }}>{label}</span>
  )
}

function CopyCmd({ label, cmd, note }: { label: string; cmd: string; note?: string }) {
  const [copied, setCopied] = useState(false)
  function doCopy() { navigator.clipboard.writeText(cmd); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  return (
    <div className="rounded-lg p-3 flex flex-col gap-2" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
      <div className="text-xs font-bold" style={{ color: 'var(--muted)' }}>{label}</div>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs px-2 py-1 rounded font-mono truncate" style={{ background: 'var(--surface)', color: 'var(--text)' }}>{cmd}</code>
        <button onClick={doCopy} className="shrink-0 p-1.5 rounded" style={{ background: 'var(--surface)', color: copied ? 'var(--green)' : 'var(--muted)' }}>
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
      </div>
      {note && <div className="text-xs" style={{ color: 'var(--muted)' }}>{note}</div>}
    </div>
  )
}

// ---- Overview ----
function OverviewTab({ project, onRefresh }: { project: Project; onRefresh: () => void }) {
  const { t } = useI18n()
  async function patch(field: string, value: string) {
    await patchAPI(`/api/projects/${project.id}`, { [field]: value }); onRefresh()
  }
  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <div className="rounded-lg p-4 flex flex-col gap-3" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <div><div className="text-xs font-bold mb-1" style={{ color: 'var(--muted)' }}>{t('TÊN', 'NAME')}</div>
          <EditableText value={project.name} onSave={v => patch('name', v)} className="font-bold text-sm" /></div>
        <div><div className="text-xs font-bold mb-1" style={{ color: 'var(--muted)' }}>{t('MÔ TẢ', 'DESCRIPTION')}</div>
          <EditableText value={project.description ?? ''} onSave={v => patch('description', v)} multiline className="text-xs" /></div>
        <div><div className="text-xs font-bold mb-1" style={{ color: 'var(--muted)' }}>{t('CÂU CHUYỆN', 'STORY')}</div>
          <EditableText value={project.story ?? ''} onSave={v => patch('story', v)} multiline className="text-xs" /></div>
      </div>
      <div className="rounded-lg p-4 flex flex-col gap-2" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <div className="flex flex-wrap gap-2">
          <Badge label={project.material} />
          {project.user_paygate_tier && <Badge label={project.user_paygate_tier.includes('TWO') ? 'TIER 2' : 'TIER 1'}
            color={project.user_paygate_tier.includes('TWO') ? 'rgba(245,158,11,0.2)' : 'rgba(59,130,246,0.2)'} />}
          <Badge label={project.status} />
        </div>
        <div className="flex flex-col gap-1 mt-1 text-xs" style={{ color: 'var(--muted)' }}>
          <div>{t('Tạo lúc', 'Created')}: {formatDate(project.created_at)}</div>
          <div>{t('Cập nhật', 'Updated')}: {formatDate(project.updated_at)}</div>
        </div>
      </div>
    </div>
  )
}

// CharactersTab → replaced by CharactersWorkspaceTab component

// ---- Pipeline ----
function PipelineTab({ projectId, characters, videos }: { projectId: string; characters: Character[]; videos: Video[] }) {
  const { t } = useI18n()
  const [loading, setLoading] = useState<string | null>(null)
  const [msgs, setMsgs] = useState<Record<string, string>>({})
  const [narrateVideoId, setNarrateVideoId] = useState(videos[0]?.id ?? '')

  function setMsg(key: string, v: string) { setMsgs(p => ({ ...p, [key]: v })) }
  async function run(key: string, fn: () => Promise<void>) {
    setLoading(key); setMsg(key, '')
    try { await fn(); setMsg(key, t('✓ Đã đưa vào hàng đợi!', '✓ Queued!')) }
    catch (e) { setMsg(key, e instanceof Error ? e.message : t('Thất bại', 'Failed')) }
    finally { setLoading(null) }
  }

  const missingRefs = characters.filter(c => !c.media_id)

  const apiSteps = [
    {
      num: 1, key: 'refs', label: t('Tạo ảnh tham chiếu', 'Gen reference images'), icon: <Wand2 size={12} />, color: 'var(--accent)',
      desc: t('Tạo ảnh tham chiếu cho thực thể', 'Generate entity reference images'), disabled: missingRefs.length === 0,
      btnLabel: missingRefs.length === 0 ? t('✓ Sẵn sàng', '✓ All ready') : `${t('Tạo', 'Gen')} ${missingRefs.length} ${t('ref', 'refs')}`,
      action: () => run('refs', () => postAPI('/api/requests/batch', {
        requests: missingRefs.map(c => ({ type: 'GENERATE_CHARACTER_IMAGE', character_id: c.id, project_id: projectId }))
      })),
    },
    {
      num: 2, key: 'img', label: t('Tạo ảnh cảnh', 'Gen scene images'), icon: <Image size={12} />, color: 'rgba(59,130,246,0.85)',
      desc: t('Tạo ảnh dọc cho mọi cảnh trong mọi video', 'Generate vertical images for all scenes across all videos'), disabled: false, btnLabel: t('Tạo ảnh', 'Gen images'),
      action: () => run('img', async () => {
        const allScenes: Scene[] = []
        for (const v of videos) { const s = await fetchAPI<Scene[]>(`/api/scenes?video_id=${v.id}`); allScenes.push(...s) }
        await postAPI('/api/requests/batch', { requests: allScenes.map(s => ({ type: 'GENERATE_IMAGE', scene_id: s.id, video_id: s.video_id, project_id: projectId, orientation: 'VERTICAL' })) })
      }),
    },
    {
      num: 3, key: 'vid', label: t('Tạo video cảnh', 'Gen scene videos'), icon: <Film size={12} />, color: 'rgba(139,92,246,0.85)',
      desc: t('Tạo video dọc cho mọi cảnh', 'Generate vertical videos for all scenes'), disabled: false, btnLabel: t('Tạo video', 'Gen videos'),
      action: () => run('vid', async () => {
        const allScenes: Scene[] = []
        for (const v of videos) { const s = await fetchAPI<Scene[]>(`/api/scenes?video_id=${v.id}`); allScenes.push(...s) }
        await postAPI('/api/requests/batch', { requests: allScenes.map(s => ({ type: 'GENERATE_VIDEO', scene_id: s.id, video_id: s.video_id, project_id: projectId, orientation: 'VERTICAL' })) })
      }),
    },
    {
      num: 4, key: 'narrate', label: t('Tạo narrator (TTS)', 'Gen narrator (TTS)'), icon: <Mic size={12} />, color: 'rgba(168,85,247,0.85)',
      desc: t('Tạo văn bản narration + audio TTS', 'Generate narration text + TTS audio'), disabled: !narrateVideoId, btnLabel: t('Kể chuyện', 'Narrate'),
      action: () => run('narrate', () => postAPI(`/api/videos/${narrateVideoId}/narrate`, { project_id: projectId })),
      extra: videos.length > 0 ? (
        <select value={narrateVideoId} onChange={e => setNarrateVideoId(e.target.value)}
          className="text-xs px-2 py-1 rounded outline-none"
          style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}>
          {videos.map(v => <option key={v.id} value={v.id}>{v.title}</option>)}
        </select>
      ) : null,
    },
  ]

  const cliSteps = [
    { num: 5, label: t('Nối video', 'Concat videos'), cmd: '/fk-concat', note: t('Tải + nối toàn bộ scene video thành MP4 cuối', 'Download + concat all scene videos into final MP4') },
    { num: 6, label: t('Nối + khớp narrator', 'Concat + fit narrator'), cmd: '/fk-concat-fit-narrator', note: t('Cắt cảnh theo thời lượng TTS, burn overlay, rồi concat', 'Trim scenes to TTS duration, burn overlays, concat') },
    { num: 7, label: t('Tạo thumbnail', 'Generate thumbnail'), cmd: '/fk-thumbnail', note: t('Tạo 4 biến thể thumbnail YouTube', 'Generate 4 YouTube thumbnail variants') },
    { num: 8, label: 'YouTube SEO', cmd: '/fk-youtube-seo', note: t('Tạo title, description, tags', 'Generate title, description, tags') },
    { num: 9, label: t('Upload YouTube', 'YouTube upload'), cmd: '/fk-youtube-upload', note: t('Upload video cuối lên YouTube', 'Upload final video to YouTube') },
  ]

  return (
    <div className="flex flex-col gap-3 max-w-2xl">
      <div className="text-xs font-bold" style={{ color: 'var(--muted)' }}>{t('BƯỚC API', 'API STEPS')}</div>
      {apiSteps.map(step => (
        <div key={step.key} className="rounded-lg p-4 flex flex-col gap-2" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <div className="flex items-start gap-3">
            <span className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0 mt-0.5"
              style={{ background: 'var(--surface)', color: 'var(--accent)' }}>{step.num}</span>
            <div className="flex-1 flex flex-col gap-1.5">
              <div className="font-bold text-xs" style={{ color: 'var(--text)' }}>{step.label}</div>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>{step.desc}</div>
              <div className="flex items-center gap-2 flex-wrap">
                {'extra' in step && step.extra}
                <button onClick={step.action} disabled={loading === step.key || step.disabled}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold"
                  style={{ background: step.color, color: '#fff', opacity: loading === step.key || step.disabled ? 0.6 : 1 }}>
                  {loading === step.key ? <Loader size={12} className="animate-spin" /> : step.icon} {step.btnLabel}
                </button>
                {msgs[step.key] && <span className="text-xs" style={{ color: msgs[step.key].startsWith('✓') ? 'var(--green)' : 'var(--red)' }}>{msgs[step.key]}</span>}
              </div>
            </div>
          </div>
        </div>
      ))}
      <div className="text-xs font-bold mt-2" style={{ color: 'var(--muted)' }}>{t('BƯỚC CLI', 'CLI STEPS')}</div>
      {cliSteps.map(step => (
        <div key={step.num} className="flex gap-3 items-start">
          <span className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0 mt-0.5"
            style={{ background: 'var(--surface)', color: 'var(--muted)' }}>{step.num}</span>
          <div className="flex-1"><CopyCmd label={step.label} cmd={step.cmd} note={step.note} /></div>
        </div>
      ))}
    </div>
  )
}

// ---- Main ----
export default function ProjectDetailPage({ projectId, onBack }: Props) {
  const { t } = useI18n()
  const [project, setProject] = useState<Project | null>(null)
  const [characters, setCharacters] = useState<Character[]>([])
  const [videos, setVideos] = useState<Video[]>([])
  const [tab, setTab] = useState<Tab>('Overview')
  const [loading, setLoading] = useState(true)
  const { lastEvent } = useWebSocket()

  function fetchAll() {
    setLoading(true)
    Promise.all([
      fetchAPI<Project>(`/api/projects/${projectId}`),
      fetchAPI<Character[]>(`/api/projects/${projectId}/characters`),
      fetchAPI<Video[]>(`/api/videos?project_id=${projectId}`),
    ])
      .then(([proj, chars, vids]) => { setProject(proj); setCharacters(chars); setVideos(vids) })
      .catch(console.error).finally(() => setLoading(false))
  }

  useEffect(() => { fetchAll() }, [projectId])

  if (loading || !project) return <div className="text-xs" style={{ color: 'var(--muted)' }}>{t('Đang tải dự án...', 'Loading project...')}</div>

  const tabs: Tab[] = ['Overview', 'Characters', 'Images', 'Videos', 'Script', 'Prompt', 'Pipeline']
  const tabLabel: Record<Tab, string> = {
    Overview: t('Tổng quan', 'Overview'),
    Characters: t('Nhân vật', 'Characters'),
    Images: t('Ảnh', 'Images'),
    Videos: t('Video', 'Videos'),
    Script: t('Kịch bản', 'Script'),
    Prompt: 'Prompt',
    Pipeline: 'Pipeline',
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-xs px-3 py-1.5 rounded"
          style={{ background: 'var(--card)', color: 'var(--muted)', border: '1px solid var(--border)' }}>{t('Quay lại', 'Back')}</button>
        <h1 className="font-bold text-sm" style={{ color: 'var(--text)' }}>{project.name}</h1>
      </div>
      <div className="flex gap-1" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="px-3 py-1.5 rounded-t text-xs font-semibold transition-colors"
            style={{
              background: tab === t ? 'var(--card)' : 'transparent',
              color: tab === t ? 'var(--accent)' : 'var(--muted)',
              borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
            }}>
            {tabLabel[t]}
            {t === 'Characters' && ` (${characters.length})`}
            {t === 'Videos' && ` (${videos.length})`}
          </button>
        ))}
      </div>
      <div>
        {tab === 'Overview' && <OverviewTab project={project} onRefresh={fetchAll} />}
        {tab === 'Characters' && <CharactersWorkspaceTab projectId={projectId} lastEvent={lastEvent} />}
        {tab === 'Images' && <ImagesWorkspaceTab projectId={projectId} lastEvent={lastEvent} />}
        {tab === 'Videos' && <VideosWorkspaceTab projectId={projectId} lastEvent={lastEvent} />}
        {tab === 'Script' && <ProjectScriptGenerationWorkspaceTab projectId={projectId} />}
        {tab === 'Prompt' && <ProjectPromptEditorWorkspaceTab projectId={projectId} />}
        {tab === 'Pipeline' && <PipelineTab projectId={projectId} characters={characters} videos={videos} />}
      </div>
    </div>
  )
}
