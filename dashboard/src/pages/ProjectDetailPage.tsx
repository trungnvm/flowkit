import { useState, useEffect } from 'react'
import { Wand2, Loader, Copy, Check, Mic, Image, Film } from 'lucide-react'
import { fetchAPI, patchAPI, postAPI } from '../api/client'
import type { Project, Character, Video, Scene } from '../types'
import EditableText from '../components/projects/EditableText'
import ImagesWorkspaceTab from '../components/projects/images-workspace-tab'
import VideosWorkspaceTab from '../components/projects/videos-workspace-tab'
import CharactersWorkspaceTab from '../components/projects/characters-workspace-tab'
import { useWebSocket } from '../api/useWebSocket'

type Tab = 'Overview' | 'Characters' | 'Images' | 'Videos' | 'Pipeline'

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
  async function patch(field: string, value: string) {
    await patchAPI(`/api/projects/${project.id}`, { [field]: value }); onRefresh()
  }
  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <div className="rounded-lg p-4 flex flex-col gap-3" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <div><div className="text-xs font-bold mb-1" style={{ color: 'var(--muted)' }}>NAME</div>
          <EditableText value={project.name} onSave={v => patch('name', v)} className="font-bold text-sm" /></div>
        <div><div className="text-xs font-bold mb-1" style={{ color: 'var(--muted)' }}>DESCRIPTION</div>
          <EditableText value={project.description ?? ''} onSave={v => patch('description', v)} multiline className="text-xs" /></div>
        <div><div className="text-xs font-bold mb-1" style={{ color: 'var(--muted)' }}>STORY</div>
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
          <div>Created: {formatDate(project.created_at)}</div>
          <div>Updated: {formatDate(project.updated_at)}</div>
        </div>
      </div>
    </div>
  )
}

// CharactersTab → replaced by CharactersWorkspaceTab component

// ---- Pipeline ----
function PipelineTab({ projectId, characters, videos }: { projectId: string; characters: Character[]; videos: Video[] }) {
  const [loading, setLoading] = useState<string | null>(null)
  const [msgs, setMsgs] = useState<Record<string, string>>({})
  const [narrateVideoId, setNarrateVideoId] = useState(videos[0]?.id ?? '')

  function setMsg(key: string, v: string) { setMsgs(p => ({ ...p, [key]: v })) }
  async function run(key: string, fn: () => Promise<void>) {
    setLoading(key); setMsg(key, '')
    try { await fn(); setMsg(key, '✓ Queued!') }
    catch (e) { setMsg(key, e instanceof Error ? e.message : 'Failed') }
    finally { setLoading(null) }
  }

  const missingRefs = characters.filter(c => !c.media_id)

  const apiSteps = [
    {
      num: 1, key: 'refs', label: 'Gen Reference Images', icon: <Wand2 size={12} />, color: 'var(--accent)',
      desc: 'Generate entity reference images', disabled: missingRefs.length === 0,
      btnLabel: missingRefs.length === 0 ? '✓ All ready' : `Gen ${missingRefs.length} Refs`,
      action: () => run('refs', () => postAPI('/api/requests/batch', {
        requests: missingRefs.map(c => ({ type: 'GENERATE_CHARACTER_IMAGE', character_id: c.id, project_id: projectId }))
      })),
    },
    {
      num: 2, key: 'img', label: 'Gen Scene Images', icon: <Image size={12} />, color: 'rgba(59,130,246,0.85)',
      desc: 'Generate vertical images for all scenes across all videos', disabled: false, btnLabel: 'Gen Images',
      action: () => run('img', async () => {
        const allScenes: Scene[] = []
        for (const v of videos) { const s = await fetchAPI<Scene[]>(`/api/scenes?video_id=${v.id}`); allScenes.push(...s) }
        await postAPI('/api/requests/batch', { requests: allScenes.map(s => ({ type: 'GENERATE_IMAGE', scene_id: s.id, video_id: s.video_id, project_id: projectId, orientation: 'VERTICAL' })) })
      }),
    },
    {
      num: 3, key: 'vid', label: 'Gen Scene Videos', icon: <Film size={12} />, color: 'rgba(139,92,246,0.85)',
      desc: 'Generate vertical videos for all scenes', disabled: false, btnLabel: 'Gen Videos',
      action: () => run('vid', async () => {
        const allScenes: Scene[] = []
        for (const v of videos) { const s = await fetchAPI<Scene[]>(`/api/scenes?video_id=${v.id}`); allScenes.push(...s) }
        await postAPI('/api/requests/batch', { requests: allScenes.map(s => ({ type: 'GENERATE_VIDEO', scene_id: s.id, video_id: s.video_id, project_id: projectId, orientation: 'VERTICAL' })) })
      }),
    },
    {
      num: 4, key: 'narrate', label: 'Gen Narrator (TTS)', icon: <Mic size={12} />, color: 'rgba(168,85,247,0.85)',
      desc: 'Generate narration text + TTS audio', disabled: !narrateVideoId, btnLabel: 'Narrate',
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
    { num: 5, label: 'Concat Videos', cmd: '/fk-concat', note: 'Download + concat all scene videos into final MP4' },
    { num: 6, label: 'Concat + Fit Narrator', cmd: '/fk-concat-fit-narrator', note: 'Trim scenes to TTS duration, burn overlays, concat' },
    { num: 7, label: 'Generate Thumbnail', cmd: '/fk-thumbnail', note: 'Generate 4 YouTube thumbnail variants' },
    { num: 8, label: 'YouTube SEO', cmd: '/fk-youtube-seo', note: 'Generate title, description, tags' },
    { num: 9, label: 'YouTube Upload', cmd: '/fk-youtube-upload', note: 'Upload final video to YouTube' },
  ]

  return (
    <div className="flex flex-col gap-3 max-w-2xl">
      <div className="text-xs font-bold" style={{ color: 'var(--muted)' }}>API STEPS</div>
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
      <div className="text-xs font-bold mt-2" style={{ color: 'var(--muted)' }}>CLI STEPS</div>
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

  if (loading || !project) return <div className="text-xs" style={{ color: 'var(--muted)' }}>Loading project...</div>

  const tabs: Tab[] = ['Overview', 'Characters', 'Images', 'Videos', 'Pipeline']

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-xs px-3 py-1.5 rounded"
          style={{ background: 'var(--card)', color: 'var(--muted)', border: '1px solid var(--border)' }}>Back</button>
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
            {t}
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
        {tab === 'Pipeline' && <PipelineTab projectId={projectId} characters={characters} videos={videos} />}
      </div>
    </div>
  )
}
