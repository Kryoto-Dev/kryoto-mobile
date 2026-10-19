import { createContext, useContext } from 'react'
import type { Me } from '@/mobile/auth'
import type { LibraryLink } from '@/mobile/link'
import type { Links } from '@/mobile/storage'

export type SettingsTab = 'account' | 'appearance' | 'notifications' | 'security' | 'support'

/** Where a push goes: a catalog game, a game on the PC, the pairing screen, approving another device's sign-in, or an account screen. */
export type Page =
  | { kind: 'game'; slug: string }
  | { kind: 'lib'; id: string }
  | { kind: 'connect' }
  | { kind: 'notifications' }
  | { kind: 'approve'; code: string }
  | { kind: 'editProfile' }
  | { kind: 'settings'; tab?: SettingsTab }
  | { kind: 'perks' }
  | { kind: 'collections' }
  | { kind: 'collection'; id: string }

export interface AppContext {
  token: string | null
  /** The signed-in account, once loaded. */
  me: Me | null
  /** Fetch the signed-in account again (after a save changed it). */
  reloadMe(): Promise<void>
  /** Signed in or not, loaded or not. */
  signedIn: boolean
  links: Links
  setLinks(next: Links): void
  link: LibraryLink
  push(page: Page): void
  back(): void
  toast(message: string): void
  /** Show the sign-in screen; it returns to where the player was. */
  signIn(): void
  signOut(): void
  /** An error's text for the player; a 401 from kryo.to also signs out. */
  fail(error: unknown): string
}

export const App = createContext<AppContext | null>(null)

export function useApp(): AppContext {
  const ctx = useContext(App)
  if (!ctx) throw new Error('useApp outside the app')
  return ctx
}
