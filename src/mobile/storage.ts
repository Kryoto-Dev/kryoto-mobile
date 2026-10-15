import type { PhoneLook, PhoneSnapshot } from '@/mobile/types'

/** Typed localStorage. A read that fails or finds junk gives the default. */

export type LanLink = { host: string; token: string; installId: string; name: string }
export type RelayLink = { installId: string; name: string }
export type Links = { lan?: LanLink; relay?: RelayLink }
export type ViewMode = 'grid' | 'list'
export type SortMode = 'alpha' | 'recent' | 'playtime' | 'added'

const KEYS = {
  token: 'kryoto.mobile.token',
  guest: 'kryoto.mobile.guest',
  link: 'kryoto.mobile.link',
  view: 'kryoto.mobile.view',
  sort: 'kryoto.mobile.sort',
  snapshot: 'kryoto.mobile.snapshot',
  look: 'kryoto.mobile.look',
} as const

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* storage full or unavailable: the setting just does not stick */
  }
}

function readJson<T>(key: string): T | null {
  const raw = read(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

const isString = (v: unknown): v is string => typeof v === 'string' && v.length > 0

export const store = {
  token: (): string | null => read(KEYS.token),
  setToken: (t: string | null) => write(KEYS.token, t),

  guest: (): boolean => read(KEYS.guest) === '1',
  setGuest: (on: boolean) => write(KEYS.guest, on ? '1' : null),

  link: (): Links => {
    const raw = readJson<Links>(KEYS.link)
    const out: Links = {}
    const lan = raw?.lan
    if (lan && isString(lan.host) && isString(lan.token) && isString(lan.installId) && typeof lan.name === 'string') out.lan = lan
    const relay = raw?.relay
    if (relay && isString(relay.installId) && typeof relay.name === 'string') out.relay = relay
    return out
  },
  setLink: (l: Links) => write(KEYS.link, l.lan || l.relay ? JSON.stringify(l) : null),

  view: (): ViewMode => (read(KEYS.view) === 'list' ? 'list' : 'grid'),
  setView: (v: ViewMode) => write(KEYS.view, v),

  sort: (): SortMode => {
    const v = read(KEYS.sort)
    return v === 'recent' || v === 'playtime' || v === 'added' ? v : 'alpha'
  },
  setSort: (s: SortMode) => write(KEYS.sort, s),

  snapshot: (): PhoneSnapshot | null => {
    const s = readJson<PhoneSnapshot>(KEYS.snapshot)
    return s && s.protocol === 1 && Array.isArray(s.games) && Array.isArray(s.running) ? s : null
  },
  setSnapshot: (s: PhoneSnapshot | null) => write(KEYS.snapshot, s ? JSON.stringify(s) : null),

  /** The last look a PC sent, so the app opens in it before the PC answers. */
  look: (): PhoneLook | null => {
    const l = readJson<PhoneLook>(KEYS.look)
    return l && typeof l.palette === 'string' && typeof l.radius === 'string' && typeof l.theme === 'string' ? l : null
  },
  setLook: (l: PhoneLook | null) => write(KEYS.look, l ? JSON.stringify(l) : null),
}
