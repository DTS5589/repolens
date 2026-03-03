import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { apiKey } = await request.json()

    if (!apiKey) {
      return NextResponse.json({ error: 'API key required' }, { status: 400 })
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    )

    if (!response.ok) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }

    const data = await response.json()
    
    // Filter to only include Gemini models that support generateContent
    const geminiModels = (data.models || [])
      .filter((model: any) => 
        model.name.includes('gemini') &&
        model.supportedGenerationMethods?.includes('generateContent')
      )
      .map((model: any) => ({
        id: model.name.replace('models/', ''),
        name: formatModelName(model.displayName || model.name),
        contextLength: model.inputTokenLimit,
      }))
      .sort((a: any, b: any) => {
        // Prioritize flash and pro models
        const order = ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro']
        const aIndex = order.findIndex(o => a.id.includes(o))
        const bIndex = order.findIndex(o => b.id.includes(o))
        return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex)
      })

    return NextResponse.json({ models: geminiModels })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch models' }, { status: 500 })
  }
}

function formatModelName(name: string): string {
  return name
    .replace('models/', '')
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
