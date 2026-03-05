import type { ChangelogPreset } from './types'

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

/**
 * Built-in changelog generation presets.
 *
 * Each entry provides a prompt template for a common changelog format.
 * Icons are `null` here — the UI layer maps preset IDs to icons at render
 * time (matching the docs preset pattern).
 *
 * To add a new preset:
 * 1. Add the new `ChangelogType` union member in `types.ts`.
 * 2. Add a new entry here with `id`, `label`, `description`, and `prompt`.
 * 3. Add an icon mapping in the UI component.
 */
export const CHANGELOG_PRESETS: ChangelogPreset[] = [
  {
    id: 'conventional',
    label: 'Conventional Commits',
    description: 'Structured changelog following the Conventional Commits specification',
    icon: null,
    prompt:
      'Generate a changelog in Conventional Commits format. Group changes under headings like Features, Bug Fixes, Breaking Changes, Performance Improvements, Refactoring, Documentation, Tests, and Chores. Use bullet points with commit scope in parentheses where applicable.',
  },
  {
    id: 'release-notes',
    label: 'Release Notes',
    description: 'User-facing release notes highlighting what changed and why it matters',
    icon: null,
    prompt:
      'Generate user-facing release notes. Focus on what changed from the user\'s perspective, not implementation details. Group into sections like Highlights, New Features, Improvements, Bug Fixes, and Breaking Changes. Write in clear, non-technical language where possible.',
  },
  {
    id: 'keep-a-changelog',
    label: 'Keep a Changelog',
    description: 'Changelog following the keepachangelog.com format',
    icon: null,
    prompt:
      'Generate a changelog following the Keep a Changelog format (https://keepachangelog.com). Use these exact section headings: Added, Changed, Deprecated, Removed, Fixed, Security. Only include sections that have entries. List each change as a bullet point.',
  },
  {
    id: 'custom',
    label: 'Custom Prompt',
    description: 'Provide your own instructions for changelog generation',
    icon: null,
    prompt: '',
  },
]
