import { openUrl } from '@tauri-apps/plugin-opener'
import type { BadgeView } from '@/mobile/badges'
import { isTauri } from '@/lib/bridge'
import { ApiError, request } from '@/mobile/net'
import { store } from '@/mobile/storage'

/** kryo.to's device sign-in (RFC 8628), as the client "mobile" (see startSignIn). */

/** kryo.to. A test build may name a local site instead (`VITE_KRYO_API`, with the native `KRYO_DEV_API` in a debug build); releases never set it. */
export const API: string = import.meta.env.VITE_KRYO_API || 'https://kryo.to'

export type DeviceStart = { device_code: string; user_code: string; verification_uri: string; verification_uri_complete: string; interval: number; expires_in: number }

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
  /** Dark-launched features this account sees (kryo.to feature flags), e.g. `friends`. */
  features?: Partial<Record<string, boolean>> | null
}

/**
 * As "mobile", so the approval screen says Kryoto Mobile; as "desktop" when the
 * site does not know that client yet (it answers 400), which it accepted first.
 */
export async function startSignIn(): Promise<DeviceStart> {
  const ask = (client: string) =>
    request<DeviceStart>(`${API}/api/auth/device`, { method: 'POST', body: { client, device_name: 'Kryoto Mobile' } }).then((r) => r.json)
  try {
    return await ask('mobile')
  } catch (e) {
    if (e instanceof ApiError && e.status === 400) return ask('desktop')
    throw e
  }
}

/** The code ran out before anybody approved it. */
export class SignInExpired extends Error {
  constructor() {
    super('The sign-in expired. Try again.')
  }
}

/** Poll until approved. Resolves the token, or throws (`SignInExpired` when the code ran out). */
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
    else if (p.status !== 'authorization_pending') throw new SignInExpired()
  }
  throw new SignInExpired()
}

/** The signed-in account, or null when the token is no longer good. */
export async function me(token: string): Promise<Me | null> {
  const { json } = await request<{ user: Me | null }>(`${API}/api/auth/me`, { token })
  return json.user
}

/** `ABCD-EFGH`, the way kryo.to prints a sign-in code. */
export function groupCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code
}

/** One of kryo.to's own paths (`/novarys/...`) as a full address; anything else as it is. */
export function siteUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url, API).toString()
  } catch {
    return null
  }
}

/** The signed-in account's profile as kryo.to's /user page shows it (`GET /api/account/profile`). */
export type AccountProfile = {
  id: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  bannerUrl: string | null
  bio: string | null
  location: string | null
  accentColor: string | null
  links: { platform: string; url: string; label?: string }[]
  customStatus: string | null
  customStatusIcon: string | null
  createdAt: string
  /** Primary staff role: 'owner', 'admin', 'uploader', 'moderator'... */
  tier: string | null
  /** Every staff role, highest first. */
  roles?: string[]
  developer: boolean
  /** Every badge beside the name, ready to draw (kryo.to lib/profile-badges.ts). Missing from an older site. */
  badges?: BadgeView[]
  isSupporter: boolean
  donationTierLabel: string | null
  customBadge: { text: string; icon: string | null } | null
  reputation: { balance: number; verified: number } | null
  kryos: number | null
}

export async function profile(token: string): Promise<AccountProfile> {
  const { json } = await request<{ profile: AccountProfile }>(`${API}/api/account/profile`, { token })
  return json.profile
}

/** A device waiting to be signed in, as kryo.to describes it before it is approved. */
export type PendingSignIn = { clientLabel: string; deviceName: string | null; requestIp: string | null; createdAt: string; expiresAt: string }

/**
 * The code in a kryo.to sign-in QR (`https://kryo.to/link?code=ABCD-EFGH`, what
 * the site's "Sign in with your phone" shows), or a code typed as is. Null for
 * anything else.
 */
export function parseSignInCode(text: string): string | null {
  const raw = text.trim()
  let code = raw
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || (url.hostname !== 'kryo.to' && !url.hostname.endsWith('.kryo.to')) || url.pathname !== '/link') return null
    code = url.searchParams.get('code') ?? ''
  } catch {
    // Not an address: maybe the code itself.
  }
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return /^[A-HJKMNP-TV-Z2-9]{8}$/.test(clean) ? clean : null
}

export async function lookupSignIn(token: string, code: string): Promise<PendingSignIn> {
  const { json } = await request<{ request: PendingSignIn }>(`${API}/api/auth/device/approve?code=${encodeURIComponent(code)}`, { token })
  return json.request
}

export async function answerSignIn(token: string, code: string, decision: 'approve' | 'deny'): Promise<void> {
  await request(`${API}/api/auth/device/approve`, { method: 'POST', token, body: { code, decision } })
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
