import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createAnthropic } from '@ai-sdk/anthropic'

export type AIProvider = 'openai' | 'google' | 'anthropic' | 'openrouter'

/**
 * Create a provider-specific AI model instance.
 * Centralises the switch logic shared by chat and docs routes.
 */
export function createAIModel(provider: AIProvider, model: string, apiKey: string) {
  switch (provider) {
    case 'openai':
      return createOpenAI({ apiKey })(model)
    case 'google':
      return createGoogleGenerativeAI({ apiKey })(model)
    case 'anthropic':
      return createAnthropic({ apiKey })(model)
    case 'openrouter':
      return createOpenAI({ apiKey, baseURL: 'https://openrouter.ai/api/v1' })(model)
    default:
      throw new Error(`Unsupported provider: ${provider}`)
  }
}
