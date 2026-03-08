import type { LanguageModelMiddleware } from 'ai'

/**
 * Creates a logging middleware for the AI model.
 * SECURITY: Never logs message content, tool args, or any string that
 * could contain API keys, file contents, or user data.
 */
export function createLoggingMiddleware(): LanguageModelMiddleware {
  return {
    specificationVersion: 'v3',
    transformParams: async ({ params }) => {
      // Only log message count — never content or args
      console.log(`[AI] Model call: ${params.prompt.length} messages`)
      return params
    },
    wrapGenerate: async ({ doGenerate }) => {
      const start = Date.now()
      const result = await doGenerate()
      console.log(`[AI] Generate: ${Date.now() - start}ms, usage:`, result.usage)
      return result
    },
    wrapStream: async ({ doStream }) => {
      const start = Date.now()
      const result = await doStream()
      console.log(`[AI] Stream started: ${Date.now() - start}ms`)
      return result
    },
  }
}
