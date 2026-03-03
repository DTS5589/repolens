import { describe, it, expect } from 'vitest'
import { findDefaultModel, DEFAULT_MODELS } from '../api-keys-provider'
import type { ProviderModel, AIProvider } from '@/types/types'

// ---------------------------------------------------------------------------
// Helper to build ProviderModel objects concisely
// ---------------------------------------------------------------------------

function model(id: string, provider: AIProvider, name?: string): ProviderModel {
  return { id, name: name ?? id, provider }
}

// ---------------------------------------------------------------------------
// findDefaultModel
// ---------------------------------------------------------------------------

describe('findDefaultModel', () => {
  // -----------------------------------------------------------------------
  // Empty list
  // -----------------------------------------------------------------------

  it('returns null for an empty model list', () => {
    expect(findDefaultModel([], 'anthropic')).toBeNull()
  })

  // -----------------------------------------------------------------------
  // Anthropic — preferred substring match
  // -----------------------------------------------------------------------

  describe('anthropic provider', () => {
    const anthropicModels: ProviderModel[] = [
      model('claude-3-opus-20240229', 'anthropic'),
      model('claude-sonnet-4-6-20250514', 'anthropic'),
      model('claude-3-haiku-20240307', 'anthropic'),
    ]

    it('returns the model matching the preferred substring for Anthropic', () => {
      const result = findDefaultModel(anthropicModels, 'anthropic')
      expect(result).not.toBeNull()
      expect(result!.id).toBe('claude-sonnet-4-6-20250514')
    })

    it('uses .includes() matching (substring, not exact)', () => {
      // The preferred substring is 'claude-sonnet-4-6', the model id
      // is 'claude-sonnet-4-6-20250514' — match via includes()
      const result = findDefaultModel(anthropicModels, 'anthropic')
      expect(result!.id).toContain(DEFAULT_MODELS.anthropic!)
    })
  })

  // -----------------------------------------------------------------------
  // Google — preferred substring match
  // -----------------------------------------------------------------------

  describe('google provider', () => {
    const googleModels: ProviderModel[] = [
      model('gemini-1.5-flash', 'google'),
      model('gemini-2.5-pro-preview', 'google'),
      model('gemini-1.5-pro', 'google'),
    ]

    it('returns the model matching the preferred substring for Google', () => {
      const result = findDefaultModel(googleModels, 'google')
      expect(result).not.toBeNull()
      expect(result!.id).toBe('gemini-2.5-pro-preview')
    })
  })

  // -----------------------------------------------------------------------
  // Providers without preferred defaults (OpenAI, OpenRouter)
  // -----------------------------------------------------------------------

  describe('providers without preferred defaults', () => {
    it('returns the first model for OpenAI (no preferred substring)', () => {
      const openaiModels: ProviderModel[] = [
        model('gpt-4o', 'openai'),
        model('gpt-4-turbo', 'openai'),
        model('gpt-3.5-turbo', 'openai'),
      ]
      const result = findDefaultModel(openaiModels, 'openai')
      expect(result).not.toBeNull()
      expect(result!.id).toBe('gpt-4o')
    })

    it('returns the first model for OpenRouter (no preferred substring)', () => {
      const openrouterModels: ProviderModel[] = [
        model('openai/gpt-4o', 'openrouter'),
        model('anthropic/claude-3-opus', 'openrouter'),
      ]
      const result = findDefaultModel(openrouterModels, 'openrouter')
      expect(result).not.toBeNull()
      expect(result!.id).toBe('openai/gpt-4o')
    })
  })

  // -----------------------------------------------------------------------
  // Fallback — preferred substring doesn't match any model
  // -----------------------------------------------------------------------

  describe('fallback when preferred model is not in list', () => {
    it('falls back to the first model when no match for Anthropic preferred', () => {
      const models: ProviderModel[] = [
        model('claude-3-opus-20240229', 'anthropic'),
        model('claude-3-haiku-20240307', 'anthropic'),
      ]
      // Neither id includes 'claude-sonnet-4-6'
      const result = findDefaultModel(models, 'anthropic')
      expect(result).not.toBeNull()
      expect(result!.id).toBe('claude-3-opus-20240229')
    })

    it('falls back to the first model when no match for Google preferred', () => {
      const models: ProviderModel[] = [
        model('gemini-1.5-flash', 'google'),
        model('gemini-1.5-pro', 'google'),
      ]
      // Neither id includes 'gemini-2.5-pro'
      const result = findDefaultModel(models, 'google')
      expect(result).not.toBeNull()
      expect(result!.id).toBe('gemini-1.5-flash')
    })
  })

  // -----------------------------------------------------------------------
  // Single model edge case
  // -----------------------------------------------------------------------

  it('returns the single model when only one is available', () => {
    const models: ProviderModel[] = [model('only-model', 'openai')]
    const result = findDefaultModel(models, 'openai')
    expect(result).not.toBeNull()
    expect(result!.id).toBe('only-model')
  })
})
