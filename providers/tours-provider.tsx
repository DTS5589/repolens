"use client"

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react'
import type { Tour, TourStop } from '@/types/tours'
import {
  getToursByRepo,
  saveTour as saveTourToDB,
  deleteTour as deleteTourFromDB,
} from '@/lib/cache/tour-cache'

// ---------------------------------------------------------------------------
// Context type
// ---------------------------------------------------------------------------

interface ToursContextType {
  tours: Tour[]
  activeTour: Tour | null
  activeStopIndex: number
  isPlaying: boolean

  // CRUD
  loadTours: (repoKey: string) => Promise<void>
  createTour: (name: string, description: string, repoKey: string) => Promise<Tour>
  saveTour: (tour: Tour) => Promise<void>
  deleteTour: (id: string) => Promise<void>

  // Playback
  startTour: (tour: Tour) => void
  stopTour: () => void
  goToStop: (index: number) => void
  nextStop: () => void
  prevStop: () => void

  // Stop mutations
  addStop: (stop: Omit<TourStop, 'id'>) => void
  removeStop: (stopId: string) => void
  updateStop: (stopId: string, updates: Partial<TourStop>) => void
  reorderStops: (stopIds: string[]) => void
}

const ToursContext = createContext<ToursContextType | null>(null)

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ToursProvider({ children }: { children: ReactNode }) {
  const [tours, setTours] = useState<Tour[]>([])
  const [activeTour, setActiveTour] = useState<Tour | null>(null)
  const [activeStopIndex, setActiveStopIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)

  // ---- CRUD ---------------------------------------------------------------

  const loadTours = useCallback(async (repoKey: string) => {
    const loaded = await getToursByRepo(repoKey)
    setTours(loaded)
  }, [])

  const createTour = useCallback(
    async (name: string, description: string, repoKey: string): Promise<Tour> => {
      const now = Date.now()
      const tour: Tour = {
        id: crypto.randomUUID(),
        name,
        description,
        repoKey,
        stops: [],
        createdAt: now,
        updatedAt: now,
      }
      await saveTourToDB(tour)
      setTours((prev) => [tour, ...prev])
      return tour
    },
    [],
  )

  const saveTour = useCallback(async (tour: Tour) => {
    await saveTourToDB(tour)
    setTours((prev) => prev.map((t) => (t.id === tour.id ? { ...tour, updatedAt: Date.now() } : t)))
    // Keep activeTour in sync if it's the one being saved
    setActiveTour((prev) => (prev?.id === tour.id ? { ...tour, updatedAt: Date.now() } : prev))
  }, [])

  const deleteTour = useCallback(
    async (id: string) => {
      await deleteTourFromDB(id)
      setTours((prev) => prev.filter((t) => t.id !== id))
      // If the deleted tour is active, stop playback
      setActiveTour((prev) => {
        if (prev?.id === id) {
          setIsPlaying(false)
          setActiveStopIndex(0)
          return null
        }
        return prev
      })
    },
    [],
  )

  // ---- Playback -----------------------------------------------------------

  const startTour = useCallback((tour: Tour) => {
    setActiveTour(tour)
    setActiveStopIndex(0)
    setIsPlaying(true)
  }, [])

  const stopTour = useCallback(() => {
    setActiveTour(null)
    setActiveStopIndex(0)
    setIsPlaying(false)
  }, [])

  const goToStop = useCallback(
    (index: number) => {
      setActiveTour((tour) => {
        if (!tour) return null
        const clamped = Math.max(0, Math.min(index, tour.stops.length - 1))
        setActiveStopIndex(clamped)
        return tour
      })
    },
    [],
  )

  const nextStop = useCallback(() => {
    setActiveStopIndex((prev) => {
      if (!activeTour) return prev
      return Math.min(prev + 1, activeTour.stops.length - 1)
    })
  }, [activeTour])

  const prevStop = useCallback(() => {
    setActiveStopIndex((prev) => Math.max(prev - 1, 0))
  }, [])

  // ---- Stop mutations (operate on activeTour) -----------------------------

  const addStop = useCallback(
    (stop: Omit<TourStop, 'id'>) => {
      setActiveTour((prev) => {
        if (!prev) return null
        const newStop: TourStop = { ...stop, id: crypto.randomUUID() }
        const updated: Tour = {
          ...prev,
          stops: [...prev.stops, newStop],
          updatedAt: Date.now(),
        }
        setTours((all) => all.map((t) => (t.id === updated.id ? updated : t)))
        saveTourToDB(updated).catch((err) => console.error('Failed to persist tour:', err))
        return updated
      })
    },
    [],
  )

  const removeStop = useCallback(
    (stopId: string) => {
      setActiveTour((prev) => {
        if (!prev) return null
        const updated: Tour = {
          ...prev,
          stops: prev.stops.filter((s) => s.id !== stopId),
          updatedAt: Date.now(),
        }
        setTours((all) => all.map((t) => (t.id === updated.id ? updated : t)))
        saveTourToDB(updated).catch((err) => console.error('Failed to persist tour:', err))
        // Clamp activeStopIndex if needed
        setActiveStopIndex((idx) => Math.min(idx, Math.max(0, updated.stops.length - 1)))
        return updated
      })
    },
    [],
  )

  const updateStop = useCallback(
    (stopId: string, updates: Partial<TourStop>) => {
      setActiveTour((prev) => {
        if (!prev) return null
        const updated: Tour = {
          ...prev,
          stops: prev.stops.map((s) => (s.id === stopId ? { ...s, ...updates } : s)),
          updatedAt: Date.now(),
        }
        setTours((all) => all.map((t) => (t.id === updated.id ? updated : t)))
        saveTourToDB(updated).catch((err) => console.error('Failed to persist tour:', err))
        return updated
      })
    },
    [],
  )

  const reorderStops = useCallback(
    (stopIds: string[]) => {
      setActiveTour((prev) => {
        if (!prev) return null
        const stopMap = new Map(prev.stops.map((s) => [s.id, s]))
        const reordered = stopIds
          .map((id) => stopMap.get(id))
          .filter((s): s is TourStop => s !== undefined)
        const updated: Tour = {
          ...prev,
          stops: reordered,
          updatedAt: Date.now(),
        }
        setTours((all) => all.map((t) => (t.id === updated.id ? updated : t)))
        saveTourToDB(updated).catch((err) => console.error('Failed to persist tour:', err))
        return updated
      })
    },
    [],
  )

  // ---- Context value (memoized) -------------------------------------------

  const value = useMemo<ToursContextType>(
    () => ({
      tours,
      activeTour,
      activeStopIndex,
      isPlaying,
      loadTours,
      createTour,
      saveTour,
      deleteTour,
      startTour,
      stopTour,
      goToStop,
      nextStop,
      prevStop,
      addStop,
      removeStop,
      updateStop,
      reorderStops,
    }),
    [
      tours,
      activeTour,
      activeStopIndex,
      isPlaying,
      loadTours,
      createTour,
      saveTour,
      deleteTour,
      startTour,
      stopTour,
      goToStop,
      nextStop,
      prevStop,
      addStop,
      removeStop,
      updateStop,
      reorderStops,
    ],
  )

  return <ToursContext.Provider value={value}>{children}</ToursContext.Provider>
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTours(): ToursContextType {
  const context = useContext(ToursContext)
  if (context === null) {
    throw new Error('useTours must be used within a ToursProvider')
  }
  return context
}
