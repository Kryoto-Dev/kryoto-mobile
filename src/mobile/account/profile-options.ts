/*
 * What the profile editor needs from kryo.to, copied rather than imported: the
 * site's own modules are server code and cannot be bundled into the app. Each
 * block names the file it was copied from; change them together.
 *
 *   lib/profile-customization.ts   accent presets, platforms, frames, status emoji
 *   lib/profile-location.ts        country codes, text limit, display names
 *   lib/donation-tiers.ts          name and bio limits, rank order, perk gates
 *   lib/novarys-art.ts             the banners anyone may pick, the default one
 *   lib/profile-media.ts           banner shape and output sizes
 *   components/ui/image-crop-modal.tsx   output quality, webp
 *   lib/supporter-perks.ts         which file types can move (see media.ts)
 */

/** The country's English name, as the site shows it. */
const countryName = (code: string) => new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code

// ---- lib/donation-tiers.ts -------------------------------------------------

export const DISPLAY_NAME_LIMIT = 80
export const BIO_LIMIT_DEFAULT = 500
export const BIO_LIMIT_PATRON = 1500

/** DONATION_TIERS, lowest first. */
const TIER_ORDER = ['supporter', 'backer', 'patron', 'sponsor']

function tierAtLeast(tier: string | null | undefined, floor: string): boolean {
  if (!tier) return false
  const at = TIER_ORDER.indexOf(tier)
  return at >= 0 && at >= TIER_ORDER.indexOf(floor)
}

/** What this account may edit. Perks one by one, never ranks alone: a tester can buy profile links for a month (settings-client.tsx ProfileSection). */
export function profileEntitlements(perks: readonly string[] | undefined, tier: string | null | undefined, isSupporter: boolean | undefined) {
  const held = perks ?? []
  return {
    accent: held.includes('profile_accent') || tierAtLeast(tier, 'backer'),
    links: held.includes('profile_links') || tierAtLeast(tier, 'backer'),
    frame: held.includes('avatar_frame') || tierAtLeast(tier, 'patron'),
    status: held.includes('custom_status') || tierAtLeast(tier, 'patron'),
    animated: Boolean(isSupporter || held.includes('animated_media')),
    /** The perk, or the rank (bioLimitForTier, bioLimitForPerks): the larger. */
    bioLimit: Math.max(tierAtLeast(tier, 'patron') ? BIO_LIMIT_PATRON : BIO_LIMIT_DEFAULT, held.includes('long_bio') ? BIO_LIMIT_PATRON : BIO_LIMIT_DEFAULT),
  }
}

// ---- lib/profile-customization.ts -----------------------------------------

export type ProfilePlatform = 'steam' | 'discord' | 'github' | 'twitch' | 'youtube' | 'website'
export type ProfileLinkDraft = { platform: ProfilePlatform; url: string; label: string }

export const PLATFORM_INFO: Record<ProfilePlatform, { name: string; placeholder: string }> = {
  steam: { name: 'Steam', placeholder: 'https://steamcommunity.com/id/...' },
  discord: { name: 'Discord', placeholder: 'discord.gg/invite or username' },
  github: { name: 'GitHub', placeholder: 'https://github.com/...' },
  twitch: { name: 'Twitch', placeholder: 'https://twitch.tv/...' },
  youtube: { name: 'YouTube', placeholder: 'https://youtube.com/@...' },
  website: { name: 'Website', placeholder: 'https://example.com' },
}

export const PLATFORM_OPTIONS = (Object.keys(PLATFORM_INFO) as ProfilePlatform[]).map((p) => ({ value: p, label: PLATFORM_INFO[p].name }))

export function isProfilePlatform(value: unknown): value is ProfilePlatform {
  return typeof value === 'string' && value in PLATFORM_INFO
}

export const MAX_PROFILE_LINKS = 4
/** The label field's own cap in the web form (the server keeps 40). */
export const LINK_LABEL_LIMIT = 30
export const MAX_CUSTOM_STATUS_LENGTH = 60

