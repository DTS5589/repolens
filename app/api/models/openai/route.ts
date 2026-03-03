import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { apiKey } = await request.json()

    if (!apiKey) {
      return NextResponse.json({ error: 'API key required' }, { status: 400 })
    }

    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }

    const data = await response.json()
    
    // Filter to only include chat models
    const chatModels = data.data
      .filter((model: any) => 
        model.id.includes('gpt') && 
        !model.id.includes('instruct') &&
        !model.id.includes('vision') &&
        !model.id.includes('realtime') &&
        !model.id.includes('audio')
      )
      .map((model: any) => ({
        id: model.id,
        name: formatModelName(model.id),
      }))
      .sort((a: any, b: any) => {
        // Prioritize newer models
        const order = ['gpt-4o', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5']
        const aIndex = order.findIndex(o => a.id.includes(o))
        const bIndex = order.findIndex(o => b.id.includes(o))
        return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex)
      })

    return NextResponse.json({ models: chatModels })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch models' }, { status: 500 })
  }
}

function formatModelName(id: string): string {
  return id
    .replace('gpt-', 'GPT-')
    .replace('-turbo', ' Turbo')
    .replace('-preview', ' Preview')
}
