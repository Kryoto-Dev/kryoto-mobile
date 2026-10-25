import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Lock, Mic, MicOff, Phone, PhoneOff } from 'lucide-react'
import { Button } from '@/ui'
import { cn } from '@/lib/utils'
import { API, answerSignIn, openExternal } from '@/mobile/auth'
import { useApp } from '@/mobile/context'
import { Busy, Notice, PageHeader } from '@/mobile/parts'

/**
 * Chat on the phone: the same end-to-end encrypted web chat kryo.to's Friends
 * & chat panel runs, framed from its own origin (chat.kryo.to), so the keys
 * live there and never in this app's storage. The frame and this app talk
 * with postMessage only (kryoto-desktop src/web/embed.ts): this side sends
 * `open`, `focus`, `look`, `signin-start` and call actions; the frame sends
 * its state, the sign-in code to approve, badge counts, who wrote (never
 * what), the call card and pages to open.
 *
 * One frame for the whole app, kept while you move between pages, so a call
 * keeps going and new messages count. The Chats page only shows it.
 */

const CHAT_URL: string = import.meta.env.VITE_CHAT_URL || 'https://chat.kryo.to/'
const CHAT_ORIGIN = new URL(CHAT_URL).origin
/** Chat has worked in this app before: start it with the app, so calls ring. */
const HERE_KEY = 'kryo.chat.here'
/** How long after Turn on chat a sign-in code from the frame is approved. */
const SIGNIN_WINDOW_MS = 120_000

type FrameState = 'off' | 'loading' | 'signin' | 'waiting' | 'ready' | 'elsewhere' | 'unavailable' | 'other-account' | 'anonymous'
type CallCard = { phase: string; peer: string; name: string; since: number | null; muted: boolean; deafened: boolean; reason: string | null; reconnecting: boolean }
type CallAction = 'accept' | 'decline' | 'hangup' | 'mute' | 'deafen'
type ToFrame =
  | { type: 'open'; username: string }
  | { type: 'focus' }
  | { type: 'look'; look: Record<string, string | null> }
  | { type: 'signin-start' }
  | { type: 'call'; action: CallAction }

type ChatValue = {
  /** Chat is on for this account (kryo.to's `chat` and `chat_web` flags). */
  available: boolean
  state: FrameState
  unread: number
  requests: number
  call: CallCard | null
  signInError: string | null
  /** The Chats page is on screen. */
  showing: boolean
  /** The Chats page, on a conversation when a username is given. */
  open(username?: string): void
  turnOn(): void
  callAction(action: CallAction): void
  /** The Chats page's empty area, which the frame covers while it is showing. */
  setSlot(el: HTMLElement | null): void
}

const ChatContext = createContext<ChatValue | null>(null)

export function useChat(): ChatValue | null {
  return useContext(ChatContext)
}

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function writeLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Not remembered; chat starts when Chats is opened instead.
  }
}

