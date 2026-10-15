import { useEffect, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Caption, inputCls } from '@/ui'
import { cn } from '@/lib/utils'
import { search, type Suggestion } from '@/mobile/catalog'
import { Browse } from '@/mobile/Browse'
import { useApp } from '@/mobile/context'
import { Busy, Notice, Poster, TopInset } from '@/mobile/parts'

/** Store: browse the catalog, or search it. */
export function Store() {
  const [q, setQ] = useState('')
  const typed = q.trim()
  return (
    <div className="flex min-h-full flex-col">
      <TopInset />
      <header className="sticky top-[var(--sat)] z-30 border-b border-border bg-background px-4 pb-3 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search games"
            enterKeyHint="search"
            autoCapitalize="off"
            autoCorrect="off"
            className={cn(inputCls, 'h-10 pl-9 pr-9')}
          />
          {q ? (
            <button type="button" aria-label="Clear" onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <X className="size-4" />
            </button>
          ) : null}
        </div>
      </header>
      <div className="grow px-4 pb-6 pt-3">{typed.length >= 2 ? <SearchResults q={typed} /> : <Browse />}</div>
    </div>
  )
}

/** The games for what was typed, 250 ms after the last keystroke, the most played first. */
function SearchResults({ q }: { q: string }) {
  const { push, fail } = useApp()
  const [results, setResults] = useState<Suggestion[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let current = true
    setResults(null)
    setError(null)
    const t = window.setTimeout(() => {
      search(q)
        .then((r) => current && setResults(r))
        .catch((e: unknown) => current && setError(fail(e)))
    }, 250)
    return () => {
      current = false
      window.clearTimeout(t)
    }
  }, [q, fail])
  if (error) return <Notice title="Search failed" body={error} />
  if (!results) return <Busy />
  if (!results.length) return <Notice title="No games found" body={`Nothing on kryo.to matches "${q}".`} />
  return (
    <ul className="grid gap-2">
      {results.map((r) => (
        <li key={r.slug}>
          <button type="button" onClick={() => push({ kind: 'game', slug: r.slug })} className="kryo-radius flex w-full items-center gap-3 border border-border bg-card p-2 text-left">
            <Poster src={r.cover} title={r.title} nsfw={r.nsfw} className="w-12 shrink-0" />
            <span className="grid min-w-0">
              <span className="truncate text-xs font-bold text-foreground">{r.title}</span>
              {r.year ? <Caption>{r.year}</Caption> : null}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
