import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check as CheckIcon, Heart, Trophy, Upload, X } from 'lucide-react'
import { Busy, Button, Caption, Check, Dropdown, IconButton, Segmented } from '@/ui'
import { API, type Me } from '@/mobile/auth'
import { useApp } from '@/mobile/context'
import { acct } from '@/mobile/account/api'
import { uploadImage } from '@/mobile/account/media'
import { FieldRow, LinkOut, Panel, Status, TextArea, TextField } from '@/mobile/account/forms'

/** The Support tab: donation claims and the donor board, and the achievements saved to the account. */
export function SupportTab() {
  const { token, me } = useApp()
  if (!token || !me) return null
  return (
    <div className="grid gap-5">
      <DonationsPanel me={me} />
      <AchievementsPanel />
    </div>
  )
}

/* ── Donations (components/auth/settings-client.tsx DonationSection + components/donation-claim-form.tsx) ── */

// lib/donations.ts
const DONATION_CHAINS = ['monero', 'bitcoin', 'litecoin', 'ethereum', 'other'] as const
type DonationChain = (typeof DONATION_CHAINS)[number]
const DONATION_CHAIN_LABEL: Record<DonationChain, string> = {
  monero: 'Monero',
  bitcoin: 'Bitcoin',
  litecoin: 'Litecoin',
  ethereum: 'Ethereum',
  other: 'Something else',
}
type DonationMethod = 'crypto' | 'kofi'

type DonationClaim = {
  id: string
  method: DonationMethod
  chain: string | null
  reference: string | null
  amountText: string | null
  amountUsd: number | null
  proofUrl: string | null
  message: string | null
  status: 'pending' | 'approved' | 'rejected'
  reviewNote: string | null
  createdAt: string
  leaderboardOptOut: boolean
  showAmount: boolean
}

type DonationsData = { claims?: DonationClaim[] }

// lib/community-links.ts
const DISCORD_INVITE_URL = 'https://discord.gg/Q2S8hRzrep'

/** lib/snowflake.ts formatKryoId */
const formatKryoId = (id: string) => id.replace(/\B(?=(\d{4})+(?!\d))/g, ' ')

const MAX_PROOF_BYTES = 8 * 1024 * 1024

