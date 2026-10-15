import { useEffect, useRef, useState } from 'react'
import { Lock, Trophy } from 'lucide-react'
import { AsciiBar, Button, Caption } from '@/ui'
import { cn } from '@/lib/utils'
import { useApp } from '@/mobile/context'
import { Busy } from '@/mobile/parts'
import type { PhoneAchievement, PhoneAchievements } from '@/mobile/types'

const SHOWN = 12

/**
 * A PC game's achievements, read from the PC on this network: how far along you
 * are, then the unlocked ones, then the rest dimmed. A game with none renders
 * nothing; a PC that can't be reached gets one muted line.
 */
export function AchievementsCard({ id }: { id: string }) {
  const { link } = useApp()
  const live = link.state === 'live'
  const [data, setData] = useState<PhoneAchievements | null | undefined>(undefined)
  const [all, setAll] = useState(false)
  const load = useRef(link.achievements)
  load.current = link.achievements

  useEffect(() => {
    if (!live) return
    let current = true
    setData(undefined)
    setAll(false)
    load.current(id).then((got) => current && setData(got))
    return () => {
      current = false
    }
  }, [id, live])

  if (!live || data === null) {
    return <p className="text-[11px] leading-relaxed text-muted-foreground">Connect to your PC on this network to see achievements.</p>
  }
  if (data === undefined) return <Busy />
  if (data.total === 0 || data.achievements.length === 0) return null

  const shown = all ? data.achievements : data.achievements.slice(0, SHOWN)
  return (
    <section className="kryo-radius grid gap-3 border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <Caption className="font-bold text-foreground/80">Achievements</Caption>
        <Caption className="tabular-nums">
          {data.unlocked}/{data.total}
        </Caption>
      </div>
      <AsciiBar fraction={data.unlocked / data.total} cells={20} showPct />
      <ul className="grid gap-3">
        {shown.map((a) => (
          <Row key={a.id} a={a} />
        ))}
      </ul>
      {data.achievements.length > SHOWN && !all ? (
        <Button size="sm" onClick={() => setAll(true)}>
          Show all
        </Button>
      ) : null}
    </section>
  )
}

function Row({ a }: { a: PhoneAchievement }) {
  const secret = a.hidden && !a.unlocked
  const Fallback = a.unlocked ? Trophy : Lock
  return (
    <li className={cn('grid grid-cols-[40px_1fr_auto] items-center gap-3', !a.unlocked && 'opacity-60')}>
      <span className="grid size-10 place-items-center overflow-hidden border border-border bg-background">
        {a.icon && !secret ? <img src={a.icon} alt="" loading="lazy" className="size-full object-cover" /> : <Fallback className="size-4 text-muted-foreground" aria-hidden />}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-bold text-foreground">{secret ? 'Hidden achievement' : a.name}</span>
        {secret || !a.description ? null : <span className="block text-[11px] leading-snug text-muted-foreground">{a.description}</span>}
      </span>
      <span className="text-right text-[10px] tabular-nums text-muted-foreground">
        {a.unlocked && a.unlockedAt ? new Date(a.unlockedAt * 1000).toLocaleDateString() : a.unlocked ? 'Unlocked' : 'Locked'}
      </span>
    </li>
  )
}
