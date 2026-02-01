/**
 * E2B Sandbox Setup Scripts
 * Commands to configure E2B sandboxes with all required tools
 * E2B sandboxes are ephemeral by default, so we configure them on-demand
 */

import Sandbox from '@e2b/code-interpreter'
import { E2BClient } from './e2b'
import { AIProvider, getAIProvider, generateAuthProfiles, generateEnvExport, getDefaultModelConfig } from './ai-providers'

export interface SetupProgress {
  step: string
  message: string
  success: boolean
  output?: string
}

export class E2BVMSetup {
  private e2bClient: E2BClient
  private sandbox: Sandbox
  private sandboxId: string
  private onProgress?: (progress: SetupProgress) => void

  constructor(
    e2bClient: E2BClient,
    sandbox: Sandbox,
    sandboxId: string,
    onProgress?: (progress: SetupProgress) => void
  ) {
    this.e2bClient = e2bClient
    this.sandbox = sandbox
    this.sandboxId = sandboxId
    this.onProgress = onProgress
  }

  /**
   * Run a command in the sandbox
   */
  private async runCommand(
    command: string,
    step: string,
    retries: number = 2
  ): Promise<{ output: string; success: boolean }> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await this.sandbox.commands.run(command)
        const success = (result.exitCode ?? 0) === 0
        const output = (result.stdout || '') + (result.stderr || '')

        this.onProgress?.({
          step,
          message: success ? `Completed: ${step}` : `Failed: ${step}`,
          success,
          output,
        })

        return { output, success }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error')
        const message = lastError.message

        // If it's a connection error, wait and retry
        if (attempt < retries && (message.includes('timeout') || message.includes('connection'))) {
          const waitTime = (attempt + 1) * 2000
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
      return { publicKey: '', success: false }
    }

    // Remove existing key if it exists
    await this.runCommand(
      'rm -f ~/.ssh/id_ed25519 ~/.ssh/id_ed25519.pub',
      'Remove existing SSH key if present'
    )

    // Generate SSH key
    const keyGen = await this.runCommand(
      'ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N "" -C "e2b-sandbox"',
      'Generate SSH key'
    )

    if (!keyGen.success) {
      return { publicKey: '', success: false }
    }

    // Get public key
    const pubKey = await this.runCommand('cat ~/.ssh/id_ed25519.pub', 'Read public key')

    if (!pubKey.success || !pubKey.output.trim()) {
      return { publicKey: '', success: false }
    }

