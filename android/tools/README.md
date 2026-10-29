# Bootstrap server address (encrypted)

The Android client ships **one** fallback server address compiled into the APK so
it knows where to connect on the very first launch — before the panel has sent it
anything over FCM. The address is **not** stored in plaintext: it is
RSA‑OAEP(SHA‑256) encrypted in [`app/src/main/assets/config.json`](../app/src/main/assets/config.json).

At runtime [`BootstrapConfig.kt`](../app/src/main/java/com/company/applock/core/BootstrapConfig.kt)
decrypts it with an embedded private key. Precedence (see `ServerConfig`):

1. An address the panel assigned over FCM and cached in `Prefs` — wins once received.
2. Otherwise, this encrypted bootstrap address — used on first launch.

So a fresh install talks to the bootstrap server immediately, and switches
**permanently** to whatever the panel later announces (`SET_SERVER` broadcast, and
`serverUrl` carried on every wake pulse).

> ⚠️ **This is obfuscation, not secrecy.** The decryption key is embedded in the
> APK, so a determined reverse‑engineer can recover the bootstrap domain. The real
> trust anchor for address *changes* is FCM (authenticated by Firebase). Don't put
> anything secret here beyond the convenience of not shipping a plaintext domain.

## Set the real bootstrap address

Run from the `android/` directory, then rebuild the app in Android Studio:

```bash
node tools/encrypt-bootstrap.mjs https://your-real-server.example.com/api/v1
```

This re-encrypts `config.json` with the **existing** key (so already‑installed apps
can still decrypt it). The URL must be the full API base (ending in `/api/v1`).
The existing `port` code is **preserved** across runs.

## Set / change the port (channel) code

The port code (20-char A‑Za‑z0‑9, from the panel's Ports screen) is stored in
plaintext in `config.json` and read by `PortConfig.kt`. Set it with `--port`:

```bash
node tools/encrypt-bootstrap.mjs --port <20-char-code> https://your-server.example.com/api/v1
```

Once set it is kept on every later address change (no need to repeat `--port`).

## Rotate the key

```bash
node tools/encrypt-bootstrap.mjs --rotate https://your-real-server.example.com/api/v1
```

This generates a **new** keypair, rewrites `BootstrapConfig.kt` (new embedded key)
and `bootstrap-public.pem`, and re-encrypts `config.json`. Apps built before the
rotation can no longer decrypt the new `config.json`, so you must rebuild + reinstall.

## Files

| File | Committed? | Purpose |
|------|-----------|---------|
| `app/src/main/assets/config.json` | yes | encrypted bootstrap address (shipped in APK) |
| `app/src/main/java/.../core/BootstrapConfig.kt` | yes | decrypt logic + embedded private key |
| `tools/bootstrap-public.pem` | yes | public key, used to re-encrypt the address |

Changing the address needs only the **public** key — that is the point of using RSA.
