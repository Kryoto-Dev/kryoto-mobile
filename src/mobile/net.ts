import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '@/lib/bridge'

/**
 * Every call to kryo.to's account routes and to the PC. In the app they go
 * through the native `net_request` (mobile/src-tauri): those kryo.to routes
 * allow cross-origin calls only from chat.kryo.to, and the PC speaks plain
 * HTTP. In a desktop browser (a UI preview) plain `fetch` stands in.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

type Options = { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; token?: string | null; body?: unknown; timeoutMs?: number }

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** Resolves for 2xx with the parsed body; otherwise throws the server's own error text. */
export async function request<T = Record<string, unknown>>(url: string, { method = 'GET', token, body, timeoutMs = 15_000 }: Options = {}): Promise<{ status: number; json: T }> {
  const headers: [string, string][] = []
  if (token) headers.push(['authorization', `Bearer ${token}`])
  // So kryo.to can tell the PC a phone is connected through it (Settings > Phone).
  // The app only: a browser preview would turn it into a preflight request.
  if (isTauri()) headers.push(['x-kryoto-client', 'mobile'])
  if (body !== undefined) headers.push(['content-type', 'application/json'])
  const payload = body === undefined ? null : JSON.stringify(body)

  let status: number
  let text: string
  try {
    if (isTauri()) {
      const res = await invoke<{ status: number; body: string }>('net_request', { req: { url, method, headers, body: payload, timeoutMs } })
      status = res.status
      text = res.body
    } else {
      const res = await fetch(url, { method, headers: Object.fromEntries(headers), body: payload, credentials: 'omit', signal: AbortSignal.timeout(timeoutMs) })
      status = res.status
      text = await res.text()
    }
  } catch (e) {
    // The native side words its own failures ("Could not reach <host>: <why>",
    // "Blocked address."); a failed browser fetch only says it failed.
    const reason = typeof e === 'string' && e ? e : `Could not reach ${hostOf(url)}.`
    throw new ApiError(reason, 0)
  }
  let json: unknown = {}
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    json = {}
  }
  if (status < 200 || status >= 300) {
    const error = json && typeof json === 'object' && 'error' in json ? json.error : null
    throw new ApiError(typeof error === 'string' && error ? error : `${hostOf(url)} answered ${status}.`, status)
  }
  return { status, json: json as T }
}
