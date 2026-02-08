'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'
import { motion } from 'framer-motion'
import { Mail, Calendar, MessageSquare, FileText, MessageCircle, Bot, Video, Phone, Loader2, RefreshCw, Check, Key, AlertCircle, ArrowRight, ExternalLink, LogOut, Github, X, Server, GitBranch, Terminal, CheckCircle2, ChevronDown, ChevronUp, Trash2, XCircle, Monitor } from 'lucide-react'
import { WebTerminal } from '@/components/WebTerminal'
import { OrgoTerminal } from '@/components/OrgoTerminal'
import { E2BTerminal } from '@/components/E2BTerminal'
import { ClawdbotChat } from '@/components/ClawdbotChat'
import { OrgoVNCDisplay } from '@/components/OrgoVNCDisplay'

interface Connector {
  id: string
  name: string
  icon: React.ReactNode
  description: string
  autoLiveSync?: boolean
  available: boolean
}

const connectors: Connector[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    icon: <Mail className="w-6 h-6" />,
    description: 'Import project details and track the context of important conversations. (Currently unavailable)',
    autoLiveSync: true,
    available: false,
  },
  {
    id: 'calendar',
    name: 'Google Calendar',
    icon: <Calendar className="w-6 h-6" />,
    description: 'Sync your events so ClawdeBot stays on top of meetings, plans, and deadlines. (Currently unavailable)',
    autoLiveSync: true,
    available: false,
  },
  {
    id: 'github',
    name: 'GitHub',
    icon: <Github className="w-6 h-6" />,
    description: 'Let AI agents complete your unfinished projects autonomously. (Currently unavailable)',
    autoLiveSync: false,
    available: false,
  },
  {
    id: 'slack',
    name: 'Slack',
    icon: <MessageSquare className="w-6 h-6" />,
    description: 'Extract key insights and memories from your team channels and DMs.',
    autoLiveSync: true,
    available: false,
  },
  {
    id: 'notion',
    name: 'Notion',
    icon: <FileText className="w-6 h-6" />,
    description: 'Sync your workspace pages, project roadmaps, and structured knowledge.',
    autoLiveSync: true,
    available: false,
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    icon: <Bot className="w-6 h-6" />,
    description: 'Capture your brainstorming sessions, creative ideas, and problem-solving history.',
    autoLiveSync: false,
    available: false,
  },
  {
    id: 'claude',
    name: 'Claude',
    icon: <MessageCircle className="w-6 h-6" />,
    description: 'Preserve your Claude in-depth discussions, research analysis, and writing drafts.',
    autoLiveSync: false,
    available: false,
  },
  {
    id: 'granola',
    name: 'Granola',
    icon: <Video className="w-6 h-6" />,
    description: 'Upload meeting notes to turn transcripts into memories.',
    autoLiveSync: false,
    available: false,
  },
  {
    id: 'fireflies',
    name: 'Fireflies',
    icon: <Video className="w-6 h-6" />,
    description: 'Turn meeting transcripts, summaries, and action items into memories.',
    autoLiveSync: true,
    available: false,
  },
  {
    id: 'fathom',
    name: 'Fathom',
    icon: <Phone className="w-6 h-6" />,
    description: 'Turn meeting transcripts, summaries, and action items into memories.',
    autoLiveSync: true,
    available: false,
  },
]

interface SetupStatus {
  status: string
  vmCreated: boolean
  clawdbotInstalled?: boolean
  telegramConfigured?: boolean
  gatewayStarted?: boolean
  // Orgo-specific
  orgoComputerId?: string
  orgoComputerUrl?: string
  // AWS-specific
  awsInstanceId?: string
  awsInstanceName?: string
  awsPublicIp?: string
  awsRegion?: string
  // E2B-specific
  e2bSandboxId?: string
  e2bTemplateId?: string
  e2bTimeout?: number
  isE2B?: boolean
  // Common
  errorMessage?: string
  vmProvider?: string
  // Stored API key status
  hasAnthropicApiKey?: boolean
}

interface VMInfo {
  id: string
  name: string
  provider: string
  status: string
  orgoProjectId?: string
  orgoProjectName?: string
  orgoComputerId?: string
  orgoComputerUrl?: string
  awsInstanceId?: string
  awsInstanceType?: string
  awsRegion?: string
  awsPublicIp?: string
  e2bSandboxId?: string
  e2bTemplateId?: string
  e2bTimeout?: number
  createdAt?: string
}

// Memory density weights for each source (out of 100 total)
// Weights are balanced so connecting all available sources approaches 100%
// The three core sources (Gmail, Calendar, GitHub) total 50% to leave room for other sources
const SOURCE_WEIGHTS: Record<string, number> = {
  gmail: 25,      // Email has the most context
  calendar: 15,   // Scheduling context is important
  github: 15,     // Project context
  slack: 12,      // Team communication
  notion: 12,     // Structured knowledge
  chatgpt: 8,     // Brainstorming history
  claude: 8,      // Research and ideas
  granola: 3,     // Meeting notes
  fireflies: 2,   // Meeting transcripts
  fathom: 0,      // Calls (not yet weighted)
}

interface MemoryDensity {
  percentage: number
  label: string
  color: string
  bgColor: string
  sufficient: boolean
}

function calculateMemoryDensity(connectedSources: Set<string>): MemoryDensity {
  let total = 0
  connectedSources.forEach(source => {
    total += SOURCE_WEIGHTS[source] || 0
  })

  const percentage = Math.min(total, 100)

  if (percentage === 0) {
    return { percentage: 0, label: 'Empty', color: 'text-sam-text-dim', bgColor: 'bg-sam-text-dim', sufficient: false }
  } else if (percentage < 25) {
    return { percentage, label: 'Low — connect more sources', color: 'text-orange-400', bgColor: 'bg-orange-400', sufficient: false }
  } else if (percentage < 50) {
    return { percentage, label: 'Basic context', color: 'text-yellow-400', bgColor: 'bg-yellow-400', sufficient: true }
  } else if (percentage < 75) {
    return { percentage, label: 'Good context', color: 'text-green-400', bgColor: 'bg-green-400', sufficient: true }
  } else {
    return { percentage, label: 'Rich context', color: 'text-emerald-400', bgColor: 'bg-emerald-400', sufficient: true }
  }
}

// Human-like context phrases for each source
const SOURCE_PHRASES: Record<string, string> = {
  gmail: 'your conversations and who matters to you',
  calendar: 'your schedule and commitments',
  github: 'the projects you\'re working on',
  slack: 'your team discussions',
  notion: 'your notes and documents',
  chatgpt: 'your brainstorming history',
  claude: 'your research and ideas',
  granola: 'your meeting notes',
  fireflies: 'your meeting transcripts',
  fathom: 'your calls',
}

function generateContextMessage(connectedSources: Set<string>): string {
  const sources = Array.from(connectedSources).filter(s => SOURCE_PHRASES[s])

  if (sources.length === 0) {
    return ''
  }

  const phrases = sources.map(s => SOURCE_PHRASES[s])

  let combined: string
  if (phrases.length === 1) {
    combined = phrases[0]
  } else if (phrases.length === 2) {
    combined = `${phrases[0]} and ${phrases[1]}`
  } else {
    combined = `${phrases.slice(0, -1).join(', ')}, and ${phrases[phrases.length - 1]}`
  }

  return `Now I understand ${combined}.`
}

