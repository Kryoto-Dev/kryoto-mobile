import { useMemo, useState } from 'react'
import { Pause, Play, RotateCw, Trash2, X } from 'lucide-react'
import { AsciiBar, Button, Caption } from '@/ui'
import { cn } from '@/lib/utils'
import { formatBytes, formatLeft } from '@/lib/downloads'
import { useApp } from '@/mobile/context'
import type { DownloadAction } from '@/mobile/link'
import { Notice, Poster, Sheet, SheetRow } from '@/mobile/parts'
import type { DownloadStatus, PhoneDownload } from '@/mobile/types'

const LABEL: Record<DownloadStatus, string> = {
  queued: 'Waiting in line',
  resolving: 'Finding the file',
  downloading: 'Downloading',
  paused: 'Paused',
  verifying: 'Checking the file',
  extracting: 'Installing',
  installed: 'Installed',
  failed: 'Failed',
  canceled: 'Canceled',
}

/** Doing something on the PC right now. */
const WORKING = new Set<DownloadStatus>(['resolving', 'downloading', 'verifying', 'extracting'])
/** Neither finished nor stopped for good: still has something to do. */
const OPEN = new Set<DownloadStatus>(['queued', 'resolving', 'downloading', 'paused', 'verifying', 'extracting', 'failed'])

/** How many downloads still have something to do: the badge on the Library's Downloads switch. */
export function openCount(list: readonly PhoneDownload[]): number {
  return list.filter((d) => OPEN.has(d.status)).length
}

function progress(d: PhoneDownload): number | null {
  if (d.status === 'installed') return 1
  if (d.status === 'extracting') return d.extractTotal ? Math.min(1, d.extracted / d.extractTotal) : null
  return d.total ? Math.min(1, d.received / d.total) : null
}

function detail(d: PhoneDownload): string {
  if (d.status === 'downloading') {
    const parts = [d.total ? `${formatBytes(d.received)} of ${formatBytes(d.total)}` : formatBytes(d.received)]
    if (d.speed) parts.push(`${formatBytes(d.speed)}/s`)
    if (d.speed && d.total) parts.push(formatLeft((d.total - d.received) / d.speed))
    return parts.join(' - ')
  }
  if (d.status === 'paused' && d.total) return `${formatBytes(d.received)} of ${formatBytes(d.total)}`
  if (d.status === 'installed' && d.total) return formatBytes(d.total)
  return ''
}

function Row({ d, offline, pending, canPlay, playing, starting, onPlay, onAct, onCancel }: { d: PhoneDownload; offline: boolean; pending: boolean; canPlay: boolean; playing: boolean; starting: boolean; onPlay(): void; onAct(a: DownloadAction): void; onCancel(): void }) {
  const fraction = progress(d)
  const line = detail(d)
  const note = d.status === 'failed' ? d.error : d.notice
  const off = offline || pending
  return (
    <li className="kryo-radius grid gap-2.5 border border-border bg-card p-3">
      <div className="flex gap-3">
        {d.cover !== undefined ? <Poster src={d.cover} title={d.title} nsfw={d.nsfw} ratio="aspect-video" className="w-20 shrink-0 self-start" /> : null}
        <div className="grid min-w-0 grow content-start gap-0.5">
          <span className="truncate text-xs font-bold text-foreground">{d.title}</span>
          <span className={cn('text-[10px] uppercase tracking-wider', d.status === 'failed' ? 'text-destructive' : WORKING.has(d.status) ? 'm-working text-primary' : 'text-muted-foreground')}>{LABEL[d.status]}</span>
          {line ? <Caption className="normal-case tracking-normal">{line}</Caption> : null}
        </div>
      </div>
      {WORKING.has(d.status) || d.status === 'paused' || d.status === 'queued' ? <AsciiBar fraction={d.status === 'queued' ? 0 : fraction} cells={26} showPct={fraction !== null} className={d.status === 'paused' ? 'text-muted-foreground' : 'text-foreground'} /> : null}
      {note ? <p className="text-[11px] leading-relaxed text-muted-foreground">{note}</p> : null}
      <div className="flex flex-wrap gap-2">
        {d.status === 'queued' || WORKING.has(d.status) ? (
          <Button size="sm" disabled={off || d.status === 'verifying' || d.status === 'extracting'} onClick={() => onAct('pause')}>
            <Pause className="size-3" />
            Pause
          </Button>
        ) : null}
        {d.status === 'paused' || d.status === 'failed' ? (
          <Button size="sm" variant="primary" disabled={off} onClick={() => onAct('resume')}>
            {d.status === 'failed' ? <RotateCw className="size-3" /> : <Play className="size-3" />}
            {d.status === 'failed' ? 'Retry' : 'Resume'}
          </Button>
        ) : null}
        {OPEN.has(d.status) ? (
          <Button size="sm" variant="danger" disabled={off || d.status === 'extracting'} onClick={onCancel}>
            <X className="size-3" />
            Cancel
          </Button>
        ) : (
          <Button size="sm" disabled={off} onClick={() => onAct('remove')}>
            <Trash2 className="size-3" />
            Clear
          </Button>
        )}
        {d.status === 'installed' && canPlay ? (
          <Button size="sm" variant="primary" disabled={offline || playing || starting} onClick={onPlay}>
            <Play className="size-3" />
            {playing ? 'Running' : starting ? 'Starting...' : 'Play'}
          </Button>
        ) : null}
      </div>
    </li>
  )
}

