import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Library as LibraryIcon, Store as StoreIcon, User } from 'lucide-react'
import { SplashScene } from '@/boot/SplashScene'
import { AsciiBar, Button, Caption } from '@/ui'
import { KryoMark } from '@/ui/ascii/KryoMark'
import { cn } from '@/lib/utils'
import { me as loadMe, openExternal, signOut as endSession, startSignIn, waitForToken, type DeviceStart, type Me } from '@/mobile/auth'
import { App as AppContextProvider, type AppContext, type Page } from '@/mobile/context'
import { GamePage } from '@/mobile/GamePage'
import { useLibraryLink } from '@/mobile/link'
import { ConnectPage, Library, LibraryGamePage } from '@/mobile/Library'
import { ApiError } from '@/mobile/net'
import { Profile } from '@/mobile/Profile'
import { Toast } from '@/mobile/parts'
import { applyLook } from '@/mobile/look'
import { store, type Links } from '@/mobile/storage'
import { Store } from '@/mobile/Store'

type Phase = 'splash' | 'welcome' | 'main'
type Tab = 'store' | 'library' | 'profile'

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'store', label: 'Store', icon: <StoreIcon className="size-3.5" /> },
  { id: 'library', label: 'Library', icon: <LibraryIcon className="size-3.5" /> },
  { id: 'profile', label: 'Profile', icon: <User className="size-3.5" /> },
]

export function App() {
  const [phase, setPhase] = useState<Phase>('splash')
  const [token, setToken] = useState<string | null>(store.token)
  const [me, setMe] = useState<Me | null>(null)
  const [links, setLinksState] = useState<Links>(store.link)
  const [signingIn, setSigningIn] = useState(false)
  const [tab, setTab] = useState<Tab>('store')
  const [stack, setStack] = useState<Page[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [slide, setSlide] = useState(28)
  const depth = useRef(0)
  const toastTimer = useRef(0)
  const tokenRef = useRef(token)
  tokenRef.current = token

  const toast = useCallback((text: string) => {
    window.clearTimeout(toastTimer.current)
    setMessage(text)
    toastTimer.current = window.setTimeout(() => setMessage(null), 4000)
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

  const setLinks = useCallback((next: Links) => {
    store.setLink(next)
    if (!next.lan && !next.relay) store.setSnapshot(null)
    setLinksState(next)
  }, [])

  const link = useLibraryLink(token, links, toast, signedOut)

  // A phone linked to a PC looks like it: the palette, corners, typeface and
  // theme Kryoto Desktop is using now. The last one sent is kept for the next start.
  const pcLook = link.snapshot?.look
  useEffect(() => {
    const look = pcLook ?? store.look()
    if (look) applyLook(look)
    if (pcLook) store.setLook(pcLook)
  }, [pcLook])

  useEffect(() => {
    if (!token) return
    let current = true
    loadMe(token)
      .then((user) => {
        if (!current) return
        if (user) setMe(user)
        else signedOut()
      })
      .catch((e: unknown) => current && void fail(e))
    return () => {
      current = false
    }
  }, [token, signedOut, fail])

  // Android's back button is `history.back()`: one pushed page per history entry.
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const state: unknown = e.state
      const d = state && typeof state === 'object' && 'kdepth' in state && typeof state.kdepth === 'number' ? state.kdepth : 0
      depth.current = d
      setStack((cur) => cur.slice(0, d))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const push = useCallback((page: Page) => {
    depth.current += 1
    history.pushState({ kdepth: depth.current }, '')
    setStack((cur) => [...cur, page])
  }, [])
  const back = useCallback(() => history.back(), [])
  const openTab = (next: Tab) => {
    if (next !== tab) setSlide(TABS.findIndex((t) => t.id === next) > TABS.findIndex((t) => t.id === tab) ? 28 : -28)
    if (depth.current > 0) history.go(-depth.current)
    depth.current = 0
    setStack([])
    setTab(next)
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
      signIn: () => setSigningIn(true),
      signOut: () => {
        void endSession(token)
        setToken(null)
        setMe(null)
        setPhase('welcome')
        if (links.relay) setLinks({ ...links, relay: undefined })
      },
      fail,
    }),
    [token, me, links, setLinks, link, push, back, toast, fail],
  )

  if (phase === 'splash') {
    return <Splash onDone={() => setPhase(store.token() || store.guest() ? 'main' : 'welcome')} />
  }

  const page = stack[stack.length - 1]
  return (
    <AppContextProvider.Provider value={context}>
      <main className="relative h-full overflow-hidden bg-background text-foreground">
        {phase === 'welcome' ? (
          <Welcome
            onSignIn={() => setSigningIn(true)}
            onGuest={() => {
              store.setGuest(true)
              setPhase('main')
            }}
          />
        ) : (
          <>
            {TABS.map((t) => (
              <div
                key={t.id}
                style={{ '--kryo-slide': `${slide}px` } as CSSProperties}
                className={cn('absolute inset-0 z-0 overflow-y-auto overscroll-contain pb-28', tab === t.id ? 'kryo-slide' : 'hidden')}
              >
                {t.id === 'store' ? <Store /> : t.id === 'library' ? <Library /> : <Profile />}
              </div>
            ))}
            {page ? (
              <div key={stack.length} style={{ '--kryo-slide': '40px' } as CSSProperties} className="kryo-slide absolute inset-0 z-20 overflow-y-auto overscroll-contain bg-background pb-28">
                {page.kind === 'game' ? <GamePage slug={page.slug} /> : page.kind === 'lib' ? <LibraryGamePage id={page.id} /> : <ConnectPage />}
              </div>
            ) : null}
            {/* The status bar's strip is solid, so nothing scrolls into view above a sticky header; the gesture bar's strip fades. */}
            <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[35] h-[var(--sat)] bg-background" />
            <div aria-hidden className="m-bottom-glass pointer-events-none fixed inset-x-0 bottom-0 z-[35] h-[calc(var(--sab)+6rem)]" />
            <nav aria-label="Main" className="pointer-events-none fixed inset-x-0 bottom-0 z-40 grid justify-items-center px-4 pb-[calc(var(--sab)+0.75rem)]">
              <div className="kryo-pill pointer-events-auto relative grid w-full max-w-sm grid-cols-3 gap-1 border border-border bg-card p-1 shadow-2xl shadow-black/60">
                <span
                  aria-hidden
                  className="kryo-pill absolute inset-y-1 left-1 w-[calc((100%-1rem)/3)] bg-primary transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                  style={{ transform: `translateX(calc(${TABS.findIndex((t) => t.id === tab)} * (100% + 0.25rem)))` }}
                />
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    aria-current={tab === t.id ? 'page' : undefined}
                    onClick={() => openTab(t.id)}
                    className={cn(
                      'kryo-pill relative z-10 flex h-10 items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] transition-colors duration-300',
                      tab === t.id ? 'text-primary-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {t.icon}
                    {t.label}
                  </button>
                ))}
              </div>
            </nav>
          </>
        )}
        {signingIn ? (
          <SignIn
            onCancel={() => setSigningIn(false)}
            onToken={(t) => {
              store.setToken(t)
              store.setGuest(false)
              setToken(t)
              setSigningIn(false)
              setPhase('main')
            }}
          />
        ) : null}
        <Toast message={message} />
      </main>
    </AppContextProvider.Provider>
  )
}

