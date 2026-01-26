'use client'

import { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, ArrowRight, CheckCircle2, LogOut, X, Key, FolderPlus, AlertCircle, ExternalLink, Globe, Server } from 'lucide-react'

type VMProvider = 'orgo' | 'e2b' | 'flyio' | 'aws' | 'railway' | 'digitalocean' | 'hetzner' | 'modal'

interface VMOption {
  id: VMProvider
  name: string
  description: string
  icon: React.ReactNode
  available: boolean
  comingSoon?: boolean
  url: string
}

interface OrgoProject {
  id: string
  name: string
}

interface AWSRegion {
  id: string
  name: string
}

interface AWSInstanceType {
  id: string
  name: string
  vcpu: number
  memory: string
  priceHour: string
  recommended?: boolean
  freeTier?: boolean
}

interface AWSInstance {
  id: string
  name: string
  publicIp?: string
  status: string
  instanceType: string
}

const vmOptions: VMOption[] = [
  {
    id: 'orgo',
    name: 'Orgo',
    description: 'Fast, reliable virtual machines optimized for AI workloads.',
    icon: <img src="/logos/orgo.png" alt="Orgo" className="w-12 h-12 object-contain" />,
    available: true,
    url: 'https://orgo.ai',
  },
  {
    id: 'aws',
    name: 'AWS EC2',
    description: 'Enterprise-grade cloud infrastructure. Pay-as-you-go pricing.',
    icon: <img src="/logos/aws.png" alt="AWS" className="w-12 h-12 object-contain" />,
    available: true,
    url: 'https://aws.amazon.com',
  },
  {
    id: 'e2b',
    name: 'E2B',
    description: 'Sandboxed cloud environments built for AI agents.',
    icon: <img src="/logos/e2b.png" alt="E2B" className="w-12 h-12 object-contain" />,
    available: false,
    comingSoon: true,
    url: 'https://e2b.dev',
  },
  {
    id: 'flyio',
    name: 'Fly.io',
    description: 'Global edge computing platform with low latency worldwide.',
    icon: <img src="/logos/flyio.png" alt="Fly.io" className="w-12 h-12 object-contain" />,
    available: false,
    comingSoon: true,
    url: 'https://fly.io',
  },
  {
    id: 'railway',
    name: 'Railway',
    description: 'Simple deployment platform loved by indie hackers.',
    icon: <img src="/logos/railway.png" alt="Railway" className="w-12 h-12 object-contain" />,
    available: false,
    comingSoon: true,
    url: 'https://railway.app',
  },
  {
    id: 'digitalocean',
    name: 'DigitalOcean',
    description: 'Developer-friendly cloud with simple, predictable pricing.',
    icon: <img src="/logos/digitalocean.png" alt="DigitalOcean" className="w-12 h-12 object-contain" />,
    available: false,
    comingSoon: true,
    url: 'https://www.digitalocean.com',
  },
  {
    id: 'hetzner',
    name: 'Hetzner',
    description: 'High-performance European cloud at unbeatable prices.',
    icon: <img src="/logos/hetzner.svg" alt="Hetzner" className="w-12 h-12 object-contain" />,
    available: false,
    comingSoon: true,
    url: 'https://www.hetzner.com',
  },
  {
    id: 'modal',
    name: 'Modal',
    description: 'Serverless compute platform optimized for AI workloads.',
    icon: <img src="/logos/modal.svg" alt="Modal" className="w-12 h-12 object-contain" />,
    available: false,
    comingSoon: true,
    url: 'https://modal.com',
  },
]

