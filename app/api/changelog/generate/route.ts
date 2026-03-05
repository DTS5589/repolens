import { streamText, convertToModelMessages, stepCountIs, consumeStream, type UIMessage } from 'ai'
import * as z from 'zod'
import { createAIModel, getModelContextWindow } from '@/lib/ai/providers'
import { createContextCompactor } from '@/lib/ai/context-compactor'
import { codeTools } from '@/lib/ai/tool-definitions'
import { apiError } from '@/lib/api/error'

import type { ChangelogType } from '@/lib/changelog/types'

export const maxDuration = 120

const messageSchema = z.object({
  role: z.enum(['user', 'assistant', 'tool', 'data']),
  content: z.string().max(100_000).optional(),
}).passthrough() // Allow AI SDK's additional fields (parts, toolInvocations, etc.)

const changelogRequestSchema = z.object({
  messages: z.array(messageSchema).min(1).max(200),
  provider: z.enum(['openai', 'google', 'anthropic', 'openrouter']),
  model: z.string().min(1),
  apiKey: z.string().min(1).max(500),
  changelogType: z.enum(['conventional', 'release-notes', 'keep-a-changelog', 'custom']),
  repoContext: z.object({
    name: z.string(),
    description: z.string(),
    structure: z.string().max(200_000),
  }),
  structuralIndex: z.string().max(500_000).optional(),
  fromRef: z.string().min(1),
  toRef: z.string().min(1),
  commitData: z.string().max(500_000),
  maxSteps: z.number().int().min(10).max(80).optional(),
  compactionEnabled: z.boolean().optional(),
})

/**
 * System prompts per changelog type.
 * Each instructs the AI to use the provided commit data and code tools to
 * generate an accurate, well-structured changelog.
 */
const CHANGELOG_SYSTEM_PROMPTS: Record<ChangelogType, string> = {
  'conventional': `You are a release engineer generating a **Conventional Commits** changelog.

## Your task
Produce a structured changelog following the Conventional Commits specification.

## Your approach
1. Analyze the provided commit data to understand all changes in this range
2. Use code tools (readFile, searchFiles) to understand what major changes actually do when commit messages are unclear
3. Cross-reference commit messages with actual code changes for accuracy

## Required format
Group changes under these headings (omit empty sections):
- **⚠ Breaking Changes** — backwards-incompatible changes
- **✨ Features** — new functionality (feat: commits)
- **🐛 Bug Fixes** — bug fixes (fix: commits)
- **⚡ Performance** — performance improvements (perf: commits)
- **♻️ Refactoring** — code refactoring (refactor: commits)
- **📚 Documentation** — documentation changes (docs: commits)
- **🧪 Tests** — test additions/changes (test: commits)
- **🔧 Chores** — maintenance tasks (chore: commits)
- **🎨 Styles** — code style/formatting (style: commits)
- **🏗️ Build** — build system changes (build: commits)
- **🔄 CI** — CI configuration (ci: commits)

## Rules
- Each entry is a bullet point: \`- scope: description (commit SHA short)\`
- If a commit has a scope, include it in parentheses after the type
- Include the short SHA (first 7 chars) for traceability
- Summarize related commits rather than listing duplicates
- Use the code tools to verify what a change actually does when the commit message is vague`,

  'release-notes': `You are a product manager writing **user-facing release notes**.

## Your task
Create clear, user-friendly release notes that communicate what changed and why it matters.

## Your approach
1. Analyze commit data to identify all changes
2. Use code tools to understand the user impact of technical changes
3. Focus on what users will notice, not implementation details

## Required sections (omit if empty)
- **🎉 Highlights** — the most impactful changes (1-3 items)
- **✨ New Features** — new capabilities added
- **🔧 Improvements** — enhancements to existing features
- **🐛 Bug Fixes** — issues that were resolved
- **⚠ Breaking Changes** — anything that requires user action
- **📝 Notes** — migration guides, deprecation notices

## Rules
- Write for end users, not developers
- Explain the benefit, not the implementation ("Faster page loads" not "Optimized SQL queries")
- Group related changes into single entries
- Use clear, concise language
- Include context on breaking changes with migration steps`,

  'keep-a-changelog': `You are a developer writing a changelog in the **Keep a Changelog** format.

## Your task
Produce a changelog following the keepachangelog.com specification exactly.

## Your approach
1. Analyze the provided commit data
2. Use code tools to verify changes when commit messages are ambiguous
3. Categorize each change into the correct Keep a Changelog section

## Required format
Use EXACTLY these section headings (omit empty sections):
### Added
- For new features

### Changed
- For changes in existing functionality

### Deprecated
- For once-stable features to be removed

### Removed
- For removed features

### Fixed
- For bug fixes

### Security
- For vulnerability fixes

## Rules
- Follow https://keepachangelog.com/en/1.1.0/ format exactly
- Each entry is a bullet point with a clear description
- Order entries by importance within each section
- Include relevant file paths or component names for developer context
- Do not add headers like [Unreleased] or version numbers — those are provided by the user context`,

  'custom': `You are a senior developer and release engineer. The user will provide custom instructions for generating a changelog.

## Your approach
1. Analyze the provided commit data to understand all changes
2. Use code tools (readFile, searchFiles) to understand what changes actually do
3. Follow the user's specific formatting and content instructions

## Rules
- Use tools to read code — never guess or hallucinate about what changed
- Reference specific files, functions, and code when relevant
- Use markdown with clear headings
- Be thorough but concise
- Cross-reference commit messages with actual code changes for accuracy`,
}

