import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, Play, Square } from '@/ui/pixel-icons'
import { AsciiBar, Button, Caption, IconButton, Label } from '@/ui'
import { cn } from '@/lib/utils'
import { useShowAdult } from '@/mobile/adult'
import { adultBlur } from '@/mobile/blur'

/** A card; `title` heads it. */
export function Block({ title, className, children }: { title?: string; className?: string; children: ReactNode }) {
  return (
    <section className={cn('kryo-radius grid gap-3 border border-border bg-card p-4', className)}>
      {title ? <Label>{title}</Label> : null}
      {children}
    </section>
  )
}

/** A sentence under a control or in a card. `Caption` is for a few words: it draws in capitals. */
export function Note({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]', className)}>{children}</p>
}

/** A cover. Adult art is blurred unless the account (or a guest's switch in Profile) shows it (adult.tsx). */
export function Poster({ src, title, nsfw, ratio = 'aspect-[2/3]', className }: { src: string | null; title: string; nsfw?: boolean; ratio?: string; className?: string }) {
  // A picture that fails reads like no picture: the title, not an empty card.
  const [failed, setFailed] = useState<string | null>(null)
  const blur = !!nsfw && !useShowAdult()
  return (
    <div className={cn('kryo-radius relative w-full overflow-hidden border border-border bg-card', ratio, className)}>
      {src && src !== failed ? (
        <img src={src} alt="" loading="lazy" draggable={false} onError={() => setFailed(src)} className="size-full object-cover" {...adultBlur(blur)} />
      ) : (
        <span className="absolute inset-0 grid place-items-center p-2 text-center text-[10px] uppercase tracking-wider text-muted-foreground">{title}</span>
      )}
    </div>
  )
}

/** A filter or choice pill: the white one is selected. */
export function Chip({ active, onClick, children }: { active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'kryo-pill h-8 shrink-0 whitespace-nowrap border px-3.5 text-[11px] font-bold uppercase tracking-wider transition-colors',
        active ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground',
      )}
    >
      {children}
    </button>
  )
}

/** A horizontal strip that scrolls sideways without a visible bar. */
export function Strip({ children }: { children: ReactNode }) {
  return <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{children}</div>
}

export function PageHeader({ title, onBack, right }: { title: string; onBack: () => void; right?: ReactNode }) {
  return (
    <>
      <TopInset />
      <header className="sticky top-[var(--sat)] z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/85 px-3 backdrop-blur-md">
        <IconButton label="Back" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </IconButton>
        <h1 className="min-w-0 grow truncate text-xs font-bold uppercase tracking-[0.2em] text-foreground">{title}</h1>
        {right}
      </header>
    </>
  )
}

/** Sits under the status bar, above a tab's own header; the page scrolls beneath the bar. */
export function TopInset() {
  return <div className="h-[var(--sat)] shrink-0" />
}

export function Busy({ label }: { label?: string }) {
  return (
    <div className="grid justify-items-center gap-2 py-10">
      <AsciiBar fraction={null} cells={16} showPct={false} className="text-muted-foreground" />
      {label ? <Caption>{label}</Caption> : null}
    </div>
  )
}

/** An error or an empty list, with a way to try again. */
export function Notice({ title, body, retry, children }: { title: string; body?: string; retry?: () => void; children?: ReactNode }) {
  return (
    <div className="grid justify-items-center gap-3 px-6 py-10 text-center">
      <p className="text-sm font-bold text-foreground">{title}</p>
      {body ? <Note className="max-w-xs">{body}</Note> : null}
      {retry || children ? (
        <div className="flex flex-wrap justify-center gap-2">
          {retry ? <Button onClick={retry}>Retry</Button> : null}
          {children}
        </div>
      ) : null}
    </div>
  )
}

/** What is open over the page, newest last: Back closes only the newest. */
const layers: { close: () => void; popped: boolean }[] = []
/** History entries left by layers closed from the screen, and the turn that takes them back. */
let owed = 0
let settling = 0
/** Pops that are that taking back, not Back being pressed. */
let ownPops = 0

window.addEventListener('popstate', () => {
  if (ownPops) {
    ownPops -= 1
    return
  }
  const top = layers.at(-1)
  if (!top) return
  top.popped = true
  top.close()
})

