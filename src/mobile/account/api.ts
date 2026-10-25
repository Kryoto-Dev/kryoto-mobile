import { API } from '@/mobile/auth'
import { request } from '@/mobile/net'

/** One call to a kryo.to account route as the signed-in phone; resolves the parsed body, throws the server's own sentence. */
export const acct = <T = Record<string, unknown>>(token: string | null, path: string, opts: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown } = {}) =>
  request<T>(`${API}${path}`, { ...opts, token }).then((r) => r.json)
