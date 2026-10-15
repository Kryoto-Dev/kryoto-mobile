import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import pkg from './package.json' with { type: 'json' }

/**
 * Kryoto Mobile's web layer (src/mobile), run by the Tauri Android shell in
 * mobile/src-tauri. `pnpm mobile:web` / `pnpm mobile:web:build` (output:
 * dist-mobile/). TAURI_DEV_HOST is set by `tauri android dev` so the phone can
 * reach this server over the network.
 */
const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  clearScreen: false,
  server: {
    port: 1423,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1424 } : undefined,
    open: false,
    watch: { ignored: ['**/src-tauri/**', '**/target/**', '**/mobile/src-tauri/**'] },
  },
  build: {
    outDir: 'dist-mobile',
    target: ['chrome105'],
    sourcemap: false,
    rollupOptions: { input: { index: fileURLToPath(new URL('./mobile.html', import.meta.url)) } },
  },
})
