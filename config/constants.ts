// Layout constants
export const SIDEBAR_CONFIG = {
    MIN_WIDTH: 240,
    MAX_WIDTH: 500,
    DEFAULT_WIDTH: 320,
} as const

// Preview retry configuration
export const PREVIEW_RETRY_CONFIG = {
    MAX_RETRIES: 3,
    INITIAL_DELAY: 3000, // 3 seconds
    VERIFICATION_TIMEOUT: 5000, // 5 seconds
    VERIFICATION_RETRIES: 3,
    VERIFICATION_DELAY: 2000, // 2 seconds
} as const

// UI Constants
export const UI_CONFIG = {
    HEADER_HEIGHT: 48, // 12 * 4 = 48px
    ANIMATION_DURATION: 200,
    TEXTAREA_MIN_HEIGHT: 96, // 24 * 4 = 96px
} as const

// Status types for file explorer
export const FILE_STATUS = {
    GENERATED: 'generated',
    MODIFIED: 'modified',
    UNCHANGED: 'unchanged',
} as const
