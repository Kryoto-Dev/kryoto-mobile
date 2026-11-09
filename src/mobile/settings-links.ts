import { anchorId } from '@/lib/setting-anchor'

/**
 * Places in Kryoto Mobile's settings. The phone has no Settings page of its
 * own: what can be set lives in the Profile tab's sections. A toast that names
 * one opens it (`setting` in `ToastOptions`): the tab switches, the section
 * scrolls into view and lights for a moment, as on kryo.to and Kryoto Desktop.
 */

export type MobileSetting = 'remote'

/** How long the target stays lit. Matches `kryo-deep-link-flash` in styles.css. */
const FLASH_MS = 2000

/** Wait for the anchor (the tab is only now being shown), then scroll to it and light it up. */
export function revealSetting(anchor: string): void {
  const started = Date.now()
  const attempt = () => {
    const el = document.getElementById(anchorId(anchor))
    if (!el) {
      if (Date.now() - started < 3000) window.setTimeout(attempt, 80)
      return
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.remove('kryo-deep-link-target')
    void el.offsetWidth
    el.classList.add('kryo-deep-link-target')
    window.setTimeout(() => el.classList.remove('kryo-deep-link-target'), FLASH_MS)
  }
  attempt()
}
