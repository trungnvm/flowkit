const BASE = ''  // same origin, proxied by Vite in dev

export const WS_BASE = (import.meta.env.VITE_WS_BASE as string | undefined)?.trim() || ''

export async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const isFormData = options?.body instanceof FormData
  const headers = new Headers(options?.headers)
  if (!isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  })
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    throw new Error(`API ${res.status}: ${err}`)
  }
  return res.json()
}

export async function postAPI<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  return fetchAPI<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) })
}

export async function postFormAPI<T>(path: string, body: FormData): Promise<T> {
  return fetchAPI<T>(path, { method: 'POST', body })
}

export async function putAPI<T>(path: string, body: Record<string, unknown>): Promise<T> {
  return fetchAPI<T>(path, { method: 'PUT', body: JSON.stringify(body) })
}

export async function patchAPI<T>(path: string, body: Record<string, unknown>): Promise<T> {
  return fetchAPI<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
}
