'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { Loader2, Terminal, RefreshCw, Power, Maximize2, Minimize2 } from 'lucide-react'

interface WebTerminalProps {
  /** VM ID to connect to (for multi-VM support) */
  vmId?: string
  /** Callback when terminal is ready */
  onReady?: () => void
  /** Callback when terminal disconnects */
  onDisconnect?: () => void
  /** Whether to auto-connect on mount */
  autoConnect?: boolean
  /** Terminal title */
  title?: string
  /** Custom class name */
  className?: string
}

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

export function WebTerminal({
  vmId,
  onReady,
  onDisconnect,
  autoConnect = true, // Auto-connect by default for better UX
  title = 'Terminal',
  className = '',
}: WebTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const isConnectingRef = useRef(false) // Guard against duplicate connections
  const hasConnectedRef = useRef(false) // Track if we've ever connected
  const sendInputRef = useRef<(data: string) => void>(() => {}) // Ref for sendInput callback
  const resizeTerminalRef = useRef<() => void>(() => {}) // Ref for resize callback
  const retryCountRef = useRef(0) // Track retry attempts
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const MAX_RETRIES = 3
  
  // Input batching - collect keystrokes and send together
  const inputBufferRef = useRef<string>('')
  const inputTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')
  const [error, setError] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  // Flush batched input to server
  const flushInput = useCallback(async () => {
    if (!sessionIdRef.current || !inputBufferRef.current) return
    
    const input = inputBufferRef.current
    inputBufferRef.current = ''
    
    try {
      await fetch('/api/terminal/input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          input,
        }),
      })
    } catch (err) {
      console.error('Failed to send input:', err)
    }
  }, [])

  // Send input to terminal with batching
  // Collects keystrokes for ~16ms (one animation frame) before sending
  const sendInput = useCallback((data: string) => {
    if (!sessionIdRef.current) return

    // Add to buffer
    inputBufferRef.current += data
    
    // Clear existing timeout
    if (inputTimeoutRef.current) {
      clearTimeout(inputTimeoutRef.current)
    }
    
    // Schedule flush after 16ms (one animation frame)
    // This batches rapid keystrokes while maintaining responsiveness
    inputTimeoutRef.current = setTimeout(() => {
      flushInput()
      inputTimeoutRef.current = null
    }, 16)
  }, [flushInput])

  // Keep ref updated
  sendInputRef.current = sendInput

  // Resize terminal
  const resizeTerminal = useCallback(async () => {
    if (!xtermRef.current || !fitAddonRef.current || !sessionIdRef.current) return

    fitAddonRef.current.fit()
    const { cols, rows } = xtermRef.current

    try {
      await fetch('/api/terminal/resize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          cols,
          rows,
        }),
      })
    } catch (err) {
      console.error('Failed to resize terminal:', err)
    }
  }, [])

  // Keep ref updated
  resizeTerminalRef.current = resizeTerminal

  // Connect to terminal with auto-retry
  const connect = useCallback(async (isRetry = false) => {
    // Guard against duplicate connections
    if (isConnectingRef.current || connectionState === 'connected') {
      console.log('[WebTerminal] Skipping duplicate connect call')
      return
    }

    // Reset retry count on fresh connect (not a retry)
    if (!isRetry) {
      retryCountRef.current = 0
      setRetryCount(0)
    }

    isConnectingRef.current = true
    setConnectionState('connecting')
    setError(null)

    // Clean up any existing event source
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }

    try {
      // Get terminal dimensions
      const cols = xtermRef.current?.cols || 80
      const rows = xtermRef.current?.rows || 24

      // Create terminal session
      const response = await fetch('/api/terminal/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cols, rows, vmId }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to connect')
      }

      const { sessionId } = await response.json()
      sessionIdRef.current = sessionId
      hasConnectedRef.current = true
      retryCountRef.current = 0 // Reset on successful connection
      setRetryCount(0)

      // Start SSE stream for output
      const eventSource = new EventSource(`/api/terminal/stream?sessionId=${sessionId}`)
      eventSourceRef.current = eventSource

      eventSource.onmessage = (event) => {
        try {
          const output = JSON.parse(event.data)
          if (output.type === 'connected') {
            setConnectionState('connected')
            isConnectingRef.current = false
            // Focus the terminal so user can start typing
            xtermRef.current?.focus()
            onReady?.()
          } else if (output.data) {
            xtermRef.current?.write(output.data)
          }
        } catch (err) {
          // Might be a non-JSON message, try to display it
          if (event.data) {
            xtermRef.current?.write(event.data)
          }
        }
      }

      eventSource.onerror = () => {
        eventSource.close()
        eventSourceRef.current = null
        isConnectingRef.current = false
        
        // Auto-retry on connection loss if we haven't exceeded max retries
        if (retryCountRef.current < MAX_RETRIES) {
          retryCountRef.current++
          setRetryCount(retryCountRef.current)
          console.log(`[WebTerminal] Connection lost, retrying (${retryCountRef.current}/${MAX_RETRIES})...`)
          
          // Wait a bit before retrying
          retryTimeoutRef.current = setTimeout(() => {
            connect(true)
          }, 1000 * retryCountRef.current) // Exponential backoff: 1s, 2s, 3s
        } else {
          setConnectionState('error')
          setError('Connection lost')
        }
      }

    } catch (err) {
      isConnectingRef.current = false
      
      // Auto-retry on initial connection failure
      if (retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current++
        setRetryCount(retryCountRef.current)
        console.log(`[WebTerminal] Connection failed, retrying (${retryCountRef.current}/${MAX_RETRIES})...`)
        
        retryTimeoutRef.current = setTimeout(() => {
          connect(true)
        }, 1000 * retryCountRef.current)
      } else {
        setConnectionState('error')
        setError(err instanceof Error ? err.message : 'Failed to connect')
      }
    }
  }, [connectionState, onReady, vmId])

  // Disconnect from terminal
  const disconnect = useCallback(async () => {
    // Clear any pending retry
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current)
      retryTimeoutRef.current = null
    }
    
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }

    if (sessionIdRef.current) {
      try {
        await fetch('/api/terminal/disconnect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionIdRef.current }),
        })
      } catch (err) {
        console.error('Failed to disconnect:', err)
      }
      sessionIdRef.current = null
    }

    isConnectingRef.current = false
    retryCountRef.current = 0
    setRetryCount(0)
    setConnectionState('disconnected')
    onDisconnect?.()
  }, [onDisconnect])

  // Initialize xterm - runs only once on mount
  useEffect(() => {
    if (!terminalRef.current) return
    
    // Prevent double initialization in React Strict Mode
    if (xtermRef.current) {
      console.log('[WebTerminal] Already initialized, skipping')
      return
    }

    console.log('[WebTerminal] Initializing terminal')

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
    
    // Delay initial fit to ensure container is properly sized
    setTimeout(() => fitAddon.fit(), 0)

    // Handle input - use ref to avoid stale closures
    term.onData((data) => {
      sendInputRef.current(data)
    })

    xtermRef.current = term
    fitAddonRef.current = fitAddon

    // Handle window resize - use ref to avoid stale closures
    const handleResize = () => {
      fitAddon.fit()
      resizeTerminalRef.current()
    }
    window.addEventListener('resize', handleResize)

    // Use ResizeObserver to handle container size changes
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
      resizeTerminalRef.current()
    })
    resizeObserver.observe(terminalRef.current)

    return () => {
      console.log('[WebTerminal] Cleaning up')
      window.removeEventListener('resize', handleResize)
      resizeObserver.disconnect()
      term.dispose()
      xtermRef.current = null
      fitAddonRef.current = null
      // Clear input timeout
      if (inputTimeoutRef.current) {
        clearTimeout(inputTimeoutRef.current)
        inputTimeoutRef.current = null
      }
      // Clear retry timeout
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current)
        retryTimeoutRef.current = null
      }
      // Don't call disconnect here - it's async and may cause issues
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, []) // Empty deps - only run on mount/unmount
  
  // Separate effect for auto-connect to avoid dependency issues
  useEffect(() => {
    if (autoConnect && !hasConnectedRef.current && xtermRef.current) {
      connect()
    }
  }, [autoConnect, connect])

  // Handle fullscreen toggle
  useEffect(() => {
    if (fitAddonRef.current) {
      setTimeout(() => {
        fitAddonRef.current?.fit()
        resizeTerminal()
      }, 100)
    }
  }, [isFullscreen, resizeTerminal])

  return (
    <div 
      className={`flex flex-col bg-[#1a1b26] rounded-lg overflow-hidden ${
        isFullscreen ? 'fixed inset-4 z-50' : ''
      } ${className}`}
    >
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#24283b] border-b border-[#32344a]">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-[#7aa2f7]" />
          <span className="text-sm font-mono text-[#a9b1d6]">{title}</span>
          {connectionState === 'connected' && (
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          )}
          {connectionState === 'connecting' && (
            <Loader2 className="w-3 h-3 text-yellow-500 animate-spin" />
          )}
          {connectionState === 'error' && (
            <span className="w-2 h-2 rounded-full bg-red-500" />
          )}
        </div>
        <div className="flex items-center gap-2">
          {connectionState === 'disconnected' || connectionState === 'error' ? (
            <button
              onClick={connect}
              className="p-1.5 rounded hover:bg-[#32344a] text-[#7aa2f7] transition-colors"
              title="Connect"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={disconnect}
              className="p-1.5 rounded hover:bg-[#32344a] text-[#f7768e] transition-colors"
              title="Disconnect"
            >
              <Power className="w-4 h-4" />
            </button>
          )}
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
        {/* xterm container - click to focus */}
        <div
          ref={terminalRef}
          className="absolute inset-2 cursor-text overflow-hidden"
          onClick={() => xtermRef.current?.focus()}
        />

        {/* Connection overlay */}
        {connectionState === 'disconnected' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1a1b26]/90">
            <Terminal className="w-12 h-12 text-[#7aa2f7] mb-4" />
            <p className="text-[#a9b1d6] mb-4">Terminal disconnected</p>
            <button
              onClick={connect}
              className="px-4 py-2 rounded-lg bg-[#7aa2f7] text-[#1a1b26] font-medium hover:bg-[#7da6ff] transition-colors"
            >
              Connect
            </button>
          </div>
        )}

        {/* Connecting overlay */}
        {connectionState === 'connecting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1a1b26]/90">
            <Loader2 className="w-12 h-12 text-[#7aa2f7] mb-4 animate-spin" />
            <p className="text-[#a9b1d6]">
              {retryCount > 0 
                ? `Reconnecting... (attempt ${retryCount}/${MAX_RETRIES})`
                : 'Connecting to VM...'}
            </p>
          </div>
        )}

        {/* Error overlay */}
        {connectionState === 'error' && error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1a1b26]/90">
            <div className="w-12 h-12 rounded-full bg-[#f7768e]/20 flex items-center justify-center mb-4">
              <Terminal className="w-6 h-6 text-[#f7768e]" />
            </div>
            <p className="text-[#f7768e] mb-2">Connection Error</p>
            <p className="text-[#787c99] text-sm mb-4">{error}</p>
            <button
              onClick={connect}
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

export default WebTerminal
