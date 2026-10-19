import { useEffect, useRef, useState } from 'react'
import { Busy, Check, Segmented } from '@/ui'
import type { Me } from '@/mobile/auth'
import { useApp } from '@/mobile/context'
import { applyLook } from '@/mobile/look'
import { store } from '@/mobile/storage'
import type { PhoneLook } from '@/mobile/types'
import { acct } from '@/mobile/account/api'
import { FieldRow, Panel, SaveBar, Status } from '@/mobile/account/forms'

/*
 * Choices and wording come from kryo.to: lib/palette.ts (PALETTE_OPTIONS),
 * lib/radius.ts (RADIUS_OPTIONS), lib/typeface.ts (TYPEFACE_OPTIONS),
 * lib/appearance.ts (APPEARANCE_THEMES, cleanAppearancePatch), lib/nsfw.ts
 * (modeFromAccount), lib/seasonal.ts (SEASONS, SEASON_IDS) and
 * components/auth/appearance-section.tsx. Left out on purpose: the web-only
 * Kryoto info pill, home greeting, haptics, aura and the desktop intro.
 */

type Theme = 'system' | 'light' | 'dark'
type Nsfw = 'hide' | 'blur' | 'show'
type Motion = 'full' | 'reduced'

const THEMES: { value: Theme; label: string; hint: string }[] = [
  { value: 'system', label: 'System', hint: "Follow this device's light or dark setting." },
  { value: 'light', label: 'Light', hint: 'Always use the light mode.' },
  { value: 'dark', label: 'Dark', hint: 'Always use the dark mode.' },
]
const PALETTES = [
  { value: 'monochrome', label: 'Monochrome', hint: 'Black, white and grey.' },
  { value: 'oled', label: 'Black', hint: 'Near-black backgrounds in dark mode.' },
  { value: 'amber', label: 'Amber', hint: 'Amber and brown.' },
  { value: 'emerald', label: 'Green', hint: 'Green text and backgrounds.' },
  { value: 'nord', label: 'Slate', hint: 'Muted blue and grey.' },
  { value: 'sepia', label: 'Sepia', hint: 'Brown and cream.' },
  { value: 'blossom', label: 'Pink', hint: 'Pink and mauve.' },
] as const
const TYPEFACES = [
  { value: 'regular', label: 'Teletext', hint: 'The pixel font. Default.' },
  { value: 'mono', label: 'Mono', hint: 'Geist Mono.' },
] as const
const RADII = [
  { value: 'sharp', label: 'Sharp', hint: 'Square corners.' },
  { value: 'soft', label: 'Soft', hint: 'Slightly rounded corners.' },
  { value: 'rounded', label: 'Rounded', hint: 'Rounded corners.' },
  { value: 'round', label: 'Round', hint: 'Rounder corners and pill-shaped buttons.' },
  { value: 'pill', label: 'Pill', hint: 'The roundest corners and buttons. Default.' },
] as const
const MOTIONS: { value: Motion; label: string; hint: string }[] = [
  { value: 'full', label: 'Full', hint: 'Enable transitions and button animations.' },
  { value: 'reduced', label: 'Reduced', hint: 'Reduce animations on the site and in Kryoto Desktop.' },
]
const NSFW: { value: Nsfw; label: string; hint: string }[] = [
  { value: 'hide', label: 'Hide', hint: 'Adult games are left off the site for you: the board, Browse, search, recommendations, collections and profiles. Their own pages say they are hidden.' },
  { value: 'blur', label: 'Blur', hint: "Covers are blurred everywhere, and a game's page asks before it shows anything." },
  { value: 'show', label: 'Show', hint: 'Adult games and their covers show like any other, with no blur or warning.' },
]
const SEASON_MODES = [
  { value: 'auto', label: 'Automatic each year' },
  { value: 'off', label: 'Off' },
] as const
const SEASONS = [
  { id: 'halloween', label: 'Halloween', schedule: 'October 1 to 31, every year', description: 'Pumpkin orange, cobwebs and a jack-o-lantern throughout October.' },
  { id: 'christmas', label: 'Christmas', schedule: 'December 1 to 26, every year', description: 'Evergreen accents, warm lights and falling snow.' },
  { id: 'new-year', label: 'New Year', schedule: 'December 27 to January 7, every year', description: 'A countdown to midnight, an animated ASCII greeting and a burst of colorful confetti.' },
  { id: 'valentine', label: "Valentine's Day", schedule: 'February 10 to 14, every year', description: 'Rose accents and floating hearts.' },
  { id: 'easter', label: 'Easter', schedule: 'Good Friday to Easter Monday, every year', description: 'Fresh spring colors and drifting flowers.' },
  { id: 'winter', label: 'Winter', schedule: 'January 8 to February 9, every year', description: 'Icy blue accents and soft snowfall.' },
] as const

