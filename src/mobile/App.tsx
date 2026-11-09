import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Check, Copy, Library as LibraryIcon, MessageSquare, Store as StoreIcon, User, X } from '@/ui/pixel-icons'
import { SplashScene } from '@/boot/SplashScene'
import { ACTION_FAILED_EVENT, AsciiBar, Button, Caption, IconButton } from '@/ui'
import { dialogCount, watchDialogs } from '@/ui/dialog-focus'
import { cn } from '@/lib/utils'
import { ApprovePage } from '@/mobile/Approve'
import {
  groupCode,
  me as loadMe,
  openExternal,
  signOut as endSession,
  SignInExpired,
  startSignIn,
  waitForToken,
  type DeviceStart,
  type Me,
  type RemoteConsent,
} from '@/mobile/auth'
import { App as AppContextProvider, type AppContext, type Page, type ToastOptions } from '@/mobile/context'
import { CollectionPage, CollectionsPage } from '@/mobile/Collections'
import { revealSetting, type MobileSetting } from '@/mobile/settings-links'
import { GamePage } from '@/mobile/GamePage'
import { remoteConsent, setRemoteConsent, useLibraryLink } from '@/mobile/link'
import { ConnectPage, Library, LibraryGamePage } from '@/mobile/Library'
import { ApiError, request } from '@/mobile/net'
import { API, socialOn } from '@/mobile/auth'
import { syncEmojiUsage } from '@/rich/emoji-usage'
import { Profile } from '@/mobile/Profile'
import { clock } from '@/mobile/format'
import { Block, Note, Toast, type ToastMessage } from '@/mobile/parts'
import { applyLook } from '@/mobile/look'
import { followAccount } from '@/mobile/adult'
import { store, type Links } from '@/mobile/storage'
import { Store } from '@/mobile/Store'
import { NotificationsPage, UpdatePrompt } from '@/mobile/Notifications'
// Friends and chat (the encrypted engine, its screens, calls) load the first
// time they are used: a guest, or an account without them, never parses them.
const loadChat = () => import('@/mobile/Chat')
const ChatsTab = lazy(() => loadChat().then((m) => ({ default: m.ChatsTab })))
const ChatRuntime = lazy(() => loadChat().then((m) => ({ default: m.ChatRuntime })))
const endChat = () => void loadChat().then((m) => m.endChat())
import { useMobileNotifications } from '@/mobile/platform'
import { useBackCloses } from '@/mobile/parts'
import { PreviewReportButton } from '@/mobile/PreviewReport'

type Phase = 'splash' | 'welcome' | 'main'
type Tab = 'store' | 'library' | 'chats' | 'profile'

const ALL_TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'store', label: 'Store', icon: <StoreIcon className="size-3.5" /> },
  { id: 'library', label: 'Library', icon: <LibraryIcon className="size-3.5" /> },
  { id: 'chats', label: 'Chats', icon: <MessageSquare className="size-3.5" /> },
  { id: 'profile', label: 'Profile', icon: <User className="size-3.5" /> },
]

