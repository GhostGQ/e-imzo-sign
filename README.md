# e-imzo-web

[![Live demo](https://img.shields.io/badge/demo-live-2ea44f?style=flat-square)](https://ghostgq.github.io/e-imzo-sign/)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-18_%7C_19-61DAFB?style=flat-square&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)

**🚀 [Try the live demo →](https://ghostgq.github.io/e-imzo-sign/)** — runs on the built-in mock, no E-IMZO app required.

E-IMZO signing library for web (React) apps. Wraps the vendor
`e-imzo.js` / `e-imzo-client.js` scripts (the E-IMZO desktop app's `CAPIWS` /
`EIMZOClient` globals) with a framework-agnostic core, a React hook, typed
errors, pluggable keyId caching, and a mock for dev/CI.

Supports **document signing** and **challenge-response login** with both `pfx`
(file) certificates and `ftjc` (hardware token) keys, plus a separate
USB-token / ID-card flow.

## Install

```bash
npm i e-imzo-web
# React is a peer dependency (>=18). Only needed for the /react entry.
```

## Entry points

| Import | Contents |
| --- | --- |
| `e-imzo-web` | `EImzoCore`, `createEImzoCore`, `EImzoError`, `parseX500`, storage factories, `getCertStatus`, types |
| `e-imzo-web/react` | `useEImzo` hook (+ re-exported core factory & types) |
| `e-imzo-web/mock` | `MockEImzoCore` for local dev / Storybook / CI |

## Live demo

An interactive demo runs the real React hooks (`EImzoProvider` + `useEImzo`). It
**auto-detects your local E-IMZO**: if the app is installed with usable keys you
sign with your real certificates; otherwise it transparently falls back to the
built-in `MockEImzoCore`, so it always works **without the E-IMZO desktop app**.
In mock mode you can simulate error scenarios (wrong password, user cancelled)
and network latency.

> Real mode needs a per-domain E-IMZO API key. The demo ships the public
> `localhost` / `127.0.0.1` keys, so real signing works when you run it locally;
> on the hosted page it falls back to the mock unless you register a key for that
> domain and add it to `DEMO_API_KEYS` in [`demo/src/App.tsx`](demo/src/App.tsx).

- **Live page:** **https://ghostgq.github.io/e-imzo-sign/** (auto-deployed by [`.github/workflows/deploy-demo.yml`](.github/workflows/deploy-demo.yml))
- **Run locally:**

  ```bash
  npm install
  npm run demo         # Vite dev server (source-aliased, hot reload)
  # or a production build:
  npm run demo:build && npm run demo:preview
  ```

The demo source lives in [`demo/`](demo/) and imports the library through its
public entry points (`e-imzo-web/react`, aliased to source), so it doubles as a
usage reference.

## Quick start (recommended: `EImzoProvider`)

Wrap the part of your app that signs in `EImzoProvider` once. It memoizes the
core, picks the mode (real/mock), holds the API keys, and runs a **single**
initialization shared by every hook below it. In auto mode the vendor scripts
are injected inline — you host nothing.

```tsx
// app-level (e.g. a client layout / feature boundary)
import { EImzoProvider } from 'e-imzo-web/react'

<EImzoProvider
  config={{ apiKeys: { 'yourdomain.uz': process.env.NEXT_PUBLIC_EIMZO_KEY! } }}
  // minVersion / usbTokenId / keyIdStorage / scriptLoading go inside `config`
  onError={(e) => reportInitError(e)}
>
  <SignFeature />
</EImzoProvider>
```

```tsx
// any descendant — no core passed around
'use client'
import { useEImzo } from 'e-imzo-web/react'

function SignButton() {
  const eimzo = useEImzo({
    getChallenge: async () => (await fetch('/api/challenge')).text(),
    onSuccess: ({ pkcs7, cert }) => sendToServer(pkcs7, cert),
    onError: (e) => showToast(mapCodeToMessage(e.code)), // you own the messaging
  })

  if (eimzo.status !== 'ready') return <Spinner />

  return (
    <>
      <select onChange={(e) => eimzo.selectCertBySerial(e.target.value)}>
        {eimzo.certificates.map((c) => (
          <option key={c.serialNumber} value={c.serialNumber}>
            {c.CN} {eimzo.isCertExpired(c) ? '(expired)' : ''}
          </option>
        ))}
      </select>
      <button onClick={() => eimzo.signIn()}>Sign in</button>
      <button onClick={() => eimzo.signWithUsbToken()}>USB token</button>
    </>
  )
}
```

`isOnlyChallenge` defaults to `true` (login: signs the challenge string). Set it
to `false` and pass `documentToSign` to sign `{...documentToSign, challenge}`.

Need just the shared state (cert list, status) elsewhere? Use `useEImzoCore()`:

```tsx
import { useEImzoCore } from 'e-imzo-web/react'
const { status, certificates, selectedCert, refreshCertificates } = useEImzoCore()
```

### Choosing the mode on the provider

```tsx
// dev/CI: in-memory mock, no E-IMZO app required
<EImzoProvider mock>{children}</EImzoProvider>
<EImzoProvider mock={{ failWith: 'WRONG_PASSWORD' }}>{children}</EImzoProvider>

// or flip by env — mock is bundled into the /react entry when used this way
<EImzoProvider {...(DEV ? { mock: true } : { config })}>{children}</EImzoProvider>

// keep the mock OUT of the production bundle: import it yourself in dev and
// pass an explicit `core` (highest precedence)
<EImzoProvider core={DEV ? new MockEImzoCore() : undefined} config={config}>…</EImzoProvider>
```

The core is rebuilt only when `core`, `mock`, or the serializable `config`
fields (apiKeys / minVersion / usbTokenId / scriptLoading) change — so an inline
`config={{…}}` object is fine. `keyIdStorage` (a function) is treated as stable.

## Initialization in depth

### Two distinct steps: create vs. initialize

Creating a core is **cheap and side-effect free** — it touches no DOM, opens no
WebSocket, and loads no scripts:

```ts
const core = createEImzoCore(config)   // just constructs an object
```

The real work happens in **`init()`** (or the individual steps `loadScripts()`
→ `install()`). This is what talks to the E-IMZO desktop app:

```ts
await core.init()   // = loadScripts() → install() (checkVersion + register API keys)
```

With `EImzoProvider` you never call these yourself: the provider runs
`loadScripts → install → listCertificates` **once** on mount (when `autoInit` is
`true`, the default) and exposes progress via `status`. Multiple hooks under the
same provider share that single run — they do **not** each re-initialize.

### The lifecycle / `status` machine

```
idle → loading_scripts → installing → ready
                                  ↘ error   (any step failed)
```

| `status` | meaning | `isInstalling` |
| --- | --- | --- |
| `idle` | created, not started | `false` |
| `loading_scripts` | injecting/awaiting vendor scripts | `true` |
| `installing` | checkVersion + installApiKeys running | `true` |
| `ready` | certificates enumerated, ready to sign | `false` |
| `error` | a step failed; inspect `error` | `false` |

Gate your UI on it:

```tsx
const { status, error } = useEImzoCore()
if (status === 'error')  return <RetryBox error={error} />
if (status !== 'ready')  return <Spinner />
```

### `EImzoConfig` reference (what goes inside `config`)

| field | required | default | purpose |
| --- | --- | --- | --- |
| `apiKeys` | ✅ | — | `{ domain: keyHex }` (or `[{domain, key}]`), set on `EIMZOClient.API_KEYS` before install |
| `minVersion` | | `{ major: 3, minor: 37 }` | installed E-IMZO below this → `OUTDATED_VERSION` |
| `usbTokenId` | | `'ckc'` | id for the USB-token / ID-card flow (configurable, not hardcoded) |
| `keyIdStorage` | | `cookieKeyIdStorage()` | where the loaded keyId is cached (cookie / localStorage / memory) |
| `scriptLoading` | | `{ mode: 'auto' }` | `auto` = inline-inject vendor JS; `manual` = you drive `<Script>` |

```tsx
<EImzoProvider
  config={{
    apiKeys: { 'yourdomain.uz': process.env.NEXT_PUBLIC_EIMZO_KEY! },
    minVersion: { major: 3, minor: 37 },
    usbTokenId: 'ckc',
    keyIdStorage: localStorageKeyIdStorage(),
    scriptLoading: { mode: 'auto' },
  }}
  onError={(e) => reportInitError(e)}   // init/enumeration failures land here
>
  <SignFeature />
</EImzoProvider>
```

### Where to mount the provider

Mount it around the **feature that signs**, not globally — this way the vendor
scripts and the WebSocket to the E-IMZO app are only loaded where signing is
actually used.

**Next.js (App Router).** The provider uses browser APIs and React state, so it
must live in a Client Component. Create a client wrapper and drop it into the
relevant `layout.tsx`/`page.tsx` — do **not** put it in the root layout:

```tsx
// app/(sign)/eimzo-provider.tsx
'use client'
import { EImzoProvider } from 'e-imzo-web/react'

export function AppEImzoProvider({ children }: { children: React.ReactNode }) {
  return (
    <EImzoProvider config={{ apiKeys: { 'yourdomain.uz': process.env.NEXT_PUBLIC_EIMZO_KEY! } }}>
      {children}
    </EImzoProvider>
  )
}
```

```tsx
// app/(sign)/layout.tsx  — server component is fine; the wrapper is the client boundary
import { AppEImzoProvider } from './eimzo-provider'
export default function Layout({ children }: { children: React.ReactNode }) {
  return <AppEImzoProvider>{children}</AppEImzoProvider>
}
```

`process.env.NEXT_PUBLIC_EIMZO_KEY` is the per-domain E-IMZO API key — it is not
a secret (the browser sends it to the local E-IMZO app), so `NEXT_PUBLIC_` is
correct.

**Plain React (Vite / CRA).** Wrap the signing subtree (or the app root if the
whole app signs):

```tsx
import { EImzoProvider } from 'e-imzo-web/react'

<EImzoProvider config={{ apiKeys: { [location.hostname]: import.meta.env.VITE_EIMZO_KEY } }}>
  <SignRoutes />
</EImzoProvider>
```

### Switching real ⇄ mock at the initialization point

The provider is the single place to toggle the backend, so no signing component
changes between dev and prod:

```tsx
const useMock = import.meta.env.DEV // or process.env.NEXT_PUBLIC_EIMZO_MOCK === '1'

// simplest — mock (~2.5 KB) gets bundled into the /react entry:
<EImzoProvider {...(useMock ? { mock: true } : { config })}>{children}</EImzoProvider>

// keep mock out of prod — import it only in dev code and pass an explicit core:
<EImzoProvider core={useMock ? new MockEImzoCore() : undefined} config={config}>
  {children}
</EImzoProvider>
```

### Deferred / manual initialization and retry

- **Defer init:** pass `autoInit={false}` and call `initialize()` yourself when
  you actually want to connect (e.g. when the user opens the sign dialog):

  ```tsx
  <EImzoProvider config={config} autoInit={false}>…</EImzoProvider>
  // later, in a descendant:
  const { initialize, status } = useEImzoCore()
  useEffect(() => { if (open) void initialize() }, [open])
  ```

- **Retry after failure:** a failed init is not sticky — after `status === 'error'`
  (e.g. the E-IMZO app was closed), calling `initialize()` again re-runs the full
  sequence. Wire it to a "Retry" button.

- **Refresh certificates:** after the user plugs in a token or imports a key,
  call `refreshCertificates()` to re-enumerate without a full re-init.

### What auto-mode actually injects

In `scriptLoading: { mode: 'auto' }` the provider/core inlines the bundled vendor
scripts (`e-imzo.js` then `e-imzo-client.js`) as `<script>` tags in `<head>` the
first time `loadScripts()` runs. On SPA remounts it detects an existing
`window.EIMZOClient` and resolves immediately, so re-opening a sign modal is
instant and never double-injects. For `manual` mode see
[Manual script loading](#manual-script-loading-nextjs-script) below.

## Without a provider (standalone)

Build a core yourself and pass it to the hook; the hook then owns the lifecycle.
Useful for a single isolated sign screen.

```tsx
import { createEImzoCore, useEImzo } from 'e-imzo-web/react'
const core = createEImzoCore({ apiKeys })            // create ONCE (module scope), not per render
const eimzo = useEImzo({ core, getChallenge, onSuccess })
```

## Manual script loading (Next.js `<Script>`)

Serve the vendor files from your `/public` (copy from `e-imzo-web/vendor/…`)
and drive the loader with the hook's handlers. Works with the provider too — the
same handlers are on `useEImzoCore()`.

```tsx
const core = createEImzoCore({ apiKeys, scriptLoading: { mode: 'manual' } })
const eimzo = useEImzo({ core, getChallenge, onSuccess })

<Script src="/e-imzo.js"        onLoad={eimzo.onBaseScriptLoad}   onError={eimzo.onScriptError} />
<Script src="/e-imzo-client.js" onLoad={eimzo.onClientScriptLoad} onError={eimzo.onScriptError} />
```

## Mock (dev / CI)

```ts
import { MockEImzoCore } from 'e-imzo-web/mock'

const core = new MockEImzoCore()                              // realistic fixtures
const core = new MockEImzoCore({ failWith: 'WRONG_PASSWORD' }) // test error paths
```

`MockEImzoCore` implements the same `IEImzoCore` interface, so it drops into
`useEImzo` unchanged. No E-IMZO app, WebSocket or `window` required.

## Errors

All failures reject with an `EImzoError` carrying a machine-readable `code`.
No i18n/toasts are built in — map codes to your own UX.

| code | meaning |
| --- | --- |
| `APP_NOT_RUNNING` | E-IMZO desktop app / CAPIWS not reachable |
| `WRONG_PASSWORD` | wrong key password/PIN (`BadPaddingException`) |
| `OUTDATED_VERSION` | installed version below `minVersion` |
| `USER_CANCELLED` | user dismissed the PIN/password dialog |
| `INVALID_API_KEY` | API key registration failed |
| `UNKNOWN` | anything else (see `error.reason`) |

## keyId cache

`sign()` caches the loaded keyId so a second signature skips the PIN prompt.
Choose storage via `keyIdStorage`:

```ts
import { cookieKeyIdStorage, localStorageKeyIdStorage, memoryKeyIdStorage } from 'e-imzo-web'
createEImzoCore({ apiKeys, keyIdStorage: localStorageKeyIdStorage() }) // default: cookie
```

## Core without React

```ts
import { createEImzoCore } from 'e-imzo-web'
const core = createEImzoCore({ apiKeys })
await core.init()                       // loadScripts + install
const certs = await core.listCertificates()
const { pkcs7 } = await core.sign(certs[0], challenge)
```

## Development

```bash
npm run build:vendor   # regenerate src/core/vendor.ts from vendor/*.js
npm run typecheck
npm test
npm run build          # dist/{core,react,mock} — ESM + CJS + d.ts
```

`vendor/e-imzo.js` and `vendor/e-imzo-client.js` are the upstream E-IMZO scripts
(the client's `API_KEYS` array is emptied; keys come from `EImzoConfig.apiKeys`
at runtime). `scripts/build-vendor.mjs` inlines them into `src/core/vendor.ts`
for auto-mode injection.