type Look = { theme: Theme; palette: string; typeface: string; radius: string; motion: Motion; nsfw: Nsfw }
type Seasons = { mode: 'auto' | 'off'; disabled: string[] }

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback)

function lookFromMe(me: Me | null): Look {
  return {
    // Desktop's effectiveLook falls back to dark for an account that never chose.
    theme: pick(me?.appearanceTheme, ['system', 'light', 'dark'] as const, 'dark'),
    palette: pick(me?.appearancePalette, PALETTES.map((p) => p.value), 'monochrome'),
    typeface: pick(me?.appearanceTypeface, ['regular', 'mono'] as const, 'regular'),
    radius: pick(me?.appearanceRadius, RADII.map((r) => r.value), 'pill'),
    motion: me?.appearanceMotion === 'reduced' ? 'reduced' : 'full',
    nsfw: me?.appearanceNsfwHide ? 'hide' : me?.appearanceNsfwBlur === false ? 'show' : 'blur',
  }
}


/** The phone's own look, so a save shows at once. 'system' is settled by this device, since the phone's applyLook only knows light and dark. */
function toPhoneLook(look: Look, seasons: Seasons | null): PhoneLook {
  const dark = look.theme === 'system' ? matchMedia('(prefers-color-scheme: dark)').matches : look.theme === 'dark'
  const current = store.look()?.season ?? null
  const season = current && seasons && seasons.mode === 'auto' && !seasons.disabled.includes(current) ? current : null
  return { theme: dark ? 'dark' : 'light', palette: look.palette, radius: look.radius, font: look.typeface === 'mono' ? 'mono' : 'teletext', season, reducedMotion: look.motion === 'reduced' }
}

const hintOf = <T extends { value: string; hint: string }>(options: readonly T[], value: string) => options.find((o) => o.value === value)?.hint

