import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/vms/[id] - Get a specific VM
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const vm = await prisma.vM.findFirst({
      where: {
        id: params.id,
        userId: session.user.id,
      },
    })

    if (!vm) {
      return NextResponse.json({ error: 'VM not found' }, { status: 404 })
    }

    return NextResponse.json({ vm })
  } catch (error) {
    console.error('Get VM error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get VM' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/vms/[id] - Update a VM
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    // Check if the VM belongs to the user
    const existingVM = await prisma.vM.findFirst({
      where: {
        id: params.id,
        userId: session.user.id,
      },
    })

    if (!existingVM) {
      return NextResponse.json({ error: 'VM not found' }, { status: 404 })
    }

    const vm = await prisma.vM.update({
      where: { id: params.id },
      data: body,
    })

    return NextResponse.json({ success: true, vm })
  } catch (error) {
    console.error('Update VM error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update VM' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/vms/[id] - Delete a VM
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if the VM belongs to the user
    const existingVM = await prisma.vM.findFirst({
      where: {
        id: params.id,
        userId: session.user.id,
      },
    })

    if (!existingVM) {
      return NextResponse.json({ error: 'VM not found' }, { status: 404 })
    }

    await prisma.vM.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete VM error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete VM' },
      { status: 500 }
    )
  }
}
