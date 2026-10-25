import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Check as CheckIcon, Pencil, Plus, Search, Trash2, UserPlus, Users, X } from 'lucide-react'
import { Button, IconButton, Modal } from '@/ui'
import { useApp } from '@/mobile/context'
import { loadCatalog, useCatalog, type CatalogCard } from '@/mobile/catalog-store'
import { Busy, Chip, Notice, PageHeader, Poster } from '@/mobile/parts'
import { FieldRow, LinkOut, Panel, Status, TextArea, TextField } from '@/mobile/account/forms'
import { VisibilityChoice, VisibilityPill } from '@/mobile/account/Collections'
import {
  COLLECTION_COLLABORATORS_MAX,
  COLLECTION_DESCRIPTION_MAX,
  COLLECTION_ITEMS_MAX,
  COLLECTION_NAME_MAX,
  addItem,
  collectionSlugs,
  collectionWebUrl,
  deleteCollection,
  findPeople,
  gameCount,
  inviteCollaborator,
  listCollections,
  removeCollaborator,
  removeItem,
  reorderItems,
  setCollaborator,
  updateCollection,
  type Collaborator,
  type Collection,
  type PermissionKey,
  type Person,
  type Visibility,
} from '@/mobile/account/collections-api'

type Load = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready' }

const ADD_RESULTS = 30

