/**
 * Orgo API Client
 * Handles VM provisioning and management
 * API Docs: https://docs.orgo.ai
 */

const ORGO_API_BASE = 'https://www.orgo.ai/api'

export interface OrgoComputer {
  id: string
  name: string
  project_name: string
  os: string
  ram: number
  cpu: number
  status: string
  url: string
  created_at: string
}

export interface OrgoProject {
  id: string
  name: string
}

export class OrgoClient {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  /**
   * Normalize computer ID - the Orgo API expects the raw ID without prefix for most endpoints
   * (Previously incorrectly added 'orgo-' prefix which caused "Desktop not found" errors)
   */
  private normalizeComputerId(computerId: string): string {
    // Remove 'orgo-' prefix if present (for backward compatibility with any stored IDs that have it)
    return computerId.startsWith('orgo-') ? computerId.slice(5) : computerId
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    timeoutOverrideMs?: number
  ): Promise<T> {
    const url = `${ORGO_API_BASE}${endpoint}`
    
    // Add timeout to fetch requests (default 60 seconds, can be overridden for long operations)
    const timeoutMs = timeoutOverrideMs || 60000
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      })
      
      clearTimeout(timeoutId)

      const responseText = await response.text()

      if (!response.ok) {
        let errorMessage = `Orgo API error: ${response.status}`
        try {
          const errorJson = JSON.parse(responseText)
          errorMessage = errorJson.error || errorJson.message || errorMessage
        } catch {
          errorMessage = responseText || errorMessage
        }
        throw new Error(errorMessage)
      }

      try {
        return JSON.parse(responseText)
      } catch {
        return responseText as T
      }
    } catch (error: any) {
      clearTimeout(timeoutId)
      if (error.name === 'AbortError' || error.code === 'ETIMEDOUT') {
        throw new Error(`Request to Orgo API timed out after ${timeoutMs}ms. The operation may still be in progress.`)
      }
      throw error
    }
  }

  /**
   * Get or create a project by name
   * Note: Projects are created implicitly when creating a computer
   */
  async getOrCreateProject(name: string): Promise<OrgoProject> {
    // List existing projects first
    const projects = await this.listProjects()
    const existing = projects.find(p => p.name === name)
    if (existing) {
      return existing
    }
    // Project will be created when we create the first computer
    // Return a placeholder that will be updated after computer creation
    return { id: '', name }
  }

  /**
   * List all projects
   */
  async listProjects(): Promise<OrgoProject[]> {
    const response = await this.request<{ projects: OrgoProject[] }>('/projects')
    return response.projects || []
  }

  /**
   * Create a new project
   */
  async createProject(name: string): Promise<OrgoProject> {
    return this.request<OrgoProject>('/projects', {
      method: 'POST',
      body: JSON.stringify({ name }),
    })
  }

  /**
   * Create a new computer (VM) within a project
   * Uses POST /computers with project_id in the body
   */
  async createComputer(
    projectId: string,
    computerName: string,
    options: {
      os?: 'linux' | 'windows'
      ram?: 1 | 2 | 4 | 8 | 16 | 32 | 64
      cpu?: 1 | 2 | 4 | 8 | 16
    } = {}
  ): Promise<OrgoComputer> {
    return this.request<OrgoComputer>('/computers', {
      method: 'POST',
      body: JSON.stringify({
        project_id: projectId,
        name: computerName,
        os: options.os || 'linux',
        ram: options.ram || 4,
        cpu: options.cpu || 2,
      }),
    })
  }

  /**
   * Get computer details by ID
   */
  async getComputer(computerId: string): Promise<OrgoComputer> {
    return this.request<OrgoComputer>(`/computers/${this.normalizeComputerId(computerId)}`)
  }

  /**
   * List all computers in a project
   */
  async listComputers(projectName: string): Promise<OrgoComputer[]> {
    const response = await this.request<{ computers: OrgoComputer[] }>(
      `/projects/${encodeURIComponent(projectName)}/computers`
    )
    return response.computers || []
  }

  /**
   * Start a computer
   */
  async startComputer(computerId: string): Promise<void> {
    await this.request(`/computers/${this.normalizeComputerId(computerId)}/start`, { method: 'POST' })
  }

  /**
   * Stop a computer
   */
  async stopComputer(computerId: string): Promise<void> {
    await this.request(`/computers/${this.normalizeComputerId(computerId)}/stop`, { method: 'POST' })
  }

  /**
   * Restart a computer
   */
  async restartComputer(computerId: string): Promise<void> {
    await this.request(`/computers/${this.normalizeComputerId(computerId)}/restart`, { method: 'POST' })
  }

  /**
   * Delete a computer
   */
  async deleteComputer(computerId: string): Promise<void> {
    await this.request(`/computers/${this.normalizeComputerId(computerId)}`, { method: 'DELETE' })
  }

  /**
   * Execute a bash command on the computer
   * @param computerId - The computer ID
   * @param command - The bash command to execute
   * @param timeoutMs - Optional timeout in milliseconds (default: 300000 = 5 minutes for long-running commands)
   * @param serverTimeoutSec - Optional server-side timeout in seconds (passed to Orgo API, default: 200)
   */
  async bash(
    computerId: string, 
    command: string, 
    timeoutMs: number = 300000,
    serverTimeoutSec: number = 200
  ): Promise<{ output: string; exit_code: number }> {
    return this.request(
      `/computers/${this.normalizeComputerId(computerId)}/bash`,
      {
        method: 'POST',
        body: JSON.stringify({ 
          command,
          timeout: serverTimeoutSec, // Request server-side timeout (Orgo API parameter)
        }),
      },
      timeoutMs
    )
  }

  /**
   * Execute Python code on the computer
   */
  async exec(computerId: string, code: string): Promise<{ output: string }> {
    return this.request(`/computers/${this.normalizeComputerId(computerId)}/exec`, {
      method: 'POST',
      body: JSON.stringify({ code }),
    })
  }

  /**
   * Take a screenshot of the computer
   */
  async screenshot(computerId: string): Promise<{ image: string }> {
    return this.request(`/computers/${this.normalizeComputerId(computerId)}/screenshot`)
  }

  /**
   * Wait for computer to be ready
   * Handles the case where the computer isn't immediately queryable after creation (propagation delay)
   */
  async waitForReady(computerId: string, maxAttempts = 30, intervalMs = 2000): Promise<OrgoComputer> {
    // Initial delay to allow Orgo to register the computer in their system
    // This prevents "Computer not found" errors right after creation
    await new Promise(resolve => setTimeout(resolve, 3000))
    
    let lastError: Error | null = null
    let consecutiveNotFoundErrors = 0
    const MAX_NOT_FOUND_RETRIES = 10 // Allow up to 10 "not found" errors during propagation
    
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const computer = await this.getComputer(computerId)
        // Reset not found counter on successful fetch
        consecutiveNotFoundErrors = 0
        
        if (computer.status === 'running') {
          return computer
        }
        // Computer exists but not running yet - wait and retry
        lastError = null
      } catch (error: any) {
        lastError = error
        const errorMessage = error?.message || ''
        
        // Check if it's a "not found" error (common during propagation delay)
        const isNotFoundError = 
          errorMessage.includes('404') || 
          errorMessage.toLowerCase().includes('not found')
        
        if (isNotFoundError) {
          consecutiveNotFoundErrors++
          console.log(`[Orgo] Computer ${computerId} not found yet (attempt ${i + 1}/${maxAttempts}, not found count: ${consecutiveNotFoundErrors})`)
          
          // If we've exceeded the "not found" retry limit, the computer likely doesn't exist
          if (consecutiveNotFoundErrors > MAX_NOT_FOUND_RETRIES) {
            throw new Error(`Computer ${computerId} not found after ${MAX_NOT_FOUND_RETRIES} attempts - it may have failed to create`)
          }
          // Otherwise, continue waiting - it's likely just propagation delay
        } else {
          // Non "not found" error - log but continue trying
          console.warn(`[Orgo] Error checking computer ${computerId} status:`, errorMessage)
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, intervalMs))
    }
    
    // If we exited the loop with a recent "not found" error, throw it
    if (lastError && consecutiveNotFoundErrors > 0) {
      throw lastError
    }
    
    throw new Error('Computer did not become ready in time')
  }

  /**
   * Get the WebSocket terminal URL for a computer
   * Use this URL for interactive terminal sessions (full PTY interface)
   * 
   * @param computerId - The computer ID
   * @param cols - Number of columns (default: 80)
   * @param rows - Number of rows (default: 24)
   * @returns WebSocket URL for terminal connection
   * 
   * @example
   * const wsUrl = client.getTerminalWebSocketUrl('my-computer-id', 120, 40)
   * const ws = new WebSocket(wsUrl)
   * 
   * @see https://docs.orgo.ai/api-reference/computers/terminal
   */
  getTerminalWebSocketUrl(computerId: string, cols: number = 80, rows: number = 24): string {
    // WebSocket URL uses 'orgo-{uuid}' format as subdomain
    // Add 'orgo-' prefix if not already present
    const wsComputerId = computerId.startsWith('orgo-') 
      ? computerId 
      : `orgo-${computerId}`
    return `wss://${wsComputerId}.orgo.dev/terminal?cols=${cols}&rows=${rows}`
  }
}

/**
 * Sanitize a name to be cloud-provider safe
 * - Converts to lowercase
 * - Replaces spaces and underscores with hyphens
 * - Removes any non-alphanumeric characters (except hyphens)
 * - Removes consecutive hyphens
 * - Trims hyphens from start/end
 */
export function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\s_]+/g, '-')      // Replace spaces and underscores with hyphens
    .replace(/[^a-z0-9-]/g, '')   // Remove non-alphanumeric (except hyphens)
    .replace(/-+/g, '-')          // Remove consecutive hyphens
    .replace(/^-|-$/g, '')        // Trim hyphens from start/end
    .substring(0, 63)             // Limit length for cloud provider compatibility
}

