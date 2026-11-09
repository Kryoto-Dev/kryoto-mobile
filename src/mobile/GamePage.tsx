import { useEffect, useMemo, useState } from 'react'
import { Bookmark, Download, FileText } from '@/ui/pixel-icons'
import { Button, Caption, Label, Stat, Tag } from '@/ui'
import { cn } from '@/lib/utils'
import { STATUS_LABEL, STATUSES, type SavedStatus } from '@/hooks/useSaved'
import { API, openExternal } from '@/mobile/auth'
import { CatalogGameCard } from '@/mobile/cards'
import { AddToCollection } from '@/mobile/Collections'
import { comingSoon as loadComingSoon, game as loadGame, releases as loadReleases, savedLibrary, setSaved, type ComingSoon, type Credit, type GameDetail, type GameFull, type Release } from '@/mobile/catalog'
import type { CatalogCard } from '@/mobile/catalog-store'
import { useShowAdult } from '@/mobile/adult'
import { ComingSoonPage } from '@/mobile/coming-soon'
import { useApp } from '@/mobile/context'
import { ago } from '@/mobile/format'
import { Comments, Description, Information, LaunchOptions, Requirements, Reviews, TestedBlock, Writeups } from '@/mobile/game-sections'
import { ProfileLink, TeamName } from '@/mobile/identity'
import { Block, Busy, Note, Notice, PageHeader, Poster, Sheet, SheetRow } from '@/mobile/parts'
import { VerifiedShield } from '@/mobile/pixel-badges'
import { CommunityBuildNote, isCommunityRelease } from '@/mobile/community-build'
import { ScreenshotStrip } from '@/mobile/screenshots'
import { ApiError } from '@/mobile/net'

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

/** "Added by" and its name, to the profile when there is one. */
function CreditLine({ label, who }: { label: string; who: Credit }) {
  return (
    <span>
      {label}{' '}
      <ProfileLink username={who.username} className="font-bold text-foreground">
        <TeamName username={who.username}>{who.name}</TeamName>
      </ProfileLink>
    </span>
  )
}

