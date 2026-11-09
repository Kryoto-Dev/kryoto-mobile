import { useEffect, useMemo, useRef, useState } from 'react'
import { PixelSplash } from '@/ui/pixel-icons-motion'
import { ArrowDownUp, ArrowLeft, ChevronRight, Download, EyeOff, Gamepad2, Hammer, LayoutGrid, List, Monitor, ScanLine, Search, Trash2 } from '@/ui/pixel-icons'
import { Button, Caption, Stat, Tag, inputCls } from '@/ui'
import { cn } from '@/lib/utils'
import { isTauri } from '@/lib/bridge'
import { formatLastPlayed, formatPlaytime } from '@/lib/format'
import { formatBytes } from '@/lib/downloads'
import { downloadSizes, game as loadGame } from '@/mobile/catalog'
import { useApp } from '@/mobile/context'
import { API, openExternal } from '@/mobile/auth'
import { accountMachines, atLeast, pairFromQr, pairLan, PHONE_SERVER_VERSION, RemoteOff, type AccountMachine } from '@/mobile/link'
import { RemoteConsentCard } from '@/mobile/remote'
import { clock } from '@/mobile/format'
import { Block, Busy, Note, Notice, PageHeader, PlayButton, Poster, Sheet, SheetRow, TopInset } from '@/mobile/parts'
import { Downloads, openCount } from '@/mobile/Downloads'
import { AchievementsCard } from '@/mobile/Achievements'
import { Writeups } from '@/mobile/game-sections'
import { store, type SortMode, type ViewMode } from '@/mobile/storage'
import { ScanCancelled, scanQr } from '@/mobile/scan'
import type { PhoneGame } from '@/mobile/types'
import { mobileAction } from '@/mobile/platform'

const SORT_LABEL: Record<SortMode, string> = {
  alpha: 'A-Z',
  recent: 'Recently played',
  playtime: 'Most played',
  added: 'Recently added',
  size: 'Largest first',
}

function sorted(games: PhoneGame[], mode: SortMode, sizes: Map<string, number>): PhoneGame[] {
  const size = (g: PhoneGame) => (g.slug ? sizes.get(g.slug) ?? 0 : 0)
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
    case 'size':
      // kryo.to's download size: a game it does not list has none and goes last.
      return list.sort((a, b) => size(b) - size(a) || a.title.localeCompare(b.title))
  }
}

