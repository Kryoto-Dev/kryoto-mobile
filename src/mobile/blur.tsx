import { useEffect, useState, type CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import { siteUrl } from '@/mobile/auth'

/**
 * Every blur Kryoto Mobile draws over art, with kryo.to's own numbers, so a
 * cover reads on the phone as it does on the site. Nothing else in the app
 * blurs a picture: Poster, the screenshots, the coming-soon cards and page
 * all come here.
 */

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1)

/**
 * Adult art: kryo.to's `.kryo-canvas-cover[data-nsfw='true']` (app/globals.css),
 * 16px, scaled 1.12 so the soft edge the blur makes falls outside the clip.
 * The NSFW label beside it is the card's own.
 */
const ADULT = { blur: 16, scale: 1.12 } as const

/**
 * Props for an <img> that may be adult art; nothing when `on` is false. Merge
 * `style` when the image has its own. `data-blur` keeps motion.css's focus-in
 * off it, which would animate the scale away and show the edge.
 */
export function adultBlur(on: boolean): { 'data-blur'?: 'adult'; style?: CSSProperties } {
  if (!on) return {}
  return { 'data-blur': 'adult', style: { filter: `blur(${ADULT.blur}px)`, transform: `scale(${ADULT.scale})` } }
}

/**
 * A game still arriving: its art comes into focus as the upload runs. The
 * curve is kryo.to's coming-soon card and page (components/upload-slot-card.tsx,
 * components/game/coming-soon-page.tsx): blur 18px down to none, saturation
 * 0.35 up to 1, opacity 0.35 up to 1.
 *
 * The art layer reaches past the clip by twice the blur, which scales it just
 * enough that the blur's faded rim is never inside the card. It shrinks back
 * as the blur goes, so the finished art sits exactly in its box.
 */
const REVEAL = { blur: 18, saturate: 0.35, opacity: 0.35 } as const

export function RevealArt({ cover, reveal, className, label }: { cover: string | null | undefined; reveal: number; className?: string; label?: string }) {
  const r = clamp01(reveal)
  const blur = (1 - r) * REVEAL.blur
  const src = siteUrl(cover?.trim() || null)
  return (
    <div role={label ? 'img' : undefined} aria-label={label} className={cn('relative overflow-hidden bg-card', className)}>
      {src ? (
        <div
          aria-hidden
          className="absolute"
          style={{
            inset: `${(-2 * blur).toFixed(1)}px`,
            backgroundImage: `url("${src}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: `blur(${blur.toFixed(1)}px) saturate(${(REVEAL.saturate + r * (1 - REVEAL.saturate)).toFixed(2)})`,
            opacity: REVEAL.opacity + r * (1 - REVEAL.opacity),
            // Only while it is still moving, as on the site.
            transition: r < 1 ? 'filter 600ms linear, opacity 600ms linear, inset 600ms linear' : undefined,
          }}
        />
      ) : (
        <div aria-hidden className="absolute inset-0 animate-pulse bg-secondary/50" />
      )}
    </div>
  )
}

/**
 * The name doubling as the progress bar, kryo.to's components/upload-title-bar.tsx:
 * `Gunpoint` at 50% is `Gunp` and four slots that churn. The same glyphs, order
 * and timing, capped at `maxChars` slots. Pass `hidden` when the server has
 * masked the name already (`title` is then only the letters that are in).
 * `wrap` lets a finished name break over lines instead of ending in "...".
 */
export function TitleBar({ title, reveal, maxChars = 18, hidden, wrap }: { title: string; reveal: number; maxChars?: number; hidden?: number; wrap?: boolean }) {
  const masked = hidden !== undefined
  const chars = [...(masked ? title : title.trim() || 'UNTITLED')]
  const over = chars.length > maxChars
  const limit = masked ? chars.length + hidden : over ? maxChars : chars.length
  const shown = masked ? chars.length : Math.min(Math.ceil(clamp01(reveal) * limit), limit)
  const left = reveal >= 1 && (!masked || hidden === 0) ? 0 : limit - shown
  const tick = useChurn(left > 0)

  if (left <= 0) {
    const name = chars.join('')
    if (wrap) return <span className="block font-bold text-foreground [overflow-wrap:anywhere]">{name}</span>
    const text = over ? `${chars.slice(0, Math.max(1, maxChars - 3)).join('').trimEnd()}...` : name
    return <span className="block whitespace-pre font-bold text-foreground">{text}</span>
  }

  const glyphs = Array.from({ length: left }, (_, i) => {
    // The edge of the reveal churns; the tail settles into steady shade.
    const depth = i / Math.max(left, 1)
    const spin = depth < 0.35 ? CHURN : SHADES
    return spin[(shown + i + tick * (depth < 0.35 ? 1 : 0)) % spin.length]
  })
  return (
    <span className={cn('block', wrap ? '[overflow-wrap:anywhere]' : 'overflow-hidden whitespace-pre')}>
      <span className="font-bold text-foreground">{chars.slice(0, shown).join('')}</span>
      <span className="kryo-ascii-art text-muted-foreground" style={{ opacity: 0.35 + clamp01(reveal) * 0.35 }}>
        {glyphs.join('')}
      </span>
    </span>
  )
}

/** Eight steps a second while a tail is churning; never under reduced motion. */
function useChurn(active: boolean): number {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!active || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const id = window.setInterval(() => setTick((t) => (t + 1) % 1_000_000), 125)
    return () => window.clearInterval(id)
  }, [active])
  return tick
}

/** The unsettled edge. No full block: that would read as a letter arrived. */
const CHURN = ['░', '▒', '▓', '▒', '░', '▓', '▒', '░']
/** Light to dark, so the tail has texture. */
const SHADES = ['░', '▒', '░', '▓', '▒', '░']
