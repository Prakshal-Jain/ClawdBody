import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { OrgoClient, generateComputerName } from '@/lib/orgo'
import { AWSClient, generateInstanceName } from '@/lib/aws'
import { E2BClient, generateSandboxName } from '@/lib/e2b'
import { GitHubClient } from '@/lib/github'
import { VMSetup } from '@/lib/vm-setup'
import { AWSVMSetup } from '@/lib/aws-vm-setup'
import { E2BVMSetup } from '@/lib/e2b-vm-setup'
// Import type from Prisma client for type checking
import type { SetupState } from '@prisma/client'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { claudeApiKey, telegramBotToken, telegramUserId, vmId } = await request.json()

    if (!claudeApiKey) {
      return NextResponse.json({ error: 'Claude API key is required' }, { status: 400 })
    }

    // Get existing setup state to retrieve user's provider config
    let setupState = await prisma.setupState.findUnique({
      where: { userId: session.user.id },
    })

    // If vmId is provided, get the VM to determine provider
    let vm = null
    if (vmId) {
      vm = await prisma.vM.findFirst({
        where: { id: vmId, userId: session.user.id },
      })
      if (!vm) {
        return NextResponse.json({ error: 'VM not found' }, { status: 404 })
      }
    }

    // Use VM provider if available, otherwise fall back to setupState
    const vmProvider = vm?.provider || setupState?.vmProvider || 'orgo'

    // Validate provider-specific configuration
    if (vmProvider === 'orgo') {
      const orgoApiKey = setupState?.orgoApiKey
      if (!orgoApiKey) {
        return NextResponse.json({ 
          error: 'Orgo API key not configured. Please go back and configure your Orgo API key.' 
        }, { status: 400 })
      }
    } else if (vmProvider === 'aws') {
      // Type assertion to access AWS fields (TypeScript may have stale types cached)
      const awsState = setupState as SetupState & { awsAccessKeyId?: string; awsSecretAccessKey?: string }
      const awsAccessKeyId = awsState?.awsAccessKeyId
      const awsSecretAccessKey = awsState?.awsSecretAccessKey
      if (!awsAccessKeyId || !awsSecretAccessKey) {
        return NextResponse.json({ 
          error: 'AWS credentials not configured. Please go back and configure your AWS credentials.' 
        }, { status: 400 })
      }
    } else if (vmProvider === 'e2b') {
      // Type assertion to access E2B fields
      const e2bState = setupState as SetupState & { e2bApiKey?: string }
      const e2bApiKey = e2bState?.e2bApiKey
      if (!e2bApiKey) {
        return NextResponse.json({ 
          error: 'E2B API key not configured. Please go back and configure your E2B API key.' 
        }, { status: 400 })
      }
    } else {
      return NextResponse.json({ 
        error: `Unsupported VM provider: ${vmProvider}` 
      }, { status: 400 })
    }

    if (!setupState) {
      setupState = await prisma.setupState.create({
        data: {
          userId: session.user.id,
          claudeApiKey,
          status: 'provisioning',
        },
      })
    } else {
      // Update existing state and reset all progress flags for a fresh start
      setupState = await prisma.setupState.update({
        where: { id: setupState.id },
        data: {
          claudeApiKey,
          status: 'provisioning',
          errorMessage: null,
          vmCreated: false,
          repoCreated: false,
          repoCloned: false,
          gitSyncConfigured: false,
          clawdbotInstalled: false,
          telegramConfigured: false,
          gatewayStarted: false,
        },
      })
    }

    // If vmId is provided, also update the VM model status
    if (vmId && vm) {
      await prisma.vM.update({
        where: { id: vmId },
        data: {
          status: 'provisioning',
          errorMessage: null,
          vmCreated: false,
          repoCloned: false,
          gitSyncConfigured: false,
          clawdbotInstalled: false,
          gatewayStarted: false,
        },
      })
    }

    // Start async setup process based on provider
    if (vmProvider === 'aws') {
      // Type assertion to access AWS fields
      const awsState = setupState as SetupState & { 
        awsAccessKeyId?: string
        awsSecretAccessKey?: string
        awsRegion?: string
        awsInstanceType?: string 
      }
      runAWSSetupProcess(
        session.user.id,
        claudeApiKey,
        awsState.awsAccessKeyId!,
        awsState.awsSecretAccessKey!,
        awsState.awsRegion || 'us-east-1',
        vm?.awsInstanceType || awsState.awsInstanceType || 't3.micro',
        telegramBotToken,
        telegramUserId,
        vmId // Pass vmId
      ).catch(console.error)
    } else if (vmProvider === 'e2b') {
      // Type assertion to access E2B fields
      const e2bState = setupState as SetupState & { e2bApiKey?: string }
      runE2BSetupProcess(
        session.user.id,
        claudeApiKey,
        e2bState.e2bApiKey!,
        vm?.e2bTemplateId || 'base',
        vm?.e2bTimeout || 3600,
        telegramBotToken,
        telegramUserId,
        vmId // Pass vmId
      ).catch(console.error)
    } else {
      runSetupProcess(
        session.user.id,
        claudeApiKey,
        setupState.orgoApiKey!,
        vm?.orgoProjectName || setupState.orgoProjectName || 'claude-brain',
        telegramBotToken,
        telegramUserId,
        vmId // Pass vmId
      ).catch(console.error)
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Setup started',
      setupId: setupState.id,
      provider: vmProvider,
    })

  } catch (error) {
    console.error('Setup start error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start setup' },
      { status: 500 }
    )
  }
}

