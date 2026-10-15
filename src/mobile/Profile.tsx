import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronRight, Copy, Shield, ShieldCheck, Upload } from 'lucide-react'
import { Button, Caption } from '@/ui'
import { cn } from '@/lib/utils'
import { formatPlaytime } from '@/lib/format'
import { STATUS_LABEL, STATUSES } from '@/hooks/useSaved'
import { openExternal } from '@/mobile/auth'
import { savedLibrary, type SavedCounts, type SavedEntry } from '@/mobile/catalog'
import { useApp } from '@/mobile/context'
import { Poster, Strip, TopInset } from '@/mobile/parts'

const SITE = 'https://kryo.to'

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

function Badge({ icon, children, tone }: { icon: React.ReactNode; children: React.ReactNode; tone: 'primary' | 'muted' }) {
  return (
    <span
      className={cn(
        'kryo-pill inline-flex items-center gap-1 border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider [&>svg]:size-3',
        tone === 'primary' ? 'border-primary/60 text-primary' : 'border-border text-muted-foreground',
      )}
    >
      {icon}
      {children}
    </span>
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
      ? { name: me ? me.displayName || me.username : 'Loading...', username: me?.username, avatar: me?.avatarUrl, supporter: me?.isSupporter, kryos: me?.kryos?.balance ?? null, fromPc: false }
      : pc
        ? { name: pc.displayName || pc.username, username: pc.username, avatar: pc.avatarUrl, supporter: pc.supporter, kryos: pc.kryos, fromPc: true }
        : null
  const listCounts: Partial<Record<string, number>> | null = signedIn ? (counts ?? {}) : (pc?.counts ?? null)

  const open = (url: string) => void openExternal(url)

  // The full account page needs the loaded account; until then (or from a PC) the short header.
  const account = signedIn ? me : null
  const joined = account?.createdAt ? new Date(account.createdAt) : null
  const joinedText = joined && !Number.isNaN(joined.getTime()) ? joined.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : null
  const kryoId = account?.id ? `K// ${account.id.match(/.{1,4}/g)?.join(' ') ?? account.id}` : null

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
      {account ? (
        <div className="relative">
          <div className="relative aspect-[16/7] w-full overflow-hidden bg-card">
            {account.bannerUrl ? (
              <img src={account.bannerUrl} alt="" draggable={false} className="size-full object-cover" />
            ) : account.profileAccentColor ? (
              <div className="size-full opacity-60" style={{ backgroundImage: `linear-gradient(135deg, ${account.profileAccentColor}, transparent)` }} />
            ) : null}
            <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-background to-transparent" />
          </div>
          {account.avatarUrl ? (
            <img src={account.avatarUrl} alt="" className="absolute -bottom-10 left-4 z-10 size-20 rounded-full border-4 border-background bg-card object-cover" />
          ) : (
            <span className="absolute -bottom-10 left-4 z-10 grid size-20 place-items-center rounded-full border-4 border-background bg-card text-2xl font-bold text-foreground">
              {(account.displayName || account.username).slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>
      ) : null}
      <div className={cn('grid gap-6 px-4 pb-8', account ? 'pt-14' : 'pt-5')}>
        {account ? (
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h1 className="min-w-0 break-words text-2xl font-bold leading-tight text-foreground">{account.displayName || account.username}</h1>
              <div className="flex flex-wrap items-center gap-1.5">
                {account.staffRole ? (
                  <Badge tone="primary" icon={account.staffRole === 'uploader' ? <Upload aria-hidden /> : <ShieldCheck aria-hidden />}>
                    {account.staffRole}
                  </Badge>
                ) : null}
                {account.isSupporter ? (
                  <Badge tone="primary" icon={<ShieldCheck aria-hidden />}>
                    Supporter
                  </Badge>
                ) : null}
                {account.isTester ? (
                  <Badge tone="muted" icon={<Shield aria-hidden />}>
                    Playtester
                  </Badge>
                ) : null}
              </div>
            </div>
            <Caption>
              @{account.username}
              {joinedText ? ` · Joined ${joinedText}` : ''}
            </Caption>
            {account.profileCustomStatus ? <p className="text-xs italic text-muted-foreground">{account.profileCustomStatus}</p> : null}
            {account.bio ? <p className="whitespace-pre-line break-words text-sm leading-relaxed text-foreground/90">{account.bio}</p> : null}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {kryoId ? (
                <span className="kryo-pill inline-flex items-center gap-1.5 border border-border bg-card py-0.5 pl-3 pr-1 text-[11px] font-bold tracking-wider text-foreground">
                  {kryoId}
                  <button type="button" aria-label="Copy K// ID" onClick={copyId} className="kryo-pill grid size-6 place-items-center text-muted-foreground">
                    {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
                  </button>
                </span>
              ) : null}
              {account.kryos?.balance != null ? <Caption>{account.kryos.balance.toLocaleString()} Kryos</Caption> : null}
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
            <p className="text-xs leading-relaxed text-muted-foreground">Your account keeps your lists and lets your phone reach your PC away from home. Or connect a PC that is signed in to kryo.to.</p>
            <Button variant="primary" onClick={signIn}>
              Sign in with kryo.to
            </Button>
          </section>
        )}

        {!signedIn && ident ? (
          <section className="kryo-radius grid gap-3 border border-border bg-card p-4">
            <p className="text-sm font-bold text-foreground">Sign in on this phone</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              You are seeing {pcName || 'your PC'}'s account. Sign in with kryo.to to get your banner, badges, lists and downloads here, and to reach your PC away from home.
            </p>
            <Button variant="primary" onClick={signIn}>
              Sign in with kryo.to
            </Button>
          </section>
        ) : null}

        {signedIn ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => open(`${SITE}/collections`)}>
              Collections
            </Button>
            <Button size="sm" onClick={() => open(`${SITE}/settings/profile`)}>
              Edit profile
            </Button>
            <Button size="sm" onClick={() => open(`${SITE}/perks`)}>
              Perks
            </Button>
            <Button size="sm" variant="primary" onClick={() => open(`${SITE}/settings`)}>
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
            <LinkRow label="Manage my library" onClick={() => open(`${SITE}/library`)} />
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

        {account ? (
          <Section title="Community activity">
            <LinkRow label="Reputation, verified games and reports" onClick={() => open(`${SITE}/user/${encodeURIComponent(account.username)}`)} />
          </Section>
        ) : null}

        {signedIn ? (
          <Section title="Collections">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Make a collection public at{' '}
              <button type="button" onClick={() => open(`${SITE}/collections`)} className="font-bold text-foreground underline underline-offset-2">
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
