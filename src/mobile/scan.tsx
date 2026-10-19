import { createRoot } from 'react-dom/client'
import { onBackButtonPress } from '@tauri-apps/api/app'
import { cancel, checkPermissions, Format, requestPermissions, scan } from '@tauri-apps/plugin-barcode-scanner'
import { ScanScreen, type ScanEnd } from '@/mobile/ScanScreen'

/** What the scan screen tells the player about the code they are looking for. */
export type ScanPrompt = { title: string; hint: string; steps: string[] }

/**
 * Opens the camera and resolves with the first QR code's text.
 *
 * The camera is the plugin's native view behind the web view (`windowed`),
 * which is made see-through for the scan (`data-scanning` on <html>); the
 * app's own screen (ScanScreen) covers all of it but a square window.
 * Android's back button, or the screen's Cancel, ends the scan. Without the
 * back handler, Back closed the app while the scan was still waiting, and the
 * app crashed on the way out ("pthread_mutex_lock called on a destroyed
 * mutex"): the QR crash players saw.
 */
export async function scanQr(prompt: ScanPrompt): Promise<string> {
  let access = await checkPermissions()
  if (access !== 'granted') access = await requestPermissions()
  if (access !== 'granted') throw new Error('Allow camera access to scan, or type the address and code instead.')

  let cancelled = false
  const stop = () => {
    cancelled = true
    void cancel().catch(() => {})
  }
  const back = await onBackButtonPress(stop).catch(() => null)
  // Outside #root, which is hidden while the camera shows.
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const draw = (ending: ScanEnd) => root.render(<ScanScreen {...prompt} ending={ending} onCancel={stop} />)
  draw(null)
  document.documentElement.dataset.scanning = '1'
  let ending: ScanEnd = 'cancelled'
  try {
    const found = await scan({ windowed: true, formats: [Format.QRCode] })
    ending = 'found'
    return found.content
  } catch (e) {
    if (cancelled) throw new ScanCancelled()
    throw e instanceof Error ? e : new Error(String(e))
  } finally {
    // The window closes back to a point, then the app comes back; the caller carries on meanwhile.
    draw(ending)
    window.setTimeout(() => delete document.documentElement.dataset.scanning, 280)
    window.setTimeout(() => {
      root.unmount()
      host.remove()
    }, 460)
    // Back goes back to working as before: through the app's own pages.
    void back?.unregister().catch(() => {})
  }
}

/** Back during a scan: nothing to tell the player. */
export class ScanCancelled extends Error {
  constructor() {
    super('Scan cancelled.')
    this.name = 'ScanCancelled'
  }
}
