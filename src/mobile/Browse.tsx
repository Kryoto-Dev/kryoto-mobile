import { useEffect, useMemo, useState } from 'react'
import { CatalogGameCard, UploadCard } from '@/mobile/cards'
import { compareBy, loadCatalog, SORT_LABEL, useCatalog, type Sort } from '@/mobile/catalog-store'
import { useApp } from '@/mobile/context'
import { Busy, Chip, Notice, Sentinel, Strip } from '@/mobile/parts'
import { useUploadSlots } from '@/mobile/upload'

/** How many games Browse draws at first, and each time the end comes into view. */
const PAGE = 24

const SORTS: { id: Sort; label: string }[] = [
  { id: 'new', label: 'Newest' },
  { id: 'rating', label: 'Top rated' },
  { id: 'released', label: 'Released' },
  { id: 'az', label: 'A-Z' },
]

/**
 * Browse games, as kryo.to draws it: the whole catalog (filtered and sorted
 * here), with the games still arriving first, their names filling in as they
 * upload.
 */
export function Browse() {
  const { push } = useApp()
  const catalog = useCatalog()
  const uploads = useUploadSlots()
  const [genre, setGenre] = useState<string | null>(null)
  const [sort, setSort] = useState<Sort>('new')
  const [shown, setShown] = useState(PAGE)

  useEffect(() => {
    void loadCatalog()
  }, [])
  // A new filter starts at the top of a short list again.
  useEffect(() => setShown(PAGE), [genre, sort])

  // The genres most games carry, most first.
  const genres = useMemo(() => {
    const count = new Map<string, number>()
    for (const g of catalog.cards) for (const name of g.genres) count.set(name, (count.get(name) ?? 0) + 1)
    return [...count]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 24)
      .map(([name]) => name)
  }, [catalog.cards])

  const list = useMemo(() => {
    const matching = genre ? catalog.cards.filter((g) => g.genres.includes(genre)) : catalog.cards
    return [...matching].sort(compareBy(sort))
  }, [catalog.cards, genre, sort])

  // Games still arriving lead the list, as on the site, unless a genre is picked.
  const arriving = genre ? [] : uploads
  const count = genre ? list.length : Math.max(catalog.total, list.length)

  return (
    <div className="grid gap-3">
      <div className="grid gap-0.5">
        <h1 className="text-lg font-bold tracking-tight text-foreground">Browse games</h1>
        <p className="text-[11px] text-muted-foreground">
          <span className="tabular-nums text-foreground">{count.toLocaleString()}</span> {count === 1 ? 'game' : 'games'}
          <span className="text-muted-foreground/70">
            {' · '}
            {SORT_LABEL[sort]}
            {catalog.loading && catalog.cards.length ? ' · loading more' : ''}
          </span>
        </p>
      </div>
      <Strip>
        <Chip active={genre === null} onClick={() => setGenre(null)}>
          All
        </Chip>
        {genres.map((g) => (
          <Chip key={g} active={genre === g} onClick={() => setGenre(g)}>
            {g}
          </Chip>
        ))}
      </Strip>
      <Strip>
        {SORTS.map((s) => (
          <Chip key={s.id} active={sort === s.id} onClick={() => setSort(s.id)}>
            {s.label}
          </Chip>
        ))}
      </Strip>
      <ul className="grid grid-cols-2 gap-3">
        {arriving.map((u) => (
          <li key={u.id}>
            <UploadCard upload={u} />
          </li>
        ))}
        {list.slice(0, shown).map((g) => (
          <li key={g.slug}>
            <CatalogGameCard game={g} onOpen={() => push({ kind: 'game', slug: g.slug })} />
          </li>
        ))}
      </ul>
      {catalog.error ? (
        <Notice title="Could not load games" body={catalog.error} retry={() => void loadCatalog(true)} />
      ) : !catalog.cards.length ? (
        <Busy />
      ) : !list.length ? (
        <Notice title="No games" body="Nothing matches this filter." />
      ) : null}
      <Sentinel disabled={shown >= list.length} onSeen={() => setShown((n) => n + PAGE)} />
    </div>
  )
}
