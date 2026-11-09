import { useEffect, useState } from 'react'
import { Check as CheckIcon, Download, Settings } from '@/ui/pixel-icons'
import { Button, Check, Section } from '@/ui'
import { isTauri } from '@/lib/bridge'
import { IS_PREVIEW_BUILD } from '@/lib/endpoint'
import { API, openExternal } from '@/mobile/auth'
import { useApp } from '@/mobile/context'
import { Note, Notice, PageHeader } from '@/mobile/parts'
import { request } from '@/mobile/net'
import { MOBILE_NOTIFICATIONS, mobileAction, mobileStatus, notificationPrefs, saveNotificationPrefs, type MobileStatus } from '@/mobile/platform'
import { store } from '@/mobile/storage'

type Item = { id: string; title: string; body: string; url: string | null; readAt: string | null }
type Update = { available: boolean; version: string }

export function UpdatePrompt() {
  const [update, setUpdate] = useState<Update | null>(null)
  const [busy, setBusy] = useState(false)
  const { toast, fail } = useApp()
  useEffect(() => {
    // Kryoto Mobile Preview gets its builds from kryo.to/preview, never the release's.
    if (!isTauri() || IS_PREVIEW_BUILD) return
    let checked = 0
    let current = true
    const check = () => {
      if (document.visibilityState !== 'visible' || Date.now() - checked < 6 * 60 * 60 * 1000) return
      checked = Date.now()
      void mobileAction<Update>('checkUpdate').then((u) => {
        if (current && u.available && Date.now() - store.updateLater(u.version) > 24 * 60 * 60 * 1000) setUpdate(u)
      }).catch(() => {})
    }
    check()
    document.addEventListener('visibilitychange', check)
    return () => { current = false; document.removeEventListener('visibilitychange', check) }
  }, [])
  if (!update) return null
  return <aside role="status" className="kryo-radius fixed inset-x-4 bottom-[calc(var(--sab)+6rem)] z-50 grid gap-2 border border-primary bg-card p-4 shadow-xl">
    <p className="text-xs font-bold">Kryoto Mobile {update.version} is ready</p>
    <Note>Download and install it here. Android will ask you to confirm.</Note>
    <div className="flex gap-2">
      <Button variant="primary" disabled={busy} onClick={() => {
        setBusy(true)
        void mobileAction('installUpdate').catch((e: unknown) => toast(fail(e))).finally(() => setBusy(false))
      }}><Download className="size-3" />{busy ? 'Preparing update...' : 'Install update'}</Button>
      <Button disabled={busy} onClick={() => { store.setUpdateLater(update.version); setUpdate(null) }}>Later</Button>
    </div>
  </aside>
}

/** What is new on the account, then this Android app's own settings: they do not alter website delivery. */
export function NotificationsPage() {
  const { back, token, toast, fail } = useApp()
  const [prefs, setPrefs] = useState(notificationPrefs)
  const [status, setStatus] = useState<MobileStatus | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
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
    setError(null)
    void request<{ notifications: Item[] }>(`${API}/api/notifications?limit=30`, { token })
      .then(({ json }) => { if (current) setItems(json.notifications) })
      .catch((e: unknown) => { if (current) setError(fail(e)) })
    return () => { current = false }
  }, [token, fail, attempt])
  return <div className="flex min-h-full flex-col">
    <PageHeader title="Notifications & updates" onBack={back} />
    <div className="grid gap-5 p-4">
      {error ? <Notice title="Could not load your notifications" body={error} retry={() => setAttempt((n) => n + 1)} /> : null}
      {items.length ? <section className="grid gap-2">
        <div className="flex items-center justify-end">
          {items.some((n) => !n.readAt) ? <Button onClick={() => {
            const was = items
            setItems(items.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })))
            void request(`${API}/api/notifications`, { method: 'POST', token, body: { all: true } }).catch((e: unknown) => {
              setItems(was)
              toast(fail(e))
            })
          }}><CheckIcon className="size-3" />Mark all read</Button> : null}
        </div>
        {items.map((n) => {
          const url = n.url && /^\/(?!\/)/.test(n.url) ? `${API}${n.url}` : null
          return <article key={n.id} className={`kryo-radius grid gap-1 border bg-card p-3 [overflow-wrap:anywhere] ${n.readAt ? 'border-border' : 'border-primary'}`}>
            {url ? <a href={url} onClick={(e) => { e.preventDefault(); void openExternal(url) }} className="text-xs font-bold underline underline-offset-2 focus-visible:outline focus-visible:outline-2">{n.title}</a> : <p className="text-xs font-bold">{n.title}</p>}
            <Note>{n.body}</Note>
          </article>
        })}
      </section> : null}
      <Section title="On this phone">
        <Note>Android may hold these back to save battery.</Note>
        {isTauri() ? <div className="flex flex-wrap gap-2">
          {status && !status.notifications ? <Button variant="primary" onClick={() => void mobileAction<MobileStatus>('enable').then(setStatus).catch((e: unknown) => toast(fail(e)))}>Allow notifications</Button> : null}
          <Button onClick={() => void mobileAction('settings').catch((e: unknown) => toast(fail(e)))}><Settings className="size-3" />Android settings</Button>
        </div> : null}
        {MOBILE_NOTIFICATIONS.map(([key, title, hint]) => <div key={key} className="grid gap-1.5 border-t border-border pt-3">
          <Check checked={prefs[key]} onChange={(on) => {
            const next = { ...prefs, [key]: on }
            setPrefs(next)
            saveNotificationPrefs(next)
          }} label={title} />
          {hint ? <Note>{hint}</Note> : null}
        </div>)}
        {!token ? <Note>Sign in for requests, community, news and account notifications. Desktop downloads also work with Wi-Fi pairing.</Note> : null}
      </Section>
      <Section title="App updates">
        <Note>Installed version {__APP_VERSION__}. Updates keep your account and PC connections.</Note>
        <Button disabled={!!updating || !isTauri()} onClick={() => {
          setUpdating('Checking...')
          void mobileAction<Update>('checkUpdate').then(async (u) => {
            if (!u.available) { toast('You have the newest version.'); return }
            setUpdating(`Downloading ${u.version}...`)
            await mobileAction('installUpdate')
          }).catch((e: unknown) => toast(fail(e))).finally(() => setUpdating(null))
        }}><Download className="size-3" />{updating ?? 'Check for updates'}</Button>
      </Section>
    </div>
  </div>
}
