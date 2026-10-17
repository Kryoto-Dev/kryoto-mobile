import { onBackButtonPress } from '@tauri-apps/api/app'
import { cancel, checkPermissions, Format, requestPermissions, scan } from '@tauri-apps/plugin-barcode-scanner'

/**
 * Opens the camera and resolves with the first QR code's text.
 *
 * Android's back button cancels the scan. Without that, Back closed the app
 * while the scan was still waiting, and the app crashed on the way out
 * ("pthread_mutex_lock called on a destroyed mutex"): the QR crash players saw.
 * The camera takes the whole screen (the plugin's own view: its windowed mode
 * left the camera black behind the page on Android), so Back is the way out.
 */
export async function scanQr(): Promise<string> {
  let access = await checkPermissions()
  if (access !== 'granted') access = await requestPermissions()
  if (access !== 'granted') throw new Error('Allow camera access to scan, or type the address and code instead.')

  let cancelled = false
  const back = await onBackButtonPress(() => {
    cancelled = true
    void cancel().catch(() => {})
  }).catch(() => null)
  try {
    const found = await scan({ formats: [Format.QRCode] })
    return found.content
  } catch (e) {
    if (cancelled) throw new ScanCancelled()
    throw e instanceof Error ? e : new Error(String(e))
  } finally {
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
