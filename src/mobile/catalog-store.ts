import { useSyncExternalStore } from 'react'

/**
 * kryo.to's whole catalog as cards (`/api/games/cards`, newest first), paged
 * in the background and kept for the session. Browse filters and sorts it
 * here, as the desktop's Browse does, so the count, the genres and the order
 * are the same ones.
 */

export type CatalogCard = {
  slug: string
  title: string
  cover: string
  cover_vertical?: string | null
  short: string
  developer: string
  genres: string[]
  tags: string[]
  /** 0-100, the share of positive reviews. */
  rating: number
  year: number
  download_size?: string | null
  created_at_ms?: number
  built_at_ms?: number
  /** Somebody ran this build and it works. */
  verified?: boolean
  nsfw?: boolean | null
}

export type Sort = 'new' | 'rating' | 'az' | 'released'

export const SORT_LABEL: Record<Sort, string> = {
  new: 'newest added',
  rating: 'top rated',
  az: 'A to Z',
  released: 'newest released',
}

export type CatalogState = {
  cards: CatalogCard[]
  /** How many games kryo.to says there are. */
  total: number
  /** More pages are still on their way. */
  loading: boolean
  error: string | null
}

const API = 'https://kryo.to'
const PAGE = 500
/** A loaded catalog is reused this long before Browse asks again. */
const FRESH_MS = 10 * 60 * 1000

let state: CatalogState = { cards: [], total: 0, loading: false, error: null }
let loadedAt = 0
let running = false
const listeners = new Set<() => void>()

function publish(next: CatalogState) {
  state = next
  listeners.forEach((l) => l())
}

async function page(offset: number): Promise<{ cards: CatalogCard[]; total: number }> {
  const res = await fetch(`${API}/api/games/cards?limit=${PAGE}&offset=${offset}`, { credentials: 'omit' }).catch(() => null)
  if (!res) throw new Error('Could not reach kryo.to.')
  if (!res.ok) throw new Error(`kryo.to answered ${res.status}.`)
  const body: { cards?: CatalogCard[]; total?: number } = await res.json()
  return { cards: body.cards ?? [], total: body.total ?? 0 }
}

/** Loads the catalog, or refreshes it when it is stale. Does nothing while a load is running or the copy is fresh. */
export async function loadCatalog(force = false): Promise<void> {
  if (running || (!force && state.cards.length > 0 && Date.now() - loadedAt < FRESH_MS)) return
  running = true
  publish({ ...state, loading: true, error: null })
  try {
    let all: CatalogCard[] = []
    for (;;) {
      const next = await page(all.length)
      all = [...all, ...next.cards]
      // The first page is on screen at once; the rest fill in behind it.
      publish({ cards: all, total: Math.max(next.total, all.length), loading: true, error: null })
      if (next.cards.length < PAGE || all.length >= next.total) break
    }
    loadedAt = Date.now()
    publish({ ...state, loading: false })
  } catch (e) {
    publish({ ...state, loading: false, error: e instanceof Error ? e.message : String(e) })
  } finally {
    running = false
  }
}

export function useCatalog(): CatalogState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
  )
}

/** The desktop's own ordering, so a tie never shuffles. */
export function compareBy(sort: Sort) {
  return (a: CatalogCard, b: CatalogCard): number => {
    switch (sort) {
      case 'rating':
        return b.rating - a.rating || b.year - a.year || a.title.localeCompare(b.title)
      case 'az':
        return a.title.localeCompare(b.title)
      case 'released': {
        const ya = a.year || -Infinity
        const yb = b.year || -Infinity
        return yb - ya || a.title.localeCompare(b.title)
      }
      case 'new': {
        // Added or given a new build, whichever is later.
        const latest = (g: CatalogCard) => Math.max(g.created_at_ms ?? 0, g.built_at_ms ?? 0)
        return latest(b) - latest(a) || a.title.localeCompare(b.title)
      }
    }
  }
}
