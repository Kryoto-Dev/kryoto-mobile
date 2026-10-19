import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronRight, Copy, ExternalLink, MapPin, QrCode } from 'lucide-react'
import { Button, Caption } from '@/ui'
import { cn } from '@/lib/utils'
import { isTauri } from '@/lib/bridge'
import { formatPlaytime } from '@/lib/format'
import { STATUS_LABEL, STATUSES } from '@/hooks/useSaved'
import { API, openExternal, parseSignInCode, profile as loadProfile, siteUrl, type AccountProfile } from '@/mobile/auth'
import { savedLibrary, type SavedCounts, type SavedEntry } from '@/mobile/catalog'
import { useApp } from '@/mobile/context'
import { Poster, Strip, TopInset } from '@/mobile/parts'
import { Badges } from '@/mobile/badges'
import { ScanCancelled, scanQr } from '@/mobile/scan'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="m-panel grid gap-2.5">
      <Caption className="font-bold text-foreground/80">{title}</Caption>
      {children}
    </section>
  )
}

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="kryo-radius grid gap-1 border border-border bg-card p-3">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="truncate text-sm font-bold text-foreground">{value}</span>
    </div>
  )
}

/** A sideways strip of game covers; `chips` puts the list each one is in over its corner. */
function Covers({ entries, chips, onOpen }: { entries: SavedEntry[]; chips?: boolean; onOpen: (slug: string) => void }) {
  return (
    <Strip>
      {entries.map((e) => (
        <button key={e.slug} type="button" onClick={() => onOpen(e.slug)} className="grid w-28 shrink-0 content-start gap-1.5 text-left">
          <div className="relative">
            <Poster src={e.cover || null} title={e.title || e.slug} />
            {chips ? (
              <span className="kryo-pill absolute left-1.5 top-1.5 bg-background px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-foreground">{STATUS_LABEL[e.status]}</span>
            ) : null}
          </div>
          <span className="line-clamp-2 text-xs font-bold text-foreground">{e.title || e.slug}</span>
        </button>
      ))}
    </Strip>
  )
}

function LinkRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="kryo-radius flex items-center justify-between border border-border bg-card px-4 py-3 text-left text-xs text-foreground">
      {label}
      <ChevronRight className="size-4 text-muted-foreground" />
    </button>
  )
}

const updatedMs = (e: SavedEntry) => Date.parse(e.updatedAt ?? '') || 0

