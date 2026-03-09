import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * First path segments that must NOT be treated as `:owner/:repo` routes.
 * Checked case-insensitively against the first segment of the pathname.
 */
const RESERVED_SEGMENTS = new Set([
    'api',
    '_next',
    'compare',
    'favicon.ico',
    'site.webmanifest',
    'robots.txt',
    'public',
    'wasm',
])

/** Only allow valid GitHub username/repo characters: alphanumeric, hyphens, dots, underscores. */
const GITHUB_NAME_RE = /^[\w][\w.-]*$/

function addSecurityHeaders(response: NextResponse): void {
    response.headers.set('X-Frame-Options', 'DENY')
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
    response.headers.set('X-XSS-Protection', '1; mode=block')
}

export function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl

    // Strip trailing slash for consistent segment parsing (but not for "/")
    const normalizedPath = pathname.length > 1 && pathname.endsWith('/')
        ? pathname.slice(0, -1)
        : pathname

    // Split into non-empty segments: "/owner/repo" → ["owner", "repo"]
    const segments = normalizedPath.split('/').filter(Boolean)

    // Path-based repo rewrite: exactly 2 segments, first is not reserved, and both are valid GitHub names
    if (
        segments.length === 2
        && !RESERVED_SEGMENTS.has(segments[0].toLowerCase())
        && GITHUB_NAME_RE.test(segments[0])
        && GITHUB_NAME_RE.test(segments[1])
    ) {
        const [owner, repo] = segments
        const rewriteUrl = new URL('/', request.url)
        rewriteUrl.searchParams.set('repo', `https://github.com/${owner}/${repo}`)

        // Preserve any additional query params (e.g. ?view=docs)
        request.nextUrl.searchParams.forEach((value, key) => {
            if (key !== 'repo') {
                rewriteUrl.searchParams.set(key, value)
            }
        })

        const response = NextResponse.rewrite(rewriteUrl)
        addSecurityHeaders(response)
        return response
    }

    // Default: pass through with security headers
    const response = NextResponse.next()
    addSecurityHeaders(response)
    // Note: CSP is configured in next.config.mjs to avoid conflicts
    return response
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api/auth (NextAuth routes)
         * - api (other API routes — handled by route handlers)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public folder
         */
        '/((?!api/auth|api|_next/static|_next/image|favicon.ico|public/).*)',
    ],
}
