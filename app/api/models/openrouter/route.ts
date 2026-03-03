import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { apiKey } = await request.json()

    if (!apiKey) {
      return NextResponse.json({ error: 'API key required' }, { status: 400 })
    }

    // Fetch available models from OpenRouter
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }

    const data = await response.json()
    
    // Filter and format models
    const models = (data.data || [])
      .filter((model: any) => 
        // Filter out deprecated or restricted models
        !model.id.includes(':free') || model.pricing?.prompt === '0'
      )
      .slice(0, 50) // Limit to 50 most relevant models
      .map((model: any) => ({
        id: model.id,
        name: model.name || model.id,
        contextLength: model.context_length,
      }))

    return NextResponse.json({ models })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch models' }, { status: 500 })
  }
}
