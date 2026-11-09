// Render Kryoto Mobile's Android icons from the traced K// mark.
//
//   pnpm brand
//
// `gen/android` starts with Tauri's logo, and `tauri icon` would only draw a
// square picture of something else, so the launcher art comes from here:
//
//   res/mipmap-*/ic_launcher.png             a square tile, for old Androids
//   res/mipmap-*/ic_launcher_round.png       the same in a circle
//   res/mipmap-*/ic_launcher_foreground.png  the mark alone on transparency
//   res/mipmap-anydpi-v26/ic_launcher*.xml   the adaptive icon, with the
//                                            foreground as the themed layer too
//   res/values/ic_launcher_background.xml    the tile's colour
//   res/drawable/ic_notification.xml         the status bar's white mark
//   mobile/src-tauri/icons/                  the same tile for the README
//
// Deterministic: same code in, same pixels out.

import sharp from 'sharp'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tauri = path.join(root, 'mobile', 'src-tauri')
const res = path.join(tauri, 'gen', 'android', 'app', 'src', 'main', 'res')
const icons = path.join(tauri, 'icons')

// mark.ts is generated data, read as text so this runs on plain Node.
const source = readFileSync(path.join(root, 'src', 'ui', 'ascii', 'mark.ts'), 'utf8')
const MARK_W = Number(/MARK_W = (\d+)/.exec(source)[1])
const MARK_H = Number(/MARK_H = (\d+)/.exec(source)[1])
const MARK_PATH = /MARK_PATH =\s*'([^']+)'/.exec(source)[1]

const INK = '#ededed'
const TILE = '#0a0a0a'

const mark = (S, width, fill) => {
  const k = width / MARK_W
  return `<path transform="translate(${(S - width) / 2} ${(S - MARK_H * k) / 2}) scale(${k})" d="${MARK_PATH}" fill="${fill}"/>`
}
const svg = (S, body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${body}</svg>`)
const png = (input, size) => sharp(input).resize(size, size, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toBuffer()

const S = 1024
const tile = svg(S, `<rect width="${S}" height="${S}" rx="${S * 0.22}" fill="${TILE}"/>${mark(S, S * 0.74, INK)}`)
const round = svg(S, `<circle cx="${S / 2}" cy="${S / 2}" r="${S / 2}" fill="${TILE}"/>${mark(S, S * 0.7, INK)}`)
// An adaptive icon is cut from the middle 66 of its 108 units, and a launcher
// may cut a circle: 52 units wide keeps the whole mark clear of its edge.
const foreground = svg(S, mark(S, (S * 52) / 108, INK))

const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
for (const [name, scale] of Object.entries(densities)) {
  const dir = path.join(res, `mipmap-${name}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'ic_launcher.png'), await png(tile, 48 * scale))
  writeFileSync(path.join(dir, 'ic_launcher_round.png'), await png(round, 48 * scale))
  writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), await png(foreground, 108 * scale))
}

const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <monochrome android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`
const anydpi = path.join(res, 'mipmap-anydpi-v26')
mkdirSync(anydpi, { recursive: true })
writeFileSync(path.join(anydpi, 'ic_launcher.xml'), adaptive)
writeFileSync(path.join(anydpi, 'ic_launcher_round.xml'), adaptive)
writeFileSync(
  path.join(res, 'values', 'ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${TILE}</color>\n</resources>\n`,
)

// The status bar draws this as a flat white shape at 24dp. The mark's real
// outline, as big as it goes.
writeFileSync(
  path.join(res, 'drawable', 'ic_notification.xml'),
  `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="${MARK_W}" android:viewportHeight="${MARK_W}">
    <group android:translateY="${(MARK_W - MARK_H) / 2}">
        <path android:fillColor="#FFFFFFFF" android:pathData="${MARK_PATH}" />
    </group>
</vector>
`,
)

for (const [file, size] of [['32x32.png', 32], ['128x128.png', 128], ['128x128@2x.png', 256], ['icon.png', 1024]]) {
  writeFileSync(path.join(icons, file), await png(tile, size))
}
console.log('Android icons written.')
