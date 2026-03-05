import type { UIMessage } from 'ai'
import type { DocPreset } from './preset-config'

/**
 * Extracts and concatenates all text content from assistant messages.
 *
 * Filters to assistant-role messages, pulls `type: 'text'` parts, and joins
 * them into a single string.  Useful for rendering the final documentation
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
 * Builds the user prompt string for a documentation generation request.
 *
 * Routes to the appropriate prompt based on preset type:
 * - **file-explanation**: Generates a dynamic prompt including the target file path.
 *   Returns an empty string if `targetFile` is not provided.
 * - **custom**: Returns the user-provided `customPrompt` as-is.
 * - **All others**: Returns the preset's static `prompt` template.
 *
 * @param preset      - The selected documentation preset.
 * @param targetFile  - File path for file-explanation presets, or `null`.
 * @param customPrompt - User-provided prompt text for custom presets.
 * @returns The prompt string to send to the AI, or empty string for invalid inputs.
 */
export function buildDocPrompt(
  preset: DocPreset,
  targetFile: string | null,
  customPrompt: string,
): string {
  if (preset.id === 'file-explanation') {
    if (!targetFile) return ''
    return `Explain this file in detail: \`${targetFile}\`. Cover its purpose, how it fits in the architecture, key functions/classes, and walk through the main logic.`
  }
  if (preset.id === 'custom') return customPrompt
  return preset.prompt
}
