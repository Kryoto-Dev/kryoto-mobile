import { useEffect, useRef, useState } from 'react'
import type { PhoneDownload } from '@/mobile/types'

/** How often a moving bar is redrawn between snapshots. */
const FRAME_MS = 250
/** Never guess further ahead than this; a PC that went quiet stops the bar. */
const MAX_AHEAD_MS = 20_000

/**
 * A download's bytes as they are likely to be right now, not as the last
 * snapshot said: snapshots come every few seconds (every ten through kryo.to),
 * and a bar that only moves then looks stuck. Between them the count goes on
 * at the speed the PC reported, never past the file's size and never more
 * than a short while ahead; the next snapshot puts it back to what is true.
 */
export function useLiveReceived(d: PhoneDownload): number {
  const base = useRef({ received: d.received, at: Date.now() })
  const [now, setNow] = useState(() => Date.now())

  // A new snapshot is the truth again.
  useEffect(() => {
    base.current = { received: d.received, at: Date.now() }
    setNow(Date.now())
  }, [d.received, d.status])

  const moving = d.status === 'downloading' && d.speed > 0
  useEffect(() => {
    if (!moving) return
    const t = window.setInterval(() => setNow(Date.now()), FRAME_MS)
    return () => window.clearInterval(t)
  }, [moving])

  if (!moving) return d.received
  const ahead = Math.min(now - base.current.at, MAX_AHEAD_MS)
  const guess = base.current.received + (d.speed * ahead) / 1000
  return Math.floor(d.total ? Math.min(guess, d.total) : guess)
}
