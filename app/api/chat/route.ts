import { streamText, convertToModelMessages, stepCountIs, consumeStream } from 'ai'
import * as z from 'zod'
import { createAIModel } from '@/lib/ai/providers'
import { createCodeTools, createAdvancedTools } from '@/lib/ai/tools'

export const maxDuration = 120

const chatRequestSchema = z.object({
  messages: z.array(z.any()),
  provider: z.enum(['openai', 'google', 'anthropic', 'openrouter']),
  model: z.string().min(1),
  apiKey: z.string().min(1),
  repoContext: z.object({
    name: z.string(),
    description: z.string(),
    structure: z.string(),
  }).optional(),
  fileContents: z.record(z.string(), z.string()).optional(),
})

export async function POST(req: Request) {
  try {
    const raw = await req.json()
    const parsed = chatRequestSchema.safeParse(raw)
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid request', details: parsed.error.flatten().fieldErrors }),
        { status: 422, headers: { 'Content-Type': 'application/json' } },
      )
    }
    const { messages, provider, model, apiKey, repoContext, fileContents } = parsed.data

    // Build file content map for tool access
    const fileMap = new Map(Object.entries(fileContents || {}))

    // Shared + advanced tools for codebase exploration, analysis, and generation
    const codeTools = {
      ...createCodeTools(fileMap),
      ...createAdvancedTools(fileMap),
    }

    // Build system prompt
    let systemPrompt = `You are CodeDoc, a senior software engineer with full access to the codebase. You help developers understand code, answer architecture questions, write documentation, and create diagrams.

## Your Philosophy
- Quality and accuracy over speed. Take as many tool calls as needed.
- ALWAYS read the actual code before making claims about it. Never guess or hallucinate.
- When you produce documentation or diagrams, verify them by re-reading the source files.
- If you're unsure about something, read more files. If you still can't verify, say so explicitly.
- Provide specific file paths, line references, and code snippets from the actual codebase.

## Your Capabilities
You have 9 tools to explore the codebase:
- **readFile** — Read any file in full. Use this before discussing any code.
- **searchFiles** — Search for text patterns or file names across the entire codebase.
- **listDirectory** — Browse the folder structure.
- **findSymbol** — Find function, class, interface, type, or enum definitions by name.
- **getFileStats** — Get line count, language, imports, and exports for a file.
- **analyzeImports** — See what a file imports and what imports it (dependency relationships).
- **scanIssues** — Run security and quality checks on a specific file.
- **generateDiagram** — Create Mermaid diagrams of the codebase architecture.
- **getProjectOverview** — Get project statistics and structure summary.

## Self-Verification Protocol
After generating documentation or making claims about code:
1. Re-read the key files you referenced to verify accuracy
2. Cross-check function signatures, type definitions, and import chains
3. If you find a discrepancy, correct your output and note the correction

## Response Guidelines
- Use markdown formatting: headings, lists, tables, code blocks
- Put code examples in fenced blocks with correct language tags: \`\`\`typescript
- Reference files as \`path/to/file.tsx\`
- When creating Mermaid diagrams, wrap them in \`\`\`mermaid blocks
- For long explanations, use clear section headers
- When writing documentation, follow the file → understand → write → verify cycle

## Mermaid Diagram Guidelines
Valid diagram types: flowchart, sequenceDiagram, classDiagram, erDiagram, gantt, pie, gitgraph, mindmap.

Syntax rules:
- Use \`-->\` for flowchart arrows, never \`->\`
- Wrap labels containing special characters in quotes: \`A["Label with (parens)"]\`
- ALWAYS quote node labels containing file paths or slashes: \`A["components/features/chat"]\` NOT \`A[components/features/chat]\`
- Unquoted \`[/text]\` is trapezoid syntax in mermaid — always quote labels with paths to avoid parse errors
- Every \`subgraph\` must have a matching \`end\`
- Sequence diagram arrows: \`->>\` (solid), \`-->>\` (dashed)
- Never use empty node labels or HTML entities in labels
- Node IDs must be alphanumeric (no spaces or punctuation)

Before outputting a diagram, mentally verify:
1. All subgraphs are closed with \`end\`
2. Arrow syntax is consistent throughout
3. The diagram type keyword is on the first line with no extra text`

    if (repoContext) {
      systemPrompt += `

## Connected Repository
**Name:** ${repoContext.name}
**Description:** ${repoContext.description || 'No description'}
**Total files indexed:** ${fileMap.size}

## File Tree
\`\`\`
${repoContext.structure}
\`\`\`

## Important
- You have 9 tools — use them to read and explore real code before answering
- NEVER describe a file you haven't read — use readFile first
- ALWAYS reference actual files from the codebase`
    } else {
      systemPrompt += `

No repository is currently connected. You can still answer general programming questions, but won't be able to reference specific codebase files.`
    }

    const result = streamText({
      model: createAIModel(provider, model, apiKey),
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
      tools: codeTools,
      stopWhen: stepCountIs(50),
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
        error: error instanceof Error ? error.message : 'An error occurred',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}