export function App() {
  const [phase, setPhase] = useState<Phase>('splash')
  const [token, setToken] = useState<string | null>(store.token)
  const [me, setMe] = useState<Me | null>(null)
  const [links, setLinksState] = useState<Links>(store.link)
  const [signingIn, setSigningIn] = useState(false)
  const [tab, setTab] = useState<Tab>('store')
  const [downloadsRequest, setDownloadsRequest] = useState(0)
  const [stack, setStack] = useState<Page[]>([])
  const [message, setMessage] = useState<ToastMessage | null>(null)
  const [slide, setSlide] = useState(28)
  // A conversation fills the screen: the tab bar goes, and Back returns to the list.
  const [closeConversation, setCloseConversation] = useState<(() => void) | null>(null)
  const onConversation = useCallback((close: (() => void) | null) => setCloseConversation(() => close), [])
  useBackCloses(!!closeConversation, () => closeConversation?.())
  // A dialog (chat's settings, Add a friend) goes the way Escape takes it; with none of this, Back left the app.
  const [dialogs, setDialogs] = useState(dialogCount)
  useEffect(() => watchDialogs(() => setDialogs(dialogCount())), [])
  useBackCloses(dialogs > 0, () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })), dialogs)
  const [chatUnread, setChatUnread] = useState(0)
  const social = socialOn(me)
  // The emoji picker's "Frequently used" row follows the account (src/rich/emoji-usage.ts).
  const usageAccount = token && me ? me.username : null
  useEffect(() => {
    syncEmojiUsage(
      usageAccount && token
        ? {
            load: () => request<{ tally?: Record<string, number> }>(`${API}/api/account/emoji-usage`, { token }).then((r) => r.json.tally ?? null),
            save: (tally) => request(`${API}/api/account/emoji-usage`, { method: 'PUT', token, body: { tally } }),
          }
        : null,
    )
  }, [usageAccount, token])
  const TABS = useMemo(() => ALL_TABS.filter((t) => t.id !== 'chats' || social), [social])
  // Once Chats has been opened here it starts with the app, so messages count and calls ring.
  const [chatOpened, setChatOpened] = useState(store.chatHere)
  const depth = useRef(0)
  /** The opening has run once: Welcome after a sign-out shows the mark settled. */
  const played = useRef(false)
  const toastTimer = useRef(0)
  const tokenRef = useRef(token)
  tokenRef.current = token

  // The setting a toast can open; filled in below, once openTab exists.
  const openSettingRef = useRef<(where: MobileSetting) => void>(() => {})
  const toast = useCallback((text: string, options?: ToastOptions) => {
    window.clearTimeout(toastTimer.current)
    const setting = options?.setting
    setMessage({ text, undo: options?.undo, open: setting ? () => openSettingRef.current(setting) : undefined })
    // With an Undo, long enough to reach it with a thumb.
    toastTimer.current = window.setTimeout(() => setMessage(null), options?.undo ? 8000 : 4000)
  }, [])
  const dismissToast = useCallback(() => {
    window.clearTimeout(toastTimer.current)
    setMessage(null)
  }, [])

  /** The token is no longer good: forget it and start over at Welcome. */
  const signedOut = useCallback(() => {
    store.setToken(null)
    setToken(null)
    setMe(null)
    setPhase((p) => (p === 'splash' ? p : 'welcome'))
  }, [])

  const fail = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401 && tokenRef.current) signedOut()
      return e instanceof Error ? e.message : String(e)
    },
    [signedOut],
  )

  // A pressed button's work failed and nothing else caught it.
  useEffect(() => {
    const failed = (e: Event) => toast(fail((e as CustomEvent<unknown>).detail))
    window.addEventListener(ACTION_FAILED_EVENT, failed)
    return () => window.removeEventListener(ACTION_FAILED_EVENT, failed)
  }, [toast, fail])

  const setLinks = useCallback((next: Links) => {
    store.setLink(next)
    if (!next.lan && !next.relay) store.setSnapshot(null)
    setLinksState(next)
  }, [])

  const linksRef = useRef(links)
  linksRef.current = links
  const dropRelay = useCallback(() => {
    const cur = linksRef.current
    if (cur.relay) setLinks({ ...cur, relay: undefined })
  }, [setLinks])

  // Remote (kryo.to lib/remote-consent.ts) is the account's own answer, off
  // until it is turned on. Off, the PC is reached on its Wi-Fi only: the
  // kryo.to link is left out of polling and of the native notifier.
  const [remote, setRemoteState] = useState<RemoteConsent | null>(null)
  useEffect(() => setRemoteState(me ? (me.remote ?? { enabled: false, decided: false }) : null), [me])
  useEffect(() => {
    if (!token) return
    // Back in front: it may have changed on another device.
    const again = () => {
      if (document.visibilityState === 'visible') void remoteConsent(token).then(setRemoteState).catch(() => {})
    }
    document.addEventListener('visibilitychange', again)
    return () => document.removeEventListener('visibilitychange', again)
  }, [token])
  const remoteOn = !!token && remote?.enabled === true
  const remoteOff = useCallback(() => setRemoteState((r) => ({ ...(r ?? {}), enabled: false, decided: true })), [])
  const saveRemote = useCallback(
    async (enabled: boolean) => {
      if (!token) return
      if (!enabled) remoteOff()
      setRemoteState(await setRemoteConsent(token, enabled))
    },
    [token, remoteOff],
  )
  const liveLinks = useMemo<Links>(() => (remoteOn ? links : { lan: links.lan }), [remoteOn, links])

  const link = useLibraryLink(token, liveLinks, toast, signedOut, dropRelay, remoteOff)
  useMobileNotifications(token, liveLinks, link.snapshot, toast)

  // A phone linked to a PC looks like it: the palette, corners, typeface and
  // theme Kryoto Desktop is using now. The last one sent is kept for the next start.
  // Adult art follows the account's blur (kryo.to Settings > Appearance), a guest's own switch otherwise.
  useEffect(() => followAccount(token, me), [token, me])

  const pcLook = link.snapshot?.look
  useEffect(() => {
    const look = pcLook ?? store.look()
    if (look) applyLook(look)
    if (pcLook) store.setLook(pcLook)
  }, [pcLook])

  useEffect(() => {
    if (!token) return
    let current = true
    let timer = 0
    let wait = 5_000
    // A phone often starts on a bad connection: keep asking, or Chats and the
    // account stay missing until the app is opened again.
    const load = () => {
      window.clearTimeout(timer)
      loadMe(token)
        .then((user) => {
          if (!current) return
          if (user) setMe(user)
          else signedOut()
        })
        .catch((e: unknown) => {
          if (!current) return
          void fail(e)
          timer = window.setTimeout(load, wait)
          wait = Math.min(wait * 2, 60_000)
        })
    }
    load()
    window.addEventListener('online', load)
    return () => {
      current = false
      window.clearTimeout(timer)
      window.removeEventListener('online', load)
    }
  }, [token, signedOut, fail])

  // Android's back button is `history.back()`: one pushed page per history
  // entry, and one for the sign-in screen, so Back closes it rather than the app.
  const signingRef = useRef(false)
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      if (signingRef.current) {
        signingRef.current = false
        setSigningIn(false)
      }
      const state: unknown = e.state
      const d = state && typeof state === 'object' && 'kdepth' in state && typeof state.kdepth === 'number' ? state.kdepth : 0
      depth.current = d
      setStack((cur) => cur.slice(0, d))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const openSignIn = useCallback(() => {
    if (signingRef.current) return
    signingRef.current = true
    history.pushState({ kdepth: depth.current }, '')
    setSigningIn(true)
  }, [])
  /** Takes the sign-in's history entry back off; the pop closes it. */
  const closeSignIn = useCallback(() => {
    if (signingRef.current) history.back()
  }, [])

  const push = useCallback((page: Page) => {
    depth.current += 1
    history.pushState({ kdepth: depth.current }, '')
    setStack((cur) => [...cur, page])
  }, [])
  const back = useCallback(() => history.back(), [])
  useEffect(() => {
    const opened = (e: Event) => {
      const target = (e as CustomEvent<string>).detail
      if (target === 'downloads') {
        if (depth.current > 0) history.go(-depth.current)
        depth.current = 0
        setTab('library')
        setStack([])
        setDownloadsRequest((n) => n + 1)
      } else if (target === 'chats') {
        if (depth.current > 0) history.go(-depth.current)
        depth.current = 0
        setChatOpened(true)
        setTab('chats')
        setStack([])
      } else if (target === 'notifications') push({ kind: 'notifications' })
    }
    window.addEventListener('mobile-notification-open', opened)
    return () => window.removeEventListener('mobile-notification-open', opened)
  }, [push])
  const openTab = (next: Tab) => {
    if (next !== tab) setSlide(TABS.findIndex((t) => t.id === next) > TABS.findIndex((t) => t.id === tab) ? 28 : -28)
    if (depth.current > 0) history.go(-depth.current)
    depth.current = 0
    setStack([])
    setTab(next)
    if (next === 'chats') setChatOpened(true)
  }
  openSettingRef.current = (where: MobileSetting) => {
    openTab('profile')
    revealSetting(where)
  }

  const context = useMemo<AppContext>(
    () => ({
      token,
      me,
      signedIn: !!token,
      links,
      setLinks,
      link,
      push,
      back,
      toast,
      signIn: openSignIn,
      signOut: () => {
        void endSession(token).finally(endChat)
        setToken(null)
        setMe(null)
        setPhase('welcome')
        if (links.relay) setLinks({ ...links, relay: undefined })
      },
      fail,
      remote,
      setRemote: saveRemote,
      remoteWasOff: remoteOff,
    }),
    [token, me, links, setLinks, link, push, back, toast, fail, openSignIn, remote, saveRemote, remoteOff],
  )

  const page = stack[stack.length - 1]
  return (
    <AppContextProvider.Provider value={context}>
      <main className="relative h-full overflow-hidden bg-background text-foreground">
        {phase !== 'main' ? (
          // One element for the opening and Welcome, so the K// the opening
          // settles on stays exactly where it is while the buttons come in.
          <Intro
            welcome={phase === 'welcome'}
            played={played.current}
            onRevealed={() => {
              played.current = true
              if (store.token() || store.guest()) window.setTimeout(() => setPhase('main'), 700)
              else setPhase('welcome')
            }}
            onSignIn={openSignIn}
            onGuest={() => {
              store.setGuest(true)
              setPhase('main')
            }}
          />
        ) : (
          <>
            {TABS.map((t) =>
              t.id === 'chats' ? (
                <div
                  key={t.id}
                  style={{ '--kryo-slide': `${slide}px` } as CSSProperties}
                  className={cn(
                    'absolute inset-0 flex flex-col pt-[var(--sat)]',
                    closeConversation ? 'z-[45] bg-background pb-[var(--sab)]' : 'z-0 pb-[calc(var(--sab)+5rem)]',
                    tab === t.id ? 'kryo-slide' : 'hidden',
                  )}
                >
                  {chatOpened ? (
                    <Suspense fallback={null}>
                      <ChatsTab onConversation={onConversation} />
                    </Suspense>
                  ) : null}
                </div>
              ) : (
                <div
                  key={t.id}
                  style={{ '--kryo-slide': `${slide}px` } as CSSProperties}
                  className={cn('absolute inset-0 z-0 overflow-y-auto overscroll-contain pb-28', tab === t.id ? 'kryo-slide' : 'hidden')}
                >
                  {t.id === 'store' ? <Store /> : t.id === 'library' ? <Library downloadsRequest={downloadsRequest} /> : <Profile />}
                </div>
              ),
            )}
            {social && chatOpened ? (
              <Suspense fallback={null}>
                <ChatRuntime showing={tab === 'chats' && !page} onUnread={setChatUnread} />
              </Suspense>
            ) : null}
            {page ? (
              <div key={stack.length} style={{ '--kryo-slide': '40px' } as CSSProperties} className="kryo-slide absolute inset-0 z-20 overflow-y-auto overscroll-contain bg-background pb-28">
                {page.kind === 'game' ? (
                  <GamePage slug={page.slug} />
                ) : page.kind === 'lib' ? (
                  <LibraryGamePage id={page.id} />
                ) : page.kind === 'approve' ? (
                  <ApprovePage code={page.code} />
                ) : page.kind === 'notifications' ? (
                  <NotificationsPage />
                ) : page.kind === 'collections' ? (
                  <CollectionsPage />
                ) : page.kind === 'collection' ? (
                  <CollectionPage id={page.id} />
                ) : (
                  <ConnectPage />
                )}
              </div>
            ) : null}
            {/* The status bar's strip is solid, so nothing scrolls into view above a sticky header; the gesture bar's strip fades. */}
            <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[35] h-[var(--sat)] bg-background" />
            <div aria-hidden className="m-bottom-glass m-bottom-bar pointer-events-none fixed inset-x-0 bottom-0 z-[35] h-[calc(var(--sab)+6rem)]" />
            {/* Kryoto Mobile Preview only (src/lib/endpoint.ts IS_PREVIEW_BUILD). */}
            <PreviewReportButton token={token} page={tab} username={me?.username ?? null} />
            <nav aria-label="Main" className="m-bottom-bar pointer-events-none fixed inset-x-0 bottom-0 z-40 grid justify-items-center px-4 pb-[calc(var(--sab)+0.75rem)]">
              <div className="kryo-pill pointer-events-auto relative grid w-full max-w-sm gap-1 border border-border bg-card p-1 shadow-2xl shadow-black/15 dark:shadow-black/60" style={{ gridTemplateColumns: `repeat(${TABS.length}, minmax(0, 1fr))` }}>
                <span
                  aria-hidden
                  className="kryo-pill absolute inset-y-1 left-1 bg-primary transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                  style={{ width: `calc((100% - ${0.5 + 0.25 * (TABS.length - 1)}rem) / ${TABS.length})`, transform: `translateX(calc(${TABS.findIndex((t) => t.id === tab)} * (100% + 0.25rem)))` }}
                />
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    aria-current={tab === t.id ? 'page' : undefined}
                    onClick={() => openTab(t.id)}
                    className={cn(
                      'kryo-pill relative z-10 flex h-10 items-center justify-center gap-1.5 font-bold uppercase transition-colors duration-300',
                      TABS.length > 3 ? 'text-[10px] tracking-wider' : 'text-[11px] tracking-[0.2em]',
                      tab === t.id ? 'text-primary-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {t.icon}
                    {t.label}
                    {t.id === 'chats' && chatUnread ? (
                      <span className="kryo-pill grid h-4 min-w-4 place-items-center bg-destructive px-1 text-[9px] tabular-nums tracking-normal text-destructive-foreground">{chatUnread > 99 ? '99+' : chatUnread}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            </nav>
          </>
        )}
        {signingIn ? (
          <SignIn
            onCancel={closeSignIn}
            onToken={(t) => {
              store.setToken(t)
              store.setGuest(false)
              setToken(t)
              closeSignIn()
              setPhase('main')
            }}
          />
        ) : null}
        <Toast message={message} onDone={dismissToast} />
        {phase === 'main' ? <UpdatePrompt /> : null}
      </main>
    </AppContextProvider.Provider>
  )
}


/**
 * The opening, then either the loading bar (a session or guest to go back to)
 * or Welcome's two buttons. The canvas is never swapped out, so the K// it
 * settles on does not move when the buttons arrive; they come in under it.
 */
function Intro({
  welcome,
  played,
  onRevealed,
  onSignIn,
  onGuest,
}: {
  welcome: boolean
  /** Shown before (Welcome after signing out): draw the mark settled, no opening. */
  played: boolean
  onRevealed: () => void
  onSignIn: () => void
  onGuest: () => void
}) {
  const [lit, setLit] = useState(false)
  return (
    <div className="absolute inset-0 overflow-hidden bg-black text-foreground">
      <SplashScene
        settled={played}
        className="h-full w-full text-foreground"
        onRevealed={() => {
          setLit(true)
          onRevealed()
        }}
      />
      {lit && welcome ? (
        <div className="kryo-in absolute inset-x-0 bottom-[calc(var(--sab)+3.25rem)] grid justify-items-center gap-3 px-8">
          <Caption className="pb-2 text-center tracking-[0.3em]">Your PC's games, in your pocket</Caption>
          <div className="grid w-full max-w-xs gap-3">
            <Button variant="primary" size="lg" onClick={onSignIn}>
              Sign in with kryo.to
            </Button>
            <Button size="lg" onClick={onGuest}>
              Continue as guest
            </Button>
          </div>
        </div>
      ) : lit ? (
        <div className="kryo-in pointer-events-none absolute inset-x-0 bottom-[calc(var(--sab)+5rem)] grid place-items-center">
          <AsciiBar fraction={null} cells={16} showPct={false} className="text-foreground/60" />
        </div>
      ) : null}
      {lit ? (
        <p
          className="kryo-in pointer-events-none absolute inset-x-0 bottom-[calc(var(--sab)+1.25rem)] flex items-baseline justify-center gap-2 text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground"
          style={{ animationDelay: '120ms' }}
        >
          <span aria-hidden className="kryo-ascii-art font-bold tracking-tight opacity-60">
            K//
          </span>
          Kryoto Mobile {__APP_VERSION__}
        </p>
      ) : null}
    </div>
  )
}

/** A new code is fetched by itself this many times when one runs out unused. */
const RENEWALS = 3

/**
 * kryo.to's device sign-in: approve this phone on kryo.to. In this phone's
 * browser if it is signed in there; else by scanning the QR code with another
 * phone or tablet that is (the same QR the site's "Sign in with your phone"
 * uses), or by typing the code at kryo.to/link on a computer.
 */
function SignIn({ onToken, onCancel }: { onToken: (token: string) => void; onCancel: () => void }) {
  const [start, setStart] = useState<DeviceStart | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [copied, setCopied] = useState(false)
  const [deadline, setDeadline] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const renewals = useRef(0)

  useEffect(() => {
    let cancelled = false
    setStart(null)
    setQr(null)
    setError(null)
    startSignIn()
      .then(async (s) => {
        if (cancelled) return
        setStart(s)
        setDeadline(Date.now() + s.expires_in * 1000)
        // Black on white whatever the theme: a scanner wants contrast it knows.
        // The encoder loads with this screen, not with the app.
        import('qrcode')
          .then(({ toString }) => toString(s.verification_uri_complete, { type: 'svg', margin: 3, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } }))
          .then((svg) => !cancelled && setQr(svg))
          .catch(() => {})
        try {
          const token = await waitForToken(s, () => cancelled)
          if (!cancelled) onToken(token)
        } catch (e) {
          if (cancelled) return
          if (e instanceof SignInExpired && renewals.current < RENEWALS) {
            renewals.current += 1
            setAttempt((n) => n + 1)
            return
          }
          throw e
        }
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
    }
    // onToken is rebuilt each render; the sign-in only restarts on Retry or a renewal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt])

  useEffect(() => {
    if (!start) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [start])

  const copy = () => {
    if (!start) return
    navigator.clipboard
      .writeText(groupCode(start.user_code))
      .then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1800)
      })
      .catch(() => {})
  }
  const left = Math.max(0, Math.ceil((deadline - now) / 1000))
  const site = start ? start.verification_uri.replace(/^https?:\/\//, '') : 'kryo.to/link'

  return (
    <div className="kryo-fade absolute inset-0 z-[70] overflow-y-auto overscroll-contain bg-background pb-[calc(var(--sab)+1.5rem)] pt-[var(--sat)]">
      <header className="flex h-14 items-center gap-3 px-4">
        <span className="grow text-xs font-bold uppercase tracking-[0.2em] text-foreground">Sign in with kryo.to</span>
        <IconButton label="Cancel" onClick={onCancel}>
          <X className="size-4" />
        </IconButton>
      </header>
      <div className="mx-auto grid w-full max-w-sm gap-4 px-5 pt-2">
        {error ? (
          <div className="grid justify-items-center gap-4 py-16 text-center">
            <Note className="max-w-xs text-destructive">{error}</Note>
            <div className="flex gap-2">
              <Button
                variant="primary"
                onClick={() => {
                  renewals.current = 0
                  setAttempt((n) => n + 1)
                }}
              >
                Retry
              </Button>
              <Button onClick={onCancel}>Cancel</Button>
            </div>
          </div>
        ) : !start ? (
          <div className="grid justify-items-center gap-3 py-24">
            <AsciiBar fraction={null} cells={16} showPct={false} className="text-muted-foreground" />
            <Caption>Getting a code</Caption>
          </div>
        ) : (
          <>
            <Block title="On this phone">
              <Note>Signed in to kryo.to in your browser? Open it, check the code matches and approve.</Note>
              <Button variant="primary" size="lg" onClick={() => void openExternal(start.verification_uri_complete)}>
                Open kryo.to
              </Button>
            </Block>

            <Block title="From another device" className="justify-items-center text-center">
              <div className="kryo-radius w-48 overflow-hidden bg-white p-1.5" aria-label="QR code for this sign-in">
                {qr ? <div className="[&>svg]:block [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} /> : <div className="aspect-square" />}
              </div>
              <Note className="max-w-xs">Scan it with a phone or tablet signed in to kryo.to. On a computer, go to {site} and enter:</Note>
              <button type="button" onClick={copy} className="kryo-pill flex items-center gap-2 border border-border px-4 py-2" aria-label="Copy the code">
                <span className="kryo-ascii-art select-text text-2xl font-bold tracking-[0.2em] text-foreground">{groupCode(start.user_code)}</span>
                {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4 text-muted-foreground" />}
              </button>
              <Caption className="tabular-nums">
                {left > 0 ? `Expires in ${clock(left)}` : 'Getting a new code'}
              </Caption>
            </Block>

            <div className="grid justify-items-center gap-2 pt-2" role="status">
              <AsciiBar fraction={null} cells={16} showPct={false} className="text-muted-foreground" />
              <Caption>Waiting for approval</Caption>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
