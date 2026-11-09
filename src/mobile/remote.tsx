import { useState } from 'react'
import { Button, Caption } from '@/ui'
import { useApp } from '@/mobile/context'
import { Note } from '@/mobile/parts'

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
      // Turning it off deletes what the PCs reported, so only turning it on
      // can be taken back. Away from Profile, the toast says where it lives.
      toast(enabled ? 'Remote is on.' : 'Remote is off.', {
        undo: enabled ? () => choose(false) : undefined,
        setting: compact ? undefined : 'remote',
      })
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
        <Note>{remote.enabled ? WHAT : 'Nothing about your PCs goes to kryo.to, and the phone reaches your PC only on its Wi-Fi.'}</Note>
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
      <Note>Reach your PCs away from home. A PC paired on your Wi-Fi works either way.</Note>
      <details className="group text-[11px] text-muted-foreground">
        <summary className="cursor-pointer list-none font-bold uppercase tracking-wider [&::-webkit-details-marker]:hidden">What it shares</summary>
        <p className="mt-2 leading-relaxed">{WHAT} You can turn it off again in Profile or on kryo.to.</p>
      </details>
      <Button disabled={saving} onClick={() => void choose(true)}>
        {saving ? 'Saving...' : 'Turn on Remote'}
      </Button>
    </div>
  )
}
