import { useEffect, useMemo, useState } from 'react'
import { Bookmark, Download, FileText } from 'lucide-react'
import { Button, Caption, Label } from '@/ui'
import { cn } from '@/lib/utils'
import { STATUS_LABEL, STATUSES, type SavedStatus } from '@/hooks/useSaved'
import { API, openExternal } from '@/mobile/auth'
import { CatalogGameCard } from '@/mobile/cards'
import { game as loadGame, releases as loadReleases, savedLibrary, setSaved, type GameDetail, type GameFull, type Release } from '@/mobile/catalog'
import type { CatalogCard } from '@/mobile/catalog-store'
import { useApp } from '@/mobile/context'
import { ago } from '@/mobile/format'
import { Comments, Description, Information, LaunchOptions, Requirements, Reviews, TestedBlock } from '@/mobile/game-sections'
import { Busy, Notice, PageHeader, Poster, Sheet, SheetRow, Strip } from '@/mobile/parts'
import { VerifiedShield } from '@/mobile/pixel-badges'

/** A related game as a Browse card. */
function toCard(g: GameFull): CatalogCard {
  return {
    slug: g.slug,
    title: g.title,
    cover: g.cover ?? '',
    short: g.short ?? '',
    developer: g.developer ?? '',
    genres: g.genres ?? [],
    tags: [],
    rating: g.rating ?? 0,
    year: Number(g.year) || 0,
    download_size: g.download_size,
    created_at_ms: g.created_at ? Date.parse(g.created_at) : undefined,
    built_at_ms: g.last_build_at ? Date.parse(g.last_build_at) : undefined,
    verified: g.verification === 'verified',
    nsfw: g.nsfw,
  }
}

function Fact({ label, children, note }: { label: string; children: React.ReactNode; note?: string }) {
  return (
    <div className="grid content-start gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-sm font-bold text-foreground">{children}</span>
      {note ? <span className="text-[10px] leading-snug text-muted-foreground">{note}</span> : null}
    </div>
  )
}

