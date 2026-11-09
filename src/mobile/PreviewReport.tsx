import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Camera, Inbox, MessageSquarePlus, Paperclip, Send, Sparkles, TriangleAlert, X } from '@/ui/pixel-icons'
import { Button, IconButton, Label } from '@/ui'
import { EmojiButton, RichTextarea } from '@/rich/RichEditor'
import { RichText } from '@/rich/RichText'
import { isTauri } from '@/lib/bridge'
import { IS_PREVIEW_BUILD } from '@/lib/endpoint'
import { cn } from '@/lib/utils'
import { API } from '@/mobile/auth'
import { request } from '@/mobile/net'
import { Block, Note } from '@/mobile/parts'

/**
 * Report a bug / Suggest something in Kryoto Mobile Preview (kryo.to
 * docs/preview.md): a small button above the tab bar on every screen. It takes
 * a picture of the screen first (the app draws itself into an image, no
 * permission asked), then opens a short form. The version, the phone and the
 * screen go with it by themselves, and the form says so.
 */

type Kind = 'bug' | 'idea' | 'yours'
type Report = { id: string; kind: 'bug' | 'idea'; what: string; status: string; staffNote: string | null; rewardKryos: number; paid: boolean; createdAt: string }
const STATUS: Record<string, string> = { new: 'Waiting', accepted: 'Accepted', fixed: 'Fixed', duplicate: 'Already known', declined: 'Not taken' }
const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
const MAX = 8 * 1024 * 1024
/** A box of several lines takes the reader's box corners: the one-line field's pill would make it a capsule. */
const BOX = 'kryo-radius block w-full resize-none border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground'

async function screenshot(): Promise<Blob | null> {
  try {
    const { toBlob } = await import('html-to-image')
    const shot = toBlob(document.body, {
      width: window.innerWidth,
      height: window.innerHeight,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      backgroundColor: getComputedStyle(document.body).backgroundColor,
      filter: (n) => !(n instanceof HTMLElement && n.hasAttribute('data-screenshot-skip')),
      cacheBust: false,
    })
    return await Promise.race([shot, new Promise<null>((r) => setTimeout(() => r(null), 8000))])
  } catch {
    return null
  }
}

export function PreviewReportButton({ token, page, username }: { token: string | null; page: string; username: string | null }) {
  const [open, setOpen] = useState(false)
  const [taking, setTaking] = useState(false)
  const [shot, setShot] = useState<Blob | null>(null)
  if (!IS_PREVIEW_BUILD || !token || !username) return null
  return (
    <>
      <button
        type="button"
        data-screenshot-skip
        aria-label="Report a bug or suggest something"
        disabled={taking}
        onClick={async () => {
          setTaking(true)
          setShot(await screenshot())
          setTaking(false)
          setOpen(true)
        }}
        className="kryo-pill fixed bottom-[calc(var(--sab)+4.75rem)] right-4 z-40 flex h-9 items-center gap-1.5 border border-border bg-card px-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground shadow-lg"
      >
        <MessageSquarePlus className="size-3.5" />
        {taking ? 'Picture...' : 'Report'}
      </button>
      {open ? <Sheet token={token} page={page} username={username} shot={shot} dropShot={() => setShot(null)} onClose={() => setOpen(false)} /> : null}
    </>
  )
}