async function runSetupProcess(
  userId: string, 
  claudeApiKey: string, 
  orgoApiKey: string,
  projectName: string,
  telegramBotToken?: string,
  telegramUserId?: string,
  vmId?: string
) {
  const updateStatus = async (updates: Partial<{
    status: string
    vmCreated: boolean
    repoCreated: boolean
    repoCloned: boolean
    gitSyncConfigured: boolean
    clawdbotInstalled: boolean
    telegramConfigured: boolean
    gatewayStarted: boolean
    orgoProjectId: string
    orgoComputerId: string
    orgoComputerUrl: string
    vaultRepoName: string
    vaultRepoUrl: string
    vmStatus: string
    errorMessage: string
  }>) => {
    // Update SetupState
    await prisma.setupState.update({
      where: { userId },
      data: updates,
    })
    
    // Also update VM model if vmId is provided
    if (vmId) {
      const vmUpdates: Record<string, unknown> = {}
      if (updates.status !== undefined) vmUpdates.status = updates.status
      if (updates.vmCreated !== undefined) vmUpdates.vmCreated = updates.vmCreated
      if (updates.repoCloned !== undefined) vmUpdates.repoCloned = updates.repoCloned
      if (updates.gitSyncConfigured !== undefined) vmUpdates.gitSyncConfigured = updates.gitSyncConfigured
      if (updates.clawdbotInstalled !== undefined) vmUpdates.clawdbotInstalled = updates.clawdbotInstalled
      if (updates.gatewayStarted !== undefined) vmUpdates.gatewayStarted = updates.gatewayStarted
      if (updates.orgoProjectId !== undefined) vmUpdates.orgoProjectId = updates.orgoProjectId
      if (updates.orgoComputerId !== undefined) vmUpdates.orgoComputerId = updates.orgoComputerId
      if (updates.orgoComputerUrl !== undefined) vmUpdates.orgoComputerUrl = updates.orgoComputerUrl
      if (updates.errorMessage !== undefined) vmUpdates.errorMessage = updates.errorMessage
      
      if (Object.keys(vmUpdates).length > 0) {
        await prisma.vM.update({
          where: { id: vmId },
          data: vmUpdates,
        })
      }
    }
  }

  try {
    // Get setup state to check for existing vault
    const setupState = await prisma.setupState.findUnique({
      where: { userId },
    })

    // Get GitHub access token
    const account = await prisma.account.findFirst({
      where: { userId, provider: 'github' },
    })

    if (!account?.access_token) {
      throw new Error('GitHub account not connected')
    }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    const githubClient = new GitHubClient(account.access_token)
    const orgoClient = new OrgoClient(orgoApiKey)

    // 1. Create Orgo project and VM
    console.log(`Creating Orgo project and VM in project "${projectName}"...`)
    await updateStatus({ status: 'provisioning' })

    // First, find the project by name to get its ID, or create if it doesn't exist
    const projects = await orgoClient.listProjects()
    let project = projects.find(p => p.name === projectName)
    
    if (!project) {
      // Project doesn't exist - create it
      console.log(`Project "${projectName}" not found, creating...`)
      try {
        project = await orgoClient.createProject(projectName)
        console.log(`Created project "${projectName}" with ID: ${project.id}`)
      } catch (createErr: any) {
        // If project creation fails, it might be because the API doesn't support explicit creation
        // In that case, some APIs create projects implicitly - we'll try with an empty ID
        console.warn(`Could not create project explicitly: ${createErr.message}. Trying implicit creation...`)
        project = { id: '', name: projectName }
      }
    }
    
    await updateStatus({ orgoProjectId: project.id || '' })

    const computerName = generateComputerName()
    // Create computer using project ID (POST /computers with project_id in body)
    // If project.id is empty, we might need to create the project first via the computer creation
    // Retry logic for computer creation (may timeout but still succeed)
    let computer: any
    let retries = 3
    let lastError: Error | null = null
    
    while (retries > 0) {
      try {
        // If project ID is empty, try using project name instead (some APIs support this)
        const projectIdOrName = project.id || project.name
        computer = await orgoClient.createComputer(projectIdOrName, computerName, {
          os: 'linux',
          ram: 4,
          cpu: 2,
        })
        
        // If we didn't have a project ID, update it from the created computer's project info
        if (!project.id && computer.project_name) {
          // Try to get the updated project list to find the ID
          const updatedProjects = await orgoClient.listProjects()
          const createdProject = updatedProjects.find(p => p.name === computer.project_name || p.name === projectName)
          if (createdProject) {
            project = createdProject
            await updateStatus({ orgoProjectId: createdProject.id })
          }
        }
        
        break // Success, exit retry loop
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        console.log(`Computer creation attempt failed (${retries} retries left):`, lastError.message)
        
        // If it's a timeout, the computer might still be created - check if it exists
        if (lastError.message.includes('timed out') || lastError.message.includes('ETIMEDOUT')) {
          console.log('Timeout detected, checking if computer was created...')
          try {
            // Wait a bit and check if computer exists
            await new Promise(resolve => setTimeout(resolve, 5000))
            const computers = await orgoClient.listComputers(project.name || projectName)
            const existingComputer = computers.find(c => c.name === computerName)
            if (existingComputer) {
              console.log('Computer was created despite timeout!')
              computer = existingComputer
              break
            }
          } catch (checkError) {
            console.log('Could not verify computer creation:', checkError)
          }
        }
        
        retries--
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 3000)) // Wait before retry
        }
      }
    }
    
    if (!computer) {
      throw lastError || new Error('Failed to create computer after retries')
    }

    await updateStatus({
      orgoComputerId: computer.id,
      orgoComputerUrl: computer.url,
      vmStatus: 'creating',
    })

    // Wait a bit for VM to initialize before trying to configure it
    console.log('Waiting for VM to initialize...')
    await new Promise(resolve => setTimeout(resolve, 10000)) // Wait 10 seconds
    
    await updateStatus({ vmCreated: true, vmStatus: 'running' })

    // 2. Use existing GitHub vault repository or create new one
    const githubUser = await githubClient.getUser()
    let vaultRepoName: string | undefined
    let vaultRepoUrl: string | undefined
    let vaultSshUrl: string | undefined

    if (setupState?.vaultRepoName && setupState?.vaultRepoUrl) {
      // Use existing vault repository
      console.log(`Using existing vault repository: ${setupState.vaultRepoName}`)
      
      // Verify the repo still exists on GitHub
      const repoExists = await githubClient.repoExists(setupState.vaultRepoName)
      if (repoExists) {
        vaultRepoName = setupState.vaultRepoName
        vaultRepoUrl = setupState.vaultRepoUrl
        // Construct SSH URL: git@github.com:username/repo.git
        vaultSshUrl = `git@github.com:${githubUser.login}/${vaultRepoName}.git`
        
        await updateStatus({
          repoCreated: true,
          vaultRepoName,
          vaultRepoUrl,
        })
        // Skip 'creating_repo' status since repo already exists
      } else {
        console.warn(`Vault repo ${setupState.vaultRepoName} not found on GitHub, creating new one.`)
      }
    }

    // Create new vault repository if one doesn't exist
    if (!vaultRepoName) {
      console.log('Creating new vault repository...')
      // Only set status to 'creating_repo' when actually creating a new repo
      await updateStatus({ status: 'creating_repo' })
      
      const vaultRepo = await githubClient.createVaultRepo(`samantha-vault-${Date.now().toString(36)}`)
      vaultRepoName = vaultRepo.name
      vaultRepoUrl = vaultRepo.url
      vaultSshUrl = vaultRepo.sshUrl
      
      await updateStatus({
        repoCreated: true,
        vaultRepoName,
        vaultRepoUrl,
      })
    }

    // 3. Configure VM
    console.log('Configuring VM...')
    await updateStatus({ status: 'configuring_vm' })

    const vmSetup = new VMSetup(orgoClient, computer.id, (progress) => {
      console.log(`[VM Setup] ${progress.step}: ${progress.message}`)
    })

    // Install Python and essential tools (including openssh-client)
    console.log('Installing Python and essential tools...')
    const pythonSuccess = await vmSetup.installPython()
    if (!pythonSuccess) {
      throw new Error('Failed to install Python and essential tools on VM')
    }

    // Install Orgo and Anthropic Python SDKs for computer use
    console.log('Installing Orgo and Anthropic SDKs...')
    const sdkSuccess = await vmSetup.installOrgoPythonSDK()
    if (!sdkSuccess) {
      console.warn('SDK installation had issues, continuing...')
    }

    // Generate SSH key on VM (openssh-client should now be installed)
    console.log('Generating SSH key for GitHub access...')
    const { publicKey, success: sshKeySuccess } = await vmSetup.generateSSHKey()
    if (!sshKeySuccess || !publicKey) {
      throw new Error('Failed to generate SSH key on VM')
    }
    
    // Ensure vaultRepoName is defined
    if (!vaultRepoName) {
      throw new Error('Vault repository name is not set')
    }
    
    // Add deploy key to GitHub repo
    await githubClient.createDeployKey(vaultRepoName, publicKey)

    // Configure git and clone repo
    await vmSetup.configureGit(githubUser.login, githubUser.email || `${githubUser.login}@users.noreply.github.com`)
    
    if (!vaultSshUrl) {
      throw new Error('Failed to get vault SSH URL')
    }
    
    const cloneSuccess = await vmSetup.cloneVaultRepo(vaultSshUrl)
    if (!cloneSuccess) {
      throw new Error('Failed to clone vault repository to VM')
    }
    await updateStatus({ repoCloned: true })

    // Set up Git sync
    await vmSetup.setupGitSync()
    await updateStatus({ gitSyncConfigured: true })

    // Install Clawdbot (NVM + Node.js 22 + Clawdbot)
    console.log('Installing Clawdbot...')
    const clawdbotResult = await vmSetup.installClawdbot()
    if (!clawdbotResult.success) {
      throw new Error('Failed to install Clawdbot')
    }
    await updateStatus({ clawdbotInstalled: true })

    // Link vault to Clawdbot knowledge directory
    console.log('Linking vault to Clawdbot knowledge directory...')
    const linkSuccess = await vmSetup.linkVaultToKnowledge()
    if (!linkSuccess) {
      throw new Error('Failed to link vault to knowledge directory')
    }

    // Clone pending GitHub repositories if any
    await clonePendingGitHubRepositories(userId, orgoApiKey, computer.id, githubClient, setupState)

    // Configure Clawdbot with Telegram if token is provided (from UI or env)
    const finalTelegramToken = telegramBotToken || process.env.TELEGRAM_BOT_TOKEN
    const finalTelegramUserId = telegramUserId || process.env.TELEGRAM_USER_ID

    if (finalTelegramToken) {
      console.log('Configuring Clawdbot with Telegram...')
      const telegramSuccess = await vmSetup.setupClawdbotTelegram({
        claudeApiKey,
        telegramBotToken: finalTelegramToken,
        telegramUserId: finalTelegramUserId,
        clawdbotVersion: clawdbotResult.version,
        heartbeatIntervalMinutes: 30,
        userId,
        apiBaseUrl: process.env.NEXTAUTH_URL || 'http://localhost:3000',
      })
      await updateStatus({ telegramConfigured: telegramSuccess })

      if (telegramSuccess) {
        console.log('Starting Clawdbot gateway...')
        const gatewaySuccess = await vmSetup.startClawdbotGateway(claudeApiKey, finalTelegramToken)
        await updateStatus({ gatewayStarted: gatewaySuccess })
        
        if (!gatewaySuccess) {
          console.warn('⚠️  Gateway failed to start. Check /tmp/clawdbot.log on the VM for details.')
          // Don't fail the entire setup, but log the warning
        }
      }
    } else {
      // Just store Claude API key if no Telegram
      await vmSetup.storeClaudeKey(claudeApiKey)
    }

    // Setup complete!
    await updateStatus({ status: 'ready' })
    console.log('Setup complete!')

  } catch (error) {
    console.error('Setup process error:', error)
    await updateStatus({
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Unknown error occurred',
    })
  }
}

