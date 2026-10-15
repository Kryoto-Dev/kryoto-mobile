const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** "9 hours ago", "3 days ago", or the date for anything older than two months. */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  const at = iso ? Date.parse(iso) : NaN
  if (!Number.isFinite(at)) return ''
  const ms = Math.max(0, now - at)
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  if (ms < MINUTE) return 'just now'
  if (ms < HOUR) return rtf.format(-Math.floor(ms / MINUTE), 'minute')
  if (ms < DAY) return rtf.format(-Math.floor(ms / HOUR), 'hour')
  if (ms < 60 * DAY) return rtf.format(-Math.floor(ms / DAY), 'day')
  return new Date(at).toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' })
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', reg: '®', trade: '™', copy: '©' }

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ref: string) => {
    if (ref.startsWith('#x') || ref.startsWith('#X')) return String.fromCodePoint(parseInt(ref.slice(2), 16))
    if (ref.startsWith('#')) return String.fromCodePoint(parseInt(ref.slice(1), 10))
    return ENTITIES[ref.toLowerCase()] ?? whole
  })
}

/**
 * Steam's system-requirements HTML as plain lines: tags stripped first and
 * entities decoded after, so a literal `&lt;9.0&gt;` survives (as kryo.to does).
 */
export function requirementLines(html: string | undefined): string[] {
  if (!html) return []
  return decode(html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/li>/gi, '\n').replace(/<[^>]*>/g, ''))
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line && !/^(minimum|recommended)\s*:?\s*$/i.test(line))
}

/** Steam's wording for a share of positive reviews. */
export function reviewVerdict(percent: number): string {
  if (percent >= 95) return 'Overwhelmingly positive'
  if (percent >= 80) return 'Very positive'
  if (percent >= 70) return 'Mostly positive'
  if (percent >= 40) return 'Mixed'
  return 'Mostly negative'
}