export default function SelectVMPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [selectedProvider, setSelectedProvider] = useState<VMProvider | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Orgo configuration modal state
  const [showOrgoModal, setShowOrgoModal] = useState(false)
  const [orgoApiKey, setOrgoApiKey] = useState('')
  const [isValidatingKey, setIsValidatingKey] = useState(false)
  const [keyValidated, setKeyValidated] = useState(false)
  const [orgoProjects, setOrgoProjects] = useState<OrgoProject[]>([])
  const [selectedProject, setSelectedProject] = useState<OrgoProject | null>(null)
  const [showCreateProject, setShowCreateProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('claude-brain')
  const [isCreatingProject, setIsCreatingProject] = useState(false)
  const [orgoError, setOrgoError] = useState<string | null>(null)

  // AWS configuration modal state
  const [showAWSModal, setShowAWSModal] = useState(false)
  const [awsAccessKeyId, setAwsAccessKeyId] = useState('')
  const [awsSecretAccessKey, setAwsSecretAccessKey] = useState('')
  const [awsRegion, setAwsRegion] = useState('us-east-1')
  const [awsInstanceType, setAwsInstanceType] = useState('t3.micro')
  const [isValidatingAWS, setIsValidatingAWS] = useState(false)
  const [awsKeyValidated, setAwsKeyValidated] = useState(false)
  const [awsRegions, setAwsRegions] = useState<AWSRegion[]>([])
  const [awsInstanceTypes, setAwsInstanceTypes] = useState<AWSInstanceType[]>([])
  const [awsInstances, setAwsInstances] = useState<AWSInstance[]>([])
  const [awsError, setAwsError] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/')
    }
  }, [status, router])

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sam-bg">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-2 border-sam-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-sam-text-dim font-mono text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return null
  }

  const handleProviderClick = (provider: VMProvider) => {
    if (!vmOptions.find(opt => opt.id === provider)?.available) {
      return // Don't allow selection of unavailable options
    }

    if (provider === 'orgo') {
      // Show Orgo configuration modal
      setShowOrgoModal(true)
      setOrgoError(null)
    } else if (provider === 'aws') {
      // Show AWS configuration modal
      setShowAWSModal(true)
      setAwsError(null)
    }
  }

  const handleValidateApiKey = async () => {
    if (!orgoApiKey.trim()) {
      setOrgoError('Please enter your Orgo API key')
      return
    }

    setIsValidatingKey(true)
    setOrgoError(null)

    try {
      const res = await fetch('/api/setup/orgo/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: orgoApiKey.trim() }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to validate API key')
      }

      setKeyValidated(true)
      setOrgoProjects(data.projects || [])
      
      // If no projects exist, show create project form
      if (!data.hasProjects) {
        setShowCreateProject(true)
      }
    } catch (e) {
      setOrgoError(e instanceof Error ? e.message : 'Failed to validate API key')
    } finally {
      setIsValidatingKey(false)
    }
  }

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      setOrgoError('Please enter a project name')
      return
    }

    setIsCreatingProject(true)
    setOrgoError(null)

    try {
      const res = await fetch('/api/setup/orgo/create-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName: newProjectName.trim() }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create project')
      }

      // Select the newly created project
      setSelectedProject(data.project)
      setShowCreateProject(false)
      
      // If the project was created, add it to the list
      if (data.project.id) {
        setOrgoProjects(prev => [...prev, data.project])
      }
    } catch (e) {
      setOrgoError(e instanceof Error ? e.message : 'Failed to create project')
    } finally {
      setIsCreatingProject(false)
    }
  }

  const handleSelectProject = async (project: OrgoProject) => {
    setSelectedProject(project)
    setOrgoError(null)

    try {
      const res = await fetch('/api/setup/orgo/select-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id, projectName: project.name }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to select project')
      }
    } catch (e) {
      setOrgoError(e instanceof Error ? e.message : 'Failed to select project')
      setSelectedProject(null)
    }
  }

  const handleOrgoConfirm = async () => {
    if (!keyValidated) {
      setOrgoError('Please validate your API key first')
      return
    }

    // If there are no projects and we're showing create project form,
    // the user needs to either create a project or select one
    if (orgoProjects.length === 0 && !selectedProject) {
      // Auto-create the project with the default name
      await handleCreateProject()
      if (orgoError) return
    }

    if (!selectedProject && orgoProjects.length > 0) {
      setOrgoError('Please select a project')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/setup/select-vm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vmProvider: 'orgo' }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save VM provider selection')
      }

      setSelectedProvider('orgo')
      setShowOrgoModal(false)
      
      // Redirect to learning sources page
      router.push('/learning-sources')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setIsSubmitting(false)
    }
  }

  const closeOrgoModal = () => {
    setShowOrgoModal(false)
    setOrgoApiKey('')
    setKeyValidated(false)
    setOrgoProjects([])
    setSelectedProject(null)
    setShowCreateProject(false)
    setNewProjectName('claude-brain')
    setOrgoError(null)
  }

  // AWS handlers
  const handleValidateAWS = async () => {
    if (!awsAccessKeyId.trim() || !awsSecretAccessKey.trim()) {
      setAwsError('Please enter your AWS credentials')
      return
    }

    setIsValidatingAWS(true)
    setAwsError(null)

    try {
      const res = await fetch('/api/setup/aws/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessKeyId: awsAccessKeyId.trim(),
          secretAccessKey: awsSecretAccessKey.trim(),
          region: awsRegion,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to validate AWS credentials')
      }

      setAwsKeyValidated(true)
      setAwsRegions(data.regions || [])
      setAwsInstanceTypes(data.instanceTypes || [])
      setAwsInstances(data.instances || [])
    } catch (e) {
      setAwsError(e instanceof Error ? e.message : 'Failed to validate AWS credentials')
    } finally {
      setIsValidatingAWS(false)
    }
  }

  const handleAWSConfirm = async () => {
    if (!awsKeyValidated) {
      setAwsError('Please validate your AWS credentials first')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      // Save AWS configuration
      await fetch('/api/setup/aws/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          region: awsRegion,
          instanceType: awsInstanceType,
        }),
      })

      const res = await fetch('/api/setup/select-vm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vmProvider: 'aws' }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save VM provider selection')
      }

      setSelectedProvider('aws')
      setShowAWSModal(false)
      
      // Redirect to learning sources page
      router.push('/learning-sources')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setIsSubmitting(false)
    }
  }

  const closeAWSModal = () => {
    setShowAWSModal(false)
    setAwsAccessKeyId('')
    setAwsSecretAccessKey('')
    setAwsRegion('us-east-1')
    setAwsInstanceType('t3.micro')
    setAwsKeyValidated(false)
    setAwsRegions([])
    setAwsInstanceTypes([])
    setAwsInstances([])
    setAwsError(null)
  }

  return (
    <div className="min-h-screen bg-sam-bg">
      <div className="max-w-6xl mx-auto px-6 py-16">
        {/* Top Navigation Bar */}
        <div className="flex items-center justify-between mb-12">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-rose-500 via-slate-400 to-teal-400 bg-clip-text text-transparent">
              ClawdBrain
            </span>
          </motion.div>
          <motion.button
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            onClick={() => signOut({ callbackUrl: '/' })}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-sam-border hover:border-sam-error/50 text-sam-text-dim hover:text-sam-error transition-all"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-sm font-mono">Sign out</span>
          </motion.button>
        </div>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-12 text-center"
        >
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-4 text-sam-text leading-tight">
            Choose your VM provider
          </h1>
          <p className="text-lg text-sam-text-dim max-w-2xl mx-auto font-body leading-relaxed">
            Select a virtual machine provider to host your AI agent executing tasks 24/7 with persistant memory.
          </p>
        </motion.div>

        {/* Error Message */}
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mb-6 p-4 rounded-lg bg-sam-error/10 border border-sam-error/30 flex items-start gap-3"
          >
            <p className="text-sam-error text-sm">{error}</p>
          </motion.div>
        )}

        {/* VM Options Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
        >
          {vmOptions.map((option, index) => {
            const isSelected = selectedProvider === option.id
            const isDisabled = !option.available || isSubmitting

            return (
              <motion.button
                key={option.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 * index }}
                onClick={() => handleProviderClick(option.id)}
                disabled={isDisabled}
                className={`relative p-5 rounded-xl border transition-all duration-300 text-left ${
                  isSelected
                    ? 'border-sam-accent bg-sam-accent/10 shadow-lg shadow-sam-accent/20'
                    : isDisabled
                    ? 'border-sam-border bg-sam-surface/30 opacity-60 cursor-not-allowed'
                    : 'border-sam-border bg-sam-surface/30 hover:border-sam-accent/50 hover:bg-sam-surface/40 cursor-pointer'
                }`}
              >
                {/* Icon */}
                <div className="flex items-center justify-center mb-4 h-14">
                  {option.icon}
                </div>

                {/* Name and Badge */}
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-display font-semibold text-sam-text">
                    {option.name}
                  </h3>
                  {isSelected && (
                    <CheckCircle2 className="w-5 h-5 text-sam-accent" />
                  )}
                </div>
                {option.comingSoon && (
                  <span className="inline-block text-xs font-mono text-sam-text-dim bg-sam-surface px-2 py-0.5 rounded mb-2">
                    Coming Soon
                  </span>
                )}
                {option.available && (
                  <span className="inline-block text-xs font-mono text-green-400 bg-green-400/10 px-2 py-0.5 rounded mb-2">
                    Available
                  </span>
                )}

                {/* Description */}
                <p className="text-sm text-sam-text-dim font-body leading-relaxed mb-3">
                  {option.description}
                </p>

                {/* Learn More Link */}
                <a
                  href={option.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-sm text-sam-accent hover:text-sam-accent/80 transition-colors font-mono"
                >
                  Learn more
                  <ArrowRight className="w-3 h-3" />
                </a>

                {/* Selection Indicator */}
                {isSelected && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute top-4 right-4"
                  >
                    <div className="w-6 h-6 rounded-full bg-sam-accent flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4 text-sam-bg" />
                    </div>
                  </motion.div>
                )}
              </motion.button>
            )
          })}
        </motion.div>

        {/* Continue Button (only show if Orgo is selected) */}
        {selectedProvider === 'orgo' && isSubmitting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center justify-center gap-3 text-sam-text-dim"
          >
            <Loader2 className="w-5 h-5 animate-spin text-sam-accent" />
            <span className="font-mono text-sm">Setting up...</span>
          </motion.div>
        )}
      </div>

      {/* Orgo Configuration Modal */}
      <AnimatePresence>
        {showOrgoModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={closeOrgoModal}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="bg-sam-surface border border-sam-border rounded-2xl w-full max-w-lg overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-sam-border">
                <div className="flex items-center gap-3">
                  <img src="/logos/orgo.png" alt="Orgo" className="w-8 h-8 object-contain" />
                  <h2 className="text-xl font-display font-semibold text-sam-text">Configure Orgo</h2>
                </div>
                <button
                  onClick={closeOrgoModal}
                  className="p-2 rounded-lg hover:bg-sam-bg transition-colors text-sam-text-dim hover:text-sam-text"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-6">
                {/* Error Display */}
                {orgoError && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="p-3 rounded-lg bg-sam-error/10 border border-sam-error/30 flex items-start gap-2"
                  >
                    <AlertCircle className="w-4 h-4 text-sam-error flex-shrink-0 mt-0.5" />
                    <p className="text-sam-error text-sm">{orgoError}</p>
                  </motion.div>
                )}

                {/* Step 1: API Key */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-sam-text flex items-center gap-2">
                      <Key className="w-4 h-4 text-sam-accent" />
                      Orgo API Key
                      <span className="text-sam-error">*</span>
                    </label>
                    <a
                      href="https://www.orgo.ai/start"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-sam-accent hover:text-sam-accent/80 flex items-center gap-1"
                    >
                      Get API key <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={orgoApiKey}
                      onChange={(e) => {
                        setOrgoApiKey(e.target.value)
                        setKeyValidated(false)
                        setOrgoProjects([])
                        setSelectedProject(null)
                      }}
                      placeholder="Enter your Orgo API key"
                      disabled={keyValidated}
                      className={`flex-1 px-4 py-2.5 rounded-lg bg-sam-bg border transition-all text-sam-text placeholder:text-sam-text-dim/50 font-mono text-sm ${
                        keyValidated
                          ? 'border-green-500/50 bg-green-500/5'
                          : 'border-sam-border focus:border-sam-accent focus:ring-1 focus:ring-sam-accent/30'
                      }`}
                    />
                    {!keyValidated ? (
                      <button
                        onClick={handleValidateApiKey}
                        disabled={isValidatingKey || !orgoApiKey.trim()}
                        className="px-4 py-2.5 rounded-lg bg-sam-accent text-sam-bg font-medium text-sm hover:bg-sam-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {isValidatingKey ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Validating
                          </>
                        ) : (
                          'Validate'
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setKeyValidated(false)
                          setOrgoApiKey('')
                          setOrgoProjects([])
                          setSelectedProject(null)
                          setShowCreateProject(false)
                        }}
                        className="px-4 py-2.5 rounded-lg border border-sam-border text-sam-text-dim hover:text-sam-text hover:border-sam-accent/50 font-medium text-sm transition-colors flex items-center gap-2"
                      >
                        Change
                      </button>
                    )}
                  </div>
                  {keyValidated && (
                    <p className="text-xs text-green-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> API key validated successfully
                    </p>
                  )}
                </div>

                {/* Step 2: Project Selection (only show after key is validated) */}
                {keyValidated && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-3"
                  >
                    <label className="text-sm font-medium text-sam-text flex items-center gap-2">
                      <FolderPlus className="w-4 h-4 text-sam-accent" />
                      Select Project
                      <span className="text-sam-error">*</span>
                    </label>

                    {orgoProjects.length > 0 && !showCreateProject ? (
                      <>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {orgoProjects.map((project) => (
                            <button
                              key={project.id}
                              onClick={() => handleSelectProject(project)}
                              className={`w-full p-3 rounded-lg border text-left transition-all ${
                                selectedProject?.id === project.id
                                  ? 'border-sam-accent bg-sam-accent/10'
                                  : 'border-sam-border hover:border-sam-accent/50 hover:bg-sam-bg'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-sam-text font-medium">{project.name}</span>
                                {selectedProject?.id === project.id && (
                                  <CheckCircle2 className="w-4 h-4 text-sam-accent" />
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => setShowCreateProject(true)}
                          className="text-sm text-sam-accent hover:text-sam-accent/80 flex items-center gap-1"
                        >
                          <FolderPlus className="w-3 h-3" />
                          Create new project
                        </button>
                      </>
                    ) : (
                      <div className="space-y-3">
                        {orgoProjects.length === 0 && (
                          <p className="text-sm text-sam-text-dim">
                            No projects found. Let's create your first project:
                          </p>
                        )}
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newProjectName}
                            onChange={(e) => setNewProjectName(e.target.value)}
                            placeholder="Project name"
                            className="flex-1 px-4 py-2.5 rounded-lg bg-sam-bg border border-sam-border focus:border-sam-accent focus:ring-1 focus:ring-sam-accent/30 transition-all text-sam-text placeholder:text-sam-text-dim/50 font-mono text-sm"
                          />
                          <button
                            onClick={handleCreateProject}
                            disabled={isCreatingProject || !newProjectName.trim()}
                            className="px-4 py-2.5 rounded-lg bg-sam-accent text-sam-bg font-medium text-sm hover:bg-sam-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                          >
                            {isCreatingProject ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Creating
                              </>
                            ) : (
                              'Create'
                            )}
                          </button>
                        </div>
                        {orgoProjects.length > 0 && (
                          <button
                            onClick={() => setShowCreateProject(false)}
                            className="text-sm text-sam-text-dim hover:text-sam-text"
                          >
                            ← Back to project list
                          </button>
                        )}
                      </div>
                    )}
                  </motion.div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-6 border-t border-sam-border flex justify-end gap-3">
                <button
                  onClick={closeOrgoModal}
                  className="px-5 py-2.5 rounded-lg border border-sam-border text-sam-text-dim hover:text-sam-text hover:border-sam-accent/50 font-medium text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleOrgoConfirm}
                  disabled={!keyValidated || isSubmitting || (orgoProjects.length > 0 && !selectedProject)}
                  className="px-5 py-2.5 rounded-lg bg-sam-accent text-sam-bg font-medium text-sm hover:bg-sam-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Setting up...
                    </>
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AWS Configuration Modal */}
      <AnimatePresence>
        {showAWSModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={closeAWSModal}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="bg-sam-surface border border-sam-border rounded-2xl w-full max-w-lg overflow-hidden max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-sam-border sticky top-0 bg-sam-surface z-10">
                <div className="flex items-center gap-3">
                  <img src="/logos/aws.png" alt="AWS" className="w-8 h-8 object-contain" />
                  <div>
                    <h2 className="text-xl font-display font-semibold text-sam-text">Configure AWS EC2</h2>
                    <p className="text-xs text-sam-text-dim">No manual AWS Console setup required</p>
                  </div>
                </div>
                <button
                  onClick={closeAWSModal}
                  className="p-2 rounded-lg hover:bg-sam-bg transition-colors text-sam-text-dim hover:text-sam-text"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-6">
                {/* Error Display */}
                {awsError && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="p-3 rounded-lg bg-sam-error/10 border border-sam-error/30 flex items-start gap-2"
                  >
                    <AlertCircle className="w-4 h-4 text-sam-error flex-shrink-0 mt-0.5" />
                    <p className="text-sam-error text-sm">{awsError}</p>
                  </motion.div>
                )}

                {/* Step 1: AWS Credentials */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-sam-text flex items-center gap-2">
                      <Key className="w-4 h-4 text-sam-accent" />
                      AWS Credentials
                      <span className="text-sam-error">*</span>
                    </label>
                    <a
                      href="https://console.aws.amazon.com/iam/home#/security_credentials"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-sam-accent hover:text-sam-accent/80 flex items-center gap-1"
                    >
                      Get credentials <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  <div className="space-y-3">
                    <input
                      type="text"
                      value={awsAccessKeyId}
                      onChange={(e) => {
                        setAwsAccessKeyId(e.target.value)
                        setAwsKeyValidated(false)
                      }}
                      placeholder="Access Key (e.g., AKIAIOSFODNN7EXAMPLE)"
                      disabled={awsKeyValidated}
                      className={`w-full px-4 py-2.5 rounded-lg bg-sam-bg border transition-all text-sam-text placeholder:text-sam-text-dim/50 font-mono text-sm ${
                        awsKeyValidated
                          ? 'border-green-500/50 bg-green-500/5'
                          : 'border-sam-border focus:border-sam-accent focus:ring-1 focus:ring-sam-accent/30'
                      }`}
                    />
                    <input
                      type="password"
                      value={awsSecretAccessKey}
                      onChange={(e) => {
                        setAwsSecretAccessKey(e.target.value)
                        setAwsKeyValidated(false)
                      }}
                      placeholder="Secret Access Key"
                      disabled={awsKeyValidated}
                      className={`w-full px-4 py-2.5 rounded-lg bg-sam-bg border transition-all text-sam-text placeholder:text-sam-text-dim/50 font-mono text-sm ${
                        awsKeyValidated
                          ? 'border-green-500/50 bg-green-500/5'
                          : 'border-sam-border focus:border-sam-accent focus:ring-1 focus:ring-sam-accent/30'
                      }`}
                    />
                  </div>

                  <div className="flex gap-2">
                    {!awsKeyValidated ? (
                      <button
                        onClick={handleValidateAWS}
                        disabled={isValidatingAWS || !awsAccessKeyId.trim() || !awsSecretAccessKey.trim()}
                        className="flex-1 px-4 py-2.5 rounded-lg bg-sam-accent text-sam-bg font-medium text-sm hover:bg-sam-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {isValidatingAWS ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Validating...
                          </>
                        ) : (
                          'Validate Credentials'
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setAwsKeyValidated(false)
                          setAwsAccessKeyId('')
                          setAwsSecretAccessKey('')
                        }}
                        className="flex-1 px-4 py-2.5 rounded-lg border border-sam-border text-sam-text-dim hover:text-sam-text hover:border-sam-accent/50 font-medium text-sm transition-colors flex items-center justify-center gap-2"
                      >
                        Change Credentials
                      </button>
                    )}
                  </div>
                  
                  {awsKeyValidated && (
                    <p className="text-xs text-green-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> AWS credentials validated successfully
                    </p>
                  )}
                </div>

                {/* Step 2: Region & Instance Type Selection (only show after credentials validated) */}
                {awsKeyValidated && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    {/* Region Selection */}
                    <div className="space-y-3">
                      <label className="text-sm font-medium text-sam-text flex items-center gap-2">
                        <Globe className="w-4 h-4 text-sam-accent" />
                        Region
                      </label>
                      <select
                        value={awsRegion}
                        onChange={(e) => setAwsRegion(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-lg bg-sam-bg border border-sam-border focus:border-sam-accent focus:ring-1 focus:ring-sam-accent/30 transition-all text-sam-text text-sm"
                      >
                        {(awsRegions.length > 0 ? awsRegions : [
                          { id: 'us-east-1', name: 'US East (N. Virginia)' },
                          { id: 'us-west-2', name: 'US West (Oregon)' },
                          { id: 'eu-west-1', name: 'Europe (Ireland)' },
                          { id: 'ap-southeast-1', name: 'Asia Pacific (Singapore)' },
                        ]).map((region) => (
                          <option key={region.id} value={region.id}>
                            {region.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Instance Type Selection */}
                    <div className="space-y-3">
                      <label className="text-sm font-medium text-sam-text flex items-center gap-2">
                        <Server className="w-4 h-4 text-sam-accent" />
                        Instance Type
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {(awsInstanceTypes.length > 0 ? awsInstanceTypes : [
                          // Free Tier eligible (as of 2026)
                          { id: 't3.micro', name: 't3.micro', vcpu: 2, memory: '1 GB', priceHour: 'Free Tier', freeTier: true },
                          { id: 't3.small', name: 't3.small', vcpu: 2, memory: '2 GB', priceHour: 'Free Tier', freeTier: true },
                          { id: 'c7i-flex.large', name: 'c7i-flex.large', vcpu: 2, memory: '4 GB', priceHour: 'Free Tier', freeTier: true },
                          { id: 'm7i-flex.large', name: 'm7i-flex.large', vcpu: 2, memory: '8 GB', priceHour: 'Free Tier', freeTier: true, recommended: true },
                          // Paid options
                          { id: 't3.medium', name: 't3.medium', vcpu: 2, memory: '4 GB', priceHour: '~$0.04/hr' },
                          { id: 't3.large', name: 't3.large', vcpu: 2, memory: '8 GB', priceHour: '~$0.08/hr' },
                          { id: 't3.xlarge', name: 't3.xlarge', vcpu: 4, memory: '16 GB', priceHour: '~$0.17/hr' },
                        ]).map((type) => (
                          <button
                            key={type.id}
                            onClick={() => setAwsInstanceType(type.id)}
                            className={`p-3 rounded-lg border text-left transition-all ${
                              awsInstanceType === type.id
                                ? 'border-sam-accent bg-sam-accent/10'
                                : 'border-sam-border hover:border-sam-accent/50 hover:bg-sam-bg'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sam-text font-mono text-sm">{type.name}</span>
                              {type.freeTier && (
                                <span className="text-[10px] font-mono text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded">
                                  Free Tier
                                </span>
                              )}
                              {type.recommended && !type.freeTier && (
                                <span className="text-[10px] font-mono text-sam-accent bg-sam-accent/10 px-1.5 py-0.5 rounded">
                                  Recommended
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-sam-text-dim">
                              {type.vcpu} vCPU · {type.memory}
                            </div>
                            <div className={`text-xs mt-1 ${type.freeTier ? 'text-green-400' : 'text-sam-accent'}`}>
                              {type.priceHour}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Existing Instances */}
                    {awsInstances.length > 0 && (
                      <div className="space-y-3">
                        <label className="text-sm font-medium text-sam-text">
                          Existing Clawdbot Instances
                        </label>
                        <div className="space-y-2 max-h-32 overflow-y-auto">
                          {awsInstances.map((instance) => (
                            <div
                              key={instance.id}
                              className="p-3 rounded-lg border border-sam-border bg-sam-bg/50"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-sam-text font-medium text-sm">{instance.name}</span>
                                <span className={`text-xs font-mono px-2 py-0.5 rounded ${
                                  instance.status === 'running' 
                                    ? 'bg-green-500/10 text-green-400' 
                                    : 'bg-yellow-500/10 text-yellow-400'
                                }`}>
                                  {instance.status}
                                </span>
                              </div>
                              <div className="text-xs text-sam-text-dim mt-1">
                                {instance.instanceType} · {instance.publicIp || 'No public IP'}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Permissions Notice */}
                    <div className="p-3 rounded-lg bg-sam-bg border border-sam-border">
                      <p className="text-xs text-sam-text-dim">
                        <strong className="text-sam-text">Required AWS permissions:</strong> EC2 (create/manage instances), 
                        VPC (security groups), SSM (optional, for remote commands). 
                        <a 
                          href="https://docs.aws.amazon.com/IAM/latest/UserGuide/id_users_create.html" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-sam-accent hover:underline ml-1"
                        >
                          Learn more
                        </a>
                      </p>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-6 border-t border-sam-border flex justify-end gap-3 sticky bottom-0 bg-sam-surface">
                <button
                  onClick={closeAWSModal}
                  className="px-5 py-2.5 rounded-lg border border-sam-border text-sam-text-dim hover:text-sam-text hover:border-sam-accent/50 font-medium text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAWSConfirm}
                  disabled={!awsKeyValidated || isSubmitting}
                  className="px-5 py-2.5 rounded-lg bg-sam-accent text-sam-bg font-medium text-sm hover:bg-sam-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Setting up...
                    </>
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
