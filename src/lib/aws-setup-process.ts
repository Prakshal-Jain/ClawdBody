import { prisma } from '@/lib/prisma'
import { AWSClient } from '@/lib/aws'
import { AWSVMSetup } from '@/lib/aws-vm-setup'
import { encrypt, decrypt } from '@/lib/encryption'
import { sanitizeName } from '@/lib/orgo'

/**
 * AWS EC2 Setup Process
 */
export async function runAWSSetupProcess(
  userId: string,
  llmApiKey: string,
  llmProvider: string,
  llmModel: string,
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

    // Get the VM record if vmId is provided (to use its name and check if instance already exists)
    let existingVM = null
    if (vmId) {
      existingVM = await prisma.vM.findUnique({
        where: { id: vmId },
      })
    }

    const user = await prisma.user.findUnique({ 
      where: { id: userId },
      select: { isPro: true },
    })
    const awsClient = new AWSClient({
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
      region: awsRegion,
    })

    // Check if VM already has an instance (created via /api/vms with provisionNow=true)
    let instance: { id: string; name: string; publicIp?: string }
    let privateKey: string

    if (existingVM?.awsInstanceId && existingVM.vmCreated) {
      // VM already has an instance - reuse it instead of creating a new one
      console.log(`[AWS Setup] Reusing existing EC2 instance: ${existingVM.awsInstanceId}`)
      
      // Get the instance details from AWS
      const awsInstance = await awsClient.getInstance(existingVM.awsInstanceId)
      
      instance = {
        id: existingVM.awsInstanceId,
        name: existingVM.awsInstanceName || existingVM.name,
        publicIp: existingVM.awsPublicIp || awsInstance.publicIp,
      }
      
      // Decrypt the stored private key
      privateKey = existingVM.awsPrivateKey ? decrypt(existingVM.awsPrivateKey) : ''
      
      await updateStatus({
        status: 'configuring_vm', // Skip provisioning, go straight to configuration
        awsInstanceId: instance.id,
        awsInstanceName: instance.name,
        awsPublicIp: instance.publicIp,
        vmStatus: 'running',
        vmCreated: true,
      })
    } else {
      // No existing instance - create a new one
      await updateStatus({ status: 'provisioning', vmStatus: 'creating' })

      // Use the VM's name (sanitized) for the AWS instance name
      const instanceName = existingVM?.name ? sanitizeName(existingVM.name) : `clawdbot-${Date.now()}`
      const createResult = await awsClient.createInstance({
        name: instanceName,
        instanceType: awsInstanceType,
        region: awsRegion,
      })
      
      instance = createResult.instance
      privateKey = createResult.privateKey

      await updateStatus({
        awsInstanceId: instance.id,
        awsInstanceName: instance.name,
        awsPublicIp: instance.publicIp,
        awsPrivateKey: encrypt(privateKey),
        vmStatus: 'starting',
      })

      // Wait for instance to be running
      // Custom AMI boots faster since everything is pre-installed
      const isCustomAmi = !!process.env.CLAWDBODY_AWS_CUSTOM_AMI_ID
      const bootWaitTime = isCustomAmi ? 15000 : 30000 // 15s for custom AMI, 30s for default
      await new Promise(resolve => setTimeout(resolve, bootWaitTime))

      // Get updated instance info with public IP
      const updatedInstance = await awsClient.getInstance(instance.id)
      await updateStatus({
        awsPublicIp: updatedInstance.publicIp,
        vmCreated: true,
        vmStatus: 'running',
      })
    }

    // 2. Configure VM
    await updateStatus({ status: 'configuring_vm' })

    // Get the public IP for SSH connection
    const instancePublicIp = instance.publicIp || (await awsClient.getInstance(instance.id)).publicIp

    awsVMSetup = new AWSVMSetup(
      awsClient,
      instance.id,
      privateKey,
      instancePublicIp,
      () => {
        // Progress callback
      }
    )

    // Check if using custom AMI (everything pre-installed)
    // Use custom AMI for all users if available (skip installation)
    const customAmiAvailable = !!process.env.CLAWDBODY_AWS_CUSTOM_AMI_ID
    const usingCustomAmi = customAmiAvailable
    
    let clawdbotResult: { success: boolean; version?: string } | null = null
    
    if (usingCustomAmi) {
      // Custom AMI - skip installation, just verify and configure
      console.log(`[AWS Setup] Using custom AMI - skipping installation steps (AMI: ${process.env.CLAWDBODY_AWS_CUSTOM_AMI_ID})`)
      
      // Immediately mark as installed (since it's in the AMI)
      // This updates the UI right away so it doesn't show "Installing Clawdbot"
      await updateStatus({ clawdbotInstalled: true })
      
      // Quick verification (with timeout to avoid blocking)
      try {
        const verifyResult = await Promise.race([
          awsVMSetup.verifyClawdbotInstalled(),
          new Promise<{ installed: boolean; version?: string }>((resolve) => 
            setTimeout(() => resolve({ installed: true, version: '2026.1.22' }), 3000)
          )
        ])
        
        if (!verifyResult.installed) {
          console.error('[AWS Setup] WARNING: Custom AMI may not have Clawdbot installed. Continuing anyway...')
        } else {
          console.log(`[AWS Setup] Clawdbot verified: version ${verifyResult.version || 'unknown'}`)
        }
        
        clawdbotResult = {
          success: true,
          version: verifyResult.version || '2026.1.22'
        }
      } catch (err) {
        console.warn('[AWS Setup] Could not verify Clawdbot installation, assuming it exists:', err)
        clawdbotResult = {
          success: true,
          version: '2026.1.22'
        }
      }
    } else {
      // Default AMI - do full installation
      // Install Python and essential tools
      const pythonSuccess = await awsVMSetup.installPython()
      if (!pythonSuccess) {
        throw new Error('Failed to install Python and essential tools on VM')
      }

      // Install Anthropic SDKs
      await awsVMSetup.installAnthropicSDK()

      // Install Clawdbot
      clawdbotResult = await awsVMSetup.installClawdbot()
      if (!clawdbotResult.success) {
        throw new Error('Failed to install Clawdbot')
      }
      await updateStatus({ clawdbotInstalled: true })
    }

    // Configure Clawdbot with Telegram if token is provided
    const finalTelegramToken = telegramBotToken || process.env.TELEGRAM_BOT_TOKEN
    const finalTelegramUserId = telegramUserId || process.env.TELEGRAM_USER_ID

    if (finalTelegramToken) {
      // Get Clawdbot version from the result
      const clawdbotVersion = clawdbotResult?.version || '2026.1.22'
      
      const telegramSuccess = await awsVMSetup.setupClawdbotTelegram({
        llmApiKey,
        llmProvider,
        llmModel,
        telegramBotToken: finalTelegramToken,
        telegramUserId: finalTelegramUserId,
        clawdbotVersion,
        heartbeatIntervalMinutes: 30,
        userId,
        apiBaseUrl: process.env.NEXTAUTH_URL || 'http://localhost:3000',
      })
      await updateStatus({ telegramConfigured: telegramSuccess })

      if (telegramSuccess) {
        const gatewaySuccess = await awsVMSetup.startClawdbotGateway({
          llmApiKey,
          llmProvider,
          telegramBotToken: finalTelegramToken,
        })
        await updateStatus({ gatewayStarted: gatewaySuccess })
      }
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
