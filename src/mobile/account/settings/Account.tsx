import { useEffect, useState } from 'react'
import { ChevronRight, UserPen } from 'lucide-react'
import { Button } from '@/ui'
import { API } from '@/mobile/auth'
import { useApp } from '@/mobile/context'
import { acct } from '@/mobile/account/api'
import { FieldRow, LinkOut, Panel, Status, TextField, ToggleRow } from '@/mobile/account/forms'

type Msg = { msg: string; ok: boolean } | null

/** Settings > Account: the profile editor, the email on file and the die. Copy from kryo.to settings-client.tsx (EmailSection, DieSection). */
export function AccountTab() {
  const { token, me, reloadMe, push, toast, fail } = useApp()

  const email = me?.email ?? ''
  const verified = Boolean(me?.emailVerifiedAt)
  const [value, setValue] = useState(email)
  const [emailStatus, setEmailStatus] = useState<Msg>(null)
  const [emailBusy, setEmailBusy] = useState(false)
  useEffect(() => setValue(email), [email])

  const dieSaved = me?.diePersonalised === true
  const [die, setDie] = useState(dieSaved)
  const [dieBusy, setDieBusy] = useState(false)
  useEffect(() => setDie(dieSaved), [dieSaved])

  async function saveEmail() {
    setEmailBusy(true)
    setEmailStatus(null)
    try {
      await acct(token, '/api/account/email', { method: 'POST', body: { email: value.trim() } })
      setEmailStatus({ msg: 'Email updated. Check your inbox to verify it.', ok: true })
      await reloadMe()
    } catch (e) {
      setEmailStatus({ msg: fail(e), ok: false })
    } finally {
      setEmailBusy(false)
    }
  }

  async function resend() {
    setEmailBusy(true)
    setEmailStatus(null)
    try {
      await acct(token, '/api/auth/verify-email/resend', { method: 'POST' })
      setEmailStatus({ msg: 'Verification email sent.', ok: true })
    } catch (e) {
      setEmailStatus({ msg: fail(e), ok: false })
    } finally {
      setEmailBusy(false)
    }
  }

  async function changeDie(next: boolean) {
    setDie(next)
    setDieBusy(true)
    try {
      await acct(token, '/api/account/die', { method: 'PATCH', body: { personalised: next } })
      toast(next ? 'The die will use what you play.' : 'The die is back to plain random. What it had learned about you has been deleted.')
      await reloadMe()
    } catch (e) {
      fail(e)
      setDie(!next)
      toast('Could not save that. Try again in a moment.')
    } finally {
      setDieBusy(false)
    }
  }

  return (
    <>
      <button type="button" onClick={() => push({ kind: 'editProfile' })} className="kryo-radius flex items-center justify-between gap-3 border border-border bg-card px-4 py-3 text-left text-xs text-foreground">
        <span className="flex items-center gap-2">
          <UserPen className="size-4 text-muted-foreground" aria-hidden />
          Edit profile
        </span>
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </button>

      <Panel title="Email">
        <FieldRow label="Email" hint={email ? (verified ? 'Verified.' : 'Not verified.') : 'No email on this account yet.'}>
          <TextField type="email" inputMode="email" autoComplete="email" value={value} onChange={setValue} disabled={emailBusy} label="Email" />
        </FieldRow>
        <Status msg={emailStatus?.msg} ok={emailStatus?.ok} />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" disabled={emailBusy || !value.trim() || value.trim() === email} onClick={() => void saveEmail()}>
            {emailBusy ? 'Working…' : 'Update email'}
          </Button>
          {email && !verified ? (
            <Button variant="ghost" disabled={emailBusy} onClick={() => void resend()}>
              Resend verification
            </Button>
          ) : null}
        </div>
      </Panel>

      <Panel title="The die">
        <p className="text-xs leading-relaxed text-muted-foreground">
          The die beside the search bar picks a game for you. Left alone it picks at random from the whole catalog, and it needs nothing from you to do that.
        </p>
        <ToggleRow
          label="Let the die learn what I like"
          hint="Your library, the status you gave each game, and which games you download most are used to rank the catalog, alongside how each game is doing in the wider world."
          checked={die}
          disabled={dieBusy}
          onChange={(v) => void changeDie(v)}
        />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          A language model run by an outside company sees a list of game titles: the ones you play, and the ones we are considering suggesting. Nothing else goes with them, not your email, not your password, and not what you browse.
        </p>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          While this is on, three things are kept: a private count of which games you download, the taste profile built from that and your library, and the shortlist the model last picked over. Turning it off deletes all three outright rather than ignoring them.{' '}
          <strong className="font-semibold text-foreground">The view and download counts shown on a game&rsquo;s page are not affected</strong> - those are totals for the game itself, counted the same for everyone signed in or not, and nothing here adds to or removes from them.
        </p>
      </Panel>

      <LinkOut label="Sync with Discord" url={`${API}/api/auth/discord?next=/settings`} />
    </>
  )
}
