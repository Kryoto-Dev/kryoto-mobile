import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Camera, Check as CheckIcon, Lock, Plus, Trash2, X } from 'lucide-react'
import { Button, Caption, Dropdown } from '@/ui'
import { cn } from '@/lib/utils'
import { API, siteUrl, type Me } from '@/mobile/auth'
import { useApp } from '@/mobile/context'
import { Busy, Notice, PageHeader } from '@/mobile/parts'
import { acct } from './api'
import { Cropper } from './Cropper'
import { FieldRow, LinkOut, Panel, SaveBar, TextArea, TextField, ToggleRow } from './forms'
import { classifyImage, pickImage, uploadImage } from './media'
import {
  ANIMATED_BANNER_STILL,
  ANIMATED_STILL_NOTICE,
  ART_CREDIT,
  AVATAR_FRAMES,
  BIO_LIMIT_DEFAULT,
  BIO_LIMIT_PATRON,
  DEFAULT_STATUS_ICON,
  DISPLAY_NAME_LIMIT,
  EMPTY_LOCATION,
  LINK_LABEL_LIMIT,
  LOCATION_TEXT_LIMIT,
  MAX_CUSTOM_STATUS_LENGTH,
  MAX_PROFILE_LINKS,
  PLATFORM_INFO,
  PLATFORM_OPTIONS,
  PROFILE_ACCENT_PRESETS,
  STOCK_BANNERS,
  countryOptions,
  defaultBannerFor,
  frameIdOf,
  isProfilePlatform,
  isSingleEmoji,
  normalizeStatusEmoji,
  profileEntitlements,
  type AvatarFrameId,
  type LocationDraft,
  type ProfileLinkDraft,
} from './profile-options'

/** Everything the form edits; compared against the last saved copy to know what changed. */
type Draft = {
  displayName: string
  bio: string
  location: LocationDraft
  avatarUrl: string
  bannerUrl: string
  accent: string
  links: ProfileLinkDraft[]
  status: string
  statusIcon: string
  frame: AvatarFrameId
  isProfilePublic: boolean
  isLibraryPublic: boolean
  isAnonymous: boolean
}

type Staged = { blob: Blob; animated: boolean }
type Pending = { avatar: Staged | null; banner: Staged | null }
type Recent = { avatars: string[]; banners: string[] }
type Say = { msg: string; ok: boolean } | null

/** The account as the form starts, the same fallbacks the web form uses. */
function draftFrom(u: Me): Draft {
  return {
    displayName: u.displayName ?? '',
    bio: u.bio ?? '',
    location: { country: u.profileLocation?.country ?? '', state: u.profileLocation?.state ?? '', city: u.profileLocation?.city ?? '' },
    avatarUrl: u.avatarUrl ?? '',
    bannerUrl: u.bannerUrl ?? '',
    accent: u.profileAccentColor ?? '',
    links: (u.profileLinks ?? []).map((l) => ({ platform: isProfilePlatform(l.platform) ? l.platform : 'website', url: l.url, label: l.label ?? '' })),
    status: u.profileCustomStatus ?? '',
    statusIcon: normalizeStatusEmoji(u.profileCustomStatusIcon) ?? DEFAULT_STATUS_ICON,
    frame: frameIdOf(u.profileAvatarFrame),
    isProfilePublic: u.isProfilePublic ?? true,
    isLibraryPublic: u.isLibraryPublic ?? true,
    isAnonymous: u.isAnonymous ?? false,
  }
}

const recentFrom = (u: Me): Recent => ({ avatars: u.recentAvatars ?? [], banners: u.recentBanners ?? [] })

/** The last emoji typed or pasted, so a second one replaces the first. */
function lastGrapheme(text: string): string {
  const parts = [...new Intl.Segmenter().segment(text.trim())]
  return parts[parts.length - 1]?.segment ?? ''
}

