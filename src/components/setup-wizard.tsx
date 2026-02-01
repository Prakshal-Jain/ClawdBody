'use client'

import { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircle2,
  Circle,
  Loader2,
  Server,
  GitBranch,
  Terminal,
  LogOut,
  ExternalLink,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Trash2,
  MessageCircle,
  XCircle,
  AlertTriangle,
  RotateCcw
} from 'lucide-react'

type SetupStep =
  | 'provisioning'
  | 'creating_repo'
  | 'configuring_vm'
  | 'complete'

interface SetupStatus {
  status: string
  vmCreated: boolean
  clawdbotInstalled: boolean
  telegramConfigured: boolean
  gatewayStarted: boolean
  vmProvider?: string
  // Orgo-specific fields
  orgoComputerId?: string
  orgoComputerUrl?: string
  // AWS-specific fields
  awsInstanceId?: string
  awsInstanceName?: string
  awsPublicIp?: string
  awsRegion?: string
  awsConsoleUrl?: string
  // Common fields
  errorMessage?: string
}

export function SetupWizard() {
  const { data: session } = useSession()
  const [currentStep, setCurrentStep] = useState<SetupStep>('provisioning')
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currentScreenshot, setCurrentScreenshot] = useState<string | null>(null)
  const [isProgressCollapsed, setIsProgressCollapsed] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isReprovisioning, setIsReprovisioning] = useState(false)

  // Check if the error indicates VM provisioning failure (Orgo VM failed to start)
  const isVMProvisioningFailure = error?.includes('Failed to install Python and essential tools on VM') ||
    error?.includes('VM not ready after waiting') ||
    error?.includes('Proxy error')

  // Check if we have a valid VM identifier for screenshots
  const hasVmIdentifier = setupStatus?.vmCreated && (
    setupStatus?.orgoComputerId || setupStatus?.awsInstanceId
  )

  // Poll for screenshots if VM is created (Orgo only - AWS doesn't support screenshots)
  useEffect(() => {
    // Only poll screenshots for Orgo VMs (AWS EC2 doesn't have built-in screenshot API)
    if (!setupStatus?.orgoComputerId || !setupStatus?.vmCreated || setupStatus?.vmProvider === 'aws') {
      return
    }

    const fetchScreenshot = async () => {
      try {
        const res = await fetch('/api/setup/screenshot')
        if (res.ok) {
          const data = await res.json()
          // Handle both base64 image and image URL
          if (data.image && data.image.length > 0) {
            setCurrentScreenshot(data.image)
          } else if (data.imageUrl) {
            // If we got a URL, use it directly
            setCurrentScreenshot(data.imageUrl)
          } else if (data.error) {
            // Only log non-503 errors (503 means VM is starting, which is expected)
            if (res.status !== 503) {
            }
          }
        } else {
          // 503 (Service Unavailable) means VM is starting - this is expected, don't log as error
          if (res.status === 503) {
            // VM is still starting, this is normal - don't log as error
            return
          }

          const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
          // Only log non-503 errors
          if (res.status !== 503) {
          }
        }
      } catch (error) {
        // Network errors are also expected during VM startup
        // Don't clear the existing screenshot on transient errors
      }
    }

    // Initial fetch
    fetchScreenshot()

    // Poll every 500ms for smooth video-like stream
    const interval = setInterval(fetchScreenshot, 500)

    return () => clearInterval(interval)
  }, [setupStatus?.orgoComputerId, setupStatus?.vmCreated])

  // Check setup status on mount
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await fetch('/api/setup/status')
        if (res.ok) {
          const status: SetupStatus = await res.json()
          setSetupStatus(status)

          // Update step based on status - check status field first, then boolean flags
          if (status.status === 'requires_payment') {
            // Don't set error for billing notice - it's handled separately in the UI
            setCurrentStep('provisioning')
          } else if (status.errorMessage) {
            setError(status.errorMessage)
            // Don't change step, just show error
          } else if (status.status === 'ready') {
            setCurrentStep('complete')
          } else if (status.status === 'configuring_vm') {
            setCurrentStep('configuring_vm')
          } else if (status.vmCreated) {
            setCurrentStep('configuring_vm')
          } else if (status.status === 'provisioning') {
            setCurrentStep('provisioning')
          } else {
            // If no active setup, show complete
            setCurrentStep('complete')
          }
        }
      } catch (e) {
      }
    }

    checkStatus()
  }, [])

  // Poll for setup status during provisioning
  useEffect(() => {
    if (currentStep === 'provisioning' || currentStep === 'configuring_vm') {
      const interval = setInterval(async () => {
        try {
          const res = await fetch('/api/setup/status')
          if (res.ok) {
            const status: SetupStatus = await res.json()
            setSetupStatus(status)

            // Update step based on status - check status field first, then boolean flags
            if (status.status === 'requires_payment') {
              // Don't set error for billing notice - it's handled separately in the UI
              setCurrentStep('provisioning')
            } else if (status.errorMessage) {
              setError(status.errorMessage)
              // Don't change step, just show error
            } else if (status.status === 'ready') {
              setCurrentStep('complete')
            } else if (status.status === 'configuring_vm' || status.clawdbotInstalled) {
              setCurrentStep('configuring_vm')
            } else if (status.status === 'provisioning') {
              setCurrentStep('provisioning')
            }
          }
        } catch (e) {
        }
      }, 2000)

      return () => clearInterval(interval)
    }
  }, [currentStep])

  const steps = [
    { id: 'provisioning', label: 'VM Setup', icon: Server },
    { id: 'configuring_vm', label: 'Configure', icon: Terminal },
    { id: 'complete', label: 'Ready', icon: CheckCircle2 },
  ]

  const getStepStatus = (stepId: string) => {
    const stepOrder = ['provisioning', 'configuring_vm', 'complete']
    const currentIndex = stepOrder.indexOf(currentStep)
    const stepIndex = stepOrder.indexOf(stepId)

    if (stepIndex < currentIndex) return 'complete'
    if (stepIndex === currentIndex) return 'current'
    return 'pending'
  }

  return (
    <div className="min-h-screen bg-sam-bg relative">
      {/* Ambient glow - warm orange inspired by "Her" */}
      <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-sam-accent/8 rounded-full blur-[150px] pointer-events-none" />

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-12">
          <div>
            <h1 className="font-display text-3xl font-bold mb-1">
              <span className="text-gradient">ClawdBody</span> Setup
            </h1>
            <p className="text-sam-text-dim font-mono text-sm">
              Welcome, {session?.user?.name || 'Agent'}
            </p>
          </div>

          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-sam-border hover:border-sam-error/50 text-sam-text-dim hover:text-sam-error transition-all"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-sm font-mono">Sign out</span>
          </button>
        </div>

        {/* Progress steps */}
        <div className="flex items-center justify-between mb-12 relative">
          {/* Progress line */}
          <div className="absolute top-5 left-0 right-0 h-0.5 bg-sam-border" />
          <motion.div
            className="absolute top-5 left-0 h-0.5 bg-sam-accent"
            initial={{ width: '0%' }}
            animate={{
              width: `${(steps.findIndex(s => s.id === currentStep) / (steps.length - 1)) * 100}%`
            }}
            transition={{ duration: 0.5 }}
          />

          {steps.map((step, index) => {
            const status = getStepStatus(step.id)
            const Icon = step.icon

            return (
              <div key={step.id} className="relative flex flex-col items-center">
                <motion.div
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  className={`
                    w-10 h-10 rounded-full flex items-center justify-center z-10 transition-all duration-300
                    ${status === 'complete' ? 'bg-sam-accent text-sam-bg' : ''}
                    ${status === 'current' ? 'bg-sam-surface border-2 border-sam-accent text-sam-accent' : ''}
                    ${status === 'pending' ? 'bg-sam-surface border border-sam-border text-sam-text-dim' : ''}
                  `}
                >
                  {status === 'complete' ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : status === 'current' && currentStep !== 'complete' ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Icon className="w-5 h-5" />
                  )}
                </motion.div>
                <span className={`
                  mt-2 text-xs font-mono
                  ${status === 'current' ? 'text-sam-accent' : 'text-sam-text-dim'}
                `}>
                  {step.label}
                </span>
              </div>
            )
          })}
        </div>

        {/* Step content */}
        <AnimatePresence mode="wait">
          {(currentStep === 'provisioning' || currentStep === 'configuring_vm') && (
            <motion.div
              key="provisioning"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Billing Notice for Free Tier accounts */}
              {setupStatus?.status === 'requires_payment' && setupStatus?.errorMessage?.startsWith('BILLING_REQUIRED:') && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="p-5 rounded-xl bg-amber-500/10 border border-amber-500/30"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                      <AlertCircle className="w-5 h-5 text-amber-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-amber-400 font-medium mb-2">Payment Method Required</h3>
                      <p className="text-sam-text-dim text-sm mb-3">
                        The instance type <code className="text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded font-mono text-xs">{setupStatus.errorMessage.split(':')[1]}</code> requires a payment method on your AWS account.
                      </p>
                      <p className="text-sam-text-dim text-sm mb-4">
                        You can either:
                      </p>
                      <ul className="text-sm text-sam-text-dim space-y-2 mb-4">
                        <li className="flex items-start gap-2">
                          <span className="text-amber-400">1.</span>
                          <span>Add a payment method to your AWS account to use paid instance types</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-amber-400">2.</span>
                          <span>Go back and select a <strong className="text-green-400">Free Tier</strong> instance type like m7i-flex.large (8 GB)</span>
                        </li>
                      </ul>
                      <div className="flex flex-wrap gap-3">
                        <a
                          href="https://console.aws.amazon.com/billing/home#/paymentmethods"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors text-sm font-medium"
                        >
                          <ExternalLink className="w-4 h-4" />
                          Add Payment Method
                        </a>
                        <button
                          onClick={() => window.location.href = '/select-vm'}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-sam-border text-sam-text-dim hover:text-sam-text hover:border-sam-accent/50 transition-colors text-sm font-medium"
                        >
                          ← Change Instance Type
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* VM Provisioning Failure - Special prominent error */}
              {error && isVMProvisioningFailure && setupStatus?.vmProvider === 'orgo' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="p-5 rounded-xl bg-sam-error/10 border-2 border-sam-error/50"
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
                          <strong className="text-sam-error">Error:</strong> {error}
                        </p>
                      </div>
                      <button
                        onClick={async () => {
                          setIsReprovisioning(true)
                          try {
                            // Call reprovision API - this will delete old VM, create new one, and set it up
                            const res = await fetch('/api/setup/reprovision', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({}),
                            })

                            if (!res.ok) {
                              const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
                              throw new Error(errorData.error || 'Failed to start reprovision')
                            }

                            // Reset local state - the polling will pick up the new status
                            setError(null)
                            setCurrentStep('provisioning')
                            setSetupStatus(prev => prev ? {
                              ...prev,
                              vmCreated: false,
                              status: 'provisioning',
                              errorMessage: undefined,
                              orgoComputerId: undefined,
                              orgoComputerUrl: undefined,
                            } : null)
                          } catch (err) {
                            setError(`Failed to reprovision: ${err instanceof Error ? err.message : 'Unknown error'}`)
                          } finally {
                            setIsReprovisioning(false)
                          }
                        }}
                        disabled={isReprovisioning}
                        className="flex items-center gap-2 px-5 py-3 rounded-lg bg-sam-accent text-sam-bg font-bold hover:bg-sam-accent/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isReprovisioning ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Reprovisioning...
                          </>
                        ) : (
                          <>
                            <RotateCcw className="w-5 h-5" />
                            Reprovision VM
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Regular error display (for non-provisioning errors) */}
              {error && !isVMProvisioningFailure && setupStatus?.status !== 'requires_payment' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="p-4 rounded-lg bg-sam-error/10 border border-sam-error/30 flex items-start gap-3"
                >
                  <AlertCircle className="w-5 h-5 text-sam-error flex-shrink-0 mt-0.5" />
                  <p className="text-sam-error text-sm">{error}</p>
                </motion.div>
              )}

              {/* Two-column layout: VM stream on left, progress on right */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* VM Stream on Left */}
                <div className="rounded-2xl border border-sam-border bg-sam-surface/50 backdrop-blur overflow-hidden">
                  <div className="px-6 py-4 border-b border-sam-border bg-sam-surface/50 flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-display font-bold text-sam-text">
                        {setupStatus?.vmProvider === 'aws' ? 'EC2 Instance' : 'VM Screen'}
                      </h3>
                      <p className="text-xs text-sam-text-dim font-mono">
                        {setupStatus?.vmProvider === 'aws'
                          ? (setupStatus?.awsPublicIp || 'Provisioning...')
                          : 'Live view'}
                      </p>
                    </div>
                    {setupStatus?.vmProvider === 'aws' && setupStatus?.awsConsoleUrl && (
                      <a
                        href={setupStatus.awsConsoleUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-sam-accent hover:underline flex items-center gap-1"
                      >
                        Open in AWS Console
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {setupStatus?.vmProvider !== 'aws' && setupStatus?.orgoComputerUrl && (
                      <a
                        href={setupStatus.orgoComputerUrl}
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
                    {setupStatus?.vmProvider === 'aws' ? (
                      // AWS EC2 doesn't have built-in screenshot API
                      <div className="flex flex-col items-center gap-4 text-sam-text-dim p-8">
                        {setupStatus?.vmCreated ? (
                          <>
                            <div className="w-16 h-16 rounded-full bg-sam-accent/10 flex items-center justify-center">
                              <CheckCircle2 className="w-8 h-8 text-sam-accent" />
                            </div>
                            <div className="text-center">
                              <p className="text-sam-text font-medium mb-1">EC2 Instance Running</p>
                              <p className="text-xs text-sam-text-dim font-mono">{setupStatus?.awsInstanceName}</p>
                              {setupStatus?.awsPublicIp && (
                                <p className="text-xs text-sam-accent font-mono mt-1">
                                  IP: {setupStatus.awsPublicIp}
                                </p>
                              )}
                            </div>
                          </>
                        ) : (
                          <>
                            <Loader2 className="w-8 h-8 animate-spin text-sam-accent" />
                            <p className="text-sm font-mono">Creating EC2 instance...</p>
                          </>
                        )}
                      </div>
                    ) : setupStatus?.vmCreated && setupStatus?.orgoComputerId ? (
                      currentScreenshot ? (
                        <img
                          src={currentScreenshot.startsWith('http') ? currentScreenshot : `data:image/png;base64,${currentScreenshot}`}
                          alt="VM Screen"
                          className="w-full h-full object-contain"
                          onError={(e) => {
                            setCurrentScreenshot(null)
                          }}
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-3 text-sam-text-dim">
                          <Loader2 className="w-8 h-8 animate-spin text-sam-accent" />
                          <p className="text-sm font-mono">Loading VM screen...</p>
                        </div>
                      )
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
                        This takes about 2-3 minutes. Please don't close this page.
                      </p>
                    </div>
                    {isProgressCollapsed ? (
                      <ChevronDown className="w-5 h-5 text-sam-text-dim" />
                    ) : (
                      <ChevronUp className="w-5 h-5 text-sam-text-dim" />
                    )}
                  </div>

                  {!isProgressCollapsed && (
                    <div className="p-6 overflow-y-auto max-h-[calc(100vh-400px)]">
                      <div className="space-y-4">
                        <SetupTaskItem
                          label="Creating VM"
                          sublabel={setupStatus?.vmProvider === 'aws' ? `AWS EC2 - ${setupStatus?.awsRegion || 'us-east-1'}` : setupStatus?.vmProvider === 'e2b' ? 'E2B Sandbox' : 'Orgo - Project: claude-code'}
                          status={setupStatus?.vmCreated ? 'complete' : currentStep === 'provisioning' ? 'running' : 'pending'}
                        />
                        <SetupTaskItem
                          label="Installing Python & tools"
                          sublabel="Python3, essential tools"
                          status={(setupStatus?.vmCreated && currentStep === 'configuring_vm') ? 'running' : setupStatus?.vmCreated ? 'complete' : 'pending'}
                        />
                        <SetupTaskItem
                          label="Installing AI SDKs"
                          sublabel="Anthropic SDK, Pillow, requests"
                          status={(setupStatus?.vmCreated && currentStep === 'configuring_vm') ? 'running' : setupStatus?.vmCreated ? 'complete' : 'pending'}
                        />
                        <SetupTaskItem
                          label="Installing Clawdbot"
                          sublabel="NVM + Node.js 22 + Clawdbot"
                          status={setupStatus?.clawdbotInstalled ? 'complete' : (setupStatus?.vmCreated && currentStep === 'configuring_vm') ? 'running' : 'pending'}
                        />
                        <SetupTaskItem
                          label="Configuring Telegram"
                          sublabel="Chat gateway with heartbeat"
                          status={setupStatus?.telegramConfigured ? 'complete' : (setupStatus?.clawdbotInstalled && currentStep === 'configuring_vm') ? 'running' : 'pending'}
                        />
                        <SetupTaskItem
                          label="Starting gateway"
                          sublabel="Clawdbot gateway on port 18789"
                          status={setupStatus?.gatewayStarted ? 'complete' : (setupStatus?.telegramConfigured && currentStep === 'configuring_vm') ? 'running' : 'pending'}
                        />
                      </div>

                      {/* Terminal output preview */}
                      <div className="mt-6 p-4 rounded-xl border border-sam-border bg-sam-bg font-mono text-xs overflow-hidden">
                        <div className="flex items-center gap-2 mb-3 text-sam-text-dim">
                          <Terminal className="w-4 h-4" />
                          <span>VM Console</span>
                        </div>
                        <div className="text-sam-accent">
                          <span className="text-sam-text-dim">$</span> {getTerminalText(currentStep, setupStatus)}
                          <span className="terminal-cursor">▊</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {currentStep === 'complete' && (
            <motion.div
              key="complete"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="p-8 rounded-2xl border border-sam-accent/30 bg-sam-accent/5 backdrop-blur text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', delay: 0.2 }}
                  className="w-20 h-20 rounded-full bg-sam-accent/20 flex items-center justify-center mx-auto mb-6"
                >
                  <CheckCircle2 className="w-10 h-10 text-sam-accent" />
                </motion.div>

                <div className="flex items-center justify-between mb-4">
                  <div className="flex-1">
                    <h2 className="text-3xl font-display font-bold mb-2">
                      <span className="text-gradient">ClawdBody is ready</span>
                    </h2>
                    <p className="text-sam-text-dim max-w-md">
                      Your AI agent is fully configured and ready to assist you.
                    </p>
                  </div>
                  {setupStatus?.orgoComputerId && (
                    <button
                      onClick={async () => {
                        if (!confirm('Are you sure you want to delete your computer? This will reset your setup and you will need to start over.')) {
                          return
                        }
                        setIsDeleting(true)
                        try {
                          const res = await fetch('/api/setup/delete-computer', {
                            method: 'POST',
                          })
                          if (res.ok) {
                            // Reset to initial state
                            setCurrentStep('provisioning')
                            setSetupStatus(null)
                          } else {
                            const error = await res.json()
                            alert(`Failed to delete computer: ${error.error || 'Unknown error'}`)
                          }
                        } catch (error) {
                          alert('Failed to delete computer. Please try again.')
                        } finally {
                          setIsDeleting(false)
                        }
                      }}
                      disabled={isDeleting}
                      className="px-4 py-2 rounded-lg border border-sam-error/50 bg-sam-error/10 text-sam-error hover:bg-sam-error/20 transition-all font-display font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isDeleting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Deleting...
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-4 h-4" />
                          Delete Computer
                        </>
                      )}
                    </button>
                  )}
                </div>

                <div className="grid md:grid-cols-2 gap-4 max-w-lg mx-auto">
                  {/* VM Link - provider specific */}
                  {setupStatus?.vmProvider === 'aws' && setupStatus?.awsConsoleUrl && (
                    <a
                      href={setupStatus.awsConsoleUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 px-6 py-4 rounded-xl border border-sam-border bg-sam-surface hover:border-sam-accent transition-all"
                    >
                      <Server className="w-5 h-5 text-sam-accent" />
                      <span className="font-mono text-sm">AWS Console</span>
                      <ExternalLink className="w-4 h-4 text-sam-text-dim" />
                    </a>
                  )}
                  {setupStatus?.vmProvider !== 'aws' && setupStatus?.orgoComputerUrl && (
                    <a
                      href={setupStatus.orgoComputerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 px-6 py-4 rounded-xl border border-sam-border bg-sam-surface hover:border-sam-accent transition-all"
                    >
                      <Server className="w-5 h-5 text-sam-accent" />
                      <span className="font-mono text-sm">View VM</span>
                      <ExternalLink className="w-4 h-4 text-sam-text-dim" />
                    </a>
                  )}
                </div>
              </div>

              {/* Telegram Connection Status */}
              {setupStatus && (
                <div className="p-6 rounded-xl border border-sam-border bg-sam-surface/50">
                  <h3 className="font-display font-bold mb-4 flex items-center gap-2">
                    <MessageCircle className="w-5 h-5 text-sam-accent" />
                    Telegram Connection
                  </h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-sam-bg/50">
                      <span className="text-sm text-sam-text-dim">Bot Configuration</span>
                      {setupStatus.telegramConfigured ? (
                        <div className="flex items-center gap-2 text-sam-accent">
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="text-xs font-mono">Connected</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-sam-text-dim">
                          <XCircle className="w-4 h-4" />
                          <span className="text-xs font-mono">Not Configured</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-sam-bg/50">
                      <span className="text-sm text-sam-text-dim">Gateway Status</span>
                      {setupStatus.gatewayStarted ? (
                        <div className="flex items-center gap-2 text-sam-accent">
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="text-xs font-mono">Running on port 18789</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-sam-text-dim">
                          <XCircle className="w-4 h-4" />
                          <span className="text-xs font-mono">Stopped</span>
                        </div>
                      )}
                    </div>
                    {setupStatus.gatewayStarted && (
                      <div className="flex items-center justify-between p-3 rounded-lg bg-sam-bg/50">
                        <span className="text-sm text-sam-text-dim">Gateway Port</span>
                        <code className="text-xs font-mono text-sam-accent bg-sam-bg px-2 py-1 rounded">18789</code>
                      </div>
                    )}
                    {setupStatus.telegramConfigured && setupStatus.gatewayStarted && (
                      <div className="mt-4 p-3 rounded-lg bg-sam-accent/10 border border-sam-accent/30">
                        <p className="text-xs text-sam-text-dim mb-2">
                          <strong className="text-sam-accent">✓ Telegram is connected!</strong>
                        </p>
                        <p className="text-xs text-sam-text-dim mb-2">
                          Gateway is running on <code className="bg-sam-bg px-1 rounded">localhost:18789</code> (loopback mode).
                        </p>
                        <p className="text-xs text-sam-text-dim">
                          Send a message to your bot on Telegram to test the connection. The bot should respond if everything is working correctly.
                        </p>
                      </div>
                    )}
                    {(!setupStatus.telegramConfigured || !setupStatus.gatewayStarted) && (
                      <div className="mt-4 p-3 rounded-lg bg-sam-warning/10 border border-sam-warning/30">
                        <p className="text-xs text-sam-text-dim mb-2">
                          <strong className="text-sam-warning">Telegram not connected</strong>
                        </p>
                        <p className="text-xs text-sam-text-dim">
                          To enable Telegram, set <code className="bg-sam-bg px-1 rounded">TELEGRAM_BOT_TOKEN</code> and <code className="bg-sam-bg px-1 rounded">TELEGRAM_USER_ID</code> in your environment variables, then restart the setup.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Next steps */}
              <div className="p-6 rounded-xl border border-sam-border bg-sam-surface/50">
                <h3 className="font-display font-bold mb-4">What's next?</h3>
                <ul className="space-y-3 text-sm text-sam-text-dim">
                  <li className="flex items-start gap-3">
                    <span className="text-sam-accent">1.</span>
                    <span>Your VM is ready and Clawdbot is installed</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-sam-accent">2.</span>
                    <span><a href="/learning-sources" className="text-sam-accent hover:underline">View learning sources</a> (currently unavailable)</span>
                  </li>
                  {setupStatus?.telegramConfigured && setupStatus?.gatewayStarted && (
                    <li className="flex items-start gap-3">
                      <span className="text-sam-accent">3.</span>
                      <span>Send a message to your Telegram bot to test the connection</span>
                    </li>
                  )}
                </ul>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function SetupTaskItem({
  label,
  sublabel,
  status
}: {
  label: string
  sublabel: string
  status: 'pending' | 'running' | 'complete'
}) {
  return (
    <div className="flex items-center gap-4 p-4 rounded-lg bg-sam-bg/50">
      <div className="flex-shrink-0">
        {status === 'complete' && <CheckCircle2 className="w-6 h-6 text-sam-accent" />}
        {status === 'running' && <Loader2 className="w-6 h-6 text-sam-warning animate-spin" />}
        {status === 'pending' && <Circle className="w-6 h-6 text-sam-text-dim" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`font-medium ${status === 'complete' ? 'text-sam-text' : status === 'running' ? 'text-sam-warning' : 'text-sam-text-dim'}`}>
          {label}
        </p>
        <p className="text-xs text-sam-text-dim truncate">{sublabel}</p>
      </div>
    </div>
  )
}

function getTerminalText(step: SetupStep, status: SetupStatus | null): string {
  const isAWS = status?.vmProvider === 'aws'
  const isE2B = status?.vmProvider === 'e2b'

  if (step === 'provisioning') {
    if (isAWS) {
      return `aws ec2 run-instances --region ${status?.awsRegion || 'us-east-1'} --instance-type t3.micro`
    } else if (isE2B) {
      return 'e2b sandbox create --template base'
    } else {
      return 'orgo compute create --project claude-code --os linux'
    }
  }
  if (step === 'configuring_vm') {
    if (status?.gatewayStarted) return 'clawdbot gateway run'
    if (status?.telegramConfigured) return 'nohup /tmp/start-clawdbot.sh &'
    if (status?.clawdbotInstalled) return 'npm install -g clawdbot@latest'
    if (status?.vmCreated) return 'sudo apt-get install -y python3 pip'
    return isAWS
      ? 'Connecting to EC2 instance via SSH...'
      : isE2B
        ? 'Initializing E2B sandbox...'
        : 'Waiting for VM to be ready...'
  }
  return 'echo "Setup complete!"'
}


