import { describe, it, expect } from 'vitest'
import type { Tour, TourStop, TourState } from '../tours'

// ---------------------------------------------------------------------------
// Type-level verification: these tests confirm our types accept valid data
// and the shapes we construct at runtime match the interface contracts.
// ---------------------------------------------------------------------------

describe('Tour types', () => {
  it('TourStop can be constructed with all required fields', () => {
    const stop: TourStop = {
      id: 'stop-1',
      filePath: 'src/index.ts',
      startLine: 1,
      endLine: 20,
      annotation: 'Entry point of the application',
    }

    expect(stop.id).toBe('stop-1')
    expect(stop.filePath).toBe('src/index.ts')
    expect(stop.startLine).toBe(1)
    expect(stop.endLine).toBe(20)
    expect(stop.annotation).toBe('Entry point of the application')
  })

  it('TourStop accepts optional title', () => {
    const stop: TourStop = {
      id: 'stop-2',
      filePath: 'src/utils.ts',
      startLine: 5,
      endLine: 15,
      annotation: 'Utility helpers',
      title: 'Utilities',
    }

    expect(stop.title).toBe('Utilities')
  })

  it('TourStop without title has title as undefined', () => {
    const stop: TourStop = {
      id: 'stop-3',
      filePath: 'src/app.ts',
      startLine: 1,
      endLine: 10,
      annotation: 'App',
    }

    expect(stop.title).toBeUndefined()
  })

  it('Tour can be constructed with all required fields', () => {
    const tour: Tour = {
      id: 'tour-1',
      name: 'Architecture Tour',
      description: 'Walk through the main architecture',
      repoKey: 'owner/repo',
      stops: [],
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    }

    expect(tour.id).toBe('tour-1')
    expect(tour.name).toBe('Architecture Tour')
    expect(tour.description).toBe('Walk through the main architecture')
    expect(tour.repoKey).toBe('owner/repo')
    expect(tour.stops).toEqual([])
    expect(tour.createdAt).toBe(1700000000000)
    expect(tour.updatedAt).toBe(1700000000000)
  })

  it('Tour with stops preserves stop order and data', () => {
    const stops: TourStop[] = [
      { id: 's1', filePath: 'a.ts', startLine: 1, endLine: 5, annotation: 'First' },
      { id: 's2', filePath: 'b.ts', startLine: 10, endLine: 20, annotation: 'Second', title: 'B' },
    ]

    const tour: Tour = {
      id: 'tour-2',
      name: 'Multi-stop',
      description: 'Has multiple stops',
      repoKey: 'owner/repo',
      stops,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    expect(tour.stops).toHaveLength(2)
    expect(tour.stops[0].id).toBe('s1')
    expect(tour.stops[1].title).toBe('B')
  })

  it('TourState can be constructed with valid defaults', () => {
    const state: TourState = {
      tours: [],
      activeTour: null,
      activeStopIndex: 0,
      isPlaying: false,
    }

    expect(state.tours).toEqual([])
    expect(state.activeTour).toBeNull()
    expect(state.activeStopIndex).toBe(0)
    expect(state.isPlaying).toBe(false)
  })

  it('TourState satisfies interface with active tour', () => {
    const tour: Tour = {
      id: 't1',
      name: 'Active',
      description: '',
      repoKey: 'o/r',
      stops: [{ id: 's1', filePath: 'f.ts', startLine: 1, endLine: 5, annotation: 'a' }],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    const state: TourState = {
      tours: [tour],
      activeTour: tour,
      activeStopIndex: 0,
      isPlaying: true,
    }

    expect(state.isPlaying).toBe(true)
    expect(state.activeTour).toBe(tour)
    expect(state.activeStopIndex).toBe(0)
  })
})
