/**
 * Terminal Connect API
 * 
 * Creates a new terminal session and starts an interactive shell.
 * Returns a session ID that can be used for subsequent operations.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { getSessionManager, SSHTerminalProvider } from '@/lib/terminal'
import type { SSHConfig } from '@/lib/terminal'
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

// Store active sessions with their output buffers
const sessionOutputBuffers = new Map<string, string[]>()

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { cols = 80, rows = 24, vmId } = await request.json().catch(() => ({}))

    let vmProvider: string
    let awsPublicIp: string | null = null
    let awsPrivateKey: string | null = null

    // If vmId is provided, look up the VM from the VM model (multi-VM support)
    if (vmId) {
      const vm = await prisma.vM.findFirst({
        where: { id: vmId, userId: session.user.id },
      })

      if (!vm) {
        return NextResponse.json({ error: 'VM not found' }, { status: 404 })
      }

      vmProvider = vm.provider
      awsPublicIp = vm.awsPublicIp
      awsPrivateKey = vm.awsPrivateKey
    } else {
      // Fall back to SetupState for backward compatibility
    const setupState = await prisma.setupState.findUnique({
      where: { userId: session.user.id },
    })

    if (!setupState) {
      return NextResponse.json({ error: 'No VM configured' }, { status: 404 })
    }

      vmProvider = setupState.vmProvider || 'orgo'
      const awsState = setupState as AWSSetupState
      awsPublicIp = awsState.awsPublicIp || null
      awsPrivateKey = awsState.awsPrivateKey || null
    }

    // Clean up any existing sessions for this user
    const sessionManager = getSessionManager()
    sessionManager.cleanupUserSessions(session.user.id)
    
    // Also clean up output buffers for old sessions
    Array.from(sessionOutputBuffers.keys()).forEach(key => {
      if (key.startsWith(`${session.user.id}-`)) {
        sessionOutputBuffers.delete(key)
      }
    })

    // Generate session ID
    const sessionId = `${session.user.id}-${Date.now()}`

    let sshConfig: SSHConfig

    if (vmProvider === 'aws') {
      if (!awsPublicIp || !awsPrivateKey) {
        return NextResponse.json(
          { error: 'AWS instance not fully configured' },
          { status: 400 }
        )
      }

      sshConfig = {
        sessionId,
        provider: 'aws',
        host: awsPublicIp,
        port: 22,
        username: 'ubuntu',
        privateKey: awsPrivateKey,
        cols,
        rows,
      }
    } else {
      // Orgo - would need SSH details from Orgo API
      // For now, return not implemented
      return NextResponse.json(
        { error: 'Terminal not yet supported for Orgo VMs' },
        { status: 501 }
      )
    }

    // Create terminal provider
    const provider = new SSHTerminalProvider(sshConfig)
    
    // Connect
    const connected = await provider.connect()
    if (!connected) {
      return NextResponse.json(
        { error: 'Failed to connect to VM' },
        { status: 500 }
      )
    }

    // Initialize output buffer for this session
    sessionOutputBuffers.set(sessionId, [])

    // Start shell with output callback
    const shellStarted = await provider.startShell(
      (output) => {
        const buffer = sessionOutputBuffers.get(sessionId)
        if (buffer) {
          buffer.push(JSON.stringify(output))
          // Keep buffer size manageable (last 1000 outputs)
          if (buffer.length > 1000) {
            buffer.shift()
          }
        }
      },
      cols,
      rows
    )

    if (!shellStarted) {
      await provider.disconnect()
      return NextResponse.json(
        { error: 'Failed to start shell' },
        { status: 500 }
      )
    }

    // Store session in manager
    sessionManager.addSession(sessionId, provider)

    return NextResponse.json({
      success: true,
      sessionId,
      message: 'Terminal session started',
    })

  } catch (error) {
    console.error('Terminal connect error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to connect terminal' },
      { status: 500 }
    )
  }
}

// Export the buffer accessor for the stream endpoint
export { sessionOutputBuffers }
