import { useCallback, useEffect, useRef, useState } from 'react'
import { API } from '@/mobile/auth'
import { ApiError, request } from '@/mobile/net'
import { store, type LanLink, type Links } from '@/mobile/storage'
import type { PhoneAchievements, PhoneDownload, PhoneGame, PhoneSnapshot } from '@/mobile/types'
import { solveCheck } from '@/mobile/turnstile'

/**
 * The phone's line to a PC: on this network (the PC's own server) or through
 * kryo.to. Both hand back the same `PhoneSnapshot`.
 */

/** What a poll found. `online` is false when kryo.to only has an old report. */
export type Fetched = { snapshot: PhoneSnapshot; online: boolean; at: number }

export interface Link {
  snapshot(): Promise<Fetched>
  play(id: string): Promise<void>
  stop(id: string): Promise<void>
  /** Queue a kryo.to game's download on the PC. Resolves once the PC has accepted it. `turnstileToken` is kryo.to's check, solved on this phone. */
  download(slug: string, turnstileToken?: string): Promise<void>
  /** The PC needs kryo.to's download check solved here first (true on this network; through kryo.to the PC does not ask). */
  needsCheck?: boolean
  control(id: string, action: DownloadAction): Promise<void>
  /** Whether the PC deleted files: null when it has only been asked and has not said. */
  removeGame(id: string, deleteFiles: boolean): Promise<boolean | null>
  /** A game's achievements. Only this network's link has them. */
  achievements?(id: string): Promise<PhoneAchievements>
}

export type DownloadAction = 'pause' | 'resume' | 'cancel' | 'remove'

const HOST = /^\d{1,3}(\.\d{1,3}){3}:\d{2,5}$/

export function lanLink(cfg: LanLink): Link {
  const url = (path: string) => `http://${cfg.host}/v1/${path}`
  const post = async <T = { deleted?: boolean }>(path: string, body: Record<string, unknown>) => (await request<T>(url(path), { method: 'POST', token: cfg.token, body })).json
  return {
    snapshot: async () => ({ snapshot: (await request<PhoneSnapshot>(url('snapshot'), { token: cfg.token })).json, online: true, at: Date.now() }),
    play: async (id) => void (await post('play', { id })),
    stop: async (id) => void (await post('stop', { id })),
    needsCheck: true,
    download: async (slug, turnstileToken) => void (await post('download', { slug, turnstileToken })),
    control: async (id, action) => void (await post('downloads', { id, action })),
    removeGame: async (id, deleteFiles) => (await post('library/remove', { id, deleteFiles })).deleted === true,
    achievements: (id) => post<PhoneAchievements>('achievements', { id }),
  }
}

export type RemoteDevice = {
  installId: string
  name: string
  version: string
  os: string
  online: boolean
  updatedAt: string
  running?: string[]
  games?: PhoneGame[]
  downloads?: PhoneDownload[]
}

export async function relayDevices(token: string): Promise<RemoteDevice[]> {
  const { json } = await request<{ devices?: RemoteDevice[] }>(`${API}/api/desktop/remote`, { token })
  return json.devices ?? []
}

export function relayLink(token: string, installId: string): Link {
  const post = async (body: Record<string, string>) => {
    await request(`${API}/api/desktop/remote`, { method: 'POST', token, body: { ...body, installId } })
  }
  return {
    snapshot: async () => {
      const { json } = await request<{ devices?: RemoteDevice[] }>(`${API}/api/desktop/remote?full=${encodeURIComponent(installId)}`, { token })
      const d = json.devices?.find((x) => x.installId === installId)
      if (!d) throw new Error("That PC isn't linked to this account.")
      return {
        snapshot: { protocol: 1, installId, name: d.name, version: d.version, os: d.os, games: d.games ?? [], running: d.running ?? [], downloads: d.downloads ?? [] },
        online: d.online,
        at: Date.parse(d.updatedAt) || Date.now(),
      }
    },
    play: (gameId) => post({ action: 'play', gameId }),
    stop: (gameId) => post({ action: 'stop', gameId }),
    download: (slug) => post({ action: 'get', slug }),
    control: (downloadId, action) => post({ action: action === 'remove' ? 'clear' : action, downloadId }),
    // The PC has not done it yet, and does not say how it went.
    removeGame: async (gameId, deleteFiles) => {
      await post({ action: deleteFiles ? 'uninstall' : 'unlist', gameId })
      return null
    },
  }
}