/** The desktop's opening, then the loading bar and the build name. */
function Splash({ onDone }: { onDone: () => void }) {
  const [lit, setLit] = useState(false)
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return (
    <div className="relative h-svh w-full overflow-hidden bg-black text-foreground">
      <SplashScene
        className="h-full w-full text-foreground"
        onRevealed={() => {
          setLit(true)
          window.clearTimeout(timer.current)
          timer.current = window.setTimeout(onDone, 700)
        }}
      />
      {lit ? (
        <>
          <div className="kryo-in pointer-events-none absolute inset-x-0 bottom-20 grid place-items-center">
            <AsciiBar fraction={null} cells={16} showPct={false} className="text-foreground/60" />
          </div>
          <p
            className="kryo-in pointer-events-none absolute inset-x-0 bottom-5 flex items-baseline justify-center gap-2 text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground"
            style={{ animationDelay: '120ms' }}
          >
            <span aria-hidden className="kryo-ascii-art font-bold tracking-tight opacity-60">
              K//
            </span>
            Kryoto Mobile {__APP_VERSION__}
          </p>
        </>
      ) : null}
    </div>
  )
}

function Welcome({ onSignIn, onGuest }: { onSignIn: () => void; onGuest: () => void }) {
  return (
    <div className="grid h-full place-content-center justify-items-center gap-8 px-8 pb-[var(--sab)] pt-[var(--sat)]">
      <div className="grid justify-items-center gap-3">
        <KryoMark mode="reveal" className="h-16" />
        <Caption className="tracking-[0.3em]">Mobile</Caption>
      </div>
      <div className="grid w-full max-w-xs gap-3">
        <Button variant="primary" size="lg" onClick={onSignIn}>
          Sign in with kryo.to
        </Button>
        <Button size="lg" onClick={onGuest}>
          Continue as guest
        </Button>
      </div>
    </div>
  )
}

/** kryo.to's device sign-in: a code to approve on the site, which this screen waits on. */
function SignIn({ onToken, onCancel }: { onToken: (token: string) => void; onCancel: () => void }) {
  const [start, setStart] = useState<DeviceStart | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setStart(null)
    setError(null)
    startSignIn()
      .then(async (s) => {
        if (cancelled) return
        setStart(s)
        const token = await waitForToken(s, () => cancelled)
        if (!cancelled) onToken(token)
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
    }
    // onToken is rebuilt each render; the sign-in only restarts on Retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt])

  return (
    <div className="kryo-fade absolute inset-0 z-[70] grid place-content-center justify-items-center gap-6 bg-background px-8 text-center">
      <Caption className="tracking-[0.3em]">Sign in with kryo.to</Caption>
      {error ? (
        <>
          <p className="max-w-xs text-xs leading-relaxed text-destructive">{error}</p>
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => setAttempt((n) => n + 1)}>
              Retry
            </Button>
            <Button onClick={onCancel}>Cancel</Button>
          </div>
        </>
      ) : !start ? (
        <AsciiBar fraction={null} cells={16} showPct={false} className="text-muted-foreground" />
      ) : (
        <>
          <p className="kryo-ascii-art select-text text-4xl font-bold tracking-[0.2em] text-foreground">{start.user_code}</p>
          <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">Open kryo.to, check this code matches, and approve. This screen continues by itself.</p>
          <div className="grid w-full max-w-xs gap-3">
            <Button variant="primary" size="lg" onClick={() => void openExternal(start.verification_uri_complete)}>
              Open kryo.to
            </Button>
            <Button onClick={onCancel}>Cancel</Button>
          </div>
          <AsciiBar fraction={null} cells={16} showPct={false} className="text-muted-foreground" />
        </>
      )}
    </div>
  )
}