/**
 * Clone pending GitHub repositories after VM is ready
 */
async function clonePendingGitHubRepositories(
  userId: string,
  orgoApiKey: string,
  computerId: string,
  githubClient: GitHubClient,
  setupState: SetupState | null
) {
  try {
    // Check if there's a GitHub integration with pending repositories
    const githubIntegration = await prisma.integration.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: 'github',
        },
      },
    })

    if (!githubIntegration || githubIntegration.status !== 'pending') {
      return // No pending repositories
    }

    // Parse metadata to get repository details
    let repoDetails: Array<{ full_name: string; name: string; ssh_url: string; html_url: string; private: boolean }> = []
    try {
      const metadata = JSON.parse(githubIntegration.metadata || '{}')
      if (metadata.repoDetails && Array.isArray(metadata.repoDetails)) {
        repoDetails = metadata.repoDetails
      }
    } catch (e) {
      console.error('Failed to parse GitHub integration metadata:', e)
      return
    }

    if (repoDetails.length === 0) {
      return // No repositories to clone
    }

    console.log(`Cloning ${repoDetails.length} pending GitHub repositories...`)

    // Clone repositories on VM
    const orgoClient = new OrgoClient(orgoApiKey)
    const vmSetup = new VMSetup(orgoClient, computerId)

    const cloneResult = await vmSetup.cloneRepositories(
      repoDetails.map(repo => ({
        name: repo.name,
        sshUrl: repo.ssh_url,
      }))
    )

    // Update vault file with repository information
    if (setupState?.vaultRepoName) {
      const reposContent = `# GitHub Repositories Integration

*Last updated: ${new Date().toISOString()}*
*Total repositories: ${repoDetails.length}*

## Connected Repositories

${repoDetails.map((repo, index) => {
  const repoPath = `~/repositories/${repo.name}`
  return `### ${index + 1}. ${repo.name}

- **Full Name:** ${repo.full_name}
- **Private:** ${repo.private ? 'Yes' : 'No'}
- **Path on VM:** \`${repoPath}\`
- **GitHub URL:** [${repo.html_url}](${repo.html_url})
- **SSH URL:** \`${repo.ssh_url}\`
- **Added:** ${new Date().toISOString()}
`
}).join('\n')}