/** A catalog game as kryo.to's page shows it: the download box, then everything about the game, then more like it. */
export function GamePage({ slug }: { slug: string }) {
  const { back, push, link, links, signedIn, signIn, token, toast, fail } = useApp()
  const blurAdult = !useShowAdult()
  const [detail, setDetail] = useState<GameDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<SavedStatus | null>(null)
  const [saveSheet, setSaveSheet] = useState(false)
  const [listSheet, setListSheet] = useState(false)
  const [infoSheet, setInfoSheet] = useState(false)
  const [rels, setRels] = useState<Release[] | null>(null)
  const [sending, setSending] = useState(false)
  // Not published but on its way: kryo.to's coming-soon page at the same address.
  const [arriving, setArriving] = useState<ComingSoon | null>(null)

  const load = () => {
    setError(null)
    setDetail(null)
    setArriving(null)
    loadGame(slug)
      .then(setDetail)
      .catch(async (e: unknown) => {
        const soon = e instanceof ApiError && e.status === 404 ? await loadComingSoon(slug).catch(() => null) : null
        if (soon) setArriving(soon)
        else setError(fail(e))
      })
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
  const { addedBy, reviewedBy } = detail?.credits ?? {}
  const controller = g?.features?.find((f) => /controller/i.test(f))

  if (arriving) return <ComingSoonPage slug={slug} data={arriving} onLive={load} />

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
            {detail.logo && !(g.nsfw && blurAdult) ? <img src={detail.logo} alt="" className="pointer-events-none absolute inset-x-0 bottom-4 mx-auto max-h-16 max-w-[60%] object-contain" /> : null}
          </div>

          <div className="grid gap-4 px-4">
            <div className="grid gap-2">
              {g.genres.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {g.genres.map((x) => (
                    <Tag key={x}>{x}</Tag>
                  ))}
                </div>
              ) : null}
              <h2 className="text-2xl font-bold leading-tight tracking-tight text-foreground">{g.title}</h2>
              <Caption>{[g.developer, g.year].filter(Boolean).join(' - ') || 'Unknown developer'}</Caption>
              {g.verification === 'verified' || controller ? (
                <div className="flex flex-wrap gap-1.5">
                  {g.verification === 'verified' ? (
                    <Tag className="border-success/50 text-success">
                      <VerifiedShield className="text-[12px]" />
                      Verified
                    </Tag>
                  ) : null}
                  {controller ? <Tag>{/full/i.test(controller) ? 'Full controller' : 'Controller'}</Tag> : null}
                </div>
              ) : null}
              {addedBy || reviewedBy ? (
                <div className="grid gap-0.5 text-[11px] text-muted-foreground">
                  {addedBy ? <CreditLine label="Added by" who={addedBy} /> : null}
                  {reviewedBy ? <CreditLine label="Reviewed and tested by" who={reviewedBy} /> : null}
                </div>
              ) : null}
            </div>

            {/* The download box. */}
            <Block className="gap-4 border-primary/60">
              <div className="grid gap-2">
                <Button variant="primary" size="lg" className="tracking-wider" disabled={sending} onClick={() => void send()}>
                  <Download className="size-4" />
                  {sending ? 'Sending...' : `Download${g.download_size ? ` - ${g.download_size}` : ''}`}
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={signedIn ? () => setSaveSheet(true) : signIn}>
                    <Bookmark className={cn('size-3', status && 'fill-current')} />
                    {status ? STATUS_LABEL[status] : 'Save'}
                  </Button>
                  <Button onClick={() => setInfoSheet(true)}>
                    <FileText className="size-3" />
                    Release info
                  </Button>
                </div>
                <Note>{pcName ? `Sends to ${pcName}, as if you pressed Download there.` : 'Connect a PC in the Library tab to send downloads to it.'}</Note>
              </div>
              <dl className="grid grid-cols-3 gap-x-3 gap-y-3.5">
                {g.source ? <Stat label="Source" value={g.source} /> : null}
                {g.version ? <Stat label="Version" value={g.version} /> : null}
                {g.steam_build_id ? <Stat label="Steam build" value={g.steam_build_id} /> : null}
                {g.size ? <Stat label="Install" value={g.size} /> : null}
                {g.created_at ? <Stat label="Added" value={ago(g.created_at)} /> : null}
                {g.view_count != null ? <Stat label="Views" value={g.view_count.toLocaleString()} /> : null}
                {g.download_count != null ? <Stat label="Downloads" value={g.download_count.toLocaleString()} /> : null}
              </dl>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void openExternal(`${API}/game/${g.slug}?help=1`)}>
                  Game not working? Get help
                </Button>
                <Button size="sm" onClick={() => void openExternal(`${API}/requests/new?update=${encodeURIComponent(g.slug)}`)}>
                  Build out of date? Ask for an update
                </Button>
              </div>
            </Block>

            <ScreenshotStrip shots={detail.screenshots} title={g.title} blur={!!g.nsfw && blurAdult} />

            <Description game={g} />
            <Reviews game={g} />
            <TestedBlock game={g} />
            <LaunchOptions game={g} />
            <Information game={g} />
            <Requirements game={g} />
            <Writeups slug={g.slug} version={g.version ?? null} />
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
        <SheetRow onClick={() => { setSaveSheet(false); setListSheet(true) }}>Add to a collection</SheetRow>
      </Sheet>
      <AddToCollection open={listSheet} onClose={() => setListSheet(false)} slug={slug} title={detail?.game.title ?? ''} />

      <Sheet open={infoSheet} onClose={() => setInfoSheet(false)} title="Release info">
        {!rels ? (
          <Busy />
        ) : !rels.length ? (
          <Note className="px-1 py-3">No release details are available for this game.</Note>
        ) : (
          <ul className="grid gap-2">
            {rels.map((r) => (
              <li key={r.id} className="grid gap-0.5 border-b border-border pb-2 last:border-b-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-foreground">{r.version}</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{r.archived ? 'Archived' : r.primary ? 'Current' : 'Older'}</span>
                </div>
                <Caption className="normal-case tracking-normal">{[r.label, r.source, r.download_size, ago(r.created_at)].filter(Boolean).join(' - ')}</Caption>
                {isCommunityRelease(r) ? <CommunityBuildNote /> : null}
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </div>
  )
}
