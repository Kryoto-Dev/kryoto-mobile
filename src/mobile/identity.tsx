import { useSyncExternalStore, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { TeamGem } from '@/mobile/pixel-badges'
import { API, openExternal } from '@/mobile/auth'

const EMPTY: ReadonlySet<string> = new Set()
let members: ReadonlySet<string> = EMPTY
let inflight: Promise<void> | null = null
let timer: ReturnType<typeof setInterval> | undefined
const listeners = new Set<() => void>()
async function refresh() {
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const response = await fetch(`${API}/api/community/team`, { cache: 'no-store', credentials: 'omit' })
      if (!response.ok) throw new Error('Team unavailable')
      const data: { usernames?: unknown } = await response.json()
      members = new Set(Array.isArray(data.usernames) ? data.usernames.filter((name): name is string => typeof name === 'string' && name.length > 0).map(name => name.toLowerCase()) : [])
    } catch { members = EMPTY }
    finally { listeners.forEach(listener => listener()) }
  })().finally(() => { inflight = null })
  return inflight
}
function subscribe(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) {
    void refresh()
    timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, 60_000)
    window.addEventListener('focus', focus)
  }
  return () => {
    listeners.delete(listener)
    if (!listeners.size) { clearInterval(timer); window.removeEventListener('focus', focus); members = EMPTY }
  }
}
function focus() { void refresh() }
const none = () => () => {}
const snapshot = () => members
const serverSnapshot = () => EMPTY

/** Canonical usernames only; hidden identities and account-less labels pass null. */
export function TeamName({ username, children }: { username: string | null | undefined; children: ReactNode }) {
  const team = useSyncExternalStore(username ? subscribe : none, snapshot, serverSnapshot)
  return <>{children}{username && team.has(username.toLowerCase()) ? <TeamGem className="ml-[0.3em] align-[-0.08em]" /> : null}</>
}

/** Use around an identity, beside its actions, so a name never nests a link inside a button. */
export function ProfileLink({ username, children, className, onProfile }: { username: string | null | undefined; children: ReactNode; className?: string; onProfile?: () => void }) {
  if (!username) return <span className={className}>{children}</span>
  const url = `${API}/user/${encodeURIComponent(username)}`
  return <a href={url} className={cn('focus-visible:outline-2 focus-visible:outline-primary', className)} onClick={event => { event.preventDefault(); if (onProfile) onProfile(); else void openExternal(url) }}>{children}</a>
}

/** A profile picture, or the first letter of the name when there is none. */
export function Avatar({ src, name, className }: { src: string | null | undefined; name: string; className?: string }) {
  if (src) return <img src={src} alt="" className={cn('shrink-0 rounded-full border border-border object-cover', className)} />
  return <span className={cn('grid shrink-0 place-items-center rounded-full border border-border bg-secondary font-bold text-foreground', className)}>{name.slice(0, 1).toUpperCase()}</span>
}
