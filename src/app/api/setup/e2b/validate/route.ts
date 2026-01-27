import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { E2BClient, E2B_TEMPLATES, E2B_TIMEOUT_OPTIONS } from '@/lib/e2b'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { apiKey, useStored } = await request.json()

    let e2bApiKey = apiKey

    // If useStored is true, fetch the stored credentials
    if (useStored) {
      const setupState = await prisma.setupState.findUnique({
        where: { userId: session.user.id },
        select: { e2bApiKey: true },
      })
      
      if (!setupState?.e2bApiKey) {
        return NextResponse.json({ error: 'No stored E2B API key found' }, { status: 400 })
      }
      
      e2bApiKey = setupState.e2bApiKey
    }

    if (!e2bApiKey) {
      return NextResponse.json({ error: 'E2B API key is required' }, { status: 400 })
    }

    // Initialize E2B client and validate
    const e2bClient = new E2BClient(e2bApiKey)
    const validation = await e2bClient.validateApiKey()
    
    if (!validation.valid) {
      return NextResponse.json({ 
        error: validation.error || 'Invalid E2B API key' 
      }, { status: 400 })
    }

    // Store API key in setup state (only if new key was provided)
    if (!useStored) {
      await prisma.setupState.upsert({
        where: { userId: session.user.id },
        update: {
          e2bApiKey: e2bApiKey,
        },
        create: {
          userId: session.user.id,
          e2bApiKey: e2bApiKey,
          status: 'pending',
        },
      })
    }

    return NextResponse.json({
      success: true,
      message: 'E2B API key validated successfully',
      templates: E2B_TEMPLATES,
      timeoutOptions: E2B_TIMEOUT_OPTIONS,
    })

  } catch (error) {
    console.error('E2B validation error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to validate E2B API key' },
      { status: 500 }
    )
  }
}