function LearningSourcesContent() {
  const { data: session } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [refreshKey, setRefreshKey] = useState(0)
  const [llmApiKey, setLlmApiKey] = useState('')
  const [telegramBotToken, setTelegramBotToken] = useState('')
  const [telegramUserId, setTelegramUserId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Stored LLM API key management
  const [hasStoredApiKey, setHasStoredApiKey] = useState(false)
  const [storedApiKeyMasked, setStoredApiKeyMasked] = useState<string | null>(null)
  const [storedLlmProvider, setStoredLlmProvider] = useState<string | null>(null)
  const [isEditingApiKey, setIsEditingApiKey] = useState(false)
  const [isDeletingApiKey, setIsDeletingApiKey] = useState(false)
  const [isSavingApiKey, setIsSavingApiKey] = useState(false)
  const [setupError, setSetupError] = useState<string | null>(null)
  const [showSetupProgress, setShowSetupProgress] = useState(false)
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null)
  const [setupLogs, setSetupLogs] = useState<Array<{ time: Date; message: string; type: 'info' | 'success' | 'error' }>>([])
  const [isLoadingStatus, setIsLoadingStatus] = useState(true) // Track if we're still loading initial status
  const [isCheckingRedirect, setIsCheckingRedirect] = useState(true) // Track if we're checking for redirect
  const [connectedSources, setConnectedSources] = useState<Set<string>>(new Set())
  const [currentVM, setCurrentVM] = useState<VMInfo | null>(null)
  const [allVMs, setAllVMs] = useState<VMInfo[]>([])

  // Get vmId from URL params
  const vmId = searchParams?.get('vmId')

  // Fetch VMs and set current VM
  const fetchVMs = useCallback(async () => {
    try {
      const response = await fetch('/api/vms')
      if (response.ok) {
        const data = await response.json()
        setAllVMs(data.vms || [])

        // If vmId is provided, find that VM
        if (vmId && data.vms) {
          const vm = data.vms.find((v: VMInfo) => v.id === vmId)
          if (vm) {
            setCurrentVM(vm)
          }
        } else if (data.vms && data.vms.length > 0) {
          // Default to first VM if no vmId specified
          setCurrentVM(data.vms[0])
        }
      }
    } catch (error) {
    }
  }, [vmId])

  useEffect(() => {
    fetchVMs()
  }, [fetchVMs])

  // Fetch integration status for memory density
  const fetchIntegrationStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/integrations/status')
      if (response.ok) {
        const data = await response.json()
        const connected = new Set<string>()
        if (data.status) {
          Object.entries(data.status).forEach(([key, value]: [string, any]) => {
            // Include both connected and pending sources (pending means they're set up but waiting for VM)
            if (value?.connected || value?.pending) {
              connected.add(key)
            }
          })
        }
        setConnectedSources(connected)
      }
    } catch (error) {
    }
  }, [])

  useEffect(() => {
    fetchIntegrationStatus()
  }, [fetchIntegrationStatus, refreshKey])

  // Fetch stored API key status on mount (both Anthropic and Kimi)
  const fetchStoredApiKey = useCallback(async () => {
    try {
      const response = await fetch('/api/setup/model-config')
      if (response.ok) {
        const data = await response.json()
        // Unified LLM key
        setHasStoredApiKey(data.hasApiKey || false)
        setStoredApiKeyMasked(data.maskedKey || null)
        setStoredLlmProvider(data.provider || null)
        // If user has a stored key and isn't editing, don't show the input
        if (data.hasApiKey && !isEditingApiKey) {
          setLlmApiKey('') // Clear any manual input
        }
      }
    } catch (error) {
      // Silently fail - user can still enter key manually
    }
  }, [isEditingApiKey])

  useEffect(() => {
    fetchStoredApiKey()
  }, [fetchStoredApiKey])

  // Handle saving a new API key
  const handleSaveApiKey = async () => {
    if (!llmApiKey.trim()) return

    setIsSavingApiKey(true)
    try {
      const response = await fetch('/api/setup/model-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: llmApiKey.trim() }),
      })

      if (response.ok) {
        const data = await response.json()
        setHasStoredApiKey(true)
        setStoredApiKeyMasked(data.maskedKey)
        setIsEditingApiKey(false)
        // Keep the key in state for the current setup session
      } else {
        const error = await response.json()
        setSetupError(error.error || 'Failed to save API key')
      }
    } catch (error) {
      setSetupError('Failed to save API key')
    } finally {
      setIsSavingApiKey(false)
    }
  }

  // Handle deleting the stored API key
  const handleDeleteApiKey = async () => {
    setIsDeletingApiKey(true)
    try {
      const response = await fetch('/api/setup/anthropic-key', {
        method: 'DELETE',
      })

      if (response.ok) {
        setHasStoredApiKey(false)
        setStoredApiKeyMasked(null)
        setLlmApiKey('')
        setIsEditingApiKey(false)
      } else {
        const error = await response.json()
        setSetupError(error.error || 'Failed to delete API key')
      }
    } catch (error) {
      setSetupError('Failed to delete API key')
    } finally {
      setIsDeletingApiKey(false)
    }
  }

  useEffect(() => {
    // Handle OAuth callback parameters
    const gmailConnected = searchParams?.get('gmail_connected')
    const calendarConnected = searchParams?.get('calendar_connected')
    const error = searchParams?.get('error')

    if (gmailConnected === 'true') {
      // Show success message (could use a toast library here)
      // Trigger refresh of connector cards
      setRefreshKey(prev => prev + 1)
    }

    if (calendarConnected === 'true') {
      // Show success message (could use a toast library here)
      // Trigger refresh of connector cards
      setRefreshKey(prev => prev + 1)
    }

    if (error) {
      // Show error message
    }
  }, [searchParams])

  const addLog = useCallback((type: 'info' | 'success' | 'error', message: string) => {
    setSetupLogs(prev => [...prev, { time: new Date(), message, type }])
  }, [])

  // Check initial setup status on mount and periodically
  useEffect(() => {
    const checkInitialStatus = async () => {
      try {
        const statusUrl = vmId ? `/api/setup/status?vmId=${vmId}` : '/api/setup/status'
        const res = await fetch(statusUrl)
        if (res.ok) {
          const status: SetupStatus = await res.json()
          setSetupStatus(prevStatus => {
            // Handle state transitions
            if (status.status === 'ready' && prevStatus?.status !== 'ready') {
              // Just became ready
              setShowSetupProgress(false)
            } else if (status.status === 'pending' && prevStatus?.status === 'ready') {
              // Computer was deleted/reset - hide progress and show API key form
              setShowSetupProgress(false)
              setSetupLogs([])
            } else if (status.status === 'running' && status.vmCreated && !status.clawdbotInstalled) {
              // VM is provisioned but setup hasn't started - show API key form
              setShowSetupProgress(false)
            } else if (status.status && status.status !== 'pending' && status.status !== 'ready' && status.status !== 'failed' && status.status !== 'running') {
              // Setup in progress (provisioning, configuring_vm)
              setShowSetupProgress(true)
              if (!prevStatus || prevStatus.status === 'pending') {
                addLog('info', `Setup status: ${status.status}`)
              }
            } else if (status.status === 'ready') {
              // Already ready - ensure we don't show progress
              setShowSetupProgress(false)
            } else if (status.status === 'failed') {
              addLog('error', status.errorMessage || 'Setup failed')
            }
            return status
          })
        }
      } catch (e) {
      }
    }
    // Run immediately on mount
    checkInitialStatus()

    // Check periodically to detect if computer was deleted from Orgo
    const interval = setInterval(checkInitialStatus, 5000) // Check every 5 seconds

    return () => clearInterval(interval)
  }, [addLog])

  // Check status immediately on mount to avoid flash of wrong content
  useEffect(() => {
    const checkStatusImmediately = async () => {
      try {
        // First check if user has any VMs
        const vmsRes = await fetch('/api/vms')
        if (vmsRes.ok) {
          const vmsData = await vmsRes.json()

          // Redirect to select-vm if user has no VMs
          if (!vmsData.vms || vmsData.vms.length === 0) {
            router.push('/select-vm')
            return // Don't set loading states, just redirect
          }

          // Update VM state
          setAllVMs(vmsData.vms)
          if (vmId) {
            const vm = vmsData.vms.find((v: VMInfo) => v.id === vmId)
            if (vm) {
              setCurrentVM(vm)
            } else {
              // If vmId not found, use first VM
              setCurrentVM(vmsData.vms[0])
            }
          } else {
            setCurrentVM(vmsData.vms[0])
          }
        }

        const statusUrl = vmId ? `/api/setup/status?vmId=${vmId}` : '/api/setup/status'
        const res = await fetch(statusUrl)
        if (res.ok) {
          const status: SetupStatus = await res.json()
          setSetupStatus(status)

          // Only set loading states if we're not redirecting
          setIsLoadingStatus(false)
          setIsCheckingRedirect(false)

          // Set UI state based on status
          // Check if VM is ready - works for all providers (Orgo, AWS, E2B)
          const isVMReady = status.status === 'ready' && (
            status.orgoComputerId ||  // Orgo
            status.awsInstanceId ||   // AWS
            status.e2bSandboxId ||    // E2B
            status.isE2B ||           // E2B fallback
            status.vmCreated          // Generic check
          )

          // Check if VM is provisioned but setup hasn't completed
          // This happens when VM was created with provisionNow=true but user hasn't provided Claude API key yet
          const isWaitingForSetup = status.status === 'running' && status.vmCreated && !status.clawdbotInstalled

          if (isVMReady) {
            setShowSetupProgress(false)
          } else if (isWaitingForSetup) {
            // VM is provisioned but setup hasn't started - show API key form
            setShowSetupProgress(false)
          } else if (status.status && status.status !== 'pending' && status.status !== 'ready' && status.status !== 'failed' && status.status !== 'running') {
            // Only show progress for actual setup statuses: provisioning, creating_repo, configuring_vm
            setShowSetupProgress(true)
          } else {
            setShowSetupProgress(false)
          }
        } else {
          setIsLoadingStatus(false)
          setIsCheckingRedirect(false)
        }
      } catch (e) {
        setIsLoadingStatus(false)
        setIsCheckingRedirect(false)
      }
    }
    checkStatusImmediately()
  }, [router, vmId])

  // Poll setup status when progress is shown
  useEffect(() => {
    if (!showSetupProgress) return

    let shouldStop = false

    const pollStatus = async () => {
      if (shouldStop) return

      try {
        const statusUrl = vmId ? `/api/setup/status?vmId=${vmId}` : '/api/setup/status'
        const res = await fetch(statusUrl)
        if (res.ok) {
          const status: SetupStatus = await res.json()

          setSetupStatus(prevStatus => {
            // Add logs for status changes
            if (prevStatus) {
              if (status.status !== prevStatus.status) {
                addLog('info', `Status changed: ${prevStatus.status} → ${status.status}`)
              }
              if (status.vmCreated && !prevStatus.vmCreated) {
                addLog('success', 'VM created successfully')
              }
              if (status.clawdbotInstalled && !prevStatus.clawdbotInstalled) {
                addLog('success', 'Clawdbot installed')
              }
              if (status.telegramConfigured && !prevStatus.telegramConfigured) {
                addLog('success', 'Telegram configured')
              }
            }

            // Check for completion or failure
            if (status.status === 'ready') {
              addLog('success', 'Setup completed successfully!')
              shouldStop = true
            } else if (status.status === 'failed') {
              addLog('error', status.errorMessage || 'Setup failed')
              shouldStop = true
            }

            return status
          })
        }
      } catch (e) {
        addLog('error', 'Failed to check setup status')
      }
    }

    // Poll every 2 seconds
    const interval = setInterval(() => {
      if (!shouldStop) {
        pollStatus()
      }
    }, 2000)
    pollStatus() // Initial call

    return () => {
      shouldStop = true
      clearInterval(interval)
    }
  }, [showSetupProgress, addLog])

  const handleStartSetup = async () => {
    // Check if we have an LLM API key
    const hasLlmKey = llmApiKey.trim() || hasStoredApiKey

    if (!hasLlmKey) {
      setSetupError('Anthropic API key is required for Claude model')
      return
    }
    if (!hasLlmKey) {
      setSetupError('Moonshot API key is required for Kimi model')
      return
    }

    setIsSubmitting(true)
    setSetupError(null)
    setSetupLogs([])

    try {
      const res = await fetch('/api/setup/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Send the new keys if provided, otherwise signal to use stored keys
          llmApiKey: llmApiKey.trim() || undefined,
          useStoredApiKey: !llmApiKey.trim() && hasStoredApiKey,
          telegramBotToken: telegramBotToken.trim() || undefined,
          telegramUserId: telegramUserId.trim() || undefined,
          vmId, // Pass vmId so the backend updates the correct VM
        })
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to start setup')
      }

      // Show progress view
      setShowSetupProgress(true)
      addLog('info', 'Setup process started...')
      addLog('info', 'Creating VM...')

      // Clear the input
      setLlmApiKey('')
    } catch (e) {
      setSetupError(e instanceof Error ? e.message : 'Something went wrong')
      addLog('error', e instanceof Error ? e.message : 'Failed to start setup')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Show loading state while checking if redirect is needed
  if (isCheckingRedirect) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sam-bg">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-2 border-sam-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-sam-text-dim font-mono text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-sam-bg">
      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Top Bar with Logout */}
        <div className="flex items-center justify-between mb-8">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="flex items-center gap-4"
          >
            <img
              src="/logos/ClawdBody.png"
              alt="ClawdBody"
              className="h-16 md:h-20 object-contain"
            />
            {session?.user?.name && (
              <span className="text-xl md:text-2xl font-medium text-sam-text">
                Hi {session.user.name.split(' ')[0]}!
              </span>
            )}
          </motion.div>
          <div className="flex items-center gap-3">
            {/* VM Selector - simple text showing current VM */}
            {allVMs.length > 0 && currentVM && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6 }}
                className="flex items-center gap-2 px-3 py-2 text-sm text-sam-text-dim"
              >
                <span className="text-sam-text font-medium">{currentVM.name}</span>
                <span className="text-sam-text-dim">({currentVM.provider})</span>
              </motion.div>
            )}
            <Link href="/select-vm" prefetch={true}>
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.05 }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-sam-border hover:border-sam-accent/50 text-sam-text-dim hover:text-sam-accent transition-all cursor-pointer"
              >
                <Monitor className="w-4 h-4" />
                <span className="text-sm font-mono">Manage VMs</span>
              </motion.div>
            </Link>
            <motion.button
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              onClick={() => signOut({ callbackUrl: '/' })}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-sam-border hover:border-sam-error/50 text-sam-text-dim hover:text-sam-error transition-all"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm font-mono">Sign out</span>
            </motion.button>
          </div>
        </div>

        {/* Setup Progress or API Keys Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mb-12"
        >
          {/* Orgo-specific notice - always shown */}
          {/* {(setupStatus?.vmProvider === 'orgo' || currentVM?.provider === 'orgo') && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-6 p-6 rounded-2xl border border-orange-400/50 bg-orange-400/5 backdrop-blur"
            >
              <p className="text-sm text-orange-300 font-body leading-relaxed">
                There are currently some issues provisioning Orgo VMs. For now, please use a{' '}
                <Link href="/select-vm" className="text-orange-200 hover:text-orange-100 underline font-medium">
                  different service provider
                </Link>
                .
              </p>
            </motion.div>
          )} */}

          {isLoadingStatus ? (
            <div className="p-8 rounded-2xl border border-sam-border bg-sam-surface/50 backdrop-blur flex items-center justify-center min-h-[200px]">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-sam-accent" />
                <p className="text-sm text-sam-text-dim font-mono">Loading setup status...</p>
              </div>
            </div>
          ) : showSetupProgress ? (
            <>
              <SetupProgressView
                setupStatus={setupStatus}
                logs={setupLogs}
                vmId={vmId}
                onReset={() => {
                  setShowSetupProgress(false)
                  setSetupStatus(null)
                  setSetupLogs([])
                }}
              />
            </>
          ) : setupStatus?.status === 'ready' && (setupStatus?.orgoComputerId || setupStatus?.awsInstanceId || setupStatus?.e2bSandboxId || setupStatus?.isE2B || setupStatus?.vmCreated) ? (
            <ComputerConnectedView
              setupStatus={setupStatus}
              vmId={vmId}
              currentVM={currentVM}
              onStatusUpdate={async () => {
                // Refresh status
                const statusUrl = vmId ? `/api/setup/status?vmId=${vmId}` : '/api/setup/status'
                const res = await fetch(statusUrl)
                if (res.ok) {
                  const newStatus = await res.json()
                  setSetupStatus(newStatus)
                }
              }}
              onDelete={async () => {
                try {
                  // If vmId is available, use the VM deletion endpoint (which deletes the cloud resource)
                  if (vmId) {
                    const res = await fetch(`/api/vms/${vmId}`, {
                      method: 'DELETE',
                    })
                    if (res.ok) {
                      // Redirect to select-vm page after successful deletion
                      router.push('/select-vm')
                      return
                    } else {
                      const error = await res.json()
                      alert(`Failed to delete VM: ${error.error || 'Unknown error'}`)
                      return
                    }
                  }

                  // Fallback to old delete-computer endpoint for backward compatibility
                  const res = await fetch('/api/setup/delete-computer', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ vmId }),
                  })
                  if (res.ok) {
                    // Status will be updated by the periodic check
                    setSetupStatus(null)
                    setIsLoadingStatus(true) // Re-check status
                  } else {
                    const error = await res.json()
                    alert(`Failed to delete computer: ${error.error || 'Unknown error'}`)
                  }
                } catch (error) {
                  alert('Failed to delete computer. Please try again.')
                }
              }}
            />
          ) : (
            <>
              <h1 className="text-4xl md:text-5xl font-display font-bold mb-4 text-sam-text leading-tight">Setup VM</h1>
              <div className="p-8 rounded-2xl border border-sam-border bg-sam-surface/50 backdrop-blur">
                {/* Show notice if VM is already provisioned */}
                {setupStatus?.vmCreated && setupStatus?.status === 'running' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mb-6 p-4 rounded-lg bg-green-500/10 border border-green-500/30 flex items-start gap-3"
                  >
                    <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-green-400 font-medium">VM is ready!</p>
                      <p className="text-green-400/80 text-sm mt-1">
                        Your VM has been provisioned. Enter your API key below to complete the setup.
                      </p>
                    </div>
                  </motion.div>
                )}

                <h2 className="text-2xl font-display font-bold mb-2">Enter your API Keys</h2>
                <p className="text-sm text-sam-text-dim mb-4">Choose your AI model and enter the corresponding API key.</p>

                {setupError && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mb-6 p-4 rounded-lg bg-sam-error/10 border border-sam-error/30 flex items-start gap-3"
                  >
                    <AlertCircle className="w-5 h-5 text-sam-error flex-shrink-0 mt-0.5" />
                    <p className="text-sam-error text-sm">{setupError}</p>
                  </motion.div>
                )}

                <div className="space-y-6">
                  {/* Model Selection Tabs */}
                  {/* LLM API Key Section */}
                  <div className="p-4 rounded-lg border border-sam-border bg-sam-bg/50">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-sam-text">LLM API Key <span className="text-sam-error">*</span></label>
                      {hasStoredApiKey && <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> {storedLlmProvider ? `${storedLlmProvider} configured` : 'Configured'}</span>}
                    </div>
                    <p className="text-xs text-sam-text-dim mb-3">Paste your API key from any supported provider. We&apos;ll auto-detect which one it is.</p>

                    {hasStoredApiKey && !isEditingApiKey ? (
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-sam-accent/10 border border-sam-accent/30">
                        <Key className="w-5 h-5 text-sam-accent flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sam-text font-mono text-sm truncate">
                            {storedApiKeyMasked || 'API key stored'}
                          </p>
                          <p className="text-xs text-sam-text-dim mt-0.5">
                            Your key is securely stored and will be reused across VMs
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => setIsEditingApiKey(true)} className="px-3 py-1.5 text-xs font-mono text-sam-text-dim hover:text-sam-text border border-sam-border hover:border-sam-accent/50 rounded-lg transition-colors">
                            Edit
                          </button>
                          <button type="button" onClick={handleDeleteApiKey} disabled={isDeletingApiKey} className="px-3 py-1.5 text-xs font-mono text-sam-error/70 hover:text-sam-error border border-sam-error/30 hover:border-sam-error/50 rounded-lg transition-colors disabled:opacity-50">
                            {isDeletingApiKey ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <input
                          type="password"
                          value={llmApiKey}
                          onChange={(e) => setLlmApiKey(e.target.value)}
                          placeholder="Paste your API key..."
                          className="w-full px-4 py-3 rounded-lg bg-sam-bg border border-sam-border focus:border-sam-accent outline-none font-mono text-sm transition-colors"
                        />
                        {isEditingApiKey && (
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={handleSaveApiKey} disabled={isSavingApiKey || !llmApiKey.trim()} className="px-4 py-2 text-xs font-mono bg-sam-accent text-sam-bg rounded-lg hover:bg-sam-accent-dim disabled:opacity-50 transition-colors flex items-center gap-2">
                              {isSavingApiKey ? <><Loader2 className="w-3 h-3 animate-spin" />Saving...</> : <><Check className="w-3 h-3" />Save Key</>}
                            </button>
                            <button type="button" onClick={() => { setIsEditingApiKey(false); setLlmApiKey('') }} className="px-4 py-2 text-xs font-mono text-sam-text-dim hover:text-sam-text border border-sam-border hover:border-sam-accent/50 rounded-lg transition-colors">Cancel</button>
                          </div>
                        )}
                        <p className="text-xs text-sam-text-dim">
                          Supports: OpenRouter, Anthropic, OpenAI, Google, Groq, xAI, Perplexity, Fireworks, Cohere
                        </p>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-mono text-sam-text-dim mb-2">
                      Telegram Bot Token <span className="text-sam-error">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="password"
                        value={telegramBotToken}
                        onChange={(e) => setTelegramBotToken(e.target.value)}
                        placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
                        className="w-full px-4 py-3 rounded-lg bg-sam-bg border border-sam-border focus:border-sam-accent outline-none font-mono text-sm transition-colors"
                      />
                    </div>
                    <p className="mt-2 text-xs text-sam-text-dim">
                      Get your bot token from <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-sam-accent hover:underline">@BotFather</a> on Telegram
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-mono text-sam-text-dim mb-2">
                      Telegram User ID <span className="text-sam-error">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={telegramUserId}
                        onChange={(e) => setTelegramUserId(e.target.value)}
                        placeholder="123456789"
                        className="w-full px-4 py-3 rounded-lg bg-sam-bg border border-sam-border focus:border-sam-accent outline-none font-mono text-sm transition-colors"
                      />
                    </div>
                    <p className="mt-2 text-xs text-sam-text-dim">
                      Your Telegram user ID. Get it from <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" className="text-sam-accent hover:underline">@userinfobot</a>
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleStartSetup}
                  disabled={isSubmitting || (!llmApiKey.trim() && !hasStoredApiKey) || !telegramBotToken.trim() || !telegramUserId.trim()}
                  className="mt-8 w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-sam-accent text-sam-bg font-display font-semibold hover:bg-sam-accent-dim disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Starting setup...
                    </>
                  ) : (
                    <>
                      Begin Setup
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </motion.div>

        {/* Development Notice */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <div className="p-6 rounded-2xl border border-yellow-500/30 bg-yellow-500/5 backdrop-blur flex items-center gap-4">
            <img
              src="/logos/ClawdBodySorry.png"
              alt="ClawdBody"
              className="w-16 h-16 md:w-20 md:h-20 object-contain flex-shrink-0"
            />
            <div className="flex-1">
              <h3 className="text-base font-display font-semibold text-sam-text mb-2">Feedback</h3>
              <p className="text-sam-text text-sm leading-relaxed">
                Clawdbody is still actively in development and might be rough around the edges.
                If you face any issues, please{' '}
                <a
                  href="https://github.com/Prakshal-Jain/ClawdBody/issues/new"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sam-accent hover:underline font-medium inline-flex items-center gap-1"
                >
                  report them here
                  <ExternalLink className="w-3 h-3" />
                </a>
                .
              </p>
            </div>
          </div>
        </motion.div>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mb-12"
        >
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-4 text-sam-text leading-tight">
            Connect your sources
          </h1>
          <p className="text-lg text-sam-text-dim max-w-3xl font-body leading-relaxed">
            Your context lives securely in your private GitHub repository. This is shared across VMs to infer and execute tasks.
          </p>
        </motion.div>

        {/* Connectors Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12"
        >
          {connectors.map((connector, index) => (
            <ConnectorCard
              key={`${connector.id}-${refreshKey}`}
              connector={connector}
              index={index}
              onConnect={() => fetchIntegrationStatus()}
            />
          ))}
        </motion.div>

        {/* Footer Info */}
        {(() => {
          const density = calculateMemoryDensity(connectedSources)
          const contextMessage = generateContextMessage(connectedSources)
          return (
            <>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.4 }}
                className={`flex flex-col md:flex-row items-center justify-between gap-6 p-6 rounded-2xl border bg-sam-surface/30 ${!density.sufficient && density.percentage > 0
                  ? 'border-orange-400/50'
                  : 'border-sam-border'
                  }`}
              >
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-sm font-mono text-sam-text-dim mb-1">Memory Density</p>
                    <div className="flex items-center gap-3">
                      <div className="w-40 h-2.5 bg-sam-surface rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${density.percentage}%` }}
                          transition={{ duration: 0.5, ease: 'easeOut' }}
                          className={`h-full rounded-full ${density.bgColor}`}
                        />
                      </div>
                      <span className={`text-sm font-mono ${density.color}`}>
                        {density.percentage}%
                      </span>
                    </div>
                    <p className={`text-xs mt-1 ${density.color}`}>
                      {density.label}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-2 max-w-md text-center md:text-right">
                  <p className="text-sm text-sam-text-dim font-body">
                    {!density.sufficient ? (
                      <span className="text-orange-400">
                        Connect at least Gmail or Calendar to proceed.
                      </span>
                    ) : contextMessage ? (
                      <span className="text-sam-text">{contextMessage}</span>
                    ) : (
                      'Your data stays encrypted and private.'
                    )}
                  </p>
                </div>
              </motion.div>
              {/* Privacy Notice */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.5 }}
                className="mt-6 text-center"
              >
                <p className="text-xs text-sam-text-dim/80 font-body leading-relaxed max-w-3xl mx-auto">
                  <span className="font-semibold text-sam-text-dim">Privacy:</span> We don't store your data on our servers or in the cloud. All your data belongs to you and is stored in your private GitHub repository, synced to your VM. Your memories, tasks, and context remain completely private and under your control.
                </p>
              </motion.div>
            </>
          )
        })()}
      </div>
    </div>
  )
}

