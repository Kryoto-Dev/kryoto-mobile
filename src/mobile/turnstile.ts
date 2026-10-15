/**
 * kryo.to's download check, solved on the phone.
 *
 * kryo.to will not mint a download link without a Cloudflare Turnstile token,
 * and only a browser that renders the widget can get one. The PC's background
 * request cannot, so the phone does it: the widget is shown here, the token
 * goes to the PC with the download, and the PC attaches it to its own request
 * (phone.rs `start_download`).
 *
 * The site key is kryo.to's public one (it is in the site's own scripts).
 * Turnstile only issues a token to a hostname on the widget's list, so this
 * can fail with a domain error: the caller then falls back to the PC.
 */

const SITE_KEY = '0x4AAAAAAEvSoubw7GSa0IWS'
const API = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

type Widget = {
  render: (el: HTMLElement, o: Record<string, unknown>) => string
  remove: (id: string) => void
}

function isWidget(v: unknown): v is Widget {
  return !!v && typeof v === 'object' && 'render' in v && typeof v.render === 'function' && 'remove' in v && typeof v.remove === 'function'
}

let loading: Promise<Widget> | null = null
function turnstile(): Promise<Widget> {
  const present: unknown = Reflect.get(window, 'turnstile')
  if (isWidget(present)) return Promise.resolve(present)
  loading ??= new Promise<Widget>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = API
    s.async = true
    s.onload = () => {
      const t: unknown = Reflect.get(window, 'turnstile')
      if (isWidget(t)) resolve(t)
      else reject(new Error('The check did not load.'))
    }
    s.onerror = () => {
      loading = null
      reject(new Error('Could not reach the check (challenges.cloudflare.com).'))
    }
    document.head.appendChild(s)
  })
  return loading
}

/** Shows the widget over the app and resolves its token. Rejects when it fails or is dismissed. */
export async function solveCheck(): Promise<string> {
  const api = await turnstile()
  return new Promise<string>((resolve, reject) => {
    const overlay = document.createElement('div')
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:rgba(0,0,0,.72);padding:24px'
    const card = document.createElement('div')
    card.style.cssText =
      'display:grid;gap:14px;justify-items:center;border:1px solid var(--border);border-radius:var(--kryo-radius);background:var(--card);color:var(--foreground);padding:20px;max-width:340px;text-align:center'
    const title = document.createElement('p')
    title.textContent = 'One quick check before the download'
    title.style.cssText = 'font-size:12px;text-transform:uppercase;letter-spacing:.2em'
    const box = document.createElement('div')
    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.textContent = 'Cancel'
    cancel.style.cssText =
      'height:36px;padding:0 20px;border:1px solid var(--border);border-radius:9999px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--muted-foreground)'
    card.append(title, box, cancel)
    overlay.appendChild(card)
    document.body.appendChild(overlay)

    let id: string | null = null
    const done = () => {
      if (id) {
        try {
          api.remove(id)
        } catch {
          /* already gone */
        }
      }
      overlay.remove()
    }
    cancel.onclick = () => {
      done()
      reject(new Error('Check cancelled.'))
    }
    try {
      id = api.render(box, {
        sitekey: SITE_KEY,
        theme: 'dark',
        callback: (token: string) => {
          done()
          resolve(token)
        },
        'error-callback': (code: unknown) => {
          done()
          reject(new Error(`The check failed (${String(code)}).`))
        },
        'timeout-callback': () => {
          done()
          reject(new Error('The check timed out.'))
        },
      })
    } catch (e) {
      done()
      reject(e instanceof Error ? e : new Error('The check could not start.'))
    }
  })
}