/** Library: the games on the linked PC, started and stopped from here. */
export function Library({ downloadsRequest = 0 }: { downloadsRequest?: number } = {}) {
  const { link, links, push } = useApp()
  const { snapshot, state, lastSeen, route, asked, starting, play, stop } = link
  const [view, setView] = useState<ViewMode>(store.view)
  const [sort, setSort] = useState<SortMode>(store.sort)
  const [sheet, setSheet] = useState(false)
  const [filter, setFilter] = useState('')
  const [hiddenOpen, setHiddenOpen] = useState(false)
  const [section, setSection] = useState<'games' | 'downloads'>(downloadsRequest ? 'downloads' : 'games')
  useEffect(() => {
    if (downloadsRequest) setSection('downloads')
  }, [downloadsRequest])

  const [sizes, setSizes] = useState<Map<string, number>>(() => new Map())
  const slugs = (snapshot?.games ?? []).flatMap((g) => (g.slug ? [g.slug] : [])).sort().join(',')
  useEffect(() => {
    if (sort !== 'size' || !slugs) return
    let current = true
    downloadSizes(slugs.split(','))
      .then((found) => current && setSizes(found))
      .catch(() => {})
    return () => {
      current = false
    }
  }, [sort, slugs])

  const running = useMemo(() => new Set(snapshot?.running ?? []), [snapshot])
  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase()
    const all = snapshot?.games ?? []
    // The games hidden on the PC keep to their own list; a search looks in everything, as there.
    return sorted(f ? all.filter((g) => g.title.toLowerCase().includes(f)) : all.filter((g) => !!g.hidden === hiddenOpen), sort, sizes)
  }, [snapshot, filter, hiddenOpen, sort, sizes])
  const hiddenCount = (snapshot?.games ?? []).filter((g) => g.hidden).length
  useEffect(() => {
    if (hiddenCount === 0) setHiddenOpen(false)
  }, [hiddenCount])
  const sizeOf = (g: PhoneGame) => {
    const bytes = sort === 'size' && g.slug ? sizes.get(g.slug) : undefined
    return bytes ? <Caption>{formatBytes(bytes)}</Caption> : null
  }

  if (state === 'unlinked' || !snapshot) {
    return (
      <div className="flex min-h-full flex-col">
        <TopInset />
        <div className="grid gap-4 px-4 py-6">
          {state === 'unlinked' ? (
            <Connect />
          ) : !asked ? (
            <Busy label="Reaching your PC" />
          ) : (
            <Notice title={`Can't reach ${links.lan?.name || links.relay?.name || 'your PC'}`} body="Make sure the PC is on and Kryoto is open.">
              <Button size="sm" onClick={() => push({ kind: 'connect' })}>
                Change connection
              </Button>
            </Notice>
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
      {/* Opaque, like the Store's: a blurred sticky header costs every scrolled frame. */}
      <header className="sticky top-[var(--sat)] z-30 grid gap-2.5 border-b border-border bg-background px-4 pb-3 pt-3">
        <div className="flex items-center gap-2">
          <div className="grid grow">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-foreground">Library</span>
            <Caption>
              {snapshot.games.length - hiddenCount} {snapshot.games.length - hiddenCount === 1 ? 'game' : 'games'} on {snapshot.name}
              {state === 'live' && route ? (
                <span className="text-muted-foreground"> · {route === 'lan' ? 'local' : 'remote'}</span>
              ) : null}
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
              {s === 'games' ? <Gamepad2 className="size-3.5" /> : <Download className={cn('size-3.5', downloading && section !== s && 'm-working')} />}
              {s === 'games' ? 'Games' : `Downloads${downloading ? ` (${downloading})` : ''}`}
            </button>
          ))}
        </div>
        {games ? (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter this library" className={cn(inputCls, 'h-10 pl-9')} />
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
              <li key={g.id}>
                <button type="button" onClick={() => push({ kind: 'lib', id: g.id })} className="grid w-full gap-1.5 text-left">
                  <div className="relative">
                    <Poster src={g.cover} title={g.title} nsfw={g.nsfw} />
                    {running.has(g.id) ? <span aria-label="Running" className="m-live absolute right-2 top-2 size-2.5 rounded-full bg-success shadow shadow-black/60" /> : null}
                  </div>
                  <span className="truncate text-xs font-bold text-foreground">{g.title}</span>
                  {sizeOf(g)}
                </button>
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
                    {sizeOf(g)}
                  </span>
                </button>
                <PlayButton running={running.has(g.id)} starting={starting.has(g.id)} offline={state === 'offline'} onPlay={() => void play(g.id)} onStop={() => void stop(g.id)} size="sm" />
              </li>
            ))}
          </ul>
        )}
        {games && hiddenCount > 0 && !filter ? (
          <button type="button" onClick={() => setHiddenOpen((v) => !v)} className="kryo-pill mt-4 flex h-9 w-full items-center justify-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            <EyeOff className="size-3.5" aria-hidden />
            {hiddenOpen ? 'Back to your games' : `Hidden (${hiddenCount})`}
          </button>
        ) : null}
      </div>

      <Sheet open={sheet} onClose={() => setSheet(false)} title="Sort by">
        {(Object.keys(SORT_LABEL) as SortMode[]).map((s) => (
          <SheetRow key={s} active={sort === s} onClick={() => chooseSort(s)}>
            {SORT_LABEL[s]}
          </SheetRow>
        ))}
      </Sheet>
    </div>
  )
}

