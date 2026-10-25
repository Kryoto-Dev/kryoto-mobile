import { useCallback, useEffect, useState } from 'react'
import { BellRing, ChevronRight, Lock } from 'lucide-react'
import { Busy, Button, Modal } from '@/ui'
import { cn } from '@/lib/utils'
import { API } from '@/mobile/auth'
import { useApp } from '@/mobile/context'
import { Notice } from '@/mobile/parts'
import { acct } from '@/mobile/account/api'
import { LinkOut, Panel, SaveBar, Status } from '@/mobile/account/forms'
import {
  CHANNEL_HINT,
  CHANNEL_LABEL,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_GROUPS,
  NOTIFICATION_META,
  NOTIFICATION_TYPES,
  isChannelAllowed,
  isForced,
  type NotificationChannel,
  type NotificationPrefs,
  type NotificationType,
} from '@/mobile/account/settings/notification-meta'

/** The Kryoto Discord server (kryo.to lib/community-links.ts DISCORD_INVITE_URL). */
const DISCORD_INVITE_URL = 'https://discord.gg/Q2S8hRzrep'

type Availability = Record<NotificationChannel, boolean>
type Loaded = { prefs: NotificationPrefs; available: Availability; emailVerified: boolean; staff?: boolean }

/**
 * Settings > Notifications: every notification type against every channel it
 * may use, as kryo.to's NotificationPreferences draws it, saved together with
 * the bar. The browser web-push toggle is left out: it registers a browser, and
 * this phone's own notifications live on their own screen.
 */
