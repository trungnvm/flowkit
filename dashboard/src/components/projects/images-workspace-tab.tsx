import { useState, useEffect, useCallback } from 'react'
import { Image, Loader, ZoomIn, X, Plus, RefreshCw } from 'lucide-react'
import { fetchAPI, postAPI, patchAPI } from '../../api/client'
import type { Scene, Video, WSEvent } from '../../types'
import EditableText from './EditableText'
import { useI18n } from '../../language-toggle-and-bilingual-ui-context'

const STATUS_COLOR: Record<string, string> = {
  COMPLETED: 'var(--green)', PROCESSING: 'var(--yellow)',
  PENDING: 'var(--muted)', FAILED: 'var(--red)',
}

function StatusDot({ status }: { status: string }) {
  return (
    <span className="w-2 h-2 rounded-full inline-block shrink-0"
      style={{ background: STATUS_COLOR[status] ?? 'var(--muted)' }} title={status} />
  )
}

function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.85)' }} onClick={onClose}>
      <img src={url} alt="preview" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" />
      <button className="absolute top-4 right-4 p-2 rounded-full"
        style={{ background: 'rgba(255,255,255,0.15)' }} onClick={onClose}>
        <X size={16} color="white" />
      </button>
    </div>
  )
}

export default function ImagesWorkspaceTab({ projectId, lastEvent }: { projectId: string; lastEvent?: WSEvent | null }) {
  const { t } = useI18n()
  const [videos, setVideos] = useState<Video[]>([])
  const [selectedVideoId, setSelectedVideoId] = useState('')
  const [scenes, setScenes] = useState<Scene[]>([])
  const [loading, setLoading] = useState(true)
  const [genAll, setGenAll] = useState(false)
  const [genScene, setGenScene] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [modelLabel, setModelLabel] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const [showAddVideo, setShowAddVideo] = useState(false)
  const [videoTitle, setVideoTitle] = useState('')
  const [savingVideo, setSavingVideo] = useState(false)

  const [showAddScene, setShowAddScene] = useState(false)
  const [scenePrompt, setScenePrompt] = useState('')
  const [savingScene, setSavingScene] = useState(false)

  const loadVideos = useCallback(async () => {
    const vids = await fetchAPI<Video[]>(`/api/videos?project_id=${projectId}`)
    setVideos(vids)
    if (vids.length && !selectedVideoId) setSelectedVideoId(vids[0].id)
    setLoading(false)
  }, [projectId, selectedVideoId])

  const loadScenes = useCallback((vid: string) => {
    fetchAPI<Scene[]>(`/api/scenes?video_id=${vid}`).then(setScenes).catch(console.error)
  }, [])

  useEffect(() => {
    loadVideos()
    fetchAPI<{ image_models: Record<string, string> }>('/api/models')
      .then(d => setModelLabel(Object.values(d.image_models).join(' / ')))
      .catch(() => {})
  }, [projectId])

  useEffect(() => { if (selectedVideoId) loadScenes(selectedVideoId) }, [selectedVideoId])

  // Auto-refresh khi ảnh hoàn thành qua WebSocket
  useEffect(() => {
    if (!lastEvent || !selectedVideoId) return
    if (lastEvent.type !== 'request_update') return
    const { status, scene_id } = lastEvent.data as { status?: string; scene_id?: string }
    if (status !== 'COMPLETED' && status !== 'FAILED') return
    if (scene_id && scenes.some(s => s.id === scene_id)) loadScenes(selectedVideoId)
  }, [lastEvent, selectedVideoId, scenes, loadScenes])

  async function createVideo() {
    if (!videoTitle.trim()) return
    setSavingVideo(true)
    try {
      const v = await postAPI<Video>('/api/videos', { project_id: projectId, title: videoTitle.trim(), display_order: videos.length })
      setVideos(prev => [...prev, v])
      setSelectedVideoId(v.id)
      setVideoTitle(''); setShowAddVideo(false)
    } finally { setSavingVideo(false) }
  }

  async function addScene() {
    if (!scenePrompt.trim() || !selectedVideoId) return
    setSavingScene(true)
    try {
      await postAPI('/api/scenes', { video_id: selectedVideoId, prompt: scenePrompt.trim(), display_order: scenes.length })
      setScenePrompt(''); setShowAddScene(false)
      loadScenes(selectedVideoId)
    } finally { setSavingScene(false) }
  }

  async function genOne(s: Scene) {
    setGenScene(s.id)
    try {
      await postAPI('/api/requests', { type: 'GENERATE_IMAGE', scene_id: s.id, video_id: s.video_id, project_id: projectId, orientation: 'VERTICAL' })
    } finally { setGenScene(null) }
  }

  async function genAllScenes() {
    setGenAll(true)
    try {
      await postAPI('/api/requests/batch', { requests: scenes.map(s => ({ type: 'GENERATE_IMAGE', scene_id: s.id, video_id: s.video_id, project_id: projectId, orientation: 'VERTICAL' })) })
    } finally { setGenAll(false) }
  }

  async function refreshScenes() {
    if (!selectedVideoId) return
    setRefreshing(true)
    try { loadScenes(selectedVideoId) } finally { setRefreshing(false) }
  }

  if (loading) return <div className="text-xs" style={{ color: 'var(--muted)' }}>{t('Đang tải...', 'Loading...')}</div>

  return (
    <div className="flex flex-col gap-3">
      {lightbox && <Lightbox url={lightbox} onClose={() => setLightbox(null)} />}

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {videos.length > 0 && (
          <select value={selectedVideoId} onChange={e => setSelectedVideoId(e.target.value)}
            className="text-xs px-2 py-1.5 rounded outline-none"
            style={{ background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--border)' }}>
            {videos.map(v => <option key={v.id} value={v.id}>{v.title}</option>)}
          </select>
        )}
        <button onClick={() => setShowAddVideo(v => !v)}
          className="flex items-center gap-1 px-2 py-1.5 rounded text-xs font-semibold"
          style={{ background: 'var(--card)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
          <Plus size={11} /> {t('Video', 'Video')}
        </button>
        {modelLabel && (
          <span className="text-xs px-2 py-1 rounded" style={{ background: 'var(--surface)', color: 'var(--muted)' }}>
            {modelLabel}
          </span>
        )}
        {selectedVideoId && (
          <button onClick={refreshScenes} disabled={refreshing}
            className="flex items-center gap-1 px-2 py-1.5 rounded text-xs"
            style={{ background: 'var(--card)', color: 'var(--muted)', border: '1px solid var(--border)' }}
            title={t('Làm mới', 'Refresh')}>
            <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
          </button>
        )}
        {videos.length > 0 && (
          <button onClick={genAllScenes} disabled={genAll || scenes.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold ml-auto"
            style={{ background: 'rgba(59,130,246,0.85)', color: '#fff', opacity: genAll || scenes.length === 0 ? 0.5 : 1 }}>
            {genAll ? <Loader size={12} className="animate-spin" /> : <Image size={12} />}
            {t('Tạo tất cả', 'Gen all')} ({scenes.length})
          </button>
        )}
      </div>

      {/* Add video form */}
      {showAddVideo && (
        <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <input value={videoTitle} onChange={e => setVideoTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createVideo()}
            placeholder={t('Tên video...', 'Video title...')} autoFocus
            className="flex-1 text-xs px-2 py-1 rounded outline-none"
            style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }} />
          <button onClick={createVideo} disabled={savingVideo || !videoTitle.trim()}
            className="px-3 py-1 rounded text-xs font-semibold"
            style={{ background: 'var(--accent)', color: '#fff', opacity: savingVideo || !videoTitle.trim() ? 0.5 : 1 }}>
            {savingVideo ? '...' : t('Tạo', 'Create')}
          </button>
          <button onClick={() => setShowAddVideo(false)} className="text-xs" style={{ color: 'var(--muted)' }}>✕</button>
        </div>
      )}

      {videos.length === 0 && !showAddVideo && (
        <div className="text-xs text-center py-8" style={{ color: 'var(--muted)' }}>
          {t('Chưa có video. Bấm + Video để tạo.', 'No videos yet. Click + Video to create.')}
        </div>
      )}

      {/* Scene grid */}
      {selectedVideoId && (
        <>
          {scenes.length > 0 && (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
              {scenes.map(s => (
                <div key={s.id} className="flex flex-col rounded-lg overflow-hidden"
                  style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                  {/* Image preview */}
                  <div className="relative w-full cursor-pointer"
                    style={{ aspectRatio: '9/16', maxHeight: 160, background: 'var(--surface)' }}
                    onClick={() => s.vertical_image_url && setLightbox(s.vertical_image_url)}>
                    {s.vertical_image_url
                      ? <img src={s.vertical_image_url} alt="" className="w-full h-full object-cover" />
                      : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ZoomIn size={20} style={{ color: 'var(--muted)', opacity: 0.3 }} />
                        </div>
                      )}
                    {/* Status badge */}
                    <div className="absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(0,0,0,0.6)' }}>
                      <StatusDot status={s.vertical_image_status} />
                      <span className="text-xs font-mono" style={{ color: 'rgba(255,255,255,0.7)' }}>
                        #{s.display_order + 1}
                      </span>
                    </div>
                  </div>

                  {/* Prompt + actions */}
                  <div className="flex flex-col gap-1.5 p-2">
                    <EditableText
                      value={s.prompt ?? ''}
                      onSave={async v => { await patchAPI(`/api/scenes/${s.id}`, { prompt: v }); loadScenes(selectedVideoId) }}
                      className="text-xs leading-snug"
                    />
                    <button onClick={() => genOne(s)} disabled={genScene === s.id}
                      className="flex items-center justify-center gap-1 w-full px-2 py-1 rounded text-xs font-semibold"
                      style={{ background: 'rgba(59,130,246,0.15)', color: 'var(--accent)', border: '1px solid rgba(59,130,246,0.25)' }}>
                      {genScene === s.id
                        ? <><Loader size={10} className="animate-spin" /> {t('Đang tạo...', 'Generating...')}</>
                        : <><Image size={10} /> {t('Tạo ảnh', 'Generate image')}</>}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add scene */}
          {showAddScene ? (
            <div className="flex flex-col gap-2 rounded-lg p-3" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
              <textarea value={scenePrompt} onChange={e => setScenePrompt(e.target.value)} rows={2} autoFocus
                placeholder={t('Mô tả cảnh cần tạo ảnh...', 'Scene image prompt...')}
                className="w-full text-xs px-2 py-1.5 rounded outline-none resize-none"
                style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }} />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowAddScene(false)} className="px-3 py-1 rounded text-xs" style={{ color: 'var(--muted)' }}>
                  {t('Hủy', 'Cancel')}
                </button>
                <button onClick={addScene} disabled={savingScene || !scenePrompt.trim()}
                  className="px-3 py-1 rounded text-xs font-semibold"
                  style={{ background: 'var(--accent)', color: '#fff', opacity: savingScene || !scenePrompt.trim() ? 0.5 : 1 }}>
                  {savingScene ? '...' : t('Thêm', 'Add')}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowAddScene(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded text-xs font-semibold"
              style={{ background: 'var(--card)', color: 'var(--muted)', border: '1px dashed var(--border)' }}>
              <Plus size={12} /> {t('Thêm cảnh', 'Add scene')}
            </button>
          )}
        </>
      )}
    </div>
  )
}