/** Ask how a game leaves the PC's library: uninstalled, or only taken off the list. */
function RemoveSheet({ game, onClose, onDone }: { game: PhoneGame | null; onClose(): void; onDone(): void }) {
  const { link } = useApp()
  const [busy, setBusy] = useState(false)
  const go = async (deleteFiles: boolean) => {
    if (!game || busy) return
    setBusy(true)
    const ok = await link.removeGame(game, deleteFiles)
    setBusy(false)
    onClose()
    if (ok) onDone()
  }
  return (
    <Sheet open={!!game} onClose={onClose} title={game ? `Remove ${game.title}?` : 'Remove'}>
      <Note className="px-1 pb-2">Uninstalling deletes the game's files from the PC. Removing it from the library only takes it off the list.</Note>
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

/** Seconds since a running game started (the PC stamps lastPlayed at launch), ticking each second. */
function useSessionSeconds(running: boolean, startedUnix: number | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return
    setNow(Date.now())
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [running])
  // A phone clock a little behind the PC's would give a negative time.
  return running && startedUnix ? Math.max(0, Math.floor(now / 1000 - startedUnix)) : 0
}

/** A game on the PC: art, stats, and Play or Stop. */
export function LibraryGamePage({ id }: { id: string }) {
  const { link, back } = useApp()
  const { snapshot, state, starting, play, stop } = link
  const game = snapshot?.games.find((g) => g.id === id)
  const [hero, setHero] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
  const running = (game && snapshot?.running.includes(game.id)) ?? false
  const session = useSessionSeconds(running, game?.lastPlayed ?? null)

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
  const offline = state === 'offline'
  return (
    <div className="flex min-h-full flex-col">
      <PageHeader title={game.title} onBack={back} />
      <div className="grid gap-4 pb-6">
        <Poster src={game.header ?? game.cover ?? hero} title={game.title} nsfw={game.nsfw} ratio="aspect-[460/215]" className="!rounded-none border-x-0" />
        <div className="grid gap-4 px-4">
          <div className="flex items-center gap-2">
            <h2 className="min-w-0 grow text-lg font-bold leading-tight text-foreground">{game.title}</h2>
            {running ? <Tag className="border-success/50 tabular-nums text-success">Running{session ? ` · ${clock(session)}` : ''}</Tag> : null}
          </div>
          <dl className="grid grid-cols-3 gap-2">
            <Stat label="Played" value={formatPlaytime(game.playtimeSeconds + session)} />
            <Stat label="Last played" value={formatLastPlayed(game.lastPlayed)} />
            <Stat label="Added" value={game.addedAt ? new Date(game.addedAt * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Unknown'} />
          </dl>
          <div className="grid gap-1.5">
            <PlayButton running={running} starting={starting.has(id)} offline={offline} onPlay={() => void play(id)} onStop={() => void stop(id)} size="lg" />
            {offline ? <Caption className="text-center">PC is offline</Caption> : null}
          </div>
          <AchievementsCard id={id} />
          {/* What players thought, with their reactions: the game page's section, its two most helpful. */}
          {game.slug ? <Writeups slug={game.slug} version={null} limit={2} /> : null}
          <Block title="Manage">
            <Button variant="danger" disabled={offline || running} onClick={() => setRemoving(true)}>
              <Trash2 className="size-3.5" />
              Uninstall or remove
            </Button>
            {running ? <Note>Stop the game first.</Note> : null}
          </Block>
          <RemoveSheet game={removing ? game : null} onClose={() => setRemoving(false)} onDone={back} />
        </div>
      </div>
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
  const [manual, setManual] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [machine, setMachine] = useState<AccountMachine | null>(null)
  const hostField = useRef<HTMLInputElement | null>(null)
  const portField = useRef<HTMLInputElement | null>(null)

  const pair = async () => {
    setPairing(true)
    setError(null)
    try {
      const lan = await pairLan(`${host.trim()}:${port.trim()}`, code)
      setLinks({ lan, relay: links.relay?.installId === lan.installId ? links.relay : undefined })
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
      const next = await pairFromQr(await scanQr(), token)
      setLinks(next)
      toast(`Connected to ${next.lan?.name ?? next.relay?.name}.`)
      onDone?.()
    } catch (e) {
      if (!(e instanceof ScanCancelled)) setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPairing(false)
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid justify-items-center gap-1 text-center">
        <PixelSplash icon="MonitorSmartphone" className="mb-1 size-20 text-foreground" />
        <p className="text-sm font-bold text-foreground">Connect to your PC</p>
        <Note className="mx-auto max-w-xs">In Kryoto Desktop, open Settings, then Phone, and turn on On this network. It shows the code, and the address and port to enter by hand.</Note>
      </div>
      {error ? <Note className="text-destructive">{error}</Note> : null}
      {error && isTauri() && /local network/i.test(error) ? <Button onClick={() => void mobileAction('settings', { section: 'network' }).catch((e: unknown) => toast(fail(e)))}>Open Android app permissions</Button> : null}
      {!manual && isTauri() ? (
        <Button variant="primary" size="lg" disabled={pairing} onClick={() => void scanAndPair()}>
          <ScanLine className="size-4" />
          {pairing ? 'Pairing...' : 'Scan QR code'}
        </Button>
      ) : null}
      <Button onClick={() => setManual(!manual)} aria-expanded={manual}>
        {manual ? <ArrowLeft className="size-4" /> : <ChevronRight className="size-4" />}
        {manual ? 'Back to QR code' : 'Enter details manually'}
      </Button>
      {manual ? <Block title="Enter it by hand" className="kryo-slide">
        <label className="grid gap-1">
          <Caption>PC address</Caption>
          <input
            ref={hostField}
            value={host}
            onChange={(e) => {
              // The PC shows them as 192.168.1.5:47821: pasted whole, the port goes in its own box.
              const [address = '', typedPort] = e.target.value.split(':')
              setHost(address.replace(/[^\d.]/g, ''))
              if (typedPort) setPort(typedPort.replace(/\D/g, '').slice(0, 5))
              else if (typedPort === '') {
                // On to the port, its old number selected so what is typed replaces it.
                portField.current?.focus()
                portField.current?.select()
              }
            }}
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
            ref={portField}
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
        <Button disabled={pairing || code.length !== 6 || !host.trim() || !port.trim()} onClick={() => void pair()}>
          {pairing ? 'Pairing...' : 'Pair'}
        </Button>
      </Block> : null}
      <Block title="My Kryoto devices">
        {signedIn && token ? (
          <Machines
            token={token}
            onPick={(m) => {
              if (!m.reachable) return setMachine(m)
              setLinks({ lan: links.lan?.installId === m.id ? links.lan : undefined, relay: { installId: m.id, name: m.name } })
              onDone?.()
            }}
            fail={fail}
          />
        ) : (
          <>
            <Note>Sign in to see the PCs on your account.</Note>
            <Button onClick={signIn}>Sign in with kryo.to</Button>
          </>
        )}
      </Block>
      <MachineSheet
        machine={machine}
        onClose={() => setMachine(null)}
        onScan={
          isTauri()
            ? () => {
                setMachine(null)
                void scanAndPair()
              }
            : undefined
        }
        onType={() => {
          setMachine(null)
          setManual(true)
          window.setTimeout(() => hostField.current?.focus(), 0)
        }}
      />
    </div>
  )
}

/** What to do about a machine the phone cannot open through kryo.to. */
function MachineSheet({ machine, onClose, onScan, onType }: { machine: AccountMachine | null; onClose(): void; onScan?: () => void; onType(): void }) {
  const old = machine?.kind === 'desktop' && !atLeast(machine.version, PHONE_SERVER_VERSION)
  const visit = (path: string) => {
    onClose()
    void openExternal(`${API}${path}`)
  }
  return (
    <Sheet open={!!machine} onClose={onClose} title={machine ? `${machine.name} is not compatible` : 'Not compatible'}>
      {machine?.kind === 'forge' ? (
        <>
          <Note className="px-1 pb-2">This is a Kryoto Forge machine. It builds games for kryo.to and has no library to play from, so the phone cannot connect to it. Watch and control its builds on kryo.to instead.</Note>
          <SheetRow active onClick={() => visit('/remote?mode=forge')}>
            Open Forge remote
          </SheetRow>
          <SheetRow onClick={onClose}>Not now</SheetRow>
        </>
      ) : machine ? (
        <>
          <Note className="px-1 pb-2">
            Kryoto Desktop on this PC tells kryo.to about its downloads, but the phone can't open its library through kryo.to yet. Connect on the PC's Wi-Fi instead.
            {old
              ? ` It runs version ${machine.version || 'unknown'}: update Kryoto Desktop to ${PHONE_SERVER_VERSION} or later, then turn on Settings > Phone > On this network.`
              : ' On the PC, open Settings > Phone and turn on On this network.'}
          </Note>
          {onScan ? (
            <SheetRow active onClick={onScan}>
              Scan its QR code
            </SheetRow>
          ) : null}
          <SheetRow active={!onScan} onClick={onType}>
            Enter its address
          </SheetRow>
          <SheetRow onClick={() => visit('/remote?mode=desktop')}>See its downloads on kryo.to</SheetRow>
          <SheetRow onClick={onClose}>Not now</SheetRow>
        </>
      ) : null}
    </Sheet>
  )
}

/** Every machine on the account, the ones the phone cannot open marked so; tapping one of those says what to do. */
function Machines({ token, onPick, fail }: { token: string; onPick(m: AccountMachine): void; fail(e: unknown): string }) {
  const { remote, remoteWasOff } = useApp()
  const on = remote?.enabled === true
  const [machines, setMachines] = useState<AccountMachine[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = () => {
    setError(null)
    // Remote off (kryo.to lib/remote-consent.ts): kryo.to is not asked at all.
    if (!on) return setMachines(null)
    accountMachines(token)
      .then(setMachines)
      .catch((e: unknown) => {
        // Turned off on another device since: follow it.
        if (e instanceof RemoteOff) return remoteWasOff()
        setError(fail(e))
      })
  }
  useEffect(load, [token, on]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!remote) return <Busy />
  if (!on) return <RemoteConsentCard />
  if (error) return <Notice title="Could not list your PCs" body={error} retry={load} />
  if (!machines) return <Busy />
  if (!machines.length) return <Note>No PC on this account yet. Sign in to kryo.to in Kryoto Desktop and it shows up here.</Note>
  return (
    <ul className="grid gap-2">
      {machines.map((m) => (
        <li key={`${m.kind}:${m.id}`}>
          <button type="button" onClick={() => onPick(m)} className="kryo-radius flex w-full items-center gap-3 border border-border p-3 text-left">
            {m.kind === 'forge' ? <Hammer className="size-4 shrink-0 text-muted-foreground" /> : <Monitor className="size-4 shrink-0 text-muted-foreground" />}
            <span className="grid min-w-0 grow gap-0.5">
              <span className={cn('truncate text-xs font-bold', m.reachable ? 'text-foreground' : 'text-foreground/70')}>{m.name}</span>
              <span className="truncate text-[10px] text-muted-foreground">
                {m.kind === 'forge' ? 'Kryoto Forge' : 'Kryoto Desktop'}
                {m.version ? ` ${m.version}` : ''} · {m.online ? 'Online' : 'Offline'}
              </span>
            </span>
            {m.reachable ? null : <Tag className="border-destructive/50 text-destructive">Incompatible</Tag>}
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
