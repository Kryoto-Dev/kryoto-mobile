import {
  Apple,
  BarChart3,
  Code,
  Coffee,
  Crown,
  Diamond,
  Flame,
  Gamepad2,
  Ghost,
  Heart,
  LifeBuoy,
  Monitor,
  Moon,
  Music,
  PenLine,
  Rocket,
  ScrollText,
  Shield,
  ShieldCheck,
  Skull,
  Sparkles,
  Star,
  Sun,
  Terminal,
  Trophy,
  Upload,
  Wrench,
  Zap,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { TeamGem } from './pixel-badges'

/**
 * The badges beside a name, drawn exactly as kryo.to draws them.
 *
 * The site sends each badge ready to draw (`badges` in
 * `GET /api/account/profile`, built by kryo.to's lib/profile-badges.ts): its
 * words, icon, style step and tester pips. The style tables here are a copy of
 * that file's; change both together, or the phone and the site drift apart.
 */

export type BadgeView = {
  key: string
  kind: string
  label: string
  title: string
  icon: string | null
  fill: boolean
  tone: string
  custom: boolean
  href: string | null
  pips: { total: number; filled: number } | null
  platforms: { id: string; label: string; icon: string }[]
}

const ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  crown: Crown, 'shield-check': ShieldCheck, star: Star, 'scroll-text': ScrollText, upload: Upload,
  'pen-line': PenLine, wrench: Wrench, 'life-buoy': LifeBuoy, 'bar-chart-3': BarChart3, code: Code,
  heart: Heart, diamond: Diamond, monitor: Monitor, terminal: Terminal, apple: Apple, 'gamepad-2': Gamepad2,
  flame: Flame, zap: Zap, trophy: Trophy, sparkles: Sparkles, shield: Shield, skull: Skull, ghost: Ghost,
  rocket: Rocket, music: Music, coffee: Coffee, moon: Moon, sun: Sun,
}

// ---- Copied from kryo.to lib/profile-badges.ts --------------------------------

const BADGE_BASE =
  'kryo-pill inline-flex items-center gap-1 border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider'
const BADGE_BASE_CUSTOM =
  'kryo-pill inline-flex items-center gap-1 border px-1.5 py-0.5 text-[10px] font-bold tracking-wide'

const STAFF_STYLE: Record<string, string> = {
  owner: 'border-primary bg-primary text-primary-foreground',
  admin: 'border-primary/60 bg-primary/10 text-foreground',
  manager: 'border-primary/40 bg-primary/5 text-foreground',
  reviewer: 'border-border bg-secondary text-foreground',
  uploader: 'border-border bg-secondary text-foreground',
  writer: 'border-border bg-secondary text-foreground',
  moderator: 'border-border bg-secondary text-muted-foreground',
  support: 'border-border bg-secondary text-muted-foreground',
  analyst: 'border-border bg-secondary text-muted-foreground',
}
const DEVELOPER_STYLE = 'border-primary/40 bg-primary/5 text-foreground'
const PLATFORM_SUPPORT_STYLE = 'border-foreground/50 bg-transparent text-foreground'
const DONOR_STYLE: Record<string, string> = {
  supporter: 'border-border bg-transparent text-muted-foreground',
  backer: 'border-foreground/70 bg-transparent text-foreground',
  patron: 'border-primary bg-primary text-primary-foreground',
  sponsor: 'kryo-sponsor-badge border-primary bg-primary text-primary-foreground px-2.5 tracking-[0.14em] font-black',
}
const SUPPORTER_FALLBACK_STYLE = 'border-primary/40 bg-primary/10 text-primary'
const CUSTOM_STYLE = 'border-border bg-card text-foreground'
const TESTER_STEP_STYLE = [
  'border-dashed border-border bg-transparent text-muted-foreground',
  'border-border bg-transparent text-muted-foreground',
  'border-foreground/50 bg-transparent text-foreground',
  'border-foreground bg-secondary text-foreground',
  'border-primary/60 bg-primary/10 text-foreground',
  'border-primary bg-primary/20 text-foreground',
  'border-primary bg-primary text-primary-foreground',
  'kryo-sponsor-badge border-primary bg-primary text-primary-foreground',
]

function toneClass(tone: string): string {
  const [kind, id = ''] = tone.split(':')
  switch (kind) {
    case 'staff': return STAFF_STYLE[id] ?? CUSTOM_STYLE
    case 'developer': return DEVELOPER_STYLE
    case 'platform': return PLATFORM_SUPPORT_STYLE
    case 'donor': return DONOR_STYLE[id] ?? CUSTOM_STYLE
    case 'supporter': return SUPPORTER_FALLBACK_STYLE
    case 'custom': return CUSTOM_STYLE
    case 'tester': return TESTER_STEP_STYLE[Math.min(Number(id) || 0, TESTER_STEP_STYLE.length - 1)] ?? CUSTOM_STYLE
    default: return CUSTOM_STYLE
  }
}

// -------------------------------------------------------------------------------

/** One badge, as kryo.to's `BadgeChip` draws it. */
export function BadgeChip({ view, onOpen }: { view: BadgeView; onOpen?: (href: string) => void }) {
  const Icon = view.icon ? ICON[view.icon] : null
  // A staff role is Kryoto's own badge: the team gem, in a pixel-cut chip (as on kryo.to).
  const chip = view.kind === 'staff' ? (
    <span title={view.title} className={cn(BADGE_BASE, 'kryo-staff-chip relative', toneClass(view.tone))}>
      <TeamGem decorative className={cn('text-[11px]', view.tone === 'staff:owner' ? 'text-current' : 'text-primary')} />
      {view.label}
    </span>
  ) : (
    <span title={view.title} className={cn(view.custom ? BADGE_BASE_CUSTOM : BADGE_BASE, 'relative', toneClass(view.tone))}>
      {Icon ? <Icon className={cn('size-3 shrink-0', view.fill && 'fill-current')} aria-hidden /> : null}
      {view.label}
      {view.pips ? (
        <span aria-hidden className="ml-0.5 flex items-center gap-px">
          {Array.from({ length: view.pips.total }, (_, i) => (
            <span key={i} className={cn('h-2 w-[3px]', i < view.pips!.filled ? 'bg-current' : 'bg-current opacity-25')} />
          ))}
        </span>
      ) : null}
      {view.platforms.length ? (
        <span aria-hidden className="ml-0.5 flex items-center gap-0.5 opacity-80">
          {view.platforms.map((p) => {
            const P = ICON[p.icon] ?? Monitor
            return <P key={p.id} className="size-2.5" />
          })}
        </span>
      ) : null}
    </span>
  )
  if (!view.href || !onOpen) return chip
  return (
    <button
      type="button"
      onClick={() => onOpen(view.href!)}
      aria-label={`${view.title}. More about it`}
      className="kryo-pill inline-flex outline-none transition-opacity active:opacity-80 focus-visible:ring-2 focus-visible:ring-primary"
    >
      {chip}
    </button>
  )
}

/** Every badge, in the site's order. */
export function Badges({ badges, onOpen }: { badges: BadgeView[]; onOpen?: (href: string) => void }) {
  return (
    <>
      {badges.map((b) => (
        <BadgeChip key={b.key} view={b} onOpen={onOpen} />
      ))}
    </>
  )
}
