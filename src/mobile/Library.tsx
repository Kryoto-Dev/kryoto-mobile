import { useEffect, useMemo, useState } from 'react'
import { ArrowDownUp, LayoutGrid, List, Play, ScanLine, Search, Square, Trash2 } from 'lucide-react'
import { Button, Caption, inputCls } from '@/ui'
import { cn } from '@/lib/utils'
import { isTauri } from '@/lib/bridge'
import { formatLastPlayed, formatPlaytime } from '@/lib/format'
import { game as loadGame } from '@/mobile/catalog'
import { useApp } from '@/mobile/context'
import { pairFromQr, pairLan, relayDevices, type RemoteDevice } from '@/mobile/link'
import { Busy, Notice, PageHeader, Poster, Sheet, SheetRow, TopInset } from '@/mobile/parts'
import { Downloads, openCount } from '@/mobile/Downloads'
import { AchievementsCard } from '@/mobile/Achievements'
import { DownloadsIcon, GamesIcon } from '@/mobile/icons'
import { store, type SortMode, type ViewMode } from '@/mobile/storage'
import { scanQr } from '@/mobile/scan'
import type { PhoneGame } from '@/mobile/types'

const SORT_LABEL: Record<SortMode, string> = {
  alpha: 'A-Z',
  recent: 'Recently played',
  playtime: 'Most played',
  added: 'Recently added',
}

function sorted(games: PhoneGame[], mode: SortMode): PhoneGame[] {
  const list = [...games]
  switch (mode) {
    case 'alpha':
      return list.sort((a, b) => a.title.localeCompare(b.title))
    case 'recent':
      return list.sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0) || a.title.localeCompare(b.title))
    case 'playtime':
      return list.sort((a, b) => b.playtimeSeconds - a.playtimeSeconds || a.title.localeCompare(b.title))
    case 'added':
      return list.sort((a, b) => b.addedAt - a.addedAt || a.title.localeCompare(b.title))
  }
}