/** Settings > Appearance: what the account looks like everywhere, saved to kryo.to and applied on this phone. */
export function AppearanceTab() {
  const { token, me, link, reloadMe, fail } = useApp()

  const [saved, setSaved] = useState<Look>(() => lookFromMe(me))
  const [look, setLook] = useState<Look>(saved)
  const [savedSeasons, setSavedSeasons] = useState<Seasons | null>(null)
  const [seasons, setSeasons] = useState<Seasons | null>(null)
  const [seasonError, setSeasonError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ msg: string; ok: boolean } | null>(null)

  // The account is the source of truth: take it again whenever it reloads, but never over an edit in progress.
  const dirtyRef = useRef(false)
  useEffect(() => {
    if (dirtyRef.current) return
    const next = lookFromMe(me)
    setSaved(next)
    setLook(next)
  }, [me])

  useEffect(() => {
    let live = true
    acct<{ preferences?: { seasonalMode?: string; disabledSeasons?: string[] } }>(token, '/api/account/ui-preferences')
      .then((r) => {
        if (!live) return
        const next: Seasons = { mode: r.preferences?.seasonalMode === 'off' ? 'off' : 'auto', disabled: r.preferences?.disabledSeasons ?? [] }
        setSavedSeasons(next)
        setSeasons(next)
      })
      .catch((e) => live && setSeasonError(fail(e)))
    return () => {
      live = false
    }
    // fail only reads fresh context; the preferences load once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const lookDirty = look.theme !== saved.theme || look.palette !== saved.palette || look.typeface !== saved.typeface || look.radius !== saved.radius || look.motion !== saved.motion || look.nsfw !== saved.nsfw
  const seasonsDirty = seasons !== null && savedSeasons !== null && (seasons.mode !== savedSeasons.mode || [...seasons.disabled].sort().join() !== [...savedSeasons.disabled].sort().join())
  const dirty = lookDirty || seasonsDirty
  dirtyRef.current = dirty

  const set = <K extends keyof Look>(key: K, value: Look[K]) => {
    setStatus(null)
    setLook((l) => ({ ...l, [key]: value }))
  }
  const setSeasonMode = (mode: Seasons['mode']) => {
    setStatus(null)
    setSeasons((s) => (s ? { ...s, mode } : s))
  }
  const toggleSeason = (id: string, on: boolean) => {
    setStatus(null)
    setSeasons((s) => (s ? { ...s, disabled: on ? s.disabled.filter((d) => d !== id) : [...s.disabled.filter((d) => d !== id), id] } : s))
  }

  function reset() {
    setLook(saved)
    setSeasons(savedSeasons)
    setStatus(null)
  }

  async function save() {
    setBusy(true)
    setStatus(null)
    let lookSaved = saved
    let seasonsSaved = savedSeasons
    let failure: string | null = null
    if (lookDirty) {
      try {
        await acct(token, '/api/account/appearance', {
          method: 'PATCH',
          body: { theme: look.theme, palette: look.palette, typeface: look.typeface, radius: look.radius, motion: look.motion, nsfwBlur: look.nsfw !== 'show', nsfwHide: look.nsfw === 'hide' },
        })
        lookSaved = look
        setSaved(look)
      } catch (e) {
        failure = fail(e)
      }
    }
    if (seasonsDirty && seasons) {
      try {
        await acct(token, '/api/account/ui-preferences', { method: 'PATCH', body: { seasonalMode: seasons.mode, disabledSeasons: seasons.disabled } })
        seasonsSaved = seasons
        setSavedSeasons(seasons)
      } catch (e) {
        failure = failure ?? fail(e)
      }
    }
    if (lookSaved !== saved || seasonsSaved !== savedSeasons) {
      const phone = toPhoneLook(lookSaved, seasonsSaved)
      store.setLook(phone)
      applyLook(phone)
      dirtyRef.current = false
      await reloadMe().catch(() => {})
    }
    setStatus(failure ? { msg: failure, ok: false } : { msg: 'Appearance saved to your K// account.', ok: true })
    setBusy(false)
  }

  return (
    <>
      <p className="text-xs leading-relaxed text-muted-foreground">Choose how Kryoto looks everywhere you use this K// account.</p>
      {link.snapshot?.look ? <p className="text-[11px] leading-relaxed text-muted-foreground">While this phone is linked to your PC, it follows the PC&rsquo;s look.</p> : null}

      <Panel title="Seasonal styles">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Each style arrives on its own dates and your usual appearance returns afterwards. Only one style runs at a time. Turn seasonal styles off any time; they stay off until you enable them again.
        </p>
        {seasons ? (
          <>
            <Segmented label="Seasonal styles" value={seasons.mode} options={SEASON_MODES.map((m) => ({ value: m.value, label: m.label }))} onChange={setSeasonMode} />
            <div className="grid gap-3">
              {SEASONS.map((s) => (
                <div key={s.id} className="grid gap-1 border-b border-border pb-3 last:border-b-0 last:pb-0">
                  <Check checked={!seasons.disabled.includes(s.id)} onChange={(on) => toggleSeason(s.id, on)} label={s.label} />
                  <p className="pl-[1.625rem] text-[11px] leading-relaxed text-muted-foreground">
                    {s.schedule}. {s.description}
                  </p>
                </div>
              ))}
            </div>
          </>
        ) : seasonError ? (
          <Status msg={seasonError} />
        ) : (
          <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Busy className="size-3" /> Loading your seasonal styles
          </p>
        )}
      </Panel>

      <Panel title="Look">
        <FieldRow label="Mode" hint={hintOf(THEMES, look.theme)}>
          <Segmented label="Mode" value={look.theme} options={THEMES} onChange={(v) => set('theme', v)} />
        </FieldRow>
        <FieldRow label="Palette" hint={hintOf(PALETTES, look.palette)}>
          <Segmented label="Palette" value={look.palette} options={PALETTES.map((p) => ({ value: p.value, label: p.label }))} onChange={(v) => set('palette', v)} />
        </FieldRow>
        <FieldRow label="Typeface" hint={hintOf(TYPEFACES, look.typeface)}>
          <Segmented label="Typeface" value={look.typeface} options={TYPEFACES.map((t) => ({ value: t.value, label: t.label }))} onChange={(v) => set('typeface', v)} />
        </FieldRow>
        <FieldRow label="Corners" hint={hintOf(RADII, look.radius)}>
          <Segmented label="Corners" value={look.radius} options={RADII.map((r) => ({ value: r.value, label: r.label }))} onChange={(v) => set('radius', v)} />
        </FieldRow>
        <FieldRow label="Motion" hint={hintOf(MOTIONS, look.motion)}>
          <Segmented label="Motion" value={look.motion} options={MOTIONS} onChange={(v) => set('motion', v)} />
        </FieldRow>
        <FieldRow label="Adult / NSFW games" hint={hintOf(NSFW, look.nsfw)}>
          <Segmented label="Adult games" value={look.nsfw} options={NSFW} onChange={(v) => set('nsfw', v)} />
        </FieldRow>
      </Panel>

      <SaveBar dirty={dirty} busy={busy} onSave={() => void save()} onReset={reset} status={status} />
    </>
  )
}
