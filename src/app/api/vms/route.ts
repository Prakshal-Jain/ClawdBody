import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { OrgoClient, sanitizeName } from '@/lib/orgo'
import { AWSClient } from '@/lib/aws'
import { E2BClient } from '@/lib/e2b'
import { decrypt, encrypt } from '@/lib/encryption'

/**
 * GET /api/vms - List all VMs for the current user
 * Also validates that Orgo computers still exist and cleans up deleted ones
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const vms = await prisma.vM.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
    })

    // Also get the setup state to check for stored credentials
    const setupState = await prisma.setupState.findUnique({
      where: { userId: session.user.id },
      select: {
        orgoApiKey: true,
        awsAccessKeyId: true,
        awsSecretAccessKey: true,
        awsRegion: true,
        e2bApiKey: true,
        claudeApiKey: true,
      },
    })

    // Validate Orgo VMs still exist - but be VERY conservative about cleanup
    // Only mark VMs for cleanup if we're absolutely certain they were deleted externally
    const deletedVMIds: string[] = []

    // Only validate if we have an Orgo API key
    const orgoApiKey = setupState?.orgoApiKey ? decrypt(setupState.orgoApiKey) : null
    const orgoClient = orgoApiKey ? new OrgoClient(orgoApiKey) : null

    // Grace period: don't validate VMs created in the last 30 minutes
    // This prevents deleting VMs that are still being provisioned or have transient issues
    const GRACE_PERIOD_MS = 30 * 60 * 1000 // 30 minutes (increased from 5)
    const now = Date.now()

    // Validate Orgo VMs in parallel for better performance
    const validationResults = await Promise.all(
      vms.map(async (vm) => {
        // For Orgo VMs that have been created, verify they still exist
        if (vm.provider === 'orgo' && vm.orgoComputerId && vm.vmCreated && orgoClient) {
          // Skip validation for recently created VMs (within grace period)
          const vmAge = now - new Date(vm.createdAt).getTime()
          if (vmAge < GRACE_PERIOD_MS) {
            return { vm, valid: true }
          }

          try {
            await orgoClient.getComputer(vm.orgoComputerId)
            // Computer exists, keep it
            return { vm, valid: true }
          } catch (error: any) {
            const errorMessage = error?.message || ''
            const statusCode = errorMessage.match(/Orgo API error: (\d+)/)?.[1]
            
            // ONLY consider deletion if we get an explicit 404 status code
            // AND the error message specifically indicates the computer/desktop was not found
            // This prevents false positives from other "not found" errors (API key, project, etc.)
            const isExplicit404 = statusCode === '404'
            const isComputerNotFound = 
              errorMessage.toLowerCase().includes('computer not found') ||
              errorMessage.toLowerCase().includes('desktop not found') ||
              // Orgo sometimes returns just the ID in the error
              (isExplicit404 && errorMessage.toLowerCase().includes(vm.orgoComputerId?.toLowerCase() || ''))
            
            if (isExplicit404 && isComputerNotFound) {
              console.log(`[VMs] Orgo computer ${vm.orgoComputerId} confirmed deleted (404 + computer not found), marking for cleanup`)
              return { vm, valid: false, deleted: true }
            } else {
              // For any other error (including generic "not found"), keep the VM
              // Better to show a stale VM than accidentally delete a valid one
              console.log(`[VMs] Error checking Orgo computer ${vm.orgoComputerId}: ${errorMessage} (keeping VM to be safe)`)
              return { vm, valid: true }
            }
          }
        }
        // Non-Orgo VMs or Orgo VMs not yet created - keep them
        return { vm, valid: true }
      })
    )

    // Separate valid VMs from deleted ones
    const validVMs = validationResults
      .filter((result) => result.valid)
      .map((result) => result.vm)
    
    validationResults
      .filter((result) => result.deleted)
      .forEach((result) => deletedVMIds.push(result.vm.id))

    // Delete VMs that no longer exist in Orgo (in background, don't wait)
    // Note: We only delete from our DB, not from Orgo (it's already gone there)
    if (deletedVMIds.length > 0) {
      prisma.vM.deleteMany({
        where: { id: { in: deletedVMIds } }
      }).then(() => {
        console.log(`[VMs] Cleaned up ${deletedVMIds.length} deleted Orgo VMs from database`)
      }).catch((err) => {
        console.error(`[VMs] Failed to clean up deleted VMs:`, err)
      })
    }

    // Get masked anthropic key if it exists
    let anthropicApiKeyMasked: string | undefined
    if (setupState?.claudeApiKey) {
      try {
        const decryptedKey = decrypt(setupState.claudeApiKey)
        anthropicApiKeyMasked = decryptedKey.length > 16
          ? `${decryptedKey.slice(0, 12)}...${decryptedKey.slice(-4)}`
          : '***'
      } catch {
        // Key couldn't be decrypted, treat as no key
      }
    }

    return NextResponse.json({
      vms: validVMs,
      credentials: {
        hasOrgoApiKey: !!setupState?.orgoApiKey,
        hasAwsCredentials: !!(setupState?.awsAccessKeyId && setupState?.awsSecretAccessKey),
        awsRegion: setupState?.awsRegion || 'us-east-1',
        hasE2bApiKey: !!setupState?.e2bApiKey,
        hasAnthropicApiKey: !!setupState?.claudeApiKey,
        anthropicApiKeyMasked,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list VMs' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/vms - Create a new VM
 * For Orgo VMs with provisionNow=true, this will immediately provision the VM
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { 
      name, 
      provider, 
      provisionNow, // If true, provision Orgo VM immediately
      // Orgo specific
      orgoProjectId,
      orgoProjectName,
      orgoRam,
      orgoCpu,
      // AWS specific
      awsInstanceType,
      awsRegion,
      // E2B specific
      e2bTemplateId,
      e2bTimeout,
      // Setup credentials (to start setup immediately after VM creation)
      claudeApiKey,
      useStoredApiKey,
    } = body

    if (!name || !provider) {
      return NextResponse.json({ error: 'Name and provider are required' }, { status: 400 })
    }

    if (!['orgo', 'aws', 'flyio', 'e2b'].includes(provider)) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
    }

    // Sanitize the user's name for cloud provider compatibility
    const sanitizedName = sanitizeName(name)
    if (!sanitizedName) {
      return NextResponse.json({ error: 'Invalid name. Please use alphanumeric characters.' }, { status: 400 })
    }

    // Check if a VM with this name already exists for this user
    const existingVM = await prisma.vM.findFirst({
      where: {
        userId: session.user.id,
        name: { equals: name, mode: 'insensitive' },
      },
    })

    if (existingVM) {
      return NextResponse.json({ 
        error: `A VM named "${name}" already exists. Please choose a different name.`,
        code: 'DUPLICATE_NAME'
      }, { status: 400 })
    }

    // For VMs with provisionNow, create the cloud resource immediately
    let orgoComputerId: string | undefined
    let orgoComputerUrl: string | undefined
    let awsInstanceId: string | undefined
    let awsPublicIp: string | undefined
    let awsPrivateKey: string | undefined
    let vmStatus = 'pending'

    if (provider === 'orgo' && provisionNow) {
      // Get the Orgo API key from setup state
      const setupState = await prisma.setupState.findUnique({
        where: { userId: session.user.id },
        select: { orgoApiKey: true },
      })

      if (!setupState?.orgoApiKey) {
        return NextResponse.json({ error: 'Orgo API key not configured' }, { status: 400 })
      }

      // Decrypt the stored API key
      const orgoClient = new OrgoClient(decrypt(setupState.orgoApiKey))

      try {
        // Call Orgo API to create the computer using the user's sanitized name
        const computer = await orgoClient.createComputer(orgoProjectId, sanitizedName, {
          os: 'linux',
          ram: orgoRam as 1 | 2 | 4 | 8 | 16 | 32 | 64,
          cpu: orgoCpu as 1 | 2 | 4 | 8 | 16,
        })

        orgoComputerId = computer.id
        orgoComputerUrl = computer.url
        vmStatus = 'running'
        
      } catch (orgoError: any) {
        
        // Parse the error response from Orgo
        let errorMessage = orgoError.message || 'Failed to provision VM'
        let upgradeTier: string | undefined
        
        // Check if it's a plan limitation error
        if (errorMessage.includes('plan allows') || errorMessage.includes('requires')) {
          // Return the error with upgrade info
          return NextResponse.json({
            error: errorMessage,
            upgradeTier: 'pro', // Or parse from response if available
            needsUpgrade: true,
          }, { status: 400 })
        }
        
        return NextResponse.json({ error: errorMessage }, { status: 400 })
      }
    }

    // For AWS VMs with provisionNow, create the EC2 instance immediately
    if (provider === 'aws' && provisionNow) {
      // Get the AWS credentials from setup state
      const setupState = await prisma.setupState.findUnique({
        where: { userId: session.user.id },
        select: { 
          awsAccessKeyId: true,
          awsSecretAccessKey: true,
          awsRegion: true,
        },
      })

      if (!setupState?.awsAccessKeyId || !setupState?.awsSecretAccessKey) {
        return NextResponse.json({ error: 'AWS credentials not configured' }, { status: 400 })
      }

      try {
        // Decrypt the stored credentials
        const awsClient = new AWSClient({
          accessKeyId: decrypt(setupState.awsAccessKeyId),
          secretAccessKey: decrypt(setupState.awsSecretAccessKey),
          region: awsRegion || setupState.awsRegion || 'us-east-1',
        })

        // Create the EC2 instance
        console.log(`[AWS] Creating EC2 instance for user ${session.user.id}: ${sanitizedName}`)
        const { instance, privateKey } = await awsClient.createInstance({
          name: sanitizedName,
          instanceType: awsInstanceType || 'm7i-flex.large',
          region: awsRegion || setupState.awsRegion || 'us-east-1',
        })

        awsInstanceId = instance.id
        awsPublicIp = instance.publicIp
        awsPrivateKey = encrypt(privateKey) // Encrypt the private key before storing
        vmStatus = 'running'
        
        console.log(`[AWS] Successfully created EC2 instance ${awsInstanceId} with IP ${awsPublicIp}`)
      } catch (awsError: any) {
        console.error(`[AWS] Failed to provision EC2 instance:`, awsError)
        const errorMessage = awsError.message || 'Failed to provision AWS EC2 instance'
        return NextResponse.json({ error: errorMessage }, { status: 400 })
      }
    }

    // For E2B sandboxes with provisionNow, create the sandbox immediately
    let e2bSandboxId: string | undefined
    if (provider === 'e2b' && provisionNow) {
      // Get the E2B API key from setup state
      const setupState = await prisma.setupState.findUnique({
        where: { userId: session.user.id },
        select: { e2bApiKey: true },
      })

      if (!setupState?.e2bApiKey) {
        return NextResponse.json({ error: 'E2B API key not configured' }, { status: 400 })
      }

      try {
        // Decrypt the stored API key
        const e2bClient = new E2BClient(decrypt(setupState.e2bApiKey))

        // Create the E2B sandbox
        console.log(`[E2B] Creating sandbox for user ${session.user.id}: ${sanitizedName}`)
        const { sandboxId } = await e2bClient.createSandbox({
          templateId: e2bTemplateId || 'base',
          timeout: e2bTimeout || 3600, // Default 1 hour
          metadata: { name: sanitizedName, userId: session.user.id },
        })

        e2bSandboxId = sandboxId
        vmStatus = 'running'
        
        console.log(`[E2B] Successfully created sandbox ${e2bSandboxId}`)
      } catch (e2bError: any) {
        console.error(`[E2B] Failed to provision sandbox:`, e2bError)
        const errorMessage = e2bError.message || 'Failed to provision E2B sandbox'
        
        // Check if it's a plan limitation error (timeout > 1 hour on free tier)
        if (errorMessage.includes('Timeout') || errorMessage.includes('timeout') || 
            errorMessage.includes('1 hour') || errorMessage.includes('greater than')) {
          return NextResponse.json({
            error: 'Durations longer than 1 hour require an E2B Pro plan. Please select 1 hour or less, or upgrade your E2B plan at https://e2b.dev/pricing',
            needsUpgrade: true,
          }, { status: 400 })
        }
        
        return NextResponse.json({ error: errorMessage }, { status: 400 })
      }
    }

    // Create the VM record
    const vm = await prisma.vM.create({
      data: {
        userId: session.user.id,
        name,
        provider,
        status: vmStatus,
        vmCreated: (provider === 'orgo' && provisionNow && !!orgoComputerId) || 
                   (provider === 'aws' && provisionNow && !!awsInstanceId) ||
                   (provider === 'e2b' && provisionNow && !!e2bSandboxId),
        // Orgo specific
        orgoProjectId,
        orgoProjectName,
        orgoRam,
        orgoCpu,
        orgoComputerId,
        orgoComputerUrl,
        // AWS specific
        awsInstanceType,
        awsRegion,
        awsInstanceId,
        awsPublicIp,
        awsPrivateKey,
        // E2B specific
        e2bTemplateId,
        e2bTimeout,
        e2bSandboxId,
      },
    })

    // If Anthropic API key is provided, trigger setup immediately (Telegram can be configured later)
    const hasSetupCredentials = claudeApiKey || useStoredApiKey
    if (provisionNow && hasSetupCredentials && vm.vmCreated) {
      // Trigger setup in background (don't wait for it to complete)
      const setupPayload = {
        claudeApiKey: claudeApiKey || undefined,
        useStoredApiKey: useStoredApiKey || false,
        vmId: vm.id,
      }

      // Call the setup endpoint internally (fire and forget)
      fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/setup/start`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          // Forward the session cookie for auth
          'Cookie': request.headers.get('cookie') || '',
        },
        body: JSON.stringify(setupPayload),
      }).catch(err => {
        console.error(`[VMs] Failed to trigger setup for VM ${vm.id}:`, err)
      })

      // Update VM status to indicate setup is in progress
      await prisma.vM.update({
        where: { id: vm.id },
        data: { status: 'configuring_vm' },
      })
    }

    return NextResponse.json({ success: true, vm })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create VM' },
      { status: 500 }
    )
  }
}
