/**
 * What a PC tells the phone. Both transports (this network and kryo.to) carry
 * exactly this; the Rust mirror is `PhoneSnapshot` in src-tauri/src/phone.rs.
 */
export type PhoneGame = {
  id: string
  title: string
  slug: string | null
  /** https URLs only, else null. */
  cover: string | null
  header: string | null
  playtimeSeconds: number
  lastPlayed: number | null
  addedAt: number
  nsfw: boolean
}

/** One achievement of a PC game (phone.rs, `PhoneAchievement`). `icon` is an https URL; `unlockedAt` is unix seconds. */
export type PhoneAchievement = {
  id: string
  name: string
  description: string
  icon: string | null
  unlocked: boolean
  unlockedAt: number | null
  hidden: boolean
  percent: number | null
}

export type PhoneAchievements = { achievements: PhoneAchievement[]; unlocked: number; total: number }

export type DownloadStatus = 'queued' | 'resolving' | 'downloading' | 'paused' | 'verifying' | 'extracting' | 'installed' | 'failed' | 'canceled'

/** One of the PC's downloads. Over this network it also carries art and what it is waiting on. */
export type PhoneDownload = {
  id: string
  slug: string | null
  title: string
  status: DownloadStatus
  received: number
  total: number | null
  /** Bytes a second. */
  speed: number
  extracted: number
  extractTotal: number | null
  error: string | null
  notice?: string | null
  queueOrder: number
  addedAt: number
  /** The library game it became once installed: what Play starts. Over this network only. */
  gameId?: string | null
  cover?: string | null
  nsfw?: boolean
}

export type PhoneSnapshot = {
  protocol: 1
  installId: string
  name: string
  version: string
  os: string
  games: PhoneGame[]
  /** Game ids. */
  running: string[]
  /** The PC's downloads, in its own order. */
  downloads: PhoneDownload[]
  /** Over this network only: who is signed in to kryo.to on the PC. */
  profile?: PhoneProfile | null
  /** Over this network only: the look the PC is using. */
  look?: PhoneLook | null
}

export type PhoneProfile = {
  username: string
  displayName: string | null
  avatarUrl: string | null
  supporter: boolean
  kryos: number | null
  /** Games on each kryo.to list, by status. */
  counts: Record<string, number>
}

export type PhoneLook = {
  theme: string
  palette: string
  radius: string
  font: string
  season: string | null
  reducedMotion: boolean
}