/** Pair with a PC on this network: its address and the 6-digit code on its screen. */
export async function pairLan(host: string, code: string): Promise<LanLink> {
  const address = host.trim()
  if (!HOST.test(address)) throw new Error("Enter the PC's address like 192.168.1.5:47821.")
  const reply = await request<{ token: string; installId: string; name: string }>(`http://${address}/v1/pair`, {
    method: 'POST',
    body: { code: code.trim(), deviceName: 'Kryoto Mobile' },
  }).catch((e: unknown) => {
    if (e instanceof ApiError && e.message === 'Blocked address.') throw new Error('That is not a home-network address.')
    throw e
  })
  return { host: address, token: reply.json.token, installId: reply.json.installId, name: reply.json.name }
}

/** What a PC's QR code says: its addresses and the code (`kryoto://pair?c=&h=&h=`). Null for anything else. */
export function parsePairingUri(text: string): { code: string; hosts: string[] } | null {
  let url: URL
  try {
    url = new URL(text.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'kryoto:' || url.hostname !== 'pair') return null
  const code = url.searchParams.get('c') ?? ''
  const hosts = url.searchParams.getAll('h').filter((h) => HOST.test(h))
  return /^\d{6}$/.test(code) && hosts.length ? { code, hosts: hosts.slice(0, 8) } : null
}

/**
 * Pair from a scanned QR code. A PC lists every address it has; the phone
 * tries each in turn and moves on only when one cannot be reached. A wrong or
 * used code is final: trying the others would only burn the PC's attempts.
 */
export async function pairFromQr(text: string): Promise<LanLink> {
  const parsed = parsePairingUri(text)
  if (!parsed) throw new Error("That is not a Kryoto pairing code. Scan the QR code in the PC's Settings > Phone.")
  const failures: string[] = []
  for (const host of parsed.hosts) {
    try {
      return await pairLan(host, parsed.code)
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 0) throw e
      failures.push(e.message)
    }
  }
  throw new Error(`Could not reach the PC. Is this phone on the same Wi-Fi? ${failures.join(' ')}`)
}

export type LinkState = 'live' | 'offline' | 'unlinked'

export interface LibraryLink {
  snapshot: PhoneSnapshot | null
  state: LinkState
  /** When the PC last answered (or, through kryo.to, last reported), in ms. */
  lastSeen: number | null
  play(id: string): Promise<void>
  stop(id: string): Promise<void>
  /** Sends a kryo.to game's download to the PC and says so in a toast. False when it was not sent. */
  download(slug: string): Promise<boolean>
  /** Pause, resume, cancel or clear one of the PC's downloads. False when the PC did not accept it. */
  control(id: string, action: DownloadAction): Promise<boolean>
  /** Take a game off the PC's library, deleting its files too when asked. False when the PC did not accept it. */
  removeGame(game: PhoneGame, deleteFiles: boolean): Promise<boolean>
  /** A game's achievements from the PC on this network. Null when there is no such link (quietly) or the PC did not answer (with a toast). */
  achievements(id: string): Promise<PhoneAchievements | null>
  /** Game ids asked to start and not yet seen running. */
  starting: ReadonlySet<string>
}

const LAN_POLL_MS = 3_000
const RELAY_POLL_MS = 10_000
const LAN_PROBE_MS = 30_000
const PERSIST_EVERY_MS = 30_000
const START_TIMEOUT = { lan: 30_000, relay: 90_000 }

