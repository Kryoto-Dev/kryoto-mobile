import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from '@/ui/pixel-icons'
import { cn } from '@/lib/utils'
import { adultBlur } from '@/mobile/blur'
import { Strip, useBackCloses } from '@/mobile/parts'

/*
 * A game's screenshots: a strip of small ones on its page, and a tap opens them
 * full size over the whole screen.
 *
 * Steam serves each screenshot at several sizes named in the filename
 * (`ss_<hash>.1920x1080.jpg`, `.600x338.`); a bare `ss_<hash>.jpg` takes the
 * same tokens. kryo.to hands over the 1920 one, and the strip drew eight of
 * them (0.4 to 1.7 MB each) to paint 144px-tall tiles. The strip now draws the
 * 600 one and the viewer the 1920 one. Same rule as kryo.to's
 * `lib/screenshots.ts`.
 */

const TOKEN = { full: '1920x1080', thumb: '600x338' } as const
const STEAM_SHOT = /(\/ss_[0-9a-f]{40})(?:\.\d{2,4}x\d{2,4})?(\.(?:jpe?g|png|webp))(?=[?#]|$)/i

/** The same screenshot at another of Steam's sizes; any other address comes back unchanged. */
export function shotAt(url: string, size: keyof typeof TOKEN): string {
  return url.replace(STEAM_SHOT, `$1.${TOKEN[size]}$2`)
}

function namedSize(url: string): { width: number; height: number } | null {
  const m = /\/ss_[0-9a-f]{40}\.(\d{2,4})x(\d{2,4})\./i.exec(url)
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null
}

const decoded = new Map<string, { width: number; height: number }>()
const pending = new Map<string, Promise<void>>()
/** The last few decoded, held so a swipe back is a paint. A decoded 1920x1080 is about 8 MB. */
const held: HTMLImageElement[] = []

/** Fetch and decode off the main thread; resolves when it can be painted in one frame, or failed. */
function preload(src: string): Promise<void> {
  if (decoded.has(src)) return Promise.resolve()
  const running = pending.get(src)
  if (running) return running
  const img = new Image()
  img.decoding = 'async'
  img.src = src
  const done = img
    .decode()
    .then(
      () => {
        decoded.set(src, { width: img.naturalWidth, height: img.naturalHeight })
        held.push(img)
        if (held.length > 6) held.shift()
      },
      () => undefined,
    )
    .finally(() => pending.delete(src))
  pending.set(src, done)
  return done
}

/** The strip on a game's page; a tap opens that screenshot full size. */
export function ScreenshotStrip({ shots, title, blur }: { shots: readonly string[]; title: string; blur: boolean }) {
  const [open, setOpen] = useState<number | null>(null)
  const [broken, setBroken] = useState<Record<string, boolean>>({})
  const shown = shots.filter((s) => !broken[s])
  if (!shown.length) return null
  return (
    <>
      <Strip>
        {shown.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => setOpen(i)}
            aria-label={`Open screenshot ${i + 1} full size`}
            className="kryo-radius h-36 shrink-0 overflow-hidden border border-border bg-card"
          >
            <img
              src={shotAt(s, 'thumb')}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
              // The small size is Steam's; anywhere else, or if it is missing, the address as given.
              onError={(e) => {
                if (e.currentTarget.src !== s) e.currentTarget.src = s
                else setBroken((b) => ({ ...b, [s]: true }))
              }}
              className="aspect-video h-full w-auto object-cover"
              {...adultBlur(blur)}
            />
          </button>
        ))}
      </Strip>
      {open != null ? <ScreenshotViewer shots={shown} index={open} title={title} blur={blur} onClose={() => setOpen(null)} /> : null}
    </>
  )
}

/**
 * Screenshots over the whole screen, fit to it. Swipe between them; a tap shows
 * one 1:1 (a pixel of the picture to a pixel of the screen), where a finger
 * pans it, and another tap fits it again. Back, Escape or the close button
 * leaves. Each one shows the strip's small picture at once and the full one
 * over it as soon as that is decoded; the ones either side are fetched ahead,
 * so a swipe lands on a sharp picture.
 */
