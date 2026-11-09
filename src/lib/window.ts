import { API, openExternal as open } from '@/mobile/auth'

/**
 * Kryoto Mobile's answer to Kryoto Desktop's lib/window.ts, for the shared
 * screens: the phone has no Store window, so a page of the site opens in the
 * phone's browser.
 */
export const openExternal = (url: string) => open(url)
export const openStorePage = (path: string) => void open(`${API}${path}`)
