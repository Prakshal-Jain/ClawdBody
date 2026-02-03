import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encrypt, decrypt } from '@/lib/encryption'

/**
 * GET /api/setup/anthropic-key
 * Check if user has a stored Anthropic API key and return masked version
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const setupState = await prisma.setupState.findUnique({
      where: { userId: session.user.id },
      select: { claudeApiKey: true },
    })

    if (!setupState?.claudeApiKey) {
      return NextResponse.json({
        hasKey: false,
        maskedKey: null,
      })
    }

    // Decrypt and mask the key for display
    try {
      const decryptedKey = decrypt(setupState.claudeApiKey)
      // Mask the key: show first 12 chars and last 4 chars
      const maskedKey = decryptedKey.length > 16
        ? `${decryptedKey.slice(0, 12)}...${decryptedKey.slice(-4)}`
        : '***'

      return NextResponse.json({
        hasKey: true,
        maskedKey,
      })
    } catch (decryptError) {
      // Key exists but couldn't be decrypted - treat as no key
      return NextResponse.json({
        hasKey: false,
        maskedKey: null,
      })
    }

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get API key status' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/setup/anthropic-key
 * Update/set the Anthropic API key
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { claudeApiKey } = await request.json()

    if (!claudeApiKey || typeof claudeApiKey !== 'string') {
      return NextResponse.json({ error: 'API key is required' }, { status: 400 })
    }

    // Validate API key format (basic check)
    if (!claudeApiKey.startsWith('sk-ant-')) {
      return NextResponse.json({ error: 'Invalid Anthropic API key format' }, { status: 400 })
    }

    // Encrypt and store the key
    const encryptedKey = encrypt(claudeApiKey)

    await prisma.setupState.upsert({
      where: { userId: session.user.id },
      update: { claudeApiKey: encryptedKey },
      create: {
        userId: session.user.id,
        claudeApiKey: encryptedKey,
        status: 'pending',
      },
    })

    // Mask the key for response
    const maskedKey = claudeApiKey.length > 16
      ? `${claudeApiKey.slice(0, 12)}...${claudeApiKey.slice(-4)}`
      : '***'

    return NextResponse.json({
      success: true,
      maskedKey,
    })

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to save API key' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/setup/anthropic-key
 * Remove the stored Anthropic API key
 */
export async function DELETE() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const setupState = await prisma.setupState.findUnique({
      where: { userId: session.user.id },
    })

    if (!setupState) {
      return NextResponse.json({ success: true }) // Nothing to delete
    }

    await prisma.setupState.update({
      where: { userId: session.user.id },
      data: { claudeApiKey: null },
    })

    return NextResponse.json({ success: true })

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete API key' },
      { status: 500 }
    )
  }
}
