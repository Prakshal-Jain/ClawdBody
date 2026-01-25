/**
 * VM Setup Scripts
 * Commands to configure the Orgo VM with all required tools
 */

import { OrgoClient } from './orgo'

export interface SetupProgress {
  step: string
  message: string
  success: boolean
  output?: string
}

export class VMSetup {
  private orgo: OrgoClient
  private computerId: string
  private onProgress?: (progress: SetupProgress) => void

  constructor(
    orgo: OrgoClient,
    computerId: string,
    onProgress?: (progress: SetupProgress) => void
  ) {
    this.orgo = orgo
    this.computerId = computerId
    this.onProgress = onProgress
  }

  private async runCommand(command: string, step: string, retries: number = 2): Promise<{ output: string; success: boolean }> {
    let lastError: Error | null = null
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await this.orgo.bash(this.computerId, command)
        const success = result.exit_code === 0
        
        this.onProgress?.({
          step,
          message: success ? `Completed: ${step}` : `Failed: ${step}`,
          success,
          output: result.output,
        })

        return { output: result.output, success }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error')
        const message = lastError.message
        
        // If it's a 502 or connection error, wait and retry
        if (attempt < retries && (message.includes('502') || message.includes('Failed to execute') || message.includes('ECONNREFUSED'))) {
          const waitTime = (attempt + 1) * 2000 // Exponential backoff: 2s, 4s
          console.log(`Command failed (attempt ${attempt + 1}/${retries + 1}), retrying in ${waitTime}ms...`)
          await new Promise(resolve => setTimeout(resolve, waitTime))
          continue
        }
        
        this.onProgress?.({
          step,
          message: `Error: ${message}`,
          success: false,
        })
        return { output: message, success: false }
      }
    }
    
    // Should never reach here, but TypeScript needs it
    const message = lastError?.message || 'Unknown error'
    return { output: message, success: false }
  }

  /**
   * Generate SSH key pair for GitHub access
   */
  async generateSSHKey(): Promise<{ publicKey: string; success: boolean }> {
    // Ensure .ssh directory exists
    const mkdirResult = await this.runCommand(
      'mkdir -p ~/.ssh && chmod 700 ~/.ssh',
      'Create .ssh directory'
    )
    
    if (!mkdirResult.success) {
      console.error('Failed to create .ssh directory:', mkdirResult.output)
      return { publicKey: '', success: false }
    }

    // Verify ssh-keygen is available (openssh-client should be installed)
    const checkSshKeygen = await this.runCommand(
      'which ssh-keygen || command -v ssh-keygen',
      'Check ssh-keygen availability'
    )
    
    if (!checkSshKeygen.success || !checkSshKeygen.output.trim()) {
      // Try to install openssh-client if not found
      console.log('ssh-keygen not found, installing openssh-client...')
      const installSsh = await this.runCommand(
        'sudo apt-get update -qq && sudo apt-get install -y -qq openssh-client',
        'Install openssh-client'
      )
      
      if (!installSsh.success) {
        console.error('Failed to install openssh-client:', installSsh.output)
        return { publicKey: '', success: false }
      }
    }

    // Remove existing key if it exists (we want a fresh key)
    await this.runCommand(
      'rm -f ~/.ssh/id_ed25519 ~/.ssh/id_ed25519.pub',
      'Remove existing SSH key if present'
    )
    
    // Generate SSH key
    const keyGen = await this.runCommand(
      'ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N "" -C "samantha-vm"',
      'Generate SSH key'
    )
    
    if (!keyGen.success) {
      console.error('Failed to generate SSH key:', keyGen.output)
      return { publicKey: '', success: false }
    }

    // Get public key
    const pubKey = await this.runCommand('cat ~/.ssh/id_ed25519.pub', 'Read public key')
    
    if (!pubKey.success || !pubKey.output.trim()) {
      console.error('Failed to read public key:', pubKey.output)
      return { publicKey: '', success: false }
    }

    return { 
      publicKey: pubKey.output.trim(), 
      success: true 
    }
  }

  /**
   * Configure Git with user info
   */
  async configureGit(username: string, email: string): Promise<boolean> {
    const commands = [
      `git config --global user.name "${username}"`,
      `git config --global user.email "${email}"`,
      'git config --global init.defaultBranch main',
      // Add GitHub to known hosts
      'mkdir -p ~/.ssh && ssh-keyscan github.com >> ~/.ssh/known_hosts 2>/dev/null',
    ]

    for (const cmd of commands) {
      const result = await this.runCommand(cmd, 'Configure Git')
      if (!result.success) return false
    }

    return true
  }

  /**
   * Clone the vault repository
   * Note: Symlink to knowledge directory is created later after Clawdbot directories exist
   */
  async cloneVaultRepo(sshUrl: string): Promise<boolean> {
    // Clone vault repository to ~/vault
    const result = await this.runCommand(
      `rm -rf ~/vault && git clone ${sshUrl} ~/vault`,
      'Clone vault repository'
    )

    return result.success
  }

  /**
   * Link the vault to Clawdbot's knowledge directory
   * Should be called after Clawdbot directories are created
   */
  async linkVaultToKnowledge(): Promise<boolean> {
    // Ensure Clawdbot knowledge directory exists
    await this.runCommand(
      'mkdir -p /home/user/clawd/knowledge',
      'Create Clawdbot knowledge directory'
    )

    // Symlink vault to Clawdbot knowledge directory
    const linkResult = await this.runCommand(
      'ln -sf ~/vault /home/user/clawd/knowledge/vault',
      'Link vault to Clawdbot knowledge'
    )

    if (linkResult.success) {
      this.onProgress?.({
        step: 'Link vault',
        message: 'Vault linked to /home/user/clawd/knowledge/vault',
        success: true,
      })
    }

    return linkResult.success
  }

  /**
   * Clone additional repositories
   */
  async cloneRepositories(repos: Array<{ name: string; sshUrl: string }>): Promise<{ success: boolean; errors?: Array<{ repo: string; error: string }> }> {
    const errors: Array<{ repo: string; error: string }> = []
    const baseDir = '~/repositories'
    
    // Create repositories directory if it doesn't exist
    await this.runCommand(`mkdir -p ${baseDir}`, 'Create repositories directory')
    
    for (const repo of repos) {
      const repoPath = `${baseDir}/${repo.name}`
      
      // Remove if exists and clone
      const result = await this.runCommand(
        `rm -rf ${repoPath} && git clone ${repo.sshUrl} ${repoPath}`,
        `Clone repository: ${repo.name}`
      )
      
      if (!result.success) {
        errors.push({ repo: repo.name, error: result.output })
      }
    }
    
    return {
      success: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    }
  }

  /**
   * Set up knowledge directories for Clawdbot
   * Symlinks cloned repositories into the Clawdbot workspace for context
   */
  async setupClawdbotKnowledge(repoNames: string[]): Promise<boolean> {
    const workspaceDir = '/home/user/clawd'
    const reposDir = '~/repositories'

    // Ensure workspace exists
    await this.runCommand(`mkdir -p ${workspaceDir}/knowledge`, 'Create knowledge directory')

    for (const repoName of repoNames) {
      const result = await this.runCommand(
        `ln -sf ${reposDir}/${repoName} ${workspaceDir}/knowledge/${repoName}`,
        `Link ${repoName} to Clawdbot workspace`
      )

      if (!result.success) {
        console.warn(`Failed to link ${repoName}:`, result.output)
      }
    }

    this.onProgress?.({
      step: 'Knowledge Setup',
      message: `Linked ${repoNames.length} repositories to Clawdbot workspace`,
      success: true,
    })

    return true
  }

  /**
   * Wait for VM to be ready by testing a simple command
   */
  private async waitForVMReady(maxRetries: number = 10, delayMs: number = 3000): Promise<boolean> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const result = await this.orgo.bash(this.computerId, 'echo "ready"')
        if (result.exit_code === 0) {
          return true
        }
      } catch (error) {
        // VM not ready yet, continue waiting
      }
      
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    }
    return false
  }

  /**
   * Install Python, Git, SSH and other essential tools
   */
  async installPython(): Promise<boolean> {
    // Wait for VM to be ready first
    console.log('Waiting for VM to be ready...')
    const vmReady = await this.waitForVMReady(15, 5000) // 15 retries, 5 seconds apart = up to 75 seconds
    if (!vmReady) {
      console.error('VM did not become ready after waiting')
      return false
    }

    // Retry logic for installation commands
    const commands = [
      'apt-get update -qq',
      // Install python3, git, and openssh-client (provides ssh-keygen)
      'apt-get install -y -qq python3 python3-pip python3-venv git openssh-client procps',
    ]

    for (const cmd of commands) {
      let retries = 3
      let success = false
      
      while (retries > 0 && !success) {
        const result = await this.runCommand(`sudo ${cmd}`, 'Install Python')
        if (result.success) {
          success = true
        } else {
          retries--
          if (retries > 0) {
            console.log(`Command failed, retrying in 3 seconds... (${retries} retries left)`)
            await new Promise(resolve => setTimeout(resolve, 3000))
          }
        }
      }
      
      if (!success) {
        console.error(`Failed to execute: ${cmd}`)
        return false
      }
    }

    return true
  }

  /**
   * Install Anthropic Python SDK for AI capabilities
   * Note: We use Orgo's REST API directly (not Python SDK) to avoid bugs
   */
  async installOrgoPythonSDK(): Promise<boolean> {
    // Install anthropic SDK, Pillow (for image compression), and requests - we use Orgo REST API directly
    const result = await this.runCommand(
      'pip3 install anthropic langchain-anthropic requests Pillow --break-system-packages',
      'Install Anthropic SDK and dependencies'
    )
    
    if (!result.success) {
      console.warn(`Warning installing SDK: ${result.output}`)
    }

    // Verify installation
    const verify = await this.runCommand(
      'python3 -c "import anthropic; import PIL; print(\'Anthropic SDK and Pillow installed\')"',
      'Verify SDK installation'
    )

    if (!verify.success) {
      this.onProgress?.({
        step: 'Install SDKs',
        message: 'SDK installation had issues, continuing...',
        success: true,
      })
    }

    return true
  }

  /**
   * Install NVM, Node.js 22, and Clawdbot
   * Clawdbot is a chat gateway connecting messaging platforms to Claude AI
   * Docs: https://docs.clawd.bot/llms-full.txt
   */
  async installClawdbot(): Promise<{ success: boolean; version?: string }> {
    // Update system packages
    this.onProgress?.({
      step: 'Install Clawdbot',
      message: 'Updating system packages...',
      success: true,
    })

    await this.runCommand(
      'sudo apt-get update -qq',
      'Update system packages'
    )

    // Install dependencies (git, curl required for NVM)
    this.onProgress?.({
      step: 'Install Clawdbot',
      message: 'Installing dependencies...',
      success: true,
    })

    const depsInstall = await this.runCommand(
      'sudo apt-get install -y git curl',
      'Install git and curl'
    )

    if (!depsInstall.success) {
      console.error('Failed to install dependencies:', depsInstall.output)
      return { success: false }
    }

    // Install NVM
    this.onProgress?.({
      step: 'Install Clawdbot',
      message: 'Installing NVM...',
      success: true,
    })

    const nvmInstall = await this.runCommand(
      'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash',
      'Install NVM'
    )

    if (!nvmInstall.success) {
      console.error('Failed to install NVM:', nvmInstall.output)
      return { success: false }
    }

    // Install Node.js 22
    this.onProgress?.({
      step: 'Install Clawdbot',
      message: 'Installing Node.js 22...',
      success: true,
    })

    const nodeInstall = await this.runCommand(
      'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm install 22 && nvm alias default 22',
      'Install Node.js 22'
    )

    if (!nodeInstall.success) {
      console.error('Failed to install Node.js:', nodeInstall.output)
      return { success: false }
    }

    // Verify Node.js
    const nodeVersion = await this.runCommand(
      'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && node -v',
      'Verify Node.js'
    )

    this.onProgress?.({
      step: 'Install Clawdbot',
      message: `Node.js installed: ${nodeVersion.output.trim()}`,
      success: true,
    })

    // Install Clawdbot globally (run in background due to Orgo API timeout)
    this.onProgress?.({
      step: 'Install Clawdbot',
      message: 'Installing Clawdbot (this may take a few minutes)...',
      success: true,
    })

    // Create install script that runs in background
    const installScript = `#!/bin/bash
set -e
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
echo "Starting Clawdbot installation..." > /tmp/clawdbot-install.log
npm install -g clawdbot@latest >> /tmp/clawdbot-install.log 2>&1
echo "INSTALL_COMPLETE" >> /tmp/clawdbot-install.log
`

    // Write and execute install script in background
    const scriptB64 = Buffer.from(installScript).toString('base64')
    await this.runCommand(
      `echo '${scriptB64}' | base64 -d > /tmp/install-clawdbot.sh && chmod +x /tmp/install-clawdbot.sh`,
      'Create Clawdbot install script'
    )

    await this.runCommand(
      'nohup /tmp/install-clawdbot.sh > /tmp/clawdbot-install-out.log 2>&1 &',
      'Start Clawdbot installation (background)'
    )

    // Poll for completion (check every 10 seconds, up to 10 minutes)
    const maxAttempts = 60
    const intervalMs = 10000

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, intervalMs))

      // Check if install completed
      const checkResult = await this.runCommand(
        'grep -q "INSTALL_COMPLETE" /tmp/clawdbot-install.log 2>/dev/null && echo "DONE" || echo "PENDING"',
        'Check Clawdbot installation progress'
      )

      if (checkResult.output.trim() === 'DONE') {
        break
      }

      this.onProgress?.({
        step: 'Install Clawdbot',
        message: `Installing Clawdbot... (${i + 1}/${maxAttempts})`,
        success: true,
      })

      if (i === maxAttempts - 1) {
        // Check if npm is still running before giving up
        const npmRunning = await this.runCommand(
          'pgrep -f "npm install" > /dev/null && echo "RUNNING" || echo "NOT_RUNNING"',
          'Check if npm is still running'
        )

        if (npmRunning.output.includes('RUNNING')) {
          // npm is still running, give it more time (another 5 minutes)
          console.log('npm still running, extending timeout...')
          this.onProgress?.({
            step: 'Install Clawdbot',
            message: 'npm still installing, extending timeout...',
            success: true,
          })

          // Wait another 30 attempts (5 more minutes)
          for (let j = 0; j < 30; j++) {
            await new Promise(resolve => setTimeout(resolve, intervalMs))

            const extendedCheck = await this.runCommand(
              'grep -q "INSTALL_COMPLETE" /tmp/clawdbot-install.log 2>/dev/null && echo "DONE" || echo "PENDING"',
              'Check Clawdbot installation progress (extended)'
            )

            if (extendedCheck.output.trim() === 'DONE') {
              break
            }

            if (j === 29) {
              const logResult = await this.runCommand(
                'tail -30 /tmp/clawdbot-install.log',
                'Get Clawdbot install log'
              )
              console.error('Clawdbot installation timed out (extended). Last log:', logResult.output)
              return { success: false }
            }
          }
        } else {
          // npm is not running, check log for errors
          const logResult = await this.runCommand(
            'tail -30 /tmp/clawdbot-install.log',
            'Get Clawdbot install log'
          )
          console.error('Clawdbot installation timed out. Last log:', logResult.output)
          return { success: false }
        }
      }
    }

    // Verify Clawdbot installation by checking if binary exists
    const verifyResult = await this.runCommand(
      'ls ~/.nvm/versions/node/*/bin/clawdbot 2>/dev/null | head -1',
      'Verify Clawdbot'
    )

    if (!verifyResult.success || !verifyResult.output.trim() || verifyResult.output.includes('No such file')) {
      console.error('Clawdbot binary not found')
      // Show install log for debugging
      const logResult = await this.runCommand(
        'cat /tmp/clawdbot-install.log',
        'Get Clawdbot install log'
      )
      console.error('Install log:', logResult.output)
      return { success: false }
    }

    // Get installed version for config
    const versionResult = await this.runCommand(
      'cat ~/.nvm/versions/node/*/lib/node_modules/clawdbot/package.json 2>/dev/null | grep -o \'"version": "[^"]*"\' | head -1 | cut -d\'"\' -f4',
      'Get Clawdbot version'
    )

    const version = versionResult.output.trim() || '2026.1.22'

    this.onProgress?.({
      step: 'Install Clawdbot',
      message: `Clawdbot ${version} installed successfully`,
      success: true,
    })

    return { success: true, version }
  }

  /**
   * Configure Clawdbot with Telegram channel and autonomous task execution
   * Sets up heartbeat for periodic knowledge checks and task inference
   *
   * Note: System prompt is configured via CLAUDE.md file in workspace, not config
   * Heartbeat config goes under agents.defaults.heartbeat (not root level)
   */
  async setupClawdbotTelegram(options: {
    claudeApiKey: string
    telegramBotToken: string
    telegramUserId?: string
    clawdbotVersion?: string
    heartbeatIntervalMinutes?: number
  }): Promise<boolean> {
    const {
      claudeApiKey,
      telegramBotToken,
      telegramUserId,
      clawdbotVersion = '2026.1.22',
      heartbeatIntervalMinutes = 30
    } = options

    // Create directories
    await this.runCommand('mkdir -p ~/.clawdbot /home/user/clawd/knowledge', 'Create Clawdbot directories')

    // Generate gateway token
    const tokenResult = await this.runCommand(
      'openssl rand -hex 24',
      'Generate gateway token'
    )
    const gatewayToken = tokenResult.output.trim() || 'fallback-token-' + Date.now()

    // Build Telegram allowFrom config
    const allowFromJson = telegramUserId ? `"allowFrom": ["${telegramUserId}"],` : ''

    // Create CLAUDE.md file in workspace for system prompt (Clawdbot reads this automatically)
    const claudeMdContent = `# Samantha - Autonomous AI Assistant

You are Samantha, an autonomous AI assistant with access to a knowledge repository.

Your workspace is at /home/user/clawd.

## Knowledge Directory Structure
- /home/user/clawd/knowledge/vault - The main GitHub vault repository (auto-synced every minute)
- /home/user/clawd/knowledge/* - Additional knowledge repositories

The vault contains your primary knowledge base including tasks, notes, projects, and context about what needs to be done.

## Behavior

**When receiving user messages:**
- Prioritize and execute user-requested tasks immediately
- Be helpful, proactive, and thorough

**During heartbeat (periodic check):**
1. Check /home/user/clawd/knowledge/vault for updates (look at recently modified files)
2. Look for tasks.md, TODO.md, or any task lists in the vault
3. Review the overall state of projects and identify work that needs to be done
4. If you find actionable tasks, create a plan and begin execution
5. If no tasks are found, analyze the knowledge to proactively suggest improvements or identify opportunities
6. Report significant progress or findings to the user via chat

**Task Prioritization:**
1. Explicit user requests (highest priority)
2. Tasks marked as urgent/P0/P1 in task files
3. Inferred tasks from knowledge analysis
4. Proactive improvements and suggestions

Always keep the user informed of what you're working on and any significant decisions.
`

    // Write CLAUDE.md to workspace
    const claudeMdB64 = Buffer.from(claudeMdContent).toString('base64')
    await this.runCommand(
      `echo '${claudeMdB64}' | base64 -d > /home/user/clawd/CLAUDE.md`,
      'Create CLAUDE.md system prompt'
    )

    // Create HEARTBEAT.md checklist for heartbeat runs
    const heartbeatMdContent = `# Heartbeat Checklist

During heartbeat, check the following:

1. **Recent vault changes**: \`find /home/user/clawd/knowledge/vault -type f -mmin -60\`
2. **Task files**: Look for tasks.md, TODO.md, or task lists in the vault
3. **Pending work**: Identify any work that needs to be done

## Response Format

- If nothing needs attention: Reply with \`HEARTBEAT_OK\`
- If tasks found: Describe what you're working on and begin execution
- If significant updates: Report findings to the user
`

    const heartbeatMdB64 = Buffer.from(heartbeatMdContent).toString('base64')
    await this.runCommand(
      `echo '${heartbeatMdB64}' | base64 -d > /home/user/clawd/HEARTBEAT.md`,
      'Create HEARTBEAT.md checklist'
    )

    // Create config JSON with heartbeat under agents.defaults (correct location)
    const configJson = `{
  "meta": {
    "lastTouchedVersion": "${clawdbotVersion}"
  },
  "auth": {
    "profiles": {
      "anthropic:default": {
        "provider": "anthropic",
        "mode": "api_key"
      }
    }
  },
  "agents": {
    "defaults": {
      "workspace": "/home/user/clawd",
      "compaction": {
        "mode": "safeguard"
      },
      "maxConcurrent": 4,
      "subagents": {
        "maxConcurrent": 8
      },
      "heartbeat": {
        "every": "${heartbeatIntervalMinutes}m",
        "target": "last",
        "activeHours": { "start": "00:00", "end": "24:00" },
        "includeReasoning": true
      }
    }
  },
  "messages": {
    "ackReactionScope": "group-mentions"
  },
  "commands": {
    "native": "auto",
    "nativeSkills": "auto"
  },
  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "${telegramBotToken}",
      "dmPolicy": "allowlist",
      ${allowFromJson}
      "groupPolicy": "allowlist"
    }
  },
  "gateway": {
    "port": 18789,
    "mode": "local",
    "bind": "loopback",
    "auth": {
      "mode": "token",
      "token": "${gatewayToken}"
    }
  },
  "plugins": {
    "entries": {
      "telegram": {"enabled": true}
    }
  }
}`

    // Write config using base64 to avoid escaping issues
    const configB64 = Buffer.from(configJson).toString('base64')
    const writeConfig = await this.runCommand(
      `echo '${configB64}' | base64 -d > ~/.clawdbot/clawdbot.json`,
      'Write Clawdbot config'
    )

    if (!writeConfig.success) {
      console.error('Failed to write Clawdbot config:', writeConfig.output)
      return false
    }

    // Add environment variables to bashrc
    const bashrcAdditions = `
# Clawdbot configuration
export NVM_DIR="\\$HOME/.nvm"
[ -s "\\$NVM_DIR/nvm.sh" ] && . "\\$NVM_DIR/nvm.sh"
export ANTHROPIC_API_KEY='${claudeApiKey}'
export TELEGRAM_BOT_TOKEN='${telegramBotToken}'
`

    await this.runCommand(
      `cat >> ~/.bashrc << 'BASHEOF'
${bashrcAdditions}
BASHEOF`,
      'Configure environment'
    )

    this.onProgress?.({
      step: 'Setup Clawdbot',
      message: 'Clawdbot configured with Telegram',
      success: true,
    })

    return true
  }

  /**
   * Start the Clawdbot gateway as a background process
   */
  async startClawdbotGateway(claudeApiKey: string, telegramBotToken: string): Promise<boolean> {
    // Create startup script with better error handling
    const startupScript = `#!/bin/bash
# Don't use set -e, we want to log errors

# Source bashrc to get environment
source ~/.bashrc 2>/dev/null || true

# Setup NVM
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# Set environment variables
export ANTHROPIC_API_KEY="${claudeApiKey}"
export TELEGRAM_BOT_TOKEN="${telegramBotToken}"

# Log startup
LOG_FILE="/tmp/clawdbot.log"
echo "[$(date +'%Y-%m-%d %H:%M:%S')] Starting Clawdbot gateway..." >> "$LOG_FILE"
echo "[$(date +'%Y-%m-%d %H:%M:%S')] NVM_DIR: $NVM_DIR" >> "$LOG_FILE"
echo "[$(date +'%Y-%m-%d %H:%M:%S')] Node version: $(node -v 2>&1 || echo 'node not found')" >> "$LOG_FILE"
echo "[$(date +'%Y-%m-%d %H:%M:%S')] PATH: $PATH" >> "$LOG_FILE"

# Check if clawdbot is available
if ! command -v clawdbot &> /dev/null; then
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: clawdbot command not found" >> "$LOG_FILE"
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] Checking NVM..." >> "$LOG_FILE"
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] Node path: $(which node || echo 'node not in PATH')" >> "$LOG_FILE"
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] Clawdbot path: $(find ~/.nvm -name clawdbot 2>/dev/null | head -1 || echo 'clawdbot not found')" >> "$LOG_FILE"
    exit 1
fi

echo "[$(date +'%Y-%m-%d %H:%M:%S')] Clawdbot found: $(which clawdbot)" >> "$LOG_FILE"
echo "[$(date +'%Y-%m-%d %H:%M:%S')] Running: clawdbot gateway run" >> "$LOG_FILE"
if [ -n "$ANTHROPIC_API_KEY" ]; then
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ANTHROPIC_API_KEY: SET" >> "$LOG_FILE"
else
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ANTHROPIC_API_KEY: NOT SET" >> "$LOG_FILE"
fi
if [ -n "$TELEGRAM_BOT_TOKEN" ]; then
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] TELEGRAM_BOT_TOKEN: SET" >> "$LOG_FILE"
else
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] TELEGRAM_BOT_TOKEN: NOT SET" >> "$LOG_FILE"
fi

# Check config file exists
if [ -f ~/.clawdbot/clawdbot.json ]; then
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] Config file exists" >> "$LOG_FILE"
else
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: Config file not found at ~/.clawdbot/clawdbot.json" >> "$LOG_FILE"
fi

# Run gateway and capture all output (both stdout and stderr)
# Don't use exec - let the shell stay alive to capture errors
clawdbot gateway run >> "$LOG_FILE" 2>&1
EXIT_CODE=$?
echo "[$(date +'%Y-%m-%d %H:%M:%S')] Gateway exited with code: $EXIT_CODE" >> "$LOG_FILE"
exit $EXIT_CODE
`

    const scriptB64 = Buffer.from(startupScript).toString('base64')

    await this.runCommand(
      `echo '${scriptB64}' | base64 -d > /tmp/start-clawdbot.sh && chmod +x /tmp/start-clawdbot.sh`,
      'Create Clawdbot startup script'
    )

    // Kill any existing gateway process first (ignore errors if none exists)
    try {
      await this.runCommand(
        "pkill -f 'clawdbot gateway' 2>/dev/null || true",
        'Kill existing gateway process'
      )
    } catch (error) {
      // Ignore errors - process might not exist
      console.log('No existing gateway process to kill')
    }

    // Wait a moment for process to die
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Start gateway in background
    const startResult = await this.runCommand(
      'nohup /tmp/start-clawdbot.sh >> /tmp/clawdbot.log 2>&1 & echo $!',
      'Start Clawdbot gateway'
    )

    // Wait a moment for startup
    await new Promise(resolve => setTimeout(resolve, 8000))

    // Check if gateway is running (with retries and port verification)
    let isRunning = false
    for (let attempt = 0; attempt < 5; attempt++) {
      // Check if process exists
      const processCheck = await this.runCommand(
        "pgrep -f 'clawdbot gateway' > /dev/null && echo 'PROCESS_EXISTS' || echo 'NO_PROCESS'",
        'Check gateway process'
      )

      const hasProcess = processCheck.output.includes('PROCESS_EXISTS')
      
      if (hasProcess) {
        // Also verify port is listening (more reliable check)
        const portCheck = await this.runCommand(
          "netstat -tlnp 2>/dev/null | grep 18789 > /dev/null || ss -tlnp 2>/dev/null | grep 18789 > /dev/null && echo 'PORT_LISTENING' || echo 'PORT_NOT_LISTENING'",
          'Check gateway port'
        )
        
        if (portCheck.output.includes('PORT_LISTENING')) {
          isRunning = true
          break
        } else {
          // Process exists but port not listening yet - wait longer
          console.log(`Gateway process exists but port not listening yet (attempt ${attempt + 1}/5)`)
        }
      }
      
      // Wait before next check
      if (attempt < 4) {
        await new Promise(resolve => setTimeout(resolve, 5000))
      }
    }

    // If not running, check the log for errors
    if (!isRunning) {
      const logCheck = await this.runCommand(
        'tail -20 /tmp/clawdbot.log 2>/dev/null || echo "No log file"',
        'Check gateway logs'
      )
      console.log('Gateway startup log:', logCheck.output)
    }

    this.onProgress?.({
      step: 'Start Gateway',
      message: isRunning 
        ? 'Clawdbot gateway is running' 
        : 'Gateway failed to start. Check /tmp/clawdbot.log for errors.',
      success: isRunning,
    })

    return isRunning
  }

  /**
   * Set up Git sync service
   * Automatically pulls changes from GitHub periodically
   * Uses cron or background process (systemd not available on Orgo VMs)
   */
  async setupGitSync(): Promise<boolean> {
    // Create sync script that pulls from GitHub
    const syncScript = `#!/bin/bash
cd ~/vault
git fetch origin main
git reset --hard origin/main
`
    
    const createScript = await this.runCommand(
      `cat > ~/sync-vault.sh << 'EOF'
${syncScript}
EOF
chmod +x ~/sync-vault.sh`,
      'Create sync script'
    )

    if (!createScript.success) return false

    // Create a background sync daemon script
    const daemonScript = `#!/bin/bash
# Vault sync daemon - runs every 60 seconds
LOG_FILE=~/vault-sync.log

echo "[$(date)] Vault sync daemon starting..." >> $LOG_FILE

while true; do
    ~/sync-vault.sh >> $LOG_FILE 2>&1
    echo "[$(date)] Sync completed" >> $LOG_FILE
    sleep 60
done
`

    const createDaemon = await this.runCommand(
      `cat > ~/vault-sync-daemon.sh << 'EOF'
${daemonScript}
EOF
chmod +x ~/vault-sync-daemon.sh`,
      'Create sync daemon script'
    )

    if (!createDaemon.success) return false

    // Try cron first (preferred)
    const cronResult = await this.runCommand(
      '(crontab -l 2>/dev/null | grep -v "sync-vault.sh"; echo "* * * * * /root/sync-vault.sh >> /root/vault-sync.log 2>&1") | crontab -',
      'Setup cron job for vault sync'
    )

    if (cronResult.success) {
      this.onProgress?.({
        step: 'Git Sync',
        message: 'Vault sync configured via cron (every 1 minute)',
        success: true,
      })
      return true
    }

    // Fallback: start background daemon
    this.onProgress?.({
      step: 'Git Sync',
      message: 'Cron not available, starting background sync daemon',
      success: true,
    })

    const startDaemon = await this.runCommand(
      'nohup ~/vault-sync-daemon.sh > /dev/null 2>&1 &',
      'Start vault sync daemon'
    )

    return startDaemon.success
  }

  /**
   * Store Claude API key securely
   */
  async storeClaudeKey(apiKey: string): Promise<boolean> {
    const result = await this.runCommand(
      `echo 'export ANTHROPIC_API_KEY="${apiKey}"' >> ~/.bashrc`,
      'Store Claude API key'
    )
    return result.success
  }

  /**
   * Run full setup sequence
   */
  async runFullSetup(options: {
    githubUsername: string
    githubEmail: string
    repoSshUrl: string
    claudeApiKey: string
    orgoApiKey: string
    computerId: string
    telegramBotToken?: string
    telegramUserId?: string
    knowledgeRepos?: Array<{ name: string; sshUrl: string }>
    heartbeatIntervalMinutes?: number  // Default: 30 minutes
  }): Promise<{ success: boolean; error?: string }> {
    try {
      // 1. Install Python
      this.onProgress?.({ step: 'python', message: 'Installing Python...', success: true })
      const pythonOk = await this.installPython()
      if (!pythonOk) throw new Error('Failed to install Python')

      // 2. Install Orgo and Anthropic SDKs
      this.onProgress?.({ step: 'sdk', message: 'Installing AI SDKs...', success: true })
      const sdkOk = await this.installOrgoPythonSDK()
      if (!sdkOk) console.warn('SDK installation had issues, continuing...')

      // 3. Generate SSH key
      this.onProgress?.({ step: 'ssh', message: 'Generating SSH key...', success: true })
      const { publicKey, success: sshOk } = await this.generateSSHKey()
      if (!sshOk) throw new Error('Failed to generate SSH key')

      // 4. Configure Git
      this.onProgress?.({ step: 'git', message: 'Configuring Git...', success: true })
      const gitOk = await this.configureGit(options.githubUsername, options.githubEmail)
      if (!gitOk) throw new Error('Failed to configure Git')

      // 5. Clone vault (this will need the deploy key to be added first)
      // The calling code should add the deploy key before calling clone
      this.onProgress?.({ step: 'clone', message: 'Cloning vault repository...', success: true })
      const cloneOk = await this.cloneVaultRepo(options.repoSshUrl)
      if (!cloneOk) throw new Error('Failed to clone vault repository')

      // 6. Install Clawdbot (NVM + Node.js 22 + Clawdbot)
      this.onProgress?.({ step: 'clawdbot', message: 'Installing Clawdbot...', success: true })
      const clawdbotResult = await this.installClawdbot()
      if (!clawdbotResult.success) throw new Error('Failed to install Clawdbot')

      // 7. Link vault to Clawdbot knowledge directory (now that directories can be created)
      this.onProgress?.({ step: 'link-vault', message: 'Linking vault to Clawdbot knowledge...', success: true })
      const linkOk = await this.linkVaultToKnowledge()
      if (!linkOk) throw new Error('Failed to link vault to knowledge directory')

      // 8. Set up Git sync
      this.onProgress?.({ step: 'sync', message: 'Setting up Git sync...', success: true })
      const syncOk = await this.setupGitSync()
      if (!syncOk) throw new Error('Failed to set up Git sync')

      // 9. Clone additional knowledge repositories for Clawdbot context
      if (options.knowledgeRepos && options.knowledgeRepos.length > 0) {
        this.onProgress?.({ step: 'knowledge', message: 'Cloning knowledge repositories...', success: true })
        const repoResult = await this.cloneRepositories(options.knowledgeRepos)
        if (!repoResult.success) {
          console.warn('Some knowledge repos failed to clone:', repoResult.errors)
        }

        // Link cloned repos to Clawdbot workspace
        const repoNames = options.knowledgeRepos.map(r => r.name)
        await this.setupClawdbotKnowledge(repoNames)
      }

      // 10. Configure Clawdbot with Telegram and heartbeat (if token provided)
      if (options.telegramBotToken) {
        this.onProgress?.({ step: 'telegram', message: 'Configuring Telegram connector with autonomous heartbeat...', success: true })
        const telegramOk = await this.setupClawdbotTelegram({
          claudeApiKey: options.claudeApiKey,
          telegramBotToken: options.telegramBotToken,
          telegramUserId: options.telegramUserId,
          clawdbotVersion: clawdbotResult.version,
          heartbeatIntervalMinutes: options.heartbeatIntervalMinutes,
        })
        if (!telegramOk) throw new Error('Failed to configure Telegram')

        // 11. Start the Clawdbot gateway
        this.onProgress?.({ step: 'gateway', message: 'Starting Clawdbot gateway...', success: true })
        const gatewayOk = await this.startClawdbotGateway(
          options.claudeApiKey,
          options.telegramBotToken
        )
        if (!gatewayOk) console.warn('Gateway may still be starting, check /tmp/clawdbot.log')
      } else {
        // Just store Claude API key if no Telegram
        this.onProgress?.({ step: 'claude', message: 'Storing Claude API key...', success: true })
        const claudeOk = await this.storeClaudeKey(options.claudeApiKey)
        if (!claudeOk) throw new Error('Failed to store Claude API key')
      }

      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message }
    }
  }

  /**
   * Get the public SSH key from the VM
   */
  async getPublicKey(): Promise<string> {
    const result = await this.runCommand('cat ~/.ssh/id_ed25519.pub', 'Get public key')
    return result.output.trim()
  }
}