export function NotificationsTab() {
  const { token, push, fail } = useApp()
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null)
  const [savedPrefs, setSavedPrefs] = useState<NotificationPrefs | null>(null)
  const [discordChoice, setDiscordChoice] = useState<NotificationType | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ msg: string; ok: boolean } | null>(null)
  const [testing, setTesting] = useState(false)
  const [testStatus, setTestStatus] = useState<{ msg: string; ok: boolean } | null>(null)

  const load = useCallback(() => {
    setError(null)
    acct<Loaded>(token, '/api/notifications/prefs')
      .then((r) => {
        setData(r)
        setPrefs(r.prefs)
        setSavedPrefs(r.prefs)
      })
      .catch((e) => setError(fail(e)))
    // fail only reads fresh context; load again only when the account changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])
  useEffect(load, [load])

  const dirty = prefs !== null && savedPrefs !== null && JSON.stringify(prefs) !== JSON.stringify(savedPrefs)

  function toggle(type: NotificationType, channel: NotificationChannel) {
    if (!prefs || isForced(type, channel) || !isChannelAllowed(type, channel)) return
    const current = prefs[type] ?? []
    if (channel === 'discord' && !current.includes(channel)) {
      setDiscordChoice(type)
      return
    }
    setStatus(null)
    setPrefs({ ...prefs, [type]: current.includes(channel) ? current.filter((c) => c !== channel) : [...current, channel] })
  }

  function enableDiscord() {
    const type = discordChoice
    setDiscordChoice(null)
    if (!type) return
    setStatus(null)
    setPrefs((p) => (p ? { ...p, [type]: [...new Set([...(p[type] ?? []), 'discord' as const])] } : p))
  }

  async function save() {
    if (!prefs) return
    setBusy(true)
    setStatus(null)
    try {
      const r = await acct<{ prefs: NotificationPrefs; available?: Availability }>(token, '/api/notifications/prefs', { method: 'PUT', body: { prefs } })
      setPrefs(r.prefs)
      setSavedPrefs(r.prefs)
      const available = r.available
      if (available) setData((d) => (d ? { ...d, available } : d))
      setStatus({ msg: 'Notification settings saved.', ok: true })
    } catch (e) {
      setStatus({ msg: fail(e), ok: false })
    } finally {
      setBusy(false)
    }
  }

  async function sendTest() {
    setTesting(true)
    setTestStatus(null)
    try {
      const r = await acct<{ message?: string }>(token, '/api/notifications/test', { method: 'POST' })
      setTestStatus({ msg: r.message ?? 'Sent.', ok: true })
    } catch (e) {
      setTestStatus({ msg: fail(e), ok: false })
    } finally {
      setTesting(false)
    }
  }

  const phoneRow = (
    <button type="button" onClick={() => push({ kind: 'notifications' })} className="kryo-radius flex items-center justify-between gap-3 border border-border bg-card px-4 py-3 text-left text-xs text-foreground">
      <span className="grid gap-0.5">
        Android notifications on this phone
        <span className="text-[11px] text-muted-foreground">Alerts and updates for this app only.</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  )

  if (!data || !prefs) {
    return (
      <>
        {phoneRow}
        {error ? (
          <Notice title="Couldn't load your notification settings" body={error} retry={load} />
        ) : (
          <p className="flex items-center gap-2 py-6 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            <Busy className="size-3" /> Loading preferences
          </p>
        )}
      </>
    )
  }

  const { available, emailVerified, staff } = data

  return (
    <>
      <p className="text-xs leading-relaxed text-muted-foreground">Choose how Kryoto reaches you. Changes are saved with the bar at the bottom of the screen.</p>
      {phoneRow}

      {discordChoice ? (
        <Modal
          title="Enable Discord DMs"
          onClose={() => setDiscordChoice(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDiscordChoice(null)}>
                Cancel
              </Button>
              <Button variant="primary" disabled={!available.discord} onClick={enableDiscord}>
                I joined, enable DMs
              </Button>
            </>
          }
        >
          <p className="text-xs leading-relaxed text-muted-foreground">Join the Kryoto server so our bot can message you, then allow direct messages from server members.</p>
          <p className="text-xs leading-relaxed text-foreground">Use the same Discord account you linked to Kryoto.</p>
          {!available.discord ? <LinkOut label="Link your Discord account first" url={`${API}/api/auth/discord?next=/settings`} /> : null}
          <LinkOut label="Join the Kryoto server" url={DISCORD_INVITE_URL} />
        </Modal>
      ) : null}

      <div className="grid gap-2">
        {NOTIFICATION_CHANNELS.map((channel) => {
          const ok = available[channel]
          const why = channel === 'email' && !emailVerified ? 'Verify your email address first.' : channel === 'discord' && !ok ? 'No Discord account linked.' : !ok ? 'Not configured on this server.' : CHANNEL_HINT[channel]
          return (
            <div key={channel} className={cn('kryo-radius border p-3', ok ? 'border-border' : 'border-dashed border-border/60')}>
              <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-foreground">
                {CHANNEL_LABEL[channel]}
                {!ok ? <span className="font-normal text-muted-foreground/60">unavailable</span> : null}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                {why}
                {channel === 'discord' ? ' Join the Kryoto server and allow direct messages from server members.' : ''}
              </p>
            </div>
          )
        })}
        <LinkOut label="Join the Kryoto Discord server" url={DISCORD_INVITE_URL} />
        {!available.discord ? <LinkOut label="Link your Discord account" url={`${API}/api/auth/discord?next=/settings`} /> : null}
      </div>

      {NOTIFICATION_GROUPS.filter((group) => group !== 'Staff' || staff).map((group) => {
        const types = NOTIFICATION_TYPES.filter((t) => NOTIFICATION_META[t].group === group)
        if (types.length === 0) return null
        return (
          <Panel key={group} title={group}>
            <div className="grid gap-3">
              {types.map((type) => {
                const meta = NOTIFICATION_META[type]
                const on = prefs[type] ?? []
                return (
                  <div key={type} className="grid gap-1.5 border-b border-border pb-3 last:border-b-0 last:pb-0">
                    <p className="text-xs text-foreground">{meta.label}</p>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">{meta.description}</p>
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {NOTIFICATION_CHANNELS.filter((channel) => isChannelAllowed(type, channel)).map((channel) => {
                        const checked = on.includes(channel)
                        const locked = isForced(type, channel)
                        return (
                          <button
                            key={channel}
                            type="button"
                            role="switch"
                            aria-checked={checked}
                            aria-label={`${meta.label} via ${CHANNEL_LABEL[channel]}`}
                            disabled={locked}
                            onClick={() => toggle(type, channel)}
                            className={cn(
                              'kryo-pill inline-flex h-7 items-center gap-1 border px-3 text-[10px] font-bold uppercase tracking-wider transition-colors',
                              checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground',
                              locked && 'cursor-not-allowed opacity-70',
                              // Switched on but with nowhere to go: shown, not hidden, so nobody believes it is working.
                              checked && !available[channel] && 'border-dashed opacity-50',
                            )}
                          >
                            {locked ? <Lock className="size-3" aria-hidden /> : null}
                            {CHANNEL_LABEL[channel]}
                          </button>
                        )
                      })}
                    </div>
                    {isForced(type, 'email') ? <p className="text-[11px] text-muted-foreground">Always on. Security mail cannot be switched off.</p> : null}
                  </div>
                )
              })}
            </div>
          </Panel>
        )
      })}

      <div className="kryo-radius grid gap-2 border border-border bg-card p-3">
        <div>
          <Button disabled={testing} onClick={() => void sendTest()}>
            {testing ? <Busy className="size-3" /> : <BellRing className="size-3" />}
            Send me a test
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">Goes out over every channel you have switched on for security alerts.</p>
        <Status msg={testStatus?.msg} ok={testStatus?.ok} />
      </div>

      <SaveBar dirty={dirty} busy={busy} onSave={() => void save()} onReset={() => { setPrefs(savedPrefs); setStatus(null) }} status={status} />
    </>
  )
}
