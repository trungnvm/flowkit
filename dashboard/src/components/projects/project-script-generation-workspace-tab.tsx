import { useEffect, useState } from 'react'
import { Loader, Sparkles, Save } from 'lucide-react'
import { fetchAPI, postAPI, putAPI } from '../../api/client'

interface ScriptResponse {
  project_id: string
  provider?: string | null
  model?: string | null
  script: string
}

type Provider = 'anthropic' | 'openai' | 'gemini' | 'dashscope'

export default function ScriptWorkspaceTab({ projectId }: { projectId: string }) {
  const [provider, setProvider] = useState<Provider>('anthropic')
  const [topic, setTopic] = useState('')
  const [language, setLanguage] = useState('vi')
  const [maxWords, setMaxWords] = useState(450)
  const [script, setScript] = useState('')
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  async function load() {
    setLoading(true)
    try {
      const res = await fetchAPI<ScriptResponse>(`/api/projects/${projectId}/script`)
      setScript(res.script ?? '')
      if (res.provider && ['anthropic', 'openai', 'gemini', 'dashscope'].includes(res.provider)) {
        setProvider(res.provider as Provider)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [projectId])

  async function generateScript() {
    if (!topic.trim()) return
    setGenerating(true)
    setMsg('')
    try {
      const res = await postAPI<ScriptResponse>(`/api/projects/${projectId}/script/generate`, {
        provider,
        topic: topic.trim(),
        language,
        max_words: maxWords,
      })
      setScript(res.script ?? '')
      setMsg(`Đã sinh script bằng ${res.provider}/${res.model}`)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Lỗi sinh script')
    } finally {
      setGenerating(false)
    }
  }

  async function saveScript() {
    setSaving(true)
    setMsg('')
    try {
      await putAPI<ScriptResponse>(`/api/projects/${projectId}/script`, { script })
      setMsg('Đã lưu script')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Lỗi lưu script')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="text-xs" style={{ color: 'var(--muted)' }}>Đang tải... / Loading...</div>

  return (
    <div className="flex flex-col gap-3 max-w-4xl">
      <div className="rounded-lg p-3 flex flex-wrap gap-2" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <select
          value={provider}
          onChange={e => setProvider(e.target.value as Provider)}
          className="text-xs px-2 py-1.5 rounded outline-none"
          style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
        >
          <option value="anthropic">Anthropic</option>
          <option value="openai">OpenAI</option>
          <option value="gemini">Gemini</option>
          <option value="dashscope">DashScope</option>
        </select>

        <input
          value={topic}
          onChange={e => setTopic(e.target.value)}
          placeholder="Chủ đề kịch bản / Script topic"
          className="flex-1 min-w-[220px] text-xs px-2 py-1.5 rounded outline-none"
          style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
        />

        <select
          value={language}
          onChange={e => setLanguage(e.target.value)}
          className="text-xs px-2 py-1.5 rounded outline-none"
          style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
        >
          <option value="vi">Tiếng Việt</option>
          <option value="en">English</option>
        </select>

        <input
          type="number"
          min={120}
          max={2000}
          value={maxWords}
          onChange={e => setMaxWords(Math.max(120, Math.min(2000, Number(e.target.value) || 450)))}
          className="w-24 text-xs px-2 py-1.5 rounded outline-none"
          style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
        />

        <button
          onClick={generateScript}
          disabled={generating || !topic.trim()}
          className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-semibold"
          style={{ background: 'rgba(99,102,241,0.85)', color: '#fff', opacity: generating || !topic.trim() ? 0.6 : 1 }}
        >
          {generating ? <Loader size={12} className="animate-spin" /> : <Sparkles size={12} />} Sinh Script
        </button>

        <button
          onClick={saveScript}
          disabled={saving}
          className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-semibold"
          style={{ background: 'rgba(16,185,129,0.85)', color: '#fff', opacity: saving ? 0.6 : 1 }}
        >
          {saving ? <Loader size={12} className="animate-spin" /> : <Save size={12} />} Lưu
        </button>
      </div>

      <textarea
        value={script}
        onChange={e => setScript(e.target.value)}
        rows={20}
        placeholder="Nội dung kịch bản..."
        className="w-full text-xs px-3 py-2 rounded-lg outline-none resize-y"
        style={{ background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--border)' }}
      />

      {msg && <div className="text-xs" style={{ color: msg.includes('Lỗi') || msg.includes('API ') ? 'var(--red)' : 'var(--green)' }}>{msg}</div>}
    </div>
  )
}
