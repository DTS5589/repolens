/** Approximate pricing per 1M tokens (USD) for popular models. */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10, output: 30 },
  'o1': { input: 15, output: 60 },
  'o1-mini': { input: 1.1, output: 4.4 },
  'o3-mini': { input: 1.1, output: 4.4 },
  // Anthropic
  'claude-sonnet-4': { input: 3, output: 15 },
  'claude-3-7-sonnet': { input: 3, output: 15 },
  'claude-3-5-sonnet': { input: 3, output: 15 },
  'claude-3-5-haiku': { input: 0.8, output: 4 },
  'claude-3-opus': { input: 15, output: 75 },
  'claude-3-haiku': { input: 0.25, output: 1.25 },
  // Google
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
  'gemini-2.5-flash': { input: 0.15, output: 0.6 },
  'gemini-1.5-pro': { input: 1.25, output: 5 },
  'gemini-1.5-flash': { input: 0.075, output: 0.3 },
  'gemini-2.5-pro': { input: 1.25, output: 10 },
}

/** Look up pricing for a model, falling back to substring matching. */
export function getModelPricing(model: string): { input: number; output: number } | null {
  if (MODEL_PRICING[model]) return MODEL_PRICING[model]
  const sorted = Object.entries(MODEL_PRICING).sort((a, b) => b[0].length - a[0].length)
  for (const [key, pricing] of sorted) {
    if (model.includes(key)) return pricing
  }
  return null
}

/** Estimate cost in USD for a given model and token counts. Returns null if model pricing is unknown. */
export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number | null {
  const pricing = getModelPricing(model)
  if (!pricing) return null
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000
}

/** Format a token count as a human-readable string (e.g. 1.2K, 3M). */
export function formatTokenCount(count: number): string {
  if (count >= 1_000_000) {
    const m = count / 1_000_000
    return m % 1 === 0 ? `${m}M` : `${m.toFixed(1)}M`
  }
  if (count >= 1_000) {
    const k = count / 1_000
    return k % 1 === 0 ? `${k}K` : `${k.toFixed(1)}K`
  }
  return String(count)
}

/** Format a cost value as a compact dollar string. */
export function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`
  return `$${cost.toFixed(2)}`
}

/** Extract a short display name from a model ID (e.g. "claude-sonnet-4" → "Claude Sonnet 4"). */
export function formatModelName(modelId: string): string {
  return modelId
    .replace(/^(models\/|accounts\/[^/]+\/models\/)/, '')
    .split(/[-_]/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
