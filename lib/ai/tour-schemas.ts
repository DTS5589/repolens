import { z } from 'zod'

/**
 * Zod schema for the `generateTour` tool input.
 *
 * The AI model receives this schema and decides when to call the tool
 * (e.g. "give me a tour of the auth flow").  The client-side executor
 * builds the actual tour from the CodeIndex.
 */
export const generateTourSchema = z.object({
  repoKey: z
    .string()
    .describe('Repository identifier in "owner/repo" format'),
  theme: z
    .string()
    .optional()
    .describe(
      'Optional focus theme for the tour (e.g. "authentication flow", "error handling", "data fetching"). When omitted, a general architectural tour is generated.',
    ),
  maxStops: z
    .number()
    .int()
    .min(2)
    .max(30)
    .optional()
    .default(8)
    .describe('Maximum number of stops to include in the tour (default 8)'),
})
