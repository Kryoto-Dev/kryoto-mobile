import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, Clock, Package } from '@/ui/pixel-icons'
import { Label } from '@/ui'
import { cn } from '@/lib/utils'
import { API, openExternal } from '@/mobile/auth'
import { RevealArt, TitleBar } from '@/mobile/blur'
import { comingSoon as loadComingSoon, type ComingSoon } from '@/mobile/catalog'
import { useApp } from '@/mobile/context'
import { ago } from '@/mobile/format'
import { Comments } from '@/mobile/game-sections'
import { ProfileLink, TeamName } from '@/mobile/identity'
import { Note, PageHeader } from '@/mobile/parts'
import { StaffTag } from '@/mobile/staff-tag'
import { useLoadingWord, type UploadPhase } from '@/mobile/upload'

/** The steps a game goes through on its way, as kryo.to's coming-soon page names them. */
const STEPS: UploadPhase[] = ['downloading', 'cracking', 'uploading', 'finishing', 'reviewing', 'live']
const STEP_LABEL: Record<UploadPhase, string> = {
  downloading: 'Downloading',
  cracking: 'Cracking',
  uploading: 'Uploading',
  finishing: 'Finishing touches',
  reviewing: 'Review',
  live: 'Live',
}
/** How often the page asks again, as kryo.to's (components/game/coming-soon-live.tsx). */
const REFRESH_MS = 15_000

const pct = (v: number) => Math.round(Math.min(Math.max(v, 0), 100))

/**
 * /game/<slug> before the game is published, as kryo.to draws it
 * (components/game/coming-soon-page.tsx), in the game page's layout: the art
 * and the name as far as they have arrived, where in the journey it is, who
 * asked for it, and the thread, which stays on the game's page once it is live.
 * kryo.to masks the name and the uploader before sending them. The page asks
 * again now and then, and `onLive` opens the real game page once it is out.
 */
export function ComingSoonPage({ slug, data, onLive }: { slug: string; data: ComingSoon; onLive: () => void }) {
  const { back } = useApp()
  const [d, setD] = useState(data)
  useEffect(() => setD(data), [data])
  // Kept in a ref so a parent passing a fresh function does not restart the clock.
  const live = useRef(onLive)
  live.current = onLive
  useEffect(() => {
    let alive = true
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      loadComingSoon(slug)
        .then((next) => {
          if (!alive) return
          if (next) setD(next)
          else live.current()
        })
        .catch(() => undefined)
    }
    const id = window.setInterval(tick, REFRESH_MS)
    document.addEventListener('visibilitychange', tick)
    return () => {
      alive = false
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [slug])

  const { slot, review, reviewSince, request, uploader, dlc } = d
  const at = STEPS.indexOf(slot.phase)
  const overall = Math.round(Math.min(Math.max(d.reveal, 0), 1) * 100)
  const word = useLoadingWord(slot)
  const requestUrl = request ? `${API}/requests/${encodeURIComponent(request.slug)}` : null

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader title="Coming soon" onBack={back} />
      <div className="grid gap-4 pb-6">
        <RevealArt
          cover={slot.cover}
          reveal={d.reveal}
          label={slot.cover ? 'The cover, still coming into focus' : 'No art yet'}
          className="aspect-[460/215] w-full border-b border-border"
        />

        <div className="grid gap-4 px-4">
          <div className="grid gap-2">
            <Label>Coming soon</Label>
            <h2 className="text-2xl leading-tight tracking-tight">
              <TitleBar title={slot.title} hidden={slot.titleHidden} reveal={d.nameReveal} wrap />
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Brought by{' '}
              {uploader ? (
                <ProfileLink username={uploader.username} className="font-bold text-foreground">
                  <TeamName username={uploader.username}>{uploader.name}</TeamName>
                </ProfileLink>
              ) : (
                <>
                  Kryoto <StaffTag of={`slot:${slot.id}`} />
                </>
              )}
              {' · '}
              {overall}% of the way
            </p>
          </div>

          {/* The journey, one step at a time; the review step says which wait it is. */}
          <ol className="grid gap-1.5" aria-label="Where this game is">
            {STEPS.map((phase, i) => {
              const state = i < at ? 'done' : i === at ? 'now' : 'next'
              const label =
                phase === 'reviewing'
                  ? review === 'tester'
                    ? 'Waiting for a tester'
                    : review === 'staff'
                      ? 'Being reviewed by staff'
                      : 'Review'
                  : STEP_LABEL[phase]
              return (
                <li
                  key={phase}
                  className={cn(
                    'flex items-center gap-3 text-sm',
                    state === 'done' && 'text-muted-foreground',
                    state === 'now' && 'font-bold text-foreground',
                    state === 'next' && 'text-muted-foreground/60',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'flex size-5 shrink-0 items-center justify-center border',
                      state === 'done' && 'border-border bg-secondary',
                      state === 'now' && 'border-primary bg-primary/15 text-primary',
                      state === 'next' && 'border-dashed border-border',
                    )}
                  >
                    {state === 'done' ? <Check className="size-3" /> : state === 'now' ? <Clock className="size-3" /> : null}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5">
                    <span>{label}</span>
                    {state === 'now' && phase !== 'reviewing' && phase !== 'live' ? (
                      <span className="flex items-center gap-2 text-xs font-normal uppercase tracking-wider text-muted-foreground">
                        <span className="truncate">{word}</span>
                        {d.hasProgress ? <span className="shrink-0 tabular-nums text-foreground">{pct(slot.percent)}%</span> : null}
                      </span>
                    ) : null}
                    {state === 'now' && phase === 'reviewing' && reviewSince ? (
                      <span className="text-xs font-normal text-muted-foreground">since {ago(reviewSince)}</span>
                    ) : null}
                  </span>
                </li>
              )
            })}
          </ol>

          {request && requestUrl ? (
            <p className="text-sm text-muted-foreground">
              Requested by the community.{' '}
              <a
                href={requestUrl}
                onClick={(e) => {
                  e.preventDefault()
                  void openExternal(requestUrl)
                }}
                className="inline-flex items-center gap-1 text-foreground underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-primary"
              >
                Open the request
                <ArrowRight className="size-3" aria-hidden />
              </a>
            </p>
          ) : null}

          {dlc.length ? (
            <ul className="grid gap-1" aria-label="On its way to this game">
              {dlc.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                  <Package className="size-3.5 shrink-0" aria-hidden />
                  {s.kind === 'update' ? (
                    <span>New build on its way</span>
                  ) : (
                    <span>
                      DLC on its way: <span className="text-foreground">{s.name}</span>
                    </span>
                  )}
                  <span className="uppercase tracking-wider">
                    {STEP_LABEL[s.phase]}
                    {s.hasProgress ? ` ${pct(s.percent)}%` : ''}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          <Note>
            {slot.phase === 'reviewing'
              ? 'Uploaded and waiting on a person. It gets its full page once somebody has run it.'
              : 'This page fills in as the game arrives. Anything you write here stays on its page once it is live.'}
          </Note>

          <Comments slug={slug} label="Talk while it arrives" />
        </div>
      </div>
    </div>
  )
}
