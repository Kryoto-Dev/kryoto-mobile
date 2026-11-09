import { useState, useSyncExternalStore } from 'react'
import { Check } from '@/ui'
import { API, type Me } from '@/mobile/auth'
import { useApp } from '@/mobile/context'
import { request } from '@/mobile/net'
import { Block, Note } from '@/mobile/parts'

/**
 * What the phone does with adult games' art, the way kryo.to does it
 * (kryo.to lib/nsfw.ts): `blur` (the default), `hide` (left out of the lists
 * drawn from kryo.to) or `show` (no blur).
 *
 * Signed in, the account decides: its Settings > Appearance on kryo.to, and the
 * switch in Profile saves there too. The last answer is kept here so a start on
 * a bad connection does not blur what the account shows. A guest's choice stays
 * on this phone and starts blurred.
 */
export type AdultMode = 'hide' | 'blur' | 'show'

const KEYS = { account: 'kryoto.mobile.adult.account', guest: 'kryoto.mobile.adult.guest' } as const

const isMode = (v: unknown): v is AdultMode => v === 'hide' || v === 'blur' || v === 'show'

function read(key: string): AdultMode | null {
  try {
    const v = localStorage.getItem(key)
    return isMode(v) ? v : null
  } catch {
    return null
  }
}

function write(key: string, value: AdultMode | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* storage unavailable: the choice lasts until the app closes */
  }
}

/** The two account columns as one mode, as kryo.to's `modeFromAccount`. Hide wins over blur. */
export function modeFromAccount(me: Pick<Me, 'appearanceNsfwBlur' | 'appearanceNsfwHide'>): AdultMode {
  if (me.appearanceNsfwHide === true) return 'hide'
  return me.appearanceNsfwBlur === false ? 'show' : 'blur'
}

let token: string | null = null
// The account's answer is only kept while signed in (followAccount clears it).
let mode: AdultMode = read(KEYS.account) ?? read(KEYS.guest) ?? 'blur'
const listeners = new Set<() => void>()

function set(next: AdultMode) {
  if (next === mode) return
  mode = next
  listeners.forEach((fn) => fn())
}

/**
 * Follow who is signed in (App calls it whenever the account changes). `me` is
 * null while it loads: the last answer from the account stands in.
 */
export function followAccount(signedIn: string | null, me: Me | null) {
  token = signedIn
  if (!signedIn) {
    write(KEYS.account, null)
    set(read(KEYS.guest) ?? 'blur')
    return
  }
  if (!me) {
    set(read(KEYS.account) ?? 'blur')
    return
  }
  const fromAccount = modeFromAccount(me)
  write(KEYS.account, fromAccount)
  set(fromAccount)
}

/**
 * Show adult art or blur it. Signed in, saved to the account as kryo.to's
 * Settings > Appearance saves it, so the site and the other apps follow; it
 * goes back if the save fails. Showing also turns off the account's Hide.
 */
export async function setShowAdult(show: boolean): Promise<void> {
  const before = mode
  const next: AdultMode = show ? 'show' : 'blur'
  set(next)
  if (!token) {
    write(KEYS.guest, next)
    return
  }
  write(KEYS.account, next)
  try {
    await request(`${API}/api/account/appearance`, { method: 'PATCH', token, body: show ? { nsfwBlur: false, nsfwHide: false } : { nsfwBlur: true } })
  } catch (e) {
    write(KEYS.account, before)
    set(before)
    throw e
  }
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function useAdultMode(): AdultMode {
  return useSyncExternalStore(subscribe, () => mode)
}

/** Whether adult art is drawn without the blur. */
export function useShowAdult(): boolean {
  return useAdultMode() === 'show'
}

/** Whether adult games are left out of the lists drawn from kryo.to (the account's Hide). */
export function useHideAdult(): boolean {
  return useAdultMode() === 'hide'
}

/** `list` without its adult games when `hide`; as it is otherwise. */
export function withoutAdult<T extends { nsfw?: boolean | null }>(list: T[], hide: boolean): T[] {
  return hide ? list.filter((g) => !g.nsfw) : list
}

/** Profile's switch: adult art blurred or not, saved to the account when signed in. */
export function AdultArtSetting() {
  const { signedIn, toast, fail } = useApp()
  const current = useAdultMode()
  const [saving, setSaving] = useState(false)
  return (
    <Block>
      <Check
        checked={current === 'show'}
        disabled={saving}
        label="Show adult covers without blur"
        onChange={(show) => {
          setSaving(true)
          setShowAdult(show)
            .catch((e: unknown) => toast(fail(e)))
            .finally(() => setSaving(false))
        }}
      />
      <Note>
        {signedIn
          ? current === 'hide'
            ? 'Your kryo.to account hides adult games. Turning this on shows them, unblurred, on kryo.to and in every Kryoto app.'
            : 'Saved to your kryo.to account (Settings > Appearance), so the site and your other Kryoto apps follow it.'
          : 'On this phone only. Sign in to follow your kryo.to account.'}
      </Note>
    </Block>
  )
}
