import { useCallback, useEffect, useState } from 'react'
import { Button, Caption } from '@/ui'
import { cn } from '@/lib/utils'
import { API } from '@/mobile/auth'
import { ApiError } from '@/mobile/net'
import { useApp } from '@/mobile/context'
import { Busy, Chip, Notice, PageHeader, Strip } from '@/mobile/parts'
import { LinkOut, Panel, Status } from '@/mobile/account/forms'
import { TEXT_EFFECT_LABEL, loadPerks, setNameEffect, type PerkRow, type PerksView } from '@/mobile/account/perks-api'

type State = { kind: 'loading' } | { kind: 'ready'; view: PerksView } | { kind: 'missing' } | { kind: 'error'; message: string }

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const usd = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`
const effectLabel = (id: string) => TEXT_EFFECT_LABEL[id] ?? id

function badge(p: PerkRow): { text: string; on: boolean } {
  if (p.held && p.fromRank) return { text: 'From rank', on: true }
  if (p.held && p.boughtUntil) return { text: `Until ${day(p.boughtUntil)}`, on: true }
  if (p.held) return { text: 'Held', on: true }
  return { text: `Locked, ${p.tierName}`, on: false }
}

export function Perks() {
  const { token, back, reloadMe, fail } = useApp()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [effect, setEffect] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [pickStatus, setPickStatus] = useState<{ msg: string; ok: boolean } | null>(null)

  const load = useCallback(() => {
    if (!token) return
    setState({ kind: 'loading' })
    loadPerks(token)
      .then((view) => {
        setEffect(view.nameEffect)
        setState({ kind: 'ready', view })
      })
      .catch((e) => {
        if (e instanceof ApiError && (e.status === 404 || e.status === 405)) setState({ kind: 'missing' })
        else setState({ kind: 'error', message: fail(e) })
      })
  }, [token, fail])

  useEffect(load, [load])

  const pick = async (next: string | null) => {
    if (!token || picking || next === effect) return
    setPicking(true)
    setPickStatus(null)
    try {
      const out = await setNameEffect(token, next)
      setEffect(out.effect)
      setPickStatus({ msg: out.effect ? `Your name now uses ${effectLabel(out.effect)}.` : 'Name effect removed.', ok: true })
      await reloadMe()
    } catch (e) {
      setPickStatus({ msg: fail(e), ok: false })
    } finally {
      setPicking(false)
    }
  }

  const perksUrl = `${API}/perks`
  const header = <PageHeader title="Perks" onBack={back} />

  if (!token) return <>{header}<Notice title="Sign in first" body="Your perks belong to your Kryoto account." /></>
  if (state.kind === 'loading') return <>{header}<Busy label="Loading your perks" /></>
  if (state.kind === 'missing') {
    return (
      <>
        {header}
        <Notice title="Perks aren't available in the app yet" body="Open them on kryo.to for now.">
          <LinkOut label="Open perks on kryo.to" url={perksUrl} />
        </Notice>
      </>
    )
  }
  if (state.kind === 'error') return <>{header}<Notice title="Could not load your perks" body={state.message} retry={load} /></>

  const { view } = state
  const tierName = view.perks.find((p) => p.tier === view.tier)?.tierName ?? view.tier
  const trialsOn = view.trials.allowance > 0

  return (
    <>
      {header}
      <div className="grid gap-4 px-4 pb-8 pt-4">
        <section className="kryo-radius grid gap-1 border border-border bg-card p-4">
          <Caption>Supporter rank</Caption>
          <p className="text-lg font-bold text-foreground">{tierName ?? 'No rank yet'}</p>
          <p className="text-xs text-muted-foreground">
            {usd(view.totalUsd)} given so far
            {view.expiresAt ? `. Rank runs until ${day(view.expiresAt)}` : ''}
          </p>
          {view.next ? (
            <p className="text-xs text-muted-foreground">
              Next rank: {view.next.name} at {usd(view.next.at)}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">You are at the top rank.</p>
          )}
        </section>

        <div className="grid grid-cols-2 gap-3">
          <div className="kryo-radius grid gap-1 border border-border bg-card p-4">
            <Caption>Kryos</Caption>
            <p className="text-lg font-bold text-foreground">{view.kryos.toLocaleString()}</p>
          </div>
          <div className="kryo-radius grid gap-1 border border-border bg-card p-4">
            <Caption>Reputation</Caption>
            <p className="text-lg font-bold text-foreground">{view.rep.toLocaleString()}</p>
          </div>
        </div>
        <LinkOut label="Kryos shop" url={perksUrl} />

        <Panel title="Your perks">
          <ul className="grid gap-2">
            {view.perks.map((p) => {
              const b = badge(p)
              return (
                <li key={p.id} className="kryo-radius grid gap-1 border border-border bg-card px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-foreground">{p.label}</span>
                    <span className={cn('kryo-pill shrink-0 border px-2 py-0.5 text-[10px] font-bold uppercase', b.on ? 'border-success text-success' : 'border-border text-muted-foreground')}>
                      {b.text}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">{p.text}</p>
                </li>
              )
            })}
          </ul>
        </Panel>

        <Panel title="Name effect">
          {view.effects.length ? (
            <>
              <Caption>Dresses your name across kryo.to.</Caption>
              <Strip>
                <Chip active={effect === null} onClick={() => void pick(null)}>None</Chip>
                {view.effects.map((id) => (
                  <Chip key={id} active={effect === id} onClick={() => void pick(id)}>
                    {effectLabel(id)}
                  </Chip>
                ))}
              </Strip>
              {picking ? <Caption>Saving…</Caption> : null}
              <Status msg={pickStatus?.msg} ok={pickStatus?.ok} />
            </>
          ) : (
            <Caption>Name effects are a supporter perk. Pick one once your rank includes it.</Caption>
          )}
        </Panel>

        <Panel title="Delivery trials">
          {trialsOn ? (
            <p className="text-xs text-foreground">
              {view.trials.used} / {view.trials.allowance} used this week
              {view.trials.nextBackAt ? `, next one back at ${day(view.trials.nextBackAt)}` : ''}
              {view.trials.live ? '. One is running on a request now.' : ''}
            </p>
          ) : (
            <Caption>Your rank has no weekly delivery trials.</Caption>
          )}
          <LinkOut label="Delivery trials" url={perksUrl} />
        </Panel>

        <Panel title="More on kryo.to">
          <LinkOut label="Sponsor priority" url={perksUrl} />
          <Button variant="ghost" onClick={load}>Refresh</Button>
        </Panel>
      </div>
    </>
  )
}
