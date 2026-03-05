import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getCached,
  getStale,
  setCache,
  invalidate,
  invalidatePattern,
  clearCache,
} from '../memory-cache'

describe('memory-cache', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    clearCache()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // -----------------------------------------------------------------------
  // set / get — basic store and retrieve
  // -----------------------------------------------------------------------

  describe('setCache / getCached', () => {
    it('stores and retrieves a value within TTL', () => {
      setCache('key1', { hello: 'world' }, 5_000)
      expect(getCached('key1')).toEqual({ hello: 'world' })
    })

    it('returns null for a non-existent key', () => {
      expect(getCached('missing')).toBeNull()
    })

    it('overwrites an existing key with a new value', () => {
      setCache('key1', 'first', 5_000)
      setCache('key1', 'second', 5_000)
      expect(getCached('key1')).toBe('second')
    })

    it('stores different types (string, number, object, array)', () => {
      setCache('str', 'hello', 1_000)
      setCache('num', 42, 1_000)
      setCache('obj', { a: 1 }, 1_000)
      setCache('arr', [1, 2, 3], 1_000)

      expect(getCached('str')).toBe('hello')
      expect(getCached('num')).toBe(42)
      expect(getCached('obj')).toEqual({ a: 1 })
      expect(getCached('arr')).toEqual([1, 2, 3])
    })
  })

  // -----------------------------------------------------------------------
  // TTL expiration
  // -----------------------------------------------------------------------

  describe('TTL expiration', () => {
    it('returns value when within TTL', () => {
      setCache('key', 'data', 5_000)
      vi.advanceTimersByTime(4_999)
      expect(getCached('key')).toBe('data')
    })

    it('returns null when TTL has expired', () => {
      setCache('key', 'data', 5_000)
      vi.advanceTimersByTime(5_001)
      expect(getCached('key')).toBeNull()
    })

    it('returns null exactly at TTL boundary + 1ms', () => {
      setCache('key', 'data', 1_000)
      vi.advanceTimersByTime(1_001)
      expect(getCached('key')).toBeNull()
    })

    it('returns value exactly at TTL boundary', () => {
      setCache('key', 'data', 1_000)
      vi.advanceTimersByTime(1_000)
      expect(getCached('key')).toBe('data')
    })
  })

  // -----------------------------------------------------------------------
  // getStale — returns data with isStale flag
  // -----------------------------------------------------------------------

  describe('getStale', () => {
    it('returns null for a non-existent key', () => {
      expect(getStale('missing')).toBeNull()
    })

    it('returns data with isStale: false when within TTL', () => {
      setCache('key', 'fresh', 5_000)
      vi.advanceTimersByTime(3_000)
      const result = getStale('key')
      expect(result).toEqual({ data: 'fresh', isStale: false })
    })

    it('returns data with isStale: true after TTL expires', () => {
      setCache('key', 'old', 5_000)
      vi.advanceTimersByTime(6_000)
      const result = getStale('key')
      expect(result).toEqual({ data: 'old', isStale: true })
    })

    it('returns data even long after TTL (stale data preserved)', () => {
      setCache('key', 'ancient', 1_000)
      vi.advanceTimersByTime(100_000)
      const result = getStale('key')
      expect(result).not.toBeNull()
      expect(result!.data).toBe('ancient')
      expect(result!.isStale).toBe(true)
    })
  })

  // -----------------------------------------------------------------------
  // invalidate — remove a single key
  // -----------------------------------------------------------------------

  describe('invalidate', () => {
    it('removes a single entry by exact key', () => {
      setCache('a', 1, 5_000)
      setCache('b', 2, 5_000)

      invalidate('a')

      expect(getCached('a')).toBeNull()
      expect(getCached('b')).toBe(2)
    })

    it('is a no-op for a non-existent key', () => {
      // Should not throw
      invalidate('missing')
      expect(getCached('missing')).toBeNull()
    })
  })

  // -----------------------------------------------------------------------
  // invalidatePattern — remove keys matching a prefix
  // -----------------------------------------------------------------------

  describe('invalidatePattern', () => {
    it('removes all keys matching the prefix', () => {
      setCache('repo:owner/name', 'data1', 5_000)
      setCache('repo:owner/other', 'data2', 5_000)
      setCache('tree:owner/name:sha', 'data3', 5_000)

      invalidatePattern('repo:owner/')

      expect(getCached('repo:owner/name')).toBeNull()
      expect(getCached('repo:owner/other')).toBeNull()
      expect(getCached('tree:owner/name:sha')).toBe('data3')
    })

    it('does nothing when no keys match', () => {
      setCache('key1', 'val', 5_000)
      invalidatePattern('unrelated:')
      expect(getCached('key1')).toBe('val')
    })

    it('removes all keys when prefix is empty string', () => {
      setCache('a', 1, 5_000)
      setCache('b', 2, 5_000)
      invalidatePattern('')
      expect(getCached('a')).toBeNull()
      expect(getCached('b')).toBeNull()
    })
  })

  // -----------------------------------------------------------------------
  // clear — remove all entries
  // -----------------------------------------------------------------------

  describe('clearCache', () => {
    it('removes all cached entries', () => {
      setCache('x', 1, 5_000)
      setCache('y', 2, 5_000)
      setCache('z', 3, 5_000)

      clearCache()

      expect(getCached('x')).toBeNull()
      expect(getCached('y')).toBeNull()
      expect(getCached('z')).toBeNull()
    })

    it('is safe to call on an already-empty cache', () => {
      clearCache()
      expect(getCached('any')).toBeNull()
    })
  })

  // -----------------------------------------------------------------------
  // LRU eviction — oldest entry evicted when exceeding MAX_ENTRIES (100)
  // -----------------------------------------------------------------------

  describe('LRU eviction', () => {
    it('evicts the oldest entry when cache exceeds 100 entries', () => {
      // Fill 101 entries — the first one should be evicted
      for (let i = 0; i <= 100; i++) {
        setCache(`key-${i}`, i, 60_000)
      }

      // key-0 was inserted first and should have been evicted
      expect(getCached('key-0')).toBeNull()
      // key-1 should still exist (now the oldest)
      expect(getCached('key-1')).toBe(1)
      // The latest entry should exist
      expect(getCached('key-100')).toBe(100)
    })

    it('updates insertion order when re-setting an existing key', () => {
      // Fill exactly 100 entries (keys 0..99)
      for (let i = 0; i < 100; i++) {
        setCache(`key-${i}`, i, 60_000)
      }

      // Re-set key-0 to move it to the end
      setCache('key-0', 'refreshed', 60_000)

      // Now add key-100 — this makes 101 entries, so the oldest (key-1) is evicted
      setCache('key-100', 100, 60_000)

      // key-0 was refreshed, so it should survive
      expect(getCached('key-0')).toBe('refreshed')
      // key-1 was the oldest after key-0 was refreshed
      expect(getCached('key-1')).toBeNull()
      expect(getCached('key-100')).toBe(100)
    })
  })

  // -----------------------------------------------------------------------
  // Cache key namespace isolation
  // -----------------------------------------------------------------------

  describe('key namespace isolation', () => {
    it('different prefixes do not collide', () => {
      setCache('repo:owner/name', 'repo-data', 5_000)
      setCache('tree:owner/name:sha', 'tree-data', 5_000)
      setCache('file:owner/name:main:README.md', 'file-data', 5_000)

      expect(getCached('repo:owner/name')).toBe('repo-data')
      expect(getCached('tree:owner/name:sha')).toBe('tree-data')
      expect(getCached('file:owner/name:main:README.md')).toBe('file-data')
    })
  })
})
