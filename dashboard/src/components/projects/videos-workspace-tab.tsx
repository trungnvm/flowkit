import { useState, useEffect, useCallback } from 'react'
import { Film, Loader, Mic, Play, X, Plus, RefreshCw } from 'lucide-react'
import { fetchAPI, postAPI, patchAPI } from '../../api/client'
import type { Scene, Video, RequestType, WSEvent } from '../../types'
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

function VideoModal({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.85)' }} onClick={onClose}>
      <video src={url} controls autoPlay className="max-w-[90vw] max-h-[90vh] rounded-lg"
        onClick={e => e.stopPropagation()} />
      <button className="absolute top-4 right-4 p-2 rounded-full"
        style={{ background: 'rgba(255,255,255,0.15)' }} onClick={onClose}>
        <X size={16} color="white" />
      </button>
    </div>
  )
}

type GenType = 'GENERATE_VIDEO' | 'GENERATE_VIDEO_REFS'
type Orientation = 'VERTICAL' | 'HORIZONTAL'

export default function VideosWorkspaceTab({ projectId, lastEvent }: { projectId: string; lastEvent?: WSEvent | null }) {
  const { t } = useI18n()
  const [videos, setVideos] = useState<Video[]>([])
  const [selectedVideoId, setSelectedVideoId] = useState('')
  const [scenes, setScenes] = useState<Scene[]>([])
  const [loading, setLoading] = useState(true)
  const [orientation, setOrientation] = useState<Orientation>('VERTICAL')
  const [genType, setGenType] = useState<GenType>('GENERATE_VIDEO')
  const [genAll, setGenAll] = useState(false)
  const [genScene, setGenScene] = useState<string | null>(null)
  const [narrating, setNarrating] = useState(false)
  const [narrateMsg, setNarrateMsg] = useState('')
  const [videoModal, setVideoModal] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const [showAddVideo, setShowAddVideo] = useState(false)
  const [videoTitle, setVideoTitle] = useState('')
  const [savingVideo, setSavingVideo] = useState(false)

  const [showAddScene, setShowAddScene] = useState(false)
  const [sceneVideoPrompt, setSceneVideoPrompt] = useState('')
  const [savingScene, setSavingScene] = useState(false)

  const loadScenes = useCallback((vid: string) => {
    fetchAPI<Scene[]>(`/api/scenes?video_id=${vid}`).then(setScenes).catch(console.error)
  }, [])

  useEffect(() => {
    fetchAPI<Video[]>(`/api/videos?project_id=${projectId}`)
      .then(vids => { setVideos(vids); if (vids.length) setSelectedVideoId(vids[0].id); setLoading(false) })
      .catch(() => setLoading(false))
  }, [projectId])

  useEffect(() => { if (selectedVideoId) loadScenes(selectedVideoId) }, [selectedVideoId])

  // Auto-refresh khi video/ảnh hoàn thành qua WebSocket
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
      setVideos(prev => [...prev, v]); setSelectedVideoId(v.id)
      setVideoTitle(''); setShowAddVideo(false)
    } finally { setSavingVideo(false) }
  }

  async function addScene() {
    if (!selectedVideoId) return
    setSavingScene(true)
    try {
      await postAPI('/api/scenes', {
        video_id: selectedVideoId,
        prompt: sceneVideoPrompt.trim() || '(no prompt)',
        video_prompt: sceneVideoPrompt.trim(),
        display_order: scenes.length,
      })
      setSceneVideoPrompt(''); setShowAddScene(false)
      loadScenes(selectedVideoId)
    } finally { setSavingScene(false) }
  }

  async function genOne(s: Scene) {
    setGenScene(s.id)
    try {
      await postAPI('/api/requests', { type: genType as RequestType, scene_id: s.id, video_id: s.video_id, project_id: projectId, orientation })
    } finally { setGenScene(null) }
  }

  async function genAllScenes() {
    setGenAll(true)
    try {
      await postAPI('/api/requests/batch', {
        requests: scenes.map(s => ({ type: genType, scene_id: s.id, video_id: s.video_id, project_id: projectId, orientation }))
      })
    } finally { setGenAll(false) }
  }

  async function narrate() {
    setNarrating(true); setNarrateMsg('')
    try {
      await postAPI(`/api/videos/${selectedVideoId}/narrate`, {
        project_id: projectId,
        orientation,
      })
      setNarrateMsg(t('Tạo narrate thành công', 'Narration generated successfully'))
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('Lỗi', 'Failed')
      if (msg.includes('No scenes found for video')) {
        setNarrateMsg(t('Video chưa có scene', 'No scenes in this video'))
      } else if (msg.includes('No scenes in range')) {
        setNarrateMsg(t('Khoảng scene không hợp lệ', 'Invalid scene range'))
      } else {
        setNarrateMsg(msg)
      }
    } finally { setNarrating(false) }
  }

  // Lấy URL video đúng theo orientation đang chọn
  const videoUrl = (s: Scene) => orientation === 'VERTICAL' ? s.vertical_video_url : s.horizontal_video_url
  const videoStatus = (s: Scene) => orientation === 'VERTICAL' ? s.vertical_video_status : s.horizontal_video_status

  if (loading) return <div className="text-xs" style={{ color: 'var(--muted)' }}>{t('Đang tải...', 'Loading...')}</div>

  return (
    <div className="flex flex-col gap-3">
      {videoModal && <VideoModal url={videoModal} onClose={() => setVideoModal(null)} />}

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

        {/* Orientation toggle */}
        <div className="flex rounded overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {(['VERTICAL', 'HORIZONTAL'] as Orientation[]).map(o => (
            <button key={o} onClick={() => setOrientation(o)} className="px-2 py-1 text-xs font-semibold"
              style={{ background: orientation === o ? 'var(--accent)' : 'var(--card)', color: orientation === o ? '#fff' : 'var(--muted)' }}>
              {o === 'VERTICAL' ? '9:16' : '16:9'}
            </button>
          ))}
        </div>

        {/* Gen type selector */}
        <select value={genType} onChange={e => setGenType(e.target.value as GenType)}
          className="text-xs px-2 py-1.5 rounded outline-none"
          style={{ background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--border)' }}>
          <option value="GENERATE_VIDEO">Veo3 Standard</option>
          <option value="GENERATE_VIDEO_REFS">Veo3 + Refs</option>
        </select>

        {selectedVideoId && (
          <>
            <button onClick={() => { setRefreshing(true); loadScenes(selectedVideoId); setTimeout(() => setRefreshing(false), 500) }}
              className="flex items-center gap-1 px-2 py-1.5 rounded text-xs"
              style={{ background: 'var(--card)', color: 'var(--muted)', border: '1px solid var(--border)' }}
              title={t('Làm mới', 'Refresh')}>
              <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <button onClick={narrate} disabled={narrating}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-semibold"
              style={{ background: 'rgba(168,85,247,0.15)', color: '#a78bfa', border: '1px solid rgba(168,85,247,0.3)' }}>
              {narrating ? <Loader size={12} className="animate-spin" /> : <Mic size={12} />}
              {t('Kể chuyện', 'Narrate')}
            </button>
            {narrateMsg && (
              <span className="text-xs" style={{ color: narrateMsg.includes(t('thành công', 'success')) || narrateMsg.includes(t('Success', 'Success')) ? 'var(--green)' : 'var(--red)' }}>
                {narrateMsg}
              </span>
            )}
            <button onClick={genAllScenes} disabled={genAll || scenes.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold ml-auto"
              style={{ background: 'rgba(139,92,246,0.85)', color: '#fff', opacity: genAll || scenes.length === 0 ? 0.5 : 1 }}>
              {genAll ? <Loader size={12} className="animate-spin" /> : <Film size={12} />}
              {t('Tạo tất cả', 'Gen all')} ({scenes.length})
            </button>
          </>
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

      {/* Scene list — dạng grid 2 cột */}
      {selectedVideoId && (
        <>
          {scenes.length > 0 && (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
              {scenes.map(s => {
                const vUrl = videoUrl(s)
                const vStatus = videoStatus(s)
                const hasVideo = !!vUrl
                return (
                  <div key={s.id} className="flex flex-col rounded-lg overflow-hidden"
                    style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>

                    {/* Thumbnails row: ref image + video preview */}
                    <div className="flex gap-1 p-2">
                      {/* Ref image (ảnh nguồn) */}
                      <div className="flex-1 rounded overflow-hidden"
                        style={{ aspectRatio: '9/16', maxHeight: 120, background: 'var(--surface)' }}>
                        {s.vertical_image_url
                          ? <img src={s.vertical_image_url} alt="ref" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center">
                              <span style={{ color: 'var(--muted)', fontSize: 10 }}>Ref</span>
                            </div>}
                      </div>

                      {/* Video preview — click to play */}
                      <div className="flex-1 rounded overflow-hidden relative cursor-pointer"
                        style={{ aspectRatio: '9/16', maxHeight: 120, background: 'var(--surface)' }}
                        onClick={() => vUrl && setVideoModal(vUrl)}>
                        {hasVideo ? (
                          <>
                            {/* Video element as thumbnail (muted, paused) */}
                            <video src={vUrl!} muted preload="metadata"
                              className="w-full h-full object-cover" />
                            {/* Play overlay */}
                            <div className="absolute inset-0 flex items-center justify-center"
                              style={{ background: 'rgba(0,0,0,0.35)' }}>
                              <Play size={20} fill="white" color="white" />
                            </div>
                          </>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Film size={16} style={{ color: 'var(--muted)', opacity: 0.3 }} />
                          </div>
                        )}
                        {/* Status badge */}
                        <div className="absolute bottom-1 left-1 flex items-center gap-0.5">
                          <StatusDot status={vStatus} />
                        </div>
                      </div>
                    </div>

                    {/* Info + actions */}
                    <div className="flex flex-col gap-1.5 px-2 pb-2">
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-mono shrink-0" style={{ color: 'var(--muted)' }}>
                          #{s.display_order + 1}
                        </span>
                        <StatusDot status={vStatus} />
                      </div>
                      <EditableText
                        value={s.video_prompt ?? ''}
                        onSave={async v => { await patchAPI(`/api/scenes/${s.id}`, { video_prompt: v }); loadScenes(selectedVideoId) }}
                        className="text-xs leading-snug"
                      />
                      <button onClick={() => genOne(s)} disabled={genScene === s.id}
                        className="flex items-center justify-center gap-1 w-full px-2 py-1 rounded text-xs font-semibold"
                        style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.25)' }}>
                        {genScene === s.id
                          ? <><Loader size={10} className="animate-spin" /> {t('Đang tạo...', 'Generating...')}</>
                          : <><Film size={10} /> {t('Tạo video', 'Generate video')}</>}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Add scene */}
          {showAddScene ? (
            <div className="flex flex-col gap-2 rounded-lg p-3" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
              <textarea value={sceneVideoPrompt} onChange={e => setSceneVideoPrompt(e.target.value)} rows={2} autoFocus
                placeholder={t('Mô tả cảnh video...', 'Video scene prompt...')}
                className="w-full text-xs px-2 py-1.5 rounded outline-none resize-none"
                style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }} />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowAddScene(false)} className="px-3 py-1 rounded text-xs" style={{ color: 'var(--muted)' }}>
                  {t('Hủy', 'Cancel')}
                </button>
                <button onClick={addScene} disabled={savingScene}
                  className="px-3 py-1 rounded text-xs font-semibold"
                  style={{ background: 'var(--accent)', color: '#fff', opacity: savingScene ? 0.5 : 1 }}>
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
