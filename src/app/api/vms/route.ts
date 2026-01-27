import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/vms - List all VMs for the current user
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
      },
    })

    return NextResponse.json({
      vms,
      credentials: {
        hasOrgoApiKey: !!setupState?.orgoApiKey,
        hasAwsCredentials: !!(setupState?.awsAccessKeyId && setupState?.awsSecretAccessKey),
        awsRegion: setupState?.awsRegion || 'us-east-1',
        hasE2bApiKey: !!setupState?.e2bApiKey,
      },
    })
  } catch (error) {
    console.error('List VMs error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list VMs' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/vms - Create a new VM
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
      // Orgo specific
      orgoProjectId,
      orgoProjectName,
      // AWS specific
      awsInstanceType,
      awsRegion,
      // E2B specific
      e2bTemplateId,
      e2bTimeout,
    } = body

    if (!name || !provider) {
      return NextResponse.json({ error: 'Name and provider are required' }, { status: 400 })
    }

    if (!['orgo', 'aws', 'flyio', 'e2b'].includes(provider)) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
    }

    // Create the VM record
    const vm = await prisma.vM.create({
      data: {
        userId: session.user.id,
        name,
        provider,
        status: 'pending',
        // Orgo specific
        orgoProjectId,
        orgoProjectName,
        // AWS specific
        awsInstanceType,
        awsRegion,
        // E2B specific
        e2bTemplateId,
        e2bTimeout,
      },
    })

    return NextResponse.json({ success: true, vm })
  } catch (error) {
    console.error('Create VM error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create VM' },
      { status: 500 }
    )
  }
}