function Sheet({ token, page, username, shot, dropShot, onClose }: { token: string; page: string; username: string; shot: Blob | null; dropShot: () => void; onClose: () => void }) {
  const [kind, setKind] = useState<Kind>('bug')
  const [what, setWhat] = useState('')
  const [steps, setSteps] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const box = useRef<HTMLTextAreaElement>(null)
  const stepsBox = useRef<HTMLTextAreaElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const [shotUrl, setShotUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!shot) return setShotUrl(null)
    const u = URL.createObjectURL(shot)
    setShotUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [shot])

  /** One file up: kryo.to hands out an upload address, the phone puts the bytes there. */
  async function upload(blob: Blob, name: string): Promise<string> {
    if (blob.size > MAX) throw new Error(`${name} is larger than 8 MB.`)
    const { json } = await request<{ id: string; uploadUrl: string }>(`${API}/api/preview/reports/attachments`, { method: 'POST', token, body: { name, type: blob.type || 'image/png', size: blob.size } })
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const status = isTauri()
      ? await invoke<number>('net_upload', { url: json.uploadUrl, contentType: blob.type || 'image/png', body: Array.from(bytes) })
      : (await fetch(json.uploadUrl, { method: 'PUT', headers: { 'content-type': blob.type }, body: bytes })).status
    if (status < 200 || status >= 300) throw new Error(`Uploading ${name} failed (${status}).`)
    return json.id
  }

  async function send() {
    setError(null)
    if (!what.trim()) return setError(kind === 'bug' ? 'Say what happened.' : 'Say what you would like.')
    setBusy(true)
    try {
      const ids: string[] = []
      if (shot) ids.push(await upload(new Blob([shot], { type: 'image/png' }), 'screenshot.png'))
      for (const f of files) ids.push(await upload(f, f.name))
      await request(`${API}/api/preview/reports`, {
        method: 'POST',
        token,
        timeoutMs: 30_000,
        body: {
          kind,
          what,
          steps: kind === 'bug' ? steps : '',
          attachments: ids,
          context: { app: 'mobile', version: __APP_VERSION__, os: 'Android', page, viewport: `${window.innerWidth}x${window.innerHeight}`, userAgent: navigator.userAgent },
        },
      })
      setSent(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send it.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div data-screenshot-skip className="kryo-fade absolute inset-0 z-[70] overflow-y-auto overscroll-contain bg-background pb-[calc(var(--sab)+1.5rem)] pt-[var(--sat)]">
      <header className="flex h-14 items-center gap-3 px-4">
        <div role="tablist" className="kryo-pill flex grow-0 items-center gap-1 border border-border p-0.5">
          {(['bug', 'idea', 'yours'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              className={cn('kryo-pill flex h-8 items-center gap-1.5 px-3 text-[11px] uppercase tracking-wider', kind === k ? 'bg-primary font-bold text-primary-foreground' : 'text-muted-foreground')}
            >
              {k === 'bug' ? <TriangleAlert className="size-3.5" /> : k === 'idea' ? <Sparkles className="size-3.5" /> : <Inbox className="size-3.5" />}
              {k === 'bug' ? 'Bug' : k === 'idea' ? 'Idea' : 'Yours'}
            </button>
          ))}
        </div>
        <span className="grow" />
        <IconButton label="Close" onClick={onClose}>
          <X className="size-4" />
        </IconButton>
      </header>
      <div className="mx-auto grid w-full max-w-sm gap-4 px-5 pt-2">
        {kind === 'yours' ? (
          <Yours token={token} />
        ) : sent ? (
          <Block className="justify-items-center text-center">
            <Send className="size-5 text-muted-foreground" />
            <p className="text-sm font-bold text-foreground">Sent. Thank you.</p>
            <Note>Staff read every one. You will hear when they decide, and an accepted one can earn Kryos.</Note>
            <Button onClick={() => setKind('yours')}>See it under Yours</Button>
          </Block>
        ) : (
          <>
            <div className="grid gap-1.5">
              <Label>{kind === 'bug' ? 'What happened?' : 'What would you like?'}</Label>
              <div className="relative">
                <RichTextarea ref={box} aria-label="What happened" rows={4} maxLength={4000} className={BOX} value={what} onValueChange={setWhat} />
                <EmojiButton target={box} value={what} onValueChange={setWhat} className="absolute bottom-1.5 right-1.5" />
              </div>
            </div>
            {kind === 'bug' ? (
              <div className="grid gap-1.5">
                <Label>Steps to see it (if you know them)</Label>
                <div className="relative">
                  <RichTextarea ref={stepsBox} aria-label="Steps to see it" rows={3} maxLength={4000} className={BOX} value={steps} onValueChange={setSteps} />
                  <EmojiButton target={stepsBox} value={steps} onValueChange={setSteps} className="absolute bottom-1.5 right-1.5" />
                </div>
              </div>
            ) : null}
            <div className="grid gap-1.5">
              <Label>Picture</Label>
              {shotUrl ? (
                <div className="kryo-radius relative overflow-hidden border border-border">
                  <img src={shotUrl} alt="The screen when you pressed Report" className="block max-h-56 w-full object-cover object-top" />
                  <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-background/85 px-2 py-1 text-[11px] text-muted-foreground">
                    <span className="flex-1">Taken when you pressed Report</span>
                    <button type="button" onClick={dropShot} aria-label="Leave the picture out">
                      <X className="size-3" />
                    </button>
                  </div>
                </div>
              ) : (
                <Note className="flex items-center gap-1.5">
                  <Camera className="size-3.5" /> No picture. Add one of your own below if it helps.
                </Note>
              )}
            </div>
            <div className="grid gap-1.5">
              <div className="flex items-center gap-2">
                <Label>Files</Label>
                <Button size="sm" onClick={() => picker.current?.click()} disabled={files.length >= 4}>
                  <Paperclip className="size-3.5" /> Add
                </Button>
                <input ref={picker} type="file" multiple hidden accept={TYPES.join(',')} onChange={(e) => {
                  const picked = [...(e.target.files ?? [])].filter((f) => TYPES.includes(f.type))
                  setFiles((x) => [...x, ...picked].slice(0, 4))
                  e.target.value = ''
                }} />
              </div>
              {files.map((f, i) => (
                <p key={`${f.name}-${i}`} className="flex items-center gap-2 text-xs text-foreground">
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <button type="button" onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}>
                    <X className="size-3" />
                  </button>
                </p>
              ))}
            </div>
            <Note>Sent with it, so nobody has to ask: the screen you were on ({page}), Kryoto Mobile Preview {__APP_VERSION__}, your phone and your account ({username}).</Note>
            {error ? <p className="text-xs text-destructive" role="alert">{error}</p> : null}
            <Button variant="primary" size="lg" disabled={busy} onClick={() => void send()}>
              <Send className="size-3.5" /> {busy ? 'Sending...' : kind === 'bug' ? 'Send the report' : 'Send the suggestion'}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

function Yours({ token }: { token: string }) {
  const [reports, setReports] = useState<Report[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    request<{ reports: Report[] }>(`${API}/api/preview/reports`, { token })
      .then((r) => setReports(r.json.reports))
      .catch(() => setFailed(true))
  }, [token])
  if (failed) return <Note className="text-destructive">Could not load them. Try again in a moment.</Note>
  if (!reports) return <Note>Loading...</Note>
  if (!reports.length) return <Note>Nothing sent yet. What you send shows up here with what staff decided.</Note>
  return (
    <ul className="grid gap-3">
      {reports.map((r) => (
        <li key={r.id} className="kryo-radius grid gap-1.5 border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            {r.kind === 'bug' ? <TriangleAlert className="size-3.5" /> : <Sparkles className="size-3.5" />}
            <span>{new Date(r.createdAt).toLocaleDateString()}</span>
            <span className="grow" />
            {r.paid && r.rewardKryos > 0 ? <span className="font-bold text-foreground">+{r.rewardKryos} Kryos</span> : null}
            <span className="kryo-pill border border-border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">{STATUS[r.status] ?? r.status}</span>
          </div>
          <RichText text={r.what} className="line-clamp-3 text-sm text-foreground" />
          {r.staffNote ? (
            <div className="border-l-2 border-primary bg-secondary/40 px-2.5 py-1.5 text-xs">
              <span className="mr-1 text-[10px] uppercase tracking-wider text-muted-foreground">Staff</span>
              <RichText text={r.staffNote} className="text-foreground" />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
