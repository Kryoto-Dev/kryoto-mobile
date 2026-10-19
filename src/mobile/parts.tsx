import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft } from 'lucide-react'
import { AsciiBar, Button, Caption, IconButton } from '@/ui'
import { cn } from '@/lib/utils'

/** A cover. Adult art is always blurred here: no reveal. */
export function Poster({ src, title, nsfw, ratio = 'aspect-[2/3]', className }: { src: string | null; title: string; nsfw?: boolean; ratio?: string; className?: string }) {
  return (
    <div className={cn('kryo-radius relative w-full overflow-hidden border border-border bg-card', ratio, className)}>
      {src ? (
        <img src={src} alt="" loading="lazy" draggable={false} className={cn('size-full object-cover', nsfw && 'scale-110 blur-xl')} />
      ) : (
        <span className="absolute inset-0 grid place-items-center p-2 text-center text-[10px] uppercase tracking-wider text-muted-foreground">{title}</span>
      )}
    </div>
  )
}

/** A filter or choice pill: the white one is selected. */
export function Chip({ active, onClick, icon, children }: { active?: boolean; onClick: () => void; icon?: ReactNode; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'kryo-pill h-8 shrink-0 whitespace-nowrap border px-3.5 text-[11px] font-bold uppercase tracking-wider transition-colors',
        icon && 'inline-flex items-center gap-1.5',
        active ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground',
      )}
    >
      {icon}
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
      <header className="sticky top-[var(--sat)] z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-3">
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
      {body ? <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">{body}</p> : null}
      {retry || children ? (
        <div className="flex flex-wrap justify-center gap-2">
          {retry ? <Button onClick={retry}>Retry</Button> : null}
          {children}
        </div>
      ) : null}
    </div>
  )
}

/**
 * A sheet from the bottom edge; the dimmed area closes it. It is drawn on the
 * page itself, not inside the screen that opened it, so it covers the tab bar.
 */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button type="button" aria-label="Close" className="m-backdrop absolute inset-0 bg-black/55" onClick={onClose} />
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

export function Toast({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--sab)+5rem)] z-[60] grid justify-items-center px-4">
      <p className="kryo-pop kryo-radius max-w-sm border border-border bg-popover px-4 py-2.5 text-center text-xs text-foreground shadow-2xl shadow-black/60" role="status">
        {message}
      </p>
    </div>
  )
}
