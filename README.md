# Kryoto Mobile

Android companion for [Kryoto Desktop](https://github.com/Kryoto-Dev/kryoto-desktop). Browse the Kryoto catalog, see your library, achievements, downloads and profile, and start games on your PC from your phone.

**Tauri 2 (Rust) + React** · same design language as Kryoto Desktop.

## What it does

- **Store:** browse and search kryo.to's catalog, requests, game pages.
- **Library:** your PC's games in grid or list, Play / Stop on the PC, achievements, downloads (pause, resume, cancel, clear, Clear all).
- **Profile:** your kryo.to account, banner, badges, lists and play time.
- **Connect:** pair with Kryoto Desktop over your Wi-Fi (Settings > Phone on the desktop shows the address and a six-digit code, or a QR code).

Downloads started from the phone solve kryo.to's Cloudflare check on the phone and hand the result to the PC. If the check cannot be solved there, the PC opens the game's page for you to press Download.

## Build

Needs Node 22+, pnpm, Rust, JDK 17+, the Android SDK and NDK (`ANDROID_HOME`, `NDK_HOME`), and the Android Rust targets (`rustup target add aarch64-linux-android`).

```bash
pnpm install
pnpm build                 # typecheck + the web bundle (dist-mobile/)
pnpm android:build         # release APKs, one per ABI: mobile/src-tauri/gen/android/app/build/outputs/apk/
```

`pnpm android:dev` runs the debug build on a connected phone. The release
build (`tauri android build --apk --split-per-abi`, no `--debug`) strips the
Rust lib and splits one APK per ABI — a debug APK bundles debug symbols and is
~300MB, a per-ABI release APK is a fraction of that.

## Release

Bump `version` in `package.json`, `mobile/src-tauri/Cargo.toml` and
`mobile/src-tauri/tauri.conf.json` (all three must agree), push to `main`.
The release workflow tags `v<version>` and attaches signed per-ABI APKs to the
GitHub release.

`pnpm android:dev` runs it on a connected phone.

The phone talks to Kryoto Desktop's phone server (`src-tauri/src/phone.rs` in the desktop repo, `/v1/...` routes), so the desktop side must be a build that has it.

## Layout

| Path | What's there |
|---|---|
| `src/mobile/` | the app: screens, link to the PC, kryo.to calls, motion |
| `src/ui`, `src/lib`, `src/boot`, `src/hooks` | pieces shared with Kryoto Desktop, listed in `shared.json` (see below) |
| `src/lib/preview.ts`, `src/styles.css` | Mobile's own, similar to Desktop's but not shared |
| `mobile/src-tauri/` | the Tauri Android shell (native requests, QR scanning) |

## Files shared with Kryoto Desktop

The files in `shared.json` are copies of the same paths in `kryoto-desktop/src`; Desktop is where they are edited. They stay committed here so Mobile builds on its own, and `scripts/shared.mjs` stops them drifting:

- `pnpm check:shared` (also the first step of `pnpm build`, so CI and the Android release run it) fails if a copy was edited here. It is offline: it compares against the hashes locked in `shared.json`.
- `pnpm sync:shared` copies the files from Desktop's committed HEAD (`--ref <rev>` for another commit, `--from <dir>` for another checkout; by default `../kryoto-desktop`, else a clone from GitHub) and re-locks the hashes. Run it after a Desktop change you want in Mobile, then review the diff and commit.
- `node scripts/shared.mjs check --remote` also reports which copies are behind Desktop's `main` (a warning only; the CI "Shared files" job runs it weekly).

If a file needs to differ on Mobile, don't edit the copy: add the option to the Desktop file (the way `SplashScene` takes both `cell` and `settled`), or move the difference into a Mobile-only file under `src/mobile`.

MIT.
