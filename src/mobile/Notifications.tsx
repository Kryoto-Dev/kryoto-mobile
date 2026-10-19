import { useEffect, useState } from 'react'
import { Bell, Download, Settings } from 'lucide-react'
import { Button, Caption, Check } from '@/ui'
import { isTauri } from '@/lib/bridge'
import { API, openExternal } from '@/mobile/auth'
import { useApp } from '@/mobile/context'
import { PageHeader } from '@/mobile/parts'
import { request } from '@/mobile/net'
import { MOBILE_NOTIFICATIONS, mobileAction, mobileStatus, notificationGroup, notificationPrefs, saveNotificationPrefs, type MobileStatus } from '@/mobile/platform'

type Notice = { id: string; type: string; title: string; body: string; url: string | null }
type Update = { available: boolean; version: string }
const message = (e: unknown) => e instanceof Error ? e.message : String(e)

export function UpdatePrompt() {
  const [update, setUpdate] = useState<Update | null>(null)
  const [busy, setBusy] = useState(false)
  const { toast } = useApp()
  useEffect(() => {
    if (!isTauri()) return
    let checked = 0
    let current = true
    const check = () => {
      if (document.visibilityState !== 'visible' || Date.now() - checked < 6 * 60 * 60 * 1000) return
      checked = Date.now()
      void mobileAction<Update>('checkUpdate').then((u) => {
        const dismissed = Number(localStorage.getItem(`kryoto.mobile.update.${u.version}`) ?? 0)
        if (current && u.available && Date.now() - dismissed > 24 * 60 * 60 * 1000) setUpdate(u)
      }).catch(() => {})
    }
    check()
    document.addEventListener('visibilitychange', check)
    return () => { current = false; document.removeEventListener('visibilitychange', check) }
  }, [])
  if (!update) return null
  return <aside role="status" className="kryo-radius fixed inset-x-4 bottom-[calc(var(--sab)+6rem)] z-50 grid gap-2 border border-primary bg-card p-4 shadow-xl">
    <p className="text-xs font-bold">Kryoto Mobile {update.version} is ready</p>
    <Caption>Download and install it here. Android will ask you to confirm.</Caption>
    <div className="flex gap-2">
      <Button variant="primary" disabled={busy} onClick={() => {
        setBusy(true)
        void mobileAction('installUpdate').catch((e: unknown) => toast(message(e))).finally(() => setBusy(false))
      }}><Download className="size-3" />{busy ? 'Preparing update...' : 'Install update'}</Button>
      <Button disabled={busy} onClick={() => { localStorage.setItem(`kryoto.mobile.update.${update.version}`, String(Date.now())); setUpdate(null) }}>Later</Button>
    </div>
  </aside>
}

/** Only settings for this Android app. They do not alter website delivery. */
export function NotificationsPage() {
  const { back, token, toast, fail } = useApp()
  const [prefs, setPrefs] = useState(notificationPrefs)
  const [status, setStatus] = useState<MobileStatus | null>(null)
  const [items, setItems] = useState<Notice[]>([])
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)
  useEffect(() => {
    const refresh = () => { if (isTauri()) void mobileStatus().then(setStatus).catch(() => {}) }
    refresh()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [])
  useEffect(() => {
    if (!token) { setItems([]); return }
    let current = true
    void request<{ notifications: Notice[] }>(`${API}/api/notifications?limit=30`, { token })
      .then(({ json }) => { if (current) setItems(json.notifications.filter((n) => notificationGroup(n.type))) })
      .catch((e: unknown) => { if (current) setError(fail(e)) })
    return () => { current = false }
  }, [token, fail])
  return <div className="flex min-h-full flex-col">
    <PageHeader title="Notifications & updates" onBack={back} />
    <div className="grid gap-5 p-4">
      <section className="m-panel grid gap-3">
        <p className="flex items-center gap-2 text-sm font-bold"><Bell className="size-4" />On this phone</p>
        <p className="text-xs leading-relaxed text-muted-foreground">Choose what Kryoto Mobile sends to Android. Background checks run about every 15 minutes and may arrive later when Android saves battery. Follow active downloads keeps a download you viewed in the app up to date while you use another app.</p>
        {isTauri() ? <div className="flex flex-wrap gap-2">
          <Button onClick={() => void mobileAction<MobileStatus>('enable').then(setStatus).catch((e: unknown) => toast(message(e)))}>Allow notifications</Button>
          <Button onClick={() => void mobileAction('settings').catch((e: unknown) => toast(message(e)))}><Settings className="size-3" />Android settings</Button>
        </div> : null}
        {status && !status.notifications ? <Caption>Android notifications are off. Allow them above, or enable them in Android settings.</Caption> : null}
        {MOBILE_NOTIFICATIONS.map(([key, title, hint]) => <div key={key} className="grid gap-1.5 border-t border-border pt-3">
          <Check checked={prefs[key]} onChange={(on) => {
            const next = { ...prefs, [key]: on }
            setPrefs(next)
            saveNotificationPrefs(next)
          }} label={title} />
          <Caption>{hint}</Caption>
        </div>)}
        {!token ? <Caption>Sign in for requests, community, news and account notifications. Desktop downloads also work with Wi-Fi pairing.</Caption> : null}
      </section>
      <section className="m-panel grid gap-3">
        <p className="text-sm font-bold">App updates</p>
        <Caption>Installed version {__APP_VERSION__}. Updates keep your account and PC connections.</Caption>
        <Button disabled={updating || !isTauri()} onClick={() => {
          setUpdating(true)
          void mobileAction<Update>('checkUpdate').then(async (u) => {
            if (!u.available) { toast('You have the newest version.'); return }
            toast(`Preparing Kryoto Mobile ${u.version}...`)
            await mobileAction('installUpdate')
          }).catch((e: unknown) => toast(message(e))).finally(() => setUpdating(false))
        }}><Download className="size-3" />{updating ? 'Checking / preparing update...' : 'Check for updates'}</Button>
      </section>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {items.length ? <section className="grid gap-2">
        <p className="text-sm font-bold">Recent Kryoto notifications</p>
        {items.map((n) => {
          const url = n.url && /^\/(?!\/)/.test(n.url) ? `${API}${n.url}` : null
          return <article key={n.id} className="kryo-radius grid gap-1 border border-border bg-card p-3">
            {url ? <a href={url} onClick={(e) => { e.preventDefault(); void openExternal(url) }} className="text-xs font-bold underline underline-offset-2 focus-visible:outline focus-visible:outline-2">{n.title}</a> : <p className="text-xs font-bold">{n.title}</p>}
            <Caption>{n.body}</Caption>
          </article>
        })}
      </section> : null}
    </div>
  </div>
}