/** A catalog game as kryo.to's page shows it: the download box, then everything about the game, then more like it. */
export function GamePage({ slug }: { slug: string }) {
  const { back, push, link, links, signedIn, signIn, token, toast, fail } = useApp()
  const [detail, setDetail] = useState<GameDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<SavedStatus | null>(null)
  const [saveSheet, setSaveSheet] = useState(false)
  const [infoSheet, setInfoSheet] = useState(false)
  const [rels, setRels] = useState<Release[] | null>(null)
  const [sending, setSending] = useState(false)

  const load = () => {
    setError(null)
    setDetail(null)
    loadGame(slug)
      .then(setDetail)
      .catch((e: unknown) => setError(fail(e)))
  }
  useEffect(load, [slug]) // eslint-disable-line react-hooks/exhaustive-deps

  // Which of your lists it is on now, if any.
  useEffect(() => {
    if (!token) return
    let current = true
    savedLibrary(token)
      .then((lib) => current && setStatus(lib.entries.find((e) => e.slug === slug)?.status ?? null))
      .catch((e: unknown) => current && void fail(e))
    return () => {
      current = false
    }
  }, [token, slug, fail])

  // The releases come when somebody asks for them.
  useEffect(() => {
    if (!infoSheet || rels) return
    loadReleases(slug)
      .then(setRels)
      .catch(() => setRels([]))
  }, [infoSheet, rels, slug])

  const g = detail?.game
  const related = useMemo(() => (detail?.related ?? []).filter((r) => r.slug !== slug).slice(0, 6).map(toCard), [detail, slug])

  const save = async (next: SavedStatus) => {
    if (!token || !g) return
    const target = status === next ? null : next
    setSaveSheet(false)
    try {
      await setSaved(token, g, target)
      setStatus(target)
    } catch (e) {
      toast(fail(e))
    }
  }

  const send = async () => {
    if (!g || sending) return
    setSending(true)
    await link.download(g.slug)
    setSending(false)
  }

  const pcName = links.lan?.name || links.relay?.name
  const credit = (name: string | null | undefined) => (name && !g?.anonymous ? name : null)
  const controller = g?.features?.find((f) => /controller/i.test(f))

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader title={g?.title ?? 'Game'} onBack={back} />
      {error ? (
        <Notice title="Could not load this game" body={error} retry={load} />
      ) : !g || !detail ? (
        <Busy />
      ) : (
        <div className="grid gap-4 pb-6">
          <div className="relative">
            <Poster src={g.cover_horizontal ?? g.cover ?? detail.hero} title={g.title} nsfw={!!g.nsfw} ratio="aspect-[460/215]" className="!rounded-none border-x-0" />
            {detail.logo && !g.nsfw ? <img src={detail.logo} alt="" className="pointer-events-none absolute inset-x-0 bottom-4 mx-auto max-h-16 max-w-[60%] object-contain" /> : null}
          </div>

          <div className="grid gap-4 px-4">
            <div className="grid gap-2">
              {g.genres.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {g.genres.slice(0, 5).map((x) => (
                    <span key={x} className="kryo-pill border border-border bg-card px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {x}
                    </span>
                  ))}
                </div>
              ) : null}
              <h2 className="text-2xl font-bold leading-tight tracking-tight text-foreground">{g.title}</h2>
              <Caption>{[g.developer, g.year].filter(Boolean).join(' - ') || 'Unknown developer'}</Caption>
              <div className="flex flex-wrap gap-1.5">
                {g.verification === 'verified' ? (
                  <span className="kryo-pill inline-flex items-center gap-1.5 border border-success/50 px-2.5 py-1 text-[10px] uppercase tracking-wider text-success">
                    <VerifiedShield className="text-[12px]" />
                    Verified
                  </span>
                ) : null}
                {controller ? <span className="kryo-pill border border-border px-2.5 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">{/full/i.test(controller) ? 'Full controller' : 'Controller'}</span> : null}
              </div>
              {credit(g.submitted_by_name) || credit(g.reviewed_by_name) ? (
                <div className="grid gap-0.5 text-[11px] text-muted-foreground">
                  {credit(g.submitted_by_name) ? <span>Added by <span className="font-bold text-foreground">{credit(g.submitted_by_name)}</span></span> : null}
                  {credit(g.reviewed_by_name) ? <span>Reviewed and tested by <span className="font-bold text-foreground">{credit(g.reviewed_by_name)}</span></span> : null}
                </div>
              ) : null}
            </div>

            {/* The download box. */}
            <section className="kryo-radius grid gap-4 border border-primary/60 bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-foreground">
                  <Download className="size-4 text-primary" />
                  Download
                </span>
                <Button size="sm" onClick={signedIn ? () => setSaveSheet(true) : signIn}>
                  <Bookmark className={cn('size-3', status && 'fill-current')} />
                  {status ? STATUS_LABEL[status] : 'Save'}
                </Button>
              </div>
              <div className="grid grid-cols-[3fr_2fr] gap-2">
                <Button variant="primary" size="lg" className="px-3 text-xs tracking-wider" disabled={sending} onClick={() => void send()}>
                  <Download className="size-4" />
                  {sending ? 'Sending...' : `Download${g.download_size ? ` - ${g.download_size}` : ''}`}
                </Button>
                <Button size="lg" className="px-2 text-xs tracking-wider" onClick={() => setInfoSheet(true)}>
                  <FileText className="size-4" />
                  Release info
                </Button>
              </div>
              <Caption className="-mt-2 normal-case tracking-normal">
                {pcName ? `Sends to ${pcName}, as if you pressed Download there.` : 'Connect a PC in the Library tab to send downloads to it.'}
              </Caption>
              <div className="grid grid-cols-3 gap-x-3 gap-y-3.5">
                {g.source ? <Fact label="Source">{g.source}</Fact> : null}
                {g.version ? (
                  <Fact label="Version" note={g.steam_build_id ? `Steam build ${g.steam_build_id}` : undefined}>
                    {g.version}
                  </Fact>
                ) : null}
                {g.download_size ? <Fact label="Download">{g.download_size}</Fact> : null}
                {g.size ? (
                  <Fact label="Install" note={g.game_executable_path ? `Start with ${g.game_executable_path}` : undefined}>
                    {g.size}
                  </Fact>
                ) : null}
                {g.created_at ? <Fact label="Added">{ago(g.created_at)}</Fact> : null}
                {g.view_count != null ? <Fact label="Views">{g.view_count.toLocaleString()}</Fact> : null}
                {g.download_count != null ? <Fact label="Downloads">{g.download_count.toLocaleString()}</Fact> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void openExternal(`${API}/game/${g.slug}?help=1`)}>
                  Game not working? Get help
                </Button>
                <Button size="sm" onClick={() => void openExternal(`${API}/requests/new?update=${encodeURIComponent(g.slug)}`)}>
                  Build out of date? Ask for an update
                </Button>
              </div>
            </section>

            {detail.screenshots.length ? (
              <Strip>
                {detail.screenshots.map((s) => (
                  <img key={s} src={s} alt="" loading="lazy" draggable={false} className={cn('kryo-radius h-36 w-auto shrink-0 border border-border object-cover', g.nsfw && 'blur-xl')} />
                ))}
              </Strip>
            ) : null}

            <Description game={g} />
            <Reviews game={g} />
            <TestedBlock game={g} />
            <LaunchOptions game={g} />
            <Information game={g} />
            <Requirements game={g} />
            <Comments slug={g.slug} />

            {related.length ? (
              <section className="grid gap-3">
                <Label>More like this</Label>
                <ul className="grid grid-cols-2 gap-3">
                  {related.map((r) => (
                    <li key={r.slug}>
                      <CatalogGameCard game={r} onOpen={() => push({ kind: 'game', slug: r.slug })} />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </div>
      )}

      <Sheet open={saveSheet} onClose={() => setSaveSheet(false)} title="Save to">
        {STATUSES.map((s) => (
          <SheetRow key={s} active={status === s} onClick={() => void save(s)}>
            {STATUS_LABEL[s]}
          </SheetRow>
        ))}
      </Sheet>

      <Sheet open={infoSheet} onClose={() => setInfoSheet(false)} title="Release info">
        {!rels ? (
          <Busy />
        ) : !rels.length ? (
          <p className="px-1 py-3 text-xs text-muted-foreground">No release details are available for this game.</p>
        ) : (
          <ul className="grid gap-2">
            {rels.map((r) => (
              <li key={r.id} className="grid gap-0.5 border-b border-border pb-2 last:border-b-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-foreground">{r.version}</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{r.archived ? 'Archived' : r.primary ? 'Current' : 'Older'}</span>
                </div>
                <Caption className="normal-case tracking-normal">{[r.label, r.source, r.download_size, ago(r.created_at)].filter(Boolean).join(' - ')}</Caption>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </div>
  )
}
