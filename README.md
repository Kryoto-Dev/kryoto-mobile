<p align="center"><img src="mobile/src-tauri/icons/128x128.png" width="80" alt="Kryoto Mobile"></p>

# Kryoto Mobile

Browse Kryoto games, manage your PC's library and downloads, and start games from your phone.
Android companion for [Kryoto Desktop](https://github.com/Kryoto-Dev/kryoto-desktop).

**Kryoto** · Tauri 2 (Rust) + React · MIT · [Download](https://github.com/Kryoto-Dev/kryoto-mobile/releases/latest) · [All repos](https://github.com/Kryoto-Dev)

Install the APK for your phone (`arm64-v8a` for most modern phones). On the same Wi-Fi, open
Settings > Phone in Desktop and scan its QR code, or choose Manual and enter the address and six-digit code.
New QR codes also connect through kryo.to when both devices are signed in to the same account.
Desktop must include the phone server (`src-tauri/src/phone.rs`, `/v1/...` routes).

The app includes the catalog, requests, achievements and your kryo.to profile. Downloads started
on the phone complete kryo.to's Cloudflare check there and pass the result to the PC; if that
fails, Desktop opens the game's page for you to press Download.

## Quick start

Install Node 22+, pnpm 10, Rust, JDK 17+, and the Android SDK and NDK.
Set `ANDROID_HOME` and `NDK_HOME`, then:

```bash
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
pnpm install --frozen-lockfile
pnpm dev                                # the UI in a browser (http://localhost:1423/mobile.html)
pnpm android:dev                        # the app on a connected phone or emulator
pnpm android:build --split-per-abi       # release APKs, one per ABI
```

APKs are written to `mobile/src-tauri/gen/android/app/build/outputs/apk/`.
Release builds strip Rust symbols; use `pnpm android:build --debug` for a debug APK.

## Layout

| Path | What's there |
|---|---|
| `src/mobile/` | the UI: store, library, downloads, achievements, profile and PC connection |
| `src/ui/`, `src/lib/`, `src/boot/`, `src/hooks/` | components shared with Desktop, listed in `shared.json` |
| `src/lib/preview.ts`, `src/styles.css` | Mobile's own preview data and styles |
| `mobile/src-tauri/` | the Tauri Android shell (native requests, QR scanning) |
| `scripts/shared.mjs` | check and sync the files shared with Desktop |

## Checks

```bash
pnpm build                              # shared-file check, typecheck and UI build (dist-mobile/)
pnpm test:pairing                       # with pnpm dev running; Playwright Chromium required
pnpm test:android                       # debug emulator WebView forwarded to port 9334, ADB on PATH
pnpm test:desktop-android               # also a dev Desktop WebView on port 9333
```

CI runs this on Ubuntu for every push to `main` and every pull request.

## Shared files

Files listed in `shared.json` are committed copies from `kryoto-desktop/src`, so Mobile builds
on its own. Edit them in Desktop, then run `pnpm sync:shared` here and review the diff.
It reads Desktop's committed HEAD from `../kryoto-desktop`, or clones it if that checkout is
missing. Use `--ref <rev>` or `--from <dir>` to choose another revision or checkout.

`pnpm check:shared` checks the locked hashes offline. `node scripts/shared.mjs check --remote`
also reports copies behind Desktop's `main`; CI runs that check weekly as a warning.
Keep Mobile-specific changes under `src/mobile/`, or add an option to the original Desktop
component before syncing it.

## Release

Bump the version in `package.json`, `mobile/src-tauri/Cargo.toml` and
`mobile/src-tauri/tauri.conf.json` together, then push to `main`. The release workflow tags
`v<version>` and publishes signed APKs for each ABI, plus a debug APK for testing.

Set `ANDROID_KEYSTORE_BASE64` and `ANDROID_KEYSTORE_PASSWORD` in the repository's Actions
secrets to keep the signing key between releases; `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`
are optional. Releases fail without a saved key. The app checks for new versions on launch
and offers to download and install the matching APK, with Android's confirmation. Profile >
Notifications & updates has a manual check. Downloads are checked against the release size,
SHA-256 (when supplied by GitHub), package name, version and installed signing certificate.

Versions before 0.2.26 used temporary signing keys. Moving from one of those releases needs
one uninstall/reinstall; later stable releases keep the same key and install in place.

## Android notifications

Profile > Notifications & updates contains only this app's notification choices, plus a
shortcut to Android's notification permissions. All types start off. Enable download
completion/failure, request progress, community replies, news or account alerts separately.
These choices do not change website, email or Discord preferences.

Native WorkManager checks continue after the WebView closes, about every 15 minutes (Android
may delay them to save power). Optional Follow active downloads starts a visible foreground
service when you view an active download and follows it every five seconds after you leave.
It stops after downloads finish, the PC stays unreachable, tracking is disabled, or Android's
background time limit is reached. Notification taps open Downloads or the mobile notifications
page. Tokens are kept in app-private storage, backups are disabled, and signing out clears
native account delivery state.

## License

[MIT](LICENSE). Bundled dependencies: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
