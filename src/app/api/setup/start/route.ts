import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { OrgoClient, generateComputerName } from '@/lib/orgo'
import { GitHubClient } from '@/lib/github'
import { VMSetup } from '@/lib/vm-setup'
import type { SetupState } from '@prisma/client'

const PROJECT_NAME = 'claude-code'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { claudeApiKey, telegramBotToken, telegramUserId } = await request.json()

    if (!claudeApiKey) {
      return NextResponse.json({ error: 'Claude API key is required' }, { status: 400 })
    }

    // Use Orgo API key from environment variable
    const orgoApiKey = process.env.ORGO_API_KEY
    if (!orgoApiKey) {
      return NextResponse.json({ error: 'Orgo API key not configured on server' }, { status: 500 })
    }

    // Get or create setup state
    let setupState = await prisma.setupState.findUnique({
      where: { userId: session.user.id },
    })

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
        },
      })
    }

    // Start async setup process
    runSetupProcess(session.user.id, claudeApiKey, orgoApiKey, telegramBotToken, telegramUserId).catch(console.error)

    return NextResponse.json({ 
      success: true, 
      message: 'Setup started',
      setupId: setupState.id 
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
  telegramBotToken?: string,
  telegramUserId?: string
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
    await prisma.setupState.update({
      where: { userId },
      data: updates,
    })
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
    console.log('Creating Orgo project and VM...')
    await updateStatus({ status: 'provisioning' })

    // First, find the project by name to get its ID
    const projects = await orgoClient.listProjects()
    const project = projects.find(p => p.name === PROJECT_NAME)
    if (!project) {
      throw new Error(`Project "${PROJECT_NAME}" not found. Please create it in the Orgo dashboard first.`)
    }
    
    await updateStatus({ orgoProjectId: project.id })

    const computerName = generateComputerName()
    // Create computer using project ID (POST /computers with project_id in body)
    // Retry logic for computer creation (may timeout but still succeed)
    let computer: any
    let retries = 3
    let lastError: Error | null = null
    
    while (retries > 0) {
      try {
        computer = await orgoClient.createComputer(project.id, computerName, {
          os: 'linux',
          ram: 8,
          cpu: 2,
        })
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
            const computers = await orgoClient.listComputers(project.name)
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