## Usage

These repositories are cloned in the \`~/repositories/\` directory on the VM and can be accessed by the AI agent as data sources.
`

      await githubClient.writeFileToVault(
        setupState.vaultRepoName,
        'integrations/github/repositories.md',
        reposContent,
        'Add GitHub repositories as data sources'
      )
    }

    // Update integration status from pending to connected
    await prisma.integration.update({
      where: { id: githubIntegration.id },
      data: {
        status: 'connected',
        lastSyncedAt: new Date(),
        metadata: JSON.stringify({
          repositories: repoDetails.map(r => r.full_name),
          paths: repoDetails.map(r => `~/repositories/${r.name}`),
          repoDetails,
          pending: false,
        }),
      },
    })

    if (cloneResult.errors && cloneResult.errors.length > 0) {
      console.warn('Some repositories failed to clone:', cloneResult.errors)
    } else {
      console.log(`Successfully cloned ${repoDetails.length} GitHub repositories`)
    }
  } catch (error) {
    console.error('Error cloning pending GitHub repositories:', error)
    // Don't throw - this shouldn't block setup completion
  }
}

/**
 * AWS EC2 Setup Process
 */
async function runAWSSetupProcess(
  userId: string,
  claudeApiKey: string,
  awsAccessKeyId: string,
  awsSecretAccessKey: string,
  awsRegion: string,
  awsInstanceType: string,
  telegramBotToken?: string,
  telegramUserId?: string,
  vmId?: string
) {
  const updateStatus = async (updates: Partial<{
    status: string
    vmCreated: boolean
    repoCreated: boolean
    repoCloned: boolean
    gitSyncConfigured: boolean
    clawdbotInstalled: boolean
    telegramConfigured: boolean
    gatewayStarted: boolean
    awsInstanceId: string
    awsInstanceName: string
    awsPublicIp: string
    awsPrivateKey: string
    vaultRepoName: string
    vaultRepoUrl: string
    vmStatus: string
    errorMessage: string
  }>) => {
    // Update SetupState
    await prisma.setupState.update({
      where: { userId },
      data: updates,
    })
    
    // Also update VM model if vmId is provided
    if (vmId) {
      const vmUpdates: Record<string, unknown> = {}
      if (updates.status !== undefined) vmUpdates.status = updates.status
      if (updates.vmCreated !== undefined) vmUpdates.vmCreated = updates.vmCreated
      if (updates.repoCloned !== undefined) vmUpdates.repoCloned = updates.repoCloned
      if (updates.gitSyncConfigured !== undefined) vmUpdates.gitSyncConfigured = updates.gitSyncConfigured
      if (updates.clawdbotInstalled !== undefined) vmUpdates.clawdbotInstalled = updates.clawdbotInstalled
      if (updates.gatewayStarted !== undefined) vmUpdates.gatewayStarted = updates.gatewayStarted
      if (updates.awsInstanceId !== undefined) vmUpdates.awsInstanceId = updates.awsInstanceId
      if (updates.awsInstanceName !== undefined) vmUpdates.awsInstanceName = updates.awsInstanceName
      if (updates.awsPublicIp !== undefined) vmUpdates.awsPublicIp = updates.awsPublicIp
      if (updates.awsPrivateKey !== undefined) vmUpdates.awsPrivateKey = updates.awsPrivateKey
      if (updates.errorMessage !== undefined) vmUpdates.errorMessage = updates.errorMessage
      
      if (Object.keys(vmUpdates).length > 0) {
        await prisma.vM.update({
          where: { id: vmId },
          data: vmUpdates,
        })
      }
    }
  }

  let awsVMSetup: AWSVMSetup | null = null

  try {
    // Get setup state
    const setupState = await prisma.setupState.findUnique({
      where: { userId },
    })

    // Get GitHub access token
    const account = await prisma.account.findFirst({
      where: { userId, provider: 'github' },
    })

    if (!account?.access_token) {
      throw new Error('GitHub account not connected')
    }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    const githubClient = new GitHubClient(account.access_token)
    const awsClient = new AWSClient({
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
      region: awsRegion,
    })

    // 1. Create AWS EC2 Instance
    console.log(`Creating AWS EC2 instance in region ${awsRegion}...`)
    await updateStatus({ status: 'provisioning', vmStatus: 'creating' })

    const instanceName = generateInstanceName()
    const { instance, privateKey } = await awsClient.createInstance({
      name: instanceName,
      instanceType: awsInstanceType,
      region: awsRegion,
    })

    await updateStatus({
      awsInstanceId: instance.id,
      awsInstanceName: instance.name,
      awsPublicIp: instance.publicIp,
      awsPrivateKey: privateKey,
      vmStatus: 'starting',
    })

    // Wait for instance to be running
    console.log('Waiting for EC2 instance to be running...')
    await new Promise(resolve => setTimeout(resolve, 30000)) // Wait 30 seconds for instance to fully boot

    // Get updated instance info with public IP
    const updatedInstance = await awsClient.getInstance(instance.id)
    await updateStatus({
      awsPublicIp: updatedInstance.publicIp,
      vmCreated: true,
      vmStatus: 'running',
    })

    console.log(`EC2 instance ${instance.id} is running at ${updatedInstance.publicIp}`)

    // 2. Use existing GitHub vault repository or create new one
    const githubUser = await githubClient.getUser()
    let vaultRepoName: string | undefined
    let vaultRepoUrl: string | undefined
    let vaultSshUrl: string | undefined

    if (setupState?.vaultRepoName && setupState?.vaultRepoUrl) {
      console.log(`Using existing vault repository: ${setupState.vaultRepoName}`)
      
      const repoExists = await githubClient.repoExists(setupState.vaultRepoName)
      if (repoExists) {
        vaultRepoName = setupState.vaultRepoName
        vaultRepoUrl = setupState.vaultRepoUrl
        vaultSshUrl = `git@github.com:${githubUser.login}/${vaultRepoName}.git`
        
        await updateStatus({
          repoCreated: true,
          vaultRepoName,
          vaultRepoUrl,
        })
      }
    }

    if (!vaultRepoName) {
      console.log('Creating new vault repository...')
      await updateStatus({ status: 'creating_repo' })
      
      const vaultRepo = await githubClient.createVaultRepo(`samantha-vault-${Date.now().toString(36)}`)
      vaultRepoName = vaultRepo.name
      vaultRepoUrl = vaultRepo.url
      vaultSshUrl = vaultRepo.sshUrl
      
      await updateStatus({
        repoCreated: true,
        vaultRepoName,
        vaultRepoUrl,
      })
    }

    // 3. Configure VM
    console.log('Configuring EC2 instance...')
    await updateStatus({ status: 'configuring_vm' })

    awsVMSetup = new AWSVMSetup(
      awsClient,
      instance.id,
      privateKey,
      updatedInstance.publicIp,
      (progress) => {
        console.log(`[AWS VM Setup] ${progress.step}: ${progress.message}`)
      }
    )

    // Install Python and essential tools
    console.log('Installing Python and essential tools...')
    const pythonSuccess = await awsVMSetup.installPython()
    if (!pythonSuccess) {
      throw new Error('Failed to install Python and essential tools on VM')
    }

    // Install Anthropic SDKs
    console.log('Installing Anthropic SDKs...')
    await awsVMSetup.installAnthropicSDK()

    // Generate SSH key on VM
    console.log('Generating SSH key for GitHub access...')
    const { publicKey, success: sshKeySuccess } = await awsVMSetup.generateSSHKey()
    if (!sshKeySuccess || !publicKey) {
      throw new Error('Failed to generate SSH key on VM')
    }

    if (!vaultRepoName) {
      throw new Error('Vault repository name is not set')
    }

    // Add deploy key to GitHub repo
    await githubClient.createDeployKey(vaultRepoName, publicKey)

    // Configure git and clone repo
    await awsVMSetup.configureGit(githubUser.login, githubUser.email || `${githubUser.login}@users.noreply.github.com`)

    if (!vaultSshUrl) {
      throw new Error('Failed to get vault SSH URL')
    }

    const cloneSuccess = await awsVMSetup.cloneVaultRepo(vaultSshUrl)
    if (!cloneSuccess) {
      throw new Error('Failed to clone vault repository to VM')
    }
    await updateStatus({ repoCloned: true })

    // Set up Git sync
    await awsVMSetup.setupGitSync()
    await updateStatus({ gitSyncConfigured: true })

    // Install Clawdbot
    console.log('Installing Clawdbot...')
    const clawdbotResult = await awsVMSetup.installClawdbot()
    if (!clawdbotResult.success) {
      throw new Error('Failed to install Clawdbot')
    }
    await updateStatus({ clawdbotInstalled: true })

    // Link vault to Clawdbot knowledge directory
    console.log('Linking vault to Clawdbot knowledge directory...')
    await awsVMSetup.linkVaultToKnowledge()

    // Configure Clawdbot with Telegram if token is provided
    const finalTelegramToken = telegramBotToken || process.env.TELEGRAM_BOT_TOKEN
    const finalTelegramUserId = telegramUserId || process.env.TELEGRAM_USER_ID

    if (finalTelegramToken) {
      console.log('Configuring Clawdbot with Telegram...')
      const telegramSuccess = await awsVMSetup.setupClawdbotTelegram({
        claudeApiKey,
        telegramBotToken: finalTelegramToken,
        telegramUserId: finalTelegramUserId,
        clawdbotVersion: clawdbotResult.version,
        heartbeatIntervalMinutes: 30,
        userId,
        apiBaseUrl: process.env.NEXTAUTH_URL || 'http://localhost:3000',
      })
      await updateStatus({ telegramConfigured: telegramSuccess })

      if (telegramSuccess) {
        console.log('Starting Clawdbot gateway...')
        const gatewaySuccess = await awsVMSetup.startClawdbotGateway(claudeApiKey, finalTelegramToken)
        await updateStatus({ gatewayStarted: gatewaySuccess })
      }
    } else {
      await awsVMSetup.storeClaudeKey(claudeApiKey)
    }

    // Setup complete!
    await updateStatus({ status: 'ready' })
    console.log('AWS EC2 setup complete!')

  } catch (error: any) {
    console.error('AWS setup process error:', error)
    
    // Check for Free Tier restriction error
    const errorMessage = error?.message || error?.Error?.Message || String(error)
    const isFreeTierError = errorMessage.includes('not eligible for Free Tier') || 
                           errorMessage.includes('Free Tier') ||
                           (error?.Code === 'InvalidParameterCombination' && errorMessage.includes('Free Tier'))
    
    if (isFreeTierError) {
      // This is a billing/payment issue, not a technical error
      await updateStatus({
        status: 'requires_payment',
        errorMessage: `BILLING_REQUIRED:${awsInstanceType}`, // Pass the instance type for the UI
      })
    } else {
      await updateStatus({
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error occurred',
      })
    }
  } finally {
    // Cleanup SSH connection
    if (awsVMSetup) {
      awsVMSetup.cleanup()
    }
  }
}