/** One collection: its games in order, add/remove/reorder, and (for the owner) details, people and delete. */
export function CollectionPage({ id }: { id: string }) {
  const { token, me, back, push, fail, toast } = useApp()
  const catalog = useCatalog()
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [col, setCol] = useState<Collection | null>(null)
  const [name, setName] = useState('')
  const [slugs, setSlugs] = useState<string[]>([])
  const [pending, setPending] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'add' | 'edit' | 'people' | 'delete' | null>(null)

  const refresh = useCallback(() => {
    if (!token) return () => {}
    let current = true
    setLoad({ kind: 'loading' })
    // There is no GET for one collection: the list carries its words, /items carries its games.
    Promise.all([listCollections(token), collectionSlugs(token, id)])
      .then(([all, items]) => {
        if (!current) return
        setCol(all.find((c) => c.id === id) ?? null)
        setName(items.name)
        setSlugs(items.slugs)
        setLoad({ kind: 'ready' })
      })
      .catch((e: unknown) => current && setLoad({ kind: 'error', message: fail(e) }))
    return () => {
      current = false
    }
  }, [token, id, fail])

  useEffect(() => refresh(), [refresh])
  useEffect(() => {
    void loadCatalog()
  }, [])

  const cards = useMemo(() => new Map(catalog.cards.map((c) => [c.slug, c])), [catalog.cards])
  const owned = !!col && !col.ownerName

  if (!token) {
    return (
      <div className="flex min-h-full flex-col">
        <PageHeader title="Collection" onBack={back} />
        <Notice title="Sign in first" body="Collections belong to your kryo.to account." />
      </div>
    )
  }

  /** Applies an optimistic change, then asks the server; puts the old state back with the server's sentence on failure. */
  const mutate = async (next: string[], call: () => Promise<unknown>) => {
    if (pending) return
    const prev = slugs
    setSlugs(next)
    setPending(true)
    setStatus(null)
    try {
      await call()
    } catch (e) {
      setSlugs(prev)
      setStatus(fail(e))
    } finally {
      setPending(false)
    }
  }

  const move = (index: number, by: -1 | 1) => {
    const to = index + by
    if (to < 0 || to >= slugs.length) return
    const next = [...slugs]
    ;[next[index], next[to]] = [next[to]!, next[index]!]
    void mutate(next, () => reorderItems(token, id, next))
  }

  const remove = (slug: string) =>
    void mutate(
      slugs.filter((s) => s !== slug),
      () => removeItem(token, id, slug),
    )

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title={name || 'Collection'}
        onBack={back}
        right={
          col ? (
            <IconButton label="Add games" onClick={() => setDialog('add')}>
              <Plus className="size-4" />
            </IconButton>
          ) : undefined
        }
      />
      <div className="grid gap-4 px-4 pb-8 pt-4">
        {load.kind === 'loading' ? (
          <Busy label="Loading the collection" />
        ) : load.kind === 'error' ? (
          <Notice title="Could not load this collection" body={load.message} retry={refresh} />
        ) : (
          <>
            <section className="grid gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {col ? <VisibilityPill value={col.visibility} /> : null}
                <span className="text-[11px] text-muted-foreground">
                  {gameCount(slugs.length)}
                  {col?.ownerName ? ` · by ${col.ownerName}` : ''}
                </span>
              </div>
              {col?.description ? <p className="text-xs leading-relaxed text-muted-foreground">{col.description}</p> : null}
              {col ? (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="primary" onClick={() => setDialog('add')}>
                    <Plus className="size-3.5" />
                    Add games
                  </Button>
                  <Button size="sm" onClick={() => setDialog('edit')}>
                    <Pencil className="size-3.5" />
                    Edit details
                  </Button>
                  {owned ? (
                    <Button size="sm" onClick={() => setDialog('people')}>
                      <Users className="size-3.5" />
                      People
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </section>

            <Status msg={status} />

            {slugs.length === 0 ? (
              <Notice title="Nothing here yet" body="Add some games to start the list." />
            ) : (
              <ul className="grid gap-2">
                {slugs.map((slug, i) => {
                  const card = cards.get(slug)
                  const title = card?.title ?? slug
                  return (
                    <li key={slug} className="kryo-radius flex items-center gap-3 border border-border bg-card p-2.5">
                      <div className="w-10 shrink-0">
                        <Poster src={card?.cover || null} title={title} nsfw={!!card?.nsfw} />
                      </div>
                      {card ? (
                        <button type="button" onClick={() => push({ kind: 'game', slug })} className="min-w-0 flex-1 truncate text-left text-xs font-bold text-foreground">
                          {title}
                        </button>
                      ) : (
                        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{title}</span>
                      )}
                      <div className="flex shrink-0 gap-1.5">
                        <IconButton label="Move up" disabled={pending || i === 0} onClick={() => move(i, -1)}>
                          <ArrowUp className="size-3.5" />
                        </IconButton>
                        <IconButton label="Move down" disabled={pending || i === slugs.length - 1} onClick={() => move(i, 1)}>
                          <ArrowDown className="size-3.5" />
                        </IconButton>
                        <IconButton label={`Remove ${title}`} disabled={pending} onClick={() => remove(slug)}>
                          <X className="size-3.5" />
                        </IconButton>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}

            {owned && col && me ? <LinkOut label="Open on kryo.to" url={collectionWebUrl(me.username, col.slug)} /> : null}
            {owned ? (
              <Button variant="danger" onClick={() => setDialog('delete')}>
                <Trash2 className="size-3.5" />
                Delete collection
              </Button>
            ) : null}
          </>
        )}
      </div>

      {dialog === 'add' ? (
        <AddGames
          id={id}
          name={name}
          slugs={slugs}
          cards={catalog.cards}
          catalogLoading={catalog.loading}
          catalogError={catalog.error}
          onAdded={(slug) => setSlugs((cur) => (cur.includes(slug) ? cur : [...cur, slug]))}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === 'edit' && col ? (
        <EditDetails
          col={col}
          owned={owned}
          onSaved={(next) => {
            setCol(next)
            setName(next.name)
            setDialog(null)
            toast('Saved.')
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === 'people' && col ? <People col={col} onClose={() => setDialog(null)} /> : null}
      {dialog === 'delete' && col ? (
        <ConfirmDelete
          col={col}
          onDeleted={() => {
            setDialog(null)
            toast(`"${col.name}" deleted.`)
            back()
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  )
}

function AddGames({
  id,
  name,
  slugs,
  cards,
  catalogLoading,
  catalogError,
  onAdded,
  onClose,
}: {
  id: string
  name: string
  slugs: string[]
  cards: CatalogCard[]
  catalogLoading: boolean
  catalogError: string | null
  onAdded: (slug: string) => void
  onClose: () => void
}) {
  const { token, fail } = useApp()
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState(0)
  const have = useMemo(() => new Set(slugs), [slugs])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const out: CatalogCard[] = []
    for (const c of cards) {
      if (q && !c.title.toLowerCase().includes(q)) continue
      out.push(c)
      if (out.length >= ADD_RESULTS) break
    }
    return out
  }, [cards, query])

  const full = slugs.length >= COLLECTION_ITEMS_MAX

  const add = async (card: CatalogCard) => {
    if (pending || have.has(card.slug)) return
    setPending(card.slug)
    setError(null)
    try {
      await addItem(token, id, { slug: card.slug, title: card.title, cover: card.cover })
      onAdded(card.slug)
      setAdded((n) => n + 1)
    } catch (e) {
      setError(fail(e))
    } finally {
      setPending(null)
    }
  }

  return (
    <Modal
      title={`Add games to ${name}`}
      onClose={onClose}
      footer={
        <>
          <span className="mr-auto self-center text-[11px] text-muted-foreground" aria-live="polite">
            {added > 0 ? `${added} added` : null}
          </span>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <label className="kryo-pill flex h-9 items-center gap-2 border border-border bg-background px-3 focus-within:border-foreground">
        <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the catalog"
          aria-label="Search the catalog"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
        />
      </label>
      {full ? <Status msg={`A collection holds at most ${COLLECTION_ITEMS_MAX} games.`} /> : null}
      <Status msg={error} />
      {cards.length === 0 ? (
        catalogError ? (
          <Status msg={catalogError} />
        ) : catalogLoading ? (
          <Busy label="Loading the catalog" />
        ) : (
          <p className="text-xs text-muted-foreground">The catalog is empty.</p>
        )
      ) : results.length === 0 ? (
        <p className="text-xs text-muted-foreground">No game by that name.</p>
      ) : (
        <ul className="grid gap-2">
          {results.map((card) => {
            const inside = have.has(card.slug)
            return (
              <li key={card.slug} className="flex items-center gap-3">
                <div className="w-9 shrink-0">
                  <Poster src={card.cover || null} title={card.title} nsfw={!!card.nsfw} />
                </div>
                <span className="min-w-0 flex-1 truncate text-xs text-foreground">{card.title}</span>
                <Button size="sm" variant={inside ? 'ghost' : 'outline'} disabled={inside || !!pending || full} onClick={() => void add(card)}>
                  {inside ? (
                    <>
                      <CheckIcon className="size-3.5" />
                      Added
                    </>
                  ) : pending === card.slug ? (
                    'Adding…'
                  ) : (
                    <>
                      <Plus className="size-3.5" />
                      Add
                    </>
                  )}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}

function EditDetails({ col, owned, onSaved, onClose }: { col: Collection; owned: boolean; onSaved: (next: Collection) => void; onClose: () => void }) {
  const { token, fail } = useApp()
  const [name, setName] = useState(col.name)
  const [description, setDescription] = useState(col.description)
  const [visibility, setVisibility] = useState<Visibility>(col.visibility)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const next = { name: name.trim(), description: description.trim() }
  const patch = {
    ...(next.name !== col.name ? { name: next.name } : null),
    ...(next.description !== col.description ? { description: next.description } : null),
    ...(owned && visibility !== col.visibility ? { visibility } : null),
  }
  const changed = Object.keys(patch).length > 0

  const save = async () => {
    if (!next.name || !changed || busy) return
    setBusy(true)
    setError(null)
    try {
      await updateCollection(token, col.id, patch)
      onSaved({ ...col, ...patch })
    } catch (e) {
      setError(fail(e))
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Edit collection"
      onClose={() => !busy && onClose()}
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!next.name || !changed || busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <FieldRow label="Name" counter={`${name.length}/${COLLECTION_NAME_MAX}`}>
        <TextField value={name} onChange={setName} max={COLLECTION_NAME_MAX} disabled={busy} label="Name" />
      </FieldRow>
      <FieldRow label="Description" counter={`${description.length}/${COLLECTION_DESCRIPTION_MAX}`}>
        <TextArea value={description} onChange={setDescription} max={COLLECTION_DESCRIPTION_MAX} rows={4} placeholder="What ties these games together?" disabled={busy} />
      </FieldRow>
      {owned ? (
        <FieldRow label="Who can see it">
          <VisibilityChoice value={visibility} onChange={setVisibility} disabled={busy} />
        </FieldRow>
      ) : null}
      <Status msg={error} />
    </Modal>
  )
}

const PERMISSIONS: { key: PermissionKey; label: string }[] = [
  { key: 'canAdd', label: 'Add' },
  { key: 'canRemove', label: 'Remove' },
  { key: 'canEdit', label: 'Edit' },
]

/**
 * Invite people to work on the collection. kryo.to has no JSON route that lists a collection's people
 * (the web page reads them server-side), so this shows who was invited from here; the site has the full list.
 */
function People({ col, onClose }: { col: Collection; onClose: () => void }) {
  const { token, me, fail } = useApp()
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Person[]>([])
  const [invited, setInvited] = useState<Collaborator[]>([])
  const [inviting, setInviting] = useState(false)
  const [status, setStatus] = useState<{ msg: string; ok?: boolean } | null>(null)

  useEffect(() => {
    const q = query.trim().replace(/^@/, '')
    if (q.length < 2) {
      setSuggestions([])
      return
    }
    let current = true
    const timer = window.setTimeout(() => {
      findPeople(token, col.id, q)
        .then((people) => current && setSuggestions(people.filter((p) => !invited.some((i) => i.id === p.id))))
        .catch(() => current && setSuggestions([]))
    }, 250)
    return () => {
      current = false
      window.clearTimeout(timer)
    }
  }, [query, token, col.id, invited])

  const invite = async (username: string) => {
    const who = username.trim().replace(/^@/, '')
    if (!who || inviting) return
    setInviting(true)
    setStatus(null)
    try {
      const person = await inviteCollaborator(token, col.id, who)
      setInvited((cur) => [...cur.filter((c) => c.id !== person.id), person])
      setQuery('')
      setSuggestions([])
      setStatus({ msg: `Invited ${person.displayName}.`, ok: true })
    } catch (e) {
      setStatus({ msg: fail(e) })
    } finally {
      setInviting(false)
    }
  }

  const toggle = async (person: Collaborator, key: PermissionKey) => {
    const prev = invited
    const value = !person[key]
    setInvited(prev.map((c) => (c.id === person.id ? { ...c, [key]: value } : c)))
    try {
      await setCollaborator(token, col.id, person.id, { [key]: value })
    } catch (e) {
      setInvited(prev)
      setStatus({ msg: fail(e) })
    }
  }

  const drop = async (person: Collaborator) => {
    const prev = invited
    setInvited(prev.filter((c) => c.id !== person.id))
    try {
      await removeCollaborator(token, col.id, person.id)
      setStatus({ msg: person.status === 'pending' ? `Invitation to ${person.displayName} withdrawn.` : `${person.displayName} removed.`, ok: true })
    } catch (e) {
      setInvited(prev)
      setStatus({ msg: fail(e) })
    }
  }

  return (
    <Modal
      title="People"
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Invite people to add games to this collection with you. A collection can be shared with {COLLECTION_COLLABORATORS_MAX} people at most.
      </p>
      <div className="flex items-center gap-2">
        <label className="kryo-pill flex h-9 min-w-0 flex-1 items-center gap-2 border border-border bg-background px-3 focus-within:border-foreground">
          <UserPlus className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void invite(query)}
            placeholder="Username"
            aria-label="Invite by username"
            autoComplete="off"
            autoCapitalize="off"
            className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
        <Button size="sm" disabled={!query.trim() || inviting} onClick={() => void invite(query)}>
          {inviting ? 'Inviting…' : 'Invite'}
        </Button>
      </div>
      {suggestions.length > 0 ? (
        <ul className="kryo-radius divide-y divide-border overflow-hidden border border-border">
          {suggestions.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => void invite(p.username)} className="flex w-full flex-col px-3 py-2 text-left">
                <span className="truncate text-xs text-foreground">{p.displayName}</span>
                <span className="truncate text-[10px] text-muted-foreground">@{p.username}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Status msg={status?.msg} ok={status?.ok} />
      {invited.length > 0 ? (
        <Panel title="Invited from here">
          <ul className="grid gap-3">
            {invited.map((p) => (
              <li key={p.id} className="grid gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-foreground">{p.displayName}</span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      @{p.username}
                      {p.status === 'pending' ? ' · invited' : p.status === 'declined' ? ' · declined' : ''}
                    </span>
                  </span>
                  <IconButton label={p.status === 'pending' ? `Withdraw invitation to ${p.displayName}` : `Remove ${p.displayName}`} onClick={() => void drop(p)}>
                    <X className="size-3.5" />
                  </IconButton>
                </div>
                <div className="flex gap-2">
                  {PERMISSIONS.map((perm) => (
                    <Chip key={perm.key} active={p[perm.key]} onClick={() => void toggle(p, perm.key)}>
                      {perm.label}
                    </Chip>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      {me ? <LinkOut label="See everyone on kryo.to" url={collectionWebUrl(me.username, col.slug)} /> : null}
    </Modal>
  )
}

function ConfirmDelete({ col, onDeleted, onClose }: { col: Collection; onDeleted: () => void; onClose: () => void }) {
  const { token, fail } = useApp()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await deleteCollection(token, col.id)
      onDeleted()
    } catch (e) {
      setError(fail(e))
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Delete collection"
      onClose={() => !busy && onClose()}
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => void run()}>
            {busy ? 'Deleting…' : 'Delete'}
          </Button>
        </>
      }
    >
      <p className="text-xs leading-relaxed text-foreground">
        Delete <span className="font-bold">{col.name}</span>? Its games, people and followers go with it. This cannot be undone.
      </p>
      <Status msg={error} />
    </Modal>
  )
}