/** Library: the games on the linked PC, started and stopped from here. */
export function Library() {
  const { link, push } = useApp()
  const { snapshot, state, lastSeen, starting, play, stop } = link
  const [view, setView] = useState<ViewMode>(store.view)
  const [sort, setSort] = useState<SortMode>(store.sort)
  const [sheet, setSheet] = useState(false)
  const [filter, setFilter] = useState('')
  const [section, setSection] = useState<'games' | 'downloads'>('games')
  const [manage, setManage] = useState(false)
  const [removing, setRemoving] = useState<PhoneGame | null>(null)

  const running = useMemo(() => new Set(snapshot?.running ?? []), [snapshot])
  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase()
    const all = snapshot?.games ?? []
    return sorted(f ? all.filter((g) => g.title.toLowerCase().includes(f)) : all, sort)
  }, [snapshot, filter, sort])

  if (state === 'unlinked' || !snapshot) {
    return (
      <div className="flex min-h-full flex-col">
        <TopInset />
        <div className="grid gap-4 px-4 py-6">
          {state === 'unlinked' ? (
            <Connect />
          ) : (
            <>
              <Busy label="Reaching your PC" />
              <p className="text-center text-[11px] leading-relaxed text-muted-foreground">Make sure the PC is on and Kryoto is open.</p>
              <div className="flex justify-center">
                <Button size="sm" onClick={() => push({ kind: 'connect' })}>
                  Change connection
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  const chooseView = (v: ViewMode) => {
    setView(v)
    store.setView(v)
  }
  const chooseSort = (s: SortMode) => {
    setSort(s)
    store.setSort(s)
    setSheet(false)
  }
  const downloading = openCount(snapshot.downloads)
  const games = section === 'games'

  return (
    <div className="flex min-h-full flex-col">
      <TopInset />
      <header className="sticky top-[var(--sat)] z-30 grid gap-2.5 border-b border-border bg-background px-4 pb-3 pt-3">
        <div className="flex items-center gap-2">
          <div className="grid grow">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-foreground">Library</span>
            <Caption>
              {snapshot.games.length} {snapshot.games.length === 1 ? 'game' : 'games'} on {snapshot.name}
            </Caption>
          </div>
          {games ? (
            <>
              <Button size="sm" onClick={() => setSheet(true)} aria-label="Sort">
                <ArrowDownUp className="size-3" />
                {SORT_LABEL[sort]}
              </Button>
              <button
                type="button"
                aria-label={view === 'grid' ? 'Show as a list' : 'Show as a grid'}
                onClick={() => chooseView(view === 'grid' ? 'list' : 'grid')}
                className="kryo-pill grid size-9 place-items-center border border-border text-muted-foreground"
              >
                {view === 'grid' ? <List className="size-4" /> : <LayoutGrid className="size-4" />}
              </button>
            </>
          ) : null}
        </div>
        <div className="kryo-pill relative grid grid-cols-2 gap-1 border border-border bg-card p-1">
          <span
            aria-hidden
            className="kryo-pill absolute inset-y-1 left-1 w-[calc((100%-0.75rem)/2)] bg-primary transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{ transform: games ? 'none' : 'translateX(calc(100% + 0.25rem))' }}
          />
          {(['games', 'downloads'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSection(s)}
              className={cn(
                'kryo-pill relative z-10 flex h-8 items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] transition-colors duration-300',
                section === s ? 'm-tab-on text-primary-foreground' : 'text-muted-foreground',
              )}
            >
              {s === 'games' ? <GamesIcon className="size-3.5" /> : <DownloadsIcon className={cn('size-3.5', downloading && section !== s && 'm-working')} />}
              {s === 'games' ? 'Games' : `Downloads${downloading ? ` (${downloading})` : ''}`}
            </button>
          ))}
        </div>
        {games ? (
          <div className="flex gap-2">
            <div className="relative grow">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter this library" className={cn(inputCls, 'h-10 pl-9')} />
            </div>
            <button
              type="button"
              aria-label={manage ? 'Done managing' : 'Manage games'}
              aria-pressed={manage}
              onClick={() => setManage(!manage)}
              className={cn('kryo-pill grid size-10 shrink-0 place-items-center border transition-colors', manage ? 'border-destructive bg-destructive text-destructive-foreground' : 'border-border text-muted-foreground')}
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ) : null}
      </header>

      {state === 'offline' ? (
        <p className="border-b border-border bg-card px-4 py-2.5 text-[11px] leading-relaxed text-muted-foreground" role="status">
          Can't reach {snapshot.name}. Showing what it looked like {lastSeen ? `at ${new Date(lastSeen).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'the last time it answered'}.
        </p>
      ) : null}

      <div className="grow px-4 pb-6 pt-3">
        {!games ? (
          <Downloads />
        ) : !shown.length ? (
          <Notice title={filter ? 'No matches' : 'Nothing here yet'} body={filter ? `No game in this library matches "${filter}".` : 'Add games in Kryoto Desktop and they show up here.'} />
        ) : view === 'grid' ? (
          <ul className="grid grid-cols-2 gap-3">
            {shown.map((g) => (
              <li key={g.id} className="relative">
                <button type="button" onClick={() => push({ kind: 'lib', id: g.id })} className="grid w-full gap-1.5 text-left">
                  <div className="relative">
                    <Poster src={g.cover} title={g.title} nsfw={g.nsfw} />
                    {running.has(g.id) ? <span aria-label="Running" className="m-live absolute right-2 top-2 size-2.5 rounded-full bg-success shadow shadow-black/60" /> : null}
                  </div>
                  <span className="truncate text-xs font-bold text-foreground">{g.title}</span>
                </button>
                {manage ? (
                  <button
                    type="button"
                    aria-label={`Remove ${g.title}`}
                    disabled={state === 'offline' || running.has(g.id)}
                    onClick={() => setRemoving(g)}
                    className="kryo-pop absolute left-2 top-2 grid size-9 place-items-center rounded-full bg-destructive text-destructive-foreground shadow-lg shadow-black/60 disabled:opacity-40"
                  >
                    <Trash2 className="size-4" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <ul className="grid gap-2">
            {shown.map((g) => (
              <li key={g.id} className="kryo-radius flex items-center gap-3 border border-border bg-card p-2">
                <button type="button" onClick={() => push({ kind: 'lib', id: g.id })} className="flex min-w-0 grow items-center gap-3 text-left">
                  <Poster src={g.header ?? g.cover} title={g.title} nsfw={g.nsfw} ratio="aspect-video" className="w-24 shrink-0" />
                  <span className="grid min-w-0 gap-0.5">
                    <span className="flex items-center gap-1.5">
                      {running.has(g.id) ? <span aria-label="Running" className="m-live size-2 shrink-0 rounded-full bg-success" /> : null}
                      <span className="truncate text-xs font-bold text-foreground">{g.title}</span>
                    </span>
                    <Caption>{formatPlaytime(g.playtimeSeconds)}</Caption>
                    <Caption>{formatLastPlayed(g.lastPlayed)}</Caption>
                  </span>
                </button>
                {manage ? (
                  <Button size="sm" variant="danger" disabled={state === 'offline' || running.has(g.id)} onClick={() => setRemoving(g)}>
                    <Trash2 className="size-3" />
                    Remove
                  </Button>
                ) : (
                  <PlayButton game={g} running={running.has(g.id)} starting={starting.has(g.id)} offline={state === 'offline'} play={play} stop={stop} size="sm" />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Sheet open={sheet} onClose={() => setSheet(false)} title="Sort by">
        {(Object.keys(SORT_LABEL) as SortMode[]).map((s) => (
          <SheetRow key={s} active={sort === s} onClick={() => chooseSort(s)}>
            {SORT_LABEL[s]}
          </SheetRow>
        ))}
      </Sheet>
      <RemoveSheet game={removing} onClose={() => setRemoving(null)} />
    </div>
  )
}

/** Ask how a game leaves the PC's library: uninstalled, or only taken off the list. */
function RemoveSheet({ game, onClose, onDone }: { game: PhoneGame | null; onClose(): void; onDone?(): void }) {
  const { link } = useApp()
  const [busy, setBusy] = useState(false)
  const go = async (deleteFiles: boolean) => {
    if (!game || busy) return
    setBusy(true)
    const ok = await link.removeGame(game, deleteFiles)
    setBusy(false)
    onClose()
    if (ok) onDone?.()
  }
  return (
    <Sheet open={!!game} onClose={onClose} title={game ? `Remove ${game.title}?` : 'Remove'}>
      <p className="px-1 pb-2 text-xs leading-relaxed text-muted-foreground">Uninstalling deletes the game's files from the PC. Removing it from the library only takes it off the list.</p>
      <SheetRow danger onClick={() => void go(true)}>
        Uninstall and delete files
      </SheetRow>
      <SheetRow onClick={() => void go(false)}>Remove from library only</SheetRow>
      <SheetRow active onClick={onClose}>
        Keep it
      </SheetRow>
    </Sheet>
  )
}

function PlayButton({
  game,
  running,
  starting,
  offline,
  play,
  stop,
  size = 'md',
}: {
  game: PhoneGame
  running: boolean
  starting: boolean
  offline: boolean
  play(id: string): Promise<void>
  stop(id: string): Promise<void>
  size?: 'sm' | 'md' | 'lg'
}) {
  if (running) {
    return (
      <Button size={size} variant="danger" disabled={offline} onClick={() => void stop(game.id)}>
        <Square className="size-3" />
        Stop
      </Button>
    )
  }
  return (
    <Button size={size} variant="primary" disabled={offline || starting} onClick={() => void play(game.id)}>
      <Play className="size-3" />
      {starting ? 'Starting...' : 'Play'}
    </Button>
  )
}

/** A game on the PC: art, stats, and Play or Stop. */
export function LibraryGamePage({ id }: { id: string }) {
  const { link, back } = useApp()
  const { snapshot, state, starting, play, stop } = link
  const game = snapshot?.games.find((g) => g.id === id)
  const [hero, setHero] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)

  const slug = game?.slug
  useEffect(() => {
    if (!slug) return
    let current = true
    loadGame(slug)
      .then((d) => current && setHero(d.hero))
      .catch(() => {})
    return () => {
      current = false
    }
  }, [slug])

  if (!game) {
    return (
      <div className="flex min-h-full flex-col">
        <PageHeader title="Game" onBack={back} />
        <Notice title="That game is not in this library any more" />
      </div>
    )
  }
  const running = snapshot?.running.includes(id) ?? false
  const offline = state === 'offline'
  return (
    <div className="flex min-h-full flex-col">
      <PageHeader title={game.title} onBack={back} />
      <div className="grid gap-4 pb-6">
        <Poster src={game.header ?? game.cover ?? hero} title={game.title} nsfw={game.nsfw} ratio="aspect-[460/215]" className="!rounded-none border-x-0" />
        <div className="grid gap-4 px-4">
          <div className="flex items-center gap-2">
            <h2 className="min-w-0 grow text-lg font-bold leading-tight text-foreground">{game.title}</h2>
            {running ? <span className="kryo-pill shrink-0 border border-success/50 px-2.5 py-1 text-[10px] uppercase tracking-wider text-success">Running</span> : null}
          </div>
          <dl className="grid grid-cols-3 gap-2">
            <Stat label="Played" value={formatPlaytime(game.playtimeSeconds)} />
            <Stat label="Last played" value={formatLastPlayed(game.lastPlayed)} />
            <Stat label="Added" value={game.addedAt ? new Date(game.addedAt * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Unknown'} />
          </dl>
          <div className="grid gap-1.5">
            <PlayButton game={game} running={running} starting={starting.has(id)} offline={offline} play={play} stop={stop} size="lg" />
            {offline ? <Caption className="text-center">PC is offline</Caption> : null}
          </div>
          <AchievementsCard id={id} />
          <div className="kryo-radius grid gap-3 border border-border bg-card p-4">
            <Caption className="font-bold text-foreground/80">Manage</Caption>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Uninstall deletes {game.title} from {snapshot?.name ?? 'the PC'}. Remove only takes it off the library list and keeps its files.
            </p>
            <Button variant="danger" disabled={offline || running} onClick={() => setRemoving(true)}>
              <Trash2 className="size-3.5" />
              Uninstall or remove
            </Button>
            {running ? <Caption>Stop the game first.</Caption> : null}
          </div>
          <RemoveSheet game={removing ? game : null} onClose={() => setRemoving(false)} onDone={back} />
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="kryo-radius grid gap-1 border border-border bg-card p-3">
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-xs font-bold text-foreground">{value}</dd>
    </div>
  )
}

/** Link a PC: its address and code on this network, or an account's PCs through kryo.to. */
export function Connect({ onDone }: { onDone?: () => void }) {
  const { setLinks, links, signedIn, signIn, token, toast, fail } = useApp()
  const [host, setHost] = useState(links.lan?.host.split(':')[0] ?? '')
  const [port, setPort] = useState(links.lan?.host.split(':')[1] ?? '47821')
  const [code, setCode] = useState('')
  const [pairing, setPairing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pair = async () => {
    setPairing(true)
    setError(null)
    try {
      const lan = await pairLan(`${host.trim()}:${port.trim()}`, code)
      setLinks({ ...links, lan })
      toast(`Paired with ${lan.name}.`)
      onDone?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPairing(false)
    }
  }

  const scanAndPair = async () => {
    setPairing(true)
    setError(null)
    try {
      const lan = await pairFromQr(await scanQr())
      setLinks({ ...links, lan })
      toast(`Paired with ${lan.name}.`)
      onDone?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPairing(false)
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-1 text-center">
        <p className="text-sm font-bold text-foreground">Connect to your PC</p>
        <p className="mx-auto max-w-xs text-xs leading-relaxed text-muted-foreground">Turn on Phone in Kryoto Desktop's Settings, then link it here.</p>
      </div>
      {error ? <p className="kryo-radius border border-destructive/50 px-3 py-2 text-xs leading-relaxed text-destructive">{error}</p> : null}
      {isTauri() ? (
        <section className="kryo-radius grid gap-3 border border-border bg-card p-4">
          <Caption className="font-bold text-foreground/80">Scan a QR code</Caption>
          <p className="text-xs leading-relaxed text-muted-foreground">On the PC, open Kryoto Desktop's Settings, then Phone, turn on "On this network", and scan the code it shows.</p>
          <Button variant="primary" disabled={pairing} onClick={() => void scanAndPair()}>
            <ScanLine className="size-4" />
            {pairing ? 'Pairing...' : 'Scan QR code'}
          </Button>
        </section>
      ) : null}
      <section className="kryo-radius grid gap-3 border border-border bg-card p-4">
        <Caption className="font-bold text-foreground/80">Enter it by hand</Caption>
        <label className="grid gap-1">
          <Caption>PC address</Caption>
          <input
            value={host}
            onChange={(e) => setHost(e.target.value.replace(/[^\d.]/g, ''))}
            placeholder="192.168.1.5"
            inputMode="decimal"
            autoCapitalize="off"
            autoCorrect="off"
            className={inputCls}
          />
        </label>
        <label className="grid gap-1">
          <Caption>Port</Caption>
          <input
            value={port}
            onChange={(e) => setPort(e.target.value.replace(/\D/g, '').slice(0, 5))}
            placeholder="47821"
            inputMode="numeric"
            className={inputCls}
          />
        </label>
        <label className="grid gap-1">
          <Caption>6-digit code</Caption>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="123456"
            inputMode="numeric"
            className={inputCls}
          />
        </label>
        <p className="text-[11px] leading-relaxed text-muted-foreground">The PC shows its address, port and code in Settings, then Phone.</p>
        <Button disabled={pairing || code.length !== 6 || !host.trim() || !port.trim()} onClick={() => void pair()}>
          {pairing ? 'Pairing...' : 'Pair'}
        </Button>
      </section>
      <section className="kryo-radius grid gap-3 border border-border bg-card p-4">
        <Caption className="font-bold text-foreground/80">Through kryo.to</Caption>
        {signedIn && token ? (
          <RelayDevices
            token={token}
            onPicked={(installId, name) => {
              setLinks({ ...links, relay: { installId, name } })
              onDone?.()
            }}
            fail={fail}
          />
        ) : (
          <>
            <p className="text-xs leading-relaxed text-muted-foreground">Works away from home. Sign in with the account your PC shares its games with.</p>
            <Button onClick={signIn}>Sign in with kryo.to</Button>
          </>
        )}
      </section>
    </div>
  )
}

function RelayDevices({ token, onPicked, fail }: { token: string; onPicked(installId: string, name: string): void; fail(e: unknown): string }) {
  const [devices, setDevices] = useState<RemoteDevice[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = () => {
    setError(null)
    relayDevices(token)
      .then(setDevices)
      .catch((e: unknown) => setError(fail(e)))
  }
  useEffect(load, [token]) // eslint-disable-line react-hooks/exhaustive-deps
  if (error) return <Notice title="Could not list your PCs" body={error} retry={load} />
  if (!devices) return <Busy />
  if (!devices.length) return <p className="text-xs leading-relaxed text-muted-foreground">No PC on this account yet. In Kryoto Desktop, sign in to kryo.to and turn on Settings, Phone, Through kryo.to.</p>
  return (
    <ul className="grid gap-2">
      {devices.map((d) => (
        <li key={d.installId}>
          <button type="button" onClick={() => onPicked(d.installId, d.name)} className="kryo-radius flex w-full items-center justify-between gap-3 border border-border p-3 text-left">
            <span className="truncate text-xs font-bold text-foreground">{d.name}</span>
            <span className={cn('kryo-pill border px-2.5 py-1 text-[10px] uppercase tracking-wider', d.online ? 'border-success/50 text-success' : 'border-border text-muted-foreground')}>{d.online ? 'Online' : 'Offline'}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** The pairing screen on its own page, for Profile's "Re-pair". */
export function ConnectPage() {
  const { back } = useApp()
  return (
    <div className="flex min-h-full flex-col">
      <PageHeader title="Connect" onBack={back} />
      <div className="px-4 py-6">
        <Connect onDone={back} />
      </div>
    </div>
  )
}