function DonationsPanel({ me }: { me: Me & { discordName?: string | null } }) {
  const { token, toast, fail } = useApp()
  const [claims, setClaims] = useState<DonationClaim[]>([])
  const [optOut, setOptOut] = useState(false)
  const [showAmount, setShowAmount] = useState(false)
  const [prefBusy, setPrefBusy] = useState(false)
  const [prefStatus, setPrefStatus] = useState<string | null>(null)

  const applyApproved = (list: DonationClaim[]) => {
    const approved = list.find((c) => c.status === 'approved')
    if (approved) {
      setOptOut(approved.leaderboardOptOut)
      setShowAmount(approved.showAmount)
    }
  }

  useEffect(() => {
    let alive = true
    acct<DonationsData>(token, '/api/account/donations')
      .then((data) => {
        if (!alive) return
        const list = data.claims ?? []
        setClaims(list)
        applyApproved(list)
      })
      .catch((e) => alive && fail(e))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const hasApproved = claims.some((c) => c.status === 'approved')

  const updatePreferences = async (nextOptOut: boolean, nextShow: boolean) => {
    const before = { optOut, showAmount }
    setPrefBusy(true)
    setPrefStatus(null)
    setOptOut(nextOptOut)
    setShowAmount(nextShow)
    try {
      await acct(token, '/api/account/donations', { method: 'PATCH', body: { leaderboardOptOut: nextOptOut, showAmount: nextShow } })
      toast('Leaderboard preferences updated.')
    } catch (e) {
      setOptOut(before.optOut)
      setShowAmount(before.showAmount)
      setPrefStatus(fail(e) || 'Could not update preferences.')
    } finally {
      setPrefBusy(false)
    }
  }

  return (
    <Panel title="Donations">
      <div className="kryo-radius flex items-center gap-3 border border-primary/40 bg-primary/5 p-3">
        <Heart className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="text-xs leading-relaxed text-muted-foreground">
          <span className="font-bold text-foreground">Your perks</span>: what your rank unlocks, where each is set, and the Sponsor priority queue.
        </span>
      </div>
      <LinkOut label="Open your perks on kryo.to" url={`${API}/perks`} />

      <p className="text-xs leading-relaxed text-muted-foreground">
        Claim a crypto or Ko-fi donation for K// ID <span className="text-foreground">{me.id ? formatKryoId(me.id) : me.username}</span> with a reference or screenshot.
      </p>

      <ClaimForm
        credited={hasApproved ? { leaderboardOptOut: optOut, showAmount } : null}
        onSent={(claim) => {
          setClaims((prev) => [claim, ...prev])
          if (claim.status === 'approved') applyApproved([claim])
        }}
      />

      {hasApproved || me.isSupporter ? <DiscordRole linked={me.discordName ?? null} /> : null}

      {hasApproved ? (
        <div className="kryo-radius grid gap-3 border border-border bg-card p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-foreground">Leaderboard visibility</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Your contribution stays on the board. Turn off your name to appear as Anonymous; hidden amounts display as Hidden amount.
          </p>
          <Check checked={!optOut} disabled={prefBusy} onChange={(on) => void updatePreferences(!on, showAmount)} label="Show my name on the public donor leaderboard" />
          <Check checked={showAmount} disabled={optOut || prefBusy} onChange={(on) => void updatePreferences(optOut, on)} label={<span className="text-muted-foreground">Display total contributed amount</span>} />
          <Status msg={prefStatus} />
        </div>
      ) : null}

      {claims.length > 0 ? (
        <div className="grid gap-3 border-t border-border pt-4">
          <p className="text-xs font-bold uppercase tracking-wider text-foreground">Your claims</p>
          <div className="grid gap-2.5">
            {claims.map((c) => (
              <ClaimRow key={c.id} claim={c} />
            ))}
          </div>
        </div>
      ) : null}
    </Panel>
  )
}

function ClaimRow({ claim: c }: { claim: DonationClaim }) {
  const date = new Date(c.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  if (c.status === 'approved') {
    return (
      <div className="kryo-radius border border-border bg-secondary/30 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <CheckIcon className="size-4 text-primary" />
            Donation confirmed
          </div>
          <Caption>{date}</Caption>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Method: <strong className="text-foreground">{c.method === 'kofi' ? 'Ko-fi' : c.chain ? (DONATION_CHAIN_LABEL[c.chain as DonationChain] ?? c.chain) : 'Crypto'}</strong>
          {c.amountUsd != null ? (
            <>
              {' · Credited: '}
              <strong className="font-mono text-foreground">${c.amountUsd.toFixed(2)}</strong>
            </>
          ) : null}
        </p>
      </div>
    )
  }
  if (c.status === 'rejected') {
    return (
      <div className="kryo-radius border border-destructive/40 bg-destructive/5 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-destructive">
            <AlertTriangle className="size-4" />
            Claim turned down
          </div>
          <Caption>{date}</Caption>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-destructive/90">{c.reviewNote || 'The submitted details could not be verified.'}</p>
      </div>
    )
  }
  return (
    <div className="kryo-radius border border-border bg-card p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Busy className="size-3.5 text-primary" />
          Waiting for staff review
        </div>
        <Caption>{date}</Caption>
      </div>
      <p className="mt-1 break-all text-xs text-muted-foreground">
        {c.method === 'kofi' ? 'Ko-fi claim' : `Crypto (${c.chain || 'coin'})`} {c.amountText ? `· ${c.amountText}` : ''}
        {c.reference ? ` · ${c.reference}` : ''}
      </p>
    </div>
  )
}

/** components/discord-role-claim.tsx, as rows: Discord has to be linked in the browser. */
function DiscordRole({ linked }: { linked: string | null }) {
  return (
    <div className={`kryo-radius grid gap-3 border p-4 ${linked ? 'border-border bg-card' : 'border-primary/60 bg-primary/5'}`}>
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-foreground">{linked ? 'Discord role' : 'Your supporter role is waiting'}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {linked ? `Linked to ${linked}. Join the Kryoto Discord and it shows up by itself.` : 'Link your Discord and join the server to get it.'}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">The role arrives as you join, or within a few minutes if you are already there. It stays as long as your supporter rank does.</p>
      </div>
      {linked ? null : <LinkOut label="Link Discord" url={`${API}/api/auth/discord?next=${encodeURIComponent('/settings#donations')}`} />}
      <LinkOut label="Join the server" url={DISCORD_INVITE_URL} />
    </div>
  )
}

function ClaimForm({ credited, onSent }: { credited: { leaderboardOptOut: boolean; showAmount: boolean } | null; onSent: (claim: DonationClaim) => void }) {
  const { token, toast, fail } = useApp()
  const [method, setMethod] = useState<DonationMethod>('crypto')
  const [chain, setChain] = useState<DonationChain>('monero')
  const [reference, setReference] = useState('')
  const [amountText, setAmountText] = useState('')
  const [proofUrl, setProofUrl] = useState('')
  const [pasteLink, setPasteLink] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [optOut, setOptOut] = useState(false)
  const [showAmount, setShowAmount] = useState(false)
  const [status, setStatus] = useState<{ msg: string; ok: boolean } | null>(null)
  const file = useRef<HTMLInputElement>(null)

  const upload = async (picked: File) => {
    if (!token) return
    if (picked.size > MAX_PROOF_BYTES) {
      setStatus({ msg: 'Screenshot must be under 8MB.', ok: false })
      return
    }
    setUploading(true)
    setStatus(null)
    try {
      setProofUrl(await uploadImage(token, picked, 'donation_proof', false))
    } catch (e) {
      setStatus({ msg: fail(e) || 'Could not upload the screenshot.', ok: false })
    } finally {
      setUploading(false)
    }
  }

  const clearProof = () => {
    setProofUrl('')
    if (file.current) file.current.value = ''
  }

  const submit = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const data = await acct<{ claim?: DonationClaim }>(token, '/api/account/donations', {
        method: 'POST',
        body: {
          method,
          chain: method === 'crypto' ? chain : undefined,
          reference,
          amountText,
          proofUrl,
          message,
          leaderboardOptOut: credited ? credited.leaderboardOptOut : optOut,
          showAmount: credited ? credited.showAmount : showAmount,
        },
      })
      if (!data.claim) {
        setStatus({ msg: 'Could not send that.', ok: false })
        return
      }
      setReference('')
      clearProof()
      setMessage('')
      const note = data.claim.status === 'approved' ? 'Found it. It is on your account now.' : 'Sent. Staff check it, usually within a day, and you get a notification.'
      setStatus({ msg: note, ok: true })
      toast(note)
      onSent(data.claim)
    } catch (e) {
      setStatus({ msg: fail(e) || 'Could not send that.', ok: false })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!busy && !uploading) void submit()
      }}
    >
      <Segmented<DonationMethod>
        label="How you paid"
        value={method}
        onChange={setMethod}
        options={[
          { value: 'crypto', label: 'Crypto' },
          { value: 'kofi', label: 'Ko-fi' },
        ]}
      />

      {method === 'crypto' ? (
        <>
          <FieldRow label="Coin">
            <Dropdown<DonationChain> value={chain} label="Coin" className="w-full" options={DONATION_CHAINS.map((c) => ({ value: c, label: DONATION_CHAIN_LABEL[c] }))} onChange={setChain} />
          </FieldRow>
          <FieldRow label="Transaction ID" hint="What your wallet shows">
            <TextField value={reference} onChange={setReference} placeholder="tx hash" label="Transaction ID" />
          </FieldRow>
        </>
      ) : (
        <FieldRow label="Ko-fi transaction ID" hint="From the receipt Ko-fi emailed you">
          <TextField value={reference} onChange={setReference} placeholder="Transaction ID, or the email you paid with" label="Ko-fi transaction ID" />
        </FieldRow>
      )}

      <FieldRow label="Amount" hint="What you sent">
        <TextField value={amountText} onChange={setAmountText} placeholder={method === 'kofi' ? '$10' : '$10 in XMR'} label="Amount" />
      </FieldRow>

      <FieldRow label="Proof" hint={method === 'crypto' ? 'A screenshot of the sent transaction' : 'Optional with a transaction ID'}>
        <input
          ref={file}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/avif"
          className="hidden"
          onChange={(e) => {
            const picked = e.target.files?.[0]
            if (picked) void upload(picked)
          }}
        />
        {pasteLink ? (
          <TextField value={proofUrl} onChange={setProofUrl} placeholder="https://..." type="url" inputMode="url" label="Link to your proof" />
        ) : proofUrl ? (
          <div className="kryo-radius flex items-center gap-3 border border-border bg-card p-2">
            <img src={proofUrl} alt="Your proof" className="kryo-radius size-12 border border-border object-cover" />
            <span className="min-w-0 grow truncate text-xs text-foreground">Screenshot attached</span>
            <IconButton label="Remove the screenshot" onClick={clearProof}>
              <X aria-hidden className="size-4" />
            </IconButton>
          </div>
        ) : (
          <button
            type="button"
            disabled={uploading}
            onClick={() => file.current?.click()}
            className="kryo-radius flex w-full items-center justify-center gap-2 border border-dashed border-border bg-secondary/20 p-4 text-xs text-muted-foreground"
          >
            {uploading ? <Busy className="size-4" /> : <Upload aria-hidden className="size-4" />}
            {uploading ? 'Uploading' : 'Upload a screenshot'}
          </button>
        )}
        <button type="button" onClick={() => setPasteLink((v) => !v)} className="w-fit text-[11px] text-muted-foreground underline underline-offset-2">
          {pasteLink ? 'Upload an image instead' : 'Paste a link instead'}
        </button>
      </FieldRow>

      <FieldRow label="Anything else" hint="Optional">
        <TextArea rows={2} value={message} onChange={setMessage} placeholder="A note for staff" />
      </FieldRow>

      {credited ? null : (
        <div className="grid gap-3">
          <Check checked={!optOut} onChange={(on) => setOptOut(!on)} label="Show my name on the donor leaderboard" />
          <Check checked={showAmount} disabled={optOut} onChange={setShowAmount} label={<span className="text-muted-foreground">Show the amount too</span>} />
        </div>
      )}

      <Status msg={status?.msg} ok={status?.ok} />
      <div>
        <Button variant="primary" type="submit" disabled={busy || uploading}>
          {busy ? <Busy className="size-3.5" /> : null}
          Send claim
        </Button>
      </div>
    </form>
  )
}

