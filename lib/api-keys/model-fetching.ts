import type { AIProvider, ProviderModel, ModelResponseItem } from '@/types/types'

/** Fetch models for a specific provider from the API. Returns parsed ProviderModel[]. */
export async function fetchProviderModels(
  provider: AIProvider,
  apiKey: string,
): Promise<{ models: ProviderModel[]; isValid: boolean }> {
  const response = await fetch(`/api/models/${provider}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey }),
  })

  if (!response.ok) {
    return { models: [], isValid: false }
  }

  const data = await response.json()
  const models: ProviderModel[] = (data.models || []).map((m: ModelResponseItem) => ({
    id: m.id,
    name: m.name || m.id,
    provider,
    contextLength: m.contextLength,
  }))

  return { models, isValid: models.length > 0 }
}
