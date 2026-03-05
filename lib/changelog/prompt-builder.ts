import type { UIMessage } from 'ai'
import type { ChangelogPreset } from './types'

/**
 * Extracts and concatenates all text content from assistant messages.
 *
 * Filters to assistant-role messages, pulls `type: 'text'` parts, and joins
 * them into a single string.  Useful for rendering the final changelog
 * output from a generation session.
 *
 * @param messages - The full chat message history.
 * @returns Concatenated assistant text, or empty string if none.
 */
export function getAssistantText(messages: UIMessage[]): string {
  return messages
    .filter(m => m.role === 'assistant')
    .flatMap(
      m =>
        m.parts
          ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
          .map(p => p.text) || [],
    )
    .join('')
}

/**
 * Builds the user prompt string for a changelog generation request.
 *
 * Routes to the appropriate prompt based on preset type:
 * - **custom**: Returns the user-provided `customPrompt` as-is.
 * - **All others**: Returns the preset's static `prompt` template with the
 *   ref range appended so the AI knows the scope.
 *
 * @param preset       - The selected changelog preset.
 * @param fromRef      - Start ref (tag, branch, or SHA) of the range.
 * @param toRef        - End ref (tag, branch, or SHA) of the range.
 * @param customPrompt - User-provided prompt text for custom presets.
 * @returns The prompt string to send to the AI.
 */
export function buildChangelogPrompt(
  preset: ChangelogPreset,
  fromRef: string,
  toRef: string,
  customPrompt: string,
): string {
  const rangeLabel = `Changes from \`${fromRef}\` to \`${toRef}\``

  if (preset.id === 'custom') {
    return customPrompt
      ? `${rangeLabel}\n\n${customPrompt}`
      : rangeLabel
  }

  return `${rangeLabel}\n\n${preset.prompt}`
}
