import { ToolLoopAgent } from 'ai'
import { codeTools } from '@/lib/ai/tool-definitions'
import { createAIModel } from '@/lib/ai/providers'
import { discoverSkillsTool, loadSkillTool } from '@/lib/ai/skills'
import { callOptionsSchema, type CallOptions } from './options'
import { buildPrepareCall } from './prepare-call'
import { buildPrepareStep } from './prepare-step'

/**
 * The main RepoLens agent. Handles chat, docs, and changelog modes
 * through a single `ToolLoopAgent` with mode-based `prepareCall` dispatch.
 */
export const repoLensAgent = new ToolLoopAgent<CallOptions>({
  callOptionsSchema,
  tools: {
    ...codeTools,
    discoverSkills: discoverSkillsTool,
    loadSkill: loadSkillTool,
  },
  // Required constructor parameter — always overridden by prepareCall per request
  model: createAIModel('openai', 'gpt-4o', 'placeholder'),
  prepareCall: buildPrepareCall(),
  // Cast needed: prepareStep returns string[] activeTools but ToolLoopAgent
  // generic infers tool keys from the tools object. The names are validated
  // at runtime by the agent framework.
  prepareStep: buildPrepareStep() as never,
  experimental_repairToolCall: async ({ toolCall, error }) => {
    console.warn(
      `[agent] tool-call repair skipped for "${toolCall.toolName}" (${error.constructor.name})`,
    )
    return null
  },
})
