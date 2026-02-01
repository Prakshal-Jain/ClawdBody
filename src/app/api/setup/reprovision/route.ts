import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { OrgoClient, sanitizeName } from '@/lib/orgo'
import { VMSetup } from '@/lib/vm-setup'
import { decrypt } from '@/lib/encryption'
import { AIProvider, getAIProvider } from '@/lib/ai-providers'

/**
 * Reprovision a failed Orgo VM
 * This endpoint:
 * 1. Deletes the old broken computer
 * 2. Creates a new computer
 * 3. Runs the full setup process
 * All using stored credentials (no user input needed)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get optional vmId from request body
    const body = await request.json().catch(() => ({}))
    const vmId = body.vmId

    // Get setup state with stored credentials
    const setupState = await prisma.setupState.findUnique({
      where: { userId: session.user.id },
    })

    if (!setupState) {
      return NextResponse.json({ error: 'No setup state found' }, { status: 404 })
    }

    // Get VM record if vmId provided
    let vm = null
    if (vmId) {
      vm = await prisma.vM.findFirst({
        where: { id: vmId, userId: session.user.id },
      })
    }

    // Verify this is an Orgo VM
    const vmProvider = vm?.provider || setupState.vmProvider
    if (vmProvider !== 'orgo') {
      return NextResponse.json({ 
        error: 'Reprovision is only supported for Orgo VMs' 
      }, { status: 400 })
    }

    // Check we have required credentials
    if (!setupState.orgoApiKey) {
      return NextResponse.json({ 
        error: 'Orgo API key not found. Please set up your VM again.' 
      }, { status: 400 })
    }

    // Get the AI API key based on provider
    const aiProvider = (setupState.aiProvider || 'anthropic') as AIProvider
    let aiApiKey: string | null = null
    
    switch (aiProvider) {
      case 'openai':
        aiApiKey = setupState.openaiApiKey ? decrypt(setupState.openaiApiKey) : null
        break
      case 'kimi':
        aiApiKey = setupState.kimiApiKey ? decrypt(setupState.kimiApiKey) : null
        break
      case 'anthropic':
      default:
        aiApiKey = setupState.claudeApiKey ? decrypt(setupState.claudeApiKey) : null
        break
    }

    if (!aiApiKey) {
      return NextResponse.json({ 
        error: `${getAIProvider(aiProvider).displayName} API key not found. Please set up your VM again.` 
      }, { status: 400 })
    }

    // Update status to show reprovisioning
    await prisma.setupState.update({
      where: { userId: session.user.id },
      data: {
        status: 'provisioning',
        errorMessage: null,
        vmCreated: false,
        clawdbotInstalled: false,
        telegramConfigured: false,
        gatewayStarted: false,
      },
    })

    if (vmId) {
      await prisma.vM.update({
        where: { id: vmId },
        data: {
          status: 'provisioning',
          errorMessage: null,
          vmCreated: false,
          clawdbotInstalled: false,
          telegramConfigured: false,
          gatewayStarted: false,
        },
      })
    }

    // Start the reprovision process in the background
    runReprovisionProcess(
      session.user.id,
      aiApiKey,
      decrypt(setupState.orgoApiKey),
      vm?.orgoProjectName || setupState.orgoProjectName || 'claude-brain',
      vm?.orgoComputerId || setupState.orgoComputerId || null,
      vmId || null,
      (vm as any)?.orgoRam || 4,
      (vm as any)?.orgoCpu || 2,
      aiProvider
    ).catch(err => {
      console.error('[Reprovision] Background process error:', err)
    })

    return NextResponse.json({
      success: true,
      message: 'Reprovisioning started',
    })

  } catch (error) {
    console.error('[Reprovision] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start reprovision' },
      { status: 500 }
    )
  }
}

async function runReprovisionProcess(
  userId: string,
  aiApiKey: string,
  orgoApiKey: string,
  projectName: string,
  oldComputerId: string | null,
  vmId: string | null,
  orgoRam: number,
  orgoCpu: number,
  aiProvider: AIProvider
) {
  const updateStatus = async (updates: Partial<{
    status: string
    vmCreated: boolean
    clawdbotInstalled: boolean
    telegramConfigured: boolean
    gatewayStarted: boolean
    orgoProjectId: string
    orgoComputerId: string
    orgoComputerUrl: string
    vmStatus: string
    errorMessage: string
  }>) => {
    await prisma.setupState.update({
      where: { userId },
      data: updates,
    })

    if (vmId) {
      const vmUpdates: Record<string, unknown> = {}
      if (updates.status !== undefined) vmUpdates.status = updates.status
      if (updates.vmCreated !== undefined) vmUpdates.vmCreated = updates.vmCreated
      if (updates.clawdbotInstalled !== undefined) vmUpdates.clawdbotInstalled = updates.clawdbotInstalled
      if (updates.telegramConfigured !== undefined) vmUpdates.telegramConfigured = updates.telegramConfigured
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
    const orgoClient = new OrgoClient(orgoApiKey)

    // Step 1: Delete the old broken computer (if it exists)
    if (oldComputerId) {
      console.log(`[Reprovision ${userId}] Deleting old computer: ${oldComputerId}`)
      try {
        await orgoClient.deleteComputer(oldComputerId)
        console.log(`[Reprovision ${userId}] Old computer deleted`)
      } catch (deleteErr) {
        // Continue even if delete fails - the computer might already be gone
        console.warn(`[Reprovision ${userId}] Could not delete old computer:`, deleteErr)
      }
    }

    // Clear old computer info
    await updateStatus({
      orgoComputerId: '',
      orgoComputerUrl: '',
      vmStatus: 'creating',
    })

    // Step 2: Create new computer
    console.log(`[Reprovision ${userId}] Creating new computer in project: ${projectName}`)

    // Get or create project
    const projects = await orgoClient.listProjects()
    let project = projects.find(p => p.name === projectName) || { id: '', name: projectName }

    if (!project.id) {
      try {
        project = await orgoClient.createProject(projectName)
      } catch (createErr) {
        project = { id: '', name: projectName }
      }
    }

    await updateStatus({ orgoProjectId: project.id || '' })

    // Get VM name from database
    let computerName = sanitizeName(projectName)
    if (vmId) {
      const existingVM = await prisma.vM.findUnique({ where: { id: vmId } })
      if (existingVM?.name) {
        computerName = sanitizeName(existingVM.name)
      }
    }

    // Create new computer
    let computer: any
    let retries = 3
    let lastError: Error | null = null

    while (retries > 0) {
      try {
        const projectIdOrName = project.id || project.name
        computer = await orgoClient.createComputer(projectIdOrName, computerName, {
          os: 'linux',
          ram: orgoRam as 1 | 2 | 4 | 8 | 16 | 32 | 64,
          cpu: orgoCpu as 1 | 2 | 4 | 8 | 16,
        })
        console.log(`[Reprovision ${userId}] New computer created: ${computer.id}`)
        break
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        if (lastError.message.includes('timed out') || lastError.message.includes('ETIMEDOUT')) {
          try {
            await new Promise(resolve => setTimeout(resolve, 5000))
            const computers = await orgoClient.listComputers(project.name || projectName)
            const existingComputer = computers.find(c => c.name === computerName)
            if (existingComputer) {
              computer = existingComputer
              break
            }
          } catch (checkError) {
            // Could not verify
          }
        }

        retries--
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 3000))
        }
      }
    }

    if (!computer) {
      throw lastError || new Error('Failed to create new computer after retries')
    }

    await updateStatus({
      orgoComputerId: computer.id,
      orgoComputerUrl: computer.url,
      vmStatus: 'starting',
    })

    // Step 3: Wait for VM to be ready
    console.log(`[Reprovision ${userId}] Waiting for VM to be ready...`)
    try {
      await orgoClient.waitForReady(computer.id, 30, 5000)
    } catch (waitError) {
      console.warn(`[Reprovision ${userId}] VM waitForReady timed out, continuing anyway:`, waitError)
    }

    await new Promise(resolve => setTimeout(resolve, 15000))

    await updateStatus({ vmCreated: true, vmStatus: 'running' })

    // Step 4: Configure VM
    console.log(`[Reprovision ${userId}] Starting VM configuration...`)
    await updateStatus({ status: 'configuring_vm' })

    const vmSetup = new VMSetup(orgoClient, computer.id, () => {})

    // Install Python and essential tools
    console.log(`[Reprovision ${userId}] Installing Python...`)
    const pythonSuccess = await vmSetup.installPython()
    if (!pythonSuccess) {
      let diagnosticInfo = ''
      try {
        const osResult = await orgoClient.bash(computer.id, 'cat /etc/os-release 2>/dev/null | head -3 || echo "Unknown OS"')
        const aptResult = await orgoClient.bash(computer.id, 'apt-get --version 2>&1 | head -1 || echo "apt not found"')
        const pythonResult = await orgoClient.bash(computer.id, 'python3 --version 2>&1 || echo "python3 not found"')
        diagnosticInfo = `OS: ${osResult.output?.trim() || 'unknown'}, apt: ${aptResult.output?.trim() || 'unknown'}, python: ${pythonResult.output?.trim() || 'unknown'}`
      } catch (diagErr) {
        // Ignore diagnostic errors
      }
      throw new Error(`Failed to install Python and essential tools on VM. Diagnostics: ${diagnosticInfo}`)
    }

    // Install SDKs
    console.log(`[Reprovision ${userId}] Installing SDKs...`)
    await vmSetup.installOrgoPythonSDK()

    // Install Clawdbot
    console.log(`[Reprovision ${userId}] Installing Clawdbot...`)
    const clawdbotResult = await vmSetup.installClawdbot()
    if (!clawdbotResult.success) {
      throw new Error('Failed to install Clawdbot')
    }
    await updateStatus({ clawdbotInstalled: true })

    // Configure Telegram if available (from environment)
    const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN
    const telegramUserId = process.env.TELEGRAM_USER_ID

    if (telegramBotToken) {
      console.log(`[Reprovision ${userId}] Configuring Telegram...`)
      const telegramSuccess = await vmSetup.setupClawdbotTelegram({
        aiApiKey,
        aiProvider,
        telegramBotToken,
        telegramUserId,
        clawdbotVersion: clawdbotResult.version,
        heartbeatIntervalMinutes: 30,
        userId,
        apiBaseUrl: process.env.NEXTAUTH_URL || 'http://localhost:3000',
      })
      await updateStatus({ telegramConfigured: telegramSuccess })

      if (telegramSuccess) {
        console.log(`[Reprovision ${userId}] Starting gateway...`)
        const gatewaySuccess = await vmSetup.startClawdbotGateway(aiApiKey, telegramBotToken, aiProvider)
        await updateStatus({ gatewayStarted: gatewaySuccess })
      }
    } else {
      await vmSetup.storeAIApiKey(aiApiKey, aiProvider)
    }

    // Done!
    console.log(`[Reprovision ${userId}] Setup complete!`)
    await updateStatus({ status: 'ready' })

  } catch (error) {
    console.error(`[Reprovision ${userId}] Failed:`, error)
    await updateStatus({
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Unknown error occurred',
    })
  }
}
