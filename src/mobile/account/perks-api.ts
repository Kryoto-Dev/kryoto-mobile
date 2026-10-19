import { acct } from '@/mobile/account/api'

/**
 * Mirrors kryo.to `lib/perks-view.ts` (`PerksView`, served by
 * `GET /api/account/perks`) and `PerkRow` in `components/perks/perks-client.tsx`.
 * Ids are plain strings here: the server's `PerkId` / `DonationTierId` unions
 * grow without an app release.
 */
export type PerkRow = {
  id: string
  label: string
  text: string
  tier: string
  tierName: string
  held: boolean
  /** Comes with the supporter rank this account holds. */
  fromRank: boolean
  /** Held through a Kryos purchase rather than a rank: until when (ISO). */
  boughtUntil: string | null
}

export type PerksView = {
  tier: string | null
  totalUsd: number
  expiresAt: string | null
  next: { id: string; name: string; at: number } | null
  perks: PerkRow[]
  trials: { allowance: number; used: number; nextBackAt: string | null; live: boolean }
  effects: string[]
  nameEffect: string | null
  kryos: number
  rep: number
  name: string
}

/** Copied from kryo.to `lib/text-effects.ts` `TEXT_EFFECT_LABEL`. */
export const TEXT_EFFECT_LABEL: Record<string, string> = {
  rainbow: 'Rainbow',
  neon: 'Neon',
  gold: 'Gold',
  frost: 'Frost',
  glitch: 'Glitch',
  wave: 'Wave',
  fire: 'Fire',
  aurora: 'Aurora',
  prism: 'Prism',
  hologram: 'Hologram',
  eclipse: 'Eclipse',
}

export const loadPerks = (token: string | null) => acct<PerksView>(token, '/api/account/perks')

/** `POST /api/account/name-effect { effect }`, null clears it. Answers `{ effect }`. */
export const setNameEffect = (token: string | null, effect: string | null) =>
  acct<{ effect: string | null }>(token, '/api/account/name-effect', { method: 'POST', body: { effect } })
