import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Monitor, Terminal, Trash2 } from 'lucide-react'
import { Busy, Button, Caption, IconButton, Modal } from '@/ui'
import { API } from '@/mobile/auth'
import { useApp } from '@/mobile/context'
import { acct } from '@/mobile/account/api'
import { FieldRow, LinkOut, Panel, Status, TextField } from '@/mobile/account/forms'

/** The Security tab: password, recovery code, signed-in devices, Forge remote and account deletion. */
export function SecurityTab() {
  const { me, token } = useApp()
  if (!token || !me) return null
  const hasPassword = me.hasPassword === true
  const hasEmail = Boolean(me.email)
  return (
    <div className="grid gap-5">
      <PasswordPanel hasPassword={hasPassword} hasEmail={hasEmail} username={me.username} />
      <RecoveryPanel hasPassword={hasPassword} />
      <SessionsPanel />
      <ForgeRemotePanel />
      <DangerPanel hasPassword={hasPassword} hasEmail={hasEmail} />
    </div>
  )
}

/* ── Password (components/auth/settings-client.tsx PasswordSection) ── */

function PasswordPanel({ hasPassword, hasEmail, username }: { hasPassword: boolean; hasEmail: boolean; username: string }) {
  const { token, reloadMe, fail } = useApp()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [status, setStatus] = useState<{ msg: string; ok: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    setStatus(null)
    try {
      await acct(token, '/api/account/password', { method: 'POST', body: hasPassword ? { currentPassword: current, newPassword: next } : { newPassword: next } })
      setStatus({ msg: hasPassword ? 'Password changed. Other sessions signed out.' : 'Password set. You can sign in with it from now on.', ok: true })
      setCurrent('')
      setNext('')
      await reloadMe()
    } catch (e) {
      setStatus({ msg: fail(e) || 'Change failed.', ok: false })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title={hasPassword ? 'Password' : 'Set a password'}>
      {!hasPassword ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          This account was opened with Discord and has no password, so Discord is currently the only way into it. Set one and you can sign in with <span className="text-foreground">{username}</span>
          {hasEmail ? ' or your email address' : ''} instead.
          {hasEmail ? '' : ' Add an email on the Account tab too, or a lost password cannot be reset.'}
        </p>
      ) : null}
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        {hasPassword ? (
          <FieldRow label="Current password">
            <TextField type="password" autoComplete="current-password" value={current} onChange={setCurrent} label="Current password" />
          </FieldRow>
        ) : null}
        <FieldRow label="New password" hint="At least 8 characters">
          <TextField type="password" autoComplete="new-password" value={next} onChange={setNext} label="New password" />
        </FieldRow>
        <Status msg={status?.msg} ok={status?.ok} />
        <div>
          <Button variant="primary" type="submit" disabled={busy || !next || (hasPassword && !current)}>
            {busy ? 'Saving…' : hasPassword ? 'Change password' : 'Set password'}
          </Button>
        </div>
      </form>
    </Panel>
  )
}

/* ── Recovery code (RecoverySection) ── */

type RecoveryState = { hasCode: boolean; setAt: string | null; lastUsedAt: string | null }

function RecoveryPanel({ hasPassword }: { hasPassword: boolean }) {
  const { token, toast, fail } = useApp()
  const [state, setState] = useState<RecoveryState | null>(null)
  const [password, setPassword] = useState('')
  const [code, setCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    acct<RecoveryState>(token, '/api/account/recovery')
      .then((s) => alive && setState(s))
      .catch((e) => alive && setStatus(fail(e)))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const generate = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const data = await acct<{ recoveryCode: string }>(token, '/api/account/recovery', { method: 'POST', body: { password } })
      setCode(data.recoveryCode)
      setPassword('')
      setState({ hasCode: true, setAt: new Date().toISOString(), lastUsedAt: null })
      toast('New code. The old one no longer works.')
    } catch (e) {
      setStatus(fail(e) || 'Could not generate a code.')
    } finally {
      setBusy(false)
    }
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast('Recovery code copied.')
    } catch {
      toast('Could not copy. Select the code and copy it by hand.')
    }
  }

  return (
    <Panel title="Recovery code">
      <p className="text-xs leading-relaxed text-muted-foreground">A one-time way back into your account if you lose your password.</p>

      {state?.lastUsedAt ? (
        <p className="kryo-radius border border-border px-3 py-2 text-xs text-foreground">
          Your code was used to recover this account on {state.lastUsedAt.slice(0, 10)}. If that was not you, change your password now and generate a new code.
        </p>
      ) : null}

      {code ? (
        <div className="kryo-radius border border-primary bg-primary/5 p-4">
          <Caption className="text-primary">Shown once</Caption>
          <p className="mt-2 break-all font-mono text-base font-bold tracking-[0.1em] text-foreground select-text">{code}</p>
          <div className="mt-3">
            <Button size="sm" onClick={() => void copy(code)}>
              Copy it
            </Button>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-destructive">Save it somewhere you will still have it. Nobody can show it to you again, including us.</p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {state === null
            ? status
              ? ''
              : 'Checking...'
            : state.hasCode
              ? `A code is set${state.setAt ? ` (since ${state.setAt.slice(0, 10)})` : ''}. Generating a new one replaces it.`
              : 'No code is set on this account yet.'}
        </p>
      )}

      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void generate()
        }}
      >
        {hasPassword ? (
          <FieldRow label="Your password" hint="Confirms it is you">
            <TextField type="password" autoComplete="current-password" value={password} onChange={setPassword} label="Your password" />
          </FieldRow>
        ) : null}
        <Status msg={status} />
        <div>
          <Button variant="primary" type="submit" disabled={busy || state === null || (hasPassword && !password)}>
            {busy ? 'Working…' : state?.hasCode ? 'Replace my code' : 'Generate a code'}
          </Button>
        </div>
      </form>
    </Panel>
  )
}

