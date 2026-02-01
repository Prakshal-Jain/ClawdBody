'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'
import { motion } from 'framer-motion'
import { Mail, Calendar, MessageSquare, FileText, MessageCircle, Bot, Video, Phone, Loader2, RefreshCw, Check, Key, AlertCircle, ArrowRight, ExternalLink, LogOut, Github, X, Server, GitBranch, Terminal, CheckCircle2, ChevronDown, ChevronUp, Trash2, XCircle, Monitor, AlertTriangle, RotateCcw } from 'lucide-react'
import { WebTerminal } from '@/components/WebTerminal'
import { OrgoTerminal } from '@/components/OrgoTerminal'
import { E2BTerminal } from '@/components/E2BTerminal'
import { ClawdbotChat } from '@/components/ClawdbotChat'
import { OrgoVNCDisplay } from '@/components/OrgoVNCDisplay'
import { AI_PROVIDERS, AIProvider, getAIProvider, getAllProviders } from '@/lib/ai-providers'

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
  const [selectedAIProvider, setSelectedAIProvider] = useState<AIProvider>('anthropic')
  const [aiApiKey, setAiApiKey] = useState('')
  const [telegramBotToken, setTelegramBotToken] = useState('')
  const [telegramUserId, setTelegramUserId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
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
    const providerConfig = getAIProvider(selectedAIProvider)
    if (!aiApiKey.trim()) {
      setSetupError(`${providerConfig.displayName} API key is required`)
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
          aiProvider: selectedAIProvider,
          aiApiKey: aiApiKey.trim(),
          // Also send as claudeApiKey for backward compatibility
          claudeApiKey: selectedAIProvider === 'anthropic' ? aiApiKey.trim() : undefined,
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
      addLog('info', 'Creating Orgo VM...')

      // Clear the input
      setAiApiKey('')
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
                        Your VM has been provisioned. Select your AI provider and enter your API key below to complete the setup.
                      </p>
                    </div>
                  </motion.div>
                )}

                <h2 className="text-2xl font-display font-bold mb-2">Enter your API Keys</h2>

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
                  {/* AI Provider Selection */}
                  <div>
                    <label className="block text-sm font-mono text-sam-text-dim mb-2">
                      AI Provider <span className="text-sam-error">*</span>
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {getAllProviders().map((provider) => (
                        <button
                          key={provider.id}
                          type="button"
                          onClick={() => {
                            setSelectedAIProvider(provider.id)
                            setAiApiKey('') // Clear API key when switching providers
                          }}
                          className={`p-4 rounded-lg border text-left transition-all ${selectedAIProvider === provider.id
                              ? 'border-sam-accent bg-sam-accent/10'
                              : 'border-sam-border bg-sam-bg hover:border-sam-accent/50'
                            }`}
                        >
                          <div className="font-display font-semibold text-sam-text mb-1">
                            {provider.displayName}
                          </div>
                          <div className="text-xs text-sam-text-dim">
                            {provider.models[0]?.name}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* API Key Input */}
                  <div>
                    <label className="block text-sm font-mono text-sam-text-dim mb-2">
                      {getAIProvider(selectedAIProvider).displayName} API Key <span className="text-sam-error">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="password"
                        value={aiApiKey}
                        onChange={(e) => setAiApiKey(e.target.value)}
                        placeholder={getAIProvider(selectedAIProvider).apiKeyPlaceholder}
                        className="w-full px-4 py-3 rounded-lg bg-sam-bg border border-sam-border focus:border-sam-accent outline-none font-mono text-sm transition-colors"
                      />
                    </div>
                    <a
                      href={getAIProvider(selectedAIProvider).getApiKeyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 mt-2 text-xs text-sam-accent hover:underline"
                    >
                      Get your key from {getAIProvider(selectedAIProvider).displayName}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  <div>
                    <label className="block text-sm font-mono text-sam-text-dim mb-2">
                      Telegram Bot Token <span className="text-sam-text-dim text-xs">(Optional)</span>
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

                  {telegramBotToken.trim() && (
                    <div>
                      <label className="block text-sm font-mono text-sam-text-dim mb-2">
                        Telegram User ID <span className="text-sam-text-dim text-xs">(Optional - for allowlist)</span>
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
                  )}
                </div>

                <button
                  onClick={handleStartSetup}
                  disabled={isSubmitting || !aiApiKey.trim()}
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
                Clawdbot is still actively in development and might be rough around the edges.
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

            {/* VM Provisioning Failure - Special prominent error */}
            {setupStatus?.errorMessage && (
              setupStatus.errorMessage.includes('Failed to install Python and essential tools on VM') ||
              setupStatus.errorMessage.includes('VM not ready after waiting') ||
              setupStatus.errorMessage.includes('Proxy error')
            ) && setupStatus?.vmProvider === 'orgo' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mb-6 p-5 rounded-xl bg-sam-error/10 border-2 border-sam-error/50"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-sam-error/20 flex items-center justify-center flex-shrink-0">
                      <AlertTriangle className="w-6 h-6 text-sam-error" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sam-error font-bold text-lg mb-2">VM Provisioning Failed</h3>
                      <p className="text-sam-text-dim text-sm mb-3">
                        The Orgo VM appears to have failed to provision correctly. This can happen occasionally when the cloud provider experiences issues starting the virtual machine.
                      </p>
                      <div className="p-3 rounded-lg bg-sam-bg/50 border border-sam-border mb-4">
                        <p className="text-xs text-sam-text-dim font-mono">
                          <strong className="text-sam-error">Error:</strong> {setupStatus.errorMessage}
                        </p>
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            // Call reprovision API - this will delete old VM, create new one, and set it up
                            const res = await fetch('/api/setup/reprovision', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ vmId }),
                            })

                            if (!res.ok) {
                              const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
                              throw new Error(errorData.error || 'Failed to start reprovision')
                            }

                            // Refresh the page to show provisioning progress
                            window.location.reload()
                          } catch (err) {
                            alert(`Failed to reprovision: ${err instanceof Error ? err.message : 'Unknown error'}. Please try again.`)
                          }
                        }}
                        className="flex items-center gap-2 px-5 py-3 rounded-lg bg-sam-accent text-sam-bg font-bold hover:bg-sam-accent/90 transition-all"
                      >
                        <RotateCcw className="w-5 h-5" />
                        Reprovision VM
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

            {/* Regular Error Message (for non-provisioning errors) */}
            {setupStatus?.errorMessage && !(
              (setupStatus.errorMessage.includes('Failed to install Python and essential tools on VM') ||
                setupStatus.errorMessage.includes('VM not ready after waiting') ||
                setupStatus.errorMessage.includes('Proxy error')) &&
              setupStatus?.vmProvider === 'orgo'
            ) && (
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
  vmId
}: {
  setupStatus: SetupStatus
  onStatusUpdate?: () => Promise<void>
  onDelete: () => Promise<void>
  vmId?: string | null
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
                  title="Orgo Terminal"
                  className="w-full h-full"
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
            <div className="flex items-center gap-1.5 text-[10px]">
              {setupStatus.telegramConfigured && setupStatus.gatewayStarted ? (
                <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
              ) : (
                <XCircle className="w-3 h-3 text-sam-text-dim flex-shrink-0" />
              )}
              <span className="text-sam-text-dim">Telegram</span>
            </div>
          </div>
        </div>

        {/* Telegram Configuration */}
        {!setupStatus.telegramConfigured ? (
          <div className="mb-3 p-3 rounded-lg border border-sam-border bg-sam-surface/30">
            {!showTelegramConfig ? (
              <button
                onClick={() => setShowTelegramConfig(true)}
                className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg border border-sam-accent text-sam-accent hover:bg-sam-accent/10 transition-all font-display font-medium text-xs"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                Configure Telegram
              </button>
            ) : (
              <div className="space-y-2">
                <h4 className="text-xs font-display font-semibold text-sam-text mb-1">Configure Telegram</h4>
                {telegramError && (
                  <div className="p-2 rounded bg-sam-error/10 border border-sam-error/30 text-sam-error text-xs">
                    {telegramError}
                  </div>
                )}
                <div>
                  <label className="block text-[10px] font-mono text-sam-text-dim mb-0.5">
                    Bot Token <span className="text-sam-error">*</span>
                  </label>
                  <input
                    type="password"
                    value={telegramBotToken}
                    onChange={(e) => setTelegramBotToken(e.target.value)}
                    placeholder="1234567890:ABCdef..."
                    className="w-full px-2 py-1.5 rounded bg-sam-bg border border-sam-border focus:border-sam-accent outline-none font-mono text-[10px] transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-sam-text-dim mb-0.5">
                    User ID <span className="text-sam-text-dim">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={telegramUserId}
                    onChange={(e) => setTelegramUserId(e.target.value)}
                    placeholder="123456789"
                    className="w-full px-2 py-1.5 rounded bg-sam-bg border border-sam-border focus:border-sam-accent outline-none font-mono text-[10px] transition-colors"
                  />
                </div>
                <div className="flex items-center gap-1.5 pt-1">
                  <button
                    onClick={async () => {
                      if (!telegramBotToken.trim()) {
                        setTelegramError('Bot token is required')
                        return
                      }
                      setIsConfiguringTelegram(true)
                      setTelegramError(null)
                      try {
                        const res = await fetch('/api/setup/configure-telegram', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            telegramBotToken: telegramBotToken.trim(),
                            telegramUserId: telegramUserId.trim() || undefined,
                            vmId: vmId || undefined,
                          }),
                        })
                        if (!res.ok) {
                          const data = await res.json()
                          throw new Error(data.error || 'Failed to configure Telegram')
                        }
                        const data = await res.json()
                        setShowTelegramConfig(false)
                        setTelegramBotToken('')
                        setTelegramUserId('')
                        if (onStatusUpdate) {
                          await onStatusUpdate()
                        } else {
                          window.location.reload()
                        }
                      } catch (error) {
                        setTelegramError(error instanceof Error ? error.message : 'Failed to configure Telegram')
                      } finally {
                        setIsConfiguringTelegram(false)
                      }
                    }}
                    disabled={isConfiguringTelegram || !telegramBotToken.trim()}
                    className="flex-1 px-2 py-1.5 rounded bg-sam-accent text-sam-bg hover:bg-sam-accent-dim disabled:opacity-50 disabled:cursor-not-allowed transition-all font-display font-medium text-[10px] flex items-center justify-center gap-1"
                  >
                    {isConfiguringTelegram ? (
                      <>
                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        ...
                      </>
                    ) : (
                      'Save'
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setShowTelegramConfig(false)
                      setTelegramBotToken('')
                      setTelegramUserId('')
                      setTelegramError(null)
                    }}
                    className="px-2 py-1.5 rounded border border-sam-border text-sam-text-dim hover:border-sam-error/50 hover:text-sam-error transition-all font-display font-medium text-[10px]"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mb-3 p-2 rounded-lg border border-green-500/30 bg-green-500/10">
            <div className="flex items-center gap-1.5 text-[10px] text-green-500">
              <CheckCircle2 className="w-3 h-3" />
              <span>Telegram connected</span>
            </div>
          </div>
        )}

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