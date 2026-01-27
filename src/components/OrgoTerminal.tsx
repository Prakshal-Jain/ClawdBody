'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { Loader2, Terminal, RefreshCw, Maximize2, Minimize2 } from 'lucide-react'

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
}

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

export function OrgoTerminal({
  vmId,
  computerId,
  title = 'Orgo Terminal',
  className = '',
  onReady,
}: OrgoTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const currentLineRef = useRef<string>('')
  const cursorPosRef = useRef<number>(0)  // Cursor position within current line
  const historyRef = useRef<string[]>([])
  const historyIndexRef = useRef<number>(-1)
  const cwdRef = useRef<string>('~')
  const absoluteCwdRef = useRef<string>('')  // Full path for command prefixing
  const isExecutingRef = useRef<boolean>(false)
  const handleTabCompleteRef = useRef<((term: XTerm) => Promise<void>) | null>(null)
  
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')
  const [error, setError] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Execute command via API
  const executeCommand = useCallback(async (command: string): Promise<{ output: string; exitCode: number }> => {
    const response = await fetch('/api/terminal/orgo/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        command,
        vmId,
        computerId,
      }),
    })

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || 'Failed to execute command')
    }

    return response.json()
  }, [vmId, computerId])

  // Get current working directory
  const updateCwd = useCallback(async (newPath?: string) => {
    try {
      // If a new path is provided (from cd command), resolve it
      let command = 'pwd'
      if (newPath) {
        // Expand ~ to home directory and resolve the path
        command = `cd ${newPath} 2>/dev/null && pwd`
      }
      
      const result = await executeCommand(command)
      const cwd = result.output.trim()
      
      if (cwd) {
        absoluteCwdRef.current = cwd
        // Shorten home directory to ~ for display
        cwdRef.current = cwd.replace(/^\/home\/[^/]+/, '~').replace(/^\/root/, '~')
      }
    } catch {
      // Keep current cwd on error
    }
  }, [executeCommand])

  // Write prompt to terminal
  const writePrompt = useCallback(() => {
    if (!xtermRef.current) return
    xtermRef.current.write(`\r\n\x1b[1;32morgo\x1b[0m:\x1b[1;34m${cwdRef.current}\x1b[0m$ `)
  }, [])

  // Handle command execution
  const handleCommand = useCallback(async (command: string) => {
    if (!xtermRef.current || isExecutingRef.current) return

    const trimmedCommand = command.trim()
    
    // Add to history if not empty and not duplicate
    if (trimmedCommand && historyRef.current[historyRef.current.length - 1] !== trimmedCommand) {
      historyRef.current.push(trimmedCommand)
    }
    historyIndexRef.current = -1

    if (!trimmedCommand) {
      writePrompt()
      return
    }

    // Handle special commands
    if (trimmedCommand === 'clear') {
      xtermRef.current.write('\x1b[2J\x1b[H') // Clear screen and move cursor to top
      writePrompt()
      return
    }

    isExecutingRef.current = true
    xtermRef.current.write('\r\n')

    try {
      // Check if this is a cd command
      const cdMatch = trimmedCommand.match(/^cd\s*(.*)$/)
      
      if (cdMatch) {
        // Handle cd command - update the tracked directory
        const targetPath = cdMatch[1].trim() || '~'
        
        // Resolve the path relative to current directory
        let resolveCommand: string
        if (targetPath.startsWith('/')) {
          // Absolute path
          resolveCommand = `cd ${targetPath} 2>&1 && pwd`
        } else if (targetPath === '~' || targetPath.startsWith('~/')) {
          // Home-relative path
          resolveCommand = `cd ${targetPath} 2>&1 && pwd`
        } else {
          // Relative path - need to cd to current dir first
          resolveCommand = absoluteCwdRef.current 
            ? `cd ${absoluteCwdRef.current} && cd ${targetPath} 2>&1 && pwd`
            : `cd ${targetPath} 2>&1 && pwd`
        }
        
        const result = await executeCommand(resolveCommand)
        const output = result.output.trim()
        
        // Check if it's an error message or a valid path
        if (output.startsWith('/')) {
          absoluteCwdRef.current = output
          cwdRef.current = output.replace(/^\/home\/[^/]+/, '~').replace(/^\/root/, '~')
        } else if (output) {
          // It's an error message
          xtermRef.current.write(`\x1b[31m${output}\x1b[0m\r\n`)
        }
      } else {
        // Regular command - prefix with cd to current directory
        let fullCommand = trimmedCommand
        if (absoluteCwdRef.current) {
          fullCommand = `cd ${absoluteCwdRef.current} && ${trimmedCommand}`
        }
        
        const result = await executeCommand(fullCommand)
        
        // Write output
        if (result.output) {
          // Handle output - replace \n with \r\n for proper terminal display
          const formattedOutput = result.output.replace(/\n/g, '\r\n')
          xtermRef.current.write(formattedOutput)
          
          // Ensure we end with a newline if output doesn't have one
          if (!result.output.endsWith('\n')) {
            xtermRef.current.write('\r\n')
          }
        }
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Command failed'
      // Show user-friendly message for timeouts
      if (errorMessage.includes('timed out')) {
        xtermRef.current.write(`\x1b[33mRequest timed out. The command may still be running on the server.\x1b[0m\r\n`)
      } else {
        xtermRef.current.write(`\x1b[31m${errorMessage}\x1b[0m\r\n`)
      }
    } finally {
      isExecutingRef.current = false
      writePrompt()
    }
  }, [executeCommand, writePrompt])

  // Execute command with timeout (for tab completion)
  const executeWithTimeout = useCallback(async (command: string, timeoutMs: number = 5000) => {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Tab completion timed out')), timeoutMs)
    })
    return Promise.race([executeCommand(command), timeoutPromise])
  }, [executeCommand])

  // Handle tab completion
  const handleTabComplete = useCallback(async (term: XTerm) => {
    if (isExecutingRef.current) return
    
    const input = currentLineRef.current
    if (!input) return
    
    // Get the word being completed (last word in input)
    const words = input.split(/\s+/)
    const lastWord = words[words.length - 1] || ''
    const prefix = words.slice(0, -1).join(' ')
    
    try {
      isExecutingRef.current = true
      
      // Build completion command
      let compCommand: string
      const cwdPrefix = absoluteCwdRef.current ? `cd ${absoluteCwdRef.current} && ` : ''
      
      if (words.length === 1 && !input.includes(' ')) {
        // Completing a command - use compgen -c for commands
        compCommand = `${cwdPrefix}compgen -c -- "${lastWord}" 2>/dev/null | head -20`
      } else {
        // Completing a file/directory path - use compgen -f
        compCommand = `${cwdPrefix}compgen -f -- "${lastWord}" 2>/dev/null | head -20`
      }
      
      // Use shorter timeout for tab completion (5 seconds)
      const result = await executeWithTimeout(compCommand, 5000)
      const completions = result.output.trim().split('\n').filter(c => c)
      
      if (completions.length === 0) {
        // No completions - do nothing
      } else if (completions.length === 1) {
        // Single completion - auto-complete
        const completion = completions[0]
        const toAdd = completion.slice(lastWord.length)
        
        if (toAdd) {
          currentLineRef.current += toAdd
          cursorPosRef.current += toAdd.length
          term.write(toAdd)
        }
        
        // Check if it's a directory and add /
        const isDir = await executeWithTimeout(`${cwdPrefix}test -d "${completion}" && echo "dir"`, 3000)
        if (isDir.output.trim() === 'dir' && !completion.endsWith('/')) {
          currentLineRef.current += '/'
          cursorPosRef.current++
          term.write('/')
        } else if (isDir.output.trim() !== 'dir') {
          // Add space after non-directory completions
          currentLineRef.current += ' '
          cursorPosRef.current++
          term.write(' ')
        }
      } else {
        // Multiple completions - find common prefix and show options
        const commonPrefix = findCommonPrefix(completions)
        const toAdd = commonPrefix.slice(lastWord.length)
        
        if (toAdd) {
          // Add the common prefix
          currentLineRef.current += toAdd
          cursorPosRef.current += toAdd.length
          term.write(toAdd)
        } else {
          // Show all completions
          term.write('\r\n')
          term.write(completions.join('  '))
          term.write(`\r\n\x1b[1;32morgo\x1b[0m:\x1b[1;34m${cwdRef.current}\x1b[0m$ `)
          term.write(currentLineRef.current)
        }
      }
    } catch (err) {
      // Show timeout errors to user, silently fail on other errors
      const errorMessage = err instanceof Error ? err.message : ''
      if (errorMessage.includes('timed out')) {
        term.write('\r\n\x1b[33m[Tab completion timed out]\x1b[0m')
        term.write(`\r\n\x1b[1;32morgo\x1b[0m:\x1b[1;34m${cwdRef.current}\x1b[0m$ `)
        term.write(currentLineRef.current)
      }
    } finally {
      isExecutingRef.current = false
    }
  }, [executeWithTimeout])

  // Keep ref updated for use in event handlers
  handleTabCompleteRef.current = handleTabComplete

  // Helper to find common prefix of strings
  const findCommonPrefix = (strings: string[]): string => {
    if (strings.length === 0) return ''
    if (strings.length === 1) return strings[0]
    
    let prefix = strings[0]
    for (let i = 1; i < strings.length; i++) {
      while (strings[i].indexOf(prefix) !== 0) {
        prefix = prefix.slice(0, -1)
        if (prefix === '') return ''
      }
    }
    return prefix
  }

  // Connect to terminal
  const connect = useCallback(async () => {
    if (connectionState === 'connected') return

    setConnectionState('connecting')
    setError(null)

    try {
      // Initialize to home directory
      const result = await executeCommand('cd ~ && pwd')
      const homePath = result.output.trim()
      if (homePath.startsWith('/')) {
        absoluteCwdRef.current = homePath
        cwdRef.current = '~'
      }
      
      setConnectionState('connected')
      
      // Write welcome message and first prompt
      if (xtermRef.current) {
        xtermRef.current.clear()
        xtermRef.current.write('\x1b[1;33m  Orgo Terminal\x1b[0m\r\n')
        xtermRef.current.write('\x1b[90m  Connected to your Orgo computer\x1b[0m\r\n')
        xtermRef.current.write(`\r\n\x1b[1;32morgo\x1b[0m:\x1b[1;34m${cwdRef.current}\x1b[0m$ `)
        xtermRef.current.focus()
      }

      onReady?.()
    } catch (err) {
      setConnectionState('error')
      setError(err instanceof Error ? err.message : 'Failed to connect')
    }
  }, [connectionState, updateCwd, writePrompt, onReady])

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

    // Add direct keydown listener to capture Tab before browser handles it
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        event.preventDefault()
        event.stopPropagation()
        if (!isExecutingRef.current && handleTabCompleteRef.current) {
          handleTabCompleteRef.current(term)
        }
      }
    }
    
    // Use capture phase to intercept before other handlers
    terminalRef.current.addEventListener('keydown', handleKeyDown, true)

    // Intercept special keys BEFORE xterm processes them
    term.attachCustomKeyEventHandler((event) => {
      // Only handle keydown events
      if (event.type !== 'keydown') return true
      
      if (isExecutingRef.current) return false
      
      // Tab is handled by the direct event listener above
      if (event.key === 'Tab') {
        return false
      }
      
      // Handle arrow keys directly here
      if (event.key === 'ArrowLeft') {
        if (cursorPosRef.current > 0) {
          cursorPosRef.current--
          term.write('\x1b[D')
        }
        return false
      }
      
      if (event.key === 'ArrowRight') {
        if (cursorPosRef.current < currentLineRef.current.length) {
          cursorPosRef.current++
          term.write('\x1b[C')
        }
        return false
      }
      
      if (event.key === 'ArrowUp') {
        if (historyRef.current.length > 0) {
          if (historyIndexRef.current === -1) {
            historyIndexRef.current = historyRef.current.length - 1
          } else if (historyIndexRef.current > 0) {
            historyIndexRef.current--
          } else {
            return false // Already at oldest
          }
          
          // Clear current line - move to end first, then clear
          const moveRight = currentLineRef.current.length - cursorPosRef.current
          if (moveRight > 0) term.write('\x1b[' + moveRight + 'C')
          term.write('\b \b'.repeat(currentLineRef.current.length))
          
          // Write history item
          currentLineRef.current = historyRef.current[historyIndexRef.current]
          cursorPosRef.current = currentLineRef.current.length
          term.write(currentLineRef.current)
        }
        return false
      }
      
      if (event.key === 'ArrowDown') {
        if (historyIndexRef.current !== -1) {
          // Clear current line - move to end first, then clear
          const moveRight = currentLineRef.current.length - cursorPosRef.current
          if (moveRight > 0) term.write('\x1b[' + moveRight + 'C')
          term.write('\b \b'.repeat(currentLineRef.current.length))
          
          if (historyIndexRef.current < historyRef.current.length - 1) {
            historyIndexRef.current++
            currentLineRef.current = historyRef.current[historyIndexRef.current]
            cursorPosRef.current = currentLineRef.current.length
            term.write(currentLineRef.current)
          } else {
            historyIndexRef.current = -1
            currentLineRef.current = ''
            cursorPosRef.current = 0
          }
        }
        return false
      }
      
      return true // Let xterm handle other keys
    })

    // Handle keyboard input
    term.onKey(({ key, domEvent }) => {
      if (isExecutingRef.current) return

      const printable = !domEvent.altKey && !domEvent.ctrlKey && !domEvent.metaKey

      if (domEvent.keyCode === 13) {
        // Enter - execute command
        const command = currentLineRef.current
        currentLineRef.current = ''
        cursorPosRef.current = 0
        handleCommand(command)
      } else if (domEvent.keyCode === 8) {
        // Backspace
        if (cursorPosRef.current > 0) {
          const line = currentLineRef.current
          const before = line.slice(0, cursorPosRef.current - 1)
          const after = line.slice(cursorPosRef.current)
          currentLineRef.current = before + after
          cursorPosRef.current--
          
          // Move cursor back, rewrite rest of line, clear extra char, move cursor back
          term.write('\b' + after + ' ' + '\b'.repeat(after.length + 1))
        }
      } else if (domEvent.ctrlKey && domEvent.keyCode === 67) {
        // Ctrl+C - cancel
        currentLineRef.current = ''
        cursorPosRef.current = 0
        term.write('^C')
        writePrompt()
      } else if (domEvent.ctrlKey && domEvent.keyCode === 76) {
        // Ctrl+L - clear
        term.write('\x1b[2J\x1b[H')
        writePrompt()
      } else if (printable) {
        // Insert character at cursor position
        const line = currentLineRef.current
        const before = line.slice(0, cursorPosRef.current)
        const after = line.slice(cursorPosRef.current)
        currentLineRef.current = before + key + after
        cursorPosRef.current++
        
        // Write char and rest of line, then move cursor back
        term.write(key + after)
        if (after.length > 0) {
          term.write('\x1b[' + after.length + 'D')
        }
      }
    })

    // Handle paste
    term.onData((data) => {
      // Only handle paste (multi-character input)
      if (data.length > 1 && !isExecutingRef.current) {
        // Filter out control characters
        const filtered = data.replace(/[\x00-\x1F\x7F]/g, '')
        if (filtered) {
          currentLineRef.current += filtered
          term.write(filtered)
        }
      }
    })

    xtermRef.current = term
    fitAddonRef.current = fitAddon

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
    })
    resizeObserver.observe(terminalRef.current)

    // Auto-connect
    setTimeout(() => connect(), 100)

    // Store ref for cleanup
    const terminalElement = terminalRef.current
    
    return () => {
      terminalElement?.removeEventListener('keydown', handleKeyDown, true)
      resizeObserver.disconnect()
      term.dispose()
      xtermRef.current = null
      fitAddonRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Handle fullscreen toggle
  useEffect(() => {
    if (fitAddonRef.current) {
      setTimeout(() => fitAddonRef.current?.fit(), 100)
    }
  }, [isFullscreen])

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
          {connectionState === 'error' && (
            <button
              onClick={connect}
              className="p-1.5 rounded hover:bg-[#32344a] text-[#7aa2f7] transition-colors"
              title="Reconnect"
            >
              <RefreshCw className="w-4 h-4" />
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

export default OrgoTerminal
