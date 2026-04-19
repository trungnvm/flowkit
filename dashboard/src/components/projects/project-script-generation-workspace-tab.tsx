import { useEffect, useMemo, useState } from 'react'
import { Loader, Sparkles, Save } from 'lucide-react'
import { fetchAPI, postAPI, putAPI } from '../../api/client'
import { useI18n } from '../../language-toggle-and-bilingual-ui-context'

interface ScriptResponse {
  project_id: string
  provider?: string | null
  model?: string | null
  script: string
}

type Provider = 'anthropic' | 'openai' | 'gemini' | 'dashscope'

const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: 'claude-3-5-haiku-latest',
  openai: 'gpt-4.1-mini',
  gemini: 'gemini-2.5-flash',
  dashscope: 'qwen-plus',
}

export default function ScriptWorkspaceTab({ projectId }: { projectId: string }) {
  const { t } = useI18n()
  const [provider, setProvider] = useState<Provider>('anthropic')
  const [topic, setTopic] = useState('')
  const [promptInput, setPromptInput] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [keySaved, setKeySaved] = useState(false)
  const [model, setModel] = useState(DEFAULT_MODELS.anthropic)
  const [language, setLanguage] = useState('vi')
  const [maxWords, setMaxWords] = useState(450)
  const [script, setScript] = useState('')
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [testingProvider, setTestingProvider] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  async function load() {
    setLoading(true)
    try {
      const res = await fetchAPI<ScriptResponse>(`/api/projects/${projectId}/script`)
      setScript(res.script ?? '')
      if (res.provider && ['anthropic', 'openai', 'gemini', 'dashscope'].includes(res.provider)) {
        const p = res.provider as Provider
        setProvider(p)
        setModel(res.model || localStorage.getItem(`flowkit:script-model:${p}`) || DEFAULT_MODELS[p])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [projectId])

  const apiKeyStorageKey = useMemo(() => `flowkit:script-api-key:${provider}`, [provider])
  const modelStorageKey = useMemo(() => `flowkit:script-model:${provider}`, [provider])

  useEffect(() => {
    const saved = localStorage.getItem(apiKeyStorageKey)
    const savedModel = localStorage.getItem(modelStorageKey)
    setApiKey('')
    setKeySaved(Boolean(saved))
    setModel(savedModel || DEFAULT_MODELS[provider])
  }, [apiKeyStorageKey, modelStorageKey, provider])

  async function generateScript() {
    if (!topic.trim() && !promptInput.trim()) return
    setGenerating(true)
    setMsg('')
    try {
      localStorage.setItem(modelStorageKey, model.trim())
      const res = await postAPI<ScriptResponse>(`/api/projects/${projectId}/script/generate`, {
        provider,
        topic: topic.trim(),
        prompt: promptInput.trim() || null,
        api_key: apiKey.trim() || localStorage.getItem(apiKeyStorageKey) || null,
        model: model.trim() || null,
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

  function saveApiKey() {
    if (!apiKey.trim()) {
      setMsg('API key đang trống')
      return
    }
    localStorage.setItem(apiKeyStorageKey, apiKey.trim())
    localStorage.setItem(modelStorageKey, model.trim())
    setApiKey('')
    setKeySaved(true)
    setMsg('Đã lưu API key ở localStorage')
  }

  function clearApiKey() {
    localStorage.removeItem(apiKeyStorageKey)
    setApiKey('')
    setKeySaved(false)
    setMsg('Đã xoá API key đã lưu')
  }

  async function testProvider() {
    setTestingProvider(true)
    setMsg('')
    try {
      localStorage.setItem(modelStorageKey, model.trim())
      const res = await postAPI<{ ok: boolean; provider: string; model: string }>(`/api/projects/${projectId}/script/test-provider`, {
        provider,
        api_key: apiKey.trim() || localStorage.getItem(apiKeyStorageKey) || null,
        model: model.trim() || null,
      })
      setMsg(`Kết nối provider OK: ${res.provider}/${res.model}`)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Lỗi test provider')
    } finally {
      setTestingProvider(false)
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

  if (loading) return <div className="text-xs" style={{ color: 'var(--muted)' }}>{t('Đang tải...', 'Loading...')}</div>

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
          placeholder={t('Chủ đề kịch bản (tuỳ chọn khi đã có prompt)', 'Script topic (optional when prompt exists)')}
          className="flex-1 min-w-[220px] text-xs px-2 py-1.5 rounded outline-none"
          style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
        />

        <select
          value={language}
          onChange={e => setLanguage(e.target.value)}
          className="text-xs px-2 py-1.5 rounded outline-none"
          style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
        >
          <option value="vi">{t('Tiếng Việt', 'Vietnamese')}</option>
          <option value="en">{t('Tiếng Anh', 'English')}</option>
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
          disabled={generating || (!topic.trim() && !promptInput.trim())}
          className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-semibold"
          style={{ background: 'rgba(99,102,241,0.85)', color: '#fff', opacity: generating || (!topic.trim() && !promptInput.trim()) ? 0.6 : 1 }}
        >
          {generating ? <Loader size={12} className="animate-spin" /> : <Sparkles size={12} />} {t('Sinh script', 'Generate script')}
        </button>

        <button
          onClick={saveScript}
          disabled={saving}
          className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-semibold"
          style={{ background: 'rgba(16,185,129,0.85)', color: '#fff', opacity: saving ? 0.6 : 1 }}
        >
          {saving ? <Loader size={12} className="animate-spin" /> : <Save size={12} />} {t('Lưu', 'Save')}
        </button>
      </div>

      <div className="rounded-lg p-3 flex flex-col gap-2" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <div className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>{t('Prompt text (ưu tiên dùng nếu nhập)', 'Prompt text (used with priority if provided)')}</div>
        <textarea
          value={promptInput}
          onChange={e => setPromptInput(e.target.value)}
          rows={6}
          placeholder={t('Nhập prompt trực tiếp để sinh script...', 'Enter prompt directly to generate script...')}
          className="w-full text-xs px-3 py-2 rounded-lg outline-none resize-y"
          style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
        />

        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="text"
            value={model}
            onChange={e => setModel(e.target.value)}
            placeholder={t('Model (ví dụ: gemini-2.5-flash)', 'Model (e.g. gemini-2.5-flash)')}
            className="flex-1 min-w-[240px] text-xs px-2 py-1.5 rounded outline-none"
            style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
          />
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder={keySaved ? t('API key đã lưu (đang ẩn)', 'API key saved (hidden)') : t('Nhập API key cho provider hiện tại', 'Enter API key for current provider')}
            className="flex-1 min-w-[240px] text-xs px-2 py-1.5 rounded outline-none"
            style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
          />
          <button
            onClick={saveApiKey}
            className="px-3 py-1.5 rounded text-xs font-semibold"
            style={{ background: 'rgba(59,130,246,0.85)', color: '#fff' }}
          >
            {t('Lưu API key', 'Save API key')}
          </button>
          <button
            onClick={testProvider}
            disabled={testingProvider}
            className="px-3 py-1.5 rounded text-xs font-semibold"
            style={{ background: 'rgba(99,102,241,0.85)', color: '#fff', opacity: testingProvider ? 0.6 : 1 }}
          >
            {testingProvider ? t('Đang test...', 'Testing...') : t('Test provider', 'Test provider')}
          </button>
          <button
            onClick={clearApiKey}
            className="px-3 py-1.5 rounded text-xs font-semibold"
            style={{ background: 'rgba(239,68,68,0.85)', color: '#fff' }}
          >
            {t('Xoá key', 'Clear key')}
          </button>
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            {keySaved ? t('Đã lưu key (không hiển thị)', 'Key saved (hidden)') : t('Chưa lưu key', 'Key not saved')}
          </span>
        </div>
      </div>

      <textarea
        value={script}
        onChange={e => setScript(e.target.value)}
        rows={20}
        placeholder={t('Nội dung kịch bản...', 'Script content...')}
        className="w-full text-xs px-3 py-2 rounded-lg outline-none resize-y"
        style={{ background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--border)' }}
      />

      {msg && <div className="text-xs" style={{ color: msg.toLowerCase().includes('lỗi') || msg.toLowerCase().includes('failed') || msg.includes('API ') ? 'var(--red)' : 'var(--green)' }}>{msg}</div>}
    </div>
  )
}
