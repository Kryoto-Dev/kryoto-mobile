import { useState } from 'react'
import { Modal } from '@/ui'
import { mediaRows } from '@/rich/attachment-layout'
import type { CommentAttachment } from '@/mobile/catalog'
import { useBackCloses } from '@/mobile/parts'

/**
 * A comment's photos, GIFs, clips and audio, as on kryo.to: each whole at its
 * real shape, in the shared layout (rich/attachment-layout.ts), the space held
 * from the size kept at upload. A tap opens a picture full size; a clip plays
 * where it is.
 */
export function Attachments({ items }: { items: CommentAttachment[] }) {
  const [open, setOpen] = useState<CommentAttachment | null>(null)
  const [learnt, setLearnt] = useState<Record<string, { width: number; height: number }>>({})
  const [failed, setFailed] = useState<Record<string, boolean>>({})
  useBackCloses(!!open, () => setOpen(null))
  const rows = mediaRows(items.filter((a) => a.kind !== 'audio').map((a) => ({ ...a, ...learnt[a.id] })))
  const learn = (a: CommentAttachment, width: number, height: number) => {
    if (!a.width && width && height) setLearnt((known) => ({ ...known, [a.id]: { width, height } }))
  }
  const fail = (a: CommentAttachment) => setFailed((known) => ({ ...known, [a.id]: true }))
  return (
    <div className="mt-1 grid gap-1">
      {rows.length ? (
        <div className="kryo-media">
          {rows.map((row) => (
            <div key={row.cells[0]!.item.id} className="kryo-media-row" style={{ maxWidth: row.maxWidth }}>
              {row.cells.map(({ item: a, ratio }) => {
                const cell = { flex: `${ratio} ${ratio} 0`, aspectRatio: String(ratio) }
                if (failed[a.id]) {
                  return (
                    <span key={a.id} style={cell} className="kryo-media-cell grid place-items-center p-2 text-center text-[11px] text-muted-foreground">
                      This file did not load.
                    </span>
                  )
                }
                if (a.kind === 'video') {
                  return (
                    <div key={a.id} style={cell} className="kryo-media-cell">
                      <video src={a.url} controls preload="metadata" playsInline onLoadedMetadata={(e) => learn(a, e.currentTarget.videoWidth, e.currentTarget.videoHeight)} onError={() => fail(a)} />
                    </div>
                  )
                }
                return (
                  <button key={a.id} type="button" onClick={() => setOpen(a)} style={cell} className="kryo-media-cell" aria-label={`Open ${a.name}`}>
                    <img src={a.url} alt={a.name} loading="lazy" decoding="async" onLoad={(e) => learn(a, e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)} onError={() => fail(a)} />
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      ) : null}
      {items.filter((a) => a.kind === 'audio').map((a) => (
        <audio key={a.id} src={a.url} controls preload="metadata" className="w-full" />
      ))}
      {open ? (
        <Modal title={open.name} onClose={() => setOpen(null)} wide>
          <img src={open.url} alt={open.name} className="mx-auto max-h-[75svh] w-auto max-w-full" />
        </Modal>
      ) : null}
    </div>
  )
}