    return {
      publicKey: pubKey.output.trim(),
      success: true,
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
   */
  async cloneVaultRepo(sshUrl: string): Promise<boolean> {
    const result = await this.runCommand(
      `rm -rf ~/vault && git clone ${sshUrl} ~/vault`,
      'Clone vault repository'
    )
    return result.success
  }

  /**
   * Link the vault to Clawdbot's knowledge directory
   */
  async linkVaultToKnowledge(): Promise<boolean> {
    await this.runCommand('mkdir -p /home/user/clawd/knowledge', 'Create Clawdbot knowledge directory')

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
   * Install essential tools (E2B sandboxes come with Python pre-installed)
   */
  async installEssentials(): Promise<boolean> {
    this.onProgress?.({
      step: 'Install Essentials',
      message: 'Installing essential tools...',
      success: true,
    })

    // E2B sandboxes already have Python installed, just need a few extras
    const commands = [
      'pip install anthropic requests Pillow --quiet',
    ]

    for (const cmd of commands) {
      const result = await this.runCommand(cmd, 'Install tools')
      if (!result.success) {
        // Tools installation had issues
      }
    }

    // Verify installation
    const verify = await this.runCommand(
      'python3 -c "import anthropic; import PIL; print(\'Dependencies installed\')"',
      'Verify installation'
    )

    if (!verify.success) {
      this.onProgress?.({
        step: 'Install Essentials',
        message: 'Some tools may be missing, continuing...',
        success: true,
      })
    }

    return true
  }

  /**
   * Install NVM, Node.js 22, and Clawdbot
   */
  async installClawdbot(): Promise<{ success: boolean; version?: string }> {
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
      return { success: false }
    }

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
      return { success: false }
    }

    this.onProgress?.({
      step: 'Install Clawdbot',
      message: 'Installing Clawdbot (this may take a few minutes)...',
      success: true,
    })

    const clawdbotInstall = await this.runCommand(
      'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && npm install -g clawdbot@latest',
      'Install Clawdbot'
    )

    if (!clawdbotInstall.success) {
      return { success: false }
    }

    // Get installed version
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
   * Configure Clawdbot with Telegram and heartbeat
   */
  async setupClawdbotTelegram(options: {
    aiApiKey: string
    aiProvider?: AIProvider
    telegramBotToken: string
    telegramUserId?: string
    clawdbotVersion?: string
    heartbeatIntervalMinutes?: number
    userId?: string
    apiBaseUrl?: string
  }): Promise<boolean> {
    const {
      aiApiKey,
      aiProvider = 'anthropic',
      telegramBotToken,
      telegramUserId,
      clawdbotVersion = '2026.1.22',
      heartbeatIntervalMinutes = 30,
      userId,
      apiBaseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000',
    } = options
    
    const providerConfig = getAIProvider(aiProvider)

    // Create directories
    await this.runCommand('mkdir -p ~/.clawdbot /home/user/clawd/knowledge', 'Create Clawdbot directories')

    // Generate gateway token
    const tokenResult = await this.runCommand('openssl rand -hex 24 || head -c 48 /dev/urandom | xxd -p', 'Generate gateway token')
    const gatewayToken = tokenResult.output.trim() || 'fallback-token-' + Date.now()

    const allowFromJson = telegramUserId ? `"allowFrom": ["${telegramUserId}"],` : ''

    // Create CLAUDE.md for workspace
    const claudeMdContent = `# Clawdbot - E2B Sandbox AI Assistant

You are Clawdbot, an AI assistant running in an E2B sandbox environment.

Your workspace is at /home/user/clawd.

## Knowledge Directory Structure
- /home/user/clawd/knowledge/vault - The main GitHub vault repository
- /home/user/clawd/knowledge/* - Additional knowledge repositories

## E2B Sandbox Notes
- This is an ephemeral environment - data does not persist after timeout
- The sandbox has internet access for API calls
- Python and essential tools are pre-installed

## Behavior

**When receiving user messages:**
- Prioritize and execute user-requested tasks immediately
- Be helpful, proactive, and thorough

**During heartbeat (periodic check):**
1. Check /home/user/clawd/knowledge/vault for updates
2. Look for tasks.md, TODO.md, or any task lists in the vault
3. If you find actionable tasks, create a plan and begin execution
4. Report significant progress or findings to the user via chat
`

    await this.e2bClient.writeFile(this.sandbox, '/home/user/clawd/CLAUDE.md', claudeMdContent)

    // Generate auth profiles based on selected AI provider
    const authProfiles = generateAuthProfiles(aiProvider)
    const defaultModel = getDefaultModelConfig(aiProvider)

    // Create config JSON
    const configJson = `{
  "meta": {
    "lastTouchedVersion": "${clawdbotVersion}"
  },
  "auth": {
    "profiles": ${JSON.stringify(authProfiles, null, 6).replace(/^/gm, '    ').trim()}
  },
  "agents": {
    "defaults": {
      "model": "${defaultModel}",
      "workspace": "/home/user/clawd",
      "compaction": {
        "mode": "safeguard"
      },
      "maxConcurrent": 4,
      "heartbeat": {
        "every": "${heartbeatIntervalMinutes}m",
        "target": "last",
        "activeHours": { "start": "00:00", "end": "24:00" }
      }
    }
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
  }
}`

    await this.e2bClient.writeFile(this.sandbox, '/home/user/.clawdbot/clawdbot.json', configJson)

    // Create auth-profiles.json in the agent directory (ClawdBot looks here for API keys)
    const authProfilesJson = JSON.stringify(authProfiles, null, 2)
    await this.runCommand('mkdir -p ~/.clawdbot/agents/main/agent', 'Create agent directory')
    await this.e2bClient.writeFile(this.sandbox, '/home/user/.clawdbot/agents/main/agent/auth-profiles.json', authProfilesJson)

    // Set environment variables by writing to .bashrc (use correct env var for the AI provider)
    const bashrcAdditions = `
# Clawdbot configuration
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
${generateEnvExport(aiProvider, aiApiKey)}
export TELEGRAM_BOT_TOKEN='${telegramBotToken}'
export SAMANTHA_API_URL='${apiBaseUrl}'
export SAMANTHA_USER_ID='${userId || ''}'
export SAMANTHA_AI_PROVIDER='${aiProvider}'
`

    const currentBashrc = await this.e2bClient.readFile(this.sandbox, '/home/user/.bashrc').catch(() => '')
    await this.e2bClient.writeFile(this.sandbox, '/home/user/.bashrc', currentBashrc + bashrcAdditions)

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
  async startClawdbotGateway(aiApiKey: string, telegramBotToken: string, aiProvider: AIProvider = 'anthropic'): Promise<boolean> {
    const providerConfig = getAIProvider(aiProvider)
    
    // Generate the environment variable exports for the selected AI provider
    const envExportLines = generateEnvExport(aiProvider, aiApiKey)
    
    // Determine which env var to check for logging
    const envVarToCheck = aiProvider === 'kimi' ? 'OPENAI_API_KEY' : providerConfig.envVar
    
    // Create startup script with better error handling
    const startupScript = `#!/bin/bash
# Don't use set -e, we want to log errors

# Source bashrc to get environment
source ~/.bashrc 2>/dev/null || true

# Setup NVM
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# Set environment variables for AI provider
${envExportLines}
export TELEGRAM_BOT_TOKEN="${telegramBotToken}"

# Log startup
LOG_FILE="/tmp/clawdbot.log"
echo "[$(date +'%Y-%m-%d %H:%M:%S')] Starting Clawdbot gateway..." >> "$LOG_FILE"
echo "[$(date +'%Y-%m-%d %H:%M:%S')] AI Provider: ${aiProvider}" >> "$LOG_FILE"
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
if [ -n "$${envVarToCheck}" ]; then
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ${envVarToCheck}: SET" >> "$LOG_FILE"
else
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ${envVarToCheck}: NOT SET" >> "$LOG_FILE"
fi
if [ -n "$OPENAI_BASE_URL" ]; then
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] OPENAI_BASE_URL: $OPENAI_BASE_URL" >> "$LOG_FILE"
fi
if [ -n "$TELEGRAM_BOT_TOKEN" ]; then
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] TELEGRAM_BOT_TOKEN: SET" >> "$LOG_FILE"
else
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] TELEGRAM_BOT_TOKEN: NOT SET" >> "$LOG_FILE"
fi

# Check config file exists
if [ -f ~/.clawdbot/clawdbot.json ]; then
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] Config file exists" >> "$LOG_FILE"
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] Config contents:" >> "$LOG_FILE"
    cat ~/.clawdbot/clawdbot.json >> "$LOG_FILE"
else
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: Config file not found at ~/.clawdbot/clawdbot.json" >> "$LOG_FILE"
fi

# Run gateway and capture all output (both stdout and stderr)
clawdbot gateway run >> "$LOG_FILE" 2>&1
EXIT_CODE=$?
echo "[$(date +'%Y-%m-%d %H:%M:%S')] Gateway exited with code: $EXIT_CODE" >> "$LOG_FILE"
exit $EXIT_CODE
`

    await this.e2bClient.writeFile(this.sandbox, '/tmp/start-clawdbot.sh', startupScript)
    await this.runCommand('chmod +x /tmp/start-clawdbot.sh', 'Make startup script executable')

    // Kill any existing gateway
    await this.runCommand("pkill -f 'clawdbot gateway' 2>/dev/null || true", 'Kill existing gateway')
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Start gateway in background
    await this.runCommand(
      'nohup /tmp/start-clawdbot.sh >> /tmp/clawdbot.log 2>&1 &',
      'Start Clawdbot gateway'
    )

    await new Promise(resolve => setTimeout(resolve, 8000))

    // Check if running (with retries and port verification)
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
        }
      }
      
      // Wait before next check
      if (attempt < 4) {
        await new Promise(resolve => setTimeout(resolve, 5000))
      }
    }

