import { siteUrl } from '@/mobile/auth'

/** Kryoto Mobile's answer to Kryoto Desktop's lib/art.ts, for the shared chat screens: no art cache here, the address as it is. */
export const artSrc = (url: string | null | undefined): string | null => siteUrl(url?.trim() || null)
