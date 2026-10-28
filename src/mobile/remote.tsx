import { useState } from 'react'
import { Button, Caption } from '@/ui'
import { useApp } from '@/mobile/context'

/**
 * Remote, away from home (kryo.to lib/remote-consent.ts): off until the account
 * turns it on. Here, on kryo.to/remote, in Kryoto Desktop or in Kryoto Forge:
 * one answer for the account. Pairing on the PC's Wi-Fi does not need it.
 */

const WHAT =
  "kryo.to keeps which of your PCs are open (name, system, app version), their games and what is running, and their downloads. From here and kryo.to/remote you can then send a game to a PC, start and stop games, pause, resume, cancel or clear downloads, and take games off a PC, from anywhere."

/** The question, or the switch: `compact` for Profile, where it is a setting. */
export function RemoteConsentCard({ compact = false }: { compact?: boolean }) {
  const { remote, setRemote, toast, signedIn } = useApp()
  const [saving, setSaving] = useState(false)
  if (!signedIn || !remote) return null

  const choose = async (enabled: boolean) => {
    setSaving(true)
    try {
      await setRemote(enabled)
      toast(enabled ? 'Remote is on.' : 'Remote is off.')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save that.')
    } finally {
      setSaving(false)
    }
  }

  if (compact) {
    return (
      <div className="grid gap-2">
        <div className="grid gap-0.5">
          <span className="text-xs font-bold text-foreground">Remote, away from home</span>
          <Caption>{remote.enabled ? 'On for your account' : 'Off'}</Caption>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {remote.enabled ? WHAT : 'Off: nothing about your PCs goes to kryo.to, and the phone reaches your PC only on its Wi-Fi. ' + WHAT.replace('kryo.to keeps', 'On, kryo.to keeps')}
        </p>
        <Button size="sm" variant={remote.enabled ? 'outline' : 'primary'} disabled={saving} onClick={() => void choose(!remote.enabled)}>
          {saving ? 'Saving...' : remote.enabled ? 'Turn off Remote' : 'Turn on Remote'}
        </Button>
      </div>
    )
  }

  if (remote.enabled) return null
  return (
    <div className="grid gap-2">
      <span className="text-xs font-bold text-foreground">{remote.decided ? 'Remote is off' : 'Turn on Remote?'}</span>
      <p className="text-xs leading-relaxed text-muted-foreground">
        To reach your PCs away from home, turn on Remote for your account. {WHAT} You can turn it off again in Profile or on kryo.to. A PC paired on your Wi-Fi works either way.
      </p>
      <Button disabled={saving} onClick={() => void choose(true)}>
        {saving ? 'Saving...' : 'Turn on Remote'}
      </Button>
    </div>
  )
}
