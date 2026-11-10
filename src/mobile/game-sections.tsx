import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Avatar, ProfileLink, TeamName } from '@/mobile/identity'
import { AsciiBar, Button, Caption, Tag } from '@/ui'
import { cn } from '@/lib/utils'
import { comments as loadComments, mentionPeople, playedSeconds, postComment, saveWriteup, setHelpful, tested as loadTested, writeups as loadWriteups, type Comment, type GameFull, type RecommendShare, type Tested } from '@/mobile/catalog'
import { useApp } from '@/mobile/context'
import { API, openExternal, siteUrl } from '@/mobile/auth'
import { ago, requirementLines, reviewVerdict } from '@/mobile/format'
import { Block, Busy, Chip, Note, Notice } from '@/mobile/parts'
import { RichText } from '@/rich/RichText'
import { plainRich } from '@/rich/rich-text'
import { editableText } from '@/rich/mentions'
import { EmojiButton, RichTextarea } from '@/rich/RichEditor'
import { Attachments } from '@/mobile/attachments'
import { StaffMentionTags, StaffTag } from '@/mobile/staff-tag'
import { CircleCheck, CircleX, Flame, Reply } from '@/ui/pixel-icons'
import { request } from '@/mobile/net'
import { emojiPath, isMascotEmoji } from '@/rich/rich-catalog'
import { useAssetBase } from '@/rich/asset-base'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-2 text-xs last:border-b-0">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right font-bold text-foreground">{children}</span>
    </div>
  )
}

/** The blurb: the first few paragraphs, the rest behind "Read more". */
export function Description({ game }: { game: GameFull }) {
  const [more, setMore] = useState(false)
  const paragraphs = (game.description?.length ? game.description : game.short ? [game.short] : []).filter((p) => p.trim())
  if (!paragraphs.length) return null
  const shown = more ? paragraphs : paragraphs.slice(0, 3)
  return (
    <Block title="Description">
      <div className="grid gap-2.5">
        {shown.map((p, i) => (
          <Note key={i}>{p}</Note>
        ))}
      </div>
      {paragraphs.length > 3 ? (
        <Button size="sm" onClick={() => setMore(!more)}>
          {more ? 'Show less' : 'Read more'}
        </Button>
      ) : null}
    </Block>
  )
}

/** Steam's reviews for the game, and kryo.to's own rating. */
export function Reviews({ game }: { game: GameFull }) {
  const positive = game.steam_positive ?? 0
  const total = positive + (game.steam_negative ?? 0)
  const percent = total > 0 ? Math.round((positive / total) * 100) : (game.rating ?? 0)
  if (!total && !game.rating) return null
  return (
    <Block title="Reviews">
      <div className="grid gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-bold text-foreground">{reviewVerdict(percent)}</span>
          <span className="text-xs text-foreground">{percent}%</span>
        </div>
        <AsciiBar fraction={percent / 100} cells={24} showPct={false} className="text-foreground/80" />
        <Caption>{total > 0 ? `${total.toLocaleString()} Steam reviews, ${positive.toLocaleString()} positive` : 'Rating from kryo.to'}</Caption>
      </div>
    </Block>
  )
}

const OUTCOME_LABEL: Record<string, string> = { works: 'Works', setup: 'Works with setup', partial: 'Partly works', broken: 'Does not work' }

