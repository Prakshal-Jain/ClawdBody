import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

/**
 * Select an existing Orgo project
 * POST /api/setup/orgo/select-project
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { projectId, projectName } = await request.json()

    if (!projectId || !projectName) {
      return NextResponse.json({ error: 'Project ID and name are required' }, { status: 400 })
    }

    // Verify user has Orgo API key saved
    const setupState = await prisma.setupState.findUnique({
      where: { userId: session.user.id },
    })

    if (!setupState?.orgoApiKey) {
      return NextResponse.json({ 
        error: 'Orgo API key not found. Please validate your API key first.' 
      }, { status: 400 })
    }

    // Update setup state with selected project
    await prisma.setupState.update({
      where: { userId: session.user.id },
      data: {
        orgoProjectId: projectId,
        orgoProjectName: projectName,
        vmProvider: 'orgo',
      },
    })

    return NextResponse.json({ 
      success: true,
      message: 'Project selected successfully',
      project: { id: projectId, name: projectName },
    })

  } catch (error) {
    console.error('Select project error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to select project' },
      { status: 500 }
    )
  }
}
