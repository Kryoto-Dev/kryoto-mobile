import { checkPermissions, Format, requestPermissions, scan } from '@tauri-apps/plugin-barcode-scanner'

/** Opens the camera and resolves with the first QR code's text. */
export async function scanQr(): Promise<string> {
  let access = await checkPermissions()
  if (access !== 'granted') access = await requestPermissions()
  if (access !== 'granted') throw new Error('Allow camera access to scan, or type the address and code instead.')
  const found = await scan({ formats: [Format.QRCode] })
  return found.content
}
