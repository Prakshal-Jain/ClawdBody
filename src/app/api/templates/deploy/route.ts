import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { OrgoClient, sanitizeName } from '@/lib/orgo'
import { decrypt } from '@/lib/encryption'
import {
  getTemplateById,
  convertDbTemplate,
  processCommands,
  processTemplateObject,
  extractJsonPath,
  type Template,
} from '@/lib/templates'

interface DeployRequest {
  templateId: string
  agentName: string
  ram: number
  // Orgo specific
  orgoProjectId?: string
  orgoProjectName?: string
}

interface DeployResult {
  success: boolean
  vm?: {
    id: string
    name: string
    provider: string
    status: string
    orgoComputerId?: string
    orgoComputerUrl?: string
  }
  postSetup?: {
    type: string
    message?: string
    claimUrl?: string
    verificationCode?: string
  }
  error?: string
}

/**
 * POST /api/templates/deploy - Deploy a template to a new VM
 * 
 * This is a generic template processor that:
 * 1. Creates an Orgo VM with the specified RAM
 * 2. Calls the template's registration API (if defined)
 * 3. Executes setup commands on the VM
 * 4. Saves credentials to the VM (if defined)
 * 5. Returns post-setup data (like claim URLs)
 */
export async function POST(request: NextRequest): Promise<NextResponse<DeployResult>> {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body: DeployRequest = await request.json()
    const { templateId, agentName, ram, orgoProjectId, orgoProjectName } = body

    // Validate required fields
    if (!templateId || !agentName || !ram) {
      return NextResponse.json(
        { success: false, error: 'templateId, agentName, and ram are required' },
        { status: 400 }
      )
    }

    // Get template - first check built-in templates, then database
    let template: Template | undefined = getTemplateById(templateId)
    
    if (!template) {
      // Check database for user-created templates
      const dbTemplate = await prisma.marketplaceTemplate.findFirst({
        where: { templateId },
      })
      
      if (dbTemplate) {
        template = convertDbTemplate(dbTemplate)
      }
    }
    
    if (!template) {
      return NextResponse.json(
        { success: false, error: `Template "${templateId}" not found` },
        { status: 404 }
      )
    }

    // Validate RAM against template requirements
    if (ram < template.vmConfig.minRam) {
      return NextResponse.json(
        { success: false, error: `Minimum RAM for this template is ${template.vmConfig.minRam} GB` },
        { status: 400 }
      )
    }

    // Get Orgo credentials
    const setupState = await prisma.setupState.findUnique({
      where: { userId: session.user.id },
      select: { orgoApiKey: true },
    })

    if (!setupState?.orgoApiKey) {
      return NextResponse.json(
        { success: false, error: 'Orgo API key not configured. Please add your Orgo API key first.' },
        { status: 400 }
      )
    }

    const orgoClient = new OrgoClient(decrypt(setupState.orgoApiKey))

    // Initialize context for placeholder replacement
    const context: Record<string, string> = {
      agentName,
      description: `AI agent deployed via ClawdBody - ${template.name}`,
    }

    // === Step 1: Call registration API (if defined) ===
    let registrationResponse: any = null
    
    if (template.registration) {
      console.log(`[Deploy] Calling registration API for ${template.name}...`)
      
      try {
        const { endpoint, method, headers, bodyTemplate, responseMapping } = template.registration
        
        // Process body template with current context
        const requestBody = processTemplateObject(bodyTemplate, context)
        
        const response = await fetch(endpoint, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          body: method === 'POST' ? JSON.stringify(requestBody) : undefined,
        })

        if (!response.ok) {
          const errorText = await response.text()
          console.error(`[Deploy] Registration API error:`, errorText)
          return NextResponse.json(
            { success: false, error: `Registration failed: ${errorText}` },
            { status: 400 }
          )
        }

        registrationResponse = await response.json()
        console.log(`[Deploy] Registration successful`)

        // Extract values from response and add to context
        if (responseMapping.apiKey) {
          const apiKey = extractJsonPath(registrationResponse, responseMapping.apiKey)
          if (apiKey) context.apiKey = apiKey
        }
        if (responseMapping.claimUrl) {
          const claimUrl = extractJsonPath(registrationResponse, responseMapping.claimUrl)
          if (claimUrl) context.claimUrl = claimUrl
        }
        if (responseMapping.verificationCode) {
          const verificationCode = extractJsonPath(registrationResponse, responseMapping.verificationCode)
          if (verificationCode) context.verificationCode = verificationCode
        }
      } catch (error) {
        console.error(`[Deploy] Registration API call failed:`, error)
        return NextResponse.json(
          { success: false, error: `Registration API call failed: ${error instanceof Error ? error.message : 'Unknown error'}` },
          { status: 500 }
        )
      }
    }

    // === Step 2: Create credentials JSON for VM ===
    let credentialsJson = ''
    if (template.credentials) {
      const credentialsObj = processTemplateObject(template.credentials.template, context)
      credentialsJson = JSON.stringify(credentialsObj)
      context.credentialsJson = credentialsJson
    }

    // === Step 3: Create Orgo VM ===
    console.log(`[Deploy] Creating Orgo VM for template ${template.name}...`)
    console.log(`[Deploy] orgoProjectId=${orgoProjectId}, orgoProjectName=${orgoProjectName}`)
    
    const sanitizedVmName = sanitizeName(`${template.name}-${agentName}`)
    console.log(`[Deploy] sanitizedVmName=${sanitizedVmName}`)
    
    // Get CPU based on RAM
    const cpu = getCpuForRam(ram)
    
    let computer
    try {
      console.log(`[Deploy] Calling createComputer with projectId=${orgoProjectId}, name=${sanitizedVmName}, ram=${ram}, cpu=${cpu}`)
      computer = await orgoClient.createComputer(orgoProjectId || '', sanitizedVmName, {
        os: 'linux',
        ram: ram as 1 | 2 | 4 | 8 | 16 | 32 | 64,
        cpu: cpu as 1 | 2 | 4 | 8 | 16,
      })
      console.log(`[Deploy] VM created:`, JSON.stringify(computer, null, 2))
    } catch (error: any) {
      console.error(`[Deploy] Failed to create VM:`, error)
      
      // Check if it's a plan limitation error
      const errorMessage = error.message || 'Failed to create VM'
      if (errorMessage.includes('plan allows') || errorMessage.includes('requires')) {
        return NextResponse.json({
          success: false,
          error: errorMessage,
        }, { status: 400 })
      }
      
      return NextResponse.json(
        { success: false, error: `Failed to create VM: ${errorMessage}` },
        { status: 500 }
      )
    }

    // Check if VM is already running (Orgo often returns running status immediately)
    // The createComputer response includes the full computer object with status
    if (computer.status === 'running') {
      console.log(`[Deploy] VM ${computer.id} is already running, skipping wait`)
    } else {
      // Wait for VM to be ready only if not already running
      console.log(`[Deploy] Waiting for VM ${computer.id} to be ready (status: ${computer.status})...`)
      try {
        await orgoClient.waitForReady(computer.id)
        console.log(`[Deploy] VM ${computer.id} is ready`)
      } catch (error) {
        console.error(`[Deploy] VM failed to become ready:`, error)
        // Try to clean up the VM
        try {
          await orgoClient.deleteComputer(computer.id)
        } catch (deleteError) {
          console.error(`[Deploy] Failed to delete failed VM:`, deleteError)
        }
        return NextResponse.json(
          { success: false, error: 'VM failed to start in time. Please try again.' },
          { status: 500 }
        )
      }
    }

    // === Step 4: Execute setup commands ===
    console.log(`[Deploy] Running ${template.setup.commands.length} setup commands...`)
    
    const processedCommands = processCommands(template.setup.commands, context)
    
    for (let i = 0; i < processedCommands.length; i++) {
      const command = processedCommands[i]
      console.log(`[Deploy] Running command ${i + 1}/${processedCommands.length}: ${command.substring(0, 50)}...`)
      
      try {
        const result = await orgoClient.bash(computer.id, command)
        if (result.exit_code !== 0) {
          console.warn(`[Deploy] Command exited with code ${result.exit_code}: ${result.output}`)
          // Continue anyway - some commands may fail non-fatally
        }
      } catch (error) {
        console.error(`[Deploy] Command failed:`, error)
        // Continue with other commands
      }
    }

    console.log(`[Deploy] Setup commands completed`)

    // === Step 5: Restart gateway if running (so it discovers new skills) ===
    // OpenClaw loads skills at startup, so we need to restart for the agent to discover new skills
    console.log(`[Deploy] Checking if gateway is running and restarting to load new skills...`)
    try {
      // Check if gateway is running and restart it
      // This ensures the agent automatically knows about the new skill
      const restartScript = `
# Check if clawdbot/openclaw gateway is running
if pgrep -f "clawdbot|openclaw" > /dev/null 2>&1; then
  echo "Gateway is running, restarting to load new skills..."
  # Kill existing gateway processes
  pkill -f "clawdbot gateway" 2>/dev/null || true
  pkill -f "openclaw gateway" 2>/dev/null || true
  sleep 2
  
  # Restart gateway in background if config exists
  if [ -f ~/.clawdbot/clawdbot.json ]; then
    source ~/.bashrc 2>/dev/null || true
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
    nohup clawdbot gateway > /tmp/clawdbot-gateway.log 2>&1 &
    echo "Gateway restarted"
  else
    echo "No gateway config found, skipping restart"
  fi
else
  echo "Gateway not running, no restart needed"
fi
`.trim()
      
      const restartResult = await orgoClient.bash(computer.id, restartScript)
      console.log(`[Deploy] Gateway restart result: ${restartResult.output}`)
    } catch (error) {
      console.warn(`[Deploy] Gateway restart failed (non-fatal):`, error)
      // Non-fatal - gateway might not be running yet
    }

    // === Step 7: Create VM record in database ===
    const vm = await prisma.vM.create({
      data: {
        userId: session.user.id,
        name: `${template.name} - ${agentName}`,
        provider: 'orgo',
        status: 'running',
        vmCreated: true,
        orgoProjectId: orgoProjectId || undefined,
        orgoProjectName: orgoProjectName || undefined,
        orgoComputerId: computer.id,
        orgoComputerUrl: computer.url,
        orgoRam: ram,
        orgoCpu: cpu,
      },
    })

    console.log(`[Deploy] VM record created: ${vm.id}`)

    // === Step 7.5: Log deployment event ===
    try {
      const isBuiltIn = !!getTemplateById(templateId)
      
      // Log the event
      await prisma.templateEvent.create({
        data: {
          templateId,
          isBuiltIn,
          userId: session.user.id,
          userName: session.user.name || null,
          eventType: 'deploy',
          metadata: JSON.stringify({
            vmProvider: 'orgo',
            ram,
            vmId: vm.id,
            agentName,
          }),
        },
      })
      
      // Increment deploy count for user-created templates
      if (!isBuiltIn) {
        await prisma.marketplaceTemplate.update({
          where: { templateId },
          data: { deployCount: { increment: 1 } },
        })
      }
      
      console.log(`[Deploy] Deployment event logged for ${templateId}`)
    } catch (error) {
      console.warn(`[Deploy] Failed to log deployment event (non-fatal):`, error)
    }

    // === Step 8: Build response ===
    const result: DeployResult = {
      success: true,
      vm: {
        id: vm.id,
        name: vm.name,
        provider: vm.provider,
        status: vm.status,
        orgoComputerId: vm.orgoComputerId || undefined,
        orgoComputerUrl: vm.orgoComputerUrl || undefined,
      },
    }

    // Add post-setup data if defined
    if (template.postSetup) {
      result.postSetup = {
        type: template.postSetup.type,
        message: template.postSetup.message,
        claimUrl: context.claimUrl,
        verificationCode: context.verificationCode,
      }
    }

    return NextResponse.json(result)
    
  } catch (error) {
    console.error('[Deploy] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Deployment failed' },
      { status: 500 }
    )
  }
}

/**
 * Get CPU cores based on RAM (Orgo only accepts 4, 8, or 16 cores)
 */
function getCpuForRam(ram: number): number {
  switch (ram) {
    case 4: return 4
    case 8: return 4
    case 16: return 8
    case 32: return 16
    default: return 4
  }
}
