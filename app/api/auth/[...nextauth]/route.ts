import { handlers } from "@/lib/auth"

const isAuthConfigured = !!(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET)

/**
 * When auth is not configured (no secret set), return a graceful empty response
 * instead of letting NextAuth throw MissingSecret → 500.
 */
export const GET = isAuthConfigured
  ? handlers.GET
  : () => Response.json({})

export const POST = isAuthConfigured
  ? handlers.POST
  : () => Response.json({})
