import { useEffect, useState, type ReactNode } from 'react'
import { AsciiBar, Button, Caption, Label } from '@/ui'
import { cn } from '@/lib/utils'
import { comments as loadComments, postComment, tested as loadTested, type Comment, type GameFull, type Tested } from '@/mobile/catalog'
import { useApp } from '@/mobile/context'
import { ago, requirementLines, reviewVerdict } from '@/mobile/format'
import { Busy } from '@/mobile/parts'

/** A titled card on the game page. */
export function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="kryo-radius grid gap-3 border border-border bg-card p-4">
      <Label>{title}</Label>
      {children}
    </section>
  )
}

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
          <p key={i} className="text-xs leading-relaxed text-muted-foreground">
            {p}
          </p>
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
  const verified = game.verification === 'verified'
  const reviewer = !game.anonymous ? game.reviewed_by_name : null
  return (
    <Block title="Tested">
      <p className="text-xs leading-relaxed text-muted-foreground">
        {report?.headline ||
          (verified
            ? 'Somebody ran this build and it works.'
            : game.verification === 'broken'
              ? 'A tester could not get this build to run.'
              : 'Nobody has confirmed this build runs yet.')}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <span className={cn('kryo-pill border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider', verified ? 'border-success/50 text-success' : 'border-border text-muted-foreground')}>
          {verified ? 'Verified' : game.verification === 'broken' ? 'Broken' : 'Unverified'}
        </span>
        {reviewer ? <span className="kryo-pill border border-border px-2.5 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">Reviewed by {reviewer}</span> : null}
      </div>
      {report?.reports.length ? (
        <ul className="grid gap-2">
          {report.reports.slice(0, 5).map((r) => (
            <li key={r.id} className="grid gap-0.5 border-t border-border pt-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-foreground">{OUTCOME_LABEL[r.outcome] ?? r.outcome}</span>
                <Caption>{ago(r.testedAt)}</Caption>
              </div>
              <Caption>
                {[r.tester.name, r.platform, r.version].filter(Boolean).join(' - ')}
                {r.current ? ' - current build' : ''}
              </Caption>
              {r.notes ? <p className="leading-relaxed text-muted-foreground">{r.notes}</p> : null}
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
  return (
    <Block title="Information">
      <div>
        {game.developer ? <Row label="Developer">{game.developer}</Row> : null}
        {game.year ? <Row label="Released">{game.year}</Row> : null}
        {game.price ? <Row label="Price on Steam">{game.price}</Row> : null}
        {game.platforms?.length ? <Row label="Platforms">{game.platforms.join(', ')}</Row> : null}
        {players ? <Row label="Players">{players}</Row> : null}
        {game.genres.length ? <Row label="Genres">{game.genres.join(', ')}</Row> : null}
      </div>
      {game.features?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {game.features.map((f) => (
            <span key={f} className="border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              {f}
            </span>
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
            <li key={i} className="text-xs leading-relaxed text-muted-foreground">
              {line}
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

function CommentItem({ comment, depth, onReply }: { comment: Comment; depth: number; onReply: (c: Comment) => void }) {
  const name = comment.author.displayName || comment.author.username
  return (
    <li className={cn('grid gap-2', depth > 0 && 'ml-4 border-l border-border pl-3')}>
      <div className="flex gap-2.5">
        {comment.author.avatarUrl ? (
          <img src={comment.author.avatarUrl} alt="" className="size-8 shrink-0 rounded-full border border-border object-cover" />
        ) : (
          <span className="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-secondary text-[11px] font-bold text-foreground">{name.slice(0, 1).toUpperCase()}</span>
        )}
        <div className="grid min-w-0 gap-0.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-xs font-bold text-foreground">{name}</span>
            {comment.author.tier ? <span className="kryo-pill border border-primary/60 px-1.5 text-[9px] uppercase tracking-wider text-primary">{comment.author.tier}</span> : null}
            <Caption>{ago(comment.createdAt)}</Caption>
            {comment.edited ? <Caption>edited</Caption> : null}
          </div>
          <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">{comment.deleted ? 'This comment was removed.' : comment.body}</p>
          {!comment.deleted && depth < 2 ? (
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

/** The game's comment thread; signed in, you can add to it. */
export function Comments({ slug }: { slug: string }) {
  const { token, signIn, toast, fail } = useApp()
  const [list, setList] = useState<Comment[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<Comment | null>(null)
  const [sending, setSending] = useState(false)

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
    <Block title={`Comments${list ? ` (${list.length})` : ''}`}>
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : !list ? (
        <Busy />
      ) : list.length ? (
        <ul className="grid gap-4">
          {list.map((c) => (
            <CommentItem key={c.id} comment={c} depth={0} onReply={setReplyTo} />
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No comments yet.</p>
      )}
      {token ? (
        <div className="grid gap-2 border-t border-border pt-3">
          {replyTo ? (
            <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span className="truncate">Replying to {replyTo.author.displayName || replyTo.author.username}</span>
              <button type="button" onClick={() => setReplyTo(null)} className="shrink-0 uppercase tracking-wider">
                Cancel
              </button>
            </div>
          ) : null}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Add a comment"
            className="kryo-radius w-full resize-none border border-border bg-background p-3 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground"
          />
          <Button size="sm" variant="primary" disabled={!text.trim() || sending} onClick={() => void send()}>
            {sending ? 'Posting...' : 'Post'}
          </Button>
        </div>
      ) : (
        <Button size="sm" onClick={signIn}>
          Sign in to comment
        </Button>
      )}
    </Block>
  )
}
