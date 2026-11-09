import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '@/lib/bridge'
import { store, type Links } from '@/mobile/storage'
import type { PhoneSnapshot } from '@/mobile/types'
import { API } from '@/mobile/auth'

export const MOBILE_NOTIFICATIONS = [
  ['chat', 'Chat messages', 'Tells you a message is waiting while the app is closed. Who wrote it and what it says stay encrypted.'],
  ['complete', 'Download finished', ''],
  ['failed', 'Download needs attention', ''],
  ['live', 'Follow active downloads', 'Android shows a small ongoing notification while one runs.'],
  ['requests', 'Your requests', ''],
  ['community', 'Replies and friends', 'Replies, mentions, friends, collections and support.'],
  ['news', 'Kryoto news', ''],
  ['account', 'Your account', 'Security alerts and supporter reminders.'],
] as const
export type MobilePrefs = Record<(typeof MOBILE_NOTIFICATIONS)[number][0], boolean>

export function notificationPrefs(): MobilePrefs {
  const raw = store.notifications()
  // Chat is the one on from the start: you expect to hear about a message.
  return Object.fromEntries(MOBILE_NOTIFICATIONS.map(([key]) => [key, key === 'chat' ? raw[key] !== false : raw[key] === true])) as MobilePrefs
}
export function saveNotificationPrefs(prefs: MobilePrefs) {
  store.setNotifications(prefs)
  window.dispatchEvent(new Event('mobile-preferences'))
}
export const mobileAction = <T = void>(action: string, payload: Record<string, unknown> = {}): Promise<T> =>
  invoke<T>('mobile_action', { action, payload })

export type MobileStatus = { notifications: boolean; localNetwork: boolean; target?: string }
export async function mobileStatus(): Promise<MobileStatus> {
  const status = await mobileAction<MobileStatus>('status')
  if (status.target) window.dispatchEvent(new CustomEvent('mobile-notification-open', { detail: status.target }))
  return status
}

/** Native configuration is cleared on sign-out; delivery survives a suspended WebView. */
export function useMobileNotifications(token: string | null, links: Links, snapshot: PhoneSnapshot | null, toast: (text: string) => void) {
  const [prefs, setPrefs] = useState(notificationPrefs)
  useEffect(() => {
    const changed = () => setPrefs(notificationPrefs())
    window.addEventListener('mobile-preferences', changed)
    return () => window.removeEventListener('mobile-preferences', changed)
  }, [])
  const config = JSON.stringify({ api: API, token, ...links, prefs })
  useEffect(() => {
    if (!isTauri()) return
    void mobileAction('configure', { config }).catch(() => toast('Could not save Android notification settings. Open Notifications to try again.'))
  }, [config, toast])
  useEffect(() => {
    if (!isTauri() || !token || !Object.values(prefs).some(Boolean)) return
    const poll = () => { if (document.visibilityState === 'visible') void mobileAction('poll').catch(() => {}) }
    const timer = window.setInterval(poll, 60_000)
    document.addEventListener('visibilitychange', poll)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', poll) }
  }, [prefs, token])
  useEffect(() => {
    if (!isTauri() || !snapshot) return
    const observe = () => { if (document.visibilityState === 'visible') void mobileAction('observe', { config: JSON.stringify(snapshot) }).catch(() => {}) }
    observe()
    window.addEventListener('mobile-preferences', observe)
    return () => window.removeEventListener('mobile-preferences', observe)
  }, [snapshot])
  useEffect(() => {
    if (!isTauri()) return
    const visible = () => { if (document.visibilityState === 'visible') void mobileStatus().catch(() => {}) }
    document.addEventListener('visibilitychange', visible)
    visible()
    return () => document.removeEventListener('visibilitychange', visible)
  }, [])
}

