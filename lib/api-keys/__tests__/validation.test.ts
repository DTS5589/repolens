import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PROVIDERS, API_KEY_PROVIDERS } from '../constants'
import type { AIProvider } from '@/types/types'

// ---------------------------------------------------------------------------
// Validation tests for API key constants and provider configuration
// ---------------------------------------------------------------------------

describe('PROVIDERS config', () => {
  it('has entries for all providers in API_KEY_PROVIDERS', () => {
    for (const provider of API_KEY_PROVIDERS) {
      expect(PROVIDERS[provider]).toBeDefined()
    }
  })

  it.each(API_KEY_PROVIDERS)('%s has required fields', (provider) => {
    const info = PROVIDERS[provider]
    expect(info.id).toBe(provider)
    expect(info.name).toBeTruthy()
    expect(info.description).toBeTruthy()
    expect(info.docsUrl).toMatch(/^https:\/\//)
    expect(info.keyPrefix).toBeTruthy()
  })

  it('openai key prefix is "sk-"', () => {
    expect(PROVIDERS.openai.keyPrefix).toBe('sk-')
  })

  it('anthropic key prefix is "sk-ant-"', () => {
    expect(PROVIDERS.anthropic.keyPrefix).toBe('sk-ant-')
  })

  it('openrouter key prefix is "sk-or-"', () => {
    expect(PROVIDERS.openrouter.keyPrefix).toBe('sk-or-')
  })

  it('google key prefix starts with "AI"', () => {
    expect(PROVIDERS.google.keyPrefix).toBe('AI')
  })
})

describe('API_KEY_PROVIDERS', () => {
  it('contains exactly 4 providers', () => {
    expect(API_KEY_PROVIDERS).toHaveLength(4)
  })

  it('includes all expected provider IDs', () => {
    const expected: AIProvider[] = ['openai', 'google', 'anthropic', 'openrouter']
    expect(API_KEY_PROVIDERS).toEqual(expect.arrayContaining(expected))
  })
})
