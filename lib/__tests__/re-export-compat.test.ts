import { describe, it, expect, vi, beforeAll } from 'vitest'

/**
 * These tests verify that re-exports from provider modules still resolve
 * correctly after the decomposition into lib/ modules.
 * They confirm backward-compatible import paths work.
 *
 * The docs-provider module is loaded via `vi.importActual()` to bypass
 * any `vi.mock('@/providers/docs-provider')` registered by other test
 * files in the same thread (e.g. `use-docs-engine.test.ts`).
 */

describe('provider re-export compatibility', () => {
  // -------------------------------------------------------------------------
  // api-keys-provider re-exports
  // -------------------------------------------------------------------------

  it('exports PROVIDERS from api-keys-provider', async () => {
    const mod = await import('@/providers/api-keys-provider')
    expect(mod.PROVIDERS).toBeDefined()
    expect(mod.PROVIDERS.openai).toBeDefined()
    expect(mod.PROVIDERS.anthropic).toBeDefined()
  })

  it('exports findDefaultModel from api-keys-provider', async () => {
    const mod = await import('@/providers/api-keys-provider')
    expect(typeof mod.findDefaultModel).toBe('function')
  })

  it('exports DEFAULT_MODELS from api-keys-provider', async () => {
    const mod = await import('@/providers/api-keys-provider')
    expect(mod.DEFAULT_MODELS).toBeDefined()
  })

  // -------------------------------------------------------------------------
  // docs-provider re-exports
  //
  // Loaded once in beforeAll via vi.importActual() to avoid:
  // 1. Mock pollution from vi.mock('@/providers/docs-provider') in other files
  // 2. Repeated heavy imports (docs-provider has deep transitive deps)
  // -------------------------------------------------------------------------

  describe('docs-provider', () => {
    let docsProviderMod: Record<string, unknown>

    beforeAll(async () => {
      docsProviderMod = await vi.importActual<Record<string, unknown>>(
        '@/providers/docs-provider',
      )
    }, 15_000)

    it('exports DOC_PRESETS', () => {
      expect(docsProviderMod.DOC_PRESETS).toBeDefined()
      expect(Array.isArray(docsProviderMod.DOC_PRESETS)).toBe(true)
    })

    it('exports getAssistantText', () => {
      expect(typeof docsProviderMod.getAssistantText).toBe('function')
    })

    it('exports buildDocPrompt', () => {
      expect(typeof docsProviderMod.buildDocPrompt).toBe('function')
    })
  })

  // -------------------------------------------------------------------------
  // repository-provider re-exports (type-only — checked via lib/repository)
  // -------------------------------------------------------------------------

  it('exports DEFAULT_SEARCH_STATE from lib/repository', async () => {
    const mod = await import('@/lib/repository')
    expect(mod.DEFAULT_SEARCH_STATE).toBeDefined()
    expect(mod.DEFAULT_SEARCH_STATE.searchQuery).toBe('')
  })

  it('exports DEFAULT_INDEXING_PROGRESS from lib/repository', async () => {
    const mod = await import('@/lib/repository')
    expect(mod.DEFAULT_INDEXING_PROGRESS).toBeDefined()
    expect(mod.DEFAULT_INDEXING_PROGRESS.current).toBe(0)
  })

  // -------------------------------------------------------------------------
  // providers/index barrel re-exports
  // -------------------------------------------------------------------------

  it('exports useAPIKeys from providers/index', async () => {
    const mod = await import('@/providers')
    expect(typeof mod.useAPIKeys).toBe('function')
  })

  it('exports useApp from providers/index', async () => {
    const mod = await import('@/providers')
    expect(typeof mod.useApp).toBe('function')
  })

  it('exports useRepository from providers/index', async () => {
    const mod = await import('@/providers')
    expect(typeof mod.useRepository).toBe('function')
  })

  it('exports useDocs from providers/index', async () => {
    const mod = await import('@/providers')
    expect(typeof mod.useDocs).toBe('function')
  })

  // -------------------------------------------------------------------------
  // lib/ barrel re-exports
  // -------------------------------------------------------------------------

  it('exports all key-storage functions from lib/api-keys', async () => {
    const mod = await import('@/lib/api-keys')
    expect(typeof mod.loadKeys).toBe('function')
    expect(typeof mod.saveKeys).toBe('function')
    expect(typeof mod.loadSelectedModel).toBe('function')
    expect(typeof mod.saveSelectedModel).toBe('function')
    expect(typeof mod.findDefaultModel).toBe('function')
    expect(typeof mod.isValidAPIKeysState).toBe('function')
  })

  it('exports fetchProviderModels from lib/api-keys', async () => {
    const mod = await import('@/lib/api-keys')
    expect(typeof mod.fetchProviderModels).toBe('function')
  })

  it('exports DOC_PRESETS, getAssistantText, buildDocPrompt from lib/docs', async () => {
    const mod = await import('@/lib/docs')
    expect(mod.DOC_PRESETS).toBeDefined()
    expect(typeof mod.getAssistantText).toBe('function')
    expect(typeof mod.buildDocPrompt).toBe('function')
  })
})
