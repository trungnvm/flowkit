import { useState, useEffect, useRef, useCallback } from 'react'
import type { WSEvent } from '../types'
import { WS_BASE } from './client'

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false)
  const [lastEvent, setLastEvent] = useState<WSEvent | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const retriesRef = useRef(0)
  const reconnectTimerRef = useRef<number | null>(null)
  const stoppedRef = useRef(false)

  const connect = useCallback(() => {
    if (stoppedRef.current) return
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const fallbackHost = window.location.port === '5173' ? `${window.location.hostname}:8100` : window.location.host
    const defaultBase = `${proto}//${fallbackHost}`
    const ws = new WebSocket(`${WS_BASE || defaultBase}/ws/dashboard`)
    wsRef.current = ws

    ws.onopen = () => {
      setIsConnected(true)
      retriesRef.current = 0
    }

    ws.onmessage = (e) => {
      try {
        const event: WSEvent = JSON.parse(e.data)
        setLastEvent(event)
      } catch {
        // ignore non-JSON messages
      }
    }

    ws.onclose = () => {
      setIsConnected(false)
      wsRef.current = null
      if (stoppedRef.current) return
      const delay = Math.min(1000 * 2 ** retriesRef.current, 30000)
      retriesRef.current += 1
      reconnectTimerRef.current = window.setTimeout(() => connect(), delay)
    }

    ws.onerror = () => ws.close()
  }, [])

  useEffect(() => {
    stoppedRef.current = false
    connect()
    return () => {
      stoppedRef.current = true
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [connect])

  return { isConnected, lastEvent }
}
