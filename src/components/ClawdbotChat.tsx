'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Loader2, Bot, User, AlertCircle, RefreshCw, Sparkles, Zap, Brain, Trash2, Wifi, WifiOff, AlertTriangle, Plus } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'error'
  content: string
  timestamp: Date
}

interface ClawdbotChatProps {
  vmId?: string
  className?: string
  /** VM creation date - VMs before Feb 01 2026 2:00 AM PST don't support WebSocket */
  vmCreatedAt?: Date | string
  /** Callback to migrate/recreate the VM */
  onMigrate?: () => void | Promise<void>
}

interface VMInfo {
  provider: string
  orgoComputerId?: string | null
  createdAt?: string
}

// End marker to detect when clawdbot command completes
const CLAWDBOT_END_MARKER = '___CLAWDBOT_RESPONSE_END___'

// Cutoff date: Feb 01, 2026 2:00 AM PST = Feb 01, 2026 10:00 AM UTC
const WEBSOCKET_SUPPORT_CUTOFF = new Date('2026-02-01T10:00:00Z')

export function ClawdbotChat({ vmId, className = '', vmCreatedAt, onMigrate }: ClawdbotChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isClearing, setIsClearing] = useState(false)
  const [wsConnected, setWsConnected] = useState(false)
  const [vmInfo, setVmInfo] = useState<VMInfo | null>(null)
  const [isMigrating, setIsMigrating] = useState(false)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const hasLoadedRef = useRef(false)
  
  // WebSocket refs for Orgo
  const wsRef = useRef<WebSocket | null>(null)
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const outputBufferRef = useRef<string>('')
  const resolveResponseRef = useRef<((response: string) => void) | null>(null)
  const rejectResponseRef = useRef<((error: Error) => void) | null>(null)

  // Check if VM was created before WebSocket support cutoff
  const vmCreationDate = vmCreatedAt ? new Date(vmCreatedAt) : (vmInfo?.createdAt ? new Date(vmInfo.createdAt) : null)
  const isLegacyVM = vmCreationDate ? vmCreationDate < WEBSOCKET_SUPPORT_CUTOFF : false

  // Generate a stable session ID based on vmId
  const getSessionId = useCallback(() => {
    if (sessionId) return sessionId
    const newSessionId = vmId ? `vm-${vmId}` : `chat-${Date.now()}`
    setSessionId(newSessionId)
    return newSessionId
  }, [vmId, sessionId])

  // Fetch VM info to determine provider
  useEffect(() => {
    if (!vmId) return

    const fetchVMInfo = async () => {
      try {
        const response = await fetch(`/api/vms/${vmId}`)
        if (response.ok) {
          const data = await response.json()
          const vm = data.vm || data
          setVmInfo({
            provider: vm.provider,
            orgoComputerId: vm.orgoComputerId,
            createdAt: vm.createdAt,
          })
        }
      } catch (error) {
        console.error('Failed to fetch VM info:', error)
      }
    }

    fetchVMInfo()
  }, [vmId])

  // Connect to Orgo WebSocket for chat
  const connectWebSocket = useCallback(() => {
    if (!vmInfo?.orgoComputerId || vmInfo.provider !== 'orgo') return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    // WebSocket URL uses the computer ID as subdomain with 'orgo-' prefix
    // Format from docs: wss://orgo-{uuid}.orgo.dev/terminal
    const computerId = vmInfo.orgoComputerId.startsWith('orgo-')
      ? vmInfo.orgoComputerId
      : `orgo-${vmInfo.orgoComputerId}`
    const wsUrl = `wss://${computerId}.orgo.dev/terminal?cols=200&rows=50`
    console.log('[ClawdbotChat] Connecting to WebSocket:', wsUrl)

    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        setWsConnected(true)
        // Start heartbeat
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }))
          }
        }, 30000)
      }

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          
          if (message.type === 'output') {
            outputBufferRef.current += message.data
            
            // Check if we've received the end marker on its own line
            // This avoids false positives from the command echo
            // The marker should appear as: \n___CLAWDBOT_RESPONSE_END___\n or at end of output
            const markerPattern = new RegExp(`(^|\\n)${CLAWDBOT_END_MARKER}(\\r?\\n|$)`)
            const markerMatch = outputBufferRef.current.match(markerPattern)
            
            if (markerMatch && markerMatch.index !== undefined) {
              const fullOutput = outputBufferRef.current
              outputBufferRef.current = ''
              
              // Extract the response (everything before the marker line)
              const markerStart = markerMatch.index + (markerMatch[1]?.length || 0)
              let response = fullOutput.substring(0, markerStart)
              
              // Clean up the response
              response = cleanClawdbotResponse(response)
              
              if (resolveResponseRef.current) {
                resolveResponseRef.current(response)
                resolveResponseRef.current = null
                rejectResponseRef.current = null
              }
            }
          } else if (message.type === 'error') {
            console.error('WebSocket terminal error:', message.message)
            if (rejectResponseRef.current) {
              rejectResponseRef.current(new Error(message.message))
              resolveResponseRef.current = null
              rejectResponseRef.current = null
            }
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err)
        }
      }

      ws.onerror = () => {
        setWsConnected(false)
      }

      ws.onclose = () => {
        setWsConnected(false)
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current)
          pingIntervalRef.current = null
        }
        // Attempt to reconnect after 5 seconds
        setTimeout(() => {
          if (vmInfo?.provider === 'orgo') {
            connectWebSocket()
          }
        }, 5000)
      }

    } catch (err) {
      console.error('Failed to connect WebSocket:', err)
      setWsConnected(false)
    }
  }, [vmInfo])

  // Connect WebSocket when VM info is available for Orgo
  useEffect(() => {
    if (vmInfo?.provider === 'orgo' && vmInfo.orgoComputerId) {
      connectWebSocket()
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current)
        pingIntervalRef.current = null
      }
    }
  }, [vmInfo, connectWebSocket])

  // Clean up clawdbot response
  const cleanClawdbotResponse = (response: string): string => {
    // Remove ALL ANSI escape sequences (not just color codes)
    // This includes: colors (\x1b[...m), cursor movement, bracketed paste mode (\x1b[?2004h/l), etc.
    let cleaned = response
      .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '') // Standard ANSI sequences
      .replace(/\x1b\][^\x07]*\x07/g, '')     // OSC sequences (title, etc.)
      .replace(/\x1b[()][AB012]/g, '')        // Character set sequences
      .replace(/\x1b[=>]/g, '')               // Keypad mode sequences
    
    // Also remove sequences that might appear without the escape char (corrupted output)
    cleaned = cleaned.replace(/\[\?2004[hl]>/g, '') // Bracketed paste mode artifacts
    cleaned = cleaned.replace(/\[\?2004[hl]/g, '')
    
    // Remove carriage returns (terminal artifacts)
    cleaned = cleaned.replace(/\r/g, '')
    
    // Remove the clawdbot command echo and other noise
    const lines = cleaned.split('\n')
    const filteredLines = lines.filter(line => {
      const trimmed = line.trim()
      // Skip command echo lines (the full command we sent)
      if (trimmed.includes('clawdbot agent')) return false
      // Skip source/export lines from bashrc setup
      if (trimmed.startsWith('source ')) return false
      if (trimmed.startsWith('export ')) return false
      // Skip NVM setup lines
      if (trimmed.includes('NVM_DIR')) return false
      if (trimmed.includes('nvm.sh')) return false
      // Skip banner lines
      if (trimmed.startsWith('🦞')) return false
      if (trimmed.includes('Clawdbot 20')) return false
      // Skip empty prompt lines
      if (trimmed === '$' || trimmed.endsWith('$ ') || /^\w+@[\w-]+:.*\$$/.test(trimmed)) return false
      // Skip echo command itself
      if (trimmed.includes('echo "___CLAWDBOT')) return false
      return true
    })
    
    // Find where actual content starts (after empty lines)
    let startIndex = 0
    while (startIndex < filteredLines.length && filteredLines[startIndex].trim() === '') {
      startIndex++
    }
    
    // Find where actual content ends (before trailing empty lines and prompts)
    let endIndex = filteredLines.length - 1
    while (endIndex > startIndex && filteredLines[endIndex].trim() === '') {
      endIndex--
    }
    
    cleaned = filteredLines.slice(startIndex, endIndex + 1).join('\n').trim()
    
    return cleaned || 'The AI responded but the output was empty.'
  }

  // Send message via WebSocket (for Orgo)
  const sendViaWebSocket = useCallback(async (message: string, chatSessionId: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'))
        return
      }

      // Clear buffer and set up response handlers
      outputBufferRef.current = ''
      resolveResponseRef.current = resolve
      rejectResponseRef.current = reject

      // Escape message for shell
      const escapedMessage = message
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/`/g, '\\`')
        .replace(/\$/g, '\\$')

      // Build the clawdbot command with end marker
      const command = `source ~/.bashrc 2>/dev/null; export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; clawdbot agent --local --session-id "${chatSessionId}" --message "${escapedMessage}"; echo "${CLAWDBOT_END_MARKER}"`

      // Send the command
      wsRef.current.send(JSON.stringify({ type: 'input', data: command + '\r' }))

      // Set timeout for response (3 minutes)
      setTimeout(() => {
        if (resolveResponseRef.current === resolve) {
          // Still waiting for this response
          const partialOutput = cleanClawdbotResponse(outputBufferRef.current)
          outputBufferRef.current = ''
          resolveResponseRef.current = null
          rejectResponseRef.current = null
          
          if (partialOutput && partialOutput !== 'No response received') {
            resolve(partialOutput + '\n\n(Response may be incomplete due to timeout)')
          } else {
            reject(new Error('Response timeout - the AI may still be thinking'))
          }
        }
      }, 180000) // 3 minutes
    })
  }, [])

  // Load chat history on mount
  useEffect(() => {
    if (hasLoadedRef.current) return
    hasLoadedRef.current = true

    const loadMessages = async () => {
      try {
        const params = new URLSearchParams()
        if (vmId) {
          params.set('vmId', vmId)
        }
        const currentSessionId = vmId ? `vm-${vmId}` : null
        if (currentSessionId) {
          params.set('sessionId', currentSessionId)
        }

        const response = await fetch(`/api/chat/clawdbot/messages?${params}`)
        if (response.ok) {
          const data = await response.json()
          if (data.messages && data.messages.length > 0) {
            const loadedMessages: Message[] = data.messages.map((msg: any) => ({
              id: msg.id,
              role: msg.role as 'user' | 'assistant' | 'error',
              content: msg.content,
              timestamp: new Date(msg.createdAt),
            }))
            setMessages(loadedMessages)
            if (data.messages[0]?.sessionId) {
              setSessionId(data.messages[0].sessionId)
            }
            
            const lastMessage = loadedMessages[loadedMessages.length - 1]
            if (lastMessage && lastMessage.role === 'user') {
              const timeSinceLastMessage = Date.now() - lastMessage.timestamp.getTime()
              const TWO_MINUTES = 2 * 60 * 1000
              if (timeSinceLastMessage < TWO_MINUTES) {
                setIsLoading(true)
                setTimeout(() => setIsLoading(false), 60000)
              }
            }
          }
        }
      } catch (error) {
        console.error('Failed to load chat history:', error)
      } finally {
        setIsLoadingHistory(false)
      }
    }

    loadMessages()
  }, [vmId])

  // Save a message to the database
  const saveMessage = async (role: string, content: string, currentSessionId: string) => {
    try {
      await fetch('/api/chat/clawdbot/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vmId,
          sessionId: currentSessionId,
          role,
          content,
        }),
      })
    } catch (error) {
      console.error('Failed to save message:', error)
    }
  }

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Focus input on mount
  useEffect(() => {
    if (!isLoadingHistory) {
      inputRef.current?.focus()
    }
  }, [isLoadingHistory])

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return

    const currentSessionId = getSessionId()

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    // Save user message to database
    saveMessage('user', userMessage.content, currentSessionId)

    try {
      let response: string

      // Use WebSocket for Orgo, API for others
      if (vmInfo?.provider === 'orgo' && wsConnected) {
        response = await sendViaWebSocket(userMessage.content, currentSessionId)
      } else {
        // Fall back to API route for non-Orgo or if WebSocket not connected
        const apiResponse = await fetch('/api/chat/clawdbot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: userMessage.content,
            vmId,
            sessionId: currentSessionId,
          }),
        })

        const data = await apiResponse.json()

        if (!apiResponse.ok) {
          throw new Error(data.error || 'Failed to send message')
        }

        if (data.sessionId) {
          setSessionId(data.sessionId)
        }

        response = data.response || 'No response received'
      }

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      }

      setMessages(prev => [...prev, assistantMessage])
      saveMessage('assistant', assistantMessage.content, currentSessionId)

    } catch (error) {
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'error',
        content: error instanceof Error ? error.message : 'An error occurred',
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, errorMessage])
      saveMessage('error', errorMessage.content, currentSessionId)
    } finally {
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const clearChat = async () => {
    if (isClearing) return
    
    setIsClearing(true)
    try {
      const params = new URLSearchParams()
      if (vmId) {
        params.set('vmId', vmId)
      } else if (sessionId) {
        params.set('sessionId', sessionId)
      }
      
      if (params.toString()) {
        await fetch(`/api/chat/clawdbot/messages?${params}`, {
          method: 'DELETE',
        })
      }
      
      setMessages([])
      setSessionId(null)
    } catch (error) {
      console.error('Failed to clear chat:', error)
    } finally {
      setIsClearing(false)
    }
  }

  const suggestions = [
    { text: 'What tasks are in my vault?', icon: Brain },
    { text: 'Check my calendar', icon: Zap },
    { text: 'Summarize my projects', icon: Sparkles },
  ]

  if (isLoadingHistory) {
    return (
      <div className={`flex flex-col h-full items-center justify-center ${className}`}>
        <Loader2 className="w-8 h-8 animate-spin text-sam-accent mb-3" />
        <p className="text-sm text-sam-text-dim">Loading chat history...</p>
      </div>
    )
  }

  // Show migration UI for legacy VMs (Orgo only)
  if (isLegacyVM && vmInfo?.provider === 'orgo') {
    return (
      <div className={`flex flex-col h-full items-center justify-center p-8 text-center ${className}`}>
        <div className="w-16 h-16 rounded-full bg-yellow-500/20 flex items-center justify-center mb-6">
          <AlertTriangle className="w-8 h-8 text-yellow-500" />
        </div>
        
        <h3 className="text-xl font-bold text-sam-text mb-3">
          Chat Has Been Upgraded
        </h3>
        
        <p className="text-sam-text-dim text-sm max-w-md mb-6 leading-relaxed">
          We've upgraded our chat experience.
          To use the new real-time chat with Clawdbot, please move to a new VM.
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
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-sam-accent text-sam-bg font-medium hover:bg-sam-accent-dim transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isMigrating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              {isMigrating ? 'Migrating...' : 'Migrate to New VM'}
            </button>
          )}
          <p className="text-sam-text-dim/60 text-xs">
            This will delete your current VM and create a new one with all features enabled.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Connection status indicator for Orgo */}
      {vmInfo?.provider === 'orgo' && (
        <div className="flex items-center justify-center gap-2 py-1.5 px-3 bg-sam-surface/30 border-b border-sam-border">
          {wsConnected ? (
            <>
              <Wifi className="w-3 h-3 text-green-500" />
              <span className="text-xs text-green-500">Connected</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3 h-3 text-yellow-500" />
              <span className="text-xs text-yellow-500">Connecting...</span>
            </>
          )}
        </div>
      )}

      {/* Messages area */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto min-h-0">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 py-8">
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4 }}
              className="relative mb-6"
            >
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-sam-accent/20 to-purple-500/20 flex items-center justify-center border border-sam-accent/20">
                <Bot className="w-10 h-10 text-sam-accent" />
              </div>
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-green-500 border-2 border-sam-bg"
              />
            </motion.div>

            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.4 }}
              className="text-center max-w-md"
            >
              <h3 className="text-xl font-display font-bold text-sam-text mb-2">
                Chat with Clawdbot
              </h3>
              <p className="text-sam-text-dim text-sm leading-relaxed">
                Your AI assistant is ready. Ask questions, manage tasks, or let Clawdbot help with anything on your VM.
              </p>
            </motion.div>

            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="flex flex-wrap gap-2 justify-center mt-6"
            >
              {suggestions.map((suggestion, index) => (
                <motion.button
                  key={suggestion.text}
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.3 + index * 0.1 }}
                  onClick={() => setInput(suggestion.text)}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-sam-surface/60 border border-sam-border hover:border-sam-accent/50 hover:bg-sam-surface text-sam-text-dim hover:text-sam-text transition-all group"
                >
                  <suggestion.icon className="w-3.5 h-3.5 text-sam-accent group-hover:scale-110 transition-transform" />
                  <span className="text-sm">{suggestion.text}</span>
                </motion.button>
              ))}
            </motion.div>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="h-px flex-1 bg-sam-border" />
              <span className="text-xs text-sam-text-dim px-3 py-1 rounded-full bg-sam-surface/50 border border-sam-border">
                {messages.length} message{messages.length !== 1 ? 's' : ''}
              </span>
              <button
                onClick={clearChat}
                disabled={isClearing}
                className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded-full hover:bg-red-500/10 transition-colors flex items-center gap-1 disabled:opacity-50"
                title="Delete all messages"
              >
                {isClearing ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Trash2 className="w-3 h-3" />
                )}
                Clear
              </button>
              <div className="h-px flex-1 bg-sam-border" />
            </div>

            <AnimatePresence initial={false}>
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    message.role === 'user' 
                      ? 'bg-sam-accent' 
                      : message.role === 'error'
                      ? 'bg-red-500/20 border border-red-500/30'
                      : 'bg-gradient-to-br from-purple-500/30 to-sam-accent/20 border border-purple-500/30'
                  }`}>
                    {message.role === 'user' ? (
                      <User className="w-4 h-4 text-sam-bg" />
                    ) : message.role === 'error' ? (
                      <AlertCircle className="w-4 h-4 text-red-400" />
                    ) : (
                      <Bot className="w-4 h-4 text-purple-300" />
                    )}
                  </div>

                  <div className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                    message.role === 'user'
                      ? 'bg-sam-accent text-sam-bg rounded-tr-md'
                      : message.role === 'error'
                      ? 'bg-red-500/10 border border-red-500/20 text-red-300 rounded-tl-md'
                      : 'bg-sam-surface/80 border border-sam-border text-sam-text rounded-tl-md'
                  }`}>
                    <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{message.content}</p>
                    <p className={`text-[10px] mt-2 ${
                      message.role === 'user' ? 'text-sam-bg/50' : 'text-sam-text-dim'
                    }`}>
                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {isLoading && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-3"
              >
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500/30 to-sam-accent/20 border border-purple-500/30 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-purple-300" />
                </div>
                <div className="bg-sam-surface/80 border border-sam-border rounded-2xl rounded-tl-md px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <motion.div
                          key={i}
                          animate={{ y: [0, -4, 0] }}
                          transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.1 }}
                          className="w-2 h-2 rounded-full bg-sam-accent/60"
                        />
                      ))}
                    </div>
                    <span className="text-sm text-sam-text-dim">Thinking...</span>
                  </div>
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="p-4 bg-gradient-to-t from-sam-bg via-sam-bg to-transparent">
        <div className="flex gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Clawdbot..."
            rows={1}
            className="flex-1 px-4 py-3 h-12 rounded-xl bg-sam-surface/80 border-2 border-sam-border focus:border-sam-accent outline-none resize-none text-sm transition-all placeholder:text-sam-text-dim/50 box-border"
            disabled={isLoading}
          />
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="w-12 h-12 rounded-xl bg-sam-accent text-sam-bg hover:bg-sam-accent-dim disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center shadow-lg shadow-sam-accent/20 flex-shrink-0"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </motion.button>
        </div>
        <p className="text-[11px] text-sam-text-dim/60 mt-2 text-center">
          Press <kbd className="px-1.5 py-0.5 rounded bg-sam-surface/50 border border-sam-border text-[10px] font-mono">Enter</kbd> to send · <kbd className="px-1.5 py-0.5 rounded bg-sam-surface/50 border border-sam-border text-[10px] font-mono">Shift+Enter</kbd> for new line
        </p>
      </div>
    </div>
  )
}
