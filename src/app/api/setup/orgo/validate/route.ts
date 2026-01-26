import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { OrgoClient } from '@/lib/orgo'

/**
 * Validate Orgo API key and return available projects
 * POST /api/setup/orgo/validate
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { apiKey, useStored } = await request.json()

    let keyToUse = apiKey

    // If useStored is true, fetch the stored API key
    if (useStored) {
      const setupState = await prisma.setupState.findUnique({
        where: { userId: session.user.id },
        select: { orgoApiKey: true },
      })
      
      if (!setupState?.orgoApiKey) {
        return NextResponse.json({ error: 'No stored Orgo API key found' }, { status: 400 })
      }
      
      keyToUse = setupState.orgoApiKey
    }

    if (!keyToUse || typeof keyToUse !== 'string') {
      return NextResponse.json({ error: 'Orgo API key is required' }, { status: 400 })
    }

    // Validate the API key by trying to list projects
    const orgoClient = new OrgoClient(keyToUse)
    
    try {
      const projects = await orgoClient.listProjects()
      
      // Store the API key in setup state (only if it's a new key)
      if (!useStored) {
        await prisma.setupState.upsert({
          where: { userId: session.user.id },
          create: {
            userId: session.user.id,
            orgoApiKey: keyToUse,
            status: 'pending',
          },
          update: {
            orgoApiKey: keyToUse,
          },
        })
      }

      return NextResponse.json({ 
        success: true,
        projects: projects.map(p => ({ id: p.id, name: p.name })),
        hasProjects: projects.length > 0,
      })
    } catch (orgoError: any) {
      // Handle Orgo API errors
      const errorMessage = orgoError.message || 'Invalid API key or unable to connect to Orgo'
      
      if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        return NextResponse.json({ error: 'Invalid Orgo API key' }, { status: 401 })
      }
      
      return NextResponse.json({ error: errorMessage }, { status: 400 })
    }

  } catch (error) {
    console.error('Orgo validate error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to validate Orgo API key' },
      { status: 500 }
    )
  }
}