/** The last snapshot kept for this PC, if it is the one still linked. */
function kept(links: Links): PhoneSnapshot | null {
  const s = store.snapshot()
  const want = links.lan?.installId ?? links.relay?.installId
  // One kept by an older version has no downloads.
  return s && s.installId === want ? { ...s, downloads: s.downloads ?? [] } : null
}

/**
 * Polls the linked PC while the app is on screen: this network first, kryo.to
 * when this network has failed twice in a row (and tries this network again
 * every 30 s). The last good snapshot stays on screen when the PC goes quiet.
 */
export function useLibraryLink(token: string | null, links: Links, toast: (message: string) => void, onUnauthorized: () => void): LibraryLink {
  const [snapshot, setSnapshot] = useState<PhoneSnapshot | null>(() => kept(links))
  const [state, setState] = useState<LinkState>(links.lan || (links.relay && token) ? 'offline' : 'unlinked')
  const [lastSeen, setLastSeen] = useState<number | null>(null)
  const [starting, setStarting] = useState<ReadonlySet<string>>(new Set())
  const via = useRef<'lan' | 'relay' | null>(null)
  const refresh = useRef<() => void>(() => {})

  const lan = links.lan
  const relayId = token ? links.relay?.installId : undefined
  useEffect(() => {
    const lanLinkNow = lan ? lanLink(lan) : null
    const relayLinkNow = token && relayId ? relayLink(token, relayId) : null
    if (!lanLinkNow && !relayLinkNow) {
      setState('unlinked')
      setSnapshot(null)
      via.current = null
      return
    }
    setSnapshot((cur) => cur ?? kept({ lan, relay: relayId ? { installId: relayId, name: '' } : undefined }))

    let stopped = false
    let busy = false
    let timer = 0
    let lanFails = 0
    let relayMode = false
    let lastProbe = 0
    let sig = ''
    let persisted = 0

    const fetchOnce = async (): Promise<{ got: Fetched; by: 'lan' | 'relay' } | null> => {
      const now = Date.now()
      if (lanLinkNow && (!relayMode || now - lastProbe >= LAN_PROBE_MS)) {
        lastProbe = now
        try {
          const got = await lanLinkNow.snapshot()
          lanFails = 0
          relayMode = false
          return { got, by: 'lan' }
        } catch (e) {
          lanFails += 1
          // A phone that was removed on the PC will never come back by itself.
          if (e instanceof ApiError && e.status === 401) toast('This PC no longer knows this phone. Pair again.')
        }
      }
      if (relayLinkNow && (!lanLinkNow || lanFails >= 2)) {
        relayMode = true
        try {
          return { got: await relayLinkNow.snapshot(), by: 'relay' }
        } catch (e) {
          // kryo.to no longer accepts this sign-in.
          if (e instanceof ApiError && e.status === 401) onUnauthorized()
          return null
        }
      }
      return null
    }

    const pollOnce = async () => {
      const found = await fetchOnce()
      if (stopped) return
      via.current = found?.by ?? (relayMode ? 'relay' : lanLinkNow ? 'lan' : 'relay')
      if (!found) {
        setState('offline')
        return
      }
      const { got } = found
      const next = JSON.stringify(got.snapshot)
      if (next !== sig) {
        sig = next
        setSnapshot(got.snapshot)
      }
      if (Date.now() - persisted >= PERSIST_EVERY_MS) {
        persisted = Date.now()
        store.setSnapshot(got.snapshot)
      }
      setState(got.online ? 'live' : 'offline')
      setLastSeen(got.at)
    }

    const tick = async () => {
      if (stopped || busy) return
      busy = true
      try {
        if (document.visibilityState === 'visible') await pollOnce()
      } finally {
        busy = false
      }
      if (!stopped) timer = window.setTimeout(() => void tick(), relayMode ? RELAY_POLL_MS : LAN_POLL_MS)
    }
    const kick = () => {
      window.clearTimeout(timer)
      void tick()
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') kick()
    }
    refresh.current = kick
    document.addEventListener('visibilitychange', onVisible)
    void tick()
    return () => {
      stopped = true
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      refresh.current = () => {}
    }
    // The links' own fields, not the object: the parent rebuilds it freely.
  }, [lan?.host, lan?.token, lan?.installId, relayId, token]) // eslint-disable-line react-hooks/exhaustive-deps

  // A game that now shows as running is no longer "starting".
  useEffect(() => {
    if (!snapshot) return
    setStarting((cur) => {
      if (!snapshot.running.some((id) => cur.has(id))) return cur
      return new Set([...cur].filter((id) => !snapshot.running.includes(id)))
    })
  }, [snapshot])

  const active = useCallback((): Link | null => {
    if (via.current === 'relay' && token && relayId) return relayLink(token, relayId)
    if (lan) return lanLink(lan)
    return token && relayId ? relayLink(token, relayId) : null
  }, [lan, relayId, token])

  const play = useCallback(
    async (id: string) => {
      const link = active()
      if (!link) return
      const wait = via.current === 'relay' ? START_TIMEOUT.relay : START_TIMEOUT.lan
      setStarting((cur) => new Set(cur).add(id))
      try {
        await link.play(id)
      } catch (e) {
        setStarting((cur) => new Set([...cur].filter((x) => x !== id)))
        toast(e instanceof Error ? e.message : 'Could not start the game.')
        return
      }
      window.setTimeout(() => setStarting((cur) => new Set([...cur].filter((x) => x !== id))), wait)
      refresh.current()
    },
    [active, toast],
  )

  const stop = useCallback(
    async (id: string) => {
      try {
        await active()?.stop(id)
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Could not stop the game.')
      }
      refresh.current()
    },
    [active, toast],
  )

  const download = useCallback(
    async (slug: string) => {
      const link = active()
      if (!link) {
        toast('Connect your PC first. Open the Library tab.')
        return false
      }
      try {
        // On this network the PC asks kryo.to itself, and kryo.to wants a check
        // only a browser can pass: solve it here and send it along. If it cannot
        // be solved (the widget refuses this app), send none: the PC then opens
        // the game's page for the player to press Download there.
        let token: string | undefined
        if (link.needsCheck) {
          try {
            token = await solveCheck()
          } catch (e) {
            if (e instanceof Error && e.message === 'Check cancelled.') return false
          }
        }
        await link.download(slug, token)
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Could not send the download.')
        return false
      }
      toast('Download sent to computer.')
      return true
    },
    [active, toast],
  )

  const control = useCallback(
    async (id: string, action: DownloadAction) => {
      const link = active()
      if (!link) return false
      try {
        await link.control(id, action)
      } catch (e) {
        toast(e instanceof Error ? e.message : 'The PC did not accept that.')
        refresh.current()
        return false
      }
      // Through kryo.to the PC picks it up within a few seconds.
      if (via.current === 'relay') toast('Sent to computer.')
      refresh.current()
      return true
    },
    [active, toast],
  )

  const removeGame = useCallback(
    async (game: PhoneGame, deleteFiles: boolean) => {
      const link = active()
      if (!link) return false
      try {
        const deleted = await link.removeGame(game.id, deleteFiles)
        if (deleted === null) toast('Sent to computer.')
        else if (deleted) toast(`Uninstalled ${game.title}.`)
        else if (deleteFiles) toast(`Removed ${game.title} from the library. Its files are outside Kryoto's folders, so they were left.`)
        else toast(`Removed ${game.title} from the library.`)
      } catch (e) {
        toast(e instanceof Error ? e.message : 'The PC did not accept that.')
        return false
      }
      refresh.current()
      return true
    },
    [active, toast],
  )

  const achievements = useCallback(
    async (id: string) => {
      const link = active()
      if (!link?.achievements) return null
      try {
        return await link.achievements(id)
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Could not load achievements.')
        return null
      }
    },
    [active, toast],
  )

  return { snapshot, state, lastSeen, play, stop, download, control, removeGame, achievements, starting }
}
