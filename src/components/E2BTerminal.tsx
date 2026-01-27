'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { Loader2, Terminal, RefreshCw, Maximize2, Minimize2, AlertCircle } from 'lucide-react'

interface E2BTerminalProps {
  /** VM ID for the E2B sandbox */
  vmId?: string
  /** Direct E2B sandbox ID (alternative to vmId) */
  sandboxId?: string
  /** Terminal title */
  title?: string
  /** Custom class name */
  className?: string
  /** Callback when terminal is ready */
  onReady?: () => void
  /** Callback when sandbox expires/disconnects */
  onDisconnect?: () => void
}

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error' | 'expired'

export function E2BTerminal({
  vmId,
  sandboxId,
  title = 'E2B Terminal',
  className = '',
  onReady,
  onDisconnect,
}: E2BTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const currentLineRef = useRef<string>('')
  const cursorPosRef = useRef<number>(0)
  const historyRef = useRef<string[]>([])
  const historyIndexRef = useRef<number>(-1)
  const cwdRef = useRef<string>('~')
  const absoluteCwdRef = useRef<string>('')
  const isExecutingRef = useRef<boolean>(false)
  const handleTabCompleteRef = useRef<((term: XTerm) => Promise<void>) | null>(null)
  
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')
  const [error, setError] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Execute command via E2B API
  const executeCommand = useCallback(async (command: string): Promise<{ output: string; exitCode: number }> => {
    const response = await fetch('/api/terminal/e2b/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        command,
        vmId,
        sandboxId,
      }),
    })

    if (!response.ok) {
      const data = await response.json()
      
      // Handle sandbox expiration
      if (response.status === 410) {
        setConnectionState('expired')
        setError('Sandbox has expired or been terminated')
        onDisconnect?.()
      }
      
      throw new Error(data.error || 'Failed to execute command')
    }

    return response.json()
  }, [vmId, sandboxId, onDisconnect])

  // Get current working directory
  const updateCwd = useCallback(async (newPath?: string) => {
    try {
      let command = 'pwd'
      if (newPath) {
        command = `cd ${newPath} 2>/dev/null && pwd`
      }
      
      const result = await executeCommand(command)
      const cwd = result.output.trim()
      
      if (cwd) {
        absoluteCwdRef.current = cwd
        cwdRef.current = cwd.replace(/^\/home\/[^/]+/, '~').replace(/^\/root/, '~')
      }
    } catch {
      // Keep current cwd on error
    }
  }, [executeCommand])

  // Write prompt to terminal
  const writePrompt = useCallback(() => {
    if (!xtermRef.current) return
    xtermRef.current.write(`\r\n\x1b[1;32me2b\x1b[0m:\x1b[1;34m${cwdRef.current}\x1b[0m$ `)
  }, [])

  // Handle command execution
  const handleCommand = useCallback(async (command: string) => {
    if (!xtermRef.current || isExecutingRef.current) return

    const trimmedCommand = command.trim()
    
    if (!trimmedCommand) {
      writePrompt()
      return
    }

    // Add to history
    if (trimmedCommand && historyRef.current[historyRef.current.length - 1] !== trimmedCommand) {
      historyRef.current.push(trimmedCommand)
      if (historyRef.current.length > 100) {
        historyRef.current.shift()
      }
    }
    historyIndexRef.current = -1

    // Handle cd command locally
    if (trimmedCommand.startsWith('cd ')) {
      const path = trimmedCommand.slice(3).trim()
      isExecutingRef.current = true
      try {
        await updateCwd(path)
      } catch {
        xtermRef.current.write(`\r\n\x1b[31mcd: ${path}: No such file or directory\x1b[0m`)
      }
      isExecutingRef.current = false
      writePrompt()
      return
    }

    if (trimmedCommand === 'cd') {
      isExecutingRef.current = true
      await updateCwd('~')
      isExecutingRef.current = false
      writePrompt()
      return
    }

    // Handle clear command
    if (trimmedCommand === 'clear') {
      xtermRef.current.clear()
      xtermRef.current.write(`\x1b[1;32me2b\x1b[0m:\x1b[1;34m${cwdRef.current}\x1b[0m$ `)
      return
    }

    // Execute command
    isExecutingRef.current = true
    
    try {
      // Prefix command with cd to the current directory
      const fullCommand = absoluteCwdRef.current 
        ? `cd "${absoluteCwdRef.current}" && ${trimmedCommand}`
        : trimmedCommand
      
      const result = await executeCommand(fullCommand)
      
      if (result.output) {
        const lines = result.output.split('\n')
        for (const line of lines) {
          xtermRef.current.write(`\r\n${line}`)
        }
      }
      
      if (result.exitCode !== 0 && !result.output.includes('error') && !result.output.includes('Error')) {
        // Show exit code for non-zero exits without error output
        // (skip if error is already shown in output)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Command failed'
      xtermRef.current.write(`\r\n\x1b[31m${errorMessage}\x1b[0m`)
    }

    isExecutingRef.current = false
    writePrompt()
  }, [executeCommand, updateCwd, writePrompt])

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return

    const term = new XTerm({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 13,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
      theme: {
        background: '#0a0a0f',
        foreground: '#e4e4e7',
        cursor: '#f472b6',
        cursorAccent: '#0a0a0f',
        selectionBackground: 'rgba(244, 114, 182, 0.3)',
        black: '#18181b',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#facc15',
        blue: '#60a5fa',
        magenta: '#f472b6',
        cyan: '#22d3ee',
        white: '#e4e4e7',
      },
      allowTransparency: true,
      scrollback: 1000,
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)
    
    term.open(terminalRef.current)
    fitAddon.fit()

    xtermRef.current = term
    fitAddonRef.current = fitAddon

    // Handle resize
    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit()
      }
    }
    window.addEventListener('resize', handleResize)

    // Tab completion handler
    handleTabCompleteRef.current = async (t: XTerm) => {
      const currentLine = currentLineRef.current
      const cursorPos = cursorPosRef.current
      
      // Get the partial path up to cursor
      const beforeCursor = currentLine.slice(0, cursorPos)
      const parts = beforeCursor.split(/\s+/)
      const partial = parts[parts.length - 1] || ''
      
      if (!partial) return
      
      try {
        // Use bash completion
        const result = await executeCommand(
          `cd "${absoluteCwdRef.current || '~'}" && compgen -f "${partial}" 2>/dev/null | head -10`
        )
        
        const completions = result.output.trim().split('\n').filter(Boolean)
        
        if (completions.length === 1) {
          // Single match - complete it
          const completion = completions[0]
          const remaining = completion.slice(partial.length)
          
          if (remaining) {
            t.write(remaining)
            currentLineRef.current = currentLine.slice(0, cursorPos) + remaining + currentLine.slice(cursorPos)
            cursorPosRef.current = cursorPos + remaining.length
          }
        } else if (completions.length > 1) {
          // Multiple matches - show them
          t.write('\r\n')
          completions.forEach(c => {
            t.write(`${c}  `)
          })
          t.write(`\r\n\x1b[1;32me2b\x1b[0m:\x1b[1;34m${cwdRef.current}\x1b[0m$ ${currentLine}`)
        }
      } catch {
        // Ignore completion errors
      }
    }

    // Handle input
    term.onData((data) => {
      if (isExecutingRef.current) return

      const code = data.charCodeAt(0)

      // Enter
      if (code === 13) {
        const command = currentLineRef.current
        currentLineRef.current = ''
        cursorPosRef.current = 0
        handleCommand(command)
        return
      }

      // Backspace
      if (code === 127) {
        if (cursorPosRef.current > 0) {
          const line = currentLineRef.current
          currentLineRef.current = line.slice(0, cursorPosRef.current - 1) + line.slice(cursorPosRef.current)
          cursorPosRef.current--
          
          // Rewrite line from cursor position
          const afterCursor = currentLineRef.current.slice(cursorPosRef.current)
          term.write('\b' + afterCursor + ' ')
          // Move cursor back to position
          for (let i = 0; i <= afterCursor.length; i++) {
            term.write('\b')
          }
        }
        return
      }

      // Tab
      if (code === 9) {
        handleTabCompleteRef.current?.(term)
        return
      }

      // Arrow keys and other escape sequences
      if (data.startsWith('\x1b[')) {
        const seq = data.slice(2)
        
        // Up arrow - history
        if (seq === 'A') {
          if (historyRef.current.length > 0) {
            if (historyIndexRef.current === -1) {
              historyIndexRef.current = historyRef.current.length - 1
            } else if (historyIndexRef.current > 0) {
              historyIndexRef.current--
            }
            
            // Clear current line
            const clearLen = currentLineRef.current.length
            term.write('\b'.repeat(cursorPosRef.current))
            term.write(' '.repeat(clearLen))
            term.write('\b'.repeat(clearLen))
            
            // Write history entry
            currentLineRef.current = historyRef.current[historyIndexRef.current]
            cursorPosRef.current = currentLineRef.current.length
            term.write(currentLineRef.current)
          }
          return
        }
        
        // Down arrow - history
        if (seq === 'B') {
          if (historyIndexRef.current !== -1) {
            // Clear current line
            const clearLen = currentLineRef.current.length
            term.write('\b'.repeat(cursorPosRef.current))
            term.write(' '.repeat(clearLen))
            term.write('\b'.repeat(clearLen))
            
            if (historyIndexRef.current < historyRef.current.length - 1) {
              historyIndexRef.current++
              currentLineRef.current = historyRef.current[historyIndexRef.current]
            } else {
              historyIndexRef.current = -1
              currentLineRef.current = ''
            }
            
            cursorPosRef.current = currentLineRef.current.length
            term.write(currentLineRef.current)
          }
          return
        }
        
        // Left arrow
        if (seq === 'D') {
          if (cursorPosRef.current > 0) {
            cursorPosRef.current--
            term.write(data)
          }
          return
        }
        
        // Right arrow
        if (seq === 'C') {
          if (cursorPosRef.current < currentLineRef.current.length) {
            cursorPosRef.current++
            term.write(data)
          }
          return
        }
        
        return
      }

      // Ctrl+C
      if (code === 3) {
        term.write('^C')
        currentLineRef.current = ''
        cursorPosRef.current = 0
        writePrompt()
        return
      }

      // Ctrl+L (clear)
      if (code === 12) {
        term.clear()
        term.write(`\x1b[1;32me2b\x1b[0m:\x1b[1;34m${cwdRef.current}\x1b[0m$ ${currentLineRef.current}`)
        return
      }

      // Regular character
      if (code >= 32) {
        const line = currentLineRef.current
        currentLineRef.current = line.slice(0, cursorPosRef.current) + data + line.slice(cursorPosRef.current)
        cursorPosRef.current += data.length
        
        // Write character and rest of line
        const afterCursor = currentLineRef.current.slice(cursorPosRef.current)
        term.write(data + afterCursor)
        // Move cursor back to position
        for (let i = 0; i < afterCursor.length; i++) {
          term.write('\b')
        }
      }
    })

    // Connect and initialize
    const initialize = async () => {
      setConnectionState('connecting')
      setError(null)

      try {
        // Test connection with a simple command
        await executeCommand('echo "Connected to E2B sandbox"')
        
        // Get initial working directory
        await updateCwd()
        
        setConnectionState('connected')
        
        // Write welcome message
        term.writeln('\x1b[1;36m╔════════════════════════════════════════╗\x1b[0m')
        term.writeln('\x1b[1;36m║\x1b[0m   \x1b[1;35mE2B Sandbox Terminal\x1b[0m                 \x1b[1;36m║\x1b[0m')
        term.writeln('\x1b[1;36m╚════════════════════════════════════════╝\x1b[0m')
        term.writeln('')
        term.writeln('\x1b[90mType commands to interact with your sandbox.\x1b[0m')
        term.writeln('\x1b[90mNote: Sandboxes may expire after the configured timeout.\x1b[0m')
        term.write(`\r\n\x1b[1;32me2b\x1b[0m:\x1b[1;34m${cwdRef.current}\x1b[0m$ `)
        
        onReady?.()
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to connect'
        setError(errorMessage)
        
        if (errorMessage.includes('expired') || errorMessage.includes('terminated')) {
          setConnectionState('expired')
        } else {
          setConnectionState('error')
        }
        
        term.writeln(`\x1b[31mError: ${errorMessage}\x1b[0m`)
      }
    }

    initialize()

    return () => {
      window.removeEventListener('resize', handleResize)
      term.dispose()
      xtermRef.current = null
      fitAddonRef.current = null
    }
  }, [executeCommand, updateCwd, handleCommand, writePrompt, onReady])

  // Handle reconnect
  const handleReconnect = useCallback(async () => {
    if (!xtermRef.current) return

    setConnectionState('connecting')
    setError(null)
    
    const term = xtermRef.current
    term.clear()
    term.writeln('\x1b[33mReconnecting...\x1b[0m')

    try {
      await executeCommand('echo "Reconnected"')
      await updateCwd()
      setConnectionState('connected')
      term.writeln('\x1b[32mReconnected successfully!\x1b[0m')
      term.write(`\r\n\x1b[1;32me2b\x1b[0m:\x1b[1;34m${cwdRef.current}\x1b[0m$ `)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to reconnect'
      setError(errorMessage)
      
      if (errorMessage.includes('expired') || errorMessage.includes('terminated')) {
        setConnectionState('expired')
        term.writeln('\x1b[31mSandbox has expired. Please create a new sandbox.\x1b[0m')
      } else {
        setConnectionState('error')
        term.writeln(`\x1b[31mReconnection failed: ${errorMessage}\x1b[0m`)
      }
    }
  }, [executeCommand, updateCwd])

  // Toggle fullscreen
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen)
    setTimeout(() => {
      fitAddonRef.current?.fit()
    }, 100)
  }

  const containerClasses = isFullscreen
    ? 'fixed inset-0 z-50 bg-sam-bg'
    : `relative ${className}`

  return (
    <div className={containerClasses}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-sam-surface/50 border-b border-sam-border/50">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-sam-accent" />
          <span className="font-mono text-sm text-sam-text">{title}</span>
          <span className={`w-2 h-2 rounded-full ${
            connectionState === 'connected' ? 'bg-green-500' :
            connectionState === 'connecting' ? 'bg-yellow-500 animate-pulse' :
            connectionState === 'expired' ? 'bg-orange-500' :
            'bg-red-500'
          }`} />
          {connectionState === 'expired' && (
            <span className="text-xs text-orange-500 font-mono">Expired</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(connectionState === 'error' || connectionState === 'expired') && (
            <button
              onClick={handleReconnect}
              className="p-1 text-sam-text-dim hover:text-sam-accent transition-colors"
              title="Reconnect"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={toggleFullscreen}
            className="p-1 text-sam-text-dim hover:text-sam-accent transition-colors"
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

      {/* Connection status overlay */}
      {connectionState === 'connecting' && (
        <div className="absolute inset-0 bg-sam-bg/80 flex items-center justify-center z-10" style={{ top: '40px' }}>
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-sam-accent" />
            <span className="text-sm font-mono text-sam-text-dim">Connecting to sandbox...</span>
          </div>
        </div>
      )}

      {/* Expired overlay */}
      {connectionState === 'expired' && (
        <div className="absolute inset-0 bg-sam-bg/90 flex items-center justify-center z-10" style={{ top: '40px' }}>
          <div className="flex flex-col items-center gap-3 text-center p-6">
            <AlertCircle className="w-12 h-12 text-orange-500" />
            <h3 className="text-lg font-display font-semibold text-sam-text">Sandbox Expired</h3>
            <p className="text-sm text-sam-text-dim max-w-md">
              This E2B sandbox has expired or been terminated. E2B sandboxes have a configurable timeout
              and are automatically cleaned up when not in use.
            </p>
            <button
              onClick={handleReconnect}
              className="mt-2 px-4 py-2 rounded-lg bg-sam-accent text-sam-bg font-display font-medium text-sm hover:bg-sam-accent-dim transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Try Reconnect
            </button>
          </div>
        </div>
      )}

      {/* Terminal */}
      <div
        ref={terminalRef}
        className="flex-1 p-2"
        style={{ height: isFullscreen ? 'calc(100vh - 40px)' : 'calc(100% - 40px)' }}
      />
    </div>
  )
}
