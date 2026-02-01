'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { Loader2, Terminal, RefreshCw, Maximize2, Minimize2, Wifi, WifiOff, AlertTriangle, Trash2, Plus } from 'lucide-react'

// Cutoff date: Feb 01, 2026 2:00 AM PST = Feb 01, 2026 10:00 AM UTC
const WEBSOCKET_SUPPORT_CUTOFF = new Date('2026-02-01T10:00:00Z')

interface OrgoTerminalProps {
  /** VM ID for the Orgo computer */
  vmId?: string
  /** Direct Orgo computer ID (alternative to vmId) */
  computerId?: string
  /** Terminal title */
  title?: string
  /** Custom class name */
  className?: string
  /** Callback when terminal is ready */
  onReady?: () => void
  /** VM creation date - VMs before Feb 01 2026 2:00 AM PST don't support WebSocket */
  vmCreatedAt?: Date | string
  /** Callback to migrate/recreate the VM */
  onMigrate?: () => void | Promise<void>
}

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

// WebSocket message types
interface TerminalOutputMessage {
  type: 'output'
  data: string
}

interface TerminalErrorMessage {
  type: 'error'
  message: string
}

interface TerminalExitMessage {
  type: 'exit'
  code: number
}

interface TerminalPongMessage {
  type: 'pong'
}

type TerminalMessage = TerminalOutputMessage | TerminalErrorMessage | TerminalExitMessage | TerminalPongMessage

/**
 * OrgoTerminal - Interactive terminal using Orgo's WebSocket API
 * 
 * Connects directly to wss://{computer_id}.orgo.dev/terminal for a full PTY experience.
 * Docs: https://docs.orgo.ai/api-reference/computers/terminal
 */
