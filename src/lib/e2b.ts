/**
 * E2B Sandbox Client
 * Handles sandbox provisioning and management on E2B
 * API Docs: https://e2b.dev/docs
 * 
 * E2B provides sandboxed cloud environments built for AI agents.
 * Each sandbox is an isolated environment with its own filesystem,
 * processes, and network.
 */

import Sandbox from '@e2b/code-interpreter'

export interface E2BSandbox {
  id: string
  templateId: string
  clientId: string
  alias?: string
  metadata?: Record<string, string>
  startedAt: Date
  endAt: Date
  status: 'running' | 'stopped' | 'error'
}

export interface E2BSandboxConfig {
  templateId?: string  // Default: 'base' - use custom templates for specific setups
  timeout?: number     // Sandbox timeout in seconds (default: 300)
  metadata?: Record<string, string>
  envVars?: Record<string, string>
}

export interface CommandResult {
  stdout: string
  stderr: string
  exitCode: number
}

export class E2BClient {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  /**
   * Validate E2B API key by creating and immediately closing a sandbox
   */
  async validateApiKey(): Promise<{ valid: boolean; error?: string }> {
    try {
      // Try to create a minimal sandbox to validate the API key
      const sandbox = await Sandbox.create({
        apiKey: this.apiKey,
        timeoutMs: 30000, // 30 second timeout for validation
      })
      
      // Close the sandbox immediately
      await sandbox.kill()
      
      return { valid: true }
    } catch (error: any) {
      if (error.message?.includes('401') || error.message?.includes('Unauthorized') || error.message?.includes('API key')) {
        return { valid: false, error: 'Invalid E2B API key' }
      }
      if (error.message?.includes('403') || error.message?.includes('Forbidden')) {
        return { valid: false, error: 'E2B API key does not have required permissions' }
      }
      return { valid: false, error: error.message || 'Failed to validate E2B API key' }
    }
  }

  /**
   * Create a new E2B sandbox
   */
  async createSandbox(config: E2BSandboxConfig = {}): Promise<{ sandbox: Sandbox; sandboxId: string }> {
    const sandbox = await Sandbox.create({
      apiKey: this.apiKey,
      timeoutMs: (config.timeout || 3600) * 1000, // Default 1 hour
      metadata: config.metadata,
      envs: config.envVars,
    })

    return {
      sandbox,
      sandboxId: sandbox.sandboxId,
    }
  }

  /**
   * Connect to an existing sandbox by ID
   */
  async connectToSandbox(sandboxId: string): Promise<Sandbox> {
    const sandbox = await Sandbox.connect(sandboxId, {
      apiKey: this.apiKey,
    })
    return sandbox
  }

  /**
   * Execute a shell command in the sandbox
   */
  async executeCommand(sandbox: Sandbox, command: string): Promise<CommandResult> {
    try {
      const result = await sandbox.commands.run(command)
      return {
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        exitCode: result.exitCode ?? 0,
      }
    } catch (error: any) {
      return {
        stdout: '',
        stderr: error.message || 'Command execution failed',
        exitCode: 1,
      }
    }
  }

  /**
   * Write a file to the sandbox
   */
  async writeFile(sandbox: Sandbox, path: string, content: string): Promise<void> {
    await sandbox.files.write(path, content)
  }

  /**
   * Read a file from the sandbox
   */
  async readFile(sandbox: Sandbox, path: string): Promise<string> {
    const content = await sandbox.files.read(path)
    return content
  }

  /**
   * List files in a directory
   */
  async listFiles(sandbox: Sandbox, path: string): Promise<string[]> {
    const files = await sandbox.files.list(path)
    return files.map(f => f.name)
  }

  /**
   * Kill/stop a sandbox
   */
  async killSandbox(sandbox: Sandbox): Promise<void> {
    await sandbox.kill()
  }

  /**
   * Set the sandbox timeout (extends lifetime)
   */
  async setTimeout(sandbox: Sandbox, timeoutMs: number): Promise<void> {
    await sandbox.setTimeout(timeoutMs)
  }

  /**
   * Check if a sandbox is running
   */
  async isRunning(sandboxId: string): Promise<boolean> {
    try {
      const sandbox = await this.connectToSandbox(sandboxId)
      await sandbox.commands.run('echo "alive"')
      return true
    } catch {
      return false
    }
  }

  /**
   * Get sandbox info by executing a simple command
   */
  async getSandboxInfo(sandboxId: string): Promise<E2BSandbox | null> {
    try {
      const sandbox = await this.connectToSandbox(sandboxId)
      
      // Get basic info by running commands
      const hostnameResult = await sandbox.commands.run('hostname')
      
      return {
        id: sandboxId,
        templateId: 'base',
        clientId: hostnameResult.stdout?.trim() || sandboxId,
        status: 'running',
        startedAt: new Date(),
        endAt: new Date(Date.now() + 3600000), // Approximate
      }
    } catch {
      return null
    }
  }
}

/**
 * E2B sandbox templates for different use cases
 * Users can create custom templates via E2B CLI: `e2b template build`
 */
export const E2B_TEMPLATES = [
  {
    id: 'base',
    name: 'Base',
    description: 'Default sandbox with Python 3 and basic tools',
    recommended: true,
  },
  {
    id: 'code-interpreter-stateful',
    name: 'Code Interpreter (Stateful)',
    description: 'Stateful Python environment with data science libraries',
  },
]

/**
 * E2B timeout/duration options
 */
export const E2B_TIMEOUT_OPTIONS = [
  { id: 300, name: '5 minutes', description: 'Short tasks' },
  { id: 1800, name: '30 minutes', description: 'Medium tasks' },
  { id: 3600, name: '1 hour', description: 'Long tasks', recommended: true },
  { id: 7200, name: '2 hours', description: 'Extended sessions' },
  { id: 21600, name: '6 hours', description: 'Very long sessions' },
  { id: 86400, name: '24 hours', description: 'Maximum duration' },
]

/**
 * Generate a random sandbox name
 */
export function generateSandboxName(): string {
  const adjectives = ['swift', 'bright', 'calm', 'bold', 'keen', 'wise', 'warm', 'cool']
  const nouns = ['sandbox', 'env', 'space', 'pod', 'box', 'zone', 'unit', 'cell']
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)]
  const noun = nouns[Math.floor(Math.random() * nouns.length)]
  const num = Math.floor(Math.random() * 1000)
  return `e2b-${adj}-${noun}-${num}`
}
