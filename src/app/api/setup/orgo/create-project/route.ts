import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { OrgoClient, generateComputerName } from '@/lib/orgo'

/**
 * Create a new Orgo project
 * POST /api/setup/orgo/create-project
 * 
 * Note: Orgo creates projects implicitly when creating a computer,
 * so we create a computer in the new project to ensure it exists.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { projectName } = await request.json()

    if (!projectName || typeof projectName !== 'string') {
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 })
    }

    // Get the user's Orgo API key from setup state
    const setupState = await prisma.setupState.findUnique({
      where: { userId: session.user.id },
    })

    if (!setupState?.orgoApiKey) {
      return NextResponse.json({ 
        error: 'Orgo API key not found. Please validate your API key first.' 
      }, { status: 400 })
    }

    const orgoClient = new OrgoClient(setupState.orgoApiKey)

    // Check if project already exists
    const projects = await orgoClient.listProjects()
    const existingProject = projects.find(p => p.name.toLowerCase() === projectName.toLowerCase())

    if (existingProject) {
      return NextResponse.json({ 
        success: true,
        project: existingProject,
        message: 'Project already exists',
      })
    }

    // Try to create the project via Orgo API
    try {
      const newProject = await orgoClient.createProject(projectName)
      
      // Store the project info in setup state
      await prisma.setupState.update({
        where: { userId: session.user.id },
        data: {
          orgoProjectId: newProject.id,
          orgoProjectName: newProject.name,
          vmProvider: 'orgo',
        },
      })

      return NextResponse.json({ 
        success: true,
        project: newProject,
        message: 'Project created successfully',
      })
    } catch (createErr: any) {
      // If explicit creation fails, store the name and create during VM provisioning
      console.warn(`Could not create project explicitly: ${createErr.message}`)
      
      await prisma.setupState.update({
        where: { userId: session.user.id },
        data: {
          orgoProjectName: projectName,
          vmProvider: 'orgo',
        },
      })

      return NextResponse.json({ 
        success: true,
        project: { id: '', name: projectName },
        message: 'Project will be created when VM is provisioned',
      })
    }

  } catch (error) {
    console.error('Create project error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create project' },
      { status: 500 }
    )
  }
}