/* ── Sessions (components/auth/sessions-section.tsx) ── */

type SessionInfo = {
  id: string
  deviceName: string | null
  lastIp: string | null
  lastUserAgent: string | null
  createdAt: string
  lastActiveAt: string
  current: boolean
}

function SessionsPanel() {
  const { token, fail } = useApp()
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState<{ msg: string; ok: boolean } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await acct<{ sessions?: SessionInfo[] }>(token, '/api/auth/sessions')
      setSessions(data.sessions ?? [])
      setStatus(null)
    } catch (e) {
      setStatus({ msg: fail(e), ok: false })
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  /** Drop the rows at once; put them back if the server refuses. */
  const mutate = async (key: string, apply: (prev: SessionInfo[]) => SessionInfo[], path: string, success: string | null, error: string) => {
    const snapshot = sessions
    setBusy(key)
    setStatus(null)
    setSessions(apply)
    try {
      await acct(token, path, { method: 'DELETE' })
      if (success) setStatus({ msg: success, ok: true })
    } catch (e) {
      setSessions(snapshot)
      setStatus({ msg: fail(e) || error, ok: false })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Panel title="Devices">
      <p className="text-xs leading-relaxed text-muted-foreground">Revoke any signed-in browser or device you do not recognise.</p>
      {loading ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Busy className="size-3.5" /> Loading…
        </p>
      ) : (
        <ul className="kryo-radius divide-y divide-border overflow-hidden border border-border">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 p-3 text-xs">
              <div className="min-w-0">
                <p className="break-words text-foreground">
                  {s.deviceName || s.lastUserAgent || 'Unknown device'}
                  {s.current ? <span className="kryo-pill ml-2 bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">this device</span> : null}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {s.lastIp ?? 'unknown ip'} · active {new Date(s.lastActiveAt).toLocaleString()}
                </p>
              </div>
              {!s.current ? (
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busy !== null}
                  onClick={() => void mutate(s.id, (prev) => prev.filter((x) => x.id !== s.id), `/api/auth/sessions?id=${encodeURIComponent(s.id)}`, null, 'Could not revoke that session.')}
                >
                  {busy === s.id ? '…' : 'Revoke'}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {sessions.length > 1 ? (
        <div>
          <Button
            variant="danger"
            disabled={busy !== null}
            onClick={() => void mutate('others', (prev) => prev.filter((x) => x.current), '/api/auth/sessions?scope=others', 'Signed out of your other sessions.', 'Could not sign out other sessions.')}
          >
            {busy === 'others' ? '…' : 'Sign out everywhere else'}
          </Button>
        </div>
      ) : null}
      <Status msg={status?.msg} ok={status?.ok} />
    </Panel>
  )
}

/* ── Forge remote (components/auth/forge-remote-section.tsx) ── */

type Agent = { agentId: string; name: string; kind: string; version: string; platform: string; lastSeenAt: string; online: boolean }

/** The web's own relative time for "last seen". */
function ago(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 10) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function ForgeRemotePanel() {
  const { token, fail } = useApp()
  const [agents, setAgents] = useState<Agent[] | null>(null)
  const [hidden, setHidden] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await acct<{ agents?: Agent[] }>(token, '/api/forge/agents')
      setAgents(data.agents ?? [])
    } catch (e) {
      // A route that fails for this account (Forge agents off, 503) leaves the section out.
      fail(e)
      setHidden(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  const forget = async (agentId: string) => {
    setRemoving(agentId)
    setStatus(null)
    try {
      await acct(token, `/api/forge/agents/${encodeURIComponent(agentId)}`, { method: 'DELETE' })
      await load()
    } catch (e) {
      setStatus(fail(e))
    } finally {
      setRemoving(null)
    }
  }

  if (hidden || agents === null) return null

  return (
    <Panel title="Forge remote">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Kryoto Forge reports what it is building while it is open and signed in to this account, so you can watch a build from a phone. Nothing is reported when it is closed.
      </p>
      <LinkOut label="Open the remote" url={`${API}/remote?mode=forge`} />
      <Status msg={status} />
      {agents.length === 0 ? (
        <div className="kryo-radius border border-border bg-card px-3 py-3">
          <p className="text-xs font-bold text-foreground">No machines yet.</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Open Kryoto Forge on the machine you build on and sign in to this account. It appears here within a few seconds. Signing Forge in is a QR code now, so a machine you reach over SSH needs no password typed into it.
          </p>
        </div>
      ) : (
        <ul className="grid gap-2">
          {agents.map((a) => (
            <li key={a.agentId} className="kryo-radius flex items-center gap-3 border border-border bg-card px-3 py-2.5">
              <span className={`kryo-radius flex size-8 shrink-0 items-center justify-center border ${a.online ? 'border-primary/60 text-primary' : 'border-border text-muted-foreground'}`}>
                {a.kind === 'cli' ? <Terminal className="size-3.5" /> : <Monitor className="size-3.5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-foreground">{a.name}</p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {a.online ? 'online now' : `last seen ${ago(a.lastSeenAt)}`}
                  {a.version ? ` · Forge ${a.version}` : ''}
                  {a.platform ? ` · ${a.platform}` : ''}
                </p>
              </div>
              <IconButton label={`Forget ${a.name}`} disabled={removing === a.agentId} onClick={() => void forget(a.agentId)}>
                <Trash2 className="size-3.5" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      {agents.length > 0 ? (
        <p className="text-[10px] leading-relaxed text-muted-foreground">Forgetting a machine only removes it from this list. It comes back on its own the next time that copy of Forge runs.</p>
      ) : null}
    </Panel>
  )
}

/* ── Delete account (DangerSection) ── */

function DangerPanel({ hasPassword, hasEmail }: { hasPassword: boolean; hasEmail: boolean }) {
  const { token, toast, signOut, fail } = useApp()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const close = () => {
    if (busy) return
    setOpen(false)
    setPassword('')
    setConfirm('')
    setStatus(null)
  }

  const destroy = async () => {
    setBusy(true)
    setStatus(null)
    try {
      await acct(token, '/api/account/delete', { method: 'POST', body: { password, confirm } })
      toast('Your account is gone.')
      signOut()
    } catch (e) {
      setStatus(fail(e) || 'Could not delete the account.')
      setBusy(false)
    }
  }

  const ready = confirm.trim().toUpperCase() === 'DELETE' && (!hasPassword || password.length > 0)

  return (
    <Panel title="Delete account">
      <div className="kryo-radius flex gap-2.5 border border-destructive/40 bg-destructive/5 p-3 text-xs leading-relaxed text-foreground">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div className="grid gap-2">
          <p>
            This permanently removes your profile, library, notifications and sessions.{' '}
            {hasEmail ? 'There is no undo.' : 'There is no undo and no email on this account, so nobody can restore it for you.'}
          </p>
          <p className="text-muted-foreground">Requests and comments remain. This connection cannot create another account for 30 days.</p>
        </div>
      </div>
      <div>
        <Button variant="danger" onClick={() => setOpen(true)}>
          Delete my account
        </Button>
      </div>

      {open ? (
        <Modal
          title="Delete account"
          onClose={close}
          footer={
            <>
              <Button variant="ghost" disabled={busy} onClick={close}>
                Keep it
              </Button>
              <Button variant="danger" disabled={busy || !ready} onClick={() => void destroy()}>
                {busy ? <Busy className="size-3" /> : null}
                Delete my account
              </Button>
            </>
          }
        >
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (ready && !busy) void destroy()
            }}
          >
            {hasPassword ? (
              <FieldRow label="Your password">
                <TextField type="password" autoComplete="current-password" value={password} onChange={setPassword} label="Your password" />
              </FieldRow>
            ) : null}
            <FieldRow label="Type DELETE to confirm">
              <TextField value={confirm} onChange={setConfirm} placeholder="DELETE" label="Type DELETE to confirm" />
            </FieldRow>
            <Status msg={status} />
          </form>
        </Modal>
      ) : null}
    </Panel>
  )
}
