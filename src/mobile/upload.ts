import { useEffect, useRef, useState } from 'react'
import { request } from '@/mobile/net'

/**
 * The games still arriving on kryo.to (`/api/games/uploading`), and how far
 * along each reads. The numbers and bands are kryo.to's own
 * (lib/upload-slot.ts), so a card here says what the same card on the site says.
 */

export type UploadPhase = 'downloading' | 'cracking' | 'uploading' | 'finishing' | 'reviewing' | 'live'

export type UploadSlot = {
  id: string
  title: string
  cover: string
  slug: string | null
  phase: UploadPhase
  /** 0..100 within the current phase. */
  percent: number
  by_name: string | null
}

export const PHASE_LABEL: Record<UploadPhase, string> = {
  downloading: 'Downloading',
  cracking: 'Cracking',
  uploading: 'Uploading',
  finishing: 'Finishing touches',
  reviewing: 'Review or testing',
  live: 'Ready',
}

/** Which of kryo.to's word lists names each phase. */
const PHASE_WORDS: Record<UploadPhase, string> = {
  downloading: 'downloading',
  cracking: 'cracking',
  uploading: 'uploading',
  finishing: 'publishing',
  reviewing: 'reviewing',
  live: 'generic',
}

/** The stretch of the whole journey each phase owns, 0..1. */
const BAND: Record<UploadPhase, { from: number; to: number }> = {
  downloading: { from: 0, to: 0.18 },
  cracking: { from: 0.18, to: 0.3 },
  uploading: { from: 0.3, to: 0.8 },
  finishing: { from: 0.8, to: 0.95 },
  reviewing: { from: 0.95, to: 0.95 },
  live: { from: 1, to: 1 },
}

const MIN_VISIBLE = 0.04

/** A real number is being reported for this slot right now. */
export function hasProgress(slot: Pick<UploadSlot, 'phase' | 'percent'>): boolean {
  if (slot.phase === 'reviewing' || slot.phase === 'live') return false
  return slot.percent > 0
}

/** How much of the whole journey is done, 0..1. Only ever moves forward. */
export function revealOf(slot: Pick<UploadSlot, 'phase' | 'percent'>): number {
  const band = BAND[slot.phase]
  const within = hasProgress(slot) ? Math.min(Math.max(slot.percent, 0), 100) / 100 : 0
  return Math.max(band.from + (band.to - band.from) * within, MIN_VISIBLE)
}

/** How much of the NAME has arrived, 0..1: complete once the bytes have landed. */
export function nameRevealOf(slot: Pick<UploadSlot, 'phase' | 'percent'>): number {
  switch (slot.phase) {
    case 'downloading':
    case 'cracking':
    case 'uploading':
      return Math.min(revealOf(slot) / BAND.uploading.to, 1)
    default:
      return 1
  }
}

const POLL_ACTIVE_MS = 4000
const POLL_IDLE_MS = 8000

/** Polls the in-flight uploads while the app is on screen. A page that cannot reach it shows none. */
export function useUploadSlots(): UploadSlot[] {
  const [slots, setSlots] = useState<UploadSlot[]>([])
  const last = useRef('')
  const count = useRef(0)

  useEffect(() => {
    let alive = true
    let timer = 0
    const poll = async () => {
      if (!alive) return
      if (document.visibilityState === 'visible') {
        try {
          const { json } = await request<{ slots?: UploadSlot[] }>('https://kryo.to/api/games/uploading')
          const next = json.slots ?? []
          count.current = next.length
          // Only a change repaints: the same JSON parses to new objects every time.
          const sig = JSON.stringify(next)
          if (alive && sig !== last.current) {
            last.current = sig
            setSlots(next)
          }
        } catch {
          /* keep what is on screen */
        }
      }
      if (alive) timer = window.setTimeout(() => void poll(), count.current > 0 ? POLL_ACTIVE_MS : POLL_IDLE_MS)
    }
    const wake = () => {
      if (document.visibilityState !== 'visible') return
      window.clearTimeout(timer)
      void poll()
    }
    void poll()
    document.addEventListener('visibilitychange', wake)
    return () => {
      alive = false
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', wake)
    }
  }, [])

  return slots
}

type WordFile = { swapSeconds?: number; phases?: Record<string, string[]> }

const FALLBACK: Record<string, string[]> = {
  generic: ['Working', 'Whirring', 'Tinkering'],
  uploading: ['Uploading', 'Heaving', 'Shipping'],
  publishing: ['Finishing touches', 'Tidying up', 'Last look'],
  reviewing: ['Review pending', 'Waiting on a human'],
}

/** kryo.to's list of progress words, fetched once and shared. */
let words: Promise<WordFile> | null = null
function loadWords(): Promise<WordFile> {
  return (words ??= request<WordFile>('https://kryo.to/loading-words.json')
    .then((r) => r.json)
    .catch(() => ({})))
}

function seedOf(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** One word for this slot's phase, swapped every few seconds; each slot has its own place in the rotation. */
export function useLoadingWord(slot: UploadSlot): string {
  const [file, setFile] = useState<WordFile>({})
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    void loadWords().then((f) => alive && setFile(f))
    return () => {
      alive = false
    }
  }, [])
  const offset = seedOf(slot.id)
  const swapMs = Math.max((file.swapSeconds ?? 4) * 1000, 1000)
  useEffect(() => {
    let interval = 0
    const first = window.setTimeout(() => {
      setTick((n) => n + 1)
      interval = window.setInterval(() => setTick((n) => n + 1), swapMs)
    }, swapMs * ((offset % 16) / 16))
    return () => {
      window.clearTimeout(first)
      window.clearInterval(interval)
    }
  }, [swapMs, offset])
  const key = PHASE_WORDS[slot.phase]
  const list = file.phases?.[key]?.length ? file.phases[key] : (FALLBACK[key] ?? FALLBACK.generic)
  return list?.[(key.length * 7 + offset + tick) % list.length] ?? PHASE_LABEL[slot.phase]
}
