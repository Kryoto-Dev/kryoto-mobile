import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, Globe, Link2, Lock, Plus } from 'lucide-react'
import { Button, IconButton, Modal } from '@/ui'
import { cn } from '@/lib/utils'
import { useApp } from '@/mobile/context'
import { Busy, Notice, PageHeader } from '@/mobile/parts'
import { FieldRow, Status, TextArea, TextField } from '@/mobile/account/forms'
import {
  COLLECTIONS_PER_USER,
  COLLECTION_DESCRIPTION_MAX,
  COLLECTION_NAME_MAX,
  VISIBILITIES,
  VISIBILITY_HINT,
  VISIBILITY_LABEL,
  createCollection,
  gameCount,
  listCollections,
  type Collection,
  type Visibility,
} from '@/mobile/account/collections-api'

const VISIBILITY_ICON = { private: Lock, unlisted: Link2, public: Globe } as const

/** Who can see a collection, as three choices that each say what they do (kryo.to visibility-choice.tsx). */
export function VisibilityChoice({ value, onChange, disabled }: { value: Visibility; onChange: (v: Visibility) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Who can see it" className="grid gap-1.5">
      {VISIBILITIES.map((option) => {
        const Icon = VISIBILITY_ICON[option]
        const on = option === value
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(option)}
            className={cn(
              'kryo-radius flex w-full items-start gap-2.5 border px-3 py-2.5 text-left transition-colors disabled:opacity-50',
              on ? 'border-foreground bg-secondary/60 text-foreground' : 'border-border text-muted-foreground',
            )}
          >
            <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-bold uppercase tracking-wider">{VISIBILITY_LABEL[option]}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{VISIBILITY_HINT[option]}</span>
            </span>
            <span aria-hidden="true" className={cn('mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full border', on ? 'border-foreground' : 'border-border')}>
              {on ? <span className="size-1.5 rounded-full bg-foreground" /> : null}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function VisibilityPill({ value }: { value: Visibility }) {
  const Icon = VISIBILITY_ICON[value]
  return (
    <span className="kryo-pill inline-flex h-5 shrink-0 items-center gap-1 border border-border px-2 text-[10px] uppercase tracking-wider text-muted-foreground">
      <Icon className="size-3" aria-hidden="true" />
      {VISIBILITY_LABEL[value]}
    </span>
  )
}

type Load = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; items: Collection[] }

/** The signed-in reader's collections: their own, then the ones shared with them. */
export function Collections() {
  const { token, back, push, fail } = useApp()
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [creating, setCreating] = useState(false)

  const refresh = useCallback(() => {
    if (!token) return () => {}
    let current = true
    setLoad({ kind: 'loading' })
    listCollections(token)
      .then((items) => current && setLoad({ kind: 'ready', items }))
      .catch((e: unknown) => current && setLoad({ kind: 'error', message: fail(e) }))
    return () => {
      current = false
    }
  }, [token, fail])

  useEffect(() => refresh(), [refresh])

  if (!token) {
    return (
      <div className="flex min-h-full flex-col">
        <PageHeader title="Collections" onBack={back} />
        <Notice title="Sign in first" body="Collections belong to your kryo.to account." />
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Collections"
        onBack={back}
        right={
          <IconButton label="New collection" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
          </IconButton>
        }
      />
      <div className="grid gap-4 px-4 pb-8 pt-4">
        {load.kind === 'loading' ? (
          <Busy label="Loading your collections" />
        ) : load.kind === 'error' ? (
          <Notice title="Could not load your collections" body={load.message} retry={refresh} />
        ) : load.items.length === 0 ? (
          <Notice title="No collections yet" body="A collection is a list of games you put together.">
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus className="size-3.5" />
              New collection
            </Button>
          </Notice>
        ) : (
          <ul className="grid gap-2.5">
            {load.items.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => push({ kind: 'collection', id: c.id })}
                  className="kryo-radius flex w-full items-center gap-3 border border-border bg-card px-4 py-3 text-left"
                >
                  <span className="grid min-w-0 flex-1 gap-1">
                    <span className="truncate text-sm font-bold text-foreground">{c.name}</span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {gameCount(c.itemCount)}
                      {c.ownerName ? ` · by ${c.ownerName}` : ''}
                    </span>
                  </span>
                  <VisibilityPill value={c.visibility} />
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {load.kind === 'ready' && load.items.length > 0 ? (
          <p className="text-center text-[11px] text-muted-foreground">You can have up to {COLLECTIONS_PER_USER} collections of your own.</p>
        ) : null}
      </div>
      {creating ? (
        <NewCollection
          onClose={() => setCreating(false)}
          onCreated={(c) => {
            setCreating(false)
            push({ kind: 'collection', id: c.id })
          }}
        />
      ) : null}
    </div>
  )
}

function NewCollection({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Collection) => void }) {
  const { token, fail } = useApp()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<Visibility>('private')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setError(null)
    try {
      onCreated(await createCollection(token, { name: trimmed, description: description.trim(), visibility }))
    } catch (e) {
      setError(fail(e))
      setBusy(false)
    }
  }

  return (
    <Modal
      title="New collection"
      onClose={() => !busy && onClose()}
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!name.trim() || busy} onClick={() => void create()}>
            {busy ? 'Creating…' : 'Create'}
          </Button>
        </>
      }
    >
      <p className="text-[11px] leading-relaxed text-muted-foreground">A list of games you put together. You can change all of this later.</p>
      <FieldRow label="Name" counter={`${name.length}/${COLLECTION_NAME_MAX}`}>
        <TextField value={name} onChange={setName} max={COLLECTION_NAME_MAX} placeholder="Co-op nights, Short and sweet, ..." disabled={busy} label="Name" />
      </FieldRow>
      <FieldRow label="Description (optional)" counter={`${description.length}/${COLLECTION_DESCRIPTION_MAX}`}>
        <TextArea value={description} onChange={setDescription} max={COLLECTION_DESCRIPTION_MAX} rows={3} placeholder="What ties these games together?" disabled={busy} />
      </FieldRow>
      <FieldRow label="Who can see it">
        <VisibilityChoice value={visibility} onChange={setVisibility} disabled={busy} />
      </FieldRow>
      <Status msg={error} />
    </Modal>
  )
}