/** What testers found: the verdict, then each report. */
export function TestedBlock({ game }: { game: GameFull }) {
  const [report, setReport] = useState<Tested | null | undefined>(undefined)
  useEffect(() => {
    let current = true
    void loadTested(game.slug).then((t) => current && setReport(t))
    return () => {
      current = false
    }
  }, [game.slug])
  return (
    <Block title="Tested">
      <Note>
        {report?.headline ||
          (game.verification === 'verified'
            ? 'Somebody ran this build and it works.'
            : game.verification === 'broken'
              ? 'A tester could not get this build to run.'
              : 'Nobody has confirmed this build runs yet.')}
      </Note>
      {report?.reports.length ? (
        <ul className="grid gap-2">
          {report.reports.slice(0, 5).map((r) => (
            <li key={r.id} className="grid gap-0.5 border-t border-border pt-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-foreground">{OUTCOME_LABEL[r.outcome] ?? r.outcome}</span>
                <Caption>{ago(r.testedAt)}</Caption>
              </div>
              <Caption>
                <ProfileLink username={r.tester.username} className="text-foreground"><TeamName username={r.tester.username}>{r.tester.name}</TeamName></ProfileLink>
                {[r.platform, r.version, r.current ? 'current build' : null].filter(Boolean).map((x) => ` - ${x}`)}
              </Caption>
              {r.notes ? <Note className="break-words"><RichText text={r.notes} /></Note> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Block>
  )
}

export function LaunchOptions({ game }: { game: GameFull }) {
  const options = game.game_launch_options?.available ?? []
  if (!options.length && !game.game_executable_path) return null
  return (
    <Block title="Launch options">
      <div className="grid gap-2">
        {options.length ? (
          options.map((o, i) => (
            <div key={i} className="grid gap-0.5 border-t border-border pt-2 first:border-t-0 first:pt-0">
              <span className="text-xs font-bold text-foreground">{o.description || o.executable || 'Default'}</span>
              <code className="select-text break-all text-[11px] text-muted-foreground">{[o.executable, o.arguments].filter(Boolean).join(' ')}</code>
              {o.oslist ? <Caption>{o.oslist}</Caption> : null}
            </div>
          ))
        ) : (
          <code className="select-text break-all text-[11px] text-muted-foreground">{game.game_executable_path}</code>
        )}
      </div>
    </Block>
  )
}

export function Information({ game }: { game: GameFull }) {
  const players = [game.multiplayer ? 'Multiplayer' : null, game.coop ? 'Co-op' : null].filter(Boolean).join(', ')
  // Steam sometimes sends an untranslated key (`#category_...`), which older rows keep.
  const features = game.features?.filter((f) => !f.startsWith('#')) ?? []
  if (!game.price && !game.platforms?.length && !players && !features.length && !game.dlc?.length) return null
  return (
    <Block title="Information">
      <div>
        {game.price ? <Row label="Price on Steam">{game.price}</Row> : null}
        {game.platforms?.length ? <Row label="Platforms">{game.platforms.join(', ')}</Row> : null}
        {players ? <Row label="Players">{players}</Row> : null}
      </div>
      {features.length ? (
        <div className="flex flex-wrap gap-1.5">
          {features.map((f) => (
            <Tag key={f}>{f}</Tag>
          ))}
        </div>
      ) : null}
      {game.dlc?.length ? (
        <div className="grid gap-1">
          <Caption>Included DLC</Caption>
          {game.dlc.map((d) => (
            <span key={d} className="text-xs text-muted-foreground">
              {d}
            </span>
          ))}
        </div>
      ) : null}
    </Block>
  )
}

export function Requirements({ game }: { game: GameFull }) {
  const minimum = requirementLines(game.system_requirements?.minimum)
  const recommended = requirementLines(game.system_requirements?.recommended)
  if (!minimum.length && !recommended.length) return null
  const column = (title: string, lines: string[]) =>
    lines.length ? (
      <div className="grid gap-1.5">
        <Caption className="text-primary">{title}</Caption>
        <ul className="grid gap-1">
          {lines.map((line, i) => (
            <li key={i}>
              <Note>{line}</Note>
            </li>
          ))}
        </ul>
      </div>
    ) : null
  return (
    <Block title="System requirements">
      {column('Minimum', minimum)}
      {column('Recommended', recommended)}
    </Block>
  )
}

/** Who a reply answers, above it: their name to their profile, what they said to the comment. */
function ReplyQuote({ quote }: { quote: NonNullable<Comment['replyTo']> }) {
  if (quote.gone) {
    return (
      <p className="kryo-reply-quote">
        <Reply className="size-3 shrink-0" aria-hidden />
        <span className="italic">Replying to a comment that was removed</span>
      </p>
    )
  }
  return (
    <div className="kryo-reply-quote">
      <Reply className="size-3 shrink-0" aria-hidden />
      <span className="sr-only">Replying to</span>
      {quote.username ? (
        <ProfileLink username={quote.username} className="shrink-0 font-bold text-foreground">
          <TeamName username={quote.username}>{quote.name}</TeamName>
        </ProfileLink>
      ) : (
        <>
          <span className="shrink-0 font-bold text-foreground">Anonymous</span>
          <span className="flex max-w-[65%] shrink-0 flex-wrap items-center gap-1 empty:hidden"><StaffTag of={`comment:${quote.id}`} /></span>
        </>
      )}
      <button
        type="button"
        onClick={() => document.getElementById(`comment-${quote.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
        className="min-w-0 truncate text-left focus-visible:outline-2 focus-visible:outline-primary"
        aria-label="Go to the comment this answers"
      >
        {quote.excerpt ? <RichText text={quote.excerpt} /> : <span className="italic">Attachment</span>}
      </button>
    </div>
  )
}

/** Under a write-up's author: whether they recommend it, the build, the play time. */
function WriteupLine({ meta }: { meta: NonNullable<Comment['writeup']> }) {
  if (meta.recommends == null && !meta.build && !meta.playSeconds && !meta.topOfWeek) return null
  const h = meta.playSeconds ? meta.playSeconds / 3600 : 0
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
      {meta.topOfWeek ? (
        <span className="inline-flex items-center gap-1 font-bold uppercase tracking-wider text-primary"><Flame className="size-3" aria-hidden /> Top write-up this week</span>
      ) : null}
      {meta.recommends === true ? (
        <span className="inline-flex items-center gap-1 font-bold uppercase tracking-wider text-primary"><CircleCheck className="size-3" aria-hidden /> Recommends it</span>
      ) : meta.recommends === false ? (
        <span className="inline-flex items-center gap-1 font-bold uppercase tracking-wider text-destructive"><CircleX className="size-3" aria-hidden /> Does not recommend it</span>
      ) : null}
      {meta.build ? <span className="min-w-0 truncate">Played {meta.build}</span> : null}
      {meta.playSeconds ? <span>{h < 1 ? `${Math.max(1, Math.round(meta.playSeconds / 60))} min` : `${h < 10 ? h.toFixed(1).replace(/\.0$/, '') : Math.round(h)} h`} played</span> : null}
    </div>
  )
}

function CommentItem({ comment, depth, onReply, below }: { comment: Comment; depth: number; onReply?: (c: Comment) => void; below?: ReactNode }) {
  const name = comment.deleted ? '[removed]' : comment.author.displayName || comment.author.username
  const username = comment.deleted ? null : comment.author.username || null
  return (
    <li id={`comment-${comment.id}`} className={cn('grid gap-2', depth > 0 && 'ml-4 border-l border-border pl-3')}>
      <div className="flex gap-2.5">
        <ProfileLink username={username} className="shrink-0">
          <Avatar src={comment.deleted ? null : siteUrl(comment.author.avatarUrl)} name={name} className="size-8 text-[11px]" />
        </ProfileLink>
        <div className="grid min-w-0 gap-0.5">
          {comment.replyTo && !comment.deleted ? <ReplyQuote quote={comment.replyTo} /> : null}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <ProfileLink username={username} className="text-xs font-bold text-foreground"><TeamName username={username}>{name}</TeamName></ProfileLink>
            {!username && !comment.deleted ? <StaffTag of={`comment:${comment.id}`} /> : null}
            {username && comment.author.tier ? <Tag tone="primary">{comment.author.tier}</Tag> : null}
            {username && comment.author.repacker ? <button type="button" onClick={() => void openExternal(`${API}/repackers`)}><Tag tone="primary">Repacker</Tag></button> : null}
            <Caption>{ago(comment.createdAt)}</Caption>
            {comment.edited ? <Caption>edited</Caption> : null}
          </div>
          {comment.writeup && !comment.deleted ? <WriteupLine meta={comment.writeup} /> : null}
          <Note className="whitespace-pre-wrap break-words">{comment.deleted ? 'This comment was removed.' : <RichText text={comment.body} />}</Note>
          {!comment.deleted ? <StaffMentionTags id={comment.id} text={comment.body} /> : null}
          {!comment.deleted && comment.attachments?.length ? <Attachments items={comment.attachments} /> : null}
          {!comment.deleted ? below : null}
          {!comment.deleted && onReply ? (
            <button type="button" onClick={() => onReply(comment)} className="w-fit text-[10px] uppercase tracking-wider text-muted-foreground">
              Reply
            </button>
          ) : null}
        </div>
      </div>
      {comment.replies?.length ? (
        <ul className="grid gap-3">
          {comment.replies.map((r) => (
            <CommentItem key={r.id} comment={r} depth={depth + 1} onReply={onReply} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

/** A write-up is at least this long (kryo.to's WRITEUP_MIN), counted on the words. */
const WRITEUP_MIN = 200
const WRITEUP_MAX = 6000
const plainLength = (text: string) => plainRich(text).replace(/\s+/g, ' ').trim().length
const hoursLabel = (seconds: number) => {
  const h = seconds / 3600
  return h < 1 ? `${Math.max(1, Math.round(seconds / 60))} min` : `${h < 10 ? h.toFixed(1).replace(/\.0$/, '') : Math.round(h)} h`
}

/** Writing a write-up, or editing yours: the shared editor, then whether you recommend it, the build and your play time. */
function WriteupBox({ slug, version, initial, onDone, onCancel }: { slug: string; version: string | null; initial?: Comment | null; onDone: () => void; onCancel: () => void }) {
  const { token, me, toast, fail } = useApp()
  const [text, setText] = useState(initial ? editableText(initial.body) : '')
  const [recommends, setRecommends] = useState<boolean | null>(initial?.writeup?.recommends ?? null)
  const [build, setBuild] = useState(initial ? (initial.writeup?.build ?? '') : (version ?? ''))
  const [showPlaytime, setShowPlaytime] = useState(initial ? initial.writeup?.playSeconds != null : true)
  const [played, setPlayed] = useState(0)
  const [sending, setSending] = useState(false)
  const box = useRef<HTMLTextAreaElement>(null)
  const people = useCallback((q: string) => (token ? mentionPeople(token, q) : []), [token])
  useEffect(() => {
    if (token) playedSeconds(token, slug).then(setPlayed).catch(() => setPlayed(0))
  }, [token, slug])
  const length = plainLength(text)
  const send = async () => {
    if (!token || length < WRITEUP_MIN || sending) return
    setSending(true)
    try {
      await saveWriteup(token, slug, { body: text.trim(), recommends, build: build.trim() || null, showPlaytime }, Boolean(initial))
      toast(initial ? 'Your write-up is saved.' : 'Your write-up is up.')
      onDone()
    } catch (e) {
      toast(fail(e))
    } finally {
      setSending(false)
    }
  }
  return (
    <div className="grid gap-2 border-t border-border pt-3">
      <RichTextarea
        ref={box}
        value={text}
        onValueChange={setText}
        people={people}
        effects={!!me?.isSupporter}
        rank={me?.donationTier ?? null}
        rows={8}
        maxLength={WRITEUP_MAX}
        placeholder="What did you think? What worked, what did not, and who would enjoy it."
        aria-label="Your write-up"
        className="kryo-radius w-full resize-none border border-border bg-background p-3 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Caption>Recommend it?</Caption>
        <Chip active={recommends === true} onClick={() => setRecommends((v) => (v === true ? null : true))}>
          Yes
        </Chip>
        <Chip active={recommends === false} onClick={() => setRecommends((v) => (v === false ? null : false))}>
          No
        </Chip>
      </div>
      <label className="grid gap-1">
        <Caption>Build played</Caption>
        <input
          value={build}
          onChange={(e) => setBuild(e.target.value.slice(0, 80))}
          maxLength={80}
          placeholder={version ?? 'e.g. v1.0.4'}
          className="kryo-radius h-9 w-full border border-border bg-background px-3 text-xs text-foreground outline-none focus:border-foreground"
        />
      </label>
      {played > 0 ? (
        <Chip active={showPlaytime} onClick={() => setShowPlaytime((v) => !v)}>
          {showPlaytime ? 'Showing' : 'Not showing'} my play time ({hoursLabel(played)})
        </Chip>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <EmojiButton target={box} value={text} onValueChange={setText} align="left" />
        <span className="text-[10px] text-muted-foreground">{length < WRITEUP_MIN ? `${length}/${WRITEUP_MIN} to go` : `${text.length}/${WRITEUP_MAX}`}</span>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" disabled={length < WRITEUP_MIN || sending} onClick={() => void send()}>
          {sending ? 'Posting...' : initial ? 'Save' : 'Post write-up'}
        </Button>
      </div>
    </div>
  )
}

/** "Helpful" on somebody else's write-up; a count on your own or signed out. */
function HelpfulButton({ comment, onChange }: { comment: Comment; onChange: (h: NonNullable<Comment['helpful']>) => void }) {
  const { token, toast, fail } = useApp()
  const h = comment.helpful
  if (!h) return null
  if (!h.can || !token) return h.count ? <Caption>{h.count} found it helpful</Caption> : null
  const toggle = async () => {
    const was = h
    onChange({ ...h, mine: !h.mine, count: Math.max(0, h.count + (h.mine ? -1 : 1)) })
    try {
      const now = await setHelpful(token, comment.id, !was.mine)
      onChange({ ...was, ...now })
    } catch (e) {
      onChange(was)
      toast(fail(e))
    }
  }
  return (
    <button
      type="button"
      aria-pressed={h.mine}
      onClick={() => void toggle()}
      className={cn('inline-flex w-fit items-center gap-1 text-[10px] uppercase tracking-wider', h.mine ? 'text-primary' : 'text-muted-foreground')}
    >
      <CircleCheck className="size-3" aria-hidden /> Helpful{h.count ? ` · ${h.count}` : ''}
    </button>
  )
}

type ReactionSummary = { emoji: string; count: number; mine: boolean; people: { name: string; username: string | null }[] }

/** A few write-ups' reactions at once; signed in, which are yours. */
async function loadReactions(token: string | null, targets: string[]): Promise<Record<string, ReactionSummary[]>> {
  if (!targets.length) return {}
  const r = await request<{ reactions?: Record<string, ReactionSummary[]> }>(`${API}/api/reactions?t=${targets.map(encodeURIComponent).join(',')}`, { token })
  return r.json.reactions ?? {}
}

/**
 * Kryoto's reactions on a write-up, the same as on the site (lib/reactions-db.ts
 * there decides everything): press one to add yours or take it back, the
 * smiley adds another. Signed out, the counts show and do nothing.
 */
function ReactionRow({ target, list, onChange }: { target: string; list: ReactionSummary[]; onChange: (next: ReactionSummary[]) => void }) {
  const { token, me, toast, fail } = useApp()
  const base = useAssetBase()
  const [busy, setBusy] = useState(false)
  // Hold a chip to see who reacted with it, like the site; a hold does not also toggle it.
  const [who, setWho] = useState<string | null>(null)
  const hold = useRef<{ timer: ReturnType<typeof setTimeout> | null; fired: boolean }>({ timer: null, fired: false })
  const startHold = (emoji: string) => {
    hold.current.fired = false
    if (hold.current.timer) clearTimeout(hold.current.timer)
    hold.current.timer = setTimeout(() => {
      hold.current.fired = true
      setWho((w) => (w === emoji ? null : emoji))
    }, 450)
  }
  const endHold = () => {
    if (hold.current.timer) clearTimeout(hold.current.timer)
    hold.current.timer = null
  }
  if (!token && !list.length) return null
  const shown = list.find((r) => r.emoji === who)
  const react = async (emoji: string, on: boolean) => {
    if (!token || busy) return
    setBusy(true)
    try {
      const r = await request<{ reactions?: ReactionSummary[] }>(`${API}/api/reactions`, { method: 'POST', token, body: { target, emoji, on } })
      if (r.json.reactions) onChange(r.json.reactions)
    } catch (e) {
      toast(fail(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Reactions">
        {list.map((r) => (
          <button
            key={r.emoji}
            type="button"
            // Signed out the chips still open "who" on a hold, so they are not disabled; a tap does nothing then.
            aria-disabled={!token || busy || undefined}
            aria-pressed={r.mine}
            aria-expanded={who === r.emoji}
            aria-label={`:${r.emoji}: ${r.count}${r.mine ? ', yours' : ''}. Hold to see who.`}
            onPointerDown={() => startHold(r.emoji)}
            onPointerUp={endHold}
            onPointerLeave={endHold}
            onPointerCancel={endHold}
            onContextMenu={(e) => {
              // A long press on a phone also opens the context menu: show who instead.
              e.preventDefault()
              endHold()
              hold.current.fired = true
              setWho((w) => (w === r.emoji ? null : r.emoji))
            }}
            onClick={() => {
              if (hold.current.fired) {
                hold.current.fired = false
                return
              }
              if (token && !busy) void react(r.emoji, !r.mine)
            }}
            className={cn('kryo-pill inline-flex h-8 select-none items-center gap-1 border px-2 text-xs tabular-nums [-webkit-touch-callout:none]', r.mine ? 'border-primary bg-primary/15 text-foreground' : 'border-border text-muted-foreground')}
          >
            <img src={`${base}${emojiPath(r.emoji)}`} alt="" width={22} height={22} draggable={false} className={cn('pointer-events-none size-[22px]', isMascotEmoji(r.emoji) && 'kryo-emoji-mascot')} />
            {r.count}
          </button>
        ))}
        {token ? <EmojiButton stickers={false} rank={me?.donationTier ?? null} align="left" onPick={(t) => void react(t.slice(1, -1), true)} /> : null}
      </div>
      {shown ? (
        <p role="status" className="text-[11px] leading-relaxed text-muted-foreground">
          <img src={`${base}${emojiPath(shown.emoji)}`} alt={`:${shown.emoji}:`} width={14} height={14} className="mr-1 inline size-[14px] align-[-2px]" />
          {shown.people.map((p, i) => (
            <span key={i}>
              {i > 0 ? ', ' : ''}
              {/* A name opens its profile; Anonymous is plain words. */}
              {p.username ? <ProfileLink username={p.username} className="text-foreground">{p.name}</ProfileLink> : <span>{p.name}</span>}
            </span>
          ))}
          {shown.count > shown.people.length ? `${shown.people.length ? ' and ' : ''}${shown.count - shown.people.length} more` : ''}
        </p>
      ) : null}
    </div>
  )
}

/**
 * Yours first, then by helpful votes for their age, as kryo.to sorts them.
 * `topFirst` (the library page's two) puts the week's most reacted write-up
 * ahead of the rest, as Kryoto Desktop's Library does.
 */
function sortWriteups(list: Comment[], topFirst = false): Comment[] {
  const now = Date.now()
  const score = (c: Comment) => ((c.helpful?.count ?? 0) + 1) / Math.sqrt(Math.max(0, (now - new Date(c.createdAt).getTime()) / 86_400_000) + 7)
  const top = (c: Comment) => (topFirst && c.writeup?.topOfWeek ? 1 : 0)
  return [...list].sort((a, b) => Number(Boolean(b.canEdit)) - Number(Boolean(a.canEdit)) || top(b) - top(a) || score(b) - score(a))
}

/**
 * A game's write-ups: what players thought of it, in more than a comment, the
 * most helpful for their age first. Signed in, you write yours here or edit it.
 * A guest sees nothing for a game nobody has written up.
 */
export function Writeups({ slug, version, limit }: { slug: string; version: string | null; limit?: number }) {
  const { token, signIn, fail, push } = useApp()
  const [list, setList] = useState<Comment[] | null>(null)
  const [share, setShare] = useState<RecommendShare | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [writing, setWriting] = useState<'new' | 'edit' | null>(null)
  const [reactions, setReactions] = useState<Record<string, ReactionSummary[]>>({})
  const load = () => {
    setError(null)
    loadWriteups(slug, token)
      .then((r) => {
        const sorted = sortWriteups(r.list, Boolean(limit))
        setList(sorted)
        setShare(r.share)
        const shown = limit ? sorted.slice(0, limit) : sorted
        loadReactions(token, shown.filter((c) => !c.deleted).map((c) => `comment:${c.id}`))
          .then(setReactions)
          .catch(() => {})
      })
      .catch((e: unknown) => setError(fail(e)))
  }
  useEffect(load, [slug, token]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!error && !list) return null
  if (!error && !list?.length && !token) return null
  const mine = list?.find((c) => c.canEdit && !c.deleted) ?? null
  const setHelpfulOf = (id: string, h: NonNullable<Comment['helpful']>) => setList((l) => l && l.map((c) => (c.id === id ? { ...c, helpful: h } : c)))
  return (
    <Block title={`Write-ups${list ? ` (${list.filter((c) => !c.deleted).length})` : ''}`}>
      {share ? (
        <Note>
          <b className="text-foreground">{share.percent}%</b> of {share.said} write-ups recommend it.
        </Note>
      ) : null}
      {error ? (
        <Notice title="Could not load the write-ups" body={error} retry={load} />
      ) : list?.length ? (
        <ul className="grid gap-4">
          {(limit ? list.slice(0, limit) : list).map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              depth={0}
              below={
                <>
                  <HelpfulButton comment={c} onChange={(h) => setHelpfulOf(c.id, h)} />
                  {c.deleted ? null : (
                    <ReactionRow target={`comment:${c.id}`} list={reactions[`comment:${c.id}`] ?? []} onChange={(next) => setReactions((r) => ({ ...r, [`comment:${c.id}`]: next }))} />
                  )}
                </>
              }
            />
          ))}
          {limit && list.length > limit ? (
            <li>
              <Button size="sm" variant="ghost" onClick={() => push({ kind: 'game', slug })}>
                All {list.filter((c) => !c.deleted).length} write-ups
              </Button>
            </li>
          ) : null}
        </ul>
      ) : (
        <Note>Nobody has written this one up yet.</Note>
      )}
      {writing ? (
        <WriteupBox
          slug={slug}
          version={version}
          initial={writing === 'edit' ? mine : null}
          onCancel={() => setWriting(null)}
          onDone={() => {
            setWriting(null)
            load()
          }}
        />
      ) : !token ? (
        <Button size="sm" onClick={signIn}>
          Sign in to write one
        </Button>
      ) : mine ? (
        <Button size="sm" onClick={() => setWriting('edit')}>
          Edit your write-up
        </Button>
      ) : (
        <Button size="sm" variant="primary" onClick={() => setWriting('new')}>
          Write one
        </Button>
      )}
    </Block>
  )
}

/** Every comment in a thread, replies too; a removed one is not counted. */
const countOf = (list: Comment[]): number => list.reduce((n, c) => n + (c.deleted ? 0 : 1) + countOf(c.replies ?? []), 0)

/** The game's comment thread; signed in, you can add to it. `label` heads it (the coming-soon page's is "Talk while it arrives", as on kryo.to). */
export function Comments({ slug, label = 'Comments' }: { slug: string; label?: string }) {
  const { token, me, signIn, toast, fail } = useApp()
  const [list, setList] = useState<Comment[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<Comment | null>(null)
  const [sending, setSending] = useState(false)
  const box = useRef<HTMLTextAreaElement>(null)
  const people = useCallback((q: string) => (token ? mentionPeople(token, q) : []), [token])
  const answer = (c: Comment) => {
    setReplyTo(c)
    // The box is under the whole thread, so a Reply far above it says nothing without this.
    box.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    box.current?.focus({ preventScroll: true })
  }

  const load = () => {
    setError(null)
    loadComments(slug)
      .then(setList)
      .catch((e: unknown) => setError(fail(e)))
  }
  useEffect(load, [slug]) // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    if (!token || !text.trim() || sending) return
    setSending(true)
    try {
      await postComment(token, slug, text.trim(), replyTo?.id)
      setText('')
      setReplyTo(null)
      load()
    } catch (e) {
      toast(fail(e))
    } finally {
      setSending(false)
    }
  }

  return (
    <Block title={`${label}${list ? ` (${countOf(list)})` : ''}`}>
      {error ? (
        <Notice title="Could not load the comments" body={error} retry={load} />
      ) : !list ? (
        <Busy />
      ) : list.length ? (
        <ul className="grid gap-4">
          {list.map((c) => (
            <CommentItem key={c.id} comment={c} depth={0} onReply={answer} />
          ))}
        </ul>
      ) : (
        <Note>No comments yet.</Note>
      )}
      {token ? (
        <div className="grid gap-2 border-t border-border pt-3">
          {replyTo ? (
            <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span className="truncate">Replying to <ProfileLink username={replyTo.author.username || null}><TeamName username={replyTo.author.username || null}>{replyTo.author.displayName || replyTo.author.username}</TeamName></ProfileLink></span>
              <button type="button" onClick={() => setReplyTo(null)} className="shrink-0 uppercase tracking-wider">
                Cancel
              </button>
            </div>
          ) : null}
          <RichTextarea
            ref={box}
            value={text}
            onValueChange={setText}
            people={people}
            effects={!!me?.isSupporter}
            rank={me?.donationTier ?? null}
            rows={3}
            maxLength={2000}
            placeholder="Add a comment"
            aria-label="Add a comment"
            className="kryo-radius w-full resize-none border border-border bg-background p-3 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground"
          />
          <div className="flex items-center justify-between gap-2">
            <EmojiButton target={box} value={text} onValueChange={setText} rank={me?.donationTier ?? null} align="left" />
            <Button size="sm" variant="primary" disabled={!text.trim() || sending} onClick={() => void send()}>
              {sending ? 'Posting...' : 'Post'}
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" onClick={signIn}>
          Sign in to comment
        </Button>
      )}
    </Block>
  )
}
