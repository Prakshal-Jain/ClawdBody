import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { AWSClient, AWS_REGIONS, AWS_INSTANCE_TYPES } from '@/lib/aws'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { accessKeyId, secretAccessKey, region, useStored } = await request.json()

    let keyId = accessKeyId
    let secretKey = secretAccessKey
    let regionToUse = region || 'us-east-1'

    // If useStored is true, fetch the stored credentials
    if (useStored) {
      const setupState = await prisma.setupState.findUnique({
        where: { userId: session.user.id },
        select: { 
          awsAccessKeyId: true, 
          awsSecretAccessKey: true,
          awsRegion: true,
        },
      })
      
      if (!setupState?.awsAccessKeyId || !setupState?.awsSecretAccessKey) {
        return NextResponse.json({ error: 'No stored AWS credentials found' }, { status: 400 })
      }
      
      keyId = setupState.awsAccessKeyId
      secretKey = setupState.awsSecretAccessKey
      regionToUse = setupState.awsRegion || 'us-east-1'
    }

    if (!keyId || !secretKey) {
      return NextResponse.json({ error: 'AWS credentials are required' }, { status: 400 })
    }

    // Initialize AWS client
    const awsClient = new AWSClient({
      accessKeyId: keyId,
      secretAccessKey: secretKey,
      region: regionToUse,
    })

    // Validate credentials
    const validation = await awsClient.validateCredentials()
    
    if (!validation.valid) {
      return NextResponse.json({ 
        error: validation.error || 'Invalid AWS credentials' 
      }, { status: 400 })
    }

    // List existing Clawdbot instances
    const instances = await awsClient.listInstances()

    // Store credentials in setup state (only if new credentials were provided)
    if (!useStored) {
      await prisma.setupState.upsert({
        where: { userId: session.user.id },
        update: {
          awsAccessKeyId: keyId,
          awsSecretAccessKey: secretKey,
          awsRegion: regionToUse,
        },
        create: {
          userId: session.user.id,
          awsAccessKeyId: keyId,
          awsSecretAccessKey: secretKey,
          awsRegion: regionToUse,
          status: 'pending',
        },
      })
    }

    return NextResponse.json({
      success: true,
      message: 'AWS credentials validated successfully',
      instances,
      regions: AWS_REGIONS,
      instanceTypes: AWS_INSTANCE_TYPES,
    })

  } catch (error) {
    console.error('AWS validation error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to validate AWS credentials' },
      { status: 500 }
    )
  }
}