export function EditProfile() {
  const { token, me, back, reloadMe, fail } = useApp()
  const [loadError, setLoadError] = useState<string | null>(null)
  const needMe = !!token && !me
  useEffect(() => {
    if (needMe) reloadMe().catch((e: unknown) => setLoadError(fail(e)))
  }, [needMe])

  const header = <PageHeader title="Edit profile" onBack={back} />
  if (!token) return <>{header}<Notice title="Sign in first" body="Sign in to edit your profile." /></>
  if (!me) {
    return (
      <>
        {header}
        {loadError ? <Notice title="Couldn't load your account" body={loadError} retry={() => { setLoadError(null); reloadMe().catch((e: unknown) => setLoadError(fail(e))) }} /> : <Busy label="Loading your profile…" />}
      </>
    )
  }
  return <>{header}<ProfileForm me={me} token={token} /></>
}

function ProfileForm({ me, token }: { me: Me; token: string }) {
  const { reloadMe, toast, fail } = useApp()
  const ent = profileEntitlements(me.perks, me.donationTier, me.isSupporter)
  const [base, setBase] = useState(() => draftFrom(me))
  const [draft, setDraft] = useState(base)
  const [recent, setRecent] = useState(() => recentFrom(me))
  const [pending, setPending] = useState<Pending>({ avatar: null, banner: null })
  const [crop, setCrop] = useState<{ file: File; kind: 'avatar' | 'banner' } | null>(null)
  const [busy, setBusy] = useState(false)
  const [say, setSay] = useState<Say>(null)
  const countries = useMemo(countryOptions, [])

  const dirty = JSON.stringify(draft) !== JSON.stringify(base) || pending.avatar !== null || pending.banner !== null
  const dirtyNow = useRef(dirty)
  dirtyNow.current = dirty

  // A fresher account (after a save, or the app reloading it) replaces the form, unless the player has unsaved edits.
  useEffect(() => {
    if (dirtyNow.current) return
    const next = draftFrom(me)
    setBase(next)
    setDraft(next)
    setRecent(recentFrom(me))
  }, [me])

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }))
  const setLocation = (patch: Partial<LocationDraft>) => setDraft((d) => ({ ...d, location: { ...d.location, ...patch } }))
  const setLink = (index: number, patch: Partial<ProfileLinkDraft>) => setDraft((d) => ({ ...d, links: d.links.map((l, i) => (i === index ? { ...l, ...patch } : l)) }))

  const forget = (url: string) => {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url)
  }

  /** A picture waiting to be uploaded on Save, shown from its own bytes until then. */
  const stage = (kind: 'avatar' | 'banner', staged: Staged, preview: string) => {
    forget(draft[kind === 'avatar' ? 'avatarUrl' : 'bannerUrl'])
    setPending((p) => ({ ...p, [kind]: staged }))
    set(kind === 'avatar' ? 'avatarUrl' : 'bannerUrl', preview)
  }

  /** Set the picture to an existing address (a recent one, a stock banner) or none. */
  const choose = (kind: 'avatar' | 'banner', url: string) => {
    forget(draft[kind === 'avatar' ? 'avatarUrl' : 'bannerUrl'])
    setPending((p) => ({ ...p, [kind]: null }))
    set(kind === 'avatar' ? 'avatarUrl' : 'bannerUrl', url)
  }

  const pick = async (kind: 'avatar' | 'banner') => {
    let file: File | null
    try {
      file = await pickImage()
    } catch (e) {
      setSay({ msg: fail(e), ok: false })
      return
    }
    if (!file) return
    setSay(null)
    const mode = await classifyImage(file, ent.animated)
    if (mode === 'keep') {
      // A canvas holds one frame, so cropping would flatten it: it goes up as it is.
      stage(kind, { blob: file, animated: true }, URL.createObjectURL(file))
      setSay({ msg: 'Animation kept. Save to apply.', ok: true })
      return
    }
    if (mode === 'flatten') setSay({ msg: ANIMATED_STILL_NOTICE, ok: false })
    setCrop({ file, kind })
  }

  const deleteRecent = async (type: 'avatar' | 'banner', url: string) => {
    try {
      const { user } = await acct<{ user?: Me | null }>(token, '/api/account/media/recent', { method: 'DELETE', body: { type, url } })
      setRecent((r) => ({
        avatars: type === 'avatar' ? (user?.recentAvatars ?? r.avatars.filter((u) => u !== url)) : r.avatars,
        banners: type === 'banner' ? (user?.recentBanners ?? r.banners.filter((u) => u !== url)) : r.banners,
      }))
      toast(`Removed from recent ${type}s.`)
    } catch (e) {
      toast(fail(e))
    }
  }

  const reset = () => {
    forget(draft.avatarUrl)
    forget(draft.bannerUrl)
    setDraft(base)
    setRecent(recentFrom(me))
    setPending({ avatar: null, banner: null })
    setSay(null)
  }

  const save = async () => {
    if (busy) return
    setBusy(true)
    setSay(null)
    try {
      let avatarUrl = draft.avatarUrl
      if (pending.avatar) avatarUrl = await uploadImage(token, pending.avatar.blob, 'avatar', pending.avatar.animated)
      let bannerUrl = draft.bannerUrl
      if (pending.banner) bannerUrl = await uploadImage(token, pending.banner.blob, 'banner', pending.banner.animated)
      // Gated fields are only sent when held: the server refuses a perk the account lacks, and the status icon always has a value, so sending it would make the form unsaveable for everyone else.
      const { user } = await acct<{ user?: Me | null }>(token, '/api/account/profile', {
        method: 'PATCH',
        body: {
          displayName: draft.displayName,
          bio: draft.bio,
          profileLocation: draft.location,
          avatarUrl,
          bannerUrl,
          ...(ent.accent ? { profileAccentColor: draft.accent.trim() || null } : {}),
          ...(ent.links ? { profileLinks: draft.links } : {}),
          ...(ent.status ? { profileCustomStatus: draft.status.trim() || null, profileCustomStatusIcon: draft.statusIcon } : {}),
          ...(ent.frame ? { profileAvatarFrame: draft.frame } : {}),
          isProfilePublic: draft.isProfilePublic,
          isLibraryPublic: draft.isLibraryPublic,
          isAnonymous: draft.isAnonymous,
        },
      })
      forget(draft.avatarUrl)
      forget(draft.bannerUrl)
      setPending({ avatar: null, banner: null })
      // The server normalises what it stores (trims, rewrites link addresses), so the saved copy is the one the form adopts.
      const next = user ? draftFrom(user) : { ...draft, avatarUrl, bannerUrl }
      setBase(next)
      setDraft(next)
      if (user) setRecent(recentFrom(user))
      setSay({ msg: 'Profile saved.', ok: true })
      await reloadMe().catch(() => {})
    } catch (e) {
      setSay({ msg: fail(e), ok: false })
    } finally {
      setBusy(false)
    }
  }

  const shown = (url: string) => siteUrl(url) ?? ''
  const bannerSrc = draft.bannerUrl ? shown(draft.bannerUrl) : shown(defaultBannerFor(me.id ?? me.username))
  const initial = (draft.displayName || me.username || '?').charAt(0).toUpperCase()
  const hasCountry = draft.location.country !== ''
  const frameLabel = AVATAR_FRAMES.find((f) => f.id === draft.frame)?.name

  return (
    <div className="grid gap-4 px-4 pb-8 pt-4">
      <Panel title="Profile preview & artwork">
        <div className="kryo-radius overflow-hidden border border-border bg-card/60">
          <div className="relative aspect-[3/1] w-full overflow-hidden bg-secondary">
            <img src={bannerSrc} alt="Banner preview" className="size-full object-cover object-center" />
            {draft.bannerUrl ? (
              <button type="button" onClick={() => choose('banner', '')} className="absolute right-2 top-2 flex items-center gap-1 rounded bg-black/70 px-2 py-1 text-[10px] font-medium text-destructive">
                <X className="size-3" /> Remove
              </button>
            ) : null}
          </div>
          <div className="px-4 pb-4">
            <div className="-mt-10 size-20 shrink-0 overflow-hidden rounded-full border-4 border-card bg-secondary shadow-lg">
              {draft.avatarUrl ? (
                <img src={shown(draft.avatarUrl)} alt="Avatar preview" className="size-full object-cover" />
              ) : (
                <div className="grid size-full place-items-center text-2xl font-bold text-muted-foreground">{initial}</div>
              )}
            </div>
            <p className="mt-2 text-base font-bold text-foreground">{draft.displayName || me.username}</p>
            <p className="text-xs text-muted-foreground">@{me.username}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void pick('avatar')}>
                <Camera className="size-3.5" /> Upload avatar
              </Button>
              <Button size="sm" onClick={() => void pick('banner')}>
                <Camera className="size-3.5" /> Upload banner
              </Button>
              {draft.avatarUrl ? (
                <Button size="sm" variant="danger" onClick={() => choose('avatar', '')}>
                  <X className="size-3.5" /> Reset avatar
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </Panel>

      {recent.avatars.length > 0 ? (
        <Panel title="Recent avatars">
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {recent.avatars.map((url) => {
              const active = draft.avatarUrl === url
              return (
                <div key={url} className="relative">
                  <button
                    type="button"
                    aria-label="Use this avatar"
                    aria-pressed={active}
                    onClick={() => choose('avatar', url)}
                    className={cn('relative size-12 overflow-hidden rounded-full border-2', active ? 'border-primary ring-2 ring-primary/40' : 'border-border/80')}
                  >
                    <img src={shown(url)} alt="" className="size-full object-cover" />
                    {active ? <Tick /> : null}
                  </button>
                  <button type="button" aria-label="Delete from recents" onClick={() => void deleteRecent('avatar', url)} className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-destructive text-destructive-foreground shadow">
                    <X className="size-3" />
                  </button>
                </div>
              )
            })}
          </div>
        </Panel>
      ) : null}

      {recent.banners.length > 0 ? (
        <Panel title="Recent banners">
          <div className="grid grid-cols-2 gap-2 pt-1">
            {recent.banners.map((url) => {
              const active = draft.bannerUrl === url
              return (
                <div key={url} className="relative">
                  <button
                    type="button"
                    aria-label="Use this banner"
                    aria-pressed={active}
                    onClick={() => choose('banner', url)}
                    className={cn('kryo-radius relative aspect-[3/1] w-full overflow-hidden border-2', active ? 'border-primary ring-2 ring-primary/40' : 'border-border/80')}
                  >
                    <img src={shown(url)} alt="" className="size-full object-cover" />
                    {active ? <Tick /> : null}
                  </button>
                  <button type="button" aria-label="Delete from recents" onClick={() => void deleteRecent('banner', url)} className="absolute right-1 top-1 grid size-6 place-items-center rounded bg-black/80 text-destructive">
                    <Trash2 className="size-3" />
                  </button>
                </div>
              )
            })}
          </div>
        </Panel>
      ) : null}

      <Panel title="Kryoto banners">
        <p className="text-[11px] leading-relaxed text-muted-foreground">Art by {ART_CREDIT}. Without your own banner, your profile shows one of these.</p>
        <div className="grid grid-cols-2 gap-2 pt-1">
          {STOCK_BANNERS.map((b) => {
            const active = draft.bannerUrl === b.path
            const locked = b.animated && !ent.animated
            return (
              <button
                key={b.id}
                type="button"
                disabled={locked}
                aria-pressed={active}
                aria-label={locked ? `${b.title}: moving banners are a supporter perk` : b.title}
                onClick={() => choose('banner', b.path)}
                className={cn('kryo-radius relative aspect-[3/1] w-full overflow-hidden border-2 disabled:cursor-not-allowed', active ? 'border-primary ring-2 ring-primary/40' : 'border-border/80')}
              >
                <img src={shown(b.animated && locked ? ANIMATED_BANNER_STILL : b.path)} alt="" loading="lazy" className={cn('size-full object-cover', locked && 'opacity-50')} />
                {active ? <Tick /> : null}
                {b.animated ? (
                  <span className="absolute bottom-1 left-1 flex items-center gap-1 bg-black/75 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                    {locked ? <Lock className="size-2.5" /> : null}
                    Animated
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </Panel>

      <FieldRow label="Display name" counter={`${draft.displayName.length} / ${DISPLAY_NAME_LIMIT}`}>
        <TextField value={draft.displayName} onChange={(v) => set('displayName', v)} max={DISPLAY_NAME_LIMIT} label="Display name" />
      </FieldRow>

      <Panel title="Location (optional)">
        <p className="text-[11px] leading-relaxed text-muted-foreground">Share as much or as little as you like. Your location appears on your public profile and is hidden while you are anonymous.</p>
        <Dropdown value={draft.location.country} options={countries} label="Profile country" onChange={(country) => (country ? setLocation({ country }) : set('location', { ...EMPTY_LOCATION }))} />
        <FieldRow label="State / region">
          <TextField value={draft.location.state} onChange={(v) => setLocation({ state: v })} max={LOCATION_TEXT_LIMIT} disabled={!hasCountry} label="State or region" />
        </FieldRow>
        <FieldRow label="City">
          <TextField value={draft.location.city} onChange={(v) => setLocation({ city: v })} max={LOCATION_TEXT_LIMIT} disabled={!hasCountry} label="City" />
        </FieldRow>
      </Panel>

      <FieldRow
        label="Bio"
        counter={`${draft.bio.length} / ${ent.bioLimit}`}
        hint={ent.bioLimit === BIO_LIMIT_DEFAULT ? `Patrons get ${BIO_LIMIT_PATRON}.` : undefined}
      >
        <TextArea value={draft.bio} onChange={(v) => set('bio', v)} max={ent.bioLimit} rows={4} />
      </FieldRow>

      <Perk title="Profile accent colour" held={ent.accent} hint="Tints your profile card with an aura glow, avatar halo and highlights that visitors see on your profile.">
        <div className="flex flex-wrap items-center gap-2">
          {PROFILE_ACCENT_PRESETS.map((preset) => {
            const active = draft.accent.toLowerCase() === preset.hex.toLowerCase()
            return (
              <button
                key={preset.id}
                type="button"
                disabled={!ent.accent}
                aria-label={`${preset.name} (${preset.hex})`}
                aria-pressed={active}
                onClick={() => set('accent', preset.hex)}
                className={cn('grid size-8 place-items-center rounded-full border-2', active ? 'border-foreground ring-2 ring-foreground/20' : 'border-transparent')}
                style={{ backgroundColor: preset.hex }}
              >
                {active ? <CheckIcon className="size-3.5 text-black" /> : null}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-2">
          <div className="w-28">
            <TextField value={draft.accent} onChange={(v) => set('accent', v)} max={7} placeholder="#00f0ff" disabled={!ent.accent} label="Accent colour hex" />
          </div>
          {draft.accent ? (
            <Button size="sm" variant="ghost" disabled={!ent.accent} onClick={() => set('accent', '')}>
              Reset
            </Button>
          ) : null}
        </div>
      </Perk>

      <Perk title="Profile links" held={ent.links} hint={`Add up to ${MAX_PROFILE_LINKS} public links (Steam, Discord, GitHub, Twitch, YouTube or a website) to show on your profile.`}>
        {draft.links.map((link, i) => (
          <div key={i} className="kryo-radius grid gap-2 border border-border p-2.5">
            <div className="flex items-center justify-between gap-2">
              <Dropdown value={link.platform} options={PLATFORM_OPTIONS} size="sm" label={`Platform for profile link ${i + 1}`} onChange={(platform) => setLink(i, { platform })} />
              <button type="button" aria-label="Remove link" disabled={!ent.links} onClick={() => set('links', draft.links.filter((_, at) => at !== i))} className="grid size-8 place-items-center text-muted-foreground">
                <X className="size-4" />
              </button>
            </div>
            <TextField value={link.url} onChange={(v) => setLink(i, { url: v })} placeholder={PLATFORM_INFO[link.platform].placeholder} inputMode="url" disabled={!ent.links} label={`Address for profile link ${i + 1}`} />
            <TextField value={link.label} onChange={(v) => setLink(i, { label: v })} max={LINK_LABEL_LIMIT} placeholder="Label (optional)" disabled={!ent.links} label={`Label for profile link ${i + 1}`} />
          </div>
        ))}
        {draft.links.length < MAX_PROFILE_LINKS ? (
          <Button size="sm" disabled={!ent.links} className="justify-self-start" onClick={() => set('links', [...draft.links, { platform: 'steam', url: '', label: '' }])}>
            <Plus className="size-3.5" /> Add profile link
          </Button>
        ) : null}
      </Perk>

      <Perk title="Avatar frame" held={ent.frame} hint="Pick a frame to sit around your avatar on your public profile.">
        <div className="grid grid-cols-2 gap-2">
          {AVATAR_FRAMES.map((f) => {
            const active = draft.frame === f.id
            return (
              <button
                key={f.id}
                type="button"
                disabled={!ent.frame}
                aria-pressed={active}
                onClick={() => set('frame', f.id)}
                className={cn('kryo-radius grid gap-0.5 border p-3 text-left', active ? 'border-primary bg-primary/5 ring-2 ring-primary/40' : 'border-border/80 bg-card/40')}
              >
                <span className="text-xs font-semibold text-foreground">{f.name}</span>
                <span className="text-[10px] leading-tight text-muted-foreground">{f.description}</span>
              </button>
            )
          })}
        </div>
        {ent.frame ? <Caption>Chosen: {frameLabel}</Caption> : null}
      </Perk>

      <Perk title="Custom status & tagline" held={ent.status} hint="Shown under your display name on your public profile.">
        <div className="flex items-center gap-2">
          <div className="w-14 shrink-0 [&_input]:px-0 [&_input]:text-center [&_input]:text-base">
            <TextField
              value={draft.statusIcon}
              onChange={(v) => {
                if (v.trim() === '') return set('statusIcon', '')
                const emoji = lastGrapheme(v)
                if (isSingleEmoji(emoji)) set('statusIcon', normalizeStatusEmoji(emoji) ?? draft.statusIcon)
              }}
              disabled={!ent.status}
              placeholder="🙂"
              label="Status emoji"
            />
          </div>
          <div className="min-w-0 flex-1">
            <TextField value={draft.status} onChange={(v) => set('status', v)} max={MAX_CUSTOM_STATUS_LENGTH} placeholder="Set a custom tagline or gaming status…" disabled={!ent.status} label="Custom status" />
          </div>
        </div>
        <div className="flex items-center justify-between">
          {draft.status ? (
            <Button size="sm" variant="ghost" disabled={!ent.status} onClick={() => set('status', '')}>
              Clear status
            </Button>
          ) : (
            <span />
          )}
          <Caption>
            {draft.status.length} / {MAX_CUSTOM_STATUS_LENGTH}
          </Caption>
        </div>
      </Perk>

      <Panel title="Privacy">
        <ToggleRow label="Public profile" hint={`Anyone can view kryo.to/user/${me.username}`} checked={draft.isProfilePublic} onChange={(v) => set('isProfilePublic', v)} />
        <ToggleRow label="Show my library on my profile" hint="Your game statuses and counts are visible to others" checked={draft.isLibraryPublic} onChange={(v) => set('isLibraryPublic', v)} />
        <ToggleRow
          label="Anonymous mode"
          hint="Hide your name and avatar from public viewers everywhere on the site: comments, leaderboards and your profile page"
          checked={draft.isAnonymous}
          onChange={(v) => set('isAnonymous', v)}
        />
      </Panel>

      <LinkOut label="View my profile" url={`${API}/user/${me.username}`} />

      <SaveBar dirty={dirty} busy={busy} onSave={() => void save()} onReset={reset} status={say} />

      {crop ? (
        <Cropper
          file={crop.file}
          shape={crop.kind === 'avatar' ? 'circle' : 'banner'}
          title={crop.kind === 'avatar' ? 'Edit avatar' : 'Edit banner'}
          onCancel={() => setCrop(null)}
          onApply={(blob, preview) => {
            stage(crop.kind, { blob, animated: false }, preview)
            setCrop(null)
          }}
        />
      ) : null}
    </div>
  )
}

/** The mark on the picture that is in use. */
function Tick() {
  return (
    <span className="absolute inset-0 grid place-items-center bg-black/40">
      <CheckIcon className="size-4 text-white" />
    </span>
  )
}

/** A perk-gated block: its controls render disabled, with the reason and a way to get the perk, until the account holds it. */
function Perk({ title, held, hint, children }: { title: string; held: boolean; hint: string; children: ReactNode }) {
  return (
    <Panel title={title}>
      {held ? null : (
        <div className="grid gap-2">
          <Caption className="flex items-center gap-1.5">
            <Lock className="size-3" /> Supporter perk
          </Caption>
          <LinkOut label="See the perks on kryo.to" url={`${API}/perks`} />
        </div>
      )}
      <div className={cn('grid gap-2.5', !held && 'pointer-events-none opacity-50')} aria-disabled={!held}>
        {children}
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">{hint}</p>
    </Panel>
  )
}
