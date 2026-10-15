import { openUrl } from '@tauri-apps/plugin-opener'
import { isTauri } from '@/lib/bridge'
import { request } from '@/mobile/net'
import { store } from '@/mobile/storage'

/** kryo.to's device sign-in (RFC 8628) as the client "desktop" (kryo.to only accepts its known clients; the approval screen also shows the device name "Kryoto Mobile"). */

export const API = 'https://kryo.to'

export type DeviceStart = { device_code: string; user_code: string; verification_uri_complete: string; interval: number; expires_in: number }

export type Me = {
  /** The public K// ID digits. */
  id?: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  bannerUrl?: string | null
  bio?: string | null
  profileAccentColor?: string | null
  profileCustomStatus?: string | null
  /** ISO date the account was made. */
  createdAt?: string
  /** 'uploader', 'moderator', 'admin', 'owner'... */
  staffRole?: string | null
  isSupporter: boolean
  isTester?: boolean
  kryos?: { balance?: number } | null
}

export function startSignIn(): Promise<DeviceStart> {
  return request<DeviceStart>(`${API}/api/auth/device`, { method: 'POST', body: { client: 'desktop', device_name: 'Kryoto Mobile' } }).then((r) => r.json)
}

/** Poll until approved. Resolves the token, or throws. */
export async function waitForToken(s: DeviceStart, cancelled: () => boolean): Promise<string> {
  let interval = Math.min(Math.max(s.interval, 1), 10)
  const deadline = Date.now() + Math.min(s.expires_in, 900) * 1000
  while (Date.now() < deadline && !cancelled()) {
    await new Promise((r) => setTimeout(r, interval * 1000))
    const p = await request<{ status: string; token?: string }>(`${API}/api/auth/device/token`, { method: 'POST', body: { device_code: s.device_code } })
      .then((r) => r.json)
      .catch(() => null)
    if (!p) continue
    if (p.status === 'ok' && p.token) return p.token
    if (p.status === 'slow_down') interval = Math.min(interval + 1, 10)
    else if (p.status === 'access_denied') throw new Error('The sign-in was refused.')
    else if (p.status !== 'authorization_pending') throw new Error('The sign-in expired. Try again.')
  }
  throw new Error('The sign-in expired. Try again.')
}

/** The signed-in account, or null when the token is no longer good. */
export async function me(token: string): Promise<Me | null> {
  const { json } = await request<{ user: Me | null }>(`${API}/api/auth/me`, { token })
  return json.user
}

/** Ends the session on kryo.to (best effort), then forgets everything account-bound here. */
export async function signOut(token: string | null) {
  if (token) await request(`${API}/api/auth/logout`, { method: 'POST', token }).catch(() => {})
  store.setToken(null)
  store.setGuest(false)
}

/** Open a page in the phone's browser. */
export async function openExternal(url: string) {
  if (isTauri()) await openUrl(url)
  else window.open(url, '_blank', 'noopener')
}
