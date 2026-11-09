import { ApiError, request } from '@/mobile/net'
import { API, siteUrl } from '@/mobile/auth'
import { rankSearch, type Crowd } from '@/mobile/search'
import type { SavedStatus } from '@/hooks/useSaved'
import type { UploadPhase } from '@/mobile/upload'
import type { MentionCandidate } from '@/rich/RichEditor'

/**
 * kryo.to's public catalog. `/api/games*` allows any origin, so it is plain
 * `fetch`; `/api/requests` and the account routes do not, so those go through
 * the native request (net.ts). Only the fields shown are read; the download
 * `links` `/api/games` also returns are never touched.
 */


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

/** Somebody the page credits. kryo.to has masked it already: no username means no link. */
export type Credit = { name: string; username: string | null }

export type GameDetail = {
  game: GameFull
  /** Who added it and who reviewed it; null when anonymous or nobody. */
  credits: { addedBy?: Credit | null; reviewedBy?: Credit | null }
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

/** A listing's size as kryo.to prints it ("3.1 GB"), in bytes; null when it says none. */
export function sizeBytes(text: string | null | undefined): number | null {
  const [, number, name] = /([\d.,]+)\s*(KB|MB|GB|TB)/i.exec(text ?? '') ?? []
  if (!number || !name) return null
  const value = Number(number.replace(',', '.'))
  const unit = { KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12 }[name.toUpperCase() as 'KB' | 'MB' | 'GB' | 'TB']
  return value > 0 ? value * unit : null
}

/** Each listed game's download size by slug, for sorting a library. Unlisted games are simply absent. */
export async function downloadSizes(slugs: string[]): Promise<Map<string, number>> {
  const parts: string[][] = []
  for (let i = 0; i < slugs.length; i += 100) parts.push(slugs.slice(i, i + 100))
  const pages = await Promise.all(
    parts.map((part) => getJson<{ cards?: { slug: string; download_size?: string | null }[] }>(`/api/games/cards?slugs=${part.map(encodeURIComponent).join(',')}`)),
  )
  const sizes = new Map<string, number>()
  for (const card of pages.flatMap((page) => page.cards ?? [])) {
    const bytes = sizeBytes(card.download_size)
    if (bytes) sizes.set(card.slug, bytes)
  }
  return sizes
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
  // A 404 may still be a game on its way: GamePage asks for its coming-soon page then.
  if (res.status === 404) throw new ApiError(`kryo.to has no game at /game/${slug}.`, 404)
  if (!res.ok) throw new Error(`kryo.to answered ${res.status}.`)
  const body: { game: GameFull; credits?: GameDetail['credits']; related?: GameFull[]; art?: { hero?: string | null; logo?: string | null; screenshots?: string[] } } = await res.json()
  const hero = body.art?.hero?.trim() || body.game.hero_image_override || body.game.cover_horizontal || null
  return { game: body.game, credits: body.credits ?? {}, related: body.related ?? [], hero, logo: body.art?.logo ?? null, screenshots: body.art?.screenshots ?? [] }
}

/**
 * A game on its way, as its coming-soon page on kryo.to shows it
 * (`/api/games/<slug>/coming-soon`). kryo.to masks it: `slot.title` is only the
 * letters that have arrived, `titleHidden` the slots still to come, and
 * `uploader` is null for an anonymous account (read as "Kryoto").
 */
export type ComingSoon = {
  slot: { id: string; slug: string | null; cover: string | null; phase: UploadPhase; percent: number; updated_at: string; title: string; titleHidden: number }
  reveal: number
  nameReveal: number
  hasProgress: boolean
  /** Which person the build is waiting on, once it is in review. */
  review: 'tester' | 'staff' | null
  reviewSince: string | null
  request: { slug: string; title: string } | null
  uploader: { username: string; name: string } | null
  dlc: { id: string; kind: 'dlc' | 'update'; name: string | null; phase: UploadPhase; percent: number; hasProgress: boolean }[]
}

/** The coming-soon page of `slug`; null when nothing is on its way there (or it has gone live). */
export async function comingSoon(slug: string): Promise<ComingSoon | null> {
  const res = await fetch(`${API}/api/games/${encodeURIComponent(slug)}/coming-soon`, { credentials: 'omit', cache: 'no-store' }).catch(() => null)
  if (!res) throw new Error('Could not reach kryo.to.')
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`kryo.to answered ${res.status}.`)
  return (await res.json()) as ComingSoon
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

export type CommentAttachment = { id: string; kind: 'image' | 'video' | 'audio'; url: string; name: string; width?: number | null; height?: number | null }

export type Comment = {
  id: string
  body: string
  createdAt: string
  edited: boolean
  deleted: boolean
  author: { username: string; displayName: string | null; avatarUrl: string | null; tier: string | null; repacker?: boolean }
  /** The reply this answers; `gone` when it was removed or cannot be shown. */
  replyTo?: { id: string; gone: boolean; name: string | null; username: string | null; avatarUrl: string | null; excerpt: string } | null
  attachments?: CommentAttachment[]
  /** On a write-up: whether they recommend the game, the build, and the play time Kryoto Desktop counted. */
  /** `topOfWeek`: the write-up with the most reactions on Kryoto this week (missing from an older kryo.to). */
  writeup?: { recommends: boolean | null; build: string | null; playSeconds: number | null; topOfWeek?: boolean } | null
  /** On a write-up: "helpful" votes as the signed-in account sees them. */
  helpful?: { count: number; mine: boolean; can: boolean }
  /** The signed-in account wrote it (kryo.to sets it even for an anonymous author). */
  canEdit?: boolean
  replies: Comment[]
}

export async function comments(slug: string): Promise<Comment[]> {
  const body = await getJson<{ comments?: Comment[] }>(`/api/games/${encodeURIComponent(slug)}/comments`)
  return body.comments ?? []
}

export type RecommendShare = { yes: number; said: number; percent: number }

/**
 * A game's write-ups: what players thought of it, each with its replies, and
 * the share that recommends it once enough have said. Signed in, kryo.to also
 * says which is yours and which you found helpful.
 */
export async function writeups(slug: string, token?: string | null): Promise<{ list: Comment[]; share: RecommendShare | null }> {
  const { json } = await request<{ writeups?: Comment[]; share?: RecommendShare | null }>(`${API}/api/games/${encodeURIComponent(slug)}/writeups`, { token })
  return { list: json.writeups ?? [], share: json.share ?? null }
}

export type WriteupInput = { body: string; recommends: boolean | null; build: string | null; showPlaytime: boolean }

/** Post your write-up (`edit`: change the one you have). */
export async function saveWriteup(token: string, slug: string, input: WriteupInput, edit = false) {
  await request(`${API}/api/games/${encodeURIComponent(slug)}/writeups`, { method: edit ? 'PATCH' : 'POST', token, body: input })
}

/** Say a write-up helped you, or take it back. */
export async function setHelpful(token: string, id: string, helpful: boolean): Promise<{ count: number; mine: boolean }> {
  const { json } = await request<{ count: number; mine: boolean }>(`${API}/api/comments/${encodeURIComponent(id)}/helpful`, { method: 'POST', token, body: { helpful } })
  return json
}

/** What Kryoto Desktop counted on this game for the account, in seconds (0 for none). */
export async function playedSeconds(token: string, slug: string): Promise<number> {
  const { json } = await request<Record<string, number>>(`${API}/api/account/playtime?slugs=${encodeURIComponent(slug)}`, { token })
  const v = json[slug]
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/** Add a comment (or reply) as the signed-in account. */
export async function postComment(token: string, slug: string, body: string, parentId?: string) {
  await request(`${API}/api/games/${encodeURIComponent(slug)}/comments`, { method: 'POST', token, body: { body, ...(parentId ? { parentId } : {}) } })
}

/** People to offer for an `@` in the editor; kryo.to leaves out anonymous and blocked accounts. */
export async function mentionPeople(token: string, q: string): Promise<MentionCandidate[]> {
  const { json } = await request<{ people?: MentionCandidate[] }>(`${API}/api/mentions?q=${encodeURIComponent(q)}`, { token })
  return (json.people ?? []).map((p) => ({ ...p, avatarUrl: siteUrl(p.avatarUrl) }))
}

export type TestReport = {
  id: string
  platform: string | null
  outcome: 'works' | 'setup' | 'partial' | 'broken'
  version: string
  current: boolean
  notes: string | null
  /** kryo.to has masked it already: no username means no link. */
  tester: { name: string; username: string | null }
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

export type SavedEntry = { slug: string; status: SavedStatus; title?: string; cover?: string | null; nsfw?: boolean; updatedAt?: string }

export async function savedLibrary(token: string): Promise<{ counts: Partial<SavedCounts>; entries: SavedEntry[]; hidden: string[] }> {
  const { json } = await request<{ counts?: Partial<SavedCounts>; entries?: SavedEntry[]; hidden?: string[] }>(`${API}/api/account/library`, { token })
  return { counts: json.counts ?? {}, entries: json.entries ?? [], hidden: json.hidden ?? [] }
}