/* ── Achievements (components/auth/cloud-achievements-section.tsx) ── */

type SavedGame = { appid: string; slug: string | null; title: string; count: number; lastUnlockedAt: number | null; savedAt: number }

function AchievementsPanel() {
  const { token, push, fail } = useApp()
  const [games, setGames] = useState<SavedGame[]>([])
  const [perk, setPerk] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmAll, setConfirmAll] = useState(false)
  const [status, setStatus] = useState<{ msg: string; ok: boolean } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await acct<{ perk: boolean; games?: SavedGame[] }>(token, '/api/achievements/cloud')
      setPerk(data.perk)
      setGames(data.games ?? [])
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

  /** Remove at once; put the rows back if the server refuses. `null` removes every game's. */
  const remove = async (appid: string | null) => {
    const snapshot = games
    setBusy(appid ?? 'all')
    setConfirmAll(false)
    setStatus(null)
    setGames((prev) => (appid === null ? [] : prev.filter((g) => g.appid !== appid)))
    try {
      await acct(token, '/api/achievements/cloud', { method: 'DELETE', body: appid === null ? { all: true } : { appid } })
      setStatus({ msg: appid === null ? 'Removed every saved achievement.' : 'Removed.', ok: true })
    } catch (e) {
      setGames(snapshot)
      setStatus({ msg: fail(e) || 'Could not remove them.', ok: false })
    } finally {
      setBusy(null)
    }
  }

  const total = games.reduce((n, g) => n + g.count, 0)

  return (
    <Panel title="Achievements">
      <p className="text-xs leading-relaxed text-muted-foreground">
        {perk === false
          ? 'Supporters keep every achievement they unlock in Kryoto Desktop on their account, and get them back on any PC they sign in on.'
          : 'Kryoto Desktop saves each achievement here as you unlock it, and puts them back when you play on another PC. Removing a game here does not touch the achievements on your PCs.'}
      </p>
      {perk === false ? <LinkOut label="Become a supporter" url={`${API}/perks`} /> : null}

      {loading ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Busy className="size-3.5" /> Loading…
        </p>
      ) : games.length ? (
        <>
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-muted-foreground">
              {total} achievement{total === 1 ? '' : 's'} in {games.length} game{games.length === 1 ? '' : 's'}
            </span>
            <Button variant="danger" size="sm" disabled={busy !== null} onClick={() => (confirmAll ? void remove(null) : setConfirmAll(true))} onBlur={() => setConfirmAll(false)}>
              {busy === 'all' ? '…' : confirmAll ? 'Press again to remove all' : 'Remove all'}
            </Button>
          </div>
          <ul className="kryo-radius divide-y divide-border overflow-hidden border border-border">
            {games.map((g) => (
              <li key={g.appid} className="flex items-center justify-between gap-3 p-3 text-xs">
                <div className="flex min-w-0 items-center gap-3">
                  <Trophy className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0">
                    {g.slug ? (
                      <button type="button" onClick={() => push({ kind: 'game', slug: g.slug as string })} className="text-left text-foreground underline-offset-2 hover:underline">
                        {g.title}
                      </button>
                    ) : (
                      <p className="text-foreground">{g.title}</p>
                    )}
                    <p className="mt-1 text-muted-foreground">
                      {g.count} saved
                      {g.lastUnlockedAt ? ` · last unlocked ${new Date(g.lastUnlockedAt * 1000).toLocaleDateString()}` : ''}
                    </p>
                  </div>
                </div>
                <Button size="sm" variant="danger" disabled={busy !== null} aria-label={`Remove ${g.title}'s saved achievements`} onClick={() => void remove(g.appid)}>
                  {busy === g.appid ? '…' : 'Remove'}
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : perk ? (
        <p className="text-xs text-muted-foreground">Nothing saved yet. Play a game with achievements in Kryoto Desktop and they show up here.</p>
      ) : null}
      <Status msg={status?.msg} ok={status?.ok} />
    </Panel>
  )
}
