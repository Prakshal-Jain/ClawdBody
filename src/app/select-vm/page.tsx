'use client'

import { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, ArrowRight, CheckCircle2, LogOut, X, Key, FolderPlus, AlertCircle, ExternalLink, Globe, Server, Plus, Trash2, Play, Power, ArrowLeft, ExternalLinkIcon, Settings, Rocket, ChevronDown, ChevronUp, Sparkles, PenTool, User, Lightbulb, Share2, Link2, Check } from 'lucide-react'
import type { Template, TemplateIdea } from '@/lib/templates'
import { TEMPLATE_IDEAS, isEmojiLogo } from '@/lib/templates'

type VMProvider = 'orgo' | 'e2b' | 'moltworker' | 'flyio' | 'aws' | 'railway' | 'digitalocean' | 'hetzner' | 'modal'

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

interface UserVM {
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
  createdAt: string
}

interface Credentials {
  hasOrgoApiKey: boolean
  hasAwsCredentials: boolean
  awsRegion: string
  hasE2bApiKey: boolean
}

interface E2BTemplate {
  id: string
  name: string
  description: string
  recommended?: boolean
}

interface E2BTimeoutOption {
  id: number
  name: string
  description: string
  recommended?: boolean
  freeTier?: boolean
}

interface OrgoRAMOption {
  id: number
  name: string
  description: string
  freeTier: boolean
  recommended?: boolean
}

const orgoRAMOptions: OrgoRAMOption[] = [
  { id: 4, name: '4 GB', description: 'Standard workloads', freeTier: true },
  { id: 8, name: '8 GB', description: 'AI & development', freeTier: false, recommended: true }, // Requires Pro plan
  { id: 16, name: '16 GB', description: 'Heavy workloads', freeTier: false }, // Requires Pro plan
  { id: 32, name: '32 GB', description: 'Large datasets', freeTier: false },  // Requires Pro plan
]

// Category display names and colors
const categoryConfig: Record<string, { label: string; color: string }> = {
  social: { label: 'Social', color: 'text-pink-400 bg-pink-400/10' },
  productivity: { label: 'Productivity', color: 'text-blue-400 bg-blue-400/10' },
  'dev-tools': { label: 'Dev Tools', color: 'text-green-400 bg-green-400/10' },
  other: { label: 'Other', color: 'text-gray-400 bg-gray-400/10' },
}

// Auto-select CPU cores based on RAM (Orgo only accepts 4, 8, or 16 cores)
const getOrgoCPUForRAM = (ram: number): number => {
  switch (ram) {
    case 4: return 4
    case 8: return 4
    case 16: return 8
    case 32: return 16
    default: return 4
  }
}

