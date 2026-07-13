import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { IAircraftTrack } from '../opensky/types.js'

interface FavoriteFlight {
  icao24: string
  callsign: string
  addedAt: number
}

interface SearchHistoryEntry {
  query: string
  timestamp: number
  icao24?: string
}

interface AppState {
  favorites: FavoriteFlight[]
  recentlyViewed: IAircraftTrack[]
  searchHistory: SearchHistoryEntry[]
  selectedTrackedIcao: string | null
  addFavorite: (icao24: string, callsign: string) => void
  removeFavorite: (icao24: string) => void
  isFavorite: (icao24: string) => boolean
  addRecentlyViewed: (track: IAircraftTrack) => void
  clearRecentlyViewed: () => void
  addSearchHistory: (query: string, icao24?: string) => void
  clearSearchHistory: () => void
  setSelectedTrackedIcao: (icao24: string | null) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      favorites: [],
      recentlyViewed: [],
      searchHistory: [],
      selectedTrackedIcao: null,

      addFavorite: (icao24: string, callsign: string) => {
        const { favorites } = get()
        if (!favorites.find((f) => f.icao24 === icao24)) {
          set({ favorites: [...favorites, { icao24, callsign, addedAt: Date.now() }] })
        }
      },

      removeFavorite: (icao24: string) => {
        set({ favorites: get().favorites.filter((f) => f.icao24 !== icao24) })
      },

      isFavorite: (icao24: string) => {
        return get().favorites.some((f) => f.icao24 === icao24)
      },

      addRecentlyViewed: (track: IAircraftTrack) => {
        const { recentlyViewed } = get()
        const filtered = recentlyViewed.filter((t) => t.icao24 !== track.icao24)
        set({ recentlyViewed: [track, ...filtered].slice(0, 20) })
      },

      clearRecentlyViewed: () => {
        set({ recentlyViewed: [] })
      },

      addSearchHistory: (query: string, icao24?: string) => {
        const { searchHistory } = get()
        const filtered = searchHistory.filter((e) => e.query.toUpperCase() !== query.toUpperCase())
        set({ searchHistory: [{ query, timestamp: Date.now(), icao24 }, ...filtered].slice(0, 20) })
      },

      clearSearchHistory: () => {
        set({ searchHistory: [] })
      },
      setSelectedTrackedIcao: (icao24: string | null) => {
        set({ selectedTrackedIcao: icao24 })
      },
    }),
    {
      name: 'flight-tracker-storage',
      partialize: (state) => ({
        favorites: state.favorites,
        recentlyViewed: state.recentlyViewed,
        searchHistory: state.searchHistory,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) state.selectedTrackedIcao = null
      },
    }
  )
)