/** The PC's downloads: what is coming, and what finished, with pause, resume, cancel and clear. */
export function Downloads() {
  const { link } = useApp()
  const { snapshot, state, control, play, starting } = link
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set())
  const [clearing, setClearing] = useState(false)
  const games = useMemo(() => new Set((snapshot?.games ?? []).map((g) => g.id)), [snapshot])
  const running = useMemo(() => new Set(snapshot?.running ?? []), [snapshot])
  const [asking, setAsking] = useState<PhoneDownload | null>(null)

  const { open, done } = useMemo(() => {
    const all = snapshot?.downloads ?? []
    const rank = (d: PhoneDownload) => (WORKING.has(d.status) ? 0 : d.status === 'queued' ? 1 : d.status === 'paused' ? 2 : 3)
    return {
      open: all.filter((d) => OPEN.has(d.status)).sort((a, b) => rank(a) - rank(b) || a.queueOrder - b.queueOrder),
      done: all.filter((d) => !OPEN.has(d.status)).sort((a, b) => b.addedAt - a.addedAt),
    }
  }, [snapshot])

  const act = async (d: PhoneDownload, action: DownloadAction) => {
    setPending((cur) => new Set(cur).add(d.id))
    await control(d.id, action)
    setPending((cur) => new Set([...cur].filter((id) => id !== d.id)))
  }

  const offline = state === 'offline'
  const clearAll = async () => {
    setClearing(true)
    for (const d of done) await control(d.id, 'remove')
    setClearing(false)
  }
  const speed = open.reduce((sum, d) => sum + (d.status === 'downloading' ? d.speed : 0), 0)
  const rows = (list: PhoneDownload[]) =>
    list.map((d) => (
      <Row
        key={d.id}
        d={d}
        offline={offline}
        pending={pending.has(d.id)}
        canPlay={!!d.gameId && games.has(d.gameId)}
        playing={!!d.gameId && running.has(d.gameId)}
        starting={!!d.gameId && starting.has(d.gameId)}
        onPlay={() => d.gameId && void play(d.gameId)}
        onAct={(a) => void act(d, a)}
        onCancel={() => setAsking(d)}
      />
    ))

  return (
    <div className="grid gap-4">
      {!open.length && !done.length ? (
        <Notice title="No downloads" body={`Press Download on a game in the Store and it starts on ${snapshot?.name ?? 'your PC'}.`} />
      ) : null}
      {open.length ? (
        <section className="m-panel grid gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <Caption className="font-bold text-foreground/80">In progress ({open.length})</Caption>
            {speed ? <Caption>{formatBytes(speed)}/s</Caption> : null}
          </div>
          <ul className="grid gap-2">{rows(open)}</ul>
        </section>
      ) : null}
      {done.length ? (
        <section className="m-panel grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <Caption className="font-bold text-foreground/80">Finished ({done.length})</Caption>
            <Button size="sm" disabled={offline || clearing} onClick={() => void clearAll()}>
              <Trash2 className="size-3" />
              {clearing ? 'Clearing...' : 'Clear all'}
            </Button>
          </div>
          <ul className="grid gap-2">{rows(done)}</ul>
        </section>
      ) : null}
      {offline && (open.length || done.length) ? <Caption className="text-center">PC is offline. This is how it looked when it last answered.</Caption> : null}

      <Sheet open={!!asking} onClose={() => setAsking(null)} title={asking ? `Cancel ${asking.title}?` : 'Cancel'}>
        <p className="px-1 pb-2 text-xs leading-relaxed text-muted-foreground">What is already downloaded is deleted from the PC.</p>
        <SheetRow
          onClick={() => {
            const d = asking
            setAsking(null)
            if (d) void act(d, 'cancel')
          }}
        >
          Cancel the download
        </SheetRow>
        <SheetRow active onClick={() => setAsking(null)}>
          Keep it
        </SheetRow>
      </Sheet>
    </div>
  )
}
