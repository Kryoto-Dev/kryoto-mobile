/** What a search result needs, and what kryo.to says about how much people play it. */
export type Found = {
  slug: string
  title: string
  cover: string | null
  year?: number | string | null
  nsfw?: boolean
}

export type Crowd = {
  /** Steam reviews, positive and negative. */
  reviews: number
  downloads: number
}

/** Lowercase, no accents or punctuation, one space between words. */
function plain(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/**
 * How well a title answers what was typed. 3: it is the title. 2: it starts
 * with it, or every word typed starts a word in it. 1: anything else kryo.to's
 * fuzzy search let through (a typo, an acronym, the developer).
 */
export function titleMatch(title: string, query: string): 1 | 2 | 3 {
  const q = plain(query)
  const t = plain(title)
  const bare = t.replace(/^the /, '')
  if (q === t || q === bare) return 3
  if (t.startsWith(q) || bare.startsWith(q)) return 2
  const words = t.split(' ')
  return q.split(' ').every((w) => words.some((x) => x.startsWith(w))) ? 2 : 1
}

/**
 * How much people look for a game. Steam's review count says how big it is
 * everywhere, so it leads; kryo.to's own downloads only break ties (a new
 * upload has had few). On a log scale, so a hit does not drown everything else.
 */
export function popularity({ reviews, downloads }: Crowd): number {
  return Math.log10(1 + reviews) + 0.25 * Math.log10(1 + downloads)
}

/**
 * Order search results: the game that is what you typed first, then the games
 * that start with it, the most played of each first, then everything else the
 * same way. Ties keep kryo.to's own order.
 */
export function rankSearch(query: string, found: Found[], crowd: ReadonlyMap<string, Crowd>): Found[] {
  const scored = found.map((game, i) => ({
    game,
    i,
    match: titleMatch(game.title, query),
    pop: popularity(crowd.get(game.slug) ?? { reviews: 0, downloads: 0 }),
  }))
  scored.sort((a, b) => b.match - a.match || b.pop - a.pop || a.i - b.i)
  return scored.map((s) => s.game)
}
