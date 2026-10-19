import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { CatalogCard } from '@/mobile/catalog-store'
import { GenreIcon } from '@/mobile/genre-icons'
import { Poster } from '@/mobile/parts'
import { hasProgress, nameRevealOf, PHASE_LABEL, revealOf, useLoadingWord, type UploadSlot } from '@/mobile/upload'

const DAY = 86_400_000
const HOUR = 3_600_000

/** A game whose build is under a week old says so: new to Kryoto, or a new build of one already here. */
function freshness(created: number | undefined, built: number | undefined, now = Date.now()): { kind: 'NEW' | 'UPD'; at: number } | null {
  if (created && now - created < 7 * DAY) return { kind: 'NEW', at: created }
  if (built && now - built < 7 * DAY && (!created || built - created > HOUR)) return { kind: 'UPD', at: built }
  return null
}

/** `06H`, `03D`: how long ago, in the site's own short form. */
function ageCode(at: number, now = Date.now()): string {
  const ms = Math.max(0, now - at)
  if (ms < HOUR) return 'NOW'
  if (ms < DAY) return `${String(Math.floor(ms / HOUR)).padStart(2, '0')}H`
  return `${String(Math.floor(ms / DAY)).padStart(2, '0')}D`
}

const badge = 'kryo-pill pointer-events-none absolute bottom-2 left-2 z-[2] border border-border bg-background/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-foreground'

/** One game as kryo.to's Browse draws it: art, title, blurb, genres, then who made it, how big, how liked. */
export function CatalogGameCard({ game, onOpen }: { game: CatalogCard; onOpen: () => void }) {
  const fresh = freshness(game.created_at_ms, game.built_at_ms)
  const liked = game.rating >= 70
  return (
    <button type="button" onClick={onOpen} className="kryo-radius flex w-full flex-col overflow-hidden border border-border bg-card text-left">
      <div className="relative border-b border-border">
        <Poster src={game.cover} title={game.title} nsfw={!!game.nsfw} ratio="aspect-video" className="!rounded-none !border-0" />
        {game.nsfw ? <span className={badge}>NSFW</span> : game.verified ? <span className={badge}>Verified</span> : null}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-2.5">
        <h3 className="text-[13px] font-bold leading-tight tracking-tight text-foreground">{game.title}</h3>
        {game.short ? <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{game.short}</p> : null}
        {game.genres.length ? (
          <div className="mt-auto flex flex-wrap gap-1">
            {game.genres.slice(0, 3).map((g) => (
              <span key={g} className="inline-flex items-center gap-1 border border-border px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                <GenreIcon genre={g} />
                {g}
              </span>
            ))}
          </div>
        ) : (
          <div className="mt-auto" />
        )}
        <div className="grid gap-1 border-t border-border pt-2 text-[10px] text-muted-foreground">
          <span className="truncate">{game.developer || 'Unknown'}</span>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {fresh ? (
              <span className="kryo-ascii-art text-[9px] tracking-wider text-foreground">
                {fresh.kind}
                <span className="text-muted-foreground">{' // '}</span>
                {ageCode(fresh.at)}
              </span>
            ) : null}
            {game.download_size ? <span>{game.download_size}</span> : null}
            {game.rating > 0 ? (
              <span className="flex items-center gap-1 text-foreground">
                <svg
                  viewBox="0 0 10 10"
                  aria-hidden="true"
                  className={cn('size-3', liked ? 'fill-current' : 'fill-none stroke-current stroke-[1.2]')}
                  style={{ transform: liked ? 'none' : 'rotate(180deg)' }}
                >
                  <polygon points="5,1 9.33,9 0.67,9" />
                </svg>
                {game.rating}%<span className="sr-only">{liked ? ' positive' : ' mixed'}</span>
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  )
}

const SHADES = '░▒▓'
const CHURN = '░▒▓█▄▀▌▐'

/** The title doubling as the progress bar: `Gunpoint` at 50% is `Gunp` then blocks that churn. */
function TitleBar({ title, reveal }: { title: string; reveal: number }) {
  const chars = [...(title.trim() || 'UNTITLED')]
  const limit = Math.min(chars.length, 18)
  const done = reveal >= 1
  const shown = done ? chars.length : Math.min(Math.ceil(reveal * limit), limit)
  const left = done ? 0 : limit - shown
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (left <= 0 || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const id = window.setInterval(() => setTick((t) => (t + 1) % 1_000_000), 125)
    return () => window.clearInterval(id)
  }, [left])
  const tail = Array.from({ length: left }, (_, i) => {
    const spin = i / Math.max(left, 1) < 0.35 ? CHURN : SHADES
    return spin[(shown + i + (spin === CHURN ? tick : 0)) % spin.length]
  }).join('')
  return (
    <span className="block overflow-hidden whitespace-pre">
      <span className="font-bold text-foreground">{chars.slice(0, shown).join('')}</span>
      {left > 0 ? (
        <span className="kryo-ascii-art text-muted-foreground" style={{ opacity: 0.35 + reveal * 0.35 }}>
          {tail}
        </span>
      ) : null}
    </span>
  )
}

/** A game that is still arriving: its name fills in as it uploads. Nothing to open yet. */
export function UploadCard({ upload }: { upload: UploadSlot }) {
  const reveal = revealOf(upload)
  const word = useLoadingWord(upload)
  const percent = Math.round(Math.min(Math.max(upload.percent, 0), 100))
  return (
    <div
      className="kryo-radius flex flex-col overflow-hidden border border-dashed border-border bg-card"
      aria-label={`${upload.title || 'A game'} is ${PHASE_LABEL[upload.phase].toLowerCase()}, ${Math.round(reveal * 100)} percent`}
    >
      <div className="relative border-b border-border">
        <div
          className="aspect-video w-full bg-secondary/50"
          style={{
            backgroundImage: upload.cover ? `url("${upload.cover}")` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: `saturate(${(0.35 + reveal * 0.65).toFixed(2)})`,
            opacity: 0.35 + reveal * 0.65,
          }}
        />
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-2.5">
        <h3 className="text-[13px] leading-tight tracking-tight">
          <TitleBar title={upload.title} reveal={nameRevealOf(upload)} />
        </h3>
        <div className="mt-auto flex items-center gap-2">
          <span className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">{word}</span>
          {hasProgress(upload) ? (
            <>
              <span className="kryo-pill h-1 flex-1 overflow-hidden bg-muted">
                <span className="block h-full bg-primary transition-[width] duration-500 ease-out" style={{ width: `${percent}%` }} />
              </span>
              <span className="shrink-0 text-[10px] text-foreground">{percent}%</span>
            </>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border pt-2 text-[10px] text-muted-foreground">
          <span className="truncate">{upload.by_name || 'Kryoto'}</span>
          <span className="shrink-0">{PHASE_LABEL[upload.phase]}</span>
        </div>
      </div>
    </div>
  )
}
