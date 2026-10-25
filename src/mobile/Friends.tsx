import { useCallback, useEffect, useState } from 'react'
import { AtSign, Ban, Check, Ellipsis, MessageSquare, UserMinus, UserPlus, X } from 'lucide-react'
import { Button, Caption, IconButton } from '@/ui'
import { cn } from '@/lib/utils'
import { API, openExternal, siteUrl } from '@/mobile/auth'
import { useChat } from '@/mobile/Chat'
import { useApp } from '@/mobile/context'
import { ProfileLink, TeamName } from '@/mobile/identity'
import { request } from '@/mobile/net'
import { Busy, Notice, PageHeader, Sheet, SheetRow } from '@/mobile/parts'

type Person = { id: string; username: string; displayName: string | null; avatarUrl: string | null; supporter: boolean }
type Friend = Person & { nickname: string | null; muted: boolean; online?: boolean; playing?: { slug: string; title: string } | null }
type Req = Person & { requestId: string }
type Data = { friends: Friend[]; incoming: Req[]; outgoing: Req[] }

const nameOf = (p: Person & { nickname?: string | null }) => p.nickname || p.displayName || p.username

function Face({ p, online, playing }: { p: Person; online?: boolean; playing?: boolean }) {
  const src = siteUrl(p.avatarUrl)
  return (
    <span className="relative shrink-0">
      {src ? (
        <img src={src} alt="" className="kryo-pill size-9 object-cover" />
      ) : (
        <span className="kryo-pill grid size-9 place-items-center bg-secondary text-xs font-bold text-foreground">{nameOf(p).slice(0, 1).toUpperCase()}</span>
      )}
      {playing || online ? (
        <span className={cn('absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-background', playing ? 'bg-primary' : 'bg-success')} aria-hidden />
      ) : null}
    </span>
  )
}

/**
 * Friends on the phone: requests to answer, adding someone by username, who
 * is online and what they play, and the requests you sent. The same list as
 * kryo.to's Friends & chat panel and Kryoto Desktop's. Message opens the
 * encrypted chat (Chat.tsx) where chat is on for the account.
 */