function ConnectorCard({ connector, index, onConnect }: { connector: Connector; index: number; onConnect?: () => void }) {
  const [isConnecting, setIsConnecting] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isSynced, setIsSynced] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null)
  const [showGithubDialog, setShowGithubDialog] = useState(false)
  const [githubRepos, setGithubRepos] = useState<Array<{ id: number; full_name: string; name: string; private: boolean }>>([])
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set())
  const [isLoadingRepos, setIsLoadingRepos] = useState(false)

  // Check connection status on mount
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await fetch('/api/integrations/status')
        if (response.ok) {
          const data = await response.json()
          const status = data.status?.[connector.id]
          if (status?.connected || status?.pending) {
            setIsConnected(true)
            if (status.email) {
              setConnectedEmail(status.email)
            } else if (connector.id === 'github' && status.repositoryCount) {
              const pendingText = status.pending ? ' (pending VM setup)' : ''
              setConnectedEmail(`${status.repositoryCount} repository(ies)${pendingText}`)
            }
          }
        }
      } catch (error) {
      }
    }

    checkStatus()
  }, [connector.id])

  const handleConnect = async () => {
    if (isConnecting || isConnected) return

    // For GitHub, show dialog with repository selection
    if (connector.id === 'github') {
      setIsLoadingRepos(true)
      setShowGithubDialog(true)

      try {
        const response = await fetch(`/api/integrations/${connector.id}/connect`, {
          method: 'GET',
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to fetch repositories')
        }

        const data = await response.json()
        setGithubRepos(data.repositories || [])
      } catch (error) {
        alert(`Failed to fetch repositories. Please try again.`)
        setShowGithubDialog(false)
      } finally {
        setIsLoadingRepos(false)
      }
      return
    }

    // For other connectors, use existing OAuth flow
    setIsConnecting(true)
    try {
      const response = await fetch(`/api/integrations/${connector.id}/connect`, {
        method: 'POST',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to connect')
      }

      const data = await response.json()

      // If OAuth URL is returned, redirect to it
      if (data.authUrl) {
        window.location.href = data.authUrl
        return
      }

      // Otherwise, connection was successful
      setIsConnected(true)
      if (data.email) {
        setConnectedEmail(data.email)
      }
      onConnect?.()
    } catch (error) {
      alert(`Failed to connect ${connector.name}. Please try again.`)
      setIsConnecting(false)
    }
  }

  const handleGithubConnect = async () => {
    if (selectedRepos.size === 0) {
      alert('Please select at least one repository')
      return
    }

    setIsConnecting(true)
    try {
      const response = await fetch(`/api/integrations/github/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedRepos: Array.from(selectedRepos) }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to connect repositories')
      }

      const data = await response.json()

      setIsConnected(true)
      setShowGithubDialog(false)
      setSelectedRepos(new Set())
      onConnect?.()

      if (data.cloneErrors && data.cloneErrors.length > 0) {
        alert(`Connected ${data.repositories.length} repositories. Some repositories had cloning errors.`)
      }
    } catch (error) {
      alert(`Failed to connect repositories. Please try again.`)
    } finally {
      setIsConnecting(false)
    }
  }

  const handleResync = async () => {
    if (isSyncing || !isConnected || isSynced) return

    setIsSyncing(true)
    setIsSynced(false)
    try {
      const response = await fetch(`/api/integrations/${connector.id}/sync-user`, {
        method: 'POST',
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(error.error || `HTTP ${response.status}: Failed to sync`)
      }

      const data = await response.json()
      setIsSynced(true)

      // Reset to "Resync" after 3 seconds
      setTimeout(() => {
        setIsSynced(false)
      }, 3000)
    } catch (error: any) {
      // Show error alert only on failure
      const errorMessage = error?.message || error?.toString() || 'Unknown error'
      alert(`Failed to sync ${connector.name}: ${errorMessage}`)
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 * index }}
      className="group relative p-6 rounded-2xl border border-sam-border bg-sam-surface/30 hover:border-sam-accent/50 hover:bg-sam-surface/40 transition-all duration-300"
    >
      {/* Header with Icon, Name, and Button */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-sam-surface flex items-center justify-center text-sam-text group-hover:text-sam-accent transition-colors flex-shrink-0">
            {connector.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {connector.autoLiveSync && (
                <span className="text-xs font-mono text-sam-accent bg-sam-accent/10 px-2 py-0.5 rounded">
                  Auto Live-sync
                </span>
              )}
              <h3 className="text-lg font-display font-semibold text-sam-text">
                {connector.name}
              </h3>
            </div>
            {isConnected && (
              <p className="text-xs text-sam-text-dim font-mono mt-1">
                {connectedEmail || (connector.id === 'github' && 'Repositories connected')}
              </p>
            )}
          </div>
        </div>
        <div className="ml-3 flex-shrink-0">
          {connector.available ? (
            isConnected ? (
              connector.autoLiveSync ? (
                <button
                  onClick={handleResync}
                  disabled={isSyncing || isSynced}
                  className={`px-4 py-2 rounded-lg border font-display font-semibold text-sm transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${isSynced
                    ? 'border-green-500 bg-green-500/10 text-green-500'
                    : 'border-sam-accent text-sam-accent hover:bg-sam-accent/10'
                    }`}
                >
                  {isSyncing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Syncing...
                    </>
                  ) : isSynced ? (
                    <>
                      <Check className="w-4 h-4" />
                      Synced
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      Resync
                    </>
                  )}
                </button>
              ) : (
                <button
                  disabled
                  className="px-4 py-2 rounded-lg border border-green-500 bg-green-500/10 text-green-500 font-display font-semibold text-sm whitespace-nowrap flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  Connected
                </button>
              )
            ) : (
              <button
                onClick={handleConnect}
                disabled={isConnecting}
                className="px-4 py-2 rounded-lg border border-sam-accent text-sam-accent font-display font-semibold text-sm hover:bg-sam-accent/10 transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  'Connect'
                )}
              </button>
            )
          ) : (
            <button
              disabled
              className="px-4 py-2 rounded-lg bg-sam-surface border border-sam-border text-sam-text-dim font-display font-medium text-sm cursor-not-allowed opacity-60 whitespace-nowrap"
            >
              Coming Soon
            </button>
          )}
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-sam-text-dim font-body leading-relaxed">
        {connector.description}
      </p>

      {/* GitHub Repository Selection Dialog */}
      {connector.id === 'github' && showGithubDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowGithubDialog(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-sam-surface border border-sam-border rounded-2xl p-6 max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-display font-bold text-sam-text">Select GitHub Repositories</h2>
              <button
                onClick={() => setShowGithubDialog(false)}
                className="p-2 rounded-lg hover:bg-sam-surface/50 text-sam-text-dim hover:text-sam-text transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isLoadingRepos ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-sam-accent" />
                <span className="ml-3 text-sam-text-dim">Loading repositories...</span>
              </div>
            ) : githubRepos.length === 0 ? (
              <div className="text-center py-12 text-sam-text-dim">
                No repositories found
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto mb-6 space-y-2">
                  {githubRepos.map((repo) => (
                    <label
                      key={repo.id}
                      className="flex items-start gap-3 p-3 rounded-lg border border-sam-border hover:bg-sam-surface/50 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedRepos.has(repo.full_name)}
                        onChange={(e) => {
                          const newSelected = new Set(selectedRepos)
                          if (e.target.checked) {
                            newSelected.add(repo.full_name)
                          } else {
                            newSelected.delete(repo.full_name)
                          }
                          setSelectedRepos(newSelected)
                        }}
                        className="mt-1 w-4 h-4 rounded border-sam-border text-sam-accent focus:ring-sam-accent focus:ring-2"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-sm font-semibold text-sam-text">{repo.name}</span>
                          {repo.private && (
                            <span className="text-xs px-2 py-0.5 rounded bg-sam-surface border border-sam-border text-sam-text-dim">
                              Private
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-sam-text-dim font-mono">{repo.full_name}</p>
                      </div>
                    </label>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-sam-border">
                  <span className="text-sm text-sam-text-dim">
                    {selectedRepos.size} repository(ies) selected
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setShowGithubDialog(false)}
                      className="px-4 py-2 rounded-lg border border-sam-border text-sam-text-dim hover:border-sam-error/50 hover:text-sam-error transition-all font-display font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleGithubConnect}
                      disabled={isConnecting || selectedRepos.size === 0}
                      className="px-6 py-2 rounded-lg bg-sam-accent text-sam-bg font-display font-semibold hover:bg-sam-accent-dim disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                    >
                      {isConnecting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        'Connect'
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}
    </motion.div>
  )
}

function SetupProgressView({
  setupStatus,
  logs,
  onReset,
  vmId
}: {
  setupStatus: SetupStatus | null
  logs: Array<{ time: Date; message: string; type: 'info' | 'success' | 'error' }>
  onReset: () => void
  vmId?: string | null
}) {
  const [isProgressCollapsed, setIsProgressCollapsed] = useState(false)
  // Determine if Telegram was configured (either completed or in progress)
  const hasTelegramSetup = setupStatus?.telegramConfigured || setupStatus?.gatewayStarted

  const allSteps = [
    {
      id: 'provisioning',
      label: 'Provisioning VM',
      icon: Server,
      check: () => setupStatus?.vmCreated || false,
      active: () => setupStatus?.status === 'provisioning' || (setupStatus?.status !== 'ready' && setupStatus?.status !== 'failed' && !setupStatus?.vmCreated)
    },
    {
      id: 'clawdbot',
      label: 'Installing Clawdbot',
      icon: Bot,
      check: () => setupStatus?.clawdbotInstalled || false,
      // Active when VM is created but clawdbot not installed, regardless of exact status value
      active: () => (setupStatus?.vmCreated && !setupStatus?.clawdbotInstalled && setupStatus?.status !== 'failed') || false
    },
    {
      id: 'telegram',
      label: 'Configuring Telegram',
      icon: MessageCircle,
      check: () => setupStatus?.telegramConfigured || false,
      active: () => setupStatus?.clawdbotInstalled && !setupStatus?.telegramConfigured && !setupStatus?.gatewayStarted && setupStatus?.status !== 'failed',
      optional: true,
      show: () => hasTelegramSetup || (setupStatus?.clawdbotInstalled && !setupStatus?.telegramConfigured)
    },
    {
      id: 'gateway',
      label: 'Starting Gateway',
      icon: Terminal,
      check: () => setupStatus?.gatewayStarted || false,
      active: () => setupStatus?.clawdbotInstalled && setupStatus?.telegramConfigured && !setupStatus?.gatewayStarted && setupStatus?.status !== 'failed',
      optional: true,
      show: () => hasTelegramSetup || setupStatus?.telegramConfigured
    },
    {
      id: 'complete',
      label: 'Setup Complete',
      icon: CheckCircle2,
      check: () => setupStatus?.status === 'ready' || false,
      active: () => setupStatus?.status === 'ready'
    },
  ]

  // Filter to only show relevant steps
  const steps = allSteps.filter(step => {
    if ('show' in step && typeof step.show === 'function') {
      return step.show()
    }
    return true
  })

  const getStepStatus = (step: typeof steps[0]) => {
    if (step.check()) return 'complete'
    if (step.active()) return 'active'
    return 'pending'
  }

  // Calculate progress based on completed steps + partial progress for active step
  const completedSteps = steps.filter(s => s.check()).length
  const activeStepIndex = steps.findIndex(s => s.active() && !s.check())

  // Calculate progress: completed steps + half credit for active step
  const progressPercentage = setupStatus?.status === 'ready'
    ? 100
    : setupStatus?.status === 'failed'
      ? Math.round((completedSteps / steps.length) * 100)
      : activeStepIndex >= 0
        ? Math.round(((completedSteps + 0.5) / steps.length) * 100)
        : completedSteps > 0
          ? Math.round((completedSteps / steps.length) * 100)
          : 5 // Show minimal progress to indicate something is happening

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* VM Stream on Left */}
      <div className="rounded-2xl border border-sam-border bg-sam-surface/50 backdrop-blur overflow-hidden">
        <div className="px-6 py-4 border-b border-sam-border bg-sam-surface/50 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-display font-bold text-sam-text">VM Screen</h3>
            <p className="text-xs text-sam-text-dim font-mono">Live view</p>
          </div>
          {setupStatus?.orgoComputerId && (
            <a
              href={`https://www.orgo.ai/workspaces/${setupStatus.orgoComputerId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-sam-accent hover:underline flex items-center gap-1"
            >
              Open in Orgo
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
        <div className="aspect-video bg-sam-bg flex items-center justify-center relative">
          {setupStatus?.vmCreated && setupStatus?.orgoComputerId ? (
            <OrgoVNCDisplay
              vmId={vmId || undefined}
              className="w-full h-full"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 text-sam-text-dim">
              <Server className="w-12 h-12" />
              <p className="text-sm font-mono">VM not created yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Progress Card on Right (Collapsible) */}
      <div className="rounded-2xl border border-sam-border bg-sam-surface/50 backdrop-blur overflow-hidden">
        <div
          className="px-6 py-4 border-b border-sam-border bg-sam-surface/50 flex items-center justify-between cursor-pointer hover:bg-sam-surface/70 transition-colors"
          onClick={() => setIsProgressCollapsed(!isProgressCollapsed)}
        >
          <div>
            <h2 className="text-lg font-display font-bold mb-1">Setup Progress</h2>
            <p className="text-xs text-sam-text-dim font-mono">
              {setupStatus?.status === 'ready'
                ? 'Completed successfully!'
                : setupStatus?.status === 'failed'
                  ? 'Encountered an error'
                  : `${Math.round(progressPercentage)}% complete`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {setupStatus?.status === 'ready' && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onReset()
                }}
                className="px-3 py-1.5 rounded-lg border border-sam-border text-sam-text-dim hover:border-sam-accent hover:text-sam-accent transition-all font-display font-medium text-xs"
              >
                Reset
              </button>
            )}
            {isProgressCollapsed ? (
              <ChevronDown className="w-5 h-5 text-sam-text-dim" />
            ) : (
              <ChevronUp className="w-5 h-5 text-sam-text-dim" />
            )}
          </div>
        </div>

        {!isProgressCollapsed && (
          <div className="p-6 overflow-y-auto max-h-[calc(100vh-300px)]">

            {/* Progress Bar */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-mono text-sam-text-dim">Progress</span>
                <span className="text-sm font-mono text-sam-text-dim">{Math.round(progressPercentage)}%</span>
              </div>
              <div className="w-full h-2 bg-sam-surface rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPercentage}%` }}
                  transition={{ duration: 0.5 }}
                  className="h-full bg-sam-accent rounded-full"
                />
              </div>
            </div>

            {/* Setup Steps */}
            <div className="space-y-4 mb-6">
              {steps.map((step, index) => {
                const status = getStepStatus(step)
                const isComplete = status === 'complete'
                const isActive = status === 'active'

                return (
                  <motion.div
                    key={step.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className={`p-4 rounded-lg border transition-all ${isActive
                      ? 'border-sam-accent bg-sam-accent/10'
                      : isComplete
                        ? 'border-green-500/50 bg-green-500/5'
                        : 'border-sam-border bg-sam-surface/30'
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${isComplete
                        ? 'bg-green-500/20 text-green-500'
                        : isActive
                          ? 'bg-sam-accent/20 text-sam-accent'
                          : 'bg-sam-surface text-sam-text-dim'
                        }`}>
                        {isComplete ? (
                          <Check className="w-5 h-5" />
                        ) : isActive ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <step.icon className="w-5 h-5" />
                        )}
                      </div>
                      <div className="flex-1">
                        <h3 className={`font-display font-semibold ${isActive ? 'text-sam-accent' : isComplete ? 'text-green-500' : 'text-sam-text-dim'
                          }`}>
                          {step.label}
                        </h3>
                        {'optional' in step && step.optional && !isComplete && !isActive && (
                          <span className="text-xs text-sam-text-dim">(optional)</span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>

            {/* Error Message */}
            {setupStatus?.errorMessage && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mb-6 p-4 rounded-lg bg-sam-error/10 border border-sam-error/30 flex items-start gap-3"
              >
                <AlertCircle className="w-5 h-5 text-sam-error flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sam-error text-sm font-semibold mb-1">Setup Error</p>
                  <p className="text-sam-error text-sm">{setupStatus.errorMessage}</p>
                </div>
              </motion.div>
            )}

            {/* Setup Logs */}
            <div className="border border-sam-border rounded-lg bg-sam-bg overflow-hidden">
              <div className="px-4 py-3 border-b border-sam-border bg-sam-surface/50">
                <h3 className="text-sm font-display font-semibold text-sam-text">Setup Logs</h3>
              </div>
              <div className="p-4 max-h-64 overflow-y-auto font-mono text-xs">
                {logs.length === 0 ? (
                  <p className="text-sam-text-dim">Waiting for setup to start...</p>
                ) : (
                  <div className="space-y-1">
                    {logs.map((log, index) => (
                      <div
                        key={index}
                        className={`flex items-start gap-2 ${log.type === 'error'
                          ? 'text-sam-error'
                          : log.type === 'success'
                            ? 'text-green-500'
                            : 'text-sam-text-dim'
                          }`}
                      >
                        <span className="text-sam-text-dim/50 flex-shrink-0">
                          {log.time.toLocaleTimeString()}
                        </span>
                        <span className="flex-1">{log.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Links removed - no vault repo */}
          </div>
        )}
      </div>
    </div>
  )
}

function ComputerConnectedView({
  setupStatus,
  onStatusUpdate,
  onDelete,
  vmId,
  currentVM
}: {
  setupStatus: SetupStatus
  onStatusUpdate?: () => Promise<void>
  onDelete: () => Promise<void>
  vmId?: string | null
  currentVM?: VMInfo | null
}) {
  const [isDeleting, setIsDeleting] = useState(false)
  // Default to terminal for AWS/E2B (no screen view), screen for Orgo
  const [activeVMTab, setActiveVMTab] = useState<'screen' | 'terminal' | 'chat'>(() => {
    // Will be updated by useEffect when setupStatus loads
    return 'terminal'
  })
  const [showTelegramConfig, setShowTelegramConfig] = useState(false)
  const [telegramBotToken, setTelegramBotToken] = useState('')
  const [telegramUserId, setTelegramUserId] = useState('')
  const [isConfiguringTelegram, setIsConfiguringTelegram] = useState(false)
  const [telegramError, setTelegramError] = useState<string | null>(null)
  const [gatewayStatus, setGatewayStatus] = useState<any>(null)

  // Channel configuration states
  const [activeChannelConfig, setActiveChannelConfig] = useState<string | null>(null)
  const [channelError, setChannelError] = useState<string | null>(null)
  const [isConfiguringChannel, setIsConfiguringChannel] = useState(false)

  // Discord config
  const [discordBotToken, setDiscordBotToken] = useState('')
  const [discordGuildId, setDiscordGuildId] = useState('')

  // Slack config
  const [slackBotToken, setSlackBotToken] = useState('')
  const [slackAppToken, setSlackAppToken] = useState('')

  // WhatsApp config (Meta Business)
  const [whatsappPhoneNumberId, setWhatsappPhoneNumberId] = useState('')
  const [whatsappAccessToken, setWhatsappAccessToken] = useState('')
  const [whatsappVerifyToken, setWhatsappVerifyToken] = useState('')

  // Signal config
  const [signalPhoneNumber, setSignalPhoneNumber] = useState('')

  // Matrix config
  const [matrixHomeserver, setMatrixHomeserver] = useState('')
  const [matrixAccessToken, setMatrixAccessToken] = useState('')
  const [matrixUserId, setMatrixUserId] = useState('')

  // SMS config (Twilio)
  const [twilioAccountSid, setTwilioAccountSid] = useState('')
  const [twilioAuthToken, setTwilioAuthToken] = useState('')
  const [twilioPhoneNumber, setTwilioPhoneNumber] = useState('')

  // Email config (IMAP)
  const [emailImapServer, setEmailImapServer] = useState('')
  const [emailSmtpServer, setEmailSmtpServer] = useState('')
  const [emailUsername, setEmailUsername] = useState('')
  const [emailPassword, setEmailPassword] = useState('')
  const [emailImapPort, setEmailImapPort] = useState('993')
  const [emailSmtpPort, setEmailSmtpPort] = useState('587')
  const [isCheckingGateway, setIsCheckingGateway] = useState(false)
  const [isStartingGateway, setIsStartingGateway] = useState(false)
  const [showGatewayLogs, setShowGatewayLogs] = useState(false)

  // Set default tab based on VM provider (Orgo has screen, others start with chat)
  useEffect(() => {
    if (setupStatus?.vmProvider === 'orgo') {
      setActiveVMTab('screen')
    } else if (setupStatus?.vmProvider === 'aws' || setupStatus?.vmProvider === 'e2b') {
      setActiveVMTab('chat')
    }
  }, [setupStatus?.vmProvider])

  const handleDelete = async () => {
    const message = setupStatus.vmProvider === 'aws'
      ? 'Are you sure you want to terminate your EC2 instance? This will stop all running services and you will need to set up again.'
      : 'Are you sure you want to delete your computer? This will reset your setup and you will need to start over.'
    if (!confirm(message)) {
      return
    }

    setIsDeleting(true)
    try {
      await onDelete()
    } catch (error) {
    } finally {
      setIsDeleting(false)
    }
  }

  // Handle VM migration for legacy VMs that don't support WebSocket
  const [isMigrating, setIsMigrating] = useState(false)

  const handleMigrate = async () => {
    const confirmed = confirm(
      'Your VM was created before the terminal upgrade.\n\n' +
      'To use the new interactive terminal and chat features, we need to:\n' +
      '1. Delete your current VM\n' +
      '2. Create a new VM with the same settings\n' +
      '3. Reinstall Clawdbot\n\n' +
      'This will take a few minutes. Continue?'
    )

    if (!confirmed) return

    setIsMigrating(true)
    try {
      // Save current VM settings before deletion
      const vmName = currentVM?.name || 'My VM'
      const vmProvider = currentVM?.provider || setupStatus?.vmProvider || 'orgo'
      const orgoProjectId = currentVM?.orgoProjectId
      const orgoProjectName = currentVM?.orgoProjectName

      // Delete the old VM
      if (vmId) {
        const deleteRes = await fetch(`/api/vms/${vmId}`, { method: 'DELETE' })
        if (!deleteRes.ok) {
          throw new Error('Failed to delete old VM')
        }
      }

      // Create a new VM with the same settings
      const createRes = await fetch('/api/vms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${vmName}-new`,
          provider: vmProvider,
          provisionNow: true,
          orgoProjectId,
          orgoProjectName,
        }),
      })

      if (!createRes.ok) {
        const error = await createRes.json()
        throw new Error(error.error || 'Failed to create new VM')
      }

      const { vm: newVM } = await createRes.json()

      // Redirect to the new VM's setup page
      window.location.href = `/learning-sources?vmId=${newVM.id}`

    } catch (error) {
      console.error('Migration failed:', error)
      alert(`Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`)
      setIsMigrating(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* VM Stream (Left Column - 3/4 width) */}
      <div className="lg:col-span-3 bg-sam-surface/50 border border-sam-border rounded-2xl p-4 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-display font-bold text-sam-text">
              {setupStatus?.vmProvider === 'aws' ? 'EC2 Instance' : setupStatus?.vmProvider === 'e2b' ? 'E2B Sandbox' : 'VM'}
            </h2>
            {/* Tabs for VM views (screen, chat, terminal) */}
            {setupStatus?.vmCreated && (
              <div className="flex items-center gap-1 bg-sam-bg/80 border border-sam-border rounded-lg p-1">
                {/* Screen tab - only for Orgo VMs */}
                {setupStatus?.vmProvider === 'orgo' && (
                  <button
                    onClick={() => setActiveVMTab('screen')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${activeVMTab === 'screen'
                      ? 'bg-sam-accent/15 text-sam-accent border-sam-accent/30'
                      : 'text-sam-text-dim hover:text-sam-text hover:bg-sam-surface/50 border-transparent'
                      }`}
                  >
                    <Monitor className="w-3.5 h-3.5" />
                    Screen
                  </button>
                )}
                {/* Chat tab - before terminal */}
                <button
                  onClick={() => setActiveVMTab('chat')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${activeVMTab === 'chat'
                    ? 'bg-sam-accent/15 text-sam-accent border-sam-accent/30'
                    : 'text-sam-text-dim hover:text-sam-text hover:bg-sam-surface/50 border-transparent'
                    }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Chat
                </button>
                {/* Terminal tab - last */}
                <button
                  onClick={() => setActiveVMTab('terminal')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${activeVMTab === 'terminal'
                    ? 'bg-sam-accent/15 text-sam-accent border-sam-accent/30'
                    : 'text-sam-text-dim hover:text-sam-text hover:bg-sam-surface/50 border-transparent'
                    }`}
                >
                  <Terminal className="w-3.5 h-3.5" />
                  Terminal
                </button>
              </div>
            )}
          </div>
          {setupStatus?.vmProvider === 'aws' && setupStatus?.awsPublicIp && (
            <a
              href={`https://${setupStatus.awsRegion || 'us-east-1'}.console.aws.amazon.com/ec2/home?region=${setupStatus.awsRegion || 'us-east-1'}#InstanceDetails:instanceId=${setupStatus.awsInstanceId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-sam-accent hover:underline"
            >
              Open in AWS Console
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {setupStatus?.vmProvider !== 'aws' && setupStatus?.orgoComputerId && (
            <a
              href={`https://www.orgo.ai/workspaces/${setupStatus.orgoComputerId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-sam-accent hover:underline"
            >
              Open in Orgo
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
        <div className={`bg-sam-bg relative flex-1 rounded-lg overflow-hidden ${activeVMTab === 'chat' ? '' : 'flex items-center justify-center'}`} style={{ minHeight: '600px' }}>
          {/* Chat tab - available for all providers */}
          {activeVMTab === 'chat' && setupStatus?.vmCreated ? (
            <ClawdbotChat
              vmId={vmId || undefined}
              className="w-full h-full absolute inset-0"
              vmCreatedAt={currentVM?.createdAt}
              onMigrate={handleMigrate}
            />
          ) : /* AWS: Interactive Web Terminal */
            setupStatus?.vmProvider === 'aws' && setupStatus?.awsPublicIp ? (
              activeVMTab === 'terminal' ? (
                <WebTerminal
                  vmId={vmId || undefined}
                  title={`ubuntu@${setupStatus.awsPublicIp}`}
                  autoConnect={true}
                  className="w-full h-full"
                />
              ) : (
                <WebTerminal
                  vmId={vmId || undefined}
                  title={`ubuntu@${setupStatus.awsPublicIp}`}
                  autoConnect={true}
                  className="w-full h-full"
                />
              )
            ) : setupStatus?.vmProvider === 'e2b' && setupStatus?.e2bSandboxId ? (
              // E2B: Terminal view
              activeVMTab === 'terminal' ? (
                <E2BTerminal
                  vmId={vmId || undefined}
                  sandboxId={setupStatus?.e2bSandboxId || undefined}
                  title="E2B Sandbox Terminal"
                  className="w-full h-full"
                />
              ) : (
                <E2BTerminal
                  vmId={vmId || undefined}
                  sandboxId={setupStatus?.e2bSandboxId || undefined}
                  title="E2B Sandbox Terminal"
                  className="w-full h-full"
                />
              )
            ) : setupStatus?.vmCreated && setupStatus?.orgoComputerId ? (
              // Orgo VM: Show content based on active tab
              activeVMTab === 'screen' ? (
                // VNC display for Orgo VMs - allows direct interaction
                <OrgoVNCDisplay
                  vmId={vmId || undefined}
                  className="w-full h-full"
                />
              ) : activeVMTab === 'terminal' ? (
                // Terminal tab - Orgo bash terminal
                <OrgoTerminal
                  vmId={vmId || undefined}
                  computerId={setupStatus?.orgoComputerId || undefined}
                  title="Terminal"
                  className="w-full h-full"
                  vmCreatedAt={currentVM?.createdAt}
                  onMigrate={handleMigrate}
                />
              ) : (
                // Fallback to VNC for Orgo
                <OrgoVNCDisplay
                  vmId={vmId || undefined}
                  className="w-full h-full"
                />
              )
            ) : (
              <div className="flex flex-col items-center gap-3 text-sam-text-dim">
                <Server className="w-8 h-8" />
                <p className="text-sm font-mono">VM not yet created</p>
              </div>
            )}
        </div>
      </div>

      {/* Computer Connected Card (Right Column - 1/4 width) */}
      <div className="lg:col-span-1 p-4 rounded-2xl border border-sam-accent/30 bg-sam-accent/5 backdrop-blur flex flex-col h-fit">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-sam-accent/20 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-5 h-5 text-sam-accent" />
          </div>
          <div>
            <h2 className="text-lg font-display font-bold leading-tight">
              <span className="text-gradient">Computer Connected</span>
            </h2>
            <p className="text-xs text-sam-text-dim">
              Your VM is running and ready to use.
            </p>
          </div>
        </div>

        <div className="space-y-2 mb-4">
          {/* Console Links */}
          {setupStatus.vmProvider === 'aws' && setupStatus.awsInstanceId && (
            <a
              href={`https://${setupStatus.awsRegion || 'us-east-1'}.console.aws.amazon.com/ec2/home?region=${setupStatus.awsRegion || 'us-east-1'}#InstanceDetails:instanceId=${setupStatus.awsInstanceId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-sam-border bg-sam-surface hover:border-sam-accent transition-all w-full text-xs"
            >
              <Server className="w-3.5 h-3.5 text-sam-accent" />
              <span className="font-mono">AWS Console</span>
              <ExternalLink className="w-3 h-3 text-sam-text-dim ml-auto" />
            </a>
          )}
          {setupStatus.vmProvider === 'orgo' && setupStatus.orgoComputerId && (
            <a
              href={`https://www.orgo.ai/workspaces/${setupStatus.orgoComputerId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-sam-border bg-sam-surface hover:border-sam-accent transition-all w-full text-xs"
            >
              <Server className="w-3.5 h-3.5 text-sam-accent" />
              <span className="font-mono">Open VM Console</span>
              <ExternalLink className="w-3 h-3 text-sam-text-dim ml-auto" />
            </a>
          )}
          {setupStatus.vmProvider === 'e2b' && setupStatus.e2bSandboxId && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-sam-border bg-sam-surface w-full text-xs">
              <Server className="w-3.5 h-3.5 text-sam-accent" />
              <span className="font-mono truncate" title={setupStatus.e2bSandboxId}>
                {setupStatus.e2bSandboxId.slice(0, 12)}...
              </span>
            </div>
          )}
        </div>

        {/* Setup Status - Compact */}
        <div className="pt-3 border-t border-sam-border/50 mb-3">
          <h3 className="font-display font-semibold mb-2 text-xs text-sam-text-dim uppercase tracking-wide">Status</h3>
          <div className="grid grid-cols-2 gap-1.5">
            <div className="flex items-center gap-1.5 text-[10px]">
              <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
              <span className="text-sam-text-dim">VM</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px]">
              <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
              <span className="text-sam-text-dim">Repo</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px]">
              <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
              <span className="text-sam-text-dim">Git Sync</span>
            </div>
          </div>
        </div>

        <button
          onClick={handleDelete}
          disabled={isDeleting}
          className="mt-2 px-3 py-1.5 rounded-lg border border-sam-error/50 bg-sam-error/10 text-sam-error hover:bg-sam-error/20 transition-all font-display font-medium text-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
        >
          {isDeleting ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              {setupStatus.vmProvider === 'aws' ? 'Terminating...' : 'Deleting...'}
            </>
          ) : (
            <>
              <Trash2 className="w-3 h-3" />
              {setupStatus.vmProvider === 'aws' ? 'Terminate' : 'Delete'}
            </>
          )}
        </button>

        {/* Additional Communication Channels */}
        <div className="mt-4 pt-4 border-t border-sam-border/50">
          <h3 className="font-display font-semibold mb-3 text-xs text-sam-text-dim uppercase tracking-wide">
            Connect Channels
          </h3>
          <div className="space-y-2">
            {/* Telegram */}
            {setupStatus.telegramConfigured && setupStatus.gatewayStarted ? (
              <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-green-500/30 bg-green-500/5 w-full text-xs">
                <div className="w-6 h-6 rounded-md bg-[#0088cc] flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                  </svg>
                </div>
                <span className="font-medium text-green-500">Telegram</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 ml-auto" />
              </div>
            ) : activeChannelConfig === 'telegram' ? (
              <div className="p-3 rounded-lg border border-[#0088cc]/30 bg-[#0088cc]/5 space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-5 h-5 rounded bg-[#0088cc] flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                    </svg>
                  </div>
                  <span className="text-xs font-semibold text-[#0088cc]">Configure Telegram</span>
                </div>
                {telegramError && <div className="p-2 rounded bg-sam-error/10 border border-sam-error/30 text-sam-error text-[10px]">{telegramError}</div>}
                <div>
                  <label className="block text-[10px] font-mono text-sam-text-dim mb-0.5">Bot Token <span className="text-sam-error">*</span></label>
                  <input type="password" value={telegramBotToken} onChange={(e) => setTelegramBotToken(e.target.value)} placeholder="1234567890:ABCdef..." className="w-full px-2 py-1.5 rounded bg-sam-bg border border-sam-border focus:border-[#0088cc] outline-none font-mono text-[10px] transition-colors" />
                  <p className="mt-0.5 text-[9px] text-sam-text-dim">Get it from <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-[#0088cc] hover:underline">@BotFather</a></p>
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-sam-text-dim mb-0.5">User ID <span className="text-sam-error">*</span></label>
                  <input type="text" value={telegramUserId} onChange={(e) => setTelegramUserId(e.target.value)} placeholder="123456789" className="w-full px-2 py-1.5 rounded bg-sam-bg border border-sam-border focus:border-[#0088cc] outline-none font-mono text-[10px] transition-colors" />
                  <p className="mt-0.5 text-[9px] text-sam-text-dim">Get it from <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" className="text-[#0088cc] hover:underline">@userinfobot</a></p>
                </div>
                <div className="flex items-center gap-1.5 pt-1">
                  <button
                    onClick={async () => {
                      if (!telegramBotToken.trim()) { setTelegramError('Bot token is required'); return; }
                      if (!telegramUserId.trim()) { setTelegramError('User ID is required'); return; }
                      setIsConfiguringTelegram(true)
                      setTelegramError(null)
                      try {
                        const res = await fetch('/api/setup/configure-telegram', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ telegramBotToken: telegramBotToken.trim(), telegramUserId: telegramUserId.trim(), vmId: vmId || undefined }),
                        })
                        if (!res.ok) { const data = await res.json(); throw new Error(data.error || 'Failed to configure Telegram'); }
                        setActiveChannelConfig(null)
                        setTelegramBotToken('')
                        setTelegramUserId('')
                        if (onStatusUpdate) { await onStatusUpdate(); } else { window.location.reload(); }
                      } catch (error) {
                        setTelegramError(error instanceof Error ? error.message : 'Failed to configure Telegram')
                      } finally {
                        setIsConfiguringTelegram(false)
                      }
                    }}
                    disabled={isConfiguringTelegram || !telegramBotToken.trim() || !telegramUserId.trim()}
                    className="flex-1 px-2 py-1.5 rounded bg-[#0088cc] text-white hover:bg-[#0077b5] disabled:opacity-50 disabled:cursor-not-allowed transition-all font-display font-medium text-[10px] flex items-center justify-center gap-1"
                  >
                    {isConfiguringTelegram ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : 'Connect'}
                  </button>
                  <button onClick={() => { setActiveChannelConfig(null); setTelegramError(null); setTelegramBotToken(''); setTelegramUserId(''); }} className="px-2 py-1.5 rounded border border-sam-border text-sam-text-dim hover:border-sam-error/50 hover:text-sam-error transition-all font-display font-medium text-[10px]">✕</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setActiveChannelConfig('telegram')} className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-sam-border bg-sam-surface/50 hover:border-[#0088cc]/50 hover:bg-[#0088cc]/5 transition-all w-full text-xs group">
                <div className="w-6 h-6 rounded-md bg-[#0088cc] flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                  </svg>
                </div>
                <span className="font-medium text-sam-text group-hover:text-[#0088cc] transition-colors">Telegram</span>
                <ArrowRight className="w-3 h-3 text-sam-text-dim ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            )}

            {/* Discord */}
            {activeChannelConfig === 'discord' ? (
              <div className="p-3 rounded-lg border border-[#5865F2]/30 bg-[#5865F2]/5 space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-5 h-5 rounded bg-[#5865F2] flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.36-.698.772-1.362 1.225-1.993a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.12-.098.246-.198.373-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                    </svg>
                  </div>
                  <span className="text-xs font-semibold text-[#5865F2]">Configure Discord</span>
                </div>
                {channelError && <div className="p-2 rounded bg-sam-error/10 border border-sam-error/30 text-sam-error text-[10px]">{channelError}</div>}
                <div>
                  <label className="block text-[10px] font-mono text-sam-text-dim mb-0.5">Bot Token <span className="text-sam-error">*</span></label>
                  <input type="password" value={discordBotToken} onChange={(e) => setDiscordBotToken(e.target.value)} placeholder="MTIzNDU2Nzg5MDEyMzQ1Njc4OQ..." className="w-full px-2 py-1.5 rounded bg-sam-bg border border-sam-border focus:border-[#5865F2] outline-none font-mono text-[10px] transition-colors" />
                  <p className="mt-0.5 text-[9px] text-sam-text-dim">Get it from <a href="https://discord.com/developers/applications" target="_blank" rel="noopener noreferrer" className="text-[#5865F2] hover:underline">Discord Developer Portal</a></p>
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-sam-text-dim mb-0.5">Guild/Server ID <span className="text-sam-text-dim">(optional)</span></label>
                  <input type="text" value={discordGuildId} onChange={(e) => setDiscordGuildId(e.target.value)} placeholder="123456789012345678" className="w-full px-2 py-1.5 rounded bg-sam-bg border border-sam-border focus:border-[#5865F2] outline-none font-mono text-[10px] transition-colors" />
                </div>
                <div className="flex items-center gap-1.5 pt-1">
                  <button onClick={() => { setChannelError('Channel configuration coming soon'); }} disabled={isConfiguringChannel || !discordBotToken.trim()} className="flex-1 px-2 py-1.5 rounded bg-[#5865F2] text-white hover:bg-[#4752C4] disabled:opacity-50 disabled:cursor-not-allowed transition-all font-display font-medium text-[10px] flex items-center justify-center gap-1">
                    {isConfiguringChannel ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : 'Connect'}
                  </button>
                  <button onClick={() => { setActiveChannelConfig(null); setChannelError(null); setDiscordBotToken(''); setDiscordGuildId(''); }} className="px-2 py-1.5 rounded border border-sam-border text-sam-text-dim hover:border-sam-error/50 hover:text-sam-error transition-all font-display font-medium text-[10px]">✕</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setActiveChannelConfig('discord')} className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-sam-border bg-sam-surface/50 hover:border-[#5865F2]/50 hover:bg-[#5865F2]/5 transition-all w-full text-xs group">
                <div className="w-6 h-6 rounded-md bg-[#5865F2] flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.36-.698.772-1.362 1.225-1.993a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.12-.098.246-.198.373-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                  </svg>
                </div>
                <span className="font-medium text-sam-text group-hover:text-[#5865F2] transition-colors">Discord</span>
                <ArrowRight className="w-3 h-3 text-sam-text-dim ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            )}

            {/* Slack */}
            {activeChannelConfig === 'slack' ? (
              <div className="p-3 rounded-lg border border-[#4A154B]/30 bg-[#4A154B]/5 space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-5 h-5 rounded bg-[#4A154B] flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" />
                    </svg>
                  </div>
                  <span className="text-xs font-semibold text-[#4A154B]">Configure Slack</span>
                </div>
                {channelError && <div className="p-2 rounded bg-sam-error/10 border border-sam-error/30 text-sam-error text-[10px]">{channelError}</div>}
                <div>
                  <label className="block text-[10px] font-mono text-sam-text-dim mb-0.5">Bot Token <span className="text-sam-error">*</span></label>
                  <input type="password" value={slackBotToken} onChange={(e) => setSlackBotToken(e.target.value)} placeholder="xoxb-..." className="w-full px-2 py-1.5 rounded bg-sam-bg border border-sam-border focus:border-[#4A154B] outline-none font-mono text-[10px] transition-colors" />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-sam-text-dim mb-0.5">App Token <span className="text-sam-error">*</span></label>
                  <input type="password" value={slackAppToken} onChange={(e) => setSlackAppToken(e.target.value)} placeholder="xapp-..." className="w-full px-2 py-1.5 rounded bg-sam-bg border border-sam-border focus:border-[#4A154B] outline-none font-mono text-[10px] transition-colors" />
                  <p className="mt-0.5 text-[9px] text-sam-text-dim">Get tokens from <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer" className="text-[#4A154B] hover:underline">Slack API</a></p>
                </div>
                <div className="flex items-center gap-1.5 pt-1">
                  <button onClick={() => { setChannelError('Channel configuration coming soon'); }} disabled={isConfiguringChannel || !slackBotToken.trim() || !slackAppToken.trim()} className="flex-1 px-2 py-1.5 rounded bg-[#4A154B] text-white hover:bg-[#3D1140] disabled:opacity-50 disabled:cursor-not-allowed transition-all font-display font-medium text-[10px] flex items-center justify-center gap-1">
                    {isConfiguringChannel ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : 'Connect'}
                  </button>
                  <button onClick={() => { setActiveChannelConfig(null); setChannelError(null); setSlackBotToken(''); setSlackAppToken(''); }} className="px-2 py-1.5 rounded border border-sam-border text-sam-text-dim hover:border-sam-error/50 hover:text-sam-error transition-all font-display font-medium text-[10px]">✕</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setActiveChannelConfig('slack')} className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-sam-border bg-sam-surface/50 hover:border-[#4A154B]/50 hover:bg-[#4A154B]/5 transition-all w-full text-xs group">
                <div className="w-6 h-6 rounded-md bg-[#4A154B] flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" />
                  </svg>
                </div>
                <span className="font-medium text-sam-text group-hover:text-[#4A154B] transition-colors">Slack</span>
                <ArrowRight className="w-3 h-3 text-sam-text-dim ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            )}

            {/* WhatsApp */}
            {activeChannelConfig === 'whatsapp' ? (
              <div className="p-3 rounded-lg border border-[#25D366]/30 bg-[#25D366]/5 space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-5 h-5 rounded bg-[#25D366] flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                  </div>
                  <span className="text-xs font-semibold text-[#25D366]">Configure WhatsApp</span>
                </div>
                {channelError && <div className="p-2 rounded bg-sam-error/10 border border-sam-error/30 text-sam-error text-[10px]">{channelError}</div>}
                <div>
                  <label className="block text-[10px] font-mono text-sam-text-dim mb-0.5">Phone Number ID <span className="text-sam-error">*</span></label>
                  <input type="text" value={whatsappPhoneNumberId} onChange={(e) => setWhatsappPhoneNumberId(e.target.value)} placeholder="123456789012345" className="w-full px-2 py-1.5 rounded bg-sam-bg border border-sam-border focus:border-[#25D366] outline-none font-mono text-[10px] transition-colors" />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-sam-text-dim mb-0.5">Access Token <span className="text-sam-error">*</span></label>
                  <input type="password" value={whatsappAccessToken} onChange={(e) => setWhatsappAccessToken(e.target.value)} placeholder="EAAG..." className="w-full px-2 py-1.5 rounded bg-sam-bg border border-sam-border focus:border-[#25D366] outline-none font-mono text-[10px] transition-colors" />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-sam-text-dim mb-0.5">Verify Token <span className="text-sam-error">*</span></label>
                  <input type="password" value={whatsappVerifyToken} onChange={(e) => setWhatsappVerifyToken(e.target.value)} placeholder="your_verify_token" className="w-full px-2 py-1.5 rounded bg-sam-bg border border-sam-border focus:border-[#25D366] outline-none font-mono text-[10px] transition-colors" />
                  <p className="mt-0.5 text-[9px] text-sam-text-dim">Get credentials from <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" className="text-[#25D366] hover:underline">Meta for Developers</a></p>
                </div>
                <div className="flex items-center gap-1.5 pt-1">
                  <button onClick={() => { setChannelError('Channel configuration coming soon'); }} disabled={isConfiguringChannel || !whatsappPhoneNumberId.trim() || !whatsappAccessToken.trim()} className="flex-1 px-2 py-1.5 rounded bg-[#25D366] text-white hover:bg-[#1EBE5D] disabled:opacity-50 disabled:cursor-not-allowed transition-all font-display font-medium text-[10px] flex items-center justify-center gap-1">
                    {isConfiguringChannel ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : 'Connect'}
                  </button>
                  <button onClick={() => { setActiveChannelConfig(null); setChannelError(null); setWhatsappPhoneNumberId(''); setWhatsappAccessToken(''); setWhatsappVerifyToken(''); }} className="px-2 py-1.5 rounded border border-sam-border text-sam-text-dim hover:border-sam-error/50 hover:text-sam-error transition-all font-display font-medium text-[10px]">✕</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setActiveChannelConfig('whatsapp')} className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-sam-border bg-sam-surface/50 hover:border-[#25D366]/50 hover:bg-[#25D366]/5 transition-all w-full text-xs group">
                <div className="w-6 h-6 rounded-md bg-[#25D366] flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                </div>
                <span className="font-medium text-sam-text group-hover:text-[#25D366] transition-colors">WhatsApp</span>
                <ArrowRight className="w-3 h-3 text-sam-text-dim ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            )}

            {/* Signal */}
            {activeChannelConfig === 'signal' ? (
              <div className="p-3 rounded-lg border border-[#3A76F0]/30 bg-[#3A76F0]/5 space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-5 h-5 rounded bg-[#3A76F0] flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 3.6c4.637 0 8.4 3.763 8.4 8.4 0 4.637-3.763 8.4-8.4 8.4-1.476 0-2.864-.38-4.073-1.049l-2.86.754.771-2.78A8.353 8.353 0 013.6 12c0-4.637 3.763-8.4 8.4-8.4z" />
                    </svg>
                  </div>
                  <span className="text-xs font-semibold text-[#3A76F0]">Configure Signal</span>
                </div>
                {channelError && <div className="p-2 rounded bg-sam-error/10 border border-sam-error/30 text-sam-error text-[10px]">{channelError}</div>}
                <div>
                  <label className="block text-[10px] font-mono text-sam-text-dim mb-0.5">Phone Number <span className="text-sam-error">*</span></label>
                  <input type="text" value={signalPhoneNumber} onChange={(e) => setSignalPhoneNumber(e.target.value)} placeholder="+1234567890" className="w-full px-2 py-1.5 rounded bg-sam-bg border border-sam-border focus:border-[#3A76F0] outline-none font-mono text-[10px] transition-colors" />
                  <p className="mt-0.5 text-[9px] text-sam-text-dim">Requires <a href="https://github.com/AsamK/signal-cli" target="_blank" rel="noopener noreferrer" className="text-[#3A76F0] hover:underline">signal-cli</a> to be installed on the VM</p>
                </div>
                <div className="flex items-center gap-1.5 pt-1">
                  <button onClick={() => { setChannelError('Channel configuration coming soon'); }} disabled={isConfiguringChannel || !signalPhoneNumber.trim()} className="flex-1 px-2 py-1.5 rounded bg-[#3A76F0] text-white hover:bg-[#2E63D9] disabled:opacity-50 disabled:cursor-not-allowed transition-all font-display font-medium text-[10px] flex items-center justify-center gap-1">
                    {isConfiguringChannel ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : 'Connect'}
                  </button>
                  <button onClick={() => { setActiveChannelConfig(null); setChannelError(null); setSignalPhoneNumber(''); }} className="px-2 py-1.5 rounded border border-sam-border text-sam-text-dim hover:border-sam-error/50 hover:text-sam-error transition-all font-display font-medium text-[10px]">✕</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setActiveChannelConfig('signal')} className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-sam-border bg-sam-surface/50 hover:border-[#3A76F0]/50 hover:bg-[#3A76F0]/5 transition-all w-full text-xs group">
                <div className="w-6 h-6 rounded-md bg-[#3A76F0] flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 3.6c4.637 0 8.4 3.763 8.4 8.4 0 4.637-3.763 8.4-8.4 8.4-1.476 0-2.864-.38-4.073-1.049l-2.86.754.771-2.78A8.353 8.353 0 013.6 12c0-4.637 3.763-8.4 8.4-8.4z" />
                  </svg>
                </div>
                <span className="font-medium text-sam-text group-hover:text-[#3A76F0] transition-colors">Signal</span>
                <ArrowRight className="w-3 h-3 text-sam-text-dim ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            )}

            {/* Matrix */}
            {activeChannelConfig === 'matrix' ? (
              <div className="p-3 rounded-lg border border-[#0DBD8B]/30 bg-[#0DBD8B]/5 space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-5 h-5 rounded bg-[#0DBD8B] flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M.632.55v22.9H2.28V24H0V0h2.28v.55zm7.043 7.26v1.157h.033c.309-.443.683-.784 1.117-1.024.433-.245.936-.365 1.5-.365.54 0 1.033.107 1.481.314.448.208.785.582 1.02 1.108.254-.374.6-.706 1.034-.992.434-.287.95-.43 1.546-.43.453 0 .872.056 1.26.167.388.11.716.286.993.53.276.245.489.559.646.951.152.392.23.863.23 1.417v5.728h-2.349V11.52c0-.286-.01-.559-.032-.812a1.755 1.755 0 00-.18-.66 1.106 1.106 0 00-.438-.448c-.194-.11-.457-.166-.785-.166-.332 0-.6.064-.803.189a1.38 1.38 0 00-.48.499 1.946 1.946 0 00-.231.696 5.56 5.56 0 00-.06.785v4.768h-2.35v-4.8c0-.254-.004-.503-.018-.752a2.074 2.074 0 00-.143-.688 1.052 1.052 0 00-.415-.503c-.194-.125-.476-.19-.854-.19-.111 0-.259.024-.439.074-.18.051-.36.143-.53.282-.171.138-.319.334-.439.588-.12.254-.18.593-.18 1.02v4.966H5.46V7.81zm15.693 15.64V.55H21.72V0H24v24h-2.28v-.55z" />
                    </svg>
                  </div>
                  <span className="text-xs font-semibold text-[#0DBD8B]">Configure Matrix</span>
                </div>
                {channelError && <div className="p-2 rounded bg-sam-error/10 border border-sam-error/30 text-sam-error text-[10px]">{channelError}</div>}
                <div>
                  <label className="block text-[10px] font-mono text-sam-text-dim mb-0.5">Homeserver URL <span className="text-sam-error">*</span></label>
                  <input type="text" value={matrixHomeserver} onChange={(e) => setMatrixHomeserver(e.target.value)} placeholder="https://matrix.org" className="w-full px-2 py-1.5 rounded bg-sam-bg border border-sam-border focus:border-[#0DBD8B] outline-none font-mono text-[10px] transition-colors" />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-sam-text-dim mb-0.5">User ID <span className="text-sam-error">*</span></label>
                  <input type="text" value={matrixUserId} onChange={(e) => setMatrixUserId(e.target.value)} placeholder="@user:matrix.org" className="w-full px-2 py-1.5 rounded bg-sam-bg border border-sam-border focus:border-[#0DBD8B] outline-none font-mono text-[10px] transition-colors" />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-sam-text-dim mb-0.5">Access Token <span className="text-sam-error">*</span></label>
                  <input type="password" value={matrixAccessToken} onChange={(e) => setMatrixAccessToken(e.target.value)} placeholder="syt_..." className="w-full px-2 py-1.5 rounded bg-sam-bg border border-sam-border focus:border-[#0DBD8B] outline-none font-mono text-[10px] transition-colors" />
                  <p className="mt-0.5 text-[9px] text-sam-text-dim">See <a href="https://matrix.org/docs/guides/client-server-api" target="_blank" rel="noopener noreferrer" className="text-[#0DBD8B] hover:underline">Matrix docs</a></p>
                </div>
                <div className="flex items-center gap-1.5 pt-1">
                  <button onClick={() => { setChannelError('Channel configuration coming soon'); }} disabled={isConfiguringChannel || !matrixHomeserver.trim() || !matrixAccessToken.trim()} className="flex-1 px-2 py-1.5 rounded bg-[#0DBD8B] text-white hover:bg-[#0AA87A] disabled:opacity-50 disabled:cursor-not-allowed transition-all font-display font-medium text-[10px] flex items-center justify-center gap-1">
                    {isConfiguringChannel ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : 'Connect'}
                  </button>
                  <button onClick={() => { setActiveChannelConfig(null); setChannelError(null); setMatrixHomeserver(''); setMatrixUserId(''); setMatrixAccessToken(''); }} className="px-2 py-1.5 rounded border border-sam-border text-sam-text-dim hover:border-sam-error/50 hover:text-sam-error transition-all font-display font-medium text-[10px]">✕</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setActiveChannelConfig('matrix')} className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-sam-border bg-sam-surface/50 hover:border-[#0DBD8B]/50 hover:bg-[#0DBD8B]/5 transition-all w-full text-xs group">
                <div className="w-6 h-6 rounded-md bg-[#0DBD8B] flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M.632.55v22.9H2.28V24H0V0h2.28v.55zm7.043 7.26v1.157h.033c.309-.443.683-.784 1.117-1.024.433-.245.936-.365 1.5-.365.54 0 1.033.107 1.481.314.448.208.785.582 1.02 1.108.254-.374.6-.706 1.034-.992.434-.287.95-.43 1.546-.43.453 0 .872.056 1.26.167.388.11.716.286.993.53.276.245.489.559.646.951.152.392.23.863.23 1.417v5.728h-2.349V11.52c0-.286-.01-.559-.032-.812a1.755 1.755 0 00-.18-.66 1.106 1.106 0 00-.438-.448c-.194-.11-.457-.166-.785-.166-.332 0-.6.064-.803.189a1.38 1.38 0 00-.48.499 1.946 1.946 0 00-.231.696 5.56 5.56 0 00-.06.785v4.768h-2.35v-4.8c0-.254-.004-.503-.018-.752a2.074 2.074 0 00-.143-.688 1.052 1.052 0 00-.415-.503c-.194-.125-.476-.19-.854-.19-.111 0-.259.024-.439.074-.18.051-.36.143-.53.282-.171.138-.319.334-.439.588-.12.254-.18.593-.18 1.02v4.966H5.46V7.81zm15.693 15.64V.55H21.72V0H24v24h-2.28v-.55z" />
                  </svg>
                </div>
                <span className="font-medium text-sam-text group-hover:text-[#0DBD8B] transition-colors">Matrix</span>
                <ArrowRight className="w-3 h-3 text-sam-text-dim ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            )}

            {/* SMS (Twilio) */}
            {activeChannelConfig === 'sms' ? (
              <div className="p-3 rounded-lg border border-sam-accent/30 bg-sam-accent/5 space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-5 h-5 rounded bg-sam-accent flex items-center justify-center">
                    <MessageCircle className="w-3 h-3 text-sam-bg" />
                  </div>
                  <span className="text-xs font-semibold text-sam-accent">Configure SMS (Twilio)</span>
                </div>
                {channelError && <div className="p-2 rounded bg-sam-error/10 border border-sam-error/30 text-sam-error text-[10px]">{channelError}</div>}
                <div>
                  <label className="block text-[10px] font-mono text-sam-text-dim mb-0.5">Account SID <span className="text-sam-error">*</span></label>
                  <input type="text" value={twilioAccountSid} onChange={(e) => setTwilioAccountSid(e.target.value)} placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" className="w-full px-2 py-1.5 rounded bg-sam-bg border border-sam-border focus:border-sam-accent outline-none font-mono text-[10px] transition-colors" />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-sam-text-dim mb-0.5">Auth Token <span className="text-sam-error">*</span></label>
                  <input type="password" value={twilioAuthToken} onChange={(e) => setTwilioAuthToken(e.target.value)} placeholder="your_auth_token" className="w-full px-2 py-1.5 rounded bg-sam-bg border border-sam-border focus:border-sam-accent outline-none font-mono text-[10px] transition-colors" />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-sam-text-dim mb-0.5">Phone Number <span className="text-sam-error">*</span></label>
                  <input type="text" value={twilioPhoneNumber} onChange={(e) => setTwilioPhoneNumber(e.target.value)} placeholder="+1234567890" className="w-full px-2 py-1.5 rounded bg-sam-bg border border-sam-border focus:border-sam-accent outline-none font-mono text-[10px] transition-colors" />
                  <p className="mt-0.5 text-[9px] text-sam-text-dim">Get credentials from <a href="https://console.twilio.com" target="_blank" rel="noopener noreferrer" className="text-sam-accent hover:underline">Twilio Console</a></p>
                </div>
                <div className="flex items-center gap-1.5 pt-1">
                  <button onClick={() => { setChannelError('Channel configuration coming soon'); }} disabled={isConfiguringChannel || !twilioAccountSid.trim() || !twilioAuthToken.trim() || !twilioPhoneNumber.trim()} className="flex-1 px-2 py-1.5 rounded bg-sam-accent text-sam-bg hover:bg-sam-accent-dim disabled:opacity-50 disabled:cursor-not-allowed transition-all font-display font-medium text-[10px] flex items-center justify-center gap-1">
                    {isConfiguringChannel ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : 'Connect'}
                  </button>
                  <button onClick={() => { setActiveChannelConfig(null); setChannelError(null); setTwilioAccountSid(''); setTwilioAuthToken(''); setTwilioPhoneNumber(''); }} className="px-2 py-1.5 rounded border border-sam-border text-sam-text-dim hover:border-sam-error/50 hover:text-sam-error transition-all font-display font-medium text-[10px]">✕</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setActiveChannelConfig('sms')} className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-sam-border bg-sam-surface/50 hover:border-sam-accent/50 hover:bg-sam-accent/5 transition-all w-full text-xs group">
                <div className="w-6 h-6 rounded-md bg-sam-accent flex items-center justify-center flex-shrink-0">
                  <MessageCircle className="w-3.5 h-3.5 text-sam-bg" />
                </div>
                <span className="font-medium text-sam-text group-hover:text-sam-accent transition-colors">SMS</span>
                <ArrowRight className="w-3 h-3 text-sam-text-dim ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            )}

            {/* Email (IMAP) */}
            {activeChannelConfig === 'email' ? (
              <div className="p-3 rounded-lg border border-[#EA4335]/30 bg-[#EA4335]/5 space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-5 h-5 rounded bg-gradient-to-br from-[#4285F4] via-[#EA4335] to-[#FBBC05] flex items-center justify-center">
                    <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
                    </svg>
                  </div>
                  <span className="text-xs font-semibold text-[#EA4335]">Configure Email (IMAP)</span>
                </div>
                {channelError && <div className="p-2 rounded bg-sam-error/10 border border-sam-error/30 text-sam-error text-[10px]">{channelError}</div>}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-mono text-sam-text-dim mb-0.5">IMAP Server <span className="text-sam-error">*</span></label>
                    <input type="text" value={emailImapServer} onChange={(e) => setEmailImapServer(e.target.value)} placeholder="imap.gmail.com" className="w-full px-2 py-1.5 rounded bg-sam-bg border border-sam-border focus:border-[#EA4335] outline-none font-mono text-[10px] transition-colors" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono text-sam-text-dim mb-0.5">IMAP Port</label>
                    <input type="text" value={emailImapPort} onChange={(e) => setEmailImapPort(e.target.value)} placeholder="993" className="w-full px-2 py-1.5 rounded bg-sam-bg border border-sam-border focus:border-[#EA4335] outline-none font-mono text-[10px] transition-colors" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-mono text-sam-text-dim mb-0.5">SMTP Server <span className="text-sam-error">*</span></label>
                    <input type="text" value={emailSmtpServer} onChange={(e) => setEmailSmtpServer(e.target.value)} placeholder="smtp.gmail.com" className="w-full px-2 py-1.5 rounded bg-sam-bg border border-sam-border focus:border-[#EA4335] outline-none font-mono text-[10px] transition-colors" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono text-sam-text-dim mb-0.5">SMTP Port</label>
                    <input type="text" value={emailSmtpPort} onChange={(e) => setEmailSmtpPort(e.target.value)} placeholder="587" className="w-full px-2 py-1.5 rounded bg-sam-bg border border-sam-border focus:border-[#EA4335] outline-none font-mono text-[10px] transition-colors" />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-sam-text-dim mb-0.5">Email Address <span className="text-sam-error">*</span></label>
                  <input type="email" value={emailUsername} onChange={(e) => setEmailUsername(e.target.value)} placeholder="you@example.com" className="w-full px-2 py-1.5 rounded bg-sam-bg border border-sam-border focus:border-[#EA4335] outline-none font-mono text-[10px] transition-colors" />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-sam-text-dim mb-0.5">Password / App Password <span className="text-sam-error">*</span></label>
                  <input type="password" value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} placeholder="••••••••" className="w-full px-2 py-1.5 rounded bg-sam-bg border border-sam-border focus:border-[#EA4335] outline-none font-mono text-[10px] transition-colors" />
                  <p className="mt-0.5 text-[9px] text-sam-text-dim">For Gmail, use an <a href="https://support.google.com/accounts/answer/185833" target="_blank" rel="noopener noreferrer" className="text-[#EA4335] hover:underline">App Password</a></p>
                </div>
                <div className="flex items-center gap-1.5 pt-1">
                  <button onClick={() => { setChannelError('Channel configuration coming soon'); }} disabled={isConfiguringChannel || !emailImapServer.trim() || !emailSmtpServer.trim() || !emailUsername.trim() || !emailPassword.trim()} className="flex-1 px-2 py-1.5 rounded bg-[#EA4335] text-white hover:bg-[#D33426] disabled:opacity-50 disabled:cursor-not-allowed transition-all font-display font-medium text-[10px] flex items-center justify-center gap-1">
                    {isConfiguringChannel ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : 'Connect'}
                  </button>
                  <button onClick={() => { setActiveChannelConfig(null); setChannelError(null); setEmailImapServer(''); setEmailSmtpServer(''); setEmailUsername(''); setEmailPassword(''); setEmailImapPort('993'); setEmailSmtpPort('587'); }} className="px-2 py-1.5 rounded border border-sam-border text-sam-text-dim hover:border-sam-error/50 hover:text-sam-error transition-all font-display font-medium text-[10px]">✕</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setActiveChannelConfig('email')} className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-sam-border bg-sam-surface/50 hover:border-[#EA4335]/50 hover:bg-[#EA4335]/5 transition-all w-full text-xs group">
                <div className="w-6 h-6 rounded-md bg-gradient-to-br from-[#4285F4] via-[#EA4335] to-[#FBBC05] flex items-center justify-center flex-shrink-0">
                  <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
                  </svg>
                </div>
                <span className="font-medium text-sam-text group-hover:text-[#EA4335] transition-colors">Email (IMAP)</span>
                <ArrowRight className="w-3 h-3 text-sam-text-dim ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LearningSourcesPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#0f0f1a] to-[#1a1a2e] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500"></div>
      </div>
    }>
      <LearningSourcesContent />
    </Suspense>
  )
}