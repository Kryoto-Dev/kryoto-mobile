import { useEffect, useState } from 'react'
import { Button } from '@/ui'
import { API, openExternal } from '@/mobile/auth'
import { useApp } from '@/mobile/context'
import { accountMachines, RemoteOff, type AccountMachine } from '@/mobile/link'
import { request } from '@/mobile/net'
import { Block, Busy, Note, Notice, PageHeader, Poster, Sheet, SheetRow } from '@/mobile/parts'

type Game = { slug: string; title: string; cover: string | null; nsfw: boolean; sizeBytes: number | null }
type Collection = { id: string; name: string; href: string; role: 'owner' | 'collaborator' | 'following' | 'visitor'; games: Game[] }

const size = (bytes: number) => (bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`)

/** The account's collections and the ones it follows (kryo.to `/api/account/collections/sync`). */
function useCollections() {
  const { token, fail } = useApp()
  const [list, setList] = useState<Collection[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = () => {
    if (!token) return
    setError(null)
    request<{ collections?: Collection[] }>(`${API}/api/account/collections/sync`, { token })
      .then((r) => setList(r.json.collections ?? []))
      .catch((e: unknown) => setError(fail(e)))
  }
  useEffect(load, [token]) // eslint-disable-line react-hooks/exhaustive-deps
  return { list, error, reload: load, setList }
}

function Row({ collection, onOpen }: { collection: Collection; onOpen: () => void }) {
  const cover = collection.games.find((g) => g.cover)
  return (
    <button type="button" onClick={onOpen} className="kryo-radius flex w-full items-center gap-3 border border-border bg-card p-2 text-left">
      <Poster src={cover?.cover ?? null} title={collection.name} nsfw={cover?.nsfw} className="w-12 shrink-0" />
      <span className="grid min-w-0 grow">
        <span className="truncate text-sm font-bold text-foreground">{collection.name}</span>
        <span className="text-[11px] text-muted-foreground">
          {collection.games.length} game{collection.games.length === 1 ? '' : 's'}
          {collection.role === 'collaborator' ? ', shared with you' : ''}
        </span>
      </span>
    </button>
  )
}

/** Everything the account keeps and follows; Discover opens on kryo.to. */
export function CollectionsPage() {
  const { back, push, signedIn, signIn } = useApp()
  const { list, error, reload } = useCollections()
  if (!signedIn) {
    return (
      <>
        <PageHeader title="Collections" onBack={back} />
        <div className="p-4">
          <Notice title="Sign in to see your collections" body="Your lists and the ones you follow are on your kryo.to account.">
            <Button variant="primary" onClick={signIn}>
              Sign in with kryo.to
            </Button>
          </Notice>
        </div>
      </>
    )
  }
  const mine = list?.filter((c) => c.role === 'owner' || c.role === 'collaborator') ?? []
  const following = list?.filter((c) => c.role === 'following') ?? []
  return (
    <>
      <PageHeader title="Collections" onBack={back} />
      <div className="grid gap-4 p-4">
        {error ? <Notice title="Could not load your collections" body={error} retry={reload} /> : null}
        {!list && !error ? <Busy /> : null}
        {list && list.length === 0 ? <Notice title="No collections yet" body="Make one on kryo.to, or follow someone's from Discover." /> : null}
        {mine.length ? (
          <Block title="Your collections">
            {mine.map((c) => (
              <Row key={c.id} collection={c} onOpen={() => push({ kind: 'collection', id: c.id })} />
            ))}
          </Block>
        ) : null}
        {following.length ? (
          <Block title="Following">
            {following.map((c) => (
              <Row key={c.id} collection={c} onOpen={() => push({ kind: 'collection', id: c.id })} />
            ))}
          </Block>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void openExternal(`${API}/collections/discover`)}>
            Discover collections
          </Button>
          <Button size="sm" onClick={() => void openExternal(`${API}/collections`)}>
            Manage on kryo.to
          </Button>
        </div>
      </div>
    </>
  )
}

/** One collection: its games, Unfollow, and sending all of it to a PC through Remote. */
export function CollectionPage({ id }: { id: string }) {
  const { back, push, token, toast, fail, remote, remoteWasOff } = useApp()
  const { list, error, reload, setList } = useCollections()
  const [pcs, setPcs] = useState<AccountMachine[] | null>(null)
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const collection = list?.find((c) => c.id === id) ?? null
  const remoteOn = remote?.enabled === true

  useEffect(() => {
    if (!token || !remoteOn) return
    accountMachines(token)
      .then((m) => setPcs(m.filter((x) => x.kind === 'desktop')))
      .catch((e: unknown) => {
        if (e instanceof RemoteOff) remoteWasOff()
        else setPcs([])
      })
  }, [token, remoteOn]) // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (pc: AccountMachine) => {
    setPicking(false)
    setBusy(true)
    try {
      await request(`${API}/api/desktop/remote`, { method: 'POST', token, body: { action: 'collection', installId: pc.id, collectionId: id } })
      toast(pc.online ? `Sent to ${pc.name}. It queues what it does not have.` : `Sent. ${pc.name} starts it when Kryoto Desktop opens.`)
    } catch (e) {
      toast(fail(e))
    } finally {
      setBusy(false)
    }
  }
  const unfollow = async () => {
    setBusy(true)
    try {
      await request(`${API}/api/account/collections/${id}/follow`, { method: 'DELETE', token })
      setList((l) => l?.filter((c) => c.id !== id) ?? null)
      toast('Unfollowed.')
      back()
    } catch (e) {
      toast(fail(e))
    } finally {
      setBusy(false)
    }
  }

  const total = collection?.games.reduce((sum, g) => sum + (g.sizeBytes ?? 0), 0) ?? 0
  return (
    <>
      <PageHeader title={collection?.name ?? 'Collection'} onBack={back} />
      <div className="grid gap-4 p-4">
        {error ? <Notice title="Could not load this collection" body={error} retry={reload} /> : null}
        {!list && !error ? <Busy /> : null}
        {list && !collection ? <Notice title="This collection is gone" body="It may have been deleted or made private." /> : null}
        {collection ? (
          <>
            <div className="grid gap-2">
              <Button variant="primary" disabled={busy || !collection.games.length || !remoteOn || !pcs?.length} onClick={() => (pcs?.length === 1 ? void send(pcs[0]!) : setPicking(true))}>
                {busy ? 'Sending...' : pcs?.length === 1 ? `Install on ${pcs[0]!.name}` : 'Install on a PC'}
              </Button>
              <Note>
                {!remoteOn
                  ? 'Turn on Remote in the Library tab to send this to your PC from here.'
                  : pcs && !pcs.length
                    ? 'Open Kryoto Desktop on a PC signed in to this account to send it there.'
                    : `Queues what the PC does not have${total ? `, up to ${size(total)} to download` : ''}. It will ask when this collection gains a game.`}
              </Note>
              {collection.role === 'following' ? (
                <Button disabled={busy} onClick={() => void unfollow()}>
                  Unfollow
                </Button>
              ) : null}
            </div>
            {collection.games.length ? (
              <ul className="grid gap-1.5">
                {collection.games.map((g) => (
                  <li key={g.slug}>
                    <button type="button" onClick={() => push({ kind: 'game', slug: g.slug })} className="kryo-radius flex w-full items-center gap-3 border border-border bg-card p-2 text-left">
                      <Poster src={g.cover} title={g.title} nsfw={g.nsfw} className="w-12 shrink-0" />
                      <span className="min-w-0 grow truncate text-sm text-foreground">{g.title}</span>
                      {g.sizeBytes ? <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{size(g.sizeBytes)}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <Notice title="No games yet" />
            )}
          </>
        ) : null}
      </div>
      <Sheet open={picking} onClose={() => setPicking(false)} title="Install on">
        {(pcs ?? []).map((pc) => (
          <SheetRow key={pc.id} onClick={() => void send(pc)}>
            {pc.name}
            {pc.online ? '' : ' (offline)'}
          </SheetRow>
        ))}
      </Sheet>
    </>
  )
}

/** "Add to a collection" on a game's page: the lists it may go in. */
export function AddToCollection({ open, onClose, slug, title }: { open: boolean; onClose: () => void; slug: string; title: string }) {
  const { token, toast, fail } = useApp()
  type Target = { id: string; name: string; contains?: boolean }
  const [lists, setLists] = useState<Target[] | null>(null)
  useEffect(() => {
    if (!open || !token) return
    setLists(null)
    request<{ collections?: Target[] }>(`${API}/api/account/collections?contains=${encodeURIComponent(slug)}`, { token })
      .then((r) => setLists(r.json.collections ?? []))
      .catch((e: unknown) => {
        toast(fail(e))
        onClose()
      })
  }, [open, token, slug]) // eslint-disable-line react-hooks/exhaustive-deps
  const add = async (list: Target) => {
    onClose()
    try {
      await request(`${API}/api/account/collections/${list.id}/items`, { method: 'POST', token, body: { slug, title } })
      toast(`Added to ${list.name}.`)
    } catch (e) {
      toast(fail(e))
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Add to a collection">
      {!lists ? <Busy /> : null}
      {lists?.length === 0 ? <Note className="px-1 py-3">You have no collections yet. Make one on kryo.to.</Note> : null}
      {lists?.map((l) => (
        <SheetRow key={l.id} active={l.contains} onClick={() => (l.contains ? onClose() : void add(l))}>
          {l.name}
        </SheetRow>
      ))}
    </Sheet>
  )
}
