import { API } from '@/mobile/auth'
import { acct } from '@/mobile/account/api'

/*
 * Constants and shapes copied from kryo.to:
 *   lib/collections.ts  (COLLECTION_NAME_MAX, COLLECTION_DESCRIPTION_MAX, COLLECTION_ITEMS_MAX,
 *                        COLLECTION_COLLABORATORS_MAX, visibility labels/hints, Collection, CollectionCollaborator)
 *   lib/collections-db.ts (COLLECTIONS_PER_USER; the server enforces it and answers the sentence)
 *   app/api/account/collections/**  (every route reads the Bearer token through getCurrentUserFromRequest)
 */

export const COLLECTION_NAME_MAX = 80
export const COLLECTION_DESCRIPTION_MAX = 500
export const COLLECTION_ITEMS_MAX = 500
export const COLLECTION_COLLABORATORS_MAX = 20
export const COLLECTIONS_PER_USER = 100

export type Visibility = 'private' | 'unlisted' | 'public'

export const VISIBILITIES: Visibility[] = ['private', 'unlisted', 'public']

export const VISIBILITY_LABEL: Record<Visibility, string> = {
  private: 'Private',
  unlisted: 'Link only',
  public: 'Public',
}

export const VISIBILITY_HINT: Record<Visibility, string> = {
  private: 'Only you and the people you invite.',
  unlisted: 'Anyone with the link. Not listed anywhere.',
  public: 'Listed in Discover, on your profile and on its games.',
}

export type Collection = {
  id: string
  slug: string
  name: string
  description: string
  visibility: Visibility
  itemCount: number
  createdAt: string
  updatedAt: string
  /** Only on collections shared with the reader: whose it is. */
  ownerName?: string
}

export type Person = {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
  profilePublic: boolean
}

export type PermissionKey = 'canAdd' | 'canRemove' | 'canEdit'

export type Collaborator = Person & {
  status: 'pending' | 'accepted' | 'declined'
  invitedAt: string
} & Record<PermissionKey, boolean>

const base = (id: string) => `/api/account/collections/${encodeURIComponent(id)}`

/** The signed-in reader's own collections, then the ones shared with them that let them add. */
export const listCollections = (token: string | null) =>
  acct<{ collections: Collection[] }>(token, '/api/account/collections').then((r) => r.collections ?? [])

export const createCollection = (token: string | null, body: { name: string; description: string; visibility: Visibility }) =>
  acct<{ collection: Collection }>(token, '/api/account/collections', { method: 'POST', body }).then((r) => r.collection)

export const updateCollection = (token: string | null, id: string, body: { name?: string; description?: string; visibility?: Visibility }) =>
  acct<{ collection: Collection }>(token, base(id), { method: 'PATCH', body }).then((r) => r.collection)

export const deleteCollection = (token: string | null, id: string) => acct(token, base(id), { method: 'DELETE' })

/** Slugs in the collection, in the owner's order. */
export const collectionSlugs = (token: string | null, id: string) =>
  acct<{ id: string; name: string; slugs: string[] }>(token, `${base(id)}/items`)

export const addItem = (token: string | null, id: string, item: { slug: string; title: string; cover: string }) =>
  acct(token, `${base(id)}/items`, { method: 'POST', body: item })

export const removeItem = (token: string | null, id: string, slug: string) =>
  acct(token, `${base(id)}/items?slug=${encodeURIComponent(slug)}`, { method: 'DELETE' })

/** Rewrites the whole order in one request. */
export const reorderItems = (token: string | null, id: string, slugs: string[]) =>
  acct(token, `${base(id)}/items`, { method: 'PATCH', body: { slugs } })

/** Owner only: people to invite, by the start of a username or display name. */
export const findPeople = (token: string | null, id: string, q: string) =>
  acct<{ people: Person[] }>(token, `${base(id)}/collaborators?q=${encodeURIComponent(q)}`).then((r) => r.people ?? [])

/** Owner only: invite someone by username. */
export const inviteCollaborator = (token: string | null, id: string, username: string) =>
  acct<{ collaborator: Collaborator }>(token, `${base(id)}/collaborators`, { method: 'POST', body: { username } }).then((r) => r.collaborator)

export const setCollaborator = (token: string | null, id: string, userId: string, body: Partial<Record<PermissionKey, boolean>>) =>
  acct(token, `${base(id)}/collaborators/${encodeURIComponent(userId)}`, { method: 'PATCH', body })

export const removeCollaborator = (token: string | null, id: string, userId: string) =>
  acct(token, `${base(id)}/collaborators/${encodeURIComponent(userId)}`, { method: 'DELETE' })

/** kryo.to's own page for one of the signed-in owner's collections (collectionHref in lib/collections.ts). */
export const collectionWebUrl = (username: string, slug: string) => `${API}/user/${encodeURIComponent(username)}/c/${slug}`

/** "3 games", "1 game". */
export const gameCount = (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'game' : 'games'}`
