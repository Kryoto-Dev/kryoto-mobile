// End to end: the real dev Desktop's QR -> Android native HTTP -> library,
// Play and Stop. Uses an isolated test executable and the dev Desktop identity.
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createRequire } from 'node:module'
import { copyFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
const root = path.resolve(import.meta.dirname, '..')
const require = createRequire(import.meta.url)
const { build } = require(require.resolve('esbuild', { paths: [path.dirname(require.resolve('vite'))] }))
const desktop = await chromium.connectOverCDP('http://127.0.0.1:9333')
const phone = await chromium.connectOverCDP('http://127.0.0.1:9334')
let shell, before, gameId
try {
  for (const p of desktop.contexts()[0].pages()) {
    if (await p.evaluate(() => document.documentElement.dataset.window).catch(() => '') === 'main') { shell = p; break }
  }
  assert.ok(shell, 'dev Desktop shell must be running')
  const invoke = (command, args = {}) => shell.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), { command, args })
  before = await invoke('phone_status')
  await invoke('phone_set_lan', { on: true })
  const current = await invoke('phone_status')
  assert.match(current.pairUri, /[?&]i=/)
  const fixture = path.join(root, '.tmp', 'phone-game')
  mkdirSync(fixture, { recursive: true })
  const exe = path.join(fixture, 'PING.EXE')
  copyFileSync(path.join(process.env.SystemRoot, 'System32', 'PING.EXE'), exe)
  const game = await shell.evaluate(async ({ exe }) => {
    const { library } = await import('/src/lib/library.ts')
    return library.add(exe, { title: 'Phone pairing test', launchOptions: '-n 300 127.0.0.1' })
  }, { exe: exe.replaceAll('\\', '/') })
  gameId = game.id
  const bundle = await build({ absWorkingDir: root, stdin: { contents: "import { pairFromQr, lanLink } from './src/mobile/link.ts'; window.__testPair = pairFromQr; window.__testLan = lanLink", resolveDir: root }, bundle: true, write: false, platform: 'browser', format: 'iife', define: { 'import.meta.env.VITE_KRYO_API': '""' }, logLevel: 'silent' })
  const p = phone.contexts()[0].pages()[0]
  await p.evaluate(bundle.outputFiles[0].text)
  const start = Date.now()
  const link = await p.evaluate((qr) => window.__testPair(qr), current.pairUri)
  assert.ok(link.lan)
  console.log(`PASS real Desktop QR paired on Android in ${Date.now() - start}ms (${link.lan.host})`)
  const snap = await p.evaluate((cfg) => window.__testLan(cfg).snapshot(), link.lan)
  assert.ok(snap.snapshot.games.some((g) => g.id === gameId))
  console.log('PASS Android sees real Desktop library')
  await p.evaluate(({ cfg, id }) => window.__testLan(cfg).play(id), { cfg: link.lan, id: gameId })
  await new Promise((resolve) => setTimeout(resolve, 600))
  assert.ok((await invoke('game_running')).includes(gameId))
  console.log('PASS Android Play starts an actual desktop process')
  await p.evaluate(({ cfg, id }) => window.__testLan(cfg).stop(id), { cfg: link.lan, id: gameId })
  await new Promise((resolve) => setTimeout(resolve, 500))
  assert.ok(!(await invoke('game_running')).includes(gameId))
  console.log('PASS Android Stop ends that process')
  await assert.rejects(() => p.evaluate((qr) => window.__testPair(qr), current.pairUri), /Wrong code/)
  console.log('PASS same Desktop QR cannot be paired twice')
} finally {
  if (shell && before) {
    await shell.evaluate(async ({ gameId, before }) => {
      const call = window.__TAURI_INTERNALS__.invoke
      if (gameId) { await call('game_stop', { id: gameId }).catch(() => {}); await call('library_remove', { id: gameId, deleteFiles: false }) }
      const after = await call('phone_status')
      for (const d of after.devices) if (!before.devices.some((old) => old.id === d.id)) await call('phone_revoke', { id: d.id })
      if (!before.lan) await call('phone_set_lan', { on: false })
    }, { gameId, before })
  }
  await desktop.close(); await phone.close()
}
