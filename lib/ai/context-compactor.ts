import type { ModelMessage, ToolModelMessage } from 'ai'

/**
 * Maximum number of recent steps whose tool results are kept in full.
 * Older tool results are compressed to just their tool name + a summary marker.
 */
const FULL_RESULT_STEPS = 4

/**
 * Maximum character length for a single tool-result output value before
 * it gets truncated in older steps.
 */
const MAX_TOOL_RESULT_LENGTH = 500

/**
 * Create a `prepareStep` callback for `streamText()` that trims older
 * tool-result messages to prevent unbounded context growth during
 * multi-step tool-calling sessions.
 *
 * Strategy:
 * - Keep the last `FULL_RESULT_STEPS` worth of assistant+tool message pairs intact
 * - For older tool messages, truncate large tool-result content to a short summary
 * - Never modify user or system messages
 */
export function createContextCompactor() {
  return ({ stepNumber, messages }: { stepNumber: number; messages: ModelMessage[] }) => {
    // No compaction needed for early steps
    if (stepNumber < FULL_RESULT_STEPS) return undefined

    const compacted = compactMessages(messages, FULL_RESULT_STEPS)
    return { messages: compacted }
  }
}

/**
 * Compact a message array by truncating tool-result content in older messages.
 * We keep the last `keepFullSteps` pairs of assistant→tool messages untouched.
 * Earlier tool messages get their content summarized.
 */
function compactMessages(
  messages: ModelMessage[],
  keepFullSteps: number,
): ModelMessage[] {
  // Find indices of all tool-role messages (these carry tool results)
  const toolMessageIndices: number[] = []
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === 'tool') {
      toolMessageIndices.push(i)
    }
  }

  // If we have fewer tool messages than the threshold, nothing to compact
  if (toolMessageIndices.length <= keepFullSteps) {
    return messages
  }

  // Determine the cutoff: tool messages before this index get compacted
  const cutoffIndex = toolMessageIndices[toolMessageIndices.length - keepFullSteps]

  return messages.map((msg, idx) => {
    if (msg.role !== 'tool' || idx >= cutoffIndex) return msg
    return compactToolMessage(msg as ToolModelMessage)
  })
}

/**
 * Create a compacted version of a tool message by truncating large
 * tool-result output values. The `ToolResultPart.output` field uses
 * a discriminated union: `{ type: 'text', value }`, `{ type: 'json', value }`, etc.
 */
function compactToolMessage(msg: ToolModelMessage): ToolModelMessage {
  return {
    ...msg,
    content: msg.content.map(part => {
      if (part.type !== 'tool-result') return part

      const output = part.output
      if (output.type === 'text') {
        if (output.value.length <= MAX_TOOL_RESULT_LENGTH) return part
        return {
          ...part,
          output: {
            ...output,
            value: output.value.slice(0, MAX_TOOL_RESULT_LENGTH) + '… [truncated]',
          },
        }
      }

      if (output.type === 'json') {
        const serialized = JSON.stringify(output.value)
        if (serialized.length <= MAX_TOOL_RESULT_LENGTH) return part
        return {
          ...part,
          output: {
            type: 'text' as const,
            value: serialized.slice(0, MAX_TOOL_RESULT_LENGTH) + '… [truncated]',
          },
        }
      }

      // For 'execution-denied', 'error-text', etc. — leave as-is (small)
      return part
    }),
  }
}
