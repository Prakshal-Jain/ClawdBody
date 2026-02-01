/**
 * AI Provider Configuration
 * 
 * Supports multiple AI providers for ClawdBot:
 * - Anthropic (Claude)
 * - OpenAI (GPT-4, GPT-4o)
 * - Kimi/Moonshot (Kimi K2)
 */

export type AIProvider = 'anthropic' | 'openai' | 'kimi'

export interface AIProviderConfig {
  id: AIProvider
  name: string
  displayName: string
  envVar: string
  apiKeyPrefix: string
  apiKeyPlaceholder: string
  getApiKeyUrl: string
  defaultModel: string
  models: AIModel[]
  baseUrl?: string
}

export interface AIModel {
  id: string
  name: string
  description: string
  contextLength: string
  recommended?: boolean
}

export const AI_PROVIDERS: Record<AIProvider, AIProviderConfig> = {
  anthropic: {
    id: 'anthropic',
    name: 'anthropic',
    displayName: 'Anthropic',
    envVar: 'ANTHROPIC_API_KEY',
    apiKeyPrefix: 'sk-ant-',
    apiKeyPlaceholder: 'sk-ant-api03-...',
    getApiKeyUrl: 'https://console.anthropic.com/settings/keys',
    defaultModel: 'claude-sonnet-4-20250514',
    models: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', description: 'Latest balanced model', contextLength: '200k', recommended: true },
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', description: 'Most capable model', contextLength: '200k' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', description: 'Previous generation', contextLength: '200k' },
    ],
  },
  openai: {
    id: 'openai',
    name: 'openai',
    displayName: 'OpenAI',
    envVar: 'OPENAI_API_KEY',
    apiKeyPrefix: 'sk-',
    apiKeyPlaceholder: 'sk-proj-...',
    getApiKeyUrl: 'https://platform.openai.com/api-keys',
    defaultModel: 'gpt-4o',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', description: 'Latest multimodal model', contextLength: '128k', recommended: true },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Fast and affordable', contextLength: '128k' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Previous generation', contextLength: '128k' },
      { id: 'o1', name: 'o1', description: 'Reasoning model', contextLength: '200k' },
      { id: 'o1-mini', name: 'o1-mini', description: 'Fast reasoning model', contextLength: '128k' },
    ],
  },
  kimi: {
    id: 'kimi',
    name: 'kimi',
    displayName: 'Kimi (Moonshot)',
    envVar: 'MOONSHOT_API_KEY',
    apiKeyPrefix: '',
    apiKeyPlaceholder: 'sk-...',
    getApiKeyUrl: 'https://platform.moonshot.ai/console/api-keys',
    defaultModel: 'kimi-k2.5',
    baseUrl: 'https://api.moonshot.ai/v1',
    models: [
      { id: 'kimi-k2.5', name: 'Kimi K2.5', description: 'Multimodal, thinking & agent tasks', contextLength: '256k', recommended: true },
      { id: 'kimi-k2-turbo-preview', name: 'Kimi K2 Turbo', description: 'High-speed K2 version', contextLength: '256k' },
      { id: 'kimi-k2-thinking', name: 'Kimi K2 Thinking', description: 'Long-term reasoning', contextLength: '256k' },
      { id: 'kimi-k2-thinking-turbo', name: 'Kimi K2 Thinking Turbo', description: 'Fast reasoning', contextLength: '256k' },
      { id: 'moonshot-v1-128k', name: 'Moonshot V1 128k', description: 'Long context model', contextLength: '128k' },
    ],
  },
}

/**
 * Get AI provider configuration by ID
 */
export function getAIProvider(providerId: AIProvider | string): AIProviderConfig {
  const provider = AI_PROVIDERS[providerId as AIProvider]
  if (!provider) {
    // Default to Anthropic if unknown provider
    return AI_PROVIDERS.anthropic
  }
  return provider
}

/**
 * Get the correct API key field name for a provider
 */
export function getApiKeyField(providerId: AIProvider | string): 'claudeApiKey' | 'openaiApiKey' | 'kimiApiKey' {
  switch (providerId) {
    case 'openai':
      return 'openaiApiKey'
    case 'kimi':
      return 'kimiApiKey'
    case 'anthropic':
    default:
      return 'claudeApiKey'
  }
}

/**
 * Get the API key from setup state based on provider
 */
export function getApiKeyForProvider(
  setupState: { claudeApiKey?: string | null; openaiApiKey?: string | null; kimiApiKey?: string | null; aiProvider?: string },
  providerId?: AIProvider | string
): string | null {
  const provider = providerId || setupState.aiProvider || 'anthropic'
  switch (provider) {
    case 'openai':
      return setupState.openaiApiKey || null
    case 'kimi':
      return setupState.kimiApiKey || null
    case 'anthropic':
    default:
      return setupState.claudeApiKey || null
  }
}

/**
 * Generate ClawdBot auth profiles configuration for the selected provider
 */
export function generateAuthProfiles(providerId: AIProvider | string): Record<string, any> {
  const provider = getAIProvider(providerId)
  
  const profiles: Record<string, any> = {}
  
  switch (providerId) {
    case 'openai':
      profiles['openai:default'] = {
        provider: 'openai',
        mode: 'api_key',
      }
      break
    case 'kimi':
      // Kimi uses OpenAI-compatible API - configure as openai with custom baseUrl
      profiles['openai:default'] = {
        provider: 'openai',
        mode: 'api_key',
        baseUrl: provider.baseUrl,
      }
      break
    case 'anthropic':
    default:
      profiles['anthropic:default'] = {
        provider: 'anthropic',
        mode: 'api_key',
      }
      break
  }
  
  return profiles
}

/**
 * Generate the environment export command for a provider
 */
export function generateEnvExport(providerId: AIProvider | string, apiKey: string): string {
  const provider = getAIProvider(providerId)
  
  // For Kimi, we use OPENAI_API_KEY and OPENAI_BASE_URL since it's OpenAI-compatible
  if (providerId === 'kimi') {
    return `export OPENAI_API_KEY='${apiKey}'
export OPENAI_BASE_URL='${provider.baseUrl}'`
  }
  
  return `export ${provider.envVar}='${apiKey}'`
}

/**
 * Get the default model string for ClawdBot config
 * Format: "profile:model" e.g. "anthropic:default:claude-sonnet-4-20250514"
 */
export function getDefaultModelConfig(providerId: AIProvider | string): string {
  const provider = getAIProvider(providerId)
  
  switch (providerId) {
    case 'openai':
      return `openai:default:${provider.defaultModel}`
    case 'kimi':
      // Kimi uses openai:default profile since it's OpenAI-compatible
      return `openai:default:${provider.defaultModel}`
    case 'anthropic':
    default:
      return `anthropic:default:${provider.defaultModel}`
  }
}

/**
 * Validate API key format (basic validation)
 */
export function validateApiKeyFormat(providerId: AIProvider | string, apiKey: string): { valid: boolean; error?: string } {
  const provider = getAIProvider(providerId)
  
  if (!apiKey || apiKey.trim().length === 0) {
    return { valid: false, error: 'API key is required' }
  }
  
  // Basic prefix validation for providers with known prefixes
  if (provider.apiKeyPrefix && !apiKey.startsWith(provider.apiKeyPrefix)) {
    // Don't fail on this - some API keys may have different formats
    console.warn(`API key doesn't start with expected prefix: ${provider.apiKeyPrefix}`)
  }
  
  return { valid: true }
}

/**
 * Get all supported providers as array
 */
export function getAllProviders(): AIProviderConfig[] {
  return Object.values(AI_PROVIDERS)
}