export function ScreenshotViewer({ shots, index, title, blur, onClose }: { shots: readonly string[]; index: number; title: string; blur: boolean; onClose: () => void }) {
  const track = useRef<HTMLDivElement>(null)
  const zoomed = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState(index)
  const [zoom, setZoom] = useState(false)
  const [view, setView] = useState({ width: window.innerWidth, height: window.innerHeight })
  const [, repaint] = useReducer((n: number) => n + 1, 0)
  const anchor = useRef<{ fx: number; fy: number; x: number; y: number } | null>(null)
  useBackCloses(true, onClose)

  useEffect(() => {
    const measure = () => setView({ width: window.innerWidth, height: window.innerHeight })
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('resize', measure)
    window.addEventListener('keydown', key)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('keydown', key)
      document.body.style.overflow = overflow
    }
  }, [onClose])

  // On the one opened, and back on the one shown after a turn of the phone.
  useLayoutEffect(() => {
    const el = track.current
    if (el) el.scrollLeft = at * el.clientWidth
  }, [view.width]) // not `at`: a swipe moves it, and the track is already there

  // The full picture of the one shown, then its neighbours.
  useEffect(() => {
    let live = true
    void preload(shotAt(shots[at]!, 'full')).then(() => {
      if (!live) return
      repaint()
      for (const i of [at + 1, at - 1]) if (shots[i]) void preload(shotAt(shots[i]!, 'full')).then(repaint)
    })
    return () => {
      live = false
    }
  }, [at, shots])

  const full = shotAt(shots[at]!, 'full')
  const natural = decoded.get(full) ?? namedSize(full) ?? { width: 1920, height: 1080 }
  const dpr = window.devicePixelRatio || 1
  const fit = Math.min(view.width / natural.width, view.height / natural.height)
  const actual = { width: Math.round(natural.width / dpr), height: Math.round(natural.height / dpr) }
  const canZoom = actual.width > natural.width * fit * 1.05

  useLayoutEffect(() => {
    const el = zoomed.current
    const a = anchor.current
    if (!el || !a || !zoom) return
    anchor.current = null
    el.scrollLeft = a.fx * actual.width - a.x
    el.scrollTop = a.fy * actual.height - a.y
  }, [zoom, actual.width, actual.height])

  const tap = (e: React.MouseEvent<HTMLImageElement>) => {
    if (zoom) return setZoom(false)
    if (!canZoom) return
    const r = e.currentTarget.getBoundingClientRect()
    anchor.current = { fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height, x: e.clientX, y: e.clientY }
    setZoom(true)
  }

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`${title} screenshots`} className="kryo-fade fixed inset-0 z-[80] bg-black/95 text-white/90">
      <div
        ref={track}
        onScroll={(e) => {
          const el = e.currentTarget
          const i = Math.round(el.scrollLeft / Math.max(el.clientWidth, 1))
          if (i !== at && shots[i]) setAt(i)
        }}
        className={cn('flex h-full snap-x snap-mandatory overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', zoom ? 'overflow-hidden' : 'overflow-x-auto')}
      >
        {shots.map((s, i) => {
          const near = Math.abs(i - at) <= 1
          const big = shotAt(s, 'full')
          const src = near && decoded.has(big) ? big : shotAt(s, 'thumb')
          const size = decoded.get(big) ?? namedSize(big) ?? natural
          const scale = Math.min(view.width / size.width, view.height / size.height)
          const one = zoom && i === at
          return (
            <div key={s} className="relative h-full w-full shrink-0 snap-center snap-always">
              {one ? (
                <div ref={zoomed} className="absolute inset-0 overflow-auto overscroll-contain">
                  <div className="flex items-center justify-center" style={{ width: Math.max(actual.width, view.width), height: Math.max(actual.height, view.height) }}>
                    <img src={src} alt={`${title} screenshot ${i + 1}`} draggable={false} onClick={tap} className="max-w-none" {...adultBlur(blur)} style={{ ...adultBlur(blur).style, width: actual.width, height: actual.height }} />
                  </div>
                </div>
              ) : (
                <div className="absolute inset-0 grid place-items-center overflow-hidden">
                  <img
                    src={src}
                    alt={`${title} screenshot ${i + 1}`}
                    draggable={false}
                    loading={near ? 'eager' : 'lazy'}
                    onClick={i === at ? tap : undefined}
                    className="max-h-full max-w-full object-contain"
                    {...adultBlur(blur)}
                    style={{ ...adultBlur(blur).style, width: Math.round(size.width * scale), height: Math.round(size.height * scale) }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-3 bg-gradient-to-b from-black/70 to-transparent px-4 pb-6 pt-[calc(var(--sat)+0.5rem)]">
        <p className="min-w-0 truncate text-[11px] uppercase tracking-wider">
          {title}
          {shots.length > 1 ? <span className="ml-2 tabular-nums text-white/60">{at + 1} / {shots.length}</span> : null}
        </p>
        <button type="button" onClick={onClose} aria-label="Close" className="kryo-pill pointer-events-auto -mr-2 grid size-11 shrink-0 place-items-center">
          <X className="size-5" />
        </button>
      </div>
    </div>,
    document.body,
  )
}
