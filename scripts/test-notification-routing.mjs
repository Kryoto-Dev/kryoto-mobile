import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) })
try {
  const page = await browser.newPage()
  await page.addInitScript(() => {
    localStorage.setItem('kryoto.mobile.guest', '1')
    localStorage.setItem('kryoto.mobile.link', JSON.stringify({ lan: { host: '192.168.1.5:47821', token: 'test', installId: 'routing-test', name: 'Test PC' } }))
    let opened = false
    window.__TAURI_INTERNALS__ = {
      invoke: async (command, args) => {
        if (command === 'net_request') return { status: 200, body: JSON.stringify({ protocol: 1, installId: 'routing-test', name: 'Test PC', version: '0.2.27', os: 'windows', games: [], running: [], downloads: [] }) }
        if (command === 'mobile_action') {
          if (args.action === 'status') { const target = opened ? null : 'downloads'; opened = true; return { notifications: true, localNetwork: true, target } }
          if (args.action === 'checkUpdate') return { available: false, version: '0.2.26' }
          return null
        }
        return null
      },
    }
  })
  await page.route('https://kryo.to/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ games: [], total: 0 }) }))
  await page.goto('http://localhost:1423/mobile.html')
  const downloads = page.getByRole('button', { name: 'Downloads', exact: true })
  await downloads.waitFor({ state: 'visible', timeout: 20_000 })
  assert.match(await downloads.getAttribute('class'), /m-tab-on/)
  console.log('PASS a download notification opens Downloads on a cold app start')
} finally { await browser.close() }
