/**
 * Terminal Session Manager
 * 
 * Manages terminal sessions across different providers.
 * Sessions are identified by a unique session ID and can be
 * retrieved, closed, or listed.
 */

import type { 
  ITerminalProvider, 
  ITerminalSessionManager, 
  TerminalConfig, 
  SSHConfig 
} from './types'
import { SSHTerminalProvider } from './ssh-terminal'

class TerminalSessionManager implements ITerminalSessionManager {
  private sessions: Map<string, ITerminalProvider> = new Map()
  private sessionTimeouts: Map<string, NodeJS.Timeout> = new Map()
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000 // 30 minutes

  /**
   * Add an existing provider to the session manager
   */
  addSession(sessionId: string, provider: ITerminalProvider): void {
    // Close existing session if any
    if (this.sessions.has(sessionId)) {
      const existing = this.sessions.get(sessionId)
      existing?.disconnect()
    }
    
    this.sessions.set(sessionId, provider)
    this.resetSessionTimeout(sessionId)
    console.log(`[Session Manager] Added session ${sessionId}`)
  }

  async createSession(config: TerminalConfig | SSHConfig): Promise<string> {
    const sessionId = config.sessionId

    // Close existing session if any
    if (this.sessions.has(sessionId)) {
      await this.closeSession(sessionId)
    }

    let provider: ITerminalProvider

    switch (config.provider) {
      case 'aws':
      case 'orgo':
        // Both AWS and Orgo use SSH
        provider = new SSHTerminalProvider(config as SSHConfig)
        break
      default:
        throw new Error(`Unsupported terminal provider: ${config.provider}`)
    }

    // Connect to the provider
    const connected = await provider.connect()
    if (!connected) {
      throw new Error(`Failed to connect to ${config.provider} terminal`)
    }

    this.sessions.set(sessionId, provider)

    // Set session timeout
    this.resetSessionTimeout(sessionId)

    console.log(`[Session Manager] Created session ${sessionId} for provider ${config.provider}`)
    return sessionId
  }

  getSession(sessionId: string): ITerminalProvider | undefined {
    const session = this.sessions.get(sessionId)
    if (session) {
      // Reset timeout on access
      this.resetSessionTimeout(sessionId)
    }
    return session
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (session) {
      await session.disconnect()
      this.sessions.delete(sessionId)
      
      // Clear timeout
      const timeout = this.sessionTimeouts.get(sessionId)
      if (timeout) {
        clearTimeout(timeout)
        this.sessionTimeouts.delete(sessionId)
      }

      console.log(`[Session Manager] Closed session ${sessionId}`)
    }
  }

  async closeAllSessions(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys())
    await Promise.all(sessionIds.map((id) => this.closeSession(id)))
  }

  listSessions(): string[] {
    return Array.from(this.sessions.keys())
  }

  /**
   * Clean up all sessions for a specific user
   * Session IDs are formatted as `{userId}-{timestamp}`
   */
  cleanupUserSessions(userId: string): void {
    const sessionIds = Array.from(this.sessions.keys())
    const userSessions = sessionIds.filter(id => id.startsWith(`${userId}-`))
    
    for (const sessionId of userSessions) {
      console.log(`[Session Manager] Cleaning up stale session ${sessionId} for user ${userId}`)
      this.closeSession(sessionId).catch(err => {
        console.error(`[Session Manager] Error cleaning up session ${sessionId}:`, err)
      })
    }
  }

  private resetSessionTimeout(sessionId: string): void {
    // Clear existing timeout
    const existingTimeout = this.sessionTimeouts.get(sessionId)
    if (existingTimeout) {
      clearTimeout(existingTimeout)
    }

    // Set new timeout
    const timeout = setTimeout(async () => {
      console.log(`[Session Manager] Session ${sessionId} timed out`)
      await this.closeSession(sessionId)
    }, this.SESSION_TIMEOUT)

    this.sessionTimeouts.set(sessionId, timeout)
  }
}

// Singleton instance
let sessionManager: TerminalSessionManager | null = null

export function getSessionManager(): TerminalSessionManager {
  if (!sessionManager) {
    sessionManager = new TerminalSessionManager()
  }
  return sessionManager
}

export { TerminalSessionManager }
