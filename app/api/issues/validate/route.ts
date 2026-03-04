import { generateText } from 'ai'
import * as z from 'zod'
import { createAIModel } from '@/lib/ai/providers'
import {
  buildValidationPrompt,
  parseValidationResponse,
  getCodeContext,
  scrubSecrets,
} from '@/lib/code/scanner/ai-validator'
import type { CodeIssue } from '@/lib/code/scanner/types'

export const maxDuration = 60

const issueSchema = z.object({
  id: z.string(),
  ruleId: z.string(),
  title: z.string(),
  description: z.string(),
  severity: z.enum(['critical', 'warning', 'info']),
  category: z.string(),
  file: z.string(),
  line: z.number(),
  snippet: z.string(),
  suggestion: z.string().optional(),
  cwe: z.string().optional(),
  owasp: z.string().optional(),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
})

const validateRequestSchema = z.object({
  issue: issueSchema,
  fileContent: z.string().max(500_000),
  provider: z.enum(['openai', 'google', 'anthropic', 'openrouter']),
  model: z.string().min(1),
  apiKey: z.string().min(1).max(500),
})

export async function POST(req: Request) {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = validateRequestSchema.safeParse(raw)
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid request', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  const { issue, fileContent, provider, model: modelId, apiKey } = parsed.data

  try {
    const rawContext = getCodeContext(fileContent, issue.line)
    const context = scrubSecrets(rawContext)
    const { system, user } = buildValidationPrompt(issue as CodeIssue, context)

    const aiModel = createAIModel(provider, modelId, apiKey)

    const { text } = await generateText({
      model: aiModel,
      system,
      prompt: user,
      maxOutputTokens: 500,
      temperature: 0.1,
    })

    const result = parseValidationResponse(text, issue.id)

    return Response.json(result)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'AI validation failed'
    return Response.json(
      {
        issueId: issue.id,
        verdict: 'uncertain',
        confidence: 'low',
        reasoning: `Server-side AI validation failed: ${message}`,
      },
      { status: 200 },
    )
  }
}
