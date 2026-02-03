import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { SetupState } from '@prisma/client'

// Extended type for AWS fields
type AWSSetupState = SetupState & {
  awsAccessKeyId?: string | null
  awsSecretAccessKey?: string | null
  awsRegion?: string | null
  awsInstanceType?: string | null
  awsInstanceId?: string | null
  awsInstanceName?: string | null
  awsPublicIp?: string | null
  awsPrivateKey?: string | null
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if a specific VM is requested
    const { searchParams } = new URL(request.url)
    const vmId = searchParams.get('vmId')

    // If vmId is provided, get status from the VM model
    if (vmId) {
      const vm = await prisma.vM.findFirst({
        where: { id: vmId, userId: session.user.id },
      })

      if (!vm) {
        return NextResponse.json({ error: 'VM not found' }, { status: 404 })
      }

      // Get SetupState to check for stored Anthropic API key
      const setupState = await prisma.setupState.findUnique({
        where: { userId: session.user.id },
        select: { claudeApiKey: true },
      })

      const response: Record<string, unknown> = {
        status: vm.status,
        vmCreated: vm.vmCreated,
        clawdbotInstalled: vm.clawdbotInstalled,
        telegramConfigured: vm.telegramConfigured || false,
        gatewayStarted: vm.gatewayStarted,
        errorMessage: vm.errorMessage,
        vmProvider: vm.provider,
        vmId: vm.id,
        vmName: vm.name,
        // Indicate if user has a stored Anthropic API key
        hasAnthropicApiKey: !!setupState?.claudeApiKey,
      }

      // Add provider-specific fields
      if (vm.provider === 'aws') {
        response.awsInstanceId = vm.awsInstanceId
        response.awsInstanceType = vm.awsInstanceType
        response.awsPublicIp = vm.awsPublicIp
        response.awsRegion = vm.awsRegion
        if (vm.awsInstanceId && vm.awsRegion) {
          response.awsConsoleUrl = `https://${vm.awsRegion}.console.aws.amazon.com/ec2/home?region=${vm.awsRegion}#InstanceDetails:instanceId=${vm.awsInstanceId}`
        }
      } else if (vm.provider === 'orgo') {
        response.orgoComputerId = vm.orgoComputerId
        response.orgoComputerUrl = vm.orgoComputerUrl
        response.orgoProjectId = vm.orgoProjectId
        response.orgoProjectName = vm.orgoProjectName
      } else if (vm.provider === 'e2b') {
        response.e2bSandboxId = vm.e2bSandboxId
        response.e2bTemplateId = vm.e2bTemplateId
        response.e2bTimeout = vm.e2bTimeout
      }

      return NextResponse.json(response)
    }

    // Fall back to SetupState for backward compatibility (no vmId provided)
    const setupState = await prisma.setupState.findUnique({
      where: { userId: session.user.id },
    })

    if (!setupState) {
      return NextResponse.json({
        status: 'pending',
        vmCreated: false,
        clawdbotInstalled: false,
        telegramConfigured: false,
        gatewayStarted: false,
        vmProvider: null,
      })
    }

    // Return provider-specific fields from SetupState
    const response: Record<string, unknown> = {
      status: setupState.status,
      vmCreated: setupState.vmCreated,
      clawdbotInstalled: setupState.clawdbotInstalled,
      telegramConfigured: setupState.telegramConfigured,
      gatewayStarted: setupState.gatewayStarted,
      errorMessage: setupState.errorMessage,
      vmProvider: setupState.vmProvider,
      // Indicate if user has a stored Anthropic API key
      hasAnthropicApiKey: !!setupState.claudeApiKey,
    }

    // Add provider-specific fields
    if (setupState.vmProvider === 'aws') {
      const awsState = setupState as AWSSetupState
      response.awsInstanceId = awsState.awsInstanceId
      response.awsInstanceName = awsState.awsInstanceName
      response.awsPublicIp = awsState.awsPublicIp
      response.awsRegion = awsState.awsRegion
      if (awsState.awsInstanceId && awsState.awsRegion) {
        response.awsConsoleUrl = `https://${awsState.awsRegion}.console.aws.amazon.com/ec2/home?region=${awsState.awsRegion}#InstanceDetails:instanceId=${awsState.awsInstanceId}`
      }
    } else if (setupState.vmProvider === 'e2b') {
      // E2B doesn't store sandbox info in SetupState, it's per-VM
      // Just mark that it's an E2B provider
      response.isE2B = true
    } else {
      response.orgoComputerId = setupState.orgoComputerId
      response.orgoComputerUrl = setupState.orgoComputerUrl
    }

    return NextResponse.json(response)

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get status' },
      { status: 500 }
    )
  }
}