/** Profile: the account, what you have played on the PC, and the PC link. */
export function Profile() {
  const { token, me, signedIn, signIn, signOut, links, setLinks, link, push, toast, fail } = useApp()
  const { snapshot, state } = link
  const [counts, setCounts] = useState<Partial<SavedCounts> | null>(null)
  const [entries, setEntries] = useState<SavedEntry[]>([])
  const [copied, setCopied] = useState(false)
  const [prof, setProf] = useState<AccountProfile | null>(null)

  // The profile as kryo.to's /user page shows it: its default banner, the
  // looks the account's perks allow, every picture as a full address.
  useEffect(() => {
    if (!token) {
      setProf(null)
      return
    }
    let current = true
    loadProfile(token)
      .then((p) => current && setProf(p))
      .catch(() => {})
    return () => {
      current = false
    }
  }, [token, me?.bannerUrl, me?.avatarUrl, me?.displayName])

  useEffect(() => {
    if (!token) return
    let current = true
    savedLibrary(token)
      .then((lib) => {
        if (!current) return
        setCounts(lib.counts)
        setEntries(lib.entries)
      })
      .catch((e: unknown) => current && void fail(e))
    return () => {
      current = false
    }
  }, [token, fail])

  const stats = useMemo(() => {
    const games = snapshot?.games ?? []
    const played = games.filter((g) => g.playtimeSeconds > 0)
    const total = games.reduce((sum, g) => sum + g.playtimeSeconds, 0)
    const top = [...played].sort((a, b) => b.playtimeSeconds - a.playtimeSeconds).slice(0, 5)
    return { total, played: played.length, top, longest: top[0]?.playtimeSeconds ?? 0 }
  }, [snapshot])

  const { playing, recent } = useMemo(() => {
    const newest = [...entries].sort((a, b) => updatedMs(b) - updatedMs(a))
    return { playing: newest.filter((e) => e.status === 'playing'), recent: newest.slice(0, 8) }
  }, [entries])

  const linked = !!(links.lan || links.relay)
  const pcName = links.lan?.name || links.relay?.name || ''
  const how = links.lan && state !== 'offline' ? 'On this network' : links.relay ? 'Through kryo.to' : 'On this network'

  // Who this is: the signed-in account, else whoever is signed in on the linked PC.
  const pc = snapshot?.profile ?? null
  const ident =
    signedIn
      ? { name: me ? me.displayName || me.username : 'Loading...', username: me?.username, avatar: siteUrl(me?.avatarUrl), supporter: me?.isSupporter, kryos: me?.kryos?.balance ?? null, fromPc: false }
      : pc
        ? { name: pc.displayName || pc.username, username: pc.username, avatar: siteUrl(pc.avatarUrl), supporter: pc.supporter, kryos: pc.kryos, fromPc: true }
        : null
  const listCounts: Partial<Record<string, number>> | null = signedIn ? (counts ?? {}) : (pc?.counts ?? null)

  const open = (url: string) => void openExternal(url)

  // The full account page needs the loaded account; until then (or from a PC) the short header.
  const account = signedIn ? me : null
  const joined = account?.createdAt ? new Date(account.createdAt) : null
  const joinedText = joined && !Number.isNaN(joined.getTime()) ? joined.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : null
  const kryoId = account?.id ? `K// ${account.id.match(/.{1,4}/g)?.join(' ') ?? account.id}` : null
  // What the page draws: the site's answer once it is in, the account's own fields until then.
  const view = account
    ? {
        name: prof?.displayName || account.displayName || account.username,
        banner: prof ? prof.bannerUrl : siteUrl(account.bannerUrl),
        avatar: prof ? prof.avatarUrl : siteUrl(account.avatarUrl),
        accent: prof ? prof.accentColor : null,
        status: prof ? prof.customStatus : account.profileCustomStatus,
        statusIcon: prof?.customStatusIcon ?? null,
        bio: prof?.bio ?? account.bio,
        // Drawn exactly as the site draws them, once the site has answered.
        badges: prof?.badges ?? [],
        location: prof?.location ?? null,
        links: prof?.links ?? [],
        kryos: prof ? prof.kryos : (account.kryos?.balance ?? null),
      }
    : null

  const scanSignIn = async () => {
    try {
      const code = parseSignInCode(await scanQr())
      if (!code) {
        toast('That is not a kryo.to sign-in code. Scan the QR code under Sign in with your phone on kryo.to.')
        return
      }
      push({ kind: 'approve', code })
    } catch (e) {
      if (!(e instanceof ScanCancelled)) toast(e instanceof Error ? e.message : String(e))
    }
  }

  const copyId = () => {
    if (!account?.id) return
    navigator.clipboard
      .writeText(account.id)
      .then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1800)
        toast('K// ID copied.')
      })
      .catch(() => toast('Could not copy the K// ID.'))
  }

  const cells: [string, number][] = listCounts
    ? [
        ['Total', STATUSES.reduce((n, s) => n + (listCounts[s] ?? 0), 0)],
        ['Playing', listCounts.playing ?? 0],
        ['Completed', listCounts.completed ?? 0],
        ['Plan', listCounts.plan ?? 0],
        ['On hold', listCounts.onhold ?? 0],
        ['Favorites', listCounts.favorite ?? 0],
      ]
    : []

  return (
    <div className="flex min-h-full flex-col">
      <TopInset />
      {account && view ? (
        <div className="relative">
          {/* kryo.to's banner shape (3:1, what its crop editor saves), so nothing the editor promised is cut off. */}
          <div className="relative aspect-[3/1] w-full overflow-hidden border-b border-border bg-card">
            {view.banner ? (
              <img key={view.banner} src={view.banner} alt="" draggable={false} decoding="async" className="size-full object-cover object-center" />
            ) : (
              <div className="size-full bg-linear-to-br from-secondary via-muted/40 to-background" />
            )}
            <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-background/90 via-background/30 to-transparent" />
          </div>
          {view.accent ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 -bottom-24 h-40 opacity-25 blur-3xl"
              style={{ background: `radial-gradient(ellipse at center, ${view.accent} 0%, transparent 70%)` }}
            />
          ) : null}
          <div
            className="absolute -bottom-10 left-4 z-10 size-20 overflow-hidden rounded-full border-4 border-background bg-card"
            style={view.accent ? { boxShadow: `0 0 0 2px ${view.accent}, 0 8px 24px -4px ${view.accent}40` } : undefined}
          >
            {view.avatar ? (
              <img src={view.avatar} alt="" className="size-full object-cover" />
            ) : (
              <span className="grid size-full place-items-center text-2xl font-bold text-foreground">{view.name.slice(0, 1).toUpperCase()}</span>
            )}
          </div>
        </div>
      ) : null}
      <div className={cn('grid gap-6 px-4 pb-8', account ? 'pt-14' : 'pt-5')}>
        <LinkRow label="Notifications & updates" onClick={() => push({ kind: 'notifications' })} />
        {account && view ? (
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h1 className="min-w-0 break-words text-2xl font-bold leading-tight text-foreground">{view.name}</h1>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badges badges={view.badges} onOpen={(href) => open(`${API}${href}`)} />
              </div>
            </div>
            <Caption>
              @{account.username}
              {joinedText ? ` · Joined ${joinedText}` : ''}
            </Caption>
            {view.status ? (
              <p className="text-xs italic text-muted-foreground">
                {view.statusIcon ? <span className="not-italic">{view.statusIcon} </span> : null}
                {view.status}
              </p>
            ) : null}
            {view.location ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="size-3.5 shrink-0" aria-hidden />
                {view.location}
              </p>
            ) : null}
            {view.bio ? <p className="whitespace-pre-line break-words text-sm leading-relaxed text-foreground/90">{view.bio}</p> : null}
            {view.links.length ? (
              <div className="flex flex-wrap gap-1.5">
                {view.links.map((l) => (
                  <button
                    key={l.url}
                    type="button"
                    onClick={() => open(l.url)}
                    className="kryo-pill inline-flex items-center gap-1 border border-border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                  >
                    {l.label || l.platform}
                    <ExternalLink className="size-3" aria-hidden />
                  </button>
                ))}
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {kryoId ? (
                <span className="kryo-pill inline-flex items-center gap-1.5 border border-border bg-card py-0.5 pl-3 pr-1 text-[11px] font-bold tracking-wider text-foreground">
                  {kryoId}
                  <button type="button" aria-label="Copy K// ID" onClick={copyId} className="kryo-pill grid size-6 place-items-center text-muted-foreground">
                    {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
                  </button>
                </span>
              ) : null}
              {view.kryos != null ? <Caption>{view.kryos.toLocaleString()} Kryos</Caption> : null}
            </div>
          </div>
        ) : ident ? (
          <div className="flex items-center gap-4">
            {ident.avatar ? (
              <img src={ident.avatar} alt="" className="size-16 shrink-0 rounded-full border border-border object-cover" />
            ) : (
              <span className="grid size-16 shrink-0 place-items-center rounded-full border border-border bg-card text-xl font-bold text-foreground">{ident.name.slice(0, 1).toUpperCase()}</span>
            )}
            <div className="grid min-w-0 gap-0.5">
              <span className="truncate text-base font-bold text-foreground">{ident.name}</span>
              {ident.username ? <Caption>@{ident.username}</Caption> : null}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {ident.supporter ? <span className="kryo-pill border border-primary/60 px-2.5 py-0.5 text-[10px] uppercase tracking-wider text-primary">Supporter</span> : null}
                {ident.kryos != null ? <Caption>{ident.kryos.toLocaleString()} Kryos</Caption> : null}
              </div>
              {ident.fromPc ? <Caption>From {pcName || 'your PC'}</Caption> : null}
            </div>
          </div>
        ) : (
          <section className="kryo-radius grid gap-3 border border-border bg-card p-4 text-center">
            <p className="text-sm font-bold text-foreground">Sign in to see your lists</p>
            <p className="text-xs leading-relaxed text-muted-foreground">Your account keeps your lists, your profile and your saved games. Or connect a PC that is signed in to kryo.to.</p>
            <Button variant="primary" onClick={signIn}>
              Sign in with kryo.to
            </Button>
          </section>
        )}

        {!signedIn && ident ? (
          <section className="kryo-radius grid gap-3 border border-border bg-card p-4">
            <p className="text-sm font-bold text-foreground">Sign in on this phone</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              You are seeing {pcName || 'your PC'}'s account. Sign in with kryo.to to get your banner, badges and lists here.
            </p>
            <Button variant="primary" onClick={signIn}>
              Sign in with kryo.to
            </Button>
          </section>
        ) : null}

        {signedIn ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => open(`${API}/collections`)}>
              Collections
            </Button>
            <Button size="sm" onClick={() => open(`${API}/settings/profile`)}>
              Edit profile
            </Button>
            <Button size="sm" onClick={() => open(`${API}/perks`)}>
              Perks
            </Button>
            <Button size="sm" variant="primary" onClick={() => open(`${API}/settings`)}>
              Settings
            </Button>
            <Button size="sm" variant="danger" onClick={signOut}>
              Sign out
            </Button>
          </div>
        ) : null}

        {listCounts ? (
          <div className="m-panel kryo-radius grid grid-cols-3 gap-px overflow-hidden border border-border bg-border">
            {cells.map(([label, value]) => (
              <div key={label} className="grid justify-items-center gap-0.5 bg-card px-2 py-3">
                <span className="text-base font-bold text-foreground">{value.toLocaleString()}</span>
                <Caption>{label}</Caption>
              </div>
            ))}
          </div>
        ) : null}

        {playing.length ? (
          <Section title="Currently playing">
            <Covers entries={playing} onOpen={(slug) => push({ kind: 'game', slug })} />
          </Section>
        ) : null}

        {recent.length ? (
          <Section title="Recently updated">
            <Covers entries={recent} chips onOpen={(slug) => push({ kind: 'game', slug })} />
            <LinkRow label="Manage my library" onClick={() => open(`${API}/library`)} />
          </Section>
        ) : null}

        <Section title="Play time">
          {snapshot ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Tile label="Played in all" value={formatPlaytime(stats.total)} />
                <Tile label="Games" value={stats.played} />
              </div>
              {stats.top.length ? (
                <div className="kryo-radius grid gap-3 border border-border bg-card p-3">
                  {stats.top.map((g) => (
                    <div key={g.id} className="grid gap-1.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-xs text-foreground">{g.title}</span>
                        <span className="shrink-0 text-xs font-bold text-foreground">{formatPlaytime(g.playtimeSeconds)}</span>
                      </div>
                      <div className="h-1 overflow-hidden rounded-full bg-secondary">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max((g.playtimeSeconds / stats.longest) * 100, 2)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-xs leading-relaxed text-muted-foreground">Connect a PC to see how much you have played.</p>
          )}
        </Section>

        {signedIn && isTauri() ? (
          <Section title="Sign in on another device">
            <p className="text-xs leading-relaxed text-muted-foreground">
              On kryo.to's sign-in page, choose Sign in with your phone and scan its QR code here. Works for Kryoto Desktop and Forge too.
            </p>
            <Button onClick={() => void scanSignIn()}>
              <QrCode className="size-4" />
              Scan a sign-in code
            </Button>
          </Section>
        ) : null}

        {account ? (
          <Section title="Community activity">
            <LinkRow label="Reputation, verified games and reports" onClick={() => open(`${API}/user/${encodeURIComponent(account.username)}`)} />
          </Section>
        ) : null}

        {signedIn ? (
          <Section title="Collections">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Make a collection public at{' '}
              <button type="button" onClick={() => open(`${API}/collections`)} className="font-bold text-foreground underline underline-offset-2">
                my collections
              </button>{' '}
              and it shows here.
            </p>
          </Section>
        ) : null}

        <Section title="Your PC">
          <div className="kryo-radius grid gap-3 border border-border bg-card p-4">
            {linked ? (
              <>
                <div className="grid gap-0.5">
                  <span className="text-xs font-bold text-foreground">{pcName || 'Your PC'}</span>
                  <Caption>{how}</Caption>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => push({ kind: 'connect' })}>
                    Re-pair
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setLinks({})}>
                    Forget PC
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs leading-relaxed text-muted-foreground">No PC is connected.</p>
                <Button size="sm" onClick={() => push({ kind: 'connect' })}>
                  Connect a PC
                </Button>
              </>
            )}
          </div>
        </Section>

        <p className="text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Kryoto Mobile {__APP_VERSION__}</p>
      </div>
    </div>
  )
}