export const PROFILE_ACCENT_PRESETS = [
  { id: 'cyan', name: 'Cyan', hex: '#00f0ff' },
  { id: 'violet', name: 'Violet', hex: '#a855f7' },
  { id: 'emerald', name: 'Emerald', hex: '#22c55e' },
  { id: 'amber', name: 'Amber', hex: '#f59e0b' },
  { id: 'crimson', name: 'Crimson', hex: '#ef4444' },
  { id: 'glacier', name: 'Ice', hex: '#38bdf8' },
  { id: 'pink', name: 'Pink', hex: '#ec4899' },
  { id: 'gold', name: 'Gold', hex: '#eab308' },
]

export type AvatarFrameId = 'none' | 'pixel-crt' | 'cyber-circuit' | 'neon-pulse' | 'glitch-matrix' | 'star-orbit'

export const AVATAR_FRAMES: { id: AvatarFrameId; name: string; description: string }[] = [
  { id: 'none', name: 'None', description: 'No frame' },
  { id: 'pixel-crt', name: 'Pixel', description: 'Pixel border with a moving scanline' },
  { id: 'cyber-circuit', name: 'Circuit', description: 'Circuit border with a moving light' },
  { id: 'neon-pulse', name: 'Pulse', description: 'Glowing border with expanding rings' },
  { id: 'glitch-matrix', name: 'Glitch', description: 'Crosshair border that briefly breaks apart' },
  { id: 'star-orbit', name: 'Orbit', description: 'Pixel stars circle your avatar' },
]

export function frameIdOf(value: string | null | undefined): AvatarFrameId {
  return AVATAR_FRAMES.find((f) => f.id === value)?.id ?? 'none'
}

/** The eight ids the status icon used before it was any emoji; read, never written. */
const STATUS_EMOJI_LEGACY: Record<string, string> = {
  gamepad: '🎮',
  sparkles: '✨',
  zap: '⚡',
  flame: '🔥',
  coffee: '☕',
  star: '⭐',
  skull: '💀',
  heart: '❤️',
}

/** What the status icon shows until one is chosen. */
export const DEFAULT_STATUS_ICON = '✨'

/** The first grapheme when it is an emoji or a flag, else null. A pasted string longer than one emoji keeps only its first. */
export function normalizeStatusEmoji(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (!trimmed) return null
  if (STATUS_EMOJI_LEGACY[trimmed]) return STATUS_EMOJI_LEGACY[trimmed]!
  const first = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? [...new Intl.Segmenter().segment(trimmed)][0]?.segment : [...trimmed][0]
  if (!first) return null
  const isEmoji = /\p{Extended_Pictographic}/u.test(first)
  const isFlag = /^\p{Regional_Indicator}{2}$/u.test(first)
  if (!isEmoji && !isFlag) return null
  return first.length <= 32 ? first : null
}

/** True when the text is exactly one emoji grapheme (the status field accepts nothing else). */
export function isSingleEmoji(input: string): boolean {
  const emoji = normalizeStatusEmoji(input)
  return emoji !== null && [...new Intl.Segmenter().segment(input.trim())].length === 1
}

// ---- lib/profile-location.ts ----------------------------------------------

export const LOCATION_TEXT_LIMIT = 80

export type LocationDraft = { country: string; state: string; city: string }
export const EMPTY_LOCATION: LocationDraft = { country: '', state: '', city: '' }

/** "Do not show a location", then every country by its English name. */
export function countryOptions(): { value: string; label: string }[] {
  return [
    { value: '', label: 'Do not show a location' },
    ...COUNTRY_CODES.map((value) => ({ value, label: countryName(value) })).sort((a, b) => a.label.localeCompare(b.label)),
  ]
}

// ISO 3166-1 regions, as kryo.to accepts them.
const COUNTRY_CODES =
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(
    ' ',
  )

