import { X } from 'lucide-react'
import { Button, Caption } from '@/ui'
import { cn } from '@/lib/utils'

/** `found`: a code was read; `cancelled`: the player backed out. Null while scanning. */
export type ScanEnd = 'found' | 'cancelled' | null

/**
 * The page over the camera. The camera itself is the plugin's native view
 * behind the (see-through) web view, full screen. The frame below is the
 * window onto it: a huge shadow in the page colour around it paints
 * everything else, and the brackets and the scan line live inside the same
 * element, so they can never drift off the window. It opens from a point,
 * scans, and closes back to one (motion.css, `m-frame-*`).
 */
export function ScanScreen({ title, hint, steps, ending, onCancel }: { title: string; hint: string; steps: string[]; ending: ScanEnd; onCancel: () => void }) {
  const closing = ending !== null
  return (
    <div className={cn('fixed inset-0 z-[600] overflow-hidden text-foreground', closing && 'm-scan-away')}>
      <div className="relative flex h-full flex-col px-5 pb-[calc(var(--sab)+1.25rem)] pt-[calc(var(--sat)+1rem)]">
        <header className={cn('relative z-10 flex items-center justify-between gap-3', closing ? 'm-scan-out-up' : 'm-scan-in-up')}>
          <div className="grid gap-0.5">
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-foreground">{title}</span>
            <Caption>K// Scan</Caption>
          </div>
          <button
            type="button"
            aria-label="Cancel scan"
            onClick={onCancel}
            className="kryo-pill kryo-press grid size-9 place-items-center border border-border bg-card text-muted-foreground"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="grid grow place-items-center">
          {/* The window. Its shadow is the screen around it. */}
          <div className={cn('kryo-radius relative shadow-[0_0_0_100vmax_var(--background)]', closing ? 'm-frame-out' : 'm-frame-in')}>
            <Corner ending={ending} className="left-0 top-0 rounded-tl-[var(--kryo-radius)] border-l-2 border-t-2" />
            <Corner ending={ending} className="right-0 top-0 rounded-tr-[var(--kryo-radius)] border-r-2 border-t-2" />
            <Corner ending={ending} className="bottom-0 left-0 rounded-bl-[var(--kryo-radius)] border-b-2 border-l-2" />
            <Corner ending={ending} className="bottom-0 right-0 rounded-br-[var(--kryo-radius)] border-b-2 border-r-2" />
            {closing ? null : <span aria-hidden className="m-scan-line absolute inset-x-3 top-0 h-px bg-primary shadow-[0_0_12px_2px_var(--primary)]" />}
          </div>
        </div>

        <div className={cn('relative z-10 grid gap-3', closing ? 'm-scan-out-down' : 'm-scan-in-down')}>
          <p className="flex items-center justify-center gap-2 text-center text-[11px] font-bold uppercase tracking-[0.2em] text-foreground">
            <span aria-hidden className={cn('size-1.5 rounded-full bg-success', !closing && 'm-live')} />
            {ending === 'found' ? 'Got it' : ending === 'cancelled' ? 'Closing' : 'Looking for a code'}
          </p>
          <section className="kryo-radius grid gap-2.5 border border-border bg-card p-4">
            <p className="text-xs leading-relaxed text-foreground">{hint}</p>
            <ol className="grid gap-1.5">
              {steps.map((s, i) => (
                <li key={s} className="flex items-start gap-2.5 text-[11px] leading-relaxed text-muted-foreground">
                  <span className="kryo-pill grid size-4 shrink-0 place-items-center border border-border text-[9px] font-bold text-foreground">{i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
          </section>
          <Button onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </div>
  )
}

function Corner({ className, ending }: { className: string; ending: ScanEnd }) {
  return <span aria-hidden className={cn('absolute size-9 transition-colors duration-200', ending === 'found' ? 'border-success' : 'border-primary', className)} />
}
