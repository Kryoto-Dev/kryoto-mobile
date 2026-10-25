import { ProfileLink, TeamName } from '@/mobile/identity'
import { useEffect, useState } from 'react'
import { MonitorSmartphone } from 'lucide-react'
import { Button, Caption } from '@/ui'
import { answerSignIn, groupCode, lookupSignIn, type PendingSignIn } from '@/mobile/auth'
import { useApp } from '@/mobile/context'
import { Busy, Notice, PageHeader } from '@/mobile/parts'

type State = { kind: 'loading' } | { kind: 'found'; request: PendingSignIn } | { kind: 'error'; message: string } | { kind: 'done'; decision: 'approve' | 'deny' }

/**
 * Approving a sign-in from this phone: the code from a kryo.to QR (the site's
 * "Sign in with your phone", or another device's sign-in screen).
 *
 * Like kryo.to's /link page, it shows what is asking before anything is
 * approved, and refusing is as easy as approving: the attack on a device
 * sign-in is getting somebody to approve a code that is not theirs.
 */
export function ApprovePage({ code }: { code: string }) {
  const { token, me, back, fail } = useApp()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!token) return
    let current = true
    lookupSignIn(token, code)
      .then((request) => current && setState({ kind: 'found', request }))
      .catch((e: unknown) => current && setState({ kind: 'error', message: fail(e) }))
    return () => {
      current = false
    }
  }, [token, code, fail])

  const decide = async (decision: 'approve' | 'deny') => {
    if (!token || busy) return
    setBusy(true)
    try {
      await answerSignIn(token, code, decision)
      setState({ kind: 'done', decision })
    } catch (e) {
      setState({ kind: 'error', message: fail(e) })
    } finally {
      setBusy(false)
    }
  }

  const name = me ? me.displayName || me.username : 'your account'
  return (
    <div className="flex min-h-full flex-col">
      <PageHeader title="Sign in a device" onBack={back} />
      <div className="grid gap-4 px-4 py-6">
        {state.kind === 'loading' ? (
          <Busy label="Looking up the code" />
        ) : state.kind === 'error' ? (
          <Notice title="That code did not work" body={state.message}>
            <Button onClick={back}>Back</Button>
          </Notice>
        ) : state.kind === 'done' ? (
          <Notice
            title={state.decision === 'approve' ? 'Approved' : 'Refused'}
            body={state.decision === 'approve' ? 'The device signs in within a few seconds. You can sign it out any time in kryo.to Settings, Sessions.' : 'Nothing was signed in.'}
          >
            <Button variant="primary" onClick={back}>
              Done
            </Button>
          </Notice>
        ) : (
          <>
            <section className="kryo-radius grid gap-3 border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <MonitorSmartphone className="size-5 shrink-0 text-primary" />
                <div className="grid min-w-0 gap-0.5">
                  <span className="truncate text-sm font-bold text-foreground">{state.request.clientLabel}</span>
                  {state.request.deviceName ? <Caption className="truncate normal-case tracking-normal">{state.request.deviceName}</Caption> : null}
                </div>
              </div>
              <dl className="grid gap-1.5 text-xs">
                <Row label="Code" value={groupCode(code)} />
                {state.request.requestIp ? <Row label="Asked from" value={state.request.requestIp} /> : null}
                <Row label="Asked at" value={new Date(state.request.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} />
              </dl>
            </section>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Approving signs that device in as <ProfileLink username={me?.username} className="font-bold text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-primary"><TeamName username={me?.username}>{name}</TeamName></ProfileLink>. Only approve a code you asked for yourself, on a screen you are looking at.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button size="lg" variant="danger" disabled={busy} onClick={() => void decide('deny')}>
                Refuse
              </Button>
              <Button size="lg" disabled={busy} onClick={() => void decide('approve')}>
                Approve
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-bold text-foreground">{value}</dd>
    </div>
  )
}
