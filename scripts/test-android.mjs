// Requires a debug APK on an emulator and its WebView forwarded to port 9334.
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'

const adb = process.env.ADB || 'adb'
const address = Object.values(networkInterfaces()).flat().find((a) => a?.family === 'IPv4' && !a.internal && a.address.startsWith('192.168.') && !a.address.startsWith('192.168.56.'))?.address
assert.ok(address, 'a LAN address is needed for native allowlist testing')
let status = 'downloading'
const id = 'android-e2e-desktop'
const download = { id: 'android-e2e-download', title: 'Kryoto notification test', status, received: 1, total: 100, speed: 1 }
const snapshot = () => ({ protocol: 1, installId: id, name: 'Test PC', version: '0.2.26', os: 'windows', games: [], running: [], downloads: [{ ...download, status }] })
const server = createServer((req, res) => {
  res.setHeader('content-type', 'application/json')
  if (req.url === '/v1/info') return res.end(JSON.stringify({ protocol: 1, installId: id }))
  if (req.url === '/v1/snapshot') return res.end(JSON.stringify(snapshot()))
  res.statusCode = 404; res.end('{}')
}).listen(47830, '0.0.0.0')
const browser = await chromium.connectOverCDP('http://127.0.0.1:9334')
try {
  const page = browser.contexts()[0].pages()[0]
  const native = (action, payload = {}) => page.evaluate(({ action, payload }) => window.__TAURI_INTERNALS__.invoke('mobile_action', { action, payload }), { action, payload })
  const state = await native('status')
  assert.equal(typeof state.notifications, 'boolean')
  console.log('PASS native plugin registration and permission status')
  const response = await page.evaluate((url) => window.__TAURI_INTERNALS__.invoke('net_request', { req: { url, method: 'GET', headers: [], body: null, timeoutMs: 2500 } }), `http://${address}:47830/v1/info`)
  assert.equal(response.status, 200)
  assert.equal(JSON.parse(response.body).installId, id)
  console.log('PASS Android native HTTP reaches LAN companion')
  await assert.rejects(() => page.evaluate(() => window.__TAURI_INTERNALS__.invoke('net_request', { req: { url: 'http://8.8.8.8/v1/info', method: 'GET', headers: [], body: null } })))
  console.log('PASS Android native request rejects public HTTP')
  execFileSync(adb, ['shell', 'pm', 'grant', 'to.kryo.mobile', 'android.permission.POST_NOTIFICATIONS'])
  const config = { token: null, lan: { host: `${address}:47830`, token: 'test-only', installId: id, name: 'Test PC' }, prefs: { complete: true, failed: true, live: true } }
  await native('configure', { config: JSON.stringify(config) })
  await native('observe', { config: JSON.stringify(snapshot()) })
  execFileSync(adb, ['shell', 'input', 'keyevent', 'KEYCODE_HOME'])
  status = 'installed'
  // The app is backgrounded: only the native service can see this change.
  await new Promise((resolve) => setTimeout(resolve, 9000))
  const notices = execFileSync(adb, ['shell', 'dumpsys', 'notification', '--noredact'], { encoding: 'utf8', maxBuffer: 4e6 })
  assert.match(notices, /Kryoto notification test is ready/)
  console.log('PASS real Android completion notification while WebView is backgrounded')
  execFileSync(adb, ['shell', 'am', 'start', '-n', 'to.kryo.mobile/.MainActivity'])
  await new Promise((resolve) => setTimeout(resolve, 1000))
  status = 'downloading'
  await native('observe', { config: JSON.stringify(snapshot()) })
  status = 'failed'
  await native('observe', { config: JSON.stringify(snapshot()) })
  const failure = execFileSync(adb, ['shell', 'dumpsys', 'notification', '--noredact'], { encoding: 'utf8', maxBuffer: 4e6 })
  assert.match(failure, /Kryoto notification test needs attention/)
  console.log('PASS native failure notification')
  config.prefs.complete = false
  config.prefs.failed = false
  config.prefs.live = false
  await native('configure', { config: JSON.stringify(config) })
  await native('observe', { config: JSON.stringify(snapshot()) })
  await native('configure', { config: JSON.stringify({ token: null, prefs: {} }) })
  console.log('PASS opt-out and disconnect configuration')
  const update = await native('checkUpdate')
  assert.equal(typeof update.available, 'boolean')
  assert.match(update.version, /^\d+\.\d+\.\d+$/)
  console.log(`PASS native update check (${update.version})`)
} finally {
  server.close()
  await browser.close()
}