const vmOptions: VMOption[] = [
  {
    id: 'orgo',
    name: 'Orgo',
    description: 'Fast, reliable virtual machines optimized for AI workloads with GUI.',
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
    available: true,
    url: 'https://e2b.dev',
  },
  {
    id: 'moltworker',
    name: 'Cloudflare Moltworker',
    description: 'Run AI agents on Cloudflare Workers with Sandbox SDK and Browser Rendering.',
    icon: <img src="/logos/cloudflare.png" alt="Cloudflare" className="w-24 h-auto object-contain" />,
    available: false,
    comingSoon: true,
    url: 'https://github.com/cloudflare/moltworker',
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

  // VM list state
  const [userVMs, setUserVMs] = useState<UserVM[]>([])
  const [credentials, setCredentials] = useState<Credentials | null>(null)
  const [isLoadingVMs, setIsLoadingVMs] = useState(true)
  const [deletingVMId, setDeletingVMId] = useState<string | null>(null)

  // General state
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
  const [orgoVMName, setOrgoVMName] = useState('')
  const [selectedOrgoRAM, setSelectedOrgoRAM] = useState(16) // Default 16 GB (recommended)
  const [showDeleteOrgoConfirm, setShowDeleteOrgoConfirm] = useState(false)
  const [isDeletingOrgoKey, setIsDeletingOrgoKey] = useState(false)

  // AWS configuration modal state
  const [showAWSModal, setShowAWSModal] = useState(false)
  const [awsAccessKeyId, setAwsAccessKeyId] = useState('')
  const [awsSecretAccessKey, setAwsSecretAccessKey] = useState('')
  const [awsRegion, setAwsRegion] = useState('us-east-1')
  const [awsInstanceType, setAwsInstanceType] = useState('m7i-flex.large')
  const [isValidatingAWS, setIsValidatingAWS] = useState(false)
  const [awsKeyValidated, setAwsKeyValidated] = useState(false)
  const [awsRegions, setAwsRegions] = useState<AWSRegion[]>([])
  const [awsInstanceTypes, setAwsInstanceTypes] = useState<AWSInstanceType[]>([])
  const [awsError, setAwsError] = useState<string | null>(null)
  const [awsVMName, setAwsVMName] = useState('')

  // E2B configuration modal state
  const [showE2BModal, setShowE2BModal] = useState(false)
  const [e2bApiKey, setE2bApiKey] = useState('')
  const [isValidatingE2B, setIsValidatingE2B] = useState(false)
  const [e2bKeyValidated, setE2bKeyValidated] = useState(false)
  const [e2bTemplates, setE2bTemplates] = useState<E2BTemplate[]>([])
  const [e2bTimeoutOptions, setE2bTimeoutOptions] = useState<E2BTimeoutOption[]>([])
  const [selectedE2bTemplate, setSelectedE2bTemplate] = useState('base')
  const [selectedE2bTimeout, setSelectedE2bTimeout] = useState(3600)
  const [e2bError, setE2bError] = useState<string | null>(null)
  const [e2bVMName, setE2bVMName] = useState('')

  // Template Marketplace state
  const [templates, setTemplates] = useState<Template[]>([])
  const [trendingTemplates, setTrendingTemplates] = useState<(Template & { stats?: { deployCount: number; shareCount: number; recentActivity: number } })[]>([])
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true)
  const [templatePage, setTemplatePage] = useState(0)
  const TEMPLATES_PER_PAGE = 6
  const [showTemplateDeployModal, setShowTemplateDeployModal] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [templateAgentName, setTemplateAgentName] = useState('')
  const [selectedTemplateRAM, setSelectedTemplateRAM] = useState(8)
  const [templateError, setTemplateError] = useState<string | null>(null)
  const [isDeployingTemplate, setIsDeployingTemplate] = useState(false)
  const [deploymentProgress, setDeploymentProgress] = useState<string | null>(null)
  const [isLoadingProjectsForTemplate, setIsLoadingProjectsForTemplate] = useState(false)
  const [selectedTemplateProject, setSelectedTemplateProject] = useState<OrgoProject | null>(null)

  // Template success modal state
  const [showTemplateSuccessModal, setShowTemplateSuccessModal] = useState(false)
  const [deployedVM, setDeployedVM] = useState<any>(null)
  const [postSetupData, setPostSetupData] = useState<{
    type: string
    message?: string
    claimUrl?: string
    verificationCode?: string
  } | null>(null)

  // Create Template modal state
  const [showCreateTemplateModal, setShowCreateTemplateModal] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('')
  const [newTemplateDescription, setNewTemplateDescription] = useState('')
  const [newTemplatePrompt, setNewTemplatePrompt] = useState('')
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false)
  const [createTemplateError, setCreateTemplateError] = useState<string | null>(null)
  const [templateIdeas] = useState<TemplateIdea[]>(TEMPLATE_IDEAS)
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null)
  const [duplicateTemplate, setDuplicateTemplate] = useState<Template | null>(null)
  const [copiedTemplateId, setCopiedTemplateId] = useState<string | null>(null)
  const [showTemplateShareModal, setShowTemplateShareModal] = useState(false)
  const [templateToShare, setTemplateToShare] = useState<Template | null>(null)

  // Load user's VMs, credentials, and templates
  useEffect(() => {
    if (session?.user?.id) {
      loadVMs()
      loadTemplates()
    }
  }, [session?.user?.id])

  const loadVMs = async () => {
    setIsLoadingVMs(true)
    try {
      const res = await fetch('/api/vms')
      const data = await res.json()
      if (res.ok) {
        setUserVMs(data.vms || [])
        setCredentials(data.credentials || null)
      }
    } catch (e) {
    } finally {
      setIsLoadingVMs(false)
    }
  }

  const loadTemplates = async () => {
    setIsLoadingTemplates(true)
    try {
      // Fetch templates and trending in parallel
      const [templatesRes, trendingRes] = await Promise.all([
        fetch('/api/templates'),
        fetch('/api/templates/trending?limit=3'),
      ])
      
      const templatesData = await templatesRes.json()
      const trendingData = await trendingRes.json()
      
      if (templatesRes.ok) {
        setTemplates(templatesData.templates || [])
      }
      
      if (trendingRes.ok) {
        setTrendingTemplates(trendingData.trending || [])
      }
    } catch (e) {
      console.error('Failed to load templates:', e)
    } finally {
      setIsLoadingTemplates(false)
    }
  }

  const handleTemplateClick = async (template: Template) => {
    setSelectedTemplate(template)
    setTemplateAgentName(generateDefaultAgentName(template.name))
    setSelectedTemplateRAM(template.vmConfig.recommendedRam)
    setTemplateError(null)
    setSelectedTemplateProject(orgoProjects[0] || null) // Set default project
    setShowTemplateDeployModal(true)

    // If we already have Orgo API key stored, fetch projects
    if (credentials?.hasOrgoApiKey) {
      setKeyValidated(true)
      if (orgoProjects.length === 0) {
        setIsLoadingProjectsForTemplate(true)
        try {
          await fetchOrgoProjects()
        } finally {
          setIsLoadingProjectsForTemplate(false)
        }
      }
    } else {
      // Reset key validation state for fresh input
      setKeyValidated(false)
      setOrgoApiKey('')
    }
  }

  // Auto-select first project when projects are loaded for template modal
  useEffect(() => {
    if (showTemplateDeployModal && orgoProjects.length > 0 && !selectedTemplateProject) {
      setSelectedTemplateProject(orgoProjects[0])
    }
  }, [orgoProjects, showTemplateDeployModal, selectedTemplateProject])

  const generateDefaultAgentName = (templateName: string) => {
    const base = templateName.replace(/[^a-zA-Z0-9]/g, '')
    const suffix = Math.random().toString(36).substring(2, 6).toUpperCase()
    return `${base}Agent_${suffix}`
  }

  const handleDeployTemplate = async () => {
    if (!selectedTemplate) return

    if (!templateAgentName.trim()) {
      setTemplateError('Please enter an agent name')
      return
    }

    if (selectedTemplateRAM < selectedTemplate.vmConfig.minRam) {
      setTemplateError(`Minimum RAM for this template is ${selectedTemplate.vmConfig.minRam} GB`)
      return
    }

    // Check if we have a project selected
    if (!selectedTemplateProject) {
      setTemplateError('Please select an Orgo project')
      return
    }

    setIsDeployingTemplate(true)
    setTemplateError(null)
    setDeploymentProgress('Creating VM and registering agent...')

    try {
      const res = await fetch('/api/templates/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: selectedTemplate.id,
          agentName: templateAgentName.trim(),
          ram: selectedTemplateRAM,
          orgoProjectId: selectedTemplateProject.id,
          orgoProjectName: selectedTemplateProject.name,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to deploy template')
      }

      // Success! Close deploy modal and show success modal
      setShowTemplateDeployModal(false)
      setDeployedVM(data.vm)
      setPostSetupData(data.postSetup || null)
      setShowTemplateSuccessModal(true)

      // Refresh VMs list
      await loadVMs()

    } catch (e) {
      setTemplateError(e instanceof Error ? e.message : 'Deployment failed')
    } finally {
      setIsDeployingTemplate(false)
      setDeploymentProgress(null)
    }
  }

  const closeTemplateDeployModal = () => {
    setShowTemplateDeployModal(false)
    setSelectedTemplate(null)
    setTemplateAgentName('')
    setSelectedTemplateRAM(8)
    setTemplateError(null)
    setDeploymentProgress(null)
    setSelectedTemplateProject(null)
    // Reset API key state only if not already saved
    if (!credentials?.hasOrgoApiKey) {
      setKeyValidated(false)
      setOrgoApiKey('')
    }
  }

  const closeTemplateSuccessModal = () => {
    setShowTemplateSuccessModal(false)
    setDeployedVM(null)
    setPostSetupData(null)
  }

  const handleCreateTemplateClick = () => {
    setShowCreateTemplateModal(true)
    setNewTemplateName('')
    setNewTemplateDescription('')
    setNewTemplatePrompt('')
    setCreateTemplateError(null)
    setDuplicateTemplate(null)
  }

  const handleSelectTemplateIdea = (idea: TemplateIdea) => {
    setNewTemplateName(idea.name)
    setNewTemplateDescription(idea.description)
    setNewTemplatePrompt(`Create an AI agent that ${idea.description.toLowerCase()}. It should be helpful, efficient, and easy to use.`)
    
    // Check if a similar template already exists
    checkForDuplicateTemplate(idea.name, idea.description)
  }

  const checkForDuplicateTemplate = (name: string, description: string) => {
    // Check if there's an existing template with similar name or description
    const normalizedName = name.toLowerCase().trim()
    const normalizedDesc = description.toLowerCase().trim()
    
    const duplicate = templates.find(t => {
      const tName = t.name.toLowerCase().trim()
      const tDesc = t.description.toLowerCase().trim()
      
      // Check for exact name match or very similar name
      const nameMatch = tName === normalizedName || 
        tName.includes(normalizedName) || 
        normalizedName.includes(tName)
      
      // Check for similar description (contains most of the words)
      const descWords = normalizedDesc.split(/\s+/).filter(w => w.length > 3)
      const tDescWords = tDesc.split(/\s+/).filter(w => w.length > 3)
      const matchingWords = descWords.filter(w => tDescWords.some(tw => tw.includes(w) || w.includes(tw)))
      const descSimilar = descWords.length > 0 && matchingWords.length / descWords.length > 0.6
      
      return nameMatch || descSimilar
    })
    
    setDuplicateTemplate(duplicate || null)
  }

  // Log share events
  const logShareEvent = async (templateId: string, shareMethod: 'twitter' | 'linkedin' | 'email' | 'copy_link') => {
    try {
      await fetch('/api/templates/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId,
          eventType: 'share',
          metadata: { shareMethod },
        }),
      })
    } catch (e) {
      console.warn('Failed to log share event:', e)
    }
  }

  const handleCreateTemplate = async () => {
    if (!newTemplateName.trim()) {
      setCreateTemplateError('Please enter a template name')
      return
    }
    if (!newTemplateDescription.trim()) {
      setCreateTemplateError('Please enter a description')
      return
    }

    // If duplicate warning is shown, don't proceed
    if (duplicateTemplate) {
      setCreateTemplateError('Please personalize your template or deploy the existing one')
      return
    }

    setIsCreatingTemplate(true)
    setCreateTemplateError(null)

    try {
      const res = await fetch('/api/templates/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTemplateName.trim(),
          description: newTemplateDescription.trim(),
          prompt: newTemplatePrompt.trim() || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create template')
      }

      // Success - close modal and refresh templates
      setShowCreateTemplateModal(false)
      await loadTemplates()

    } catch (e) {
      setCreateTemplateError(e instanceof Error ? e.message : 'Failed to create template')
    } finally {
      setIsCreatingTemplate(false)
    }
  }

  const closeCreateTemplateModal = () => {
    setShowCreateTemplateModal(false)
    setNewTemplateName('')
    setNewTemplateDescription('')
    setNewTemplatePrompt('')
    setCreateTemplateError(null)
    setDuplicateTemplate(null)
  }

  const handleDeleteTemplate = async (e: React.MouseEvent, templateId: string) => {
    e.stopPropagation() // Prevent opening the deploy modal

    if (!confirm('Are you sure you want to delete this template? This action cannot be undone.')) {
      return
    }

    setDeletingTemplateId(templateId)
    try {
      const res = await fetch(`/api/templates/${templateId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete template')
      }

      // Refresh templates list
      await loadTemplates()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete template')
    } finally {
      setDeletingTemplateId(null)
    }
  }

  const handleShareTemplate = (e: React.MouseEvent, templateId: string) => {
    e.stopPropagation() // Prevent opening the deploy modal

    const url = `${window.location.origin}/templates/${templateId}`
    navigator.clipboard.writeText(url)
    setCopiedTemplateId(templateId)
    setTimeout(() => setCopiedTemplateId(null), 2000)
  }

  const handleOpenShareModal = (e: React.MouseEvent, template: Template) => {
    e.stopPropagation() // Prevent opening the deploy modal
    setTemplateToShare(template)
    setShowTemplateShareModal(true)
  }

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

  const handleProviderClick = async (provider: VMProvider) => {
    if (!vmOptions.find(opt => opt.id === provider)?.available) {
      return
    }

    if (provider === 'orgo') {
      setOrgoVMName(`Orgo VM ${userVMs.filter(vm => vm.provider === 'orgo').length + 1}`)
      setOrgoError(null)

      // If we already have Orgo API key stored, skip to project selection
      if (credentials?.hasOrgoApiKey) {
        setShowOrgoModal(true)
        setKeyValidated(true)
        // Fetch projects with stored key
        await fetchOrgoProjects()
      } else {
        setShowOrgoModal(true)
      }
    } else if (provider === 'aws') {
      setAwsVMName(`AWS VM ${userVMs.filter(vm => vm.provider === 'aws').length + 1}`)
      setAwsError(null)

      // If we already have AWS credentials stored, skip to configuration
      if (credentials?.hasAwsCredentials) {
        setShowAWSModal(true)
        setAwsKeyValidated(true)
        setAwsRegion(credentials.awsRegion || 'us-east-1')
        // Fetch AWS data with stored credentials
        await fetchAWSData()
      } else {
        setShowAWSModal(true)
      }
    } else if (provider === 'e2b') {
      setE2bVMName(`E2B Sandbox ${userVMs.filter(vm => vm.provider === 'e2b').length + 1}`)
      setE2bError(null)

      // If we already have E2B API key stored, skip to configuration
      if (credentials?.hasE2bApiKey) {
        setShowE2BModal(true)
        setE2bKeyValidated(true)
        // Fetch E2B data with stored key
        await fetchE2BData()
      } else {
        setShowE2BModal(true)
      }
    }
  }

  const fetchOrgoProjects = async () => {
    try {
      const res = await fetch('/api/setup/orgo/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ useStored: true }),
      })
      const data = await res.json()
      if (res.ok) {
        setOrgoProjects(data.projects || [])
        if (!data.hasProjects) {
          setShowCreateProject(true)
        }
      }
    } catch (e) {
    }
  }

  const fetchAWSData = async () => {
    try {
      const res = await fetch('/api/setup/aws/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ useStored: true }),
      })
      const data = await res.json()
      if (res.ok) {
        setAwsRegions(data.regions || [])
        setAwsInstanceTypes(data.instanceTypes || [])
      }
    } catch (e) {
    }
  }

  const fetchE2BData = async () => {
    try {
      const res = await fetch('/api/setup/e2b/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ useStored: true }),
      })
      const data = await res.json()
      if (res.ok) {
        setE2bTemplates(data.templates || [])
        setE2bTimeoutOptions(data.timeoutOptions || [])
      }
    } catch (e) {
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

      setSelectedProject(data.project)
      setShowCreateProject(false)

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

    if (orgoProjects.length === 0 && !selectedProject) {
      await handleCreateProject()
      if (orgoError) return
    }

    if (!selectedProject && orgoProjects.length > 0) {
      setOrgoError('Please select a project')
      return
    }

    if (!orgoVMName.trim()) {
      setOrgoError('Please enter a name for your VM')
      return
    }

    setIsSubmitting(true)
    setError(null)
    setOrgoError(null)

    try {
      // Create and provision the VM immediately
      const res = await fetch('/api/vms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: orgoVMName.trim(),
          provider: 'orgo',
          provisionNow: true, // Provision the VM immediately
          orgoProjectId: selectedProject?.id,
          orgoProjectName: selectedProject?.name,
          orgoRam: selectedOrgoRAM,
          orgoCpu: getOrgoCPUForRAM(selectedOrgoRAM),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        // Check if this is a plan upgrade error
        if (data.needsUpgrade) {
          setOrgoError(data.error)
          setIsSubmitting(false)
          return
        }
        throw new Error(data.error || 'Failed to create VM')
      }

      closeOrgoModal()

      // Redirect to learning-sources page for this VM
      router.push(`/learning-sources?vmId=${data.vm.id}`)
    } catch (e) {
      setOrgoError(e instanceof Error ? e.message : 'Something went wrong')
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
    setOrgoVMName('')
    setSelectedOrgoRAM(16) // Reset to recommended (16 GB)
    setShowDeleteOrgoConfirm(false)
  }

  const handleDeleteOrgoApiKey = async () => {
    setIsDeletingOrgoKey(true)
    setOrgoError(null)

    try {
      const res = await fetch('/api/setup/orgo/delete-api-key', {
        method: 'POST',
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete API key')
      }

      // Refresh the VM list and credentials
      await loadVMs()

      // Reset the modal to initial state (show API key entry)
      setKeyValidated(false)
      setOrgoApiKey('')
      setOrgoProjects([])
      setSelectedProject(null)
      setShowCreateProject(false)
      setShowDeleteOrgoConfirm(false)

      // Update local credentials state
      setCredentials(prev => prev ? { ...prev, hasOrgoApiKey: false } : null)

    } catch (e) {
      setOrgoError(e instanceof Error ? e.message : 'Failed to delete API key')
    } finally {
      setIsDeletingOrgoKey(false)
    }
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

    if (!awsVMName.trim()) {
      setAwsError('Please enter a name for your VM')
      return
    }

    setIsSubmitting(true)
    setError(null)

    setAwsError(null)

    try {
      // Save AWS configuration if new credentials were entered
      if (awsAccessKeyId && awsSecretAccessKey) {
        await fetch('/api/setup/aws/configure', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            region: awsRegion,
            instanceType: awsInstanceType,
          }),
        })
      }

      // Create and provision the VM immediately
      const res = await fetch('/api/vms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: awsVMName.trim(),
          provider: 'aws',
          provisionNow: true, // Provision the EC2 instance immediately
          awsInstanceType,
          awsRegion,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to provision EC2 instance')
      }

      closeAWSModal()

      // Redirect to learning-sources page for this VM
      router.push(`/learning-sources?vmId=${data.vm.id}`)
    } catch (e) {
      setAwsError(e instanceof Error ? e.message : 'Failed to provision EC2 instance')
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
    setAwsError(null)
    setAwsVMName('')
  }

  // E2B handlers
  const handleValidateE2B = async () => {
    if (!e2bApiKey.trim()) {
      setE2bError('Please enter your E2B API key')
      return
    }

    setIsValidatingE2B(true)
    setE2bError(null)

    try {
      const res = await fetch('/api/setup/e2b/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: e2bApiKey.trim() }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to validate E2B API key')
      }

      setE2bKeyValidated(true)
      setE2bTemplates(data.templates || [])
      setE2bTimeoutOptions(data.timeoutOptions || [])
    } catch (e) {
      setE2bError(e instanceof Error ? e.message : 'Failed to validate E2B API key')
    } finally {
      setIsValidatingE2B(false)
    }
  }

  const handleE2BConfirm = async () => {
    if (!e2bKeyValidated) {
      setE2bError('Please validate your E2B API key first')
      return
    }

    if (!e2bVMName.trim()) {
      setE2bError('Please enter a name for your sandbox')
      return
    }

    setIsSubmitting(true)
    setError(null)
    setE2bError(null)

    try {
      // Create and provision the E2B sandbox immediately
      const res = await fetch('/api/vms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: e2bVMName.trim(),
          provider: 'e2b',
          provisionNow: true, // Provision the sandbox immediately
          e2bTemplateId: selectedE2bTemplate,
          e2bTimeout: selectedE2bTimeout,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        // Check if this is a plan upgrade error
        if (data.needsUpgrade) {
          setE2bError(data.error)
          setIsSubmitting(false)
          return
        }
        throw new Error(data.error || 'Failed to create sandbox')
      }

      closeE2BModal()

      // Redirect to learning-sources page for this VM
      router.push(`/learning-sources?vmId=${data.vm.id}`)
    } catch (e) {
      setE2bError(e instanceof Error ? e.message : 'Something went wrong')
      setIsSubmitting(false)
    }
  }

  const closeE2BModal = () => {
    setShowE2BModal(false)
    setE2bApiKey('')
    setE2bKeyValidated(false)
    setE2bTemplates([])
    setE2bTimeoutOptions([])
    setSelectedE2bTemplate('base')
    setSelectedE2bTimeout(3600)
    setE2bError(null)
    setE2bVMName('')
  }

  const handleDeleteVM = async (vmId: string) => {
    if (!confirm('Are you sure you want to delete this VM?')) {
      return
    }

    setDeletingVMId(vmId)
    try {
      const res = await fetch(`/api/vms/${vmId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        throw new Error('Failed to delete VM')
      }

      setUserVMs(prev => prev.filter(vm => vm.id !== vmId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete VM')
    } finally {
      setDeletingVMId(null)
    }
  }

  const handleContinue = () => {
    if (userVMs.length === 0) {
      setError('Please add at least one VM to continue')
      return
    }
    router.push('/learning-sources')
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'bg-green-500/10 text-green-400 border-green-500/30'
      case 'stopped':
        return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'
      case 'error':
        return 'bg-red-500/10 text-red-400 border-red-500/30'
      default:
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30'
    }
  }

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'orgo':
        return <img src="/logos/orgo.png" alt="Orgo" className="w-8 h-8 object-contain" />
      case 'aws':
        return <img src="/logos/aws.png" alt="AWS" className="w-8 h-8 object-contain" />
      case 'e2b':
        return <img src="/logos/e2b.png" alt="E2B" className="w-8 h-8 object-contain" />
      default:
        return <Server className="w-8 h-8 text-sam-text-dim" />
    }
  }

  return (
    <div className="min-h-screen bg-sam-bg">
      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Top Navigation Bar */}
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
          className="mb-8 text-center"
        >
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-4 text-sam-text leading-tight">
            Your Virtual Machines
          </h1>
          <p className="text-lg text-sam-text-dim max-w-2xl mx-auto font-body leading-relaxed">
            Manage your AI agent VMs. You can run multiple VMs from different providers simultaneously.
          </p>
        </motion.div>

        {/* Error Message */}
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mb-6 p-4 rounded-lg bg-sam-error/10 border border-sam-error/30 flex items-start gap-3"
          >
            <AlertCircle className="w-5 h-5 text-sam-error flex-shrink-0 mt-0.5" />
            <p className="text-sam-error text-sm">{error}</p>
            <button onClick={() => setError(null)} className="ml-auto text-sam-error hover:text-sam-error/80">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}

        {/* Active VMs Section */}
        {isLoadingVMs ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-sam-accent" />
          </div>
        ) : userVMs.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mb-8"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-display font-semibold text-sam-text flex items-center gap-2">
                <Server className="w-5 h-5 text-sam-accent" />
                Active VMs ({userVMs.length})
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {userVMs.map((vm, index) => (
                <motion.div
                  key={vm.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.05 * index }}
                  className="p-4 rounded-xl border border-sam-border bg-sam-surface/50 hover:border-sam-accent/50 transition-all group flex flex-col h-full"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {getProviderIcon(vm.provider)}
                      <div>
                        <h3 className="font-medium text-sam-text">{vm.name}</h3>
                        <p className="text-xs text-sam-text-dim capitalize">{vm.provider}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteVM(vm.id)
                        }}
                        disabled={deletingVMId === vm.id}
                        className="p-1.5 rounded-lg text-sam-text-dim hover:text-sam-error hover:bg-sam-error/10 transition-all disabled:opacity-50"
                        title="Delete VM"
                      >
                        {deletingVMId === vm.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-mono border ${getStatusColor(vm.status)}`}>
                        {vm.status}
                      </span>
                      <span className="text-xs text-sam-text-dim">
                        {vm.provider === 'aws' && vm.awsInstanceType}
                        {vm.provider === 'orgo' && vm.orgoProjectName}
                        {vm.provider === 'e2b' && 'E2B Sandbox'}
                      </span>
                    </div>
                    <div>
                      {vm.provider === 'aws' && vm.awsPublicIp && (
                        <p className="text-xs text-sam-text-dim mb-3 font-mono">
                          IP: {vm.awsPublicIp}
                        </p>
                      )}
                      {vm.provider === 'orgo' && vm.orgoComputerId && (
                        <p className="text-xs text-sam-text-dim mb-3 font-mono">
                          Computer: {vm.orgoComputerId}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Open/Manage VM Button */}
                  <button
                    onClick={() => router.push(`/learning-sources?vmId=${vm.id}`)}
                    className="w-full mt-2 px-4 py-2 rounded-lg bg-sam-accent/10 border border-sam-accent/30 text-sam-accent hover:bg-sam-accent/20 hover:border-sam-accent/50 transition-all flex items-center justify-center gap-2 text-sm font-medium"
                  >
                    <Settings className="w-4 h-4" />
                    Open & Configure
                  </button>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Template Marketplace Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-display font-semibold text-sam-text flex items-center gap-2">
                <Rocket className="w-5 h-5 text-sam-accent" />
                Template Marketplace
              </h2>
              <p className="text-sm text-sam-text-dim mt-1">
                Deploy AI agents and workflows with one click
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleCreateTemplateClick}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sam-accent/10 border border-sam-accent/30 text-sam-accent text-sm font-medium hover:bg-sam-accent/20 hover:border-sam-accent/50 transition-all"
              >
                <PenTool className="w-4 h-4" />
                Create Your Own
              </button>
            </div>
          </div>

          {isLoadingTemplates ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-sam-accent" />
            </div>
          ) : templates.length > 0 ? (
            <>
            {/* Combined templates: trending first, then others */}
            {(() => {
              // Get trending template IDs to avoid duplicates
              const trendingIds = new Set(trendingTemplates.map(t => t.id))
              // Non-trending templates
              const otherTemplates = templates.filter(t => !trendingIds.has(t.id))
              // Combined list: trending first, then others
              const allTemplates = [...trendingTemplates, ...otherTemplates]
              // Paginate
              const startIndex = templatePage * TEMPLATES_PER_PAGE
              const paginatedTemplates = allTemplates.slice(startIndex, startIndex + TEMPLATES_PER_PAGE)
              const totalPages = Math.ceil(allTemplates.length / TEMPLATES_PER_PAGE)
              
              return (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {paginatedTemplates.map((template, index) => {
                      const globalIndex = startIndex + index
                      const isTrending = globalIndex < trendingTemplates.length
                      return (
                <motion.div
                  key={template.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.05 * (index + 1) }}
                  className={`group relative p-5 rounded-xl border ${isTrending ? 'border-sam-accent/30 bg-gradient-to-br from-sam-accent/5 to-sam-surface/50' : 'border-sam-border bg-sam-surface/50'} transition-all ${template.comingSoon
                      ? 'opacity-75 cursor-not-allowed'
                      : 'hover:border-sam-accent/50 hover:bg-sam-surface/70 cursor-pointer'
                    }`}
                  onClick={() => !template.comingSoon && handleTemplateClick(template)}
                >
                  {/* Trending Badge */}
                  {isTrending && (
                    <div className="absolute -top-2 -left-2 px-2 py-0.5 rounded-full bg-sam-accent text-sam-bg text-[10px] font-bold flex items-center gap-1">
                      🔥 #{globalIndex + 1}
                    </div>
                  )}
                  {/* Template Logo and Info */}
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-sam-bg flex items-center justify-center overflow-hidden flex-shrink-0">
                      {isEmojiLogo(template.logo) ? (
                        <span className="text-3xl">{template.logo}</span>
                      ) : (
                        <img
                          src={template.logo}
                          alt={template.name}
                          className="w-10 h-10 object-contain"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none'
                            const parent = (e.target as HTMLImageElement).parentElement
                            if (parent) {
                              const emoji = document.createElement('span')
                              emoji.className = 'text-3xl'
                              emoji.textContent = '🤖'
                              parent.appendChild(emoji)
                            }
                          }}
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-display font-semibold text-sam-text truncate">
                          {template.name}
                        </h3>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-block text-[10px] font-mono px-1.5 py-0.5 rounded ${categoryConfig[template.category]?.color || categoryConfig.other.color}`}>
                          {categoryConfig[template.category]?.label || 'Other'}
                        </span>
                        {template.author && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-sam-text-dim">
                            <User className="w-2.5 h-2.5" />
                            {template.author}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-sm text-sam-text-dim line-clamp-2 mb-4">
                    {template.description}
                  </p>

                  {/* Footer */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-sam-text-dim">
                      <Server className="w-3 h-3" />
                      <span>Min {template.vmConfig.minRam} GB RAM</span>
                    </div>
                    {template.comingSoon ? (
                      <span className="px-3 py-1.5 rounded-lg bg-sam-surface border border-sam-border text-sam-text-dim text-sm font-medium">
                        Coming Soon
                      </span>
                    ) : (
                      <button
                        onClick={(e) => handleOpenShareModal(e, template)}
                        className="px-3 py-1.5 rounded-lg border border-sam-border text-sam-text-dim text-sm font-medium hover:border-sam-accent/50 hover:text-sam-text transition-all flex items-center gap-1.5"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        Share
                      </button>
                    )}
                  </div>

                  {/* Top-right actions: Community badge, share, delete */}
                  <div className="absolute top-3 right-3 flex items-center gap-2">
                    {template.isUserCreated && (
                      <span className="text-[9px] font-mono text-purple-400 bg-purple-400/10 px-1.5 py-0.5 rounded">
                        Community
                      </span>
                    )}
                    {/* Share button */}
                    <button
                      onClick={(e) => handleShareTemplate(e, template.id)}
                      className="p-1 rounded hover:bg-sam-accent/20 text-sam-text-dim hover:text-sam-accent transition-colors opacity-0 group-hover:opacity-100"
                      title="Copy link to share"
                    >
                      {copiedTemplateId === template.id ? (
                        <Check className="w-3.5 h-3.5 text-green-400" />
                      ) : (
                        <Link2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                    {/* Delete button - only for template author */}
                    {template.isUserCreated && template.authorId === session?.user?.id && (
                      <button
                        onClick={(e) => handleDeleteTemplate(e, template.id)}
                        disabled={deletingTemplateId === template.id}
                        className="p-1 rounded hover:bg-sam-error/20 text-sam-text-dim hover:text-sam-error transition-colors disabled:opacity-50 opacity-0 group-hover:opacity-100"
                        title="Delete template"
                      >
                        {deletingTemplateId === template.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>

                  {/* Hover effect indicator */}
                  {!template.comingSoon && (
                    <div className="absolute inset-0 rounded-xl bg-sam-accent/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                  )}
                </motion.div>
              )})}
                  </div>
                  
                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-4 mt-6">
                      <button
                        onClick={() => setTemplatePage(prev => Math.max(0, prev - 1))}
                        disabled={templatePage === 0}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-sam-border text-sm font-medium hover:border-sam-accent/50 hover:bg-sam-surface/70 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ArrowLeft className="w-4 h-4" />
                        Previous
                      </button>
                      <span className="text-sm text-sam-text-dim">
                        Page {templatePage + 1} of {totalPages}
                      </span>
                      <button
                        onClick={() => setTemplatePage(prev => Math.min(totalPages - 1, prev + 1))}
                        disabled={templatePage >= totalPages - 1}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-sam-border text-sm font-medium hover:border-sam-accent/50 hover:bg-sam-surface/70 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </>
              )
            })()}
            </>
          ) : (
            <div className="p-8 rounded-xl border border-sam-border bg-sam-surface/30 text-center">
              <Rocket className="w-12 h-12 text-sam-text-dim mx-auto mb-3" />
              <p className="text-sam-text-dim">No templates available yet</p>
              <p className="text-sm text-sam-text-dim/60 mt-1">Click "Create Your Own" to build your first template</p>
            </div>
          )}
        </motion.div>

        {/* Add New VM Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mb-8"
        >
          <h2 className="text-xl font-display font-semibold text-sam-text mb-4 flex items-center gap-2">
            <Plus className="w-5 h-5 text-sam-accent" />
            Add a New VM
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {vmOptions.map((option, index) => {
              const isDisabled = !option.available || isSubmitting

              return (
                <motion.button
                  key={option.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 * index }}
                  onClick={() => handleProviderClick(option.id)}
                  disabled={isDisabled}
                  className={`relative p-5 rounded-xl border transition-all duration-300 text-left ${isDisabled
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

                  {/* Quick add indicator for configured providers */}
                  {option.available && (
                    (option.id === 'orgo' && credentials?.hasOrgoApiKey) ||
                    (option.id === 'aws' && credentials?.hasAwsCredentials) ||
                    (option.id === 'e2b' && credentials?.hasE2bApiKey)
                  ) && (
                      <div className="absolute top-3 right-3">
                        <span className="text-[10px] font-mono text-sam-accent bg-sam-accent/10 px-1.5 py-0.5 rounded">
                          Quick Add
                        </span>
                      </div>
                    )}
                </motion.button>
              )
            })}
          </div>

          {/* Custom Provider Card - Full Width */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="relative mt-6 p-6 rounded-xl border-2 bg-gradient-to-br from-sam-surface/40 to-sam-surface/20 hover:from-sam-surface/50 hover:to-sam-surface/30 transition-all duration-300"
            style={{
              borderImage: 'linear-gradient(135deg, rgba(244, 114, 182, 0.3), rgba(139, 92, 246, 0.3), rgba(59, 130, 246, 0.3)) 1',
            }}
          >
            {/* Gradient border effect */}
            <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-pink-500/20 via-purple-500/20 to-blue-500/20 opacity-50 blur-sm -z-10" />

            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex-1 text-center md:text-left">
                <div className="flex items-center justify-center md:justify-start gap-2 mb-2">
                  <Plus className="w-5 h-5 text-sam-accent" />
                  <h3 className="text-xl font-display font-semibold text-sam-text">
                    Add Your Own VM Provider
                  </h3>
                </div>
                <p className="text-sm text-sam-text-dim font-body leading-relaxed mb-2">
                  Have a preferred cloud provider? Our AI agents can build a native integration for your VM provider in minutes, seamlessly connecting it to ClawdBody.
                </p>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sam-accent/10 border border-sam-accent/30">
                  <span className="text-xs font-mono text-sam-accent">🚀 Marketplace Coming Soon</span>
                </div>
              </div>
              <div className="flex-shrink-0">
                <button
                  disabled
                  className="px-6 py-3 rounded-lg bg-gradient-to-r from-pink-500/20 via-purple-500/20 to-blue-500/20 border border-sam-border text-sam-text-dim font-medium hover:border-sam-accent/50 transition-all cursor-not-allowed opacity-60"
                >
                  Coming Soon
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>

        {/* Terms Footer */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-12 pt-6 border-t border-sam-border text-center"
        >
          <p className="text-sm text-sam-text-dim">
            By using ClawdBody, you agree to our{' '}
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sam-accent hover:text-sam-accent/80 underline underline-offset-2 transition-colors"
            >
              Terms and Conditions
            </a>
          </p>
          <p className="text-xs text-sam-text-dim/60 mt-2">
            © {new Date().getFullYear()} ClawdBody. All rights reserved.
          </p>
        </motion.footer>
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
              className="bg-sam-surface border border-sam-border rounded-2xl w-full max-w-lg overflow-hidden max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-sam-border sticky top-0 bg-sam-surface z-10">
                <div className="flex items-center gap-3">
                  <img src="/logos/orgo.png" alt="Orgo" className="w-8 h-8 object-contain" />
                  <h2 className="text-xl font-display font-semibold text-sam-text">
                    {credentials?.hasOrgoApiKey ? 'Add Orgo VM' : 'Configure Orgo'}
                  </h2>
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
                {/* VM Name */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-sam-text flex items-center gap-2">
                    <Server className="w-4 h-4 text-sam-accent" />
                    VM Name
                    <span className="text-sam-error">*</span>
                  </label>
                  <input
                    type="text"
                    value={orgoVMName}
                    onChange={(e) => setOrgoVMName(e.target.value)}
                    placeholder="e.g., My Orgo VM"
                    className="w-full px-4 py-2.5 rounded-lg bg-sam-bg border border-sam-border focus:border-sam-accent focus:ring-1 focus:ring-sam-accent/30 transition-all text-sam-text placeholder:text-sam-text-dim/50 text-sm"
                  />
                </div>

                {/* API Key - only show if not already configured */}
                {!credentials?.hasOrgoApiKey && (
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
                        className={`flex-1 px-4 py-2.5 rounded-lg bg-sam-bg border transition-all text-sam-text placeholder:text-sam-text-dim/50 font-mono text-sm ${keyValidated
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
                )}

                {/* Already configured notice */}
                {credentials?.hasOrgoApiKey && !showDeleteOrgoConfirm && (
                  <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-green-400 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" />
                        Using your saved Orgo API key
                      </p>
                      <button
                        onClick={() => setShowDeleteOrgoConfirm(true)}
                        className="text-xs text-sam-text-dim hover:text-sam-error transition-colors flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        Delete
                      </button>
                    </div>
                  </div>
                )}

                {/* Delete API Key Confirmation Dialog */}
                {showDeleteOrgoConfirm && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="p-4 rounded-lg bg-sam-error/5 border border-sam-error/30"
                  >
                    <div className="flex items-start gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-sam-error/10 flex items-center justify-center flex-shrink-0">
                        <AlertCircle className="w-5 h-5 text-sam-error" />
                      </div>
                      <div>
                        <h4 className="text-sam-error font-medium mb-2">Delete Orgo API Key?</h4>
                        <p className="text-sm text-sam-text-dim mb-2">
                          This will remove your Orgo API key from ClawdBody. Here's what will happen:
                        </p>
                        <ul className="text-sm text-sam-text-dim space-y-1.5 mb-3">
                          <li className="flex items-start gap-2">
                            <span className="text-sam-error mt-0.5">•</span>
                            <span>All Orgo computers linked to ClawdBody will be <strong className="text-sam-text">disconnected</strong></span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-sam-accent mt-0.5">•</span>
                            <span>Your computers will <strong className="text-sam-text">still exist</strong> on your Orgo account</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-sam-text-dim mt-0.5">•</span>
                            <span>You can re-add your API key anytime to reconnect</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setShowDeleteOrgoConfirm(false)}
                        disabled={isDeletingOrgoKey}
                        className="px-4 py-2 rounded-lg border border-sam-border text-sam-text-dim hover:text-sam-text hover:border-sam-accent/50 font-medium text-sm transition-colors disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleDeleteOrgoApiKey}
                        disabled={isDeletingOrgoKey}
                        className="px-4 py-2 rounded-lg bg-sam-error/10 border border-sam-error/50 text-sam-error hover:bg-sam-error/20 font-medium text-sm transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                        {isDeletingOrgoKey ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Deleting...
                          </>
                        ) : (
                          <>
                            <Trash2 className="w-4 h-4" />
                            Delete API Key
                          </>
                        )}
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* Project Selection */}
                {keyValidated && !showDeleteOrgoConfirm && (
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
                        <div className="space-y-2">
                          {orgoProjects.map((project) => (
                            <button
                              key={project.id}
                              onClick={() => handleSelectProject(project)}
                              className={`w-full p-3 rounded-lg border text-left transition-all ${selectedProject?.id === project.id
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

                {/* RAM Selection */}
                {keyValidated && !showDeleteOrgoConfirm && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="space-y-3"
                  >
                    <label className="text-sm font-medium text-sam-text flex items-center gap-2">
                      <Server className="w-4 h-4 text-sam-accent" />
                      Memory (RAM)
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {orgoRAMOptions.map((option) => (
                        <button
                          key={option.id}
                          onClick={() => setSelectedOrgoRAM(option.id)}
                          className={`p-2.5 rounded-lg border text-left transition-all flex flex-col justify-center ${selectedOrgoRAM === option.id
                            ? 'border-sam-accent bg-sam-accent/10'
                            : 'border-sam-border hover:border-sam-accent/50 hover:bg-sam-bg'
                            }`}
                        >
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-sam-text font-medium text-sm">{option.name}</span>
                            {option.recommended && (
                              <span className="text-[9px] font-mono text-sam-accent bg-sam-accent/10 px-1 py-0.5 rounded">
                                Best
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-sam-text-dim">
                            {option.description}
                          </div>
                          <div className={`text-[10px] mt-1 font-medium ${option.freeTier ? 'text-green-400' : 'text-amber-400'}`}>
                            {option.freeTier ? 'Free Tier' : 'Paid Plan'}
                          </div>
                        </button>
                      ))}
                    </div>
                    {!orgoRAMOptions.find(opt => opt.id === selectedOrgoRAM)?.freeTier && (
                      <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-blue-400 font-medium">Pro Plan Feature</p>
                            <p className="text-blue-400/80 text-sm mt-1">
                              {orgoRAMOptions.find(opt => opt.id === selectedOrgoRAM)?.name} RAM requires an Orgo Pro plan.
                              If you already have a Pro plan, you can proceed.
                            </p>
                          </div>
                        </div>
                        <a
                          href="https://www.orgo.ai/pricing"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-500/20 border border-blue-500/40 text-blue-400 font-medium text-sm hover:bg-blue-500/30 hover:border-blue-500/50 transition-all"
                        >
                          <ExternalLink className="w-4 h-4" />
                          View Orgo Plans
                        </a>
                      </div>
                    )}
                  </motion.div>
                )}

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

              </div>

              {/* Modal Footer */}
              <div className="p-6 border-t border-sam-border flex justify-end gap-3 sticky bottom-0 bg-sam-surface">
                <button
                  onClick={closeOrgoModal}
                  className="px-5 py-2.5 rounded-lg border border-sam-border text-sam-text-dim hover:text-sam-text hover:border-sam-accent/50 font-medium text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleOrgoConfirm}
                  disabled={!keyValidated || isSubmitting || (orgoProjects.length > 0 && !selectedProject) || !orgoVMName.trim() || showDeleteOrgoConfirm}
                  className="px-5 py-2.5 rounded-lg bg-sam-accent text-sam-bg font-medium text-sm hover:bg-sam-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Adding VM...
                    </>
                  ) : (
                    <>
                      Add VM
                      <Plus className="w-4 h-4" />
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
                    <h2 className="text-xl font-display font-semibold text-sam-text">
                      {credentials?.hasAwsCredentials ? 'Add EC2 VM' : 'Configure AWS EC2'}
                    </h2>
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

                {/* VM Name */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-sam-text flex items-center gap-2">
                    <Server className="w-4 h-4 text-sam-accent" />
                    VM Name
                    <span className="text-sam-error">*</span>
                  </label>
                  <input
                    type="text"
                    value={awsVMName}
                    onChange={(e) => setAwsVMName(e.target.value)}
                    placeholder="e.g., My AWS VM"
                    className="w-full px-4 py-2.5 rounded-lg bg-sam-bg border border-sam-border focus:border-sam-accent focus:ring-1 focus:ring-sam-accent/30 transition-all text-sam-text placeholder:text-sam-text-dim/50 text-sm"
                  />
                </div>

                {/* AWS Credentials - only show if not already configured */}
                {!credentials?.hasAwsCredentials && (
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
                        className={`w-full px-4 py-2.5 rounded-lg bg-sam-bg border transition-all text-sam-text placeholder:text-sam-text-dim/50 font-mono text-sm ${awsKeyValidated
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
                        className={`w-full px-4 py-2.5 rounded-lg bg-sam-bg border transition-all text-sam-text placeholder:text-sam-text-dim/50 font-mono text-sm ${awsKeyValidated
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
                )}

                {/* Already configured notice */}
                {credentials?.hasAwsCredentials && (
                  <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                    <p className="text-sm text-green-400 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      Using your saved AWS credentials
                    </p>
                  </div>
                )}

                {/* Region & Instance Type Selection */}
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
                          { id: 't3.micro', name: 't3.micro', vcpu: 2, memory: '1 GB', priceHour: 'Free Tier', freeTier: true },
                          { id: 't3.small', name: 't3.small', vcpu: 2, memory: '2 GB', priceHour: 'Free Tier', freeTier: true },
                          { id: 'c7i-flex.large', name: 'c7i-flex.large', vcpu: 2, memory: '4 GB', priceHour: 'Free Tier', freeTier: true },
                          { id: 'm7i-flex.large', name: 'm7i-flex.large', vcpu: 2, memory: '8 GB', priceHour: 'Free Tier', freeTier: true, recommended: true },
                          { id: 't3.medium', name: 't3.medium', vcpu: 2, memory: '4 GB', priceHour: '~$0.04/hr' },
                          { id: 't3.large', name: 't3.large', vcpu: 2, memory: '8 GB', priceHour: '~$0.08/hr' },
                          { id: 't3.xlarge', name: 't3.xlarge', vcpu: 4, memory: '16 GB', priceHour: '~$0.17/hr' },
                        ]).map((type) => (
                          <button
                            key={type.id}
                            onClick={() => setAwsInstanceType(type.id)}
                            className={`p-3 rounded-lg border text-left transition-all ${awsInstanceType === type.id
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
                  disabled={!awsKeyValidated || isSubmitting || !awsVMName.trim()}
                  className="px-5 py-2.5 rounded-lg bg-sam-accent text-sam-bg font-medium text-sm hover:bg-sam-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Provisioning EC2...
                    </>
                  ) : (
                    <>
                      Add VM
                      <Plus className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* E2B Configuration Modal */}
      <AnimatePresence>
        {showE2BModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={closeE2BModal}
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
                  <img src="/logos/e2b.png" alt="E2B" className="w-8 h-8 object-contain" />
                  <div>
                    <h2 className="text-xl font-display font-semibold text-sam-text">
                      {credentials?.hasE2bApiKey ? 'Add E2B Sandbox' : 'Configure E2B'}
                    </h2>
                    <p className="text-xs text-sam-text-dim">Ephemeral sandboxed environments</p>
                  </div>
                </div>
                <button
                  onClick={closeE2BModal}
                  className="p-2 rounded-lg hover:bg-sam-bg transition-colors text-sam-text-dim hover:text-sam-text"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-6">
                {/* Error Display */}
                {e2bError && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="p-3 rounded-lg bg-sam-error/10 border border-sam-error/30 flex items-start gap-2"
                  >
                    <AlertCircle className="w-4 h-4 text-sam-error flex-shrink-0 mt-0.5" />
                    <p className="text-sam-error text-sm">{e2bError}</p>
                  </motion.div>
                )}

                {/* VM Name */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-sam-text flex items-center gap-2">
                    <Server className="w-4 h-4 text-sam-accent" />
                    Sandbox Name
                    <span className="text-sam-error">*</span>
                  </label>
                  <input
                    type="text"
                    value={e2bVMName}
                    onChange={(e) => setE2bVMName(e.target.value)}
                    placeholder="e.g., My E2B Sandbox"
                    className="w-full px-4 py-2.5 rounded-lg bg-sam-bg border border-sam-border focus:border-sam-accent focus:ring-1 focus:ring-sam-accent/30 transition-all text-sam-text placeholder:text-sam-text-dim/50 text-sm"
                  />
                </div>

                {/* E2B API Key - only show if not already configured */}
                {!credentials?.hasE2bApiKey && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-sam-text flex items-center gap-2">
                        <Key className="w-4 h-4 text-sam-accent" />
                        E2B API Key
                        <span className="text-sam-error">*</span>
                      </label>
                      <a
                        href="https://e2b.dev/dashboard"
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
                        value={e2bApiKey}
                        onChange={(e) => {
                          setE2bApiKey(e.target.value)
                          setE2bKeyValidated(false)
                        }}
                        placeholder="e2b_..."
                        disabled={e2bKeyValidated}
                        className={`flex-1 px-4 py-2.5 rounded-lg bg-sam-bg border transition-all text-sam-text placeholder:text-sam-text-dim/50 font-mono text-sm ${e2bKeyValidated
                          ? 'border-green-500/50 bg-green-500/5'
                          : 'border-sam-border focus:border-sam-accent focus:ring-1 focus:ring-sam-accent/30'
                          }`}
                      />
                      {!e2bKeyValidated ? (
                        <button
                          onClick={handleValidateE2B}
                          disabled={isValidatingE2B || !e2bApiKey.trim()}
                          className="px-4 py-2.5 rounded-lg bg-sam-accent text-sam-bg font-medium text-sm hover:bg-sam-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          {isValidatingE2B ? (
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
                            setE2bKeyValidated(false)
                            setE2bApiKey('')
                          }}
                          className="px-4 py-2.5 rounded-lg border border-sam-border text-sam-text-dim hover:text-sam-text hover:border-sam-accent/50 font-medium text-sm transition-colors flex items-center gap-2"
                        >
                          Change
                        </button>
                      )}
                    </div>

                    {e2bKeyValidated && (
                      <p className="text-xs text-green-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> E2B API key validated successfully
                      </p>
                    )}
                  </div>
                )}

                {/* Already configured notice */}
                {credentials?.hasE2bApiKey && (
                  <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                    <p className="text-sm text-green-400 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      Using your saved E2B API key
                    </p>
                  </div>
                )}

                {/* Timeout Selection */}
                {e2bKeyValidated && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    {/* Timeout Selection */}
                    <div className="space-y-3">
                      <label className="text-sm font-medium text-sam-text flex items-center gap-2">
                        <Power className="w-4 h-4 text-sam-accent" />
                        Sandbox Duration
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {(e2bTimeoutOptions.length > 0 ? e2bTimeoutOptions : [
                          { id: 300, name: '5 minutes', description: 'Short tasks', freeTier: true },
                          { id: 1800, name: '30 minutes', description: 'Medium tasks', freeTier: true },
                          { id: 3600, name: '1 hour', description: 'Long tasks', recommended: true, freeTier: true },
                          { id: 7200, name: '2 hours', description: 'Extended sessions', freeTier: false },
                          { id: 21600, name: '6 hours', description: 'Very long sessions', freeTier: false },
                          { id: 86400, name: '24 hours', description: 'Maximum duration', freeTier: false },
                        ]).map((option) => (
                          <button
                            key={option.id}
                            onClick={() => setSelectedE2bTimeout(option.id)}
                            className={`p-3 rounded-lg border text-left transition-all ${selectedE2bTimeout === option.id
                              ? 'border-sam-accent bg-sam-accent/10'
                              : 'border-sam-border hover:border-sam-accent/50 hover:bg-sam-bg'
                              }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sam-text font-medium text-sm">{option.name}</span>
                              {option.recommended && (
                                <span className="text-[10px] font-mono text-sam-accent bg-sam-accent/10 px-1.5 py-0.5 rounded">
                                  Best
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-sam-text-dim">
                              {option.description}
                            </div>
                            <div className={`text-[10px] mt-1 font-medium ${option.freeTier ? 'text-green-400' : 'text-amber-400'}`}>
                              {option.freeTier ? 'Free Tier' : 'Paid Plan'}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Pro Plan Notice for paid durations */}
                    {(() => {
                      const selectedOption = (e2bTimeoutOptions.length > 0 ? e2bTimeoutOptions : [
                        { id: 300, freeTier: true },
                        { id: 1800, freeTier: true },
                        { id: 3600, freeTier: true },
                        { id: 7200, freeTier: false },
                        { id: 21600, freeTier: false },
                        { id: 86400, freeTier: false },
                      ]).find(opt => opt.id === selectedE2bTimeout)
                      return selectedOption && !selectedOption.freeTier ? (
                        <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
                          <div className="flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <p className="text-blue-400 font-medium">Pro Plan Feature</p>
                              <p className="text-blue-400/80 text-sm mt-1">
                                Durations longer than 1 hour require an E2B Pro plan.
                                If you already have a Pro plan, you can proceed.
                              </p>
                            </div>
                          </div>
                          <a
                            href="https://e2b.dev/pricing"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-500/20 border border-blue-500/40 text-blue-400 font-medium text-sm hover:bg-blue-500/30 hover:border-blue-500/50 transition-all"
                          >
                            <ExternalLink className="w-4 h-4" />
                            View E2B Plans
                          </a>
                        </div>
                      ) : null
                    })()}

                    {/* E2B Info Notice */}
                    <div className="p-3 rounded-lg bg-sam-bg border border-sam-border">
                      <p className="text-xs text-sam-text-dim">
                        <strong className="text-sam-text">Note:</strong> E2B sandboxes are ephemeral environments.
                        Data does not persist after the timeout expires. Sandboxes include Python, Node.js, and internet access.
                        <a
                          href="https://e2b.dev/docs"
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
                  onClick={closeE2BModal}
                  className="px-5 py-2.5 rounded-lg border border-sam-border text-sam-text-dim hover:text-sam-text hover:border-sam-accent/50 font-medium text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleE2BConfirm}
                  disabled={!e2bKeyValidated || isSubmitting || !e2bVMName.trim()}
                  className="px-5 py-2.5 rounded-lg bg-sam-accent text-sam-bg font-medium text-sm hover:bg-sam-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating Sandbox...
                    </>
                  ) : (
                    <>
                      Add Sandbox
                      <Plus className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Template Deploy Modal */}
      <AnimatePresence>
        {showTemplateDeployModal && selectedTemplate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={closeTemplateDeployModal}
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
                  <div className="w-10 h-10 rounded-xl bg-sam-bg flex items-center justify-center overflow-hidden">
                    {isEmojiLogo(selectedTemplate.logo) ? (
                      <span className="text-2xl">{selectedTemplate.logo}</span>
                    ) : (
                      <img
                        src={selectedTemplate.logo}
                        alt={selectedTemplate.name}
                        className="w-8 h-8 object-contain"
                      />
                    )}
                  </div>
                  <div>
                    <h2 className="text-xl font-display font-semibold text-sam-text">
                      Deploy {selectedTemplate.name}
                    </h2>
                    <p className="text-xs text-sam-text-dim">
                      {categoryConfig[selectedTemplate.category]?.label || 'Template'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={closeTemplateDeployModal}
                  className="p-2 rounded-lg hover:bg-sam-bg transition-colors text-sam-text-dim hover:text-sam-text"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-6">
                {/* Template Description */}
                <div className="p-4 rounded-lg bg-sam-bg/50 border border-sam-border">
                  <p className="text-sm text-sam-text-dim">{selectedTemplate.description}</p>
                  {selectedTemplate.websiteUrl && (
                    <a
                      href={selectedTemplate.websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs text-sam-accent hover:text-sam-accent/80"
                    >
                      Learn more <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>

                {/* Orgo API Key Setup - only show if not configured */}
                {!credentials?.hasOrgoApiKey && !keyValidated && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
                      <div className="flex items-start gap-3">
                        <Key className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-amber-400 font-medium text-sm">Orgo API Key Required</p>
                          <p className="text-amber-400/80 text-xs mt-1">
                            Templates are deployed to Orgo VMs. Enter your API key to continue.
                          </p>
                        </div>
                      </div>
                    </div>

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
                            setTemplateError(null)
                          }}
                          placeholder="Enter your Orgo API key"
                          className="flex-1 px-4 py-2.5 rounded-lg bg-sam-bg border border-sam-border focus:border-sam-accent focus:ring-1 focus:ring-sam-accent/30 transition-all text-sam-text placeholder:text-sam-text-dim/50 font-mono text-sm"
                        />
                        <button
                          onClick={async () => {
                            if (!orgoApiKey.trim()) {
                              setTemplateError('Please enter your Orgo API key')
                              return
                            }
                            setIsValidatingKey(true)
                            setTemplateError(null)
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
                              if (data.projects?.length > 0) {
                                setSelectedTemplateProject(data.projects[0])
                              }
                              // Update credentials state
                              setCredentials(prev => prev ? { ...prev, hasOrgoApiKey: true } : null)
                            } catch (e) {
                              setTemplateError(e instanceof Error ? e.message : 'Failed to validate API key')
                            } finally {
                              setIsValidatingKey(false)
                            }
                          }}
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
                      </div>
                    </div>
                  </div>
                )}

                {/* Show rest of the form only after API key is validated */}
                {(credentials?.hasOrgoApiKey || keyValidated) && (
                  <>
                    {/* Agent Name Input */}
                    <div className="space-y-3">
                      <label className="text-sm font-medium text-sam-text flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-sam-accent" />
                        Agent Name
                        <span className="text-sam-error">*</span>
                      </label>
                      <input
                        type="text"
                        value={templateAgentName}
                        onChange={(e) => setTemplateAgentName(e.target.value)}
                        placeholder="e.g., MyAwesomeAgent"
                        className="w-full px-4 py-2.5 rounded-lg bg-sam-bg border border-sam-border focus:border-sam-accent focus:ring-1 focus:ring-sam-accent/30 transition-all text-sam-text placeholder:text-sam-text-dim/50 text-sm"
                      />
                      <p className="text-xs text-sam-text-dim">
                        This name will be used to register your agent with {selectedTemplate.name}
                      </p>
                    </div>

                    {/* Project Selection */}
                    <div className="space-y-3">
                      <label className="text-sm font-medium text-sam-text flex items-center gap-2">
                        <FolderPlus className="w-4 h-4 text-sam-accent" />
                        Orgo Project
                        <span className="text-sam-error">*</span>
                      </label>
                      {isLoadingProjectsForTemplate ? (
                        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-sam-bg border border-sam-border text-sam-text-dim">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span className="text-sm">Loading projects...</span>
                        </div>
                      ) : orgoProjects.length > 0 ? (
                        <div className="space-y-2">
                          {orgoProjects.map((project) => (
                            <button
                              key={project.id}
                              onClick={() => setSelectedTemplateProject(project)}
                              className={`w-full p-3 rounded-lg border text-left transition-all ${selectedTemplateProject?.id === project.id
                                  ? 'border-sam-accent bg-sam-accent/10'
                                  : 'border-sam-border hover:border-sam-accent/50 hover:bg-sam-bg'
                                }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-sam-text font-medium text-sm">{project.name}</span>
                                {selectedTemplateProject?.id === project.id && (
                                  <CheckCircle2 className="w-4 h-4 text-sam-accent" />
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <p className="text-sm text-sam-text-dim">
                            No projects found. Create your first project:
                          </p>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={newProjectName}
                              onChange={(e) => setNewProjectName(e.target.value)}
                              placeholder="Project name"
                              className="flex-1 px-4 py-2.5 rounded-lg bg-sam-bg border border-sam-border focus:border-sam-accent focus:ring-1 focus:ring-sam-accent/30 transition-all text-sam-text placeholder:text-sam-text-dim/50 text-sm"
                            />
                            <button
                              onClick={async () => {
                                if (!newProjectName.trim()) {
                                  setTemplateError('Please enter a project name')
                                  return
                                }
                                setIsCreatingProject(true)
                                setTemplateError(null)
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
                                  setOrgoProjects(prev => [...prev, data.project])
                                  setSelectedTemplateProject(data.project)
                                } catch (e) {
                                  setTemplateError(e instanceof Error ? e.message : 'Failed to create project')
                                } finally {
                                  setIsCreatingProject(false)
                                }
                              }}
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
                        </div>
                      )}
                    </div>

                    {/* RAM Selection */}
                    <div className="space-y-3">
                      <label className="text-sm font-medium text-sam-text flex items-center gap-2">
                        <Server className="w-4 h-4 text-sam-accent" />
                        Memory (RAM)
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {orgoRAMOptions.map((option) => {
                          const isDisabled = option.id < selectedTemplate.vmConfig.minRam
                          return (
                            <button
                              key={option.id}
                              onClick={() => !isDisabled && setSelectedTemplateRAM(option.id)}
                              disabled={isDisabled}
                              className={`p-2.5 rounded-lg border text-left transition-all flex flex-col justify-center ${isDisabled
                                  ? 'border-sam-border/50 opacity-40 cursor-not-allowed'
                                  : selectedTemplateRAM === option.id
                                    ? 'border-sam-accent bg-sam-accent/10'
                                    : 'border-sam-border hover:border-sam-accent/50 hover:bg-sam-bg'
                                }`}
                            >
                              <div className="flex items-center justify-between mb-0.5">
                                <span className="text-sam-text font-medium text-sm">{option.name}</span>
                                {option.id === selectedTemplate.vmConfig.recommendedRam && (
                                  <span className="text-[9px] font-mono text-sam-accent bg-sam-accent/10 px-1 py-0.5 rounded">
                                    Best
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-sam-text-dim">
                                {option.description}
                              </div>
                              <div className={`text-[10px] mt-1 font-medium ${option.freeTier ? 'text-green-400' : 'text-amber-400'}`}>
                                {option.freeTier ? 'Free Tier' : 'Paid Plan'}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Pro Plan Notice */}
                    {!orgoRAMOptions.find(opt => opt.id === selectedTemplateRAM)?.freeTier && (
                      <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-blue-400 font-medium">Pro Plan Feature</p>
                            <p className="text-blue-400/80 text-sm mt-1">
                              {orgoRAMOptions.find(opt => opt.id === selectedTemplateRAM)?.name} RAM requires an Orgo Pro plan.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Deployment Progress */}
                {deploymentProgress && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="p-4 rounded-lg bg-sam-accent/10 border border-sam-accent/30"
                  >
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-5 h-5 text-sam-accent animate-spin" />
                      <div>
                        <p className="text-sam-accent font-medium text-sm">{deploymentProgress}</p>
                        <p className="text-sam-accent/70 text-xs mt-0.5">This may take a few minutes...</p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Loading Projects Notice */}
                {isLoadingProjectsForTemplate && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="p-3 rounded-lg bg-sam-accent/10 border border-sam-accent/30 flex items-center gap-2"
                  >
                    <Loader2 className="w-4 h-4 text-sam-accent animate-spin flex-shrink-0" />
                    <p className="text-sam-accent text-sm">Loading Orgo projects...</p>
                  </motion.div>
                )}


                {/* Error Display */}
                {templateError && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="p-3 rounded-lg bg-sam-error/10 border border-sam-error/30 flex items-start gap-2"
                  >
                    <AlertCircle className="w-4 h-4 text-sam-error flex-shrink-0 mt-0.5" />
                    <p className="text-sam-error text-sm">{templateError}</p>
                  </motion.div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-6 border-t border-sam-border flex justify-end gap-3 sticky bottom-0 bg-sam-surface">
                <button
                  onClick={closeTemplateDeployModal}
                  disabled={isDeployingTemplate}
                  className="px-5 py-2.5 rounded-lg border border-sam-border text-sam-text-dim hover:text-sam-text hover:border-sam-accent/50 font-medium text-sm transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeployTemplate}
                  disabled={isDeployingTemplate || isLoadingProjectsForTemplate || isValidatingKey || !templateAgentName.trim() || !selectedTemplateProject || (!credentials?.hasOrgoApiKey && !keyValidated)}
                  className="px-5 py-2.5 rounded-lg bg-sam-accent text-sam-bg font-medium text-sm hover:bg-sam-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isDeployingTemplate ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Deploying...
                    </>
                  ) : isLoadingProjectsForTemplate ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading...
                    </>
                  ) : isValidatingKey ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Validating...
                    </>
                  ) : (
                    <>
                      <Rocket className="w-4 h-4" />
                      Deploy Agent
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Template Success Modal */}
      <AnimatePresence>
        {showTemplateSuccessModal && deployedVM && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={closeTemplateSuccessModal}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="bg-sam-surface border border-sam-border rounded-2xl w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Success Animation */}
              <div className="p-8 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', delay: 0.1, duration: 0.5 }}
                  className="w-20 h-20 rounded-full bg-sam-accent/20 flex items-center justify-center mx-auto mb-6"
                >
                  <CheckCircle2 className="w-10 h-10 text-sam-accent" />
                </motion.div>

                <motion.h2
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-2xl font-display font-bold text-sam-text mb-2"
                >
                  Agent Deployed!
                </motion.h2>

                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-sam-text-dim mb-6"
                >
                  {deployedVM.name} is now running
                </motion.p>

                {/* Post-Setup Action (Claim URL) */}
                {postSetupData?.type === 'claimUrl' && postSetupData.claimUrl && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="p-4 rounded-xl bg-sam-bg border border-sam-border mb-6 text-left"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-sam-accent/10 flex items-center justify-center flex-shrink-0">
                        <ExternalLink className="w-4 h-4 text-sam-accent" />
                      </div>
                      <div>
                        <p className="font-medium text-sam-text text-sm">One more step!</p>
                        <p className="text-xs text-sam-text-dim mt-0.5">
                          {postSetupData.message || 'Verify your agent ownership to activate it.'}
                        </p>
                      </div>
                    </div>
                    {postSetupData.verificationCode && (
                      <div className="mb-3 p-2 rounded-lg bg-sam-surface border border-sam-border">
                        <p className="text-xs text-sam-text-dim mb-1">Verification Code:</p>
                        <p className="font-mono text-sm text-sam-accent">{postSetupData.verificationCode}</p>
                      </div>
                    )}
                    <a
                      href={postSetupData.claimUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-sam-accent text-sam-bg font-medium text-sm hover:bg-sam-accent/90 transition-colors"
                    >
                      Claim Your Agent
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </motion.div>
                )}

                {/* Action Buttons */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="flex gap-3"
                >
                  <button
                    onClick={closeTemplateSuccessModal}
                    className="flex-1 px-4 py-2.5 rounded-lg border border-sam-border text-sam-text-dim hover:text-sam-text hover:border-sam-accent/50 font-medium text-sm transition-colors"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => {
                      closeTemplateSuccessModal()
                      router.push(`/learning-sources?vmId=${deployedVM.id}`)
                    }}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-sam-accent/10 border border-sam-accent/30 text-sam-accent font-medium text-sm hover:bg-sam-accent/20 transition-colors flex items-center justify-center gap-2"
                  >
                    <Settings className="w-4 h-4" />
                    Open VM
                  </button>
                </motion.div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Template Modal */}
      <AnimatePresence>
        {showCreateTemplateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={closeCreateTemplateModal}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="bg-sam-surface border border-sam-border rounded-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-sam-border sticky top-0 bg-sam-surface z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sam-accent/10 flex items-center justify-center">
                    <PenTool className="w-5 h-5 text-sam-accent" />
                  </div>
                  <div>
                    <h2 className="text-xl font-display font-semibold text-sam-text">
                      Create Your Own Template
                    </h2>
                    <p className="text-xs text-sam-text-dim">
                      Build a custom AI agent using natural language
                    </p>
                  </div>
                </div>
                <button
                  onClick={closeCreateTemplateModal}
                  className="p-2 rounded-lg hover:bg-sam-bg transition-colors text-sam-text-dim hover:text-sam-text"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-6">
                {/* Template Ideas Section */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-sam-text flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-amber-400" />
                    Quick Start Ideas
                  </label>
                  <p className="text-xs text-sam-text-dim">
                    Click an idea to auto-fill the form, or create your own from scratch
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {templateIdeas.map((idea) => (
                      <button
                        key={idea.name}
                        onClick={() => handleSelectTemplateIdea(idea)}
                        className={`p-3 rounded-lg border text-left transition-all hover:border-sam-accent/50 hover:bg-sam-accent/5 ${newTemplateName === idea.name
                            ? 'border-sam-accent bg-sam-accent/10'
                            : 'border-sam-border'
                          }`}
                      >
                        <div className="text-2xl mb-1">{idea.icon}</div>
                        <div className="text-xs font-medium text-sam-text truncate">{idea.name}</div>
                        <div className={`text-[9px] font-mono px-1 py-0.5 rounded inline-block mt-1 ${categoryConfig[idea.category]?.color || 'text-gray-400 bg-gray-400/10'}`}>
                          {categoryConfig[idea.category]?.label || 'Other'}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Duplicate Template Warning */}
                {duplicateTemplate && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30"
                  >
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-amber-400 font-medium text-sm">Similar template already exists</p>
                        <p className="text-amber-400/80 text-xs mt-1 mb-3">
                          A template called "{duplicateTemplate.name}" already exists. You can deploy it directly or personalize your template by changing the name and description.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => {
                              closeCreateTemplateModal()
                              handleTemplateClick(duplicateTemplate)
                            }}
                            className="px-3 py-1.5 rounded-lg bg-sam-accent text-sam-bg font-medium text-xs hover:bg-sam-accent/90 transition-colors flex items-center gap-1.5"
                          >
                            <Rocket className="w-3.5 h-3.5" />
                            Deploy "{duplicateTemplate.name}"
                          </button>
                          <button
                            onClick={() => setDuplicateTemplate(null)}
                            className="px-3 py-1.5 rounded-lg border border-amber-500/50 text-amber-400 font-medium text-xs hover:bg-amber-500/10 transition-colors"
                          >
                            Personalize Instead
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Template Name */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-sam-text flex items-center gap-2">
                    Template Name
                    <span className="text-sam-error">*</span>
                  </label>
                  <input
                    type="text"
                    value={newTemplateName}
                    onChange={(e) => {
                      setNewTemplateName(e.target.value)
                      // Clear duplicate warning when user starts typing
                      if (duplicateTemplate) setDuplicateTemplate(null)
                    }}
                    placeholder="e.g., Personal Assistant, Code Reviewer"
                    className="w-full px-4 py-2.5 rounded-lg bg-sam-bg border border-sam-border focus:border-sam-accent focus:ring-1 focus:ring-sam-accent/30 transition-all text-sam-text placeholder:text-sam-text-dim/50 text-sm"
                  />
                </div>

                {/* Description */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-sam-text flex items-center gap-2">
                    Short Description
                    <span className="text-sam-error">*</span>
                  </label>
                  <input
                    type="text"
                    value={newTemplateDescription}
                    onChange={(e) => {
                      setNewTemplateDescription(e.target.value)
                      // Clear duplicate warning when user starts typing
                      if (duplicateTemplate) setDuplicateTemplate(null)
                    }}
                    placeholder="A brief description of what this agent does"
                    className="w-full px-4 py-2.5 rounded-lg bg-sam-bg border border-sam-border focus:border-sam-accent focus:ring-1 focus:ring-sam-accent/30 transition-all text-sam-text placeholder:text-sam-text-dim/50 text-sm"
                  />
                </div>

                {/* Natural Language Prompt */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-sam-text flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-sam-accent" />
                    What should your agent do?
                  </label>
                  <textarea
                    value={newTemplatePrompt}
                    onChange={(e) => setNewTemplatePrompt(e.target.value)}
                    placeholder="Describe in natural language what you want your AI agent to do. For example: 'Monitor my GitHub repositories and automatically respond to issues with suggested fixes. Prioritize security-related issues and send me daily summaries.'"
                    rows={4}
                    className="w-full px-4 py-2.5 rounded-lg bg-sam-bg border border-sam-border focus:border-sam-accent focus:ring-1 focus:ring-sam-accent/30 transition-all text-sam-text placeholder:text-sam-text-dim/50 text-sm resize-none"
                  />
                  <p className="text-xs text-sam-text-dim">
                    Be as specific as possible. The more detail you provide, the better your agent will understand its role.
                  </p>
                </div>

                {/* Info Box */}
                <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
                  <div className="flex items-start gap-3">
                    <Rocket className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-blue-400 font-medium text-sm">How it works</p>
                      <p className="text-blue-400/80 text-xs mt-1">
                        Your template will be added to the marketplace and can be deployed to any VM.
                        Other users can discover and use your template too!
                      </p>
                    </div>
                  </div>
                </div>

                {/* Error Display */}
                {createTemplateError && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="p-3 rounded-lg bg-sam-error/10 border border-sam-error/30 flex items-start gap-2"
                  >
                    <AlertCircle className="w-4 h-4 text-sam-error flex-shrink-0 mt-0.5" />
                    <p className="text-sam-error text-sm">{createTemplateError}</p>
                  </motion.div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-6 border-t border-sam-border flex justify-end gap-3 sticky bottom-0 bg-sam-surface">
                <button
                  onClick={closeCreateTemplateModal}
                  disabled={isCreatingTemplate}
                  className="px-5 py-2.5 rounded-lg border border-sam-border text-sam-text-dim hover:text-sam-text hover:border-sam-accent/50 font-medium text-sm transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateTemplate}
                  disabled={isCreatingTemplate || !newTemplateName.trim() || !newTemplateDescription.trim()}
                  className="px-5 py-2.5 rounded-lg bg-sam-accent text-sam-bg font-medium text-sm hover:bg-sam-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isCreatingTemplate ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Create Template
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Template Share Modal */}
      <AnimatePresence>
        {showTemplateShareModal && templateToShare && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowTemplateShareModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="bg-sam-surface border border-sam-border rounded-2xl w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-sam-border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sam-accent/10 flex items-center justify-center">
                    <Share2 className="w-5 h-5 text-sam-accent" />
                  </div>
                  <div>
                    <h2 className="text-xl font-display font-semibold text-sam-text">
                      Share Template
                    </h2>
                    <p className="text-xs text-sam-text-dim">{templateToShare.name}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowTemplateShareModal(false)}
                  className="p-2 rounded-lg hover:bg-sam-bg transition-colors text-sam-text-dim hover:text-sam-text"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-4">
                {/* Share URL Preview */}
                <div className="p-3 rounded-lg bg-sam-bg border border-sam-border">
                  <p className="text-xs text-sam-text-dim mb-1">Share URL</p>
                  <p className="text-sm text-sam-text font-mono truncate">
                    {typeof window !== 'undefined' ? `${window.location.origin}/templates/${templateToShare.id}` : ''}
                  </p>
                </div>

                {/* Share Options */}
                <div className="space-y-2">
                  {/* Copy Link */}
                  <button
                    onClick={() => {
                      const url = `${window.location.origin}/templates/${templateToShare.id}`
                      navigator.clipboard.writeText(url)
                      setCopiedTemplateId(templateToShare.id)
                      setTimeout(() => setCopiedTemplateId(null), 2000)
                      logShareEvent(templateToShare.id, 'copy_link')
                    }}
                    className="w-full p-4 rounded-xl border border-sam-border hover:border-sam-accent/50 hover:bg-sam-bg/50 transition-all flex items-center gap-4"
                  >
                    <div className="w-10 h-10 rounded-lg bg-sam-bg flex items-center justify-center flex-shrink-0">
                      {copiedTemplateId === templateToShare.id ? (
                        <Check className="w-5 h-5 text-green-400" />
                      ) : (
                        <Link2 className="w-5 h-5 text-sam-text-dim" />
                      )}
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sam-text font-medium text-sm">
                        {copiedTemplateId === templateToShare.id ? 'Copied!' : 'Copy Link'}
                      </p>
                      <p className="text-xs text-sam-text-dim">Copy the template URL to clipboard</p>
                    </div>
                  </button>

                  {/* Post on X (Twitter) */}
                  <a
                    href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`This ${templateToShare.name} AI agent template is insane.\n\n${templateToShare.description}\n\nCheck it out on ClawdBody.`)}&url=${encodeURIComponent(`${typeof window !== 'undefined' ? window.location.origin : 'https://clawdbody.com'}/templates/${templateToShare.id}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => logShareEvent(templateToShare.id, 'twitter')}
                    className="w-full p-4 rounded-xl border border-sam-border hover:border-sam-accent/50 hover:bg-sam-bg/50 transition-all flex items-center gap-4"
                  >
                    <div className="w-10 h-10 rounded-lg bg-sam-bg flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-sam-text-dim" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      </svg>
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sam-text font-medium text-sm">Post on X</p>
                      <p className="text-xs text-sam-text-dim">Share to your X (Twitter) feed</p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-sam-text-dim" />
                  </a>

                  {/* Post on LinkedIn */}
                  <a
                    href={`https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(`Just found this ${templateToShare.name} AI agent template and had to share.\n${templateToShare.description}\n\nIt's available on ClawdBody.\n\nWhat workflows are you automating with AI agents?`)}&url=${encodeURIComponent(`${typeof window !== 'undefined' ? window.location.origin : 'https://clawdbody.com'}/templates/${templateToShare.id}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => logShareEvent(templateToShare.id, 'linkedin')}
                    className="w-full p-4 rounded-xl border border-sam-border hover:border-sam-accent/50 hover:bg-sam-bg/50 transition-all flex items-center gap-4"
                  >
                    <div className="w-10 h-10 rounded-lg bg-sam-bg flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-sam-text-dim" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                      </svg>
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sam-text font-medium text-sm">Post on LinkedIn</p>
                      <p className="text-xs text-sam-text-dim">Share to your LinkedIn network</p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-sam-text-dim" />
                  </a>

                  {/* Share via Email */}
                  <a
                    href={`mailto:?subject=${encodeURIComponent(`${templateToShare.name} — AI agent template I found to automate entire workflow`)}&body=${encodeURIComponent(`Hey,\n\nFound this AI agent template and thought you might find it useful:\n\n${templateToShare.name}\n${templateToShare.description}\n\nIt's available on ClawdBody:\n${typeof window !== 'undefined' ? window.location.origin : 'https://clawdbody.com'}/templates/${templateToShare.id}`)}`}
                    onClick={() => logShareEvent(templateToShare.id, 'email')}
                    className="w-full p-4 rounded-xl border border-sam-border hover:border-sam-accent/50 hover:bg-sam-bg/50 transition-all flex items-center gap-4"
                  >
                    <div className="w-10 h-10 rounded-lg bg-sam-bg flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-sam-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="4" width="20" height="16" rx="2" />
                        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                      </svg>
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sam-text font-medium text-sm">Share via Email</p>
                      <p className="text-xs text-sam-text-dim">Send template link via email</p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-sam-text-dim" />
                  </a>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-6 border-t border-sam-border">
                <button
                  onClick={() => setShowTemplateShareModal(false)}
                  className="w-full px-4 py-2.5 rounded-lg border border-sam-border text-sam-text-dim hover:text-sam-text hover:border-sam-accent/50 font-medium text-sm transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