/**
 * E2B Sandbox Setup Process
 */
async function runE2BSetupProcess(
  userId: string,
  claudeApiKey: string,
  e2bApiKey: string,
  templateId: string,
  timeout: number,
  telegramBotToken?: string,
  telegramUserId?: string,
  vmId?: string
) {
  const updateStatus = async (updates: Partial<{
    status: string
    vmCreated: boolean
    repoCreated: boolean
    repoCloned: boolean
    gitSyncConfigured: boolean
    clawdbotInstalled: boolean
    telegramConfigured: boolean
    gatewayStarted: boolean
    vaultRepoName: string
    vaultRepoUrl: string
    vmStatus: string
    errorMessage: string
  }>) => {
    // Update SetupState
    await prisma.setupState.update({
      where: { userId },
      data: updates,
    })
    
    // Also update VM model if vmId is provided
    if (vmId) {
      const vmUpdates: Record<string, unknown> = {}
      if (updates.status !== undefined) vmUpdates.status = updates.status
      if (updates.vmCreated !== undefined) vmUpdates.vmCreated = updates.vmCreated
      if (updates.repoCloned !== undefined) vmUpdates.repoCloned = updates.repoCloned
      if (updates.gitSyncConfigured !== undefined) vmUpdates.gitSyncConfigured = updates.gitSyncConfigured
      if (updates.clawdbotInstalled !== undefined) vmUpdates.clawdbotInstalled = updates.clawdbotInstalled
      if (updates.gatewayStarted !== undefined) vmUpdates.gatewayStarted = updates.gatewayStarted
      if (updates.errorMessage !== undefined) vmUpdates.errorMessage = updates.errorMessage
      
      if (Object.keys(vmUpdates).length > 0) {
        await prisma.vM.update({
          where: { id: vmId },
          data: vmUpdates,
        })
      }
    }
  }

  let sandbox: any = null

  try {
    // Get setup state
    const setupState = await prisma.setupState.findUnique({
      where: { userId },
    })

    // Get GitHub access token
    const account = await prisma.account.findFirst({
      where: { userId, provider: 'github' },
    })

    if (!account?.access_token) {
      throw new Error('GitHub account not connected')
    }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    const githubClient = new GitHubClient(account.access_token)
    const e2bClient = new E2BClient(e2bApiKey)

    // 1. Create E2B Sandbox
    console.log(`Creating E2B sandbox with template: ${templateId}...`)
    await updateStatus({ status: 'provisioning', vmStatus: 'creating' })

    const sandboxName = generateSandboxName()
    const { sandbox: createdSandbox, sandboxId } = await e2bClient.createSandbox({
      templateId,
      timeout,
      metadata: { name: sandboxName, userId },
    })
    sandbox = createdSandbox

    // Update VM with sandbox ID
    if (vmId) {
      await prisma.vM.update({
        where: { id: vmId },
        data: { e2bSandboxId: sandboxId },
      })
    }

    await updateStatus({
      vmCreated: true,
      vmStatus: 'running',
    })

    console.log(`E2B sandbox ${sandboxId} is running`)

    // 2. Use existing GitHub vault repository or create new one
    const githubUser = await githubClient.getUser()
    let vaultRepoName: string | undefined
    let vaultRepoUrl: string | undefined
    let vaultSshUrl: string | undefined

    if (setupState?.vaultRepoName && setupState?.vaultRepoUrl) {
      console.log(`Using existing vault repository: ${setupState.vaultRepoName}`)
      
      const repoExists = await githubClient.repoExists(setupState.vaultRepoName)
      if (repoExists) {
        vaultRepoName = setupState.vaultRepoName
        vaultRepoUrl = setupState.vaultRepoUrl
        vaultSshUrl = `git@github.com:${githubUser.login}/${vaultRepoName}.git`
        
        await updateStatus({
          repoCreated: true,
          vaultRepoName,
          vaultRepoUrl,
        })
      }
    }

    if (!vaultRepoName) {
      console.log('Creating new vault repository...')
      await updateStatus({ status: 'creating_repo' })
      
      const vaultRepo = await githubClient.createVaultRepo(`samantha-vault-${Date.now().toString(36)}`)
      vaultRepoName = vaultRepo.name
      vaultRepoUrl = vaultRepo.url
      vaultSshUrl = vaultRepo.sshUrl
      
      await updateStatus({
        repoCreated: true,
        vaultRepoName,
        vaultRepoUrl,
      })
    }

    // 3. Configure sandbox
    console.log('Configuring E2B sandbox...')
    await updateStatus({ status: 'configuring_vm' })

    const e2bVMSetup = new E2BVMSetup(
      e2bClient,
      sandbox,
      sandboxId,
      (progress) => {
        console.log(`[E2B Setup] ${progress.step}: ${progress.message}`)
      }
    )

    // Install essentials (E2B comes with Python pre-installed)
    console.log('Installing essential tools...')
    await e2bVMSetup.installEssentials()

    // Generate SSH key on sandbox
    console.log('Generating SSH key for GitHub access...')
    const { publicKey, success: sshKeySuccess } = await e2bVMSetup.generateSSHKey()
    if (!sshKeySuccess || !publicKey) {
      throw new Error('Failed to generate SSH key on sandbox')
    }

    if (!vaultRepoName) {
      throw new Error('Vault repository name is not set')
    }

    // Add deploy key to GitHub repo
    await githubClient.createDeployKey(vaultRepoName, publicKey)

    // Configure git and clone repo
    await e2bVMSetup.configureGit(githubUser.login, githubUser.email || `${githubUser.login}@users.noreply.github.com`)

    if (!vaultSshUrl) {
      throw new Error('Failed to get vault SSH URL')
    }

    const cloneSuccess = await e2bVMSetup.cloneVaultRepo(vaultSshUrl)
    if (!cloneSuccess) {
      throw new Error('Failed to clone vault repository to sandbox')
    }
    await updateStatus({ repoCloned: true })

    // Set up Git sync
    await e2bVMSetup.setupGitSync()
    await updateStatus({ gitSyncConfigured: true })

    // Install Clawdbot
    console.log('Installing Clawdbot...')
    const clawdbotResult = await e2bVMSetup.installClawdbot()
    if (!clawdbotResult.success) {
      throw new Error('Failed to install Clawdbot')
    }
    await updateStatus({ clawdbotInstalled: true })

    // Link vault to Clawdbot knowledge directory
    console.log('Linking vault to Clawdbot knowledge directory...')
    await e2bVMSetup.linkVaultToKnowledge()

    // Configure Clawdbot with Telegram if token is provided
    const finalTelegramToken = telegramBotToken || process.env.TELEGRAM_BOT_TOKEN
    const finalTelegramUserId = telegramUserId || process.env.TELEGRAM_USER_ID

    if (finalTelegramToken) {
      console.log('Configuring Clawdbot with Telegram...')
      const telegramSuccess = await e2bVMSetup.setupClawdbotTelegram({
        claudeApiKey,
        telegramBotToken: finalTelegramToken,
        telegramUserId: finalTelegramUserId,
        clawdbotVersion: clawdbotResult.version,
        heartbeatIntervalMinutes: 30,
        userId,
        apiBaseUrl: process.env.NEXTAUTH_URL || 'http://localhost:3000',
      })
      await updateStatus({ telegramConfigured: telegramSuccess })

      if (telegramSuccess) {
        console.log('Starting Clawdbot gateway...')
        const gatewaySuccess = await e2bVMSetup.startClawdbotGateway(claudeApiKey, finalTelegramToken)
        await updateStatus({ gatewayStarted: gatewaySuccess })
      }
    } else {
      await e2bVMSetup.storeClaudeKey(claudeApiKey)
    }

    // Setup complete!
    await updateStatus({ status: 'ready' })
    console.log('E2B sandbox setup complete!')

  } catch (error) {
    console.error('E2B setup process error:', error)
    await updateStatus({
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Unknown error occurred',
    })

    // Try to clean up sandbox on failure
    if (sandbox) {
      try {
        const e2bClient = new E2BClient(e2bApiKey)
        await e2bClient.killSandbox(sandbox)
      } catch (cleanupError) {
        console.error('Failed to clean up sandbox:', cleanupError)
      }
    }
  }
}