/**
 * E2B Terminal Execute API
 * 
 * Executes bash commands on E2B sandboxes using the E2B SDK.
 * Connects to an existing sandbox by ID and runs commands.
 * 
 * Docs: https://e2b.dev/docs
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { E2BClient } from '@/lib/e2b'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { command, vmId, sandboxId } = await request.json()

    if (!command) {
      return NextResponse.json({ error: 'Command is required' }, { status: 400 })
    }

    let e2bSandboxId: string | null = null
    let e2bApiKey: string | null = null

    // Get sandbox ID either from vmId or directly
    if (vmId) {
      const vm = await prisma.vM.findFirst({
        where: { id: vmId, userId: session.user.id },
      })

      if (!vm) {
        return NextResponse.json({ error: 'VM not found' }, { status: 404 })
      }

      if (vm.provider !== 'e2b') {
        return NextResponse.json(
          { error: 'This endpoint is only for E2B VMs' },
          { status: 400 }
        )
      }

      e2bSandboxId = vm.e2bSandboxId
    } else if (sandboxId) {
      e2bSandboxId = sandboxId
    }

    if (!e2bSandboxId) {
      return NextResponse.json(
        { error: 'E2B sandbox ID not found' },
        { status: 400 }
      )
    }

    // Get API key from setup state
    const setupState = await prisma.setupState.findUnique({
      where: { userId: session.user.id },
    })

    e2bApiKey = setupState?.e2bApiKey || null

    if (!e2bApiKey) {
      return NextResponse.json(
        { error: 'E2B API key not configured' },
        { status: 400 }
      )
    }

    // Connect to sandbox and execute command
    const client = new E2BClient(e2bApiKey)
    
    try {
      const sandbox = await client.connectToSandbox(e2bSandboxId)
      const result = await client.executeCommand(sandbox, command)

      // Combine stdout and stderr for output
      const output = result.stdout + (result.stderr ? `\n${result.stderr}` : '')

      return NextResponse.json({
        success: true,
        output: output || '',
        exitCode: result.exitCode,
      })
    } catch (sandboxError: any) {
      // Handle sandbox connection errors (e.g., sandbox expired/killed)
      if (sandboxError.message?.includes('not found') || sandboxError.message?.includes('does not exist')) {
        return NextResponse.json(
          { error: 'Sandbox no longer exists. It may have expired or been terminated.' },
          { status: 410 }
        )
      }
      throw sandboxError
    }

  } catch (error) {
    console.error('E2B terminal execute error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to execute command' },
      { status: 500 }
    )
  }
}