/**
 * Android's Back closes what is open over a page, not the page: while `open`,
 * it holds a history entry of its own (`history.back()` is Back, see App.tsx).
 * `history.back()` runs later, so a layer closing is settled a turn on: one
 * opening in that same moment (Save, then Add to a collection) takes over its
 * entry instead of being closed by it. `depth` holds a fresh entry each time it changes.
 */
export function useBackCloses(open: boolean, onClose: () => void, depth = 0) {
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    if (!open) return
    if (owed) owed -= 1
    else history.pushState(history.state, '')
    const layer = { close: () => close.current(), popped: false }
    layers.push(layer)
    return () => {
      layers.splice(layers.indexOf(layer), 1)
      if (layer.popped) return
      owed += 1
      window.clearTimeout(settling)
      settling = window.setTimeout(() => {
        const entries = owed
        owed = 0
        if (!entries) return
        ownPops += 1
        history.go(-entries)
      }, 0)
    }
  }, [open, depth])
}

/**
 * A sheet from the bottom edge; the dimmed area closes it. It is drawn on the
 * page itself, not inside the screen that opened it, so it covers the tab bar.
 */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useBackCloses(open, onClose)
  if (!open) return null
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex flex-col justify-end">
      <button type="button" aria-label="Close" className="m-backdrop absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <div className="m-sheet relative max-h-[85svh] overflow-y-auto border-t border-border bg-popover px-4 pb-[calc(var(--sab)+1rem)] pt-4">
        <Caption className="mb-2 block font-bold text-foreground/80">{title}</Caption>
        <div className="grid gap-1">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

export function SheetRow({ active, danger, onClick, children }: { active?: boolean; danger?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('kryo-pill flex h-11 items-center justify-between px-4 text-xs uppercase tracking-wider', active ? 'bg-primary text-primary-foreground' : danger ? 'text-destructive' : 'text-foreground')}
    >
      {children}
    </button>
  )
}

/** Calls `onSeen` whenever the sentinel scrolls into view. */
export function Sentinel({ onSeen, disabled }: { onSeen: () => void; disabled?: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const latest = useRef(onSeen)
  latest.current = onSeen
  useEffect(() => {
    const el = ref.current
    if (!el || disabled) return
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && latest.current(), { rootMargin: '600px' })
    io.observe(el)
    return () => io.disconnect()
  }, [disabled])
  return <div ref={ref} className="h-px" />
}

/** Play, or Stop while it runs. */
export function PlayButton({ running, starting, offline, onPlay, onStop, size }: { running: boolean; starting: boolean; offline: boolean; onPlay(): void; onStop(): void; size?: 'sm' | 'md' | 'lg' }) {
  if (running) {
    return (
      <Button size={size} variant="danger" disabled={offline} onClick={onStop}>
        <Square className="size-3" />
        Stop
      </Button>
    )
  }
  return (
    <Button size={size} variant="primary" disabled={offline || starting} onClick={onPlay}>
      <Play className="size-3" />
      {starting ? 'Starting...' : 'Play'}
    </Button>
  )
}

export type ToastMessage = { text: string; undo?: () => unknown; open?: () => void }

/** The toast, with its Undo; when it names a setting, a tap on the text opens it. */
export function Toast({ message, onDone }: { message: ToastMessage | null; onDone: () => void }) {
  if (!message) return null
  const { text, undo, open } = message
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--sab)+5rem)] z-[60] grid justify-items-center px-4">
      <div className="kryo-pop kryo-radius pointer-events-auto flex max-w-sm items-stretch overflow-hidden border border-border bg-popover text-xs text-foreground shadow-2xl shadow-black/60" role="status">
        {open ? (
          <button type="button" className="min-w-0 px-4 py-2.5 text-left [overflow-wrap:anywhere] active:bg-secondary" onClick={() => { onDone(); open() }}>
            {text}
            <ArrowRight aria-hidden className="ml-1 inline size-3 align-[-2px] opacity-60" />
          </button>
        ) : (
          <p className="min-w-0 px-4 py-2.5 text-center [overflow-wrap:anywhere]">{text}</p>
        )}
        {undo ? (
          <button
            type="button"
            className="shrink-0 border-l border-border px-4 text-[10px] font-bold uppercase tracking-wider active:bg-secondary"
            onClick={() => {
              onDone()
              void Promise.resolve().then(undo).catch(() => {})
            }}
          >
            Undo
          </button>
        ) : null}
      </div>
    </div>
  )
}
