import { streamText, convertToModelMessages, UIMessage, consumeStream } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createAnthropic } from '@ai-sdk/anthropic'

export const maxDuration = 60

interface ChatRequest {
  messages: UIMessage[]
  provider: 'openai' | 'google' | 'anthropic' | 'openrouter'
  model: string
  apiKey: string
  repoContext?: {
    name: string
    description: string
    structure: string
  }
  codeContext?: string // Relevant code snippets from indexed files
}

export async function POST(req: Request) {
  try {
    const { messages, provider, model, apiKey, repoContext, codeContext }: ChatRequest = await req.json()

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API key is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Build system prompt with repo context
    let systemPrompt = `You are CodeDoc, an expert code documentation assistant. You help developers understand codebases, explain architecture, and answer questions about code.

## Response Guidelines
- Be concise and direct
- Use markdown formatting for readability
- Include code examples in fenced code blocks with language tags
- Always cite specific file paths when discussing code (e.g., \`app/page.tsx\`)
- If unsure about something, say so clearly`

    if (repoContext) {
      systemPrompt += `

## Connected Repository
**Name:** ${repoContext.name}
**Description:** ${repoContext.description || 'No description'}

## File Structure
\`\`\`
${repoContext.structure}
\`\`\`

## Grounding Rules
- ALWAYS reference actual files from the structure above
- Format file references as inline code: \`path/to/file.tsx\`
- When explaining architecture, list the relevant files
- If asked about code not in this repo, state clearly "I don't see that file in this repository"
- Suggest specific files to look at when giving advice`
    } else {
      systemPrompt += `

No repository is currently connected. You can still answer general programming questions, but won't be able to reference specific codebase files.`
    }

    // Add relevant code context if available
    if (codeContext) {
      systemPrompt += `

## Relevant Code Files
The following code snippets are relevant to the user's question:
${codeContext}

When answering:
- Reference line numbers when discussing specific code
- Quote relevant code snippets in your response
- Explain how different files/functions relate to each other`
    }

    // Create provider-specific model
    let aiModel: Parameters<typeof streamText>[0]['model']

    switch (provider) {
      case 'openai':
        const openai = createOpenAI({ apiKey })
        aiModel = openai(model)
        break
      case 'google':
        const google = createGoogleGenerativeAI({ apiKey })
        aiModel = google(model)
        break
      case 'anthropic':
        const anthropic = createAnthropic({ apiKey })
        aiModel = anthropic(model)
        break
      case 'openrouter':
        const openrouter = createOpenAI({
          apiKey,
          baseURL: 'https://openrouter.ai/api/v1',
        })
        aiModel = openrouter(model)
        break
      default:
        return new Response(JSON.stringify({ error: 'Unsupported provider' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
    }

    const result = streamText({
      model: aiModel,
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
      abortSignal: req.signal,
    })

    return result.toUIMessageStreamResponse({
      originalMessages: messages,
      consumeSseStream: consumeStream,
    })
  } catch (error) {
    console.error('Chat API error:', error)
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'An error occurred' 
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}
