import { request } from '@/mobile/net'
import { rankSearch, type Crowd } from '@/mobile/search'
import type { SavedStatus } from '@/hooks/useSaved'

/**
 * kryo.to's public catalog. `/api/games*` allows any origin, so it is plain
 * `fetch`; `/api/requests` and the account routes do not, so those go through
 * the native request (net.ts). Only the fields shown are read; the download
 * `links` `/api/games` also returns are never touched.
 */

const API = 'https://kryo.to'

/** A game as `/api/games/<slug>` sends it: only the fields the page reads. */
export type GameFull = {
  slug: string
  title: string
  developer: string | null
  year: number | string | null
  genres: string[]
  tags?: string[]
  rating: number | null
  /** What it takes to install, e.g. "65 GB". */
  size?: string | null
  platforms?: string[]
  short: string | null
  description?: string[]
  features?: string[]
  dlc?: string[]
  price?: string | null
  multiplayer?: boolean
  coop?: boolean
  nsfw?: boolean | null
  cover: string | null
  cover_vertical?: string | null
  cover_horizontal?: string | null
  hero_image_override?: string | null
  steam_build_id?: string | null
  system_requirements?: { minimum?: string; recommended?: string } | null
  game_executable_path?: string | null
  game_launch_options?: { available?: { description?: string; executable?: string; arguments?: string; oslist?: string }[] } | null
  source?: string | null
  version?: string
  /** The compressed size of the download, e.g. "58.6 GB". */
  download_size?: string | null
  created_at?: string
  last_build_at?: string | null
  verification?: 'verified' | 'unverified' | 'broken'
  submitted_by_name?: string | null
  reviewed_by_name?: string | null
  anonymous?: boolean
  steam_positive?: number | null
  steam_negative?: number | null
  view_count?: number
  download_count?: number
}

export type Suggestion = { slug: string; title: string; cover: string | null; year?: number | string | null; nsfw?: boolean }

/** A game as `/api/games` lists it; only what ranking and a result row use. */
type Listed = {
  slug: string
  title: string
  cover?: string | null
  cover_vertical?: string | null
  year?: number | null
  nsfw?: boolean
  steam_positive?: number | string | null
  steam_negative?: number | string | null
  download_count?: number | string | null
}

export type GameDetail = {
  game: GameFull
  /** More like this. */
  related: GameFull[]
  hero: string | null
  /** The title's logo art, when Steam has some. */
  logo: string | null
  screenshots: string[]
}

