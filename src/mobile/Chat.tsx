import { useEffect, useMemo, useRef } from 'react'
import type { Account } from '@/hooks/useAccount'
import { friendName, useFriends } from '@/hooks/useFriends'
import { useSocialBadge } from '@/hooks/useSocialBadge'
import { CallOverlay } from '@/friends/CallOverlay'
import { FriendsPage } from '@/friends/FriendsPage'
import { on, useWebBackend } from '@/lib/bridge'
import { nameThisDevice, startActiveBeacon, useChatStatus, type ChatMessage } from '@/lib/chat'
import { API, openExternal, siteUrl, type Me } from '@/mobile/auth'
import { useApp } from '@/mobile/context'
import { store } from '@/mobile/storage'
import { createBackend } from '@/web/backend'

/**
 * Friends and chat in the app itself: the same screens as Kryoto Desktop and
 * the web chat (src/friends), and the same end-to-end encrypted engine
 * (src/web, km-core in WebAssembly), running in this app with nothing framed.
 * The keys and messages stay in the app's own storage. A narrow page shows the
 * list, then one conversation at a time.
 */

let installed: string | null = null

/** One engine (one gateway connection) per sign-in, StrictMode or not. */
function install(token: string, userId: string, onSignedOut: () => void) {
  if (installed === `${userId}:${token}`) return
  installed = `${userId}:${token}`
  nameThisDevice('phone')
  // Chat removed from this phone: the app stays signed in, and chat starts over.
  useWebBackend(createBackend(token, userId, onSignedOut, () => window.location.reload()))
}

/** Signing out ends the engine with the page: its connection and keys in memory go with it. */
export function endChat() {
  if (installed) window.location.reload()
}

function accountOf(me: Me): Account {
  const f = me.features ?? {}
  return {
    username: me.username,
    displayName: me.displayName,
    avatarUrl: siteUrl(me.avatarUrl),
    supporter: me.isSupporter,
    rank: me.donationTier ?? null,
    chat: !!f.chat && !!f.chat_web,
    friends: !!f.friends,
    groups: !!f.chat_groups,
    room: !!f.chat_room,
    voice: !!f.voice,
  }
}

/** The Chats tab: friends and conversations, then a conversation filling the screen. */
export function ChatsTab({ onConversation }: { onConversation: (close: (() => void) | null) => void }) {
  const { token, me, push, fail } = useApp()
  const account = useMemo(() => (me ? accountOf(me) : null), [me])
  if (!token || !me?.id || !account) return null
  install(token, me.id, () => void fail(new Error('Signed out.')))
  const site = (path: string) => void openExternal(`${API}${path}`)
  return (
    <FriendsPage
      account={account}
      onProfile={() => site(`/user/${encodeURIComponent(me.username)}`)}
      onWeb={site}
      onJoinInvite={(invite) => push({ kind: 'game', slug: invite.slug })}
      onConversation={onConversation}
    />
  )
}

/**
 * What runs with the engine whichever tab is showing: new messages said in the
 * app, the count on the tab, and calls.
 */
export function ChatRuntime({ showing, onUnread }: { showing: boolean; onUnread: (n: number) => void }) {
  const { token, me, toast, fail } = useApp()
  if (token && me?.id) install(token, me.id, () => void fail(new Error('Signed out.')))
  const friends = useFriends()
  const badge = useSocialBadge()
  const status = useChatStatus()
  const person = (id: string) => friends?.friends.find((x) => x.id === id) ?? friends?.messageRequests.accepted.find((x) => x.id === id) ?? friends?.messageRequests.incoming.find((x) => x.id === id) ?? null
  const nameOf = (id: string) => {
    const f = person(id)
    return f ? friendName(f) : 'Someone'
  }
  const avatarOf = (id: string) => person(id)?.avatarUrl ?? null
  const names = useRef(nameOf)
  names.current = nameOf
  const here = useRef(showing)
  here.current = showing

  useEffect(() => onUnread(badge.unread + badge.messageRequests), [badge.unread, badge.messageRequests, onUnread])
  useEffect(() => {
    if (status?.state === 'online') store.setChatHere()
  }, [status?.state])
  useEffect(() => {
    const stop = on<ChatMessage>('chat-message', (m) => {
      if (!m.outgoing && m.senderUser && !here.current) toast(`${names.current(m.senderUser)} sent you a message`)
    })
    return () => void stop.then((f) => f())
  }, [toast])
  useEffect(() => startActiveBeacon(() => document.visibilityState === 'visible'), [])

  return me?.features?.voice ? <CallOverlay nameOf={nameOf} avatarOf={avatarOf} /> : null
}
