import { NextResponse } from 'next/server'

// Anthropic doesn't have a models endpoint, so we validate the key
// and return known available models
const ANTHROPIC_MODELS = [
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', contextLength: 200000 },
  { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', contextLength: 200000 },
  { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', contextLength: 200000 },
  { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', contextLength: 200000 },
  { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', contextLength: 200000 },
]

export async function POST(request: Request) {
  try {
    const { apiKey } = await request.json()

    if (!apiKey) {
      return NextResponse.json({ error: 'API key required' }, { status: 400 })
    }

    // Validate the API key by making a minimal request
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    })

    // Even a successful response or a rate limit means the key is valid
    if (response.ok || response.status === 429) {
      return NextResponse.json({ models: ANTHROPIC_MODELS })
    }

    // Check for authentication error
    if (response.status === 401) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }

    // For other errors, still return models if we got a response
    return NextResponse.json({ models: ANTHROPIC_MODELS })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to validate key' }, { status: 500 })
  }
}
