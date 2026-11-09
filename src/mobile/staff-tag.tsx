import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { API, siteUrl } from '@/mobile/auth'
import { useApp } from '@/mobile/context'
import { Avatar, ProfileLink } from '@/mobile/identity'
import { ApiError, request } from '@/mobile/net'
import { parseRich, type RichInline } from '@/rich/rich-text'
import { EyeOff, Info } from '@/ui/pixel-icons'

/** What kryo.to says about the person (kryo.to lib/staff-reveal-shared.ts). */
type Person = {
  username: string
  name: string
  avatarUrl: string | null
}

/** Behind the info button: kryo.to records the look first, or sends none of this. */
type Details = {
  joinedAt: string
  role: string | null
  supporter: string | null
  warnings: number
  testerSuspended: boolean
}

type Opened = { busy: true } | { error: string } | { details: Details }

const PILL =
  'kryo-pill inline-flex min-w-0 max-w-full items-center gap-1 border border-dashed border-primary/70 bg-primary/10 px-1.5 py-0.5 text-[10px] text-muted-foreground'

/**
 * The real name beside an "Anonymous", for staff who moderate, as on kryo.to
 * (components/staff/staff-reveal.tsx). The comments themselves are the same for
 * everybody; this asks afterwards, only for an account with a staff role, and
 * kryo.to answers only one that may moderate. `of` is a public id:
 * `comment:59`. Anyone else sees nothing here.
 */
export function StaffTag({ of }: { of: string }) {
  const { token, me } = useApp()
  const [opened, setOpened] = useState<Opened | null>(null)
  useSyncExternalStore(subscribe, version)
  const asking = token && me?.staffRole ? token : null

  /** Each press that opens it is a recorded look, so nothing is kept for the next one. */
  async function press() {
    if (opened) return setOpened(null)
    setOpened({ busy: true })
    try {
      const { json } = await request<{ details?: Details }>(`${API}/api/staff/reveal/details`, { method: 'POST', token, body: { ref: of } })
      setOpened(json.details ? { details: json.details } : { error: 'The details could not be opened.' })
    } catch (e) {
      setOpened({ error: e instanceof ApiError ? e.message : 'The details could not be opened. Check your connection.' })
    }
  }

  useEffect(() => {
    if (asking) ask(of, asking)
  }, [of, asking])

  if (!asking) return null
  if (failed.has(of)) {
    return (
      <span className={PILL}>
        <EyeOff className="size-3 shrink-0" aria-hidden />
        <span>Staff lookup failed.</span>
        <button
          type="button"
          onClick={() => {
            failed.delete(of)
            tell()
            ask(of, asking)
          }}
          className="font-bold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-primary"
        >
          Try again
        </button>
      </span>
    )
  }
  const person = known.get(of)
  if (!person) return null
  return (
    <>
      <span className={PILL}>
        <EyeOff className="size-3 shrink-0" aria-hidden />
        <span className="font-bold uppercase tracking-wider">Staff</span>
        <ProfileLink username={person.username} className="inline-flex min-w-0 items-center gap-1 font-bold text-foreground">
          <Avatar src={siteUrl(person.avatarUrl)} name={person.name} className="size-4 text-[8px]" />
          <span className="truncate">{person.name}</span>
        </ProfileLink>
        <button
          type="button"
          aria-expanded={Boolean(opened)}
          aria-label={`What staff know about ${person.name}. Opening this is recorded.`}
          onClick={() => void press()}
          className="focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Info className="size-3" aria-hidden />
        </button>
      </span>
      {opened ? (
        <span role="status" className="kryo-radius grid basis-full gap-0.5 border border-dashed border-primary/70 bg-card p-2 text-[11px] text-foreground">
          <span className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Only staff see this</span>
          {'details' in opened ? (
            <>
              <span>@{person.username}</span>
              <span>Joined {new Date(opened.details.joinedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              <span>{opened.details.role ?? 'Member'}{opened.details.supporter ? `, ${opened.details.supporter}` : ''}</span>
              <span>{opened.details.warnings ? `Warnings still counting: ${opened.details.warnings}` : 'No warnings'}</span>
              {opened.details.testerSuspended ? <span>Suspended from testing</span> : null}
            </>
          ) : 'error' in opened ? (
            <span className="text-destructive">{opened.error}</span>
          ) : (
            <span className="text-muted-foreground">Opening...</span>
          )}
        </span>
      ) : null}
    </>
  )
}

/**
 * Who the anonymous mentions in a comment are, under its text: the shared
 * renderer draws them as plain words, so they are named in order here.
 */
export function StaffMentionTags({ id, text }: { id: string; text: string }) {
  const count = useMemo(() => {
    let n = 0
    const walk = (nodes: RichInline[]) => {
      for (const node of nodes) {
        if (node.t === 'mention' && node.who?.state === 'anonymous') n++
        if ('c' in node) walk(node.c)
      }
    }
    for (const block of parseRich(text)) if (block.t !== 'codeblock') walk(block.c)
    return n
  }, [text])
  if (!count) return null
  return (
    <span className="flex flex-wrap items-center gap-1 empty:hidden">
      {Array.from({ length: count }, (_, i) => (
        <StaffTag key={i} of={`mention:comment:${id}:${i}`} />
      ))}
    </span>
  )
}

// One question per thread, not one per name.

const known = new Map<string, Person | null>()
const failed = new Set<string>()
const waiting = new Set<string>()
const listeners = new Set<() => void>()
let stamp = 0
let timer: ReturnType<typeof setTimeout> | null = null
let askedAs: string | null = null

const version = () => stamp
function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
function tell() {
  stamp++
  for (const fn of listeners) fn()
}

function ask(ref: string, token: string) {
  // Somebody else signed in: what the last account was told is not theirs.
  if (askedAs !== token) {
    askedAs = token
    known.clear()
    failed.clear()
    waiting.clear()
  }
  if (known.has(ref) || failed.has(ref)) return
  waiting.add(ref)
  timer ??= setTimeout(() => void flush(token), 40)
}

async function flush(token: string) {
  timer = null
  const batch = [...waiting].slice(0, 100)
  for (const ref of batch) waiting.delete(ref)
  if (!batch.length) return
  try {
    const { json } = await request<{ people?: Record<string, Person | null> }>(`${API}/api/staff/reveal`, { method: 'POST', token, body: { refs: batch } })
    for (const ref of batch) known.set(ref, json.people?.[ref] ?? null)
  } catch (e) {
    // 404 is kryo.to saying this account may not ask: nothing to show, nothing wrong.
    for (const ref of batch) {
      if (e instanceof ApiError && e.status === 404) known.set(ref, null)
      else failed.add(ref)
    }
  }
  tell()
  if (waiting.size) timer = setTimeout(() => void flush(token), 40)
}
