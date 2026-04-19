/**
 * Characters workspace tab — manage entity reference images for visual consistency.
 * Characters (nhân vật, địa điểm, sinh vật...) dùng ảnh reference để AI giữ nguyên
 * diện mạo xuyên suốt toàn bộ các cảnh trong video.
 */
import { useState, useEffect, useCallback } from 'react'
import { Users, Loader, X, RefreshCw, ZoomIn, Wand2, RotateCcw, Upload, Plus } from 'lucide-react'
import { fetchAPI, patchAPI, postAPI, postFormAPI } from '../../api/client'
import type { Character, WSEvent } from '../../types'
import { useI18n } from '../../language-toggle-and-bilingual-ui-context'

const ENTITY_LABEL: Record<string, string> = {
  character: 'Nhân vật',
  location: 'Địa điểm',
  creature: 'Sinh vật',
  visual_asset: 'Tài sản',
  generic_troop: 'Đội quân',
  faction: 'Phe phái',
}

const STATUS_COLOR = {
  done: 'var(--green)',
  pending: 'var(--muted)',
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

export default function CharactersWorkspaceTab({
  projectId,
  lastEvent,
}: {
  projectId: string
  lastEvent?: WSEvent | null
}) {
  const { t } = useI18n()
  const [characters, setCharacters] = useState<Character[]>([])
  const [loading, setLoading] = useState(true)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [genChar, setGenChar] = useState<string | null>(null)   // character id đang gen
  const [uploadingChar, setUploadingChar] = useState<string | null>(null)
  const [uploadErr, setUploadErr] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [imagePrompts, setImagePrompts] = useState<Record<string, string>>({})

  const loadCharacters = useCallback(async () => {
    try {
      const chars = await fetchAPI<Character[]>(`/api/projects/${projectId}/characters`)
      setCharacters(chars)
      setImagePrompts(Object.fromEntries(chars.map(c => [c.id, c.image_prompt ?? ''])))
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { void loadCharacters() }, [loadCharacters])

  // Auto-refresh khi gen ref image hoàn thành qua WebSocket
  useEffect(() => {
    if (!lastEvent) return
    if (lastEvent.type !== 'request_update') return
    const { status, character_id } = lastEvent.data as { status?: string; character_id?: string }
    if (status !== 'COMPLETED' && status !== 'FAILED') return
    if (character_id && characters.some(c => c.id === character_id)) loadCharacters()
  }, [lastEvent, characters, loadCharacters])

  async function genRef(char: Character, regen = false) {
    setGenChar(char.id)
    try {
      const prompt = imagePrompts[char.id]?.trim() ?? ''
      if (prompt) {
        await patchAPI(`/api/characters/${char.id}`, { image_prompt: prompt })
      }
      await postAPI('/api/requests', {
        type: regen ? 'REGENERATE_CHARACTER_IMAGE' : 'GENERATE_CHARACTER_IMAGE',
        character_id: char.id,
        project_id: projectId,
      })
      await loadCharacters()
    } finally {
      setGenChar(null)
    }
  }

  async function uploadRefImage(char: Character, file: File | null) {
    if (!file) return
    setUploadingChar(char.id)
    setUploadErr('')
    try {
      const form = new FormData()
      form.append('project_id', projectId)
      form.append('file', file)
      await postFormAPI(`/api/characters/${char.id}/upload-reference-image`, form)
      await loadCharacters()
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'Upload failed'
      if (raw.includes('Character is not linked to this project')) {
        await postAPI(`/api/projects/${projectId}/characters/${char.id}`)
        const retry = new FormData()
        retry.append('project_id', projectId)
        retry.append('file', file)
        await postFormAPI(`/api/characters/${char.id}/upload-reference-image`, retry)
        await loadCharacters()
        return
      }
      setUploadErr(raw)
    } finally {
      setUploadingChar(null)
    }
  }

  async function createAndLinkCharacter() {
    if (!newName.trim()) return
    setCreating(true)
    setUploadErr('')
    try {
      const created = await postAPI<Character>('/api/characters', { name: newName.trim(), entity_type: 'character' })
      await postAPI(`/api/projects/${projectId}/characters/${created.id}`)
      setNewName('')
      await loadCharacters()
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : 'Create character failed')
    } finally {
      setCreating(false)
    }
  }

  async function refresh() {
    setRefreshing(true)
    loadCharacters()
    setTimeout(() => setRefreshing(false), 600)
  }

  if (loading) {
    return <div className="text-xs" style={{ color: 'var(--muted)' }}>{t('Đang tải...', 'Loading...')}</div>
  }

  return (
    <div className="flex flex-col gap-3">
      {lightbox && <Lightbox url={lightbox} onClose={() => setLightbox(null)} />}

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <Users size={14} style={{ color: 'var(--muted)' }} />
        <span className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
          {t('Nhân vật', 'Characters')} ({characters.length})
        </span>
        <button onClick={refresh}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs ml-auto"
          style={{ background: 'var(--card)', color: 'var(--muted)', border: '1px solid var(--border)' }}
          title={t('Làm mới', 'Refresh')}>
          <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex items-center gap-2 rounded-lg p-2" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && void createAndLinkCharacter()}
          placeholder={t('Tên character mới...', 'New character name...')}
          className="flex-1 text-xs px-2 py-1.5 rounded outline-none"
          style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
        />
        <button
          onClick={() => void createAndLinkCharacter()}
          disabled={creating || !newName.trim()}
          className="flex items-center gap-1 px-2 py-1.5 rounded text-xs font-semibold"
          style={{ background: 'var(--accent)', color: '#fff', opacity: creating || !newName.trim() ? 0.5 : 1 }}
        >
          {creating ? <Loader size={10} className="animate-spin" /> : <Plus size={10} />} {t('Thêm', 'Add')}
        </button>
      </div>

      {characters.length === 0 && (
        <div className="text-xs text-center py-10" style={{ color: 'var(--muted)' }}>
          <Users size={32} className="mx-auto mb-2 opacity-20" />
          <p>{t('Chưa có nhân vật nào.', 'No characters yet.')}</p>
          <p className="mt-1 opacity-60">{t('Dùng /fk-create-project để tạo project với characters.', 'Use /fk-create-project to create a project with characters.')}</p>
        </div>
      )}

      {/* Character grid */}
      {characters.length > 0 && (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
          {characters.map(char => {
            const hasImage = !!char.reference_image_url
            const hasMediaId = !!char.media_id
            const isGenerating = genChar === char.id

            return (
              <div key={char.id} className="flex flex-col rounded-lg overflow-hidden"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>

                {/* Reference image */}
                <div className="relative w-full cursor-pointer"
                  style={{ aspectRatio: '3/4', background: 'var(--surface)' }}
                  onClick={() => hasImage && setLightbox(char.reference_image_url!)}>
                  {hasImage ? (
                    <img src={char.reference_image_url!} alt={char.name}
                      className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                      <ZoomIn size={20} style={{ color: 'var(--muted)', opacity: 0.2 }} />
                      <span className="text-xs" style={{ color: 'var(--muted)', opacity: 0.4 }}>{t('Chưa có ảnh', 'No image')}</span>
                    </div>
                  )}

                  {/* Status dot + entity badge */}
                  <div className="absolute top-1.5 left-1.5 right-1.5 flex items-center justify-between">
                    <span className="text-xs px-1.5 py-0.5 rounded font-semibold"
                      style={{ background: 'rgba(0,0,0,0.6)', color: 'rgba(255,255,255,0.8)' }}>
                      {ENTITY_LABEL[char.entity_type] ?? char.entity_type}
                    </span>
                    <span className="w-2 h-2 rounded-full"
                      style={{ background: hasMediaId ? STATUS_COLOR.done : STATUS_COLOR.pending }}
                      title={hasMediaId ? t('Media ID sẵn sàng', 'Media ID ready') : t('Chưa có media ID', 'No media ID')} />
                  </div>
                </div>

                {/* Info + actions */}
                <div className="flex flex-col gap-1.5 p-2">
                  <span className="text-xs font-semibold truncate" title={char.name}>
                    {char.name}
                  </span>
                  {char.description && (
                    <span className="text-xs line-clamp-2" style={{ color: 'var(--muted)' }}>
                      {char.description}
                    </span>
                  )}

                  {/* Upload + Gen / Regen buttons */}
                  <textarea
                    value={imagePrompts[char.id] ?? ''}
                    onChange={e => setImagePrompts(prev => ({ ...prev, [char.id]: e.target.value }))}
                    rows={2}
                    placeholder={t('Prompt ảnh character...', 'Character image prompt...')}
                    className="w-full text-xs px-2 py-1 rounded outline-none resize-none"
                    style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
                  />
                  <label
                    className="flex items-center justify-center gap-1 w-full px-2 py-1 rounded text-xs font-semibold cursor-pointer"
                    style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.25)' }}>
                    {uploadingChar === char.id
                      ? <><Loader size={10} className="animate-spin" /> {t('Đang tải...', 'Uploading...')}</>
                      : <><Upload size={10} /> {t('Upload ảnh', 'Upload image')}</>}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingChar === char.id}
                      onChange={e => {
                        const file = e.target.files?.[0] ?? null
                        void uploadRefImage(char, file)
                        e.currentTarget.value = ''
                      }}
                    />
                  </label>

                  {!hasImage ? (
                    <button onClick={() => genRef(char, false)} disabled={isGenerating || uploadingChar === char.id}
                      className="flex items-center justify-center gap-1 w-full px-2 py-1 rounded text-xs font-semibold"
                      style={{ background: 'rgba(59,130,246,0.15)', color: 'var(--accent)', border: '1px solid rgba(59,130,246,0.25)' }}>
                      {isGenerating
                        ? <><Loader size={10} className="animate-spin" /> {t('Đang tạo...', 'Generating...')}</>
                        : <><Wand2 size={10} /> {t('Tạo ảnh ref', 'Gen ref image')}</>}
                    </button>
                  ) : (
                    <button onClick={() => genRef(char, true)} disabled={isGenerating || uploadingChar === char.id}
                      className="flex items-center justify-center gap-1 w-full px-2 py-1 rounded text-xs font-semibold"
                      style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)' }}>
                      {isGenerating
                        ? <><Loader size={10} className="animate-spin" /> {t('Đang tạo...', 'Generating...')}</>
                        : <><RotateCcw size={10} /> {t('Tạo lại', 'Regenerate')}</>}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {uploadErr && (
        <p className="text-xs" style={{ color: 'var(--red)' }}>{uploadErr}</p>
      )}

      {/* Hint */}
      <p className="text-xs" style={{ color: 'var(--muted)', opacity: 0.5 }}>
        {t(
          'Ảnh ref được dùng để giữ nhất quán diện mạo nhân vật trong tất cả các cảnh.',
          'Reference images are used to keep character appearance consistent across all scenes.'
        )}
      </p>
    </div>
  )
}
