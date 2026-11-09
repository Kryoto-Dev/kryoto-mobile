import { API } from '@/mobile/auth'
import { ApiError, request } from '@/mobile/net'
import { mobileAction } from '@/mobile/platform'

/**
 * kryo.to and the gateway for the chat engine (web/engine.ts, shared with the
 * web chat). Kryoto Mobile's answer to src/web/api.ts: kryo.to's account routes
 * go through the native request (mobile/net.ts), with the app's own sign-in.
 */

export { ApiError }
export const API_BASE = API
export const GATEWAY_WS: string = (import.meta.env.VITE_KRYO_GATEWAY as string | undefined) ?? 'wss://ws.kryo.to/v1/ws'
/** The gateway's https origin (attachments). */
export const GATEWAY_HTTP = GATEWAY_WS.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/v1\/ws$/, '')

export async function api<T>(token: string | null, method: string, path: string, body?: unknown): Promise<T> {
  const { json } = await request<T>(`${API}${path}`, { method: method as 'GET', token, body })
  return json
}

const SAVE_CHUNK = 1 << 20

function base64(bytes: Uint8Array): string {
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(text)
}

/** A WebView performs no downloads, so Android's own Save dialog takes it. False when the player backs out. */
export async function saveFile(name: string, data: BlobPart, mime: string): Promise<boolean> {
  const bytes = new Uint8Array(await new Blob([data]).arrayBuffer())
  const { id } = await mobileAction<{ id?: string }>('savePick', { name, mime })
  if (!id) return false
  let at = 0
  do {
    const end = at + SAVE_CHUNK
    await mobileAction('saveWrite', { id, data: base64(bytes.subarray(at, end)), last: end >= bytes.length })
    at = end
  } while (at < bytes.length)
  return true
}