    // If not running, check the log for errors
    if (!isRunning) {
      await this.runCommand(
        'tail -20 /tmp/clawdbot.log 2>/dev/null || echo "No log file"',
        'Check gateway logs'
      )
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
   * Set up Git sync service (background daemon since E2B doesn't have cron)
   */
  async setupGitSync(): Promise<boolean> {
    const syncScript = `#!/bin/bash
cd ~/vault
git fetch origin main
git reset --hard origin/main
`

    const daemonScript = `#!/bin/bash
LOG_FILE=~/vault-sync.log
while true; do
    ~/sync-vault.sh >> $LOG_FILE 2>&1
    sleep 60
done
`

    await this.e2bClient.writeFile(this.sandbox, '/home/user/sync-vault.sh', syncScript)
    await this.e2bClient.writeFile(this.sandbox, '/home/user/vault-sync-daemon.sh', daemonScript)

    await this.runCommand('chmod +x ~/sync-vault.sh ~/vault-sync-daemon.sh', 'Make sync scripts executable')

    // Start background daemon
    const startDaemon = await this.runCommand(
      'nohup ~/vault-sync-daemon.sh > /dev/null 2>&1 &',
      'Start vault sync daemon'
    )

    this.onProgress?.({
      step: 'Git Sync',
      message: 'Vault sync daemon started (syncs every minute)',
      success: startDaemon.success,
    })

    return startDaemon.success
  }

  /**
   * Store AI API key securely (supports multiple providers)
   */
  async storeAIApiKey(apiKey: string, aiProvider: AIProvider = 'anthropic'): Promise<boolean> {
    const envExport = generateEnvExport(aiProvider, apiKey)
    const result = await this.runCommand(
      `echo '${envExport}' >> ~/.bashrc`,
      `Store ${getAIProvider(aiProvider).displayName} API key`
    )
    return result.success
  }
  
  /**
   * @deprecated Use storeAIApiKey instead
   */
  async storeClaudeKey(apiKey: string): Promise<boolean> {
    return this.storeAIApiKey(apiKey, 'anthropic')
  }

  /**
   * Get the public SSH key from the sandbox
   */
  async getPublicKey(): Promise<string> {
    const result = await this.runCommand('cat ~/.ssh/id_ed25519.pub', 'Get public key')
    return result.output.trim()
  }

  /**
   * Extend sandbox timeout
   */
  async extendTimeout(timeoutMs: number): Promise<void> {
    await this.e2bClient.setTimeout(this.sandbox, timeoutMs)
    this.onProgress?.({
      step: 'Extend Timeout',
      message: `Sandbox timeout extended to ${Math.round(timeoutMs / 1000 / 60)} minutes`,
      success: true,
    })
  }
}
