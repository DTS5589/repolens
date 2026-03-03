import { getToken } from "next-auth/jwt"
import type { NextRequest } from "next/server"

/**
 * Extract the GitHub access token from the NextAuth JWT cookie.
 * Returns undefined if the user is not authenticated.
 * This runs server-side only — the token is never exposed to the client.
 */
export async function getAccessToken(
  request: NextRequest
): Promise<string | undefined> {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  })

  return (token?.accessToken as string) ?? undefined
}
