import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Caption } from '@/ui'
import { cn } from '@/lib/utils'
import { AVATAR_OUTPUT_SIZE, BANNER_ASPECT, BANNER_OUTPUT_HEIGHT, BANNER_OUTPUT_WIDTH, CROP_QUALITY } from './profile-options'

export type CropShape = 'circle' | 'banner'

/** Output sizes as components/ui/image-crop-modal.tsx writes them; the mask has the same shape, so `outW / maskW` and `outH / maskH` agree. */
const OUTPUT = { circle: { w: AVATAR_OUTPUT_SIZE, h: AVATAR_OUTPUT_SIZE }, banner: { w: BANNER_OUTPUT_WIDTH, h: BANNER_OUTPUT_HEIGHT } }
const MAX_ZOOM = 4

/**
 * Frame a picture inside a fixed-shape mask: drag to move, slide to zoom, "Use"
 * writes exactly what the mask shows (WebP; PNG where the browser cannot).
 */
export function Cropper({ file, shape, title, onCancel, onApply }: { file: File; shape: CropShape; title: string; onCancel: () => void; onApply: (blob: Blob, previewUrl: string) => void }) {
  const stage = useRef<HTMLDivElement | null>(null)
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [failed, setFailed] = useState(false)
  const [space, setSpace] = useState({ w: 0, h: 0 })
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setSrc(url)
    setImage(null)
    setFailed(false)
    setZoom(1)
    setPan({ x: 0, y: 0 })
    const img = new Image()
    img.onload = () => setImage(img)
    img.onerror = () => setFailed(true)
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  useEffect(() => {
    const el = stage.current
    if (!el) return
    const measure = () => setSpace({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // The mask: as wide as the stage allows (a square for the avatar, 3:1 for the banner), with a margin.
  const maskW = shape === 'circle' ? Math.max(0, Math.min(space.w - 32, space.h - 32, 360)) : Math.max(0, Math.min(space.w - 32, 560))
  const maskH = shape === 'circle' ? maskW : maskW / BANNER_ASPECT
  const natW = image?.naturalWidth ?? 0
  const natH = image?.naturalHeight ?? 0
  // The scale at which the picture just covers the mask; zoom is a multiple of it.
  const baseScale = natW > 0 && natH > 0 ? Math.max(maskW / natW, maskH / natH) : 1
  const scale = baseScale * zoom
  // How far the picture can move before one of its edges comes inside the mask.
  const limitX = Math.max(0, (natW * scale - maskW) / 2)
  const limitY = Math.max(0, (natH * scale - maskH) / 2)
  const clamp = useCallback((p: { x: number; y: number }) => ({ x: Math.min(limitX, Math.max(-limitX, p.x)), y: Math.min(limitY, Math.max(-limitY, p.y)) }), [limitX, limitY])

  useEffect(() => {
    setPan((p) => {
      const next = clamp(p)
      return next.x === p.x && next.y === p.y ? p : next
    })
  }, [clamp])

  const apply = () => {
    if (!image || busy || maskW === 0) return
    setBusy(true)
    const out = OUTPUT[shape]
    const canvas = document.createElement('canvas')
    canvas.width = out.w
    canvas.height = out.h
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      setBusy(false)
      return
    }
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    const ratio = out.w / maskW
    ctx.translate(out.w / 2 + pan.x * ratio, out.h / 2 + pan.y * ratio)
    ctx.scale(scale * ratio, scale * ratio)
    ctx.drawImage(image, -natW / 2, -natH / 2, natW, natH)
    const finish = (blob: Blob | null) => {
      if (!blob) {
        setBusy(false)
        return
      }
      onApply(blob, URL.createObjectURL(blob))
    }
    // A browser that cannot write WebP hands back null (or a PNG); fall back to PNG explicitly.
    canvas.toBlob((blob) => (blob ? finish(blob) : canvas.toBlob(finish, 'image/png')), 'image/webp', CROP_QUALITY)
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[80] flex flex-col bg-background pb-[var(--sab)] pt-[var(--sat)]">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <p className="text-sm font-bold text-foreground">{title}</p>
        <Caption>Drag to move</Caption>
      </div>
      <div
        ref={stage}
        className="relative min-h-0 flex-1 touch-none select-none overflow-hidden bg-black"
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (d) setPan(clamp({ x: d.panX + e.clientX - d.x, y: d.panY + e.clientY - d.y }))
        }}
        onPointerUp={() => {
          drag.current = null
        }}
        onPointerCancel={() => {
          drag.current = null
        }}
      >
        {src && image ? (
          <img
            src={src}
            alt=""
            draggable={false}
            className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
            style={{ width: natW, height: natH, transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
          />
        ) : null}
        {image && maskW > 0 ? (
          <div
            className={cn('pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]', shape === 'circle' ? 'rounded-full' : 'rounded-md')}
            style={{ width: maskW, height: maskH }}
          />
        ) : null}
        {!image ? <p className="absolute inset-0 grid place-items-center px-6 text-center text-xs text-muted-foreground">{failed ? 'This picture could not be opened. Pick a PNG, JPEG, WebP, GIF or AVIF.' : 'Opening the picture…'}</p> : null}
      </div>
      <div className="grid gap-3 border-t border-border px-4 py-3">
        <label className="flex items-center gap-3">
          <Caption>Zoom</Caption>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            disabled={!image}
            aria-label="Zoom"
            onChange={(e) => setZoom(Number(e.target.value))}
            className="min-w-0 flex-1 accent-primary"
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={apply} disabled={!image || busy}>
            {busy ? 'Working…' : 'Use'}
          </Button>
        </div>
      </div>
    </div>
  )
}
