// Run against `pnpm dev`. Exercises the actual modules through Vite, including
// timeouts, one-use codes and authenticated relay fallback, without live accounts.
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) })
try {
  const page = await browser.newPage()
  await page.goto('http://localhost:1423/mobile.html')
  const results = await page.evaluate(async () => {
    const { parsePairingUri, pairFromQr, pairLan, isLanHost } = await import('/src/mobile/link.ts')
    const cases = []
    const check = (name, ok) => { if (!ok) throw new Error(name); cases.push(name) }
    check('only valid private IPv4 and ports', isLanHost('192.168.1.5:47821') && !isLanHost('192.168.999.5:47821') && !isLanHost('8.8.8.8:80') && !isLanHost('192.168.1.5:65536'))
    check('deduplicate and reject public QR hosts', parsePairingUri('kryoto://pair?c=123456&h=10.0.0.1:47821&h=10.0.0.1:47821&h=8.8.8.8:80').hosts.length === 1)
    check('reject unrelated QR / missing codes', !parsePairingUri('https://kryo.to/') && !parsePairingUri('kryoto://pair?h=10.0.0.1:47821'))
    const qr = 'kryoto://pair?c=123456&h=10.8.0.1:47821&h=192.168.56.1:47821&h=192.168.1.5:47821&i=desktop-1234'
    let calls = []
    let mode = 'lan'
    window.fetch = async (url, opts = {}) => {
      url = String(url)
      calls.push({ url, method: opts.method ?? 'GET', headers: opts.headers })
      const reply = (status, data) => new Response(JSON.stringify(data), { status })
      if (url.includes('/api/forge/agents')) return reply(200, { agents: [] })
      if (url.includes('/api/desktop/remote')) return reply(200, { devices: [{ installId: mode === 'wrong-account' ? 'other-desktop' : 'desktop-1234', name: 'Test PC', protocol: mode === 'old-relay' ? 2 : 3, online: true }] })
      if (url.includes('/v1/info')) {
        if (mode === 'legacy') return reply(404, {})
        if (mode === 'wrong-id') return reply(200, { protocol: 1, installId: 'other-desktop' })
        if (url.includes('192.168.1.5') && !['relay', 'wrong-account', 'old-relay'].includes(mode)) return reply(200, { protocol: 1, installId: 'desktop-1234' })
        return new Promise((_, reject) => opts.signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true }))
      }
      if (url.includes('/v1/snapshot')) return reply(401, { error: 'Pair this phone again.' })
      if (url.includes('/v1/pair')) {
        if (mode === 'expired') return reply(401, { error: 'Wrong code.' })
        if (mode === 'incomplete') return reply(200, {})
        return reply(200, { token: 'lan-test-token', installId: 'desktop-1234', name: 'Test PC' })
      }
      return reply(200, {})
    }
    const start = performance.now()
    let result = await pairFromQr(qr)
    check('reachable Wi-Fi bypasses slow VPN / virtual adapters', performance.now() - start < 1000 && result.lan.host === '192.168.1.5:47821')
    check('exactly one code-consuming POST', calls.filter((c) => c.method === 'POST').length === 1)
    check('LAN pairing never receives account credentials', !calls.find((c) => c.method === 'POST').headers.authorization)
    mode = 'expired'; calls = []
    let error = ''
    try { await pairFromQr(qr) } catch (e) { error = e.message }
    check('used / expired code is not retried on other addresses', error === 'Wrong code.' && calls.filter((c) => c.method === 'POST').length === 1)
    mode = 'legacy'; calls = []
    result = await pairFromQr('kryoto://pair?c=123456&h=192.168.1.5:47821')
    check('older Desktop QR codes still pair', !!result.lan && calls.some((c) => c.url.includes('/v1/snapshot')))
    mode = 'relay'; calls = []
    result = await pairFromQr(qr, 'account-test-token')
    check('blocked LAN falls back to the same account PC', result.relay.installId === 'desktop-1234' && !result.lan)
    check('relay pairing does not spend LAN codes', !calls.some((c) => c.method === 'POST'))
    for (const invalid of ['wrong-account', 'old-relay', 'wrong-id']) {
      mode = invalid; calls = []; error = ''
      try { await pairFromQr(qr, invalid === 'wrong-id' ? null : 'account-test-token') } catch (e) { error = e.message }
      check(`reject ${invalid} without consuming pairing code`, error.includes('Could not reach') && !calls.some((c) => c.method === 'POST'))
    }
    mode = 'incomplete'; error = ''
    try { await pairLan('192.168.1.5:47821', '123456') } catch (e) { error = e.message }
    check('reject incomplete pairing replies', error.includes('incomplete'))
    calls = []; error = ''
    try { await pairLan('8.8.8.8:80', '123456') } catch (e) { error = e.message }
    check('manual entry validates before networking', error.includes('private address') && calls.length === 0)
    return cases
  })
  assert.ok(results.length >= 14)
  for (const result of results) console.log(`PASS ${result}`)
} finally { await browser.close() }
