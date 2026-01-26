import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if a specific VM is requested
    const { searchParams } = new URL(request.url)
    const vmId = searchParams.get('vmId')

    let orgoComputerId: string | null = null

    // If vmId is provided, get the computer ID from the VM model
    if (vmId) {
      const vm = await prisma.vM.findFirst({
        where: { id: vmId, userId: session.user.id },
      })

      if (!vm) {
        return NextResponse.json({ error: 'VM not found' }, { status: 404 })
      }

      if (vm.provider !== 'orgo') {
        return NextResponse.json({ error: 'Screenshot only available for Orgo VMs' }, { status: 400 })
      }

      orgoComputerId = vm.orgoComputerId
    } else {
      // Fall back to SetupState for backward compatibility
      const setupState = await prisma.setupState.findUnique({
        where: { userId: session.user.id },
      })
      orgoComputerId = setupState?.orgoComputerId || null
    }

    if (!orgoComputerId) {
      return NextResponse.json({ error: 'VM not created yet' }, { status: 404 })
    }

    // Get Orgo API key from setup state or environment
    const setupState = await prisma.setupState.findUnique({
      where: { userId: session.user.id },
      select: { orgoApiKey: true },
    })
    
    const orgoApiKey = setupState?.orgoApiKey || process.env.ORGO_API_KEY
    if (!orgoApiKey) {
      return NextResponse.json({ error: 'Orgo API key not configured' }, { status: 500 })
    }

    // Fetch screenshot directly from Orgo API (bypass OrgoClient to handle binary response)
    const ORGO_API_BASE = 'https://www.orgo.ai/api'
    
    // Add timeout to screenshot requests
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout
    
    try {
      const response = await fetch(
        `${ORGO_API_BASE}/computers/${orgoComputerId}/screenshot`,
        {
          signal: controller.signal,
          headers: {
            'Authorization': `Bearer ${orgoApiKey}`,
          },
        }
      )
      
      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        const status = response.status
        
        // Handle 502 Bad Gateway errors gracefully (often means VM is starting up or proxy issue)
        if (status === 502) {
          console.log('Orgo screenshot API returned 502 (VM may still be starting):', errorText)
          return NextResponse.json(
            { error: 'VM is not ready yet. Please wait a moment and try again.' },
            { status: 503 } // Service Unavailable - indicates temporary unavailability
          )
        }
        
        // Handle 404 - computer doesn't exist (deleted from Orgo)
        if (status === 404) {
          console.log('Computer not found in Orgo - may have been deleted')
          // Reset the setup state since computer is gone
          try {
            await prisma.setupState.update({
              where: { userId: session.user.id },
              data: {
                status: 'pending',
                orgoProjectId: null,
                orgoComputerId: null,
                orgoComputerUrl: null,
                vmStatus: null,
                vmCreated: false,
                repoCreated: false,
                repoCloned: false,
                gitSyncConfigured: false,
                errorMessage: null,
              },
            })
          } catch (updateError) {
            console.error('Failed to reset state after 404:', updateError)
          }
          return NextResponse.json(
            { error: 'Computer not found - it may have been deleted', deleted: true },
            { status: 404 }
          )
        }
        
        console.error('Orgo screenshot API error:', status, errorText)
        throw new Error(`Failed to fetch screenshot: ${status}`)
      }

      // Check content type to determine response format
      const contentType = response.headers.get('content-type') || ''
      
      if (contentType.includes('application/json')) {
        // JSON response - try to parse
        try {
          const data = await response.json()
          // Handle different possible response formats
          let imageData = data.image || data.data || data.screenshot
          
          if (!imageData) {
            throw new Error('No image data found in response')
          }
          
          // Check if imageData is a URL (starts with http/https)
          if (typeof imageData === 'string' && (imageData.startsWith('http://') || imageData.startsWith('https://'))) {
            // It's a URL - fetch the image and convert to base64
            try {
              const imageResponse = await fetch(imageData)
              if (!imageResponse.ok) {
                throw new Error(`Failed to fetch image from URL: ${imageResponse.status}`)
              }
              const arrayBuffer = await imageResponse.arrayBuffer()
              const buffer = Buffer.from(arrayBuffer)
              const base64 = buffer.toString('base64')
              
              return NextResponse.json({
                image: base64,
                imageUrl: imageData, // Also return the URL for direct use if needed
              })
            } catch (urlError) {
              console.error('Failed to fetch image from URL:', urlError)
              // Fall through to return URL directly
              return NextResponse.json({
                imageUrl: imageData, // Return URL directly - frontend can use it
              })
            }
          }
          
          // Check if it's a data URL with base64
          if (imageData.startsWith('data:image/')) {
            // Remove data URL prefix (e.g., "data:image/png;base64,")
            const base64Data = imageData.replace(/^data:image\/[a-z]+;base64,/, '')
            return NextResponse.json({
              image: base64Data,
            })
          }
          
          // Assume it's already base64 if it matches base64 pattern
          if (/^[A-Za-z0-9+/=]+$/.test(imageData.trim())) {
            return NextResponse.json({
              image: imageData.trim(),
            })
          }
          
          // If none of the above, return as-is (might be a URL we didn't catch)
          return NextResponse.json({
            imageUrl: imageData,
          })
        } catch (jsonError) {
          console.error('Failed to parse JSON response:', jsonError)
          throw new Error('Invalid JSON response from screenshot API')
        }
      } else if (contentType.includes('image/')) {
        // Binary image response - convert to base64
        const arrayBuffer = await response.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        const base64 = buffer.toString('base64')
        
        return NextResponse.json({
          image: base64,
        })
      } else {
        // Unknown format - try to get as text and see if it's base64
        const text = await response.text()
        
        // Check if it's already base64 (no data URL prefix)
        if (/^[A-Za-z0-9+/=]+$/.test(text.trim())) {
          return NextResponse.json({
            image: text.trim(),
          })
        }
        
        throw new Error(`Unexpected content type: ${contentType}`)
      }
    } catch (fetchError: any) {
      clearTimeout(timeoutId)
      if (fetchError.name === 'AbortError' || fetchError.message?.includes('timeout')) {
        console.error('Screenshot request timed out')
        return NextResponse.json(
          { error: 'Screenshot request timed out. The VM may still be starting up.' },
          { status: 504 }
        )
      }
      throw fetchError
    }
  } catch (error) {
    console.error('Screenshot error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get screenshot' },
      { status: 500 }
    )
  }
}

