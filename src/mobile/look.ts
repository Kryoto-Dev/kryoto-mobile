import { setLightBars } from '@/mobile/bars'
import type { PhoneLook } from '@/mobile/types'

/**
 * Stamp the PC's look on <html>, as Kryoto Desktop does for its own window
 * (src/lib/settings.ts `applyLook`): the palette, corners, typeface, theme and
 * season are data attributes the shared stylesheet reads.
 */
export function applyLook(look: PhoneLook) {
  const html = document.documentElement
  const dark = look.theme !== 'light'
  html.classList.toggle('dark', dark)
  html.style.colorScheme = dark ? 'dark' : 'light'
  setLightBars(!dark)
  html.dataset.palette = look.palette
  html.dataset.radius = look.radius
  if (look.reducedMotion) html.dataset.motion = 'reduced'
  else delete html.dataset.motion
  if (look.season) html.dataset.season = look.season
  else delete html.dataset.season
  if (look.font === 'mono') html.dataset.font = 'mono'
  else delete html.dataset.font
}
