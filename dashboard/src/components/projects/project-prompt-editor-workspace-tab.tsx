import { useEffect, useState } from 'react'
import { Loader, Save, Upload } from 'lucide-react'
import { fetchAPI, postFormAPI, putAPI } from '../../api/client'

interface PromptResponse {
  project_id: string
  prompt: string
}

export default function ProjectPromptEditorWorkspaceTab({ projectId }: { projectId: string }) {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState('')

  async function loadPrompt() {
    setLoading(true)
    try {
      const res = await fetchAPI<PromptResponse>(`/api/projects/${projectId}/prompt`)
      setPrompt(res.prompt ?? '')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadPrompt() }, [projectId])

  async function savePrompt() {
    setSaving(true)
    setMsg('')
    try {
      await putAPI<PromptResponse>(`/api/projects/${projectId}/prompt`, { prompt })
      setMsg('Đã lưu prompt')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Lỗi lưu prompt')
    } finally {
      setSaving(false)
    }
  }

  async function uploadPromptFile(file: File | null) {
    if (!file) return
    setUploading(true)
    setMsg('')
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await postFormAPI<PromptResponse>(`/api/projects/${projectId}/prompt/upload`, form)
      setPrompt(res.prompt ?? '')
      setMsg('Đã tải prompt từ file')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Lỗi upload file prompt')
    } finally {
      setUploading(false)
    }
  }

  if (loading) return <div className="text-xs" style={{ color: 'var(--muted)' }}>Đang tải... / Loading...</div>

  return (
    <div className="flex flex-col gap-3 max-w-4xl">
      <div className="rounded-lg p-3 flex flex-wrap gap-2" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <label
          className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-semibold cursor-pointer"
          style={{ background: 'rgba(59,130,246,0.85)', color: '#fff', opacity: uploading ? 0.6 : 1 }}
        >
          {uploading ? <Loader size={12} className="animate-spin" /> : <Upload size={12} />} Upload .md/.txt
          <input
            type="file"
            accept=".md,.txt,text/markdown,text/plain"
            className="hidden"
            disabled={uploading}
            onChange={e => {
              const file = e.target.files?.[0] ?? null
              void uploadPromptFile(file)
              e.currentTarget.value = ''
            }}
          />
        </label>

        <button
          onClick={savePrompt}
          disabled={saving}
          className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-semibold"
          style={{ background: 'rgba(16,185,129,0.85)', color: '#fff', opacity: saving ? 0.6 : 1 }}
        >
          {saving ? <Loader size={12} className="animate-spin" /> : <Save size={12} />} Lưu Prompt
        </button>
      </div>

      <textarea
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        rows={20}
        placeholder="Nhập instruction/prompt dùng cho sinh nội dung..."
        className="w-full text-xs px-3 py-2 rounded-lg outline-none resize-y"
        style={{ background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--border)' }}
      />

      {msg && <div className="text-xs" style={{ color: msg.includes('Lỗi') || msg.includes('API ') ? 'var(--red)' : 'var(--green)' }}>{msg}</div>}
    </div>
  )
}