export function FriendsPage() {
  const { back, token, toast, fail } = useApp()
  const chat = useChat()
  const unread = chat?.state === 'ready' ? chat.unread + chat.requests : 0
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [off, setOff] = useState(false)
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [menu, setMenu] = useState<Friend | null>(null)
  const [confirming, setConfirming] = useState<{ kind: 'remove' | 'block'; f: Friend } | null>(null)

  const load = useCallback(async () => {
    if (!token) return
    try {
      const { json } = await request<Data>(`${API}/api/friends`, { token })
      setData(json)
      setError(null)
    } catch (e) {
      if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 404) setOff(true)
      else setError(fail(e))
    }
  }, [token, fail])

  useEffect(() => {
    void load()
    const t = window.setInterval(() => document.visibilityState === 'visible' && void load(), 30_000)
    return () => window.clearInterval(t)
  }, [load])

  const act = async (key: string, method: 'POST' | 'DELETE', path: string, body?: unknown, done?: string) => {
    setBusy(key)
    try {
      await request(`${API}${path}`, { method, token, body })
      if (done) toast(done)
      await load()
    } catch (e) {
      toast(fail(e))
    } finally {
      setBusy(null)
    }
  }

  const add = async () => {
    const name = username.trim().replace(/^@/, '')
    if (!name) return
    setBusy('add')
    try {
      const { json } = await request<{ status?: string }>(`${API}/api/friends/requests`, { method: 'POST', token, body: { username: name } })
      toast(json.status === 'friends' ? `You and ${name} are friends now.` : `Request sent to ${name}.`)
      setUsername('')
      await load()
    } catch (e) {
      toast(fail(e))
    } finally {
      setBusy(null)
    }
  }

  if (!token) {
    return (
      <div className="flex min-h-full flex-col">
        <PageHeader title="Friends" onBack={back} />
        <Notice title="Sign in to see your friends" />
      </div>
    )
  }

  const friends = data?.friends ?? []
  const inGame = friends.filter((f) => f.playing)
  const online = friends.filter((f) => !f.playing && f.online)
  const offline = friends.filter((f) => !f.playing && !f.online)

  const row = (f: Friend) => (
    <li key={f.id} className="flex items-center gap-3 py-2">
      <ProfileLink username={f.username} className="flex min-w-0 grow items-center gap-3">
        <Face p={f} online={f.online} playing={!!f.playing} />
        <span className="grid min-w-0">
          <span className="truncate text-sm text-foreground"><TeamName username={f.username}>{nameOf(f)}</TeamName></span>
          {f.playing ? (
            <span className="truncate text-[11px] text-foreground/80">Playing {f.playing.title}</span>
          ) : f.online ? (
            <span className="text-[11px] text-muted-foreground">Online</span>
          ) : null}
        </span>
      </ProfileLink>
      {chat?.available ? (
        <IconButton label={`Message ${nameOf(f)}`} onClick={() => chat.open(f.username)}>
          <MessageSquare className="size-4" />
        </IconButton>
      ) : null}
      <IconButton label={`More for ${nameOf(f)}`} onClick={() => setMenu(f)}>
        <Ellipsis className="size-4" />
      </IconButton>
    </li>
  )

  const group = (title: string, list: Friend[]) =>
    list.length ? (
      <section className="m-panel grid gap-1">
        <Caption className="flex justify-between">
          <span>{title}</span>
          <span className="tabular-nums">{list.length}</span>
        </Caption>
        <ul className="divide-y divide-border">{list.map(row)}</ul>
      </section>
    ) : null

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Friends"
        onBack={back}
        right={
          chat?.available ? (
            <span className="relative">
              <IconButton label={unread ? `Chats, ${unread} new` : 'Chats'} onClick={() => chat.open()}>
                <MessageSquare className="size-4" />
              </IconButton>
              {unread ? (
                <span aria-hidden className="kryo-pill absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center bg-primary px-1 text-[9px] font-bold tabular-nums text-primary-foreground">
                  {unread > 99 ? '99+' : unread}
                </span>
              ) : null}
            </span>
          ) : (
            <IconButton label="Chats on kryo.to" onClick={() => void openExternal(`${API}/?social=chats`)}>
              <MessageSquare className="size-4" />
            </IconButton>
          )
        }
      />
      <div className="grid gap-5 p-4">
        {off ? (
          <Notice title="Friends are not on for your account yet" />
        ) : (
          <>
            <form
              className="m-panel grid gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void add()
              }}
            >
              <label htmlFor="m-add-friend">
                <Caption>Add a friend</Caption>
              </label>
              <div className="flex gap-2">
                <span className="kryo-pill flex h-10 min-w-0 grow items-center gap-2 border border-border bg-background px-3 focus-within:border-foreground">
                  <AtSign className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <input
                    id="m-add-friend"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="their username"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    className="min-w-0 grow bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  />
                </span>
                <Button type="submit" variant="primary" disabled={!username.trim() || busy === 'add'}>
                  <UserPlus className="size-3.5" /> Send
                </Button>
              </div>
              <Caption>The name after the @ on their profile.</Caption>
            </form>

            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            {!data && !error ? <Busy label="Loading friends" /> : null}

            {data?.incoming.length ? (
              <section className="m-panel grid gap-1">
                <Caption className="flex justify-between">
                  <span>Friend requests</span>
                  <span className="tabular-nums">{data.incoming.length}</span>
                </Caption>
                <ul className="divide-y divide-border">
                  {data.incoming.map((r) => (
                    <li key={r.requestId} className="flex items-center gap-3 py-2">
                      <ProfileLink username={r.username} className="flex min-w-0 grow items-center gap-3">
                        <Face p={r} />
                        <span className="grid min-w-0">
                          <span className="truncate text-sm text-foreground"><TeamName username={r.username}>{nameOf(r)}</TeamName></span>
                          <span className="text-[11px] text-muted-foreground">Wants to be friends</span>
                        </span>
                      </ProfileLink>
                      <IconButton
                        label={`Accept ${nameOf(r)}`}
                        disabled={busy === r.requestId}
                        className="border-primary bg-primary text-primary-foreground"
                        onClick={() => void act(r.requestId, 'POST', `/api/friends/requests/${r.requestId}`, { action: 'accept' }, `You and ${nameOf(r)} are friends now.`)}
                      >
                        <Check className="size-4" />
                      </IconButton>
                      <IconButton label={`Decline ${nameOf(r)}`} disabled={busy === r.requestId} onClick={() => void act(r.requestId, 'POST', `/api/friends/requests/${r.requestId}`, { action: 'decline' })}>
                        <X className="size-4" />
                      </IconButton>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {group('In game', inGame)}
            {group('Online', online)}
            {group(inGame.length + online.length ? 'Offline' : 'Friends', offline)}
            {data && friends.length === 0 && data.incoming.length === 0 ? (
              <Notice title="No friends yet" body="Add someone by their username above, or share your invite link from kryo.to." />
            ) : null}

            {data?.outgoing.length ? (
              <section className="m-panel grid gap-1">
                <Caption className="flex justify-between">
                  <span>Sent requests</span>
                  <span className="tabular-nums">{data.outgoing.length}</span>
                </Caption>
                <ul className="divide-y divide-border">
                  {data.outgoing.map((r) => (
                    <li key={r.requestId} className="flex items-center gap-3 py-2">
                      <ProfileLink username={r.username} className="flex min-w-0 grow items-center gap-3 opacity-80">
                        <Face p={r} />
                        <span className="grid min-w-0">
                          <span className="truncate text-sm text-foreground"><TeamName username={r.username}>{nameOf(r)}</TeamName></span>
                          <span className="text-[11px] text-muted-foreground">Waiting for them</span>
                        </span>
                      </ProfileLink>
                      <IconButton label={`Take back the request to ${nameOf(r)}`} disabled={busy === r.requestId} onClick={() => void act(r.requestId, 'POST', `/api/friends/requests/${r.requestId}`, { action: 'cancel' }, 'Request taken back.')}>
                        <X className="size-4" />
                      </IconButton>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {chat?.available ? null : (
              <p className="text-center text-[11px] leading-relaxed text-muted-foreground">Chat and calls are in Kryoto Desktop, and in Friends &amp; chat on kryo.to.</p>
            )}
          </>
        )}
      </div>

      <Sheet open={menu !== null} onClose={() => setMenu(null)} title={menu ? nameOf(menu) : ''}>
        {menu ? (
          <>
            <SheetRow
              onClick={() => {
                const f = menu
                setMenu(null)
                void openExternal(`${API}/user/${encodeURIComponent(f.username)}`)
              }}
            >
              View profile
            </SheetRow>
            <SheetRow
              danger
              onClick={() => {
                const f = menu
                setMenu(null)
                setConfirming({ kind: 'remove', f })
              }}
            >
              Remove friend <UserMinus className="size-4" />
            </SheetRow>
            <SheetRow
              danger
              onClick={() => {
                const f = menu
                setMenu(null)
                setConfirming({ kind: 'block', f })
              }}
            >
              Block <Ban className="size-4" />
            </SheetRow>
          </>
        ) : null}
      </Sheet>

      <Sheet open={confirming !== null} onClose={() => setConfirming(null)} title={confirming ? `${confirming.kind === 'remove' ? 'Remove' : 'Block'} ${nameOf(confirming.f)}?` : ''}>
        {confirming ? (
          <>
            <p className="px-1 pb-2 text-xs leading-relaxed text-muted-foreground">
              {confirming.kind === 'remove'
                ? 'You stop being friends. They are not told.'
                : 'You stop being friends, and neither of you can message or call the other. Your profile shows as "Account not found" to them. They are not told.'}
            </p>
            <SheetRow
              danger
              onClick={() => {
                const { kind, f } = confirming
                setConfirming(null)
                if (kind === 'remove') void act(f.id, 'DELETE', `/api/friends/${f.id}`, undefined, `${nameOf(f)} is no longer your friend.`)
                else void act(f.id, 'POST', `/api/blocks/${f.id}`, undefined, `${nameOf(f)} is blocked.`)
              }}
            >
              {confirming.kind === 'remove' ? 'Remove' : 'Block'}
            </SheetRow>
            <SheetRow onClick={() => setConfirming(null)}>Cancel</SheetRow>
          </>
        ) : null}
      </Sheet>
    </div>
  )
}