async function getJson<T>(path: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API}${path}`, { credentials: 'omit' })
  } catch {
    throw new Error('Could not reach kryo.to.')
  }
  if (!res.ok) throw new Error(`kryo.to answered ${res.status}.`)
  return (await res.json()) as T
}

/** Steam reviews and downloads per game, kept for the session: the same games come back as the query grows. */
const crowds = new Map<string, Promise<Crowd>>()

function crowdOf(slug: string): Promise<Crowd> {
  let known = crowds.get(slug)
  if (!known) {
    known = getJson<{ game?: Listed }>(`/api/games/${encodeURIComponent(slug)}`).then(({ game }) => countOf(game))
    crowds.set(slug, known)
    known.catch(() => crowds.delete(slug))
  }
  return known
}

function countOf(g: Listed | undefined): Crowd {
  return { reviews: Number(g?.steam_positive ?? 0) + Number(g?.steam_negative ?? 0), downloads: Number(g?.download_count ?? 0) }
}

/**
 * Games matching what was typed. kryo.to's typeahead finds them (typos and
 * acronyms too) but orders them by match and rating only; its game list has
 * the Steam review and download counts, so the two are put together and the
 * most played come first (`rankSearch`). A typeahead match the list does not
 * hold (an acronym, a typo) has its counts fetched from its own page.
 */
export async function search(q: string): Promise<Suggestion[]> {
  const [fuzzy, listed] = await Promise.all([
    getJson<{ results?: Suggestion[] }>(`/api/games/search?q=${encodeURIComponent(q)}&limit=20`),
    getJson<{ games?: Listed[] }>(`/api/games?q=${encodeURIComponent(q)}&limit=30`).catch(() => ({ games: [] as Listed[] })),
  ])
  const found = new Map<string, Suggestion>()
  const crowd = new Map<string, Crowd>()
  for (const g of listed.games ?? []) {
    found.set(g.slug, { slug: g.slug, title: g.title, cover: g.cover_vertical ?? g.cover ?? null, year: g.year, nsfw: g.nsfw })
    crowd.set(g.slug, countOf(g))
    crowds.set(g.slug, Promise.resolve(countOf(g)))
  }
  const extra = (fuzzy.results ?? []).filter((r) => !found.has(r.slug))
  for (const r of extra) found.set(r.slug, r)
  await Promise.all(
    extra.slice(0, 10).map((r) =>
      crowdOf(r.slug).then(
        (c) => void crowd.set(r.slug, c),
        () => undefined,
      ),
    ),
  )
  return rankSearch(q, [...found.values()], crowd).slice(0, 30)
}

/** One game with its related games and art; the hero follows the desktop's precedence (Steam's, then staff's, then the wide cover). */
export async function game(slug: string): Promise<GameDetail> {
  const res = await fetch(`${API}/api/games/${encodeURIComponent(slug)}`, { credentials: 'omit' }).catch(() => null)
  if (!res) throw new Error('Could not reach kryo.to.')
  if (res.status === 404) throw new Error(`kryo.to has no game at /game/${slug}.`)
  if (!res.ok) throw new Error(`kryo.to answered ${res.status}.`)
  const body: { game: GameFull; related?: GameFull[]; art?: { hero?: string | null; logo?: string | null; screenshots?: string[] } } = await res.json()
  const hero = body.art?.hero?.trim() || body.game.hero_image_override || body.game.cover_horizontal || null
  return { game: body.game, related: body.related ?? [], hero, logo: body.art?.logo ?? null, screenshots: body.art?.screenshots ?? [] }
}

export type Release = {
  id: string
  version: string
  label: string | null
  source: string | null
  download_size: string | null
  created_at: string
  primary: boolean
  archived: boolean
}

/** Every full release of a game, newest first, the one players get now flagged. */
export async function releases(slug: string): Promise<Release[]> {
  const body = await getJson<{ releases?: Release[] }>(`/api/games/${encodeURIComponent(slug)}/downloads`)
  return body.releases ?? []
}

export type Comment = {
  id: string
  body: string
  createdAt: string
  edited: boolean
  deleted: boolean
  pinned: boolean
  author: { username: string; displayName: string | null; avatarUrl: string | null; tier: string | null; badge?: { text: string } | null }
  replies: Comment[]
}

export async function comments(slug: string): Promise<Comment[]> {
  const body = await getJson<{ comments?: Comment[] }>(`/api/games/${encodeURIComponent(slug)}/comments`)
  return body.comments ?? []
}

/** Add a comment (or reply) as the signed-in account. */
export async function postComment(token: string, slug: string, body: string, parentId?: string) {
  await request(`${API}/api/games/${encodeURIComponent(slug)}/comments`, { method: 'POST', token, body: { body, ...(parentId ? { parentId } : {}) } })
}

export type TestReport = {
  id: string
  platform: string | null
  outcome: 'works' | 'setup' | 'partial' | 'broken'
  version: string
  current: boolean
  notes: string | null
  tester: { name: string }
  testedAt: string
}

export type Tested = { headline: string; verification: string; reports: TestReport[] }

/** What testers found, or null for a game nobody has tested yet. */
export async function tested(slug: string): Promise<Tested | null> {
  const body = await getJson<{ summary?: { headline?: string; verification?: string }; reports?: TestReport[] }>(`/api/games/${encodeURIComponent(slug)}/compatibility`).catch(() => null)
  if (!body?.summary) return null
  return { headline: body.summary.headline ?? '', verification: body.summary.verification ?? 'unverified', reports: body.reports ?? [] }
}

/** Set a game's status on the signed-in account; `null` takes it out. */
export async function setSaved(token: string, game: Pick<GameFull, 'slug' | 'title' | 'cover'>, status: SavedStatus | null) {
  if (status === null) await request(`${API}/api/account/library?slug=${encodeURIComponent(game.slug)}`, { method: 'DELETE', token })
  else await request(`${API}/api/account/library`, { method: 'PUT', token, body: { slug: game.slug, status, title: game.title, cover: game.cover } })
}

export type SavedCounts = Record<SavedStatus | 'total', number>

export type SavedEntry = { slug: string; status: SavedStatus; title?: string; cover?: string | null; updatedAt?: string }

export async function savedLibrary(token: string): Promise<{ counts: Partial<SavedCounts>; entries: SavedEntry[] }> {
  const { json } = await request<{ counts?: Partial<SavedCounts>; entries?: SavedEntry[] }>(`${API}/api/account/library`, { token })
  return { counts: json.counts ?? {}, entries: json.entries ?? [] }
}
