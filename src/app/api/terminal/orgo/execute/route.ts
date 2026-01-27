/**
 * Orgo Terminal Execute API
 * 
 * Executes bash commands on Orgo computers using the Orgo API.
 * POST /computers/{id}/bash
 * 
 * Docs: https://docs.orgo.ai/api-reference/computers/bash
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { OrgoClient } from '@/lib/orgo'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { command, vmId, computerId } = await request.json()

    if (!command) {
      return NextResponse.json({ error: 'Command is required' }, { status: 400 })
    }

    let orgoComputerId: string | null = null
    let orgoApiKey: string | null = null

    // Get computer ID either from vmId or directly
    if (vmId) {
      const vm = await prisma.vM.findFirst({
        where: { id: vmId, userId: session.user.id },
      })

      if (!vm) {
        return NextResponse.json({ error: 'VM not found' }, { status: 404 })
      }

      if (vm.provider !== 'orgo') {
        return NextResponse.json(
          { error: 'This endpoint is only for Orgo VMs' },
          { status: 400 }
        )
      }

      orgoComputerId = vm.orgoComputerId
    } else if (computerId) {
      orgoComputerId = computerId
    }

    if (!orgoComputerId) {
      return NextResponse.json(
        { error: 'Orgo computer ID not found' },
        { status: 400 }
      )
    }

    // Get API key from setup state
    const setupState = await prisma.setupState.findUnique({
      where: { userId: session.user.id },
    })

    orgoApiKey = setupState?.orgoApiKey || null

    if (!orgoApiKey) {
      return NextResponse.json(
        { error: 'Orgo API key not configured' },
        { status: 400 }
      )
    }

    // Execute bash command via Orgo API
    const client = new OrgoClient(orgoApiKey)
    const result = await client.bash(orgoComputerId, command)

    return NextResponse.json({
      success: true,
      output: result.output || '',
      exitCode: result.exit_code ?? 0,
    })

  } catch (error) {
    console.error('Orgo terminal execute error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to execute command' },
      { status: 500 }
    )
  }
}