// ---- lib/novarys-art.ts ----------------------------------------------------

export const ART_CREDIT = 'novarys4619'
const ART_DIR = '/art/novarys'
const bannerPath = (id: string) => `${ART_DIR}/banners/${id}.webp`

/** [id, title, fav, light] of DESKTOP_ART: `fav` feeds the default-banner pool, `light` (drawn on white) never does. */
const DESKTOP_ART: [string, string, boolean, boolean][] = [
  ['gold-signal', 'Gold Signal', false, false],
  ['green-signal', 'Green Signal', true, false],
  ['ice-lines', 'Ice Lines', true, false],
  ['weave', 'Weave', true, false],
  ['weave-light', 'Weave, light', true, true],
  ['amber', 'Amber', true, false],
  ['loops-light', 'Loops, light', true, true],
  ['blueprint', 'Blueprint', false, false],
  ['waves', 'Waves', true, false],
  ['echo', 'Echo', true, false],
  ['echo-grey', 'Echo Grey', true, false],
  ['skyline', 'Skyline', true, false],
  ['skyline-deep', 'Skyline, deep', true, false],
  ['grid', 'Grid', true, false],
  ['horizon', 'Horizon', true, false],
  ['horizon-deep', 'Horizon, deep', true, false],
  ['roots', 'Roots', true, false],
  ['cloud', 'Cloud', true, false],
  ['frame-ascii', 'Frame', true, false],
  ['frame-dark', 'Frame, dark', true, false],
  ['frame-dim', 'Frame, dim', true, false],
  ['whisper', 'Whisper', true, false],
  ['green-glow', 'Green Glow', true, false],
  ['teal-trace', 'Teal Trace', true, false],
  ['swirl', 'Swirl', true, false],
  ['green-type', 'Green Type', true, false],
  ['blue-type', 'Blue Type', true, false],
  ['ice-paint', 'Ice', true, false],
  ['k-lines', 'K Lines', true, false],
  ['sketch', 'Sketch', false, false],
  ['dusk', 'Dusk', false, false],
  ['draft', 'Draft', false, false],
]

const ANIMATED_BANNER = { id: 'construct-live', title: 'Construct, live' }
export const ANIMATED_BANNER_PATH = bannerPath(ANIMATED_BANNER.id)
export const ANIMATED_BANNER_STILL = `${ART_DIR}/banners/${ANIMATED_BANNER.id}-still.webp`

/** Every banner someone may pick, still ones first. `path` is what is stored; it is relative to kryo.to. */
export const STOCK_BANNERS: { id: string; title: string; path: string; animated: boolean }[] = [
  ...DESKTOP_ART.map(([id, title]) => ({ id, title, path: bannerPath(id), animated: false })),
  { id: ANIMATED_BANNER.id, title: ANIMATED_BANNER.title, path: ANIMATED_BANNER_PATH, animated: true },
]

const DEFAULT_POOL = DESKTOP_ART.filter(([, , fav, light]) => fav && !light)

/** The banner an account shows until it picks one, from its id (same hash as the site). */
export function defaultBannerFor(userId: string): string {
  let h = 2166136261
  for (const ch of userId) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return bannerPath(DEFAULT_POOL[(h >>> 0) % DEFAULT_POOL.length]![0])
}

// ---- lib/profile-media.ts, components/ui/image-crop-modal.tsx --------------

/** Width divided by height. */
export const BANNER_ASPECT = 3
export const BANNER_OUTPUT_WIDTH = 1500
export const BANNER_OUTPUT_HEIGHT = 500
export const AVATAR_OUTPUT_SIZE = 512
/** The crop is written as WebP at this quality (PNG when the browser cannot). */
export const CROP_QUALITY = 0.92
export const ANIMATED_STILL_NOTICE = 'Animated avatars and banners are a supporter perk - this will be saved as a still frame.'
