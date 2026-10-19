import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '@/lib/bridge'
import { acct } from './api'

/** What kryo.to's /api/account/media accepts. */
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/avif'
/** lib/supporter-perks.ts ANIMATABLE_TYPES: the only types that can carry animation, so the only ones worth sniffing. */
const ANIMATABLE_TYPES: Record<string, true> = { 'image/gif': true, 'image/webp': true, 'image/avif': true }

/** The input must stay referenced until Android's chooser answers, or the page may collect it first. */
let chooser: HTMLInputElement | null = null

/** Ask for one picture; null when the player backs out. */
export function pickImage(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = ACCEPT
    input.style.display = 'none'
    const done = (file: File | null) => {
      input.remove()
      if (chooser === input) chooser = null
      resolve(file)
    }
    input.addEventListener('change', () => done(input.files?.[0] ?? null))
    input.addEventListener('cancel', () => done(null))
    chooser = input
    document.body.appendChild(input)
    input.click()
  })
}

/**
 * Does this file actually move? Port of lib/supporter-perks.ts `isAnimated`: the
 * container says, not the content type. Unreadable counts as a still, the
 * direction that fails closed.
 */
export function isAnimated(bytes: Uint8Array): boolean {
  if (bytes.length < 16) return false
  const ascii = (at: number, len: number) => String.fromCharCode(...bytes.slice(at, at + len))
  if (ascii(0, 3) === 'GIF') return gifHasMultipleFrames(bytes)
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return webpIsAnimated(bytes)
  if (ascii(4, 4) === 'ftyp') return ascii(8, Math.min(bytes.length, 64) - 8).includes('avis')
  return false
}

/** GIF holds one image descriptor (0x2C) per frame; walk the blocks rather than count the byte, which also turns up inside pixel data. */
function gifHasMultipleFrames(bytes: Uint8Array): boolean {
  const at = (i: number) => bytes[i] ?? 0
  let i = 13
  if (at(10) & 0x80) i += 3 * 2 ** ((at(10) & 0x07) + 1)
  let frames = 0
  while (i < bytes.length) {
    const block = at(i)
    if (block === 0x3b) return false
    if (block === 0x21) {
      i += 2
      while (i < bytes.length && at(i) !== 0) i += at(i) + 1
      i += 1
      continue
    }
    if (block === 0x2c) {
      frames += 1
      if (frames > 1) return true
      const packed = at(i + 9)
      i += 10
      if (packed & 0x80) i += 3 * 2 ** ((packed & 0x07) + 1)
      i += 1
      while (i < bytes.length && at(i) !== 0) i += at(i) + 1
      i += 1
      continue
    }
    // The walk lost the structure; guessing from here would be worse than admitting it.
    return false
  }
  return false
}

/** RIFF chunk walk; an ANIM or ANMF chunk is what makes a WebP animated. */
function webpIsAnimated(bytes: Uint8Array): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let i = 12
  while (i + 8 <= bytes.length) {
    const tag = String.fromCharCode(bytes[i] ?? 0, bytes[i + 1] ?? 0, bytes[i + 2] ?? 0, bytes[i + 3] ?? 0)
    if (tag === 'ANIM' || tag === 'ANMF') return true
    const size = view.getUint32(i + 4, true)
    i += 8 + size + (size % 2)
    if (size === 0) break
  }
  return false
}

/**
 * What to do with a picked file, as the web's `pickMedia` decides:
 * a still goes to the cropper; an animated one is kept as it is when the account
 * holds the animated-media perk (a canvas can only take one frame, so cropping
 * would flatten it), and otherwise goes to the cropper as the still it will become.
 */
export async function classifyImage(file: File, mayAnimate: boolean): Promise<'crop' | 'keep' | 'flatten'> {
  if (!ANIMATABLE_TYPES[file.type]) return 'crop'
  let moving: boolean
  try {
    moving = isAnimated(new Uint8Array(await file.arrayBuffer()))
  } catch {
    moving = false
  }
  if (!moving) return 'crop'
  return mayAnimate ? 'keep' : 'flatten'
}

/** A blob's bytes as bare base64 (no `data:` prefix), the shape `net_upload` takes. */
async function base64Of(blob: Blob): Promise<string> {
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the picture.'))
    reader.readAsDataURL(blob)
  })
  return url.slice(url.indexOf(',') + 1)
}

/**
 * Store a picture and return the address it is served from.
 *
 * `POST /api/account/media` answers a presigned PUT to kryo.to's file host; the
 * bytes go there directly. In the app the PUT goes through the native
 * `net_upload` (the page's CSP only allows kryo.to), in a browser preview
 * through `fetch`. `animated` only ever asks for more than the default; the
 * server grants it from the account's perks.
 */
export async function uploadImage(token: string, blob: Blob, type: 'avatar' | 'banner' | 'donation_proof', animated: boolean): Promise<string> {
  const contentType = blob.type || 'image/webp'
  const { uploadUrl, publicUrl } = await acct<{ uploadUrl: string; publicUrl: string }>(token, '/api/account/media', {
    method: 'POST',
    body: { type, contentType, size: blob.size, animated },
  })
  let status: number
  if (isTauri()) {
    status = await invoke<number>('net_upload', { req: { url: uploadUrl, contentType, dataBase64: await base64Of(blob) } })
  } else {
    status = (await fetch(uploadUrl, { method: 'PUT', headers: { 'content-type': contentType }, body: blob })).status
  }
  if (status < 200 || status > 299) throw new Error(`Storage rejected the ${type} upload.`)
  return publicUrl
}
