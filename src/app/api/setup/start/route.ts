import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { OrgoClient, sanitizeName } from '@/lib/orgo'
import { AWSClient } from '@/lib/aws'
import { E2BClient } from '@/lib/e2b'
import { VMSetup } from '@/lib/vm-setup'
import { AWSVMSetup } from '@/lib/aws-vm-setup'
import { E2BVMSetup } from '@/lib/e2b-vm-setup'
import { encrypt, decrypt } from '@/lib/encryption'
// Import type from Prisma client for type checking
import type { SetupState } from '@prisma/client'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { claudeApiKey, useStoredApiKey, telegramBotToken, telegramUserId, vmId } = await request.json() as {
      claudeApiKey?: string
      useStoredApiKey?: boolean
      telegramBotToken?: string
      telegramUserId?: string
      vmId?: string
    }

    // Get existing setup state to retrieve user's provider config
    let setupState = await prisma.setupState.findUnique({
      where: { userId: session.user.id },
    })

    // Determine the API key to use
    let finalClaudeApiKey: string | null = claudeApiKey || null

    if (!claudeApiKey && useStoredApiKey) {
      // User wants to use the stored API key
      if (!setupState?.claudeApiKey) {
        return NextResponse.json({ error: 'No stored API key found. Please provide a Claude API key.' }, { status: 400 })
      }
      // Decrypt the stored key for use
      finalClaudeApiKey = decrypt(setupState.claudeApiKey)
    }

    if (!finalClaudeApiKey) {
      return NextResponse.json({ error: 'Claude API key is required' }, { status: 400 })
    }

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

    // Check if VM is already provisioned (has a cloud resource)
    const isVMAlreadyProvisioned = vm && vm.vmCreated && (vm.orgoComputerId || vm.awsInstanceId || vm.e2bSandboxId)

    // Only encrypt and store a new key if provided (not using stored key)
    const encryptedClaudeApiKey = claudeApiKey ? encrypt(claudeApiKey) : undefined

    if (!setupState) {
      setupState = await prisma.setupState.create({
        data: {
          userId: session.user.id,
          // Only update the key if a new one was provided
          ...(encryptedClaudeApiKey ? { claudeApiKey: encryptedClaudeApiKey } : {}),
          status: isVMAlreadyProvisioned ? 'configuring_vm' : 'provisioning',
          // Sync vmCreated from the VM if it's already provisioned
          vmCreated: isVMAlreadyProvisioned ? true : false,
          orgoComputerId: vm?.orgoComputerId || undefined,
          orgoComputerUrl: vm?.orgoComputerUrl || undefined,
        },
      })
    } else {
      // Update existing state and reset progress flags
      // IMPORTANT: Don't reset vmCreated if the VM is already provisioned
      setupState = await prisma.setupState.update({
        where: { id: setupState.id },
        data: {
          // Only update the key if a new one was provided
          ...(encryptedClaudeApiKey ? { claudeApiKey: encryptedClaudeApiKey } : {}),
          status: isVMAlreadyProvisioned ? 'configuring_vm' : 'provisioning',
          errorMessage: null,
          // Only reset vmCreated if the VM hasn't been provisioned yet
          ...(isVMAlreadyProvisioned ? { vmCreated: true } : { vmCreated: false }),
          // Sync Orgo computer info if available
          ...(vm?.orgoComputerId ? { orgoComputerId: vm.orgoComputerId, orgoComputerUrl: vm.orgoComputerUrl } : {}),
          clawdbotInstalled: false,
          telegramConfigured: false,
          gatewayStarted: false,
        },
      })
    }

    // If vmId is provided, also update the VM model status
    // IMPORTANT: Don't reset vmCreated if the VM already has a provisioned computer
    // This prevents double-provisioning when the user clicks "Begin Setup" after adding a VM
    if (vmId && vm) {
      const isAlreadyProvisioned = vm.vmCreated && (vm.orgoComputerId || vm.awsInstanceId || vm.e2bSandboxId)
      await prisma.vM.update({
        where: { id: vmId },
        data: {
          status: isAlreadyProvisioned ? 'configuring_vm' : 'provisioning',
          errorMessage: null,
          // Only reset vmCreated if the VM hasn't been provisioned yet
          ...(isAlreadyProvisioned ? {} : { vmCreated: false }),
          clawdbotInstalled: false,
          gatewayStarted: false,
        },
      })
    }

    // Start async setup process based on provider
    // Note: finalClaudeApiKey is either plaintext from request or decrypted from stored key
    if (vmProvider === 'aws') {
      // Type assertion to access AWS fields
      const awsState = setupState as SetupState & {
        awsAccessKeyId?: string
        awsSecretAccessKey?: string
        awsRegion?: string
        awsInstanceType?: string
      }
      // Decrypt stored AWS credentials
      const decryptedAccessKeyId = decrypt(awsState.awsAccessKeyId!)
      const decryptedSecretAccessKey = decrypt(awsState.awsSecretAccessKey!)
      runAWSSetupProcess(
        session.user.id,
        finalClaudeApiKey,
        decryptedAccessKeyId,
        decryptedSecretAccessKey,
        awsState.awsRegion || 'us-east-1',
        vm?.awsInstanceType || awsState.awsInstanceType || 't3.micro',
        telegramBotToken,
        telegramUserId,
        vmId // Pass vmId
      ).catch(() => { })
    } else if (vmProvider === 'e2b') {
      // Type assertion to access E2B fields
      const e2bState = setupState as SetupState & { e2bApiKey?: string }
      // Decrypt stored E2B API key
      const decryptedE2bApiKey = decrypt(e2bState.e2bApiKey!)
      runE2BSetupProcess(
        session.user.id,
        finalClaudeApiKey,
        decryptedE2bApiKey,
        vm?.e2bTemplateId || 'base',
        vm?.e2bTimeout || 3600,
        telegramBotToken,
        telegramUserId,
        vmId // Pass vmId
      ).catch(() => { })
    } else {
      // Type assertion to access Orgo-specific fields (TypeScript may have stale types cached)
      const orgoVM = vm as (typeof vm & { orgoRam?: number; orgoCpu?: number }) | null
      // Decrypt stored Orgo API key
      const decryptedOrgoApiKey = decrypt(setupState.orgoApiKey!)
      runSetupProcess(
        session.user.id,
        finalClaudeApiKey,
        decryptedOrgoApiKey,
        vm?.orgoProjectName || setupState.orgoProjectName || 'claude-brain',
        telegramBotToken,
        telegramUserId,
        vmId, // Pass vmId
        orgoVM?.orgoRam || 4, // Pass RAM (default 4 GB)
        orgoVM?.orgoCpu || 2  // Pass CPU (default 2 cores)
      ).catch(() => { })
    }

    return NextResponse.json({
      success: true,
      message: 'Setup started',
      setupId: setupState.id,
      provider: vmProvider,
    })

  } catch (error) {
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
  vmId?: string,
  orgoRam: number = 4,
  orgoCpu: number = 2
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
    // Get setup state
    const setupState = await prisma.setupState.findUnique({
      where: { userId },
    })

    // Get the VM record if vmId is provided (to check if VM is already created)
    let existingVM = null
    if (vmId) {
      existingVM = await prisma.vM.findUnique({
        where: { id: vmId },
      })
    }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    const orgoClient = new OrgoClient(orgoApiKey)

    let computer: any
    let project: { id: string; name: string }

    // Check if VM is already provisioned (created during "Add VM" step)
    if (existingVM?.vmCreated && existingVM?.orgoComputerId) {
      // Use the existing computer
      computer = {
        id: existingVM.orgoComputerId,
        url: existingVM.orgoComputerUrl,
      }
      project = {
        id: existingVM.orgoProjectId || '',
        name: existingVM.orgoProjectName || projectName,
      }

      await updateStatus({
        status: 'provisioning',
        orgoProjectId: project.id,
        orgoComputerId: computer.id,
        orgoComputerUrl: computer.url,
        vmCreated: true,
        vmStatus: 'running',
      })
    } else {
      // 1. Create Orgo project and VM
      await updateStatus({ status: 'provisioning' })

      // First, find the project by name to get its ID, or create if it doesn't exist
      const projects = await orgoClient.listProjects()
      project = projects.find(p => p.name === projectName) || { id: '', name: projectName }

      if (!project.id) {
        // Project doesn't exist - create it
        try {
          project = await orgoClient.createProject(projectName)
        } catch (createErr: any) {
          // If project creation fails, it might be because the API doesn't support explicit creation
          // In that case, some APIs create projects implicitly - we'll try with an empty ID
          project = { id: '', name: projectName }
        }
      }

      await updateStatus({ orgoProjectId: project.id || '' })

      // Use the VM's name (sanitized) for the Orgo computer name
      const computerName = existingVM?.name ? sanitizeName(existingVM.name) : sanitizeName(projectName)
      // Create computer using project ID (POST /computers with project_id in body)
      // Retry logic for computer creation (may timeout but still succeed)
      let retries = 3
      let lastError: Error | null = null

      while (retries > 0) {
        try {
          // If project ID is empty, try using project name instead (some APIs support this)
          const projectIdOrName = project.id || project.name
          computer = await orgoClient.createComputer(projectIdOrName, computerName, {
            os: 'linux',
            ram: orgoRam as 1 | 2 | 4 | 8 | 16 | 32 | 64,
            cpu: orgoCpu as 1 | 2 | 4 | 8 | 16,
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

          // If it's a timeout, the computer might still be created - check if it exists
          if (lastError.message.includes('timed out') || lastError.message.includes('ETIMEDOUT')) {
            try {
              // Wait a bit and check if computer exists
              await new Promise(resolve => setTimeout(resolve, 5000))
              const computers = await orgoClient.listComputers(project.name || projectName)
              const existingComputer = computers.find(c => c.name === computerName)
              if (existingComputer) {
                computer = existingComputer
                break
              }
            } catch (checkError) {
              // Could not verify computer creation
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
    }

    // Wait for VM to be fully running using Orgo API
    // This is more reliable than just a fixed timeout
    try {
      await orgoClient.waitForReady(computer.id, 30, 5000) // 30 retries, 5 seconds apart = up to 2.5 minutes
    } catch (waitError) {
      // Even if waitForReady times out, the VM might still be usable - continue with a warning
      console.warn('VM waitForReady timed out, continuing anyway:', waitError)
    }

    // Additional wait for VM services to fully initialize
    await new Promise(resolve => setTimeout(resolve, 15000)) // Wait 15 seconds for services

    await updateStatus({ vmCreated: true, vmStatus: 'running' })

    // 2. Configure VM
    await updateStatus({ status: 'configuring_vm' })

    const vmSetup = new VMSetup(orgoClient, computer.id, () => {
      // Progress callback
    })

    // Install Python and essential tools
    console.log(`[Setup ${vmId || userId}] Starting Python installation on VM...`)
    const pythonSuccess = await vmSetup.installPython()
    console.log(`[Setup ${vmId || userId}] Python installation result: ${pythonSuccess}`)
    if (!pythonSuccess) {
      // Get more diagnostic info from the VM
      let diagnosticInfo = ''
      try {
        const osResult = await orgoClient.bash(computer.id, 'cat /etc/os-release 2>/dev/null | head -3 || echo "Unknown OS"')
        const aptResult = await orgoClient.bash(computer.id, 'apt-get --version 2>&1 | head -1 || echo "apt not found"')
        const pythonResult = await orgoClient.bash(computer.id, 'python3 --version 2>&1 || echo "python3 not found"')
        diagnosticInfo = `OS: ${osResult.output?.trim() || 'unknown'}, apt: ${aptResult.output?.trim() || 'unknown'}, python: ${pythonResult.output?.trim() || 'unknown'}`
        console.log(`[Setup ${vmId || userId}] VM diagnostics: ${diagnosticInfo}`)
      } catch (diagErr) {
        console.log(`[Setup ${vmId || userId}] Failed to get VM diagnostics: ${diagErr}`)
      }
      throw new Error(`Failed to install Python and essential tools on VM. Diagnostics: ${diagnosticInfo}`)
    }

    // Install Orgo and Anthropic Python SDKs for computer use
    const sdkSuccess = await vmSetup.installOrgoPythonSDK()
    if (!sdkSuccess) {
      // SDK installation had issues, continuing...
    }

    // Install Clawdbot (NVM + Node.js 22 + Clawdbot)
    const clawdbotResult = await vmSetup.installClawdbot()
    if (!clawdbotResult.success) {
      throw new Error('Failed to install Clawdbot')
    }
    await updateStatus({ clawdbotInstalled: true })

    // Configure Clawdbot with Telegram if token is provided (from UI or env)
    const finalTelegramToken = telegramBotToken || process.env.TELEGRAM_BOT_TOKEN
    const finalTelegramUserId = telegramUserId || process.env.TELEGRAM_USER_ID

    if (finalTelegramToken) {
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
        const gatewaySuccess = await vmSetup.startClawdbotGateway(claudeApiKey, finalTelegramToken)
        await updateStatus({ gatewayStarted: gatewaySuccess })
      }
    } else {
      // Just store Claude API key if no Telegram
      await vmSetup.storeClaudeKey(claudeApiKey)
    }

    // Setup complete!
    await updateStatus({ status: 'ready' })

  } catch (error) {
    await updateStatus({
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Unknown error occurred',
    })
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
    clawdbotInstalled: boolean
    telegramConfigured: boolean
    gatewayStarted: boolean
    awsInstanceId: string
    awsInstanceName: string
    awsPublicIp: string
    awsPrivateKey: string
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
      if (updates.clawdbotInstalled !== undefined) vmUpdates.clawdbotInstalled = updates.clawdbotInstalled
      if (updates.telegramConfigured !== undefined) vmUpdates.telegramConfigured = updates.telegramConfigured
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

    // Get the VM record if vmId is provided (to use its name)
    let existingVM = null
    if (vmId) {
      existingVM = await prisma.vM.findUnique({
        where: { id: vmId },
      })
    }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    const awsClient = new AWSClient({
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
      region: awsRegion,
    })

    // 1. Create AWS EC2 Instance
    await updateStatus({ status: 'provisioning', vmStatus: 'creating' })

    // Use the VM's name (sanitized) for the AWS instance name
    const instanceName = existingVM?.name ? sanitizeName(existingVM.name) : `clawdbot-${Date.now()}`
    const { instance, privateKey } = await awsClient.createInstance({
      name: instanceName,
      instanceType: awsInstanceType,
      region: awsRegion,
    })

    await updateStatus({
      awsInstanceId: instance.id,
      awsInstanceName: instance.name,
      awsPublicIp: instance.publicIp,
      awsPrivateKey: encrypt(privateKey),
      vmStatus: 'starting',
    })

    // Wait for instance to be running
    await new Promise(resolve => setTimeout(resolve, 30000)) // Wait 30 seconds for instance to fully boot

    // Get updated instance info with public IP
    const updatedInstance = await awsClient.getInstance(instance.id)
    await updateStatus({
      awsPublicIp: updatedInstance.publicIp,
      vmCreated: true,
      vmStatus: 'running',
    })

    // 2. Configure VM
    await updateStatus({ status: 'configuring_vm' })

    awsVMSetup = new AWSVMSetup(
      awsClient,
      instance.id,
      privateKey,
      updatedInstance.publicIp,
      () => {
        // Progress callback
      }
    )

    // Install Python and essential tools
    const pythonSuccess = await awsVMSetup.installPython()
    if (!pythonSuccess) {
      throw new Error('Failed to install Python and essential tools on VM')
    }

    // Install Anthropic SDKs
    await awsVMSetup.installAnthropicSDK()

    // Install Clawdbot
    const clawdbotResult = await awsVMSetup.installClawdbot()
    if (!clawdbotResult.success) {
      throw new Error('Failed to install Clawdbot')
    }
    await updateStatus({ clawdbotInstalled: true })

    // Configure Clawdbot with Telegram if token is provided
    const finalTelegramToken = telegramBotToken || process.env.TELEGRAM_BOT_TOKEN
    const finalTelegramUserId = telegramUserId || process.env.TELEGRAM_USER_ID

    if (finalTelegramToken) {
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
        const gatewaySuccess = await awsVMSetup.startClawdbotGateway(claudeApiKey, finalTelegramToken)
        await updateStatus({ gatewayStarted: gatewaySuccess })
      }
    } else {
      await awsVMSetup.storeClaudeKey(claudeApiKey)
    }

    // Setup complete!
    await updateStatus({ status: 'ready' })

  } catch (error: any) {

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
    clawdbotInstalled: boolean
    telegramConfigured: boolean
    gatewayStarted: boolean
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
      if (updates.clawdbotInstalled !== undefined) vmUpdates.clawdbotInstalled = updates.clawdbotInstalled
      if (updates.telegramConfigured !== undefined) vmUpdates.telegramConfigured = updates.telegramConfigured
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

    // Get the VM record if vmId is provided (to use its name)
    let existingVM = null
    if (vmId) {
      existingVM = await prisma.vM.findUnique({
        where: { id: vmId },
      })
    }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    const e2bClient = new E2BClient(e2bApiKey)

    // 1. Create E2B Sandbox
    await updateStatus({ status: 'provisioning', vmStatus: 'creating' })

    // Use the VM's name (sanitized) for the E2B sandbox name
    const sandboxName = existingVM?.name ? sanitizeName(existingVM.name) : `e2b-${Date.now()}`
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

    // 2. Configure sandbox
    await updateStatus({ status: 'configuring_vm' })

    const e2bVMSetup = new E2BVMSetup(
      e2bClient,
      sandbox,
      sandboxId,
      () => {
        // Progress callback
      }
    )

    // Install essentials (E2B comes with Python pre-installed)
    await e2bVMSetup.installEssentials()

    // Install Clawdbot
    const clawdbotResult = await e2bVMSetup.installClawdbot()
    if (!clawdbotResult.success) {
      throw new Error('Failed to install Clawdbot')
    }
    await updateStatus({ clawdbotInstalled: true })

    // Configure Clawdbot with Telegram if token is provided
    const finalTelegramToken = telegramBotToken || process.env.TELEGRAM_BOT_TOKEN
    const finalTelegramUserId = telegramUserId || process.env.TELEGRAM_USER_ID

    if (finalTelegramToken) {
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
        const gatewaySuccess = await e2bVMSetup.startClawdbotGateway(claudeApiKey, finalTelegramToken)
        await updateStatus({ gatewayStarted: gatewaySuccess })
      }
    } else {
      await e2bVMSetup.storeClaudeKey(claudeApiKey)
    }

    // Setup complete!
    await updateStatus({ status: 'ready' })

  } catch (error) {
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
        // Failed to clean up sandbox
      }
    }
  }
}