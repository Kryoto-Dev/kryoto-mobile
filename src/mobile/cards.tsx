import { cn } from '@/lib/utils'
import type { CatalogCard } from '@/mobile/catalog-store'
import { RevealArt, TitleBar } from '@/mobile/blur'
import { Poster } from '@/mobile/parts'
import { VerifiedShield } from '@/mobile/pixel-badges'
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
        {game.nsfw ? <span className={badge}>NSFW</span> : game.verified ? (
          <span className={cn(badge, 'inline-flex items-center gap-1 pl-1')}>
            <VerifiedShield className="text-[11px]" />
            Verified
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-2.5">
        <h3 className="text-[13px] font-bold leading-tight tracking-tight text-foreground">{game.title}</h3>
        {game.short ? <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{game.short}</p> : null}
        {game.genres.length ? (
          <div className="mt-auto flex flex-wrap gap-1">
            {game.genres.slice(0, 3).map((g) => (
              <span key={g} className="border border-border px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
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

/**
 * A game that is still arriving, as kryo.to's Browse draws it (components/upload-slot-card.tsx):
 * the art comes into focus and the name fills in as it uploads. Once it has a slug it
 * opens its coming-soon page, like the site's card.
 */
export function UploadCard({ upload, onOpen }: { upload: UploadSlot; onOpen?: () => void }) {
  const reveal = revealOf(upload)
  const word = useLoadingWord(upload)
  const percent = Math.round(Math.min(Math.max(upload.percent, 0), 100))
  const body = (
    <>
      <RevealArt cover={upload.cover} reveal={reveal} className="aspect-video w-full border-b border-border" />
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
        <span className="border-t border-border pt-2 text-[10px] text-muted-foreground">{PHASE_LABEL[upload.phase]}</span>
      </div>
    </>
  )
  const box = 'kryo-radius flex w-full flex-col overflow-hidden border border-dashed border-border bg-card text-left'
  if (upload.slug && onOpen) {
    return (
      <button type="button" onClick={onOpen} className={box} aria-label={`${upload.title || 'A game'}, coming soon. Follow it and comment.`}>
        {body}
      </button>
    )
  }
  return (
    <div className={box} aria-label={`${upload.title || 'A game'} is ${PHASE_LABEL[upload.phase].toLowerCase()}, ${Math.round(reveal * 100)} percent`}>
      {body}
    </div>
  )
}
