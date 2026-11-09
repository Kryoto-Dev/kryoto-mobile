/**
 * The Android side (MainActivity.kt) draws the app edge to edge, under the
 * status bar, the camera cut-out and the gesture bar, and tells the page how
 * far in its own content must stay: as CSS pixels in `--sat`, `--sab`,
 * `--sal` and `--sar`. (The WebView's `env(safe-area-inset-*)` stays 0.)
 */
type Insets = { top: number; bottom: number; left: number; right: number; keyboard?: boolean }

interface Bars {
  insets(): string
  light(on: boolean): void
}

declare global {
  interface Window {
    KryoBars?: Bars
    __kryoInsets?: (insets: Insets) => void
  }
}

function setInsets(i: Insets) {
  const style = document.documentElement.style
  style.setProperty('--sat', `${i.top}px`)
  style.setProperty('--sab', `${i.bottom}px`)
  style.setProperty('--sal', `${i.left}px`)
  style.setProperty('--sar', `${i.right}px`)
  // The tab bar steps aside for it (motion.css): it would sit on the form being filled in.
  document.documentElement.toggleAttribute('data-keyboard', !!i.keyboard)
}

/** Take the insets now, and again whenever they change (rotation, keyboard). */
export function trackSystemBars() {
  window.__kryoInsets = setInsets
  const now = window.KryoBars?.insets()
  if (now) setInsets(JSON.parse(now) as Insets)
}

/** Dark icons for a light theme, light icons for a dark one. */
export function setLightBars(light: boolean) {
  window.KryoBars?.light(light)
}
