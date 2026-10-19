import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '@/lib/bridge'
import type { Links } from '@/mobile/storage'
import type { PhoneSnapshot } from '@/mobile/types'
import { API } from '@/mobile/auth'

export const MOBILE_NOTIFICATIONS = [
  ['complete', 'Download finished', 'A game finishes installing on your PC.'],
  ['failed', 'Download needs attention', 'A desktop download fails and needs a retry.'],
  ['live', 'Follow active downloads', 'Keep following a download after you leave the app. Android shows a small ongoing notification while it runs.'],
  ['requests', 'Your requests', 'Progress, delivery and signals for your requested games.'],
  ['community', 'Replies and friends', 'Comment replies, friends, collections and support replies.'],
  ['news', 'Kryoto news', 'Announcements, changelogs and blog posts.'],
  ['account', 'Your account', 'Security alerts and supporter reminders.'],
] as const
export type MobilePrefs = Record<(typeof MOBILE_NOTIFICATIONS)[number][0], boolean>
const PREFS_KEY = 'kryoto.mobile.notifications'

export function notificationPrefs(): MobilePrefs {
  let raw: Partial<MobilePrefs> = {}
  try { raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<MobilePrefs> } catch { /* defaults */ }
  return Object.fromEntries(MOBILE_NOTIFICATIONS.map(([key]) => [key, raw?.[key] === true])) as MobilePrefs
}
export function saveNotificationPrefs(prefs: MobilePrefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
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

export function notificationGroup(type: string): keyof MobilePrefs | null {
  if (type.startsWith('request.') || type === 'signal.refilled') return 'requests'
  if (/^(comment|friend|collection)\./.test(type) || type === 'support.replied') return 'community'
  if (['blog.published', 'changelog.released', 'site.announcement'].includes(type)) return 'news'
  if (['account.security', 'supporter.expiring', 'badge.review'].includes(type)) return 'account'
  return null
}