export async function POST(req: Request) {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return apiError('INVALID_JSON', 'Invalid JSON in request body', 400)
  }

  try {
    const parsed = changelogRequestSchema.safeParse(raw)
    if (!parsed.success) {
      return apiError(
        'VALIDATION_ERROR',
        'Invalid request',
        422,
        JSON.stringify(parsed.error.flatten().fieldErrors),
      )
    }

    const {
      messages: rawMessages,
      provider,
      model,
      apiKey,
      changelogType,
      repoContext,
      structuralIndex,
      fromRef,
      toRef,
      commitData,
      maxSteps,
      compactionEnabled,
    } = parsed.data
    const messages = rawMessages as unknown as UIMessage[]

    // Build system prompt
    let systemPrompt = CHANGELOG_SYSTEM_PROMPTS[changelogType] || CHANGELOG_SYSTEM_PROMPTS['custom']

    systemPrompt += `\n\n## Repository
**Name:** ${repoContext.name}
**Description:** ${repoContext.description || 'No description'}

## Change Range
**From:** \`${fromRef}\`
**To:** \`${toRef}\`

## Commit Data
Below is the pre-fetched commit data for the specified range. Use this as your primary source of truth for what changed.

${commitData}

## Structural Index
Below is a JSON index of every file in the codebase with metadata including exports, imports, and symbol signatures.

**Use this index BEFORE making tool calls:**
- Scan \`exports\` to find where functions, classes, and types are defined
- Trace \`imports\` to understand dependency chains between files
- Read \`symbols\` to see function signatures — parameters and return types tell you what code does without reading the file
- Only call readFile when you need the full implementation, not just the API surface

${structuralIndex || 'Not available'}

## File Tree
\`\`\`
${repoContext.structure}
\`\`\``

    systemPrompt += `\n\n## Mermaid Diagram Syntax Rules
When generating Mermaid diagrams in the changelog:
1. ALWAYS use double-quoted labels for text with special characters: A["Label (with parens)"] not A(Label (with parens))
2. Use entity codes for special chars inside labels: #quot; for quotes, #amp; for &, #35; for #
3. Output raw Mermaid syntax WITHOUT markdown fencing (no \`\`\`mermaid wrappers)
4. Always start with the diagram type: flowchart TD, sequenceDiagram, classDiagram, etc.
5. Use simple alphanumeric node IDs (nodeA, auth_flow) — no special chars in IDs
6. Close all subgraph blocks with 'end'
7. Use 'flowchart' not 'graph' keyword
8. Keep labels under 60 characters
9. For line breaks in labels use <br/>`

    const stepBudget = maxSteps ?? 40
    systemPrompt += `\n\n## Step Budget
You have up to ${stepBudget} tool-call rounds. Plan efficiently:
- Use readFiles (batch, up to 10 files) to maximize reads per round
- Use readFile with startLine/endLine for large files
- Budget: ~40% reading code for context, ~50% writing changelog, ~10% verifying
- Prioritize understanding the most impactful changes first
- If approaching the step limit, prioritize completing your output over reading more files`

    systemPrompt += `\n\n## Self-Verification Protocol
After generating the changelog:
1. Cross-reference each changelog entry against the commit data
2. Verify that breaking changes are clearly called out
3. Ensure no significant commits are omitted
4. Check that entries accurately describe what changed (not just restate commit messages)`

    systemPrompt += `\n\n## Important
- You have access to readFile, readFiles, searchFiles, listDirectory, findSymbol, getFileStats, analyzeImports, scanIssues, generateDiagram, and getProjectOverview tools
- Use commit data as your primary source — use code tools to VERIFY and ENRICH, not as the sole source
- Cross-reference commit messages with actual code changes when commit messages are vague
- Your final response should be the complete changelog in markdown

## Model Context
Your context window is approximately ${getModelContextWindow(model).toLocaleString()} tokens. The structural index has been sized accordingly.`

    const result = streamText({
      model: createAIModel(provider, model, apiKey),
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
      tools: codeTools,
      ...(compactionEnabled && {
        prepareStep: createContextCompactor({
          maxSteps: stepBudget,
          contextWindow: getModelContextWindow(model),
          provider,
        }),
      }),
      stopWhen: stepCountIs(stepBudget),
      abortSignal: req.signal,
      ...(compactionEnabled && provider === 'anthropic' && {
        providerOptions: {
          anthropic: {
            contextManagement: {
              edits: [
                {
                  type: 'clear_tool_uses_20250919' as const,
                  trigger: { type: 'input_tokens' as const, value: 80_000 },
                  keep: { type: 'tool_uses' as const, value: 10 },
                  clearAtLeast: { type: 'input_tokens' as const, value: 5_000 },
                  clearToolInputs: false,
                },
                {
                  type: 'compact_20260112' as const,
                  trigger: { type: 'input_tokens' as const, value: 150_000 },
                  instructions: 'Summarize the changelog analysis so far, preserving: all commits examined, key changes identified, categorization decisions made, and what remains to be processed.',
                  pauseAfterCompaction: false,
                },
              ],
            },
          },
        },
      }),
    })

    return result.toUIMessageStreamResponse({
      originalMessages: messages,
      consumeSseStream: consumeStream,
    })
  } catch (error) {
    console.error('Changelog API error:', error instanceof Error ? error.message : 'Unknown error')
    return apiError(
      'CHANGELOG_ERROR',
      error instanceof Error ? error.message : 'An error occurred',
      500,
    )
  }
}