/** The look on <html> (look.ts), for the frame to match. */
function currentLook(): Record<string, string | null> {
  const root = document.documentElement
  return {
    theme: root.classList.contains('dark') ? 'dark' : 'light',
    palette: root.dataset.palette ?? 'monochrome',
    radius: root.dataset.radius ?? 'pill',
    font: root.dataset.font ?? null,
    season: root.dataset.season ?? null,
    motion: root.dataset.motion ?? null,
  }
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const { token, me, push, toast } = useApp()
  // Anonymous mode is the frame's to explain: it knows, and says so.
  const available = !!token && !!me && !!me.features?.friends && !!me.features?.chat && !!me.features?.chat_web
  const src = available && me?.id ? `${CHAT_URL}${CHAT_URL.includes('?') ? '&' : '?'}embed=1&app=1&u=${encodeURIComponent(me.id)}` : null

  const frame = useRef<HTMLIFrameElement | null>(null)
  const [wanted, setWanted] = useState(false)
  const [state, setState] = useState<FrameState>('off')
  const [unread, setUnread] = useState(0)
  const [requests, setRequests] = useState(0)
  const [call, setCall] = useState<CallCard | null>(null)
  const [signInError, setSignInError] = useState<string | null>(null)
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const [box, setBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null)
  const signInAt = useRef(0)
  const pendingOpen = useRef<string | null>(null)
  const showing = useRef(false)
  showing.current = slot !== null

  const send = useCallback((msg: ToFrame) => {
    frame.current?.contentWindow?.postMessage({ kryoto: 'chat', ...msg }, CHAT_ORIGIN)
  }, [])

  // Started when Chats opens, or with the app once chat has worked here.
  useEffect(() => {
    if (!available) {
      setWanted(false)
      setState('off')
      return
    }
    if (slot) setWanted(true)
  }, [available, slot])
  useEffect(() => {
    if (!available || readLocal(HERE_KEY) !== '1') return
    const t = window.setTimeout(() => setWanted(true), 1500)
    return () => window.clearTimeout(t)
  }, [available])
  useEffect(() => {
    if (wanted) setState((s) => (s === 'off' ? 'loading' : s))
  }, [wanted])

  useEffect(() => {
    if (!src || !token) return
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== CHAT_ORIGIN || !frame.current || e.source !== frame.current.contentWindow) return
      const d = e.data as Record<string, unknown> | null
      if (!d || d.kryoto !== 'chat') return
      switch (d.type) {
        case 'state': {
          const s = d.state as FrameState
          setState(s)
          if (s === 'ready') {
            writeLocal(HERE_KEY, '1')
            setSignInError(null)
            if (pendingOpen.current) {
              send({ type: 'open', username: pendingOpen.current })
              pendingOpen.current = null
            }
          }
          if (s === 'signin' && typeof d.detail === 'string') setSignInError(d.detail)
          if (s === 'ready' || s === 'signin' || s === 'elsewhere') send({ type: 'look', look: currentLook() })
          if (showing.current && (s === 'ready' || s === 'elsewhere')) send({ type: 'focus' })
          return
        }
        case 'signin-code': {
          // Only a code the frame asked for right after Turn on chat was
          // pressed here: that press is the approval.
          if (Date.now() - signInAt.current > SIGNIN_WINDOW_MS || typeof d.code !== 'string') return
          signInAt.current = 0
          void answerSignIn(token, d.code, 'approve').catch((err: unknown) => setSignInError(err instanceof Error ? err.message : 'Chat could not be turned on.'))
          return
        }
        case 'badge':
          setUnread(Number(d.unread) || 0)
          setRequests(Number(d.messageRequests) || 0)
          return
        case 'message':
          if (!showing.current && typeof d.from === 'string') toast(`${d.from} sent you a message`)
          return
        case 'call':
          setCall(d.phase === 'idle' || typeof d.phase !== 'string' ? null : (d as unknown as CallCard))
          return
        case 'navigate': {
          const path = typeof d.path === 'string' ? d.path : ''
          if (!path.startsWith('/') || path.startsWith('//')) return
          const game = /^\/game\/([^/?#]+)/.exec(path)?.[1]
          if (game) push({ kind: 'game', slug: decodeURIComponent(game) })
          else void openExternal(`${API}${path}`)
          return
        }
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [src, token, send, push, toast])

  // The frame's look follows the app's.
  useEffect(() => {
    if (!wanted) return
    const observer = new MutationObserver(() => send({ type: 'look', look: currentLook() }))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-palette', 'data-radius', 'data-font', 'data-season', 'data-motion'] })
    return () => observer.disconnect()
  }, [wanted, send])

  // Showing Chats is using chat: the frame marks what is on screen as read.
  useEffect(() => {
    if (slot && state !== 'off') send({ type: 'focus' })
  }, [slot, state, send])

  // Over the Chats page's empty area while it shows; otherwise out of sight
  // but running.
  useLayoutEffect(() => {
    if (!slot) {
      setBox(null)
      return
    }
    // The page slides in, and the frame (fixed, outside the page) cannot slide
    // with it: it appears where the page lands, once the page is there.
    let settled = false
    const measure = () => {
      if (!settled) return
      const r = slot.getBoundingClientRect()
      setBox({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    const settle = () => {
      settled = true
      measure()
    }
    const landed = (e: AnimationEvent) => {
      if (e.target instanceof Node && e.target.contains(slot)) settle()
    }
    const fallback = window.setTimeout(settle, 700)
    const observer = new ResizeObserver(measure)
    observer.observe(slot)
    window.addEventListener('resize', measure)
    document.addEventListener('animationend', landed)
    return () => {
      window.clearTimeout(fallback)
      observer.disconnect()
      window.removeEventListener('resize', measure)
      document.removeEventListener('animationend', landed)
    }
  }, [slot])

  const open = useCallback(
    (username?: string) => {
      setWanted(true)
      if (username) {
        if (state === 'ready') send({ type: 'open', username })
        else pendingOpen.current = username
      }
      if (!showing.current) push({ kind: 'chats' })
    },
    [state, send, push],
  )
  const turnOn = useCallback(() => {
    signInAt.current = Date.now()
    setSignInError(null)
    send({ type: 'signin-start' })
  }, [send])
  const callAction = useCallback((action: CallAction) => send({ type: 'call', action }), [send])

  const value = useMemo<ChatValue>(
    () => ({ available, state, unread, requests, call, signInError, showing: slot !== null, open, turnOn, callAction, setSlot }),
    [available, state, unread, requests, call, signInError, slot, open, turnOn, callAction],
  )

  const framed = state === 'ready' || state === 'elsewhere' || state === 'unavailable' || state === 'other-account' || state === 'anonymous'
  const style: CSSProperties = box && framed ? { top: box.top, left: box.left, width: box.width, height: box.height } : { top: 0, left: -10, width: 1, height: 1 }
  return (
    <ChatContext.Provider value={value}>
      {children}
      {wanted && src ? (
        <iframe
          ref={frame}
          src={src}
          title="Chats"
          allow="microphone; autoplay; clipboard-write"
          referrerPolicy="no-referrer"
          aria-hidden={box && framed ? undefined : true}
          tabIndex={box && framed ? undefined : -1}
          style={style}
          className={cn('fixed z-30 border-0 bg-background', box && framed ? 'opacity-100' : 'pointer-events-none opacity-0')}
        />
      ) : null}
      <CallBanner />
    </ChatContext.Provider>
  )
}

/** The Chats page: the frame, or turning chat on for this phone. */
export function ChatsPage() {
  const { back, me } = useApp()
  const chat = useChat()
  const slot = useCallback((el: HTMLDivElement | null) => chat?.setSlot(el), [chat?.setSlot])

  if (!chat?.available) {
    return (
      <div className="flex min-h-full flex-col">
        <PageHeader title="Chats" onBack={back} />
        <Notice
          title={me?.features?.chat ? 'Chat runs in Kryoto Desktop for now' : 'Chat is not on for your account yet'}
          body={me?.features?.chat ? 'End-to-end encrypted messages and calls. Chat on the phone comes next.' : 'Friends work already: add people and see what they play.'}
        />
      </div>
    )
  }
  const framed = ['ready', 'elsewhere', 'unavailable', 'other-account', 'anonymous'].includes(chat.state)
  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Chats" onBack={back} />
      <div ref={slot} className="relative min-h-0 grow">
        {framed ? null : chat.state === 'signin' || chat.state === 'waiting' ? (
          <div className="grid gap-4 px-4 py-8 text-center">
            <Lock className="mx-auto size-5 text-muted-foreground" aria-hidden />
            <p className="text-sm font-bold text-foreground">Turn on chat on this phone</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Messages and calls are end-to-end encrypted: only you and the people you talk to can read them, not Kryoto. This phone gets keys of its own.
            </p>
            <Button variant="primary" size="lg" disabled={chat.state === 'waiting'} onClick={chat.turnOn}>
              <Lock className="size-3.5" aria-hidden />
              {chat.state === 'waiting' ? 'Turning on...' : 'Turn on chat'}
            </Button>
            {chat.signInError ? <p className="text-xs text-destructive">{chat.signInError}</p> : null}
          </div>
        ) : (
          <Busy label="Starting chat" />
        )}
      </div>
    </div>
  )
}

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * A call while Chats is not showing: who, how long, answer and decline, mute
 * and hang up. The frame's own call card has the rest.
 */
function CallBanner() {
  const chat = useChat()
  const call = chat?.call ?? null
  const [now, setNow] = useState(() => Date.now())
  const active = call?.phase === 'active'
  useEffect(() => {
    if (!active) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [active])
  if (!chat || !call || call.phase === 'ended' || chat.showing) return null
  const line =
    call.phase === 'incoming'
      ? 'is calling you'
      : call.phase === 'outgoing'
        ? 'Calling...'
        : call.phase === 'connecting'
          ? 'Connecting...'
          : call.reconnecting
            ? 'Reconnecting...'
            : clock(now - (call.since ?? now))
  return (
    <div
      role="status"
      aria-label={`Call with ${call.name}`}
      className="kryo-radius fixed inset-x-3 top-[calc(var(--sat)+0.5rem)] z-50 flex items-center gap-2 border border-border bg-card p-2 pl-3 shadow-2xl shadow-black/60"
    >
      <button type="button" className="grid min-w-0 grow text-left" onClick={() => chat.open()}>
        <b className="truncate text-xs text-foreground">{call.name}</b>
        <span className={cn('text-[11px] tabular-nums', call.reconnecting ? 'text-warning' : 'text-muted-foreground')}>{line}</span>
      </button>
      {call.phase === 'incoming' ? (
        <>
          <Button
            variant="primary"
            onClick={() => {
              chat.callAction('accept')
              chat.open()
            }}
          >
            <Phone className="size-3.5" aria-hidden /> Answer
          </Button>
          <Button variant="danger" onClick={() => chat.callAction('decline')}>
            <PhoneOff className="size-3.5" aria-hidden /> Decline
          </Button>
        </>
      ) : (
        <>
          <Button variant={call.muted ? 'danger' : 'outline'} onClick={() => chat.callAction('mute')} aria-pressed={call.muted} aria-label={call.muted ? 'Unmute' : 'Mute'}>
            {call.muted ? <MicOff className="size-3.5" aria-hidden /> : <Mic className="size-3.5" aria-hidden />}
          </Button>
          <Button variant="danger" onClick={() => chat.callAction('hangup')}>
            <PhoneOff className="size-3.5" aria-hidden /> {call.phase === 'outgoing' ? 'Cancel' : 'Hang up'}
          </Button>
        </>
      )}
    </div>
  )
}