export function OrgoTerminal({
  vmId,
  computerId: propComputerId,
  title = 'Terminal',
  className = '',
  onReady,
  vmCreatedAt,
  onMigrate,
}: OrgoTerminalProps) {
  // Check if VM was created before WebSocket support cutoff
  const isLegacyVM = vmCreatedAt
    ? new Date(vmCreatedAt) < WEBSOCKET_SUPPORT_CUTOFF
    : false

  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttemptRef = useRef<number>(0)
  const isConnectingRef = useRef<boolean>(false)
  const wasConnectedRef = useRef<boolean>(false) // Track if we ever connected successfully
  const maxReconnectAttempts = 3 // Limit reconnection attempts
  
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')
  const [error, setError] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [resolvedComputerId, setResolvedComputerId] = useState<string | null>(propComputerId || null)
  const [xtermReady, setXtermReady] = useState(false)
  const [isMigrating, setIsMigrating] = useState(false)

  // Resolve computer ID from vmId if needed
  useEffect(() => {
    if (propComputerId) {
      setResolvedComputerId(propComputerId)
      return
    }

    if (!vmId) {
      setError('No VM or computer ID provided')
      setConnectionState('error')
      return
    }

    // Fetch the VM to get the Orgo computer ID
    const fetchComputerId = async () => {
      try {
        const response = await fetch(`/api/vms/${vmId}`)
        if (!response.ok) {
          throw new Error('Failed to fetch VM details')
        }
        const data = await response.json()
        const vm = data.vm || data // Handle both { vm: {...} } and direct object
        console.log('[OrgoTerminal] Fetched VM:', { provider: vm.provider, orgoComputerId: vm.orgoComputerId })
        if (vm.provider !== 'orgo' || !vm.orgoComputerId) {
          throw new Error('VM is not an Orgo computer or missing computer ID')
        }
        setResolvedComputerId(vm.orgoComputerId)
    } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to resolve computer ID')
        setConnectionState('error')
      }
    }

    fetchComputerId()
  }, [vmId, propComputerId])

  // Start heartbeat ping
  const startHeartbeat = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current)
    }

    // Send ping every 30 seconds
    pingIntervalRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }))
      }
    }, 30000)
  }, [])

  // Stop heartbeat
  const stopHeartbeat = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current)
      pingIntervalRef.current = null
    }
  }, [])

  // Connect to WebSocket terminal
  const connect = useCallback(async () => {
    if (!resolvedComputerId || isConnectingRef.current) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    isConnectingRef.current = true
    setConnectionState('connecting')
    setError(null)

    // Get terminal dimensions
    const cols = xtermRef.current?.cols || 80
    const rows = xtermRef.current?.rows || 24

    // WebSocket URL uses the computer ID as subdomain with 'orgo-' prefix
    // Format from docs: wss://orgo-{uuid}.orgo.dev/terminal
    // Add 'orgo-' prefix if not already present
    const computerId = resolvedComputerId.startsWith('orgo-')
      ? resolvedComputerId
      : `orgo-${resolvedComputerId}`
    const wsUrl = `wss://${computerId}.orgo.dev/terminal?cols=${cols}&rows=${rows}`
    console.log('[OrgoTerminal] Raw computer ID:', resolvedComputerId)
    console.log('[OrgoTerminal] Connecting to WebSocket:', wsUrl)

    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        console.log('[OrgoTerminal] WebSocket connected!')
        isConnectingRef.current = false
      setConnectionState('connected')
        // Note: Don't reset reconnectAttemptRef here - wait until we receive actual output
        // This prevents infinite reconnect loops if connection opens but immediately closes
      
        // Clear terminal and show connection message
      if (xtermRef.current) {
        xtermRef.current.clear()
        xtermRef.current.focus()
      }

        startHeartbeat()
      onReady?.()
      }

      ws.onmessage = (event) => {
        try {
          const message: TerminalMessage = JSON.parse(event.data)

          switch (message.type) {
            case 'output':
              // Mark as truly connected once we receive actual output
              if (!wasConnectedRef.current) {
                wasConnectedRef.current = true
                reconnectAttemptRef.current = 0 // Reset reconnect counter on successful connection
              }
              xtermRef.current?.write(message.data)
              break
            case 'error':
              console.error('Terminal error:', message.message)
              xtermRef.current?.write(`\r\n\x1b[31mError: ${message.message}\x1b[0m\r\n`)
              break
            case 'exit':
              console.log('Shell exited with code:', message.code)
              xtermRef.current?.write(`\r\n\x1b[33mShell exited with code: ${message.code}\x1b[0m\r\n`)
              // Attempt to reconnect after shell exit
              scheduleReconnect()
              break
            case 'pong':
              // Heartbeat acknowledged
              break
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err)
        }
      }

      ws.onerror = (event) => {
        console.error('[OrgoTerminal] WebSocket error:', event)
        // Error will be followed by onclose, so just log here
      }

      ws.onclose = (event) => {
        console.log('[OrgoTerminal] WebSocket closed:', { code: event.code, reason: event.reason, wasClean: event.wasClean, wasConnected: wasConnectedRef.current })
        isConnectingRef.current = false
        stopHeartbeat()

        // Reset wasConnected - we're no longer connected
        const hadSuccessfulConnection = wasConnectedRef.current
        wasConnectedRef.current = false

        // Only attempt reconnect if we had a real connection (received output) and haven't exceeded attempts
        if (hadSuccessfulConnection && reconnectAttemptRef.current < maxReconnectAttempts) {
          setConnectionState('disconnected')
          xtermRef.current?.write('\r\n\x1b[33mConnection lost. Reconnecting...\x1b[0m\r\n')
          scheduleReconnect()
        } else if (hadSuccessfulConnection) {
          setConnectionState('error')
          setError('Connection lost. Max reconnection attempts reached.')
          xtermRef.current?.write('\r\n\x1b[31mMax reconnection attempts reached. Click Reconnect to try again.\x1b[0m\r\n')
        } else {
          // Initial connection failed - don't auto-reconnect
          setConnectionState('error')
          setError(`Failed to connect (code: ${event.code})`)
        }
      }

    } catch (err) {
      isConnectingRef.current = false
      setConnectionState('error')
      setError(err instanceof Error ? err.message : 'Failed to connect')
    }
  }, [resolvedComputerId, startHeartbeat, stopHeartbeat, onReady])

  // Schedule reconnect with exponential backoff
  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }

    // Calculate backoff: 2s, 4s, 8s, 16s, max 30s
    const baseDelay = 2000
    const maxDelay = 30000
    const delay = Math.min(baseDelay * Math.pow(2, reconnectAttemptRef.current), maxDelay)

    reconnectAttemptRef.current++

    reconnectTimeoutRef.current = setTimeout(() => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        connect()
      }
    }, delay)
  }, [connect])

  // Disconnect WebSocket
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    stopHeartbeat()

    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    setConnectionState('disconnected')
  }, [stopHeartbeat])

  // Send input to terminal
  const sendInput = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'input', data }))
    }
  }, [])

  // Send resize message
  const sendResize = useCallback((cols: number, rows: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'resize', cols, rows }))
    }
  }, [])

  // Initialize xterm
  useEffect(() => {
    if (!terminalRef.current) return
    if (xtermRef.current) return

    const term = new XTerm({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 14,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
      theme: {
        background: '#1a1b26',
        foreground: '#a9b1d6',
        cursor: '#c0caf5',
        cursorAccent: '#1a1b26',
        selectionBackground: '#33467c',
        black: '#32344a',
        red: '#f7768e',
        green: '#9ece6a',
        yellow: '#e0af68',
        blue: '#7aa2f7',
        magenta: '#ad8ee6',
        cyan: '#449dab',
        white: '#787c99',
        brightBlack: '#444b6a',
        brightRed: '#ff7a93',
        brightGreen: '#b9f27c',
        brightYellow: '#ff9e64',
        brightBlue: '#7da6ff',
        brightMagenta: '#bb9af7',
        brightCyan: '#0db9d7',
        brightWhite: '#acb0d0',
      },
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)

    term.open(terminalRef.current)
    setTimeout(() => fitAddon.fit(), 0)

    // Forward all user input to WebSocket
    term.onData((data) => {
      sendInput(data)
    })

    xtermRef.current = term
    fitAddonRef.current = fitAddon

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
      // Send resize to server after fitting
      sendResize(term.cols, term.rows)
    })
    resizeObserver.observe(terminalRef.current)

    // Show initial connecting message
    term.write('\x1b[1;33m  Orgo Terminal\x1b[0m\r\n')
    term.write('\x1b[90m  Connecting to your Orgo computer...\x1b[0m\r\n\r\n')

    // Mark xterm as ready after a brief delay to ensure it's fully initialized
    setTimeout(() => setXtermReady(true), 100)
    
    return () => {
      resizeObserver.disconnect()
      term.dispose()
      xtermRef.current = null
      fitAddonRef.current = null
      setXtermReady(false)
    }
  }, [sendInput, sendResize])

  // Connect when both xterm is ready AND computer ID is resolved
  useEffect(() => {
    if (resolvedComputerId && xtermReady) {
      connect()
    }
  }, [resolvedComputerId, xtermReady, connect])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  // Handle fullscreen toggle
  useEffect(() => {
    if (fitAddonRef.current) {
      setTimeout(() => {
        fitAddonRef.current?.fit()
        if (xtermRef.current) {
          sendResize(xtermRef.current.cols, xtermRef.current.rows)
        }
      }, 100)
    }
  }, [isFullscreen, sendResize])

  // Manual reconnect handler
  const handleReconnect = useCallback(() => {
    reconnectAttemptRef.current = 0
    wasConnectedRef.current = false // Reset so initial failure won't trigger auto-reconnect loop
    disconnect()
    setTimeout(() => connect(), 500)
  }, [disconnect, connect])

  // Show migration UI for legacy VMs
  if (isLegacyVM) {
    return (
      <div className={`flex flex-col bg-[#1a1b26] rounded-lg overflow-hidden ${className}`}>
        {/* Terminal Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-[#24283b] border-b border-[#32344a]">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-[#7aa2f7]" />
            <span className="text-sm font-mono text-[#a9b1d6]">{title}</span>
          </div>
        </div>

        {/* Migration Message */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-[#e0af68]/20 flex items-center justify-center mb-6">
            <AlertTriangle className="w-8 h-8 text-[#e0af68]" />
          </div>

          <h3 className="text-xl font-bold text-[#a9b1d6] mb-3">
            Terminal Has Been Upgraded
          </h3>

          <p className="text-[#787c99] text-sm max-w-md mb-6 leading-relaxed">
            We’ve upgraded our terminal experience using SSH.
            To use the new interactive terminal, please move to a new VM.
          </p>

          <div className="flex flex-col gap-3 w-full max-w-xs">
            {onMigrate && (
              <button
                onClick={async () => {
                  setIsMigrating(true)
                  try {
                    await onMigrate()
                  } catch {
                    setIsMigrating(false)
                  }
                }}
                disabled={isMigrating}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[#7aa2f7] text-[#1a1b26] font-medium hover:bg-[#7da6ff] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isMigrating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                {isMigrating ? 'Migrating...' : 'Migrate to New VM'}
              </button>
            )}
            <p className="text-[#565f89] text-xs">
              This will delete your current VM and create a new one with all features enabled.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div 
      className={`flex flex-col bg-[#1a1b26] rounded-lg overflow-hidden ${isFullscreen ? 'fixed inset-4 z-50' : ''
      } ${className}`}
    >
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#24283b] border-b border-[#32344a]">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-[#7aa2f7]" />
          <span className="text-sm font-mono text-[#a9b1d6]">{title}</span>
          {connectionState === 'connected' && (
            <span className="flex items-center gap-1.5">
              <Wifi className="w-3 h-3 text-green-500" />
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            </span>
          )}
          {connectionState === 'connecting' && (
            <Loader2 className="w-3 h-3 text-yellow-500 animate-spin" />
          )}
          {connectionState === 'disconnected' && (
            <WifiOff className="w-3 h-3 text-gray-500" />
          )}
          {connectionState === 'error' && (
            <span className="w-2 h-2 rounded-full bg-red-500" />
          )}
        </div>
        <div className="flex items-center gap-2">
            <button
            onClick={handleReconnect}
              className="p-1.5 rounded hover:bg-[#32344a] text-[#7aa2f7] transition-colors"
              title="Reconnect"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded hover:bg-[#32344a] text-[#a9b1d6] transition-colors"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Terminal Content */}
      <div className="flex-1 relative min-h-0 overflow-hidden">
        <div
          ref={terminalRef}
          className="absolute inset-2 cursor-text overflow-hidden"
          onClick={() => xtermRef.current?.focus()}
        />

        {/* Connecting overlay */}
        {connectionState === 'connecting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1a1b26]/90">
            <Loader2 className="w-12 h-12 text-[#7aa2f7] mb-4 animate-spin" />
            <p className="text-[#a9b1d6]">Connecting to Orgo...</p>
          </div>
        )}

        {/* Error overlay */}
        {connectionState === 'error' && error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1a1b26]/90">
            <div className="w-12 h-12 rounded-full bg-[#f7768e]/20 flex items-center justify-center mb-4">
              <Terminal className="w-6 h-6 text-[#f7768e]" />
            </div>
            <p className="text-[#f7768e] mb-2">Connection Error</p>
            <p className="text-[#787c99] text-sm mb-4 max-w-md text-center px-4">{error}</p>
            <button
              onClick={handleReconnect}
              className="px-4 py-2 rounded-lg bg-[#7aa2f7] text-[#1a1b26] font-medium hover:bg-[#7da6ff] transition-colors"
            >
              Retry
            </button>
          </div>
        )}
      </div>

      {/* Fullscreen backdrop */}
      {isFullscreen && (
        <div
          className="fixed inset-0 bg-black/80 -z-10"
          onClick={() => setIsFullscreen(false)}
        />
      )}
    </div>
  )
}

export default OrgoTerminal
