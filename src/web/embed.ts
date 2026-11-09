import { mobileAction, mobileStatus } from '@/mobile/platform'
import { isTauri } from '@/lib/bridge'
import { GATEWAY_HTTP } from '@/web/api'

/**
 * Kryoto Mobile's answer to src/web/embed.ts, for the chat engine and backend
 * (shared with the web chat). There is no frame: the app is what the engine
 * calls "the site". A new message or a ring comes here, and goes to Android.
 */

export const EMBEDDED = true

/** How this device reads in the account's chat devices. */
export const DEVICE_NAME = 'Kryoto Mobile'

const ASKED = 'kryoto.mobile.chatNoticesAsked'

type ToSite = { type: 'notify'; title: string; body: string | null }

/** What the engine wants said while the app is out of sight. */
export function toSite(msg: ToSite) {
  if (msg.type === 'notify' && isTauri()) void mobileAction('chatNotify', { title: msg.title, body: msg.body ?? '' }).catch(() => {})
}

/**
 * What Android gives the gateway so a message can reach it with the app closed;
 * null when the player turned chat notices off.
 */
export async function nativePushEndpoint(): Promise<string | null | undefined> {
  if (!isTauri()) return undefined
  const { endpoint } = await mobileAction<{ endpoint?: string | null }>('chatPush', { gateway: GATEWAY_HTTP })
  if (endpoint) askOnce()
  return endpoint ?? null
}

/** Chat notices are on from the start, but Android still has to be asked. Once, and a No stands. */
function askOnce() {
  try {
    if (localStorage.getItem(ASKED)) return
    localStorage.setItem(ASKED, '1')
  } catch {
    return
  }
  void mobileAction('enable').catch(() => {})
}

/** Android's own answer; `request` asks the player. */
export async function sitePermission(request: boolean): Promise<NotificationPermission | 'unsupported'> {
  if (!isTauri()) return 'unsupported'
  const status = request ? await mobileAction<{ notifications: boolean }>('enable') : await mobileStatus()
  return status.notifications ? 'granted' : 'denied'
}
