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
| `e-imzo-web/react` | `EImzoProvider`, `useEImzo`, `useEImzoCore`, core factory and types |
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
    getChallenge: async (signal) => {
      const response = await fetch('/api/challenge', { signal })
      if (!response.ok) throw new Error('Could not get a signing challenge')
      return response.text()
    },
    onSuccess: ({ pkcs7 }) => showSignature(pkcs7),
    onError: (e) => showToast(mapCodeToMessage(e.code)), // you own the messaging
  })

  if (eimzo.status !== 'ready') return <Spinner />
  const busy = eimzo.isSigning || eimzo.isUsbTokenSigning

  return (
    <>
      <select
        aria-label="Signing certificate"
        value={eimzo.selectedCert ? eimzo.certificates.indexOf(eimzo.selectedCert) : -1}
        onChange={(e) => eimzo.selectCert(eimzo.certificates[Number(e.target.value)]!)}
      >
        <option value={-1} disabled>Choose a certificate</option>
        {eimzo.certificates.map((c, index) => (
          <option key={index} value={index} disabled={eimzo.getCertStatus(c) !== 'valid'}>
            {c.CN} ({eimzo.getCertStatus(c)})
          </option>
        ))}
      </select>
      <button disabled={busy || !eimzo.selectedCert || eimzo.getCertStatus(eimzo.selectedCert) !== 'valid'}
        onClick={() => void eimzo.signIn()}>Sign in</button>
      <button disabled={busy} onClick={() => void eimzo.signWithUsbToken()}>USB token</button>
    </>
  )
}
```

`isOnlyChallenge` defaults to `true`. The hook signs the exact string returned by
`getChallenge`, and the bundled E-IMZO client encodes it as UTF-8 before signing.
For document signing, the backend can return the complete serialized UTF-8 text
to sign, including the challenge. Keep `isOnlyChallenge: true` for this flow.

The existing `isOnlyChallenge: false` option signs the result of JavaScript
`JSON.stringify({ ...documentToSign, challenge })`. The server must verify the
original bytes and compare the decoded contents with its expected document and
challenge. Re-serializing an object on another platform can change key order or
number formatting.

### Signing result and cancellation

`signIn(cert?)` and `signWithUsbToken()` both return `Promise<SignOutcome>`.
`signIn()` uses the current selection unless you pass a certificate explicitly.
`SignOutcome` carries either `{ ok: true, result: { pkcs7, cert? } }` or
`{ ok: false, error: EImzoError }`.

```ts
const outcome = await eimzo.signIn()
if (outcome.ok) {
  await submitSignature(outcome.result.pkcs7)
} else {
  showError(outcome.error.code)
}
```

`onSuccess(result)` and `onError(error)` are optional notifications. Existing
event handlers that ignore the returned value can keep using them. Handle
exceptions and rejected promises inside your callbacks. An exception thrown
synchronously by a callback propagates to the caller.

Hooks sharing a core allow one signing flow at a time, starting with challenge
fetching. A second certificate or USB request returns `SIGNING_IN_PROGRESS`.
Un-mounting the hook, replacing its core, or changing its certificate selection
during certificate signing aborts the challenge signal and suppresses callbacks
from that operation. The caller receives `USER_CANCELLED`. An operation already
started in E-IMZO can still finish, and that core stays busy until it settles.

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

// or flip by env
<EImzoProvider {...(DEV ? { mock: true } : { config })}>{children}</EImzoProvider>

// supply a pre-created or custom core (highest precedence)
<EImzoProvider core={customCore}>…</EImzoProvider>
```

The core is rebuilt only when `core`, `mock`, or the serializable `config`
fields (apiKeys / minVersion / usbTokenId / scriptLoading) change — so an inline
`config={{…}}` object is fine. For storage rotation, remount the provider with a
new storage instance or supply a new explicit core.

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
  call `refreshCertificates()` to re-enumerate. The selected certificate is
  replaced with the fresh entry or cleared if it disappeared. A failed refresh
  reports a typed error through both the lifecycle state and the rejected promise.
  Call `refreshCertificates()` again to retry it.

During initialization, concurrent calls to `initialize()` share one run.
`initialize()` reports failures through lifecycle `status`, `error` and the
provider's `onError` callback.

### What auto-mode actually injects

In `scriptLoading: { mode: 'auto' }` the provider/core inlines the bundled vendor
scripts (`e-imzo.js` then `e-imzo-client.js`) as `<script>` tags in `<head>` the
first time `loadScripts()` runs. On remounts it reuses loaded vendor globals.
A retry replaces failed script tags and reuses the script that loaded. For `manual` mode see
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

<Script src="/e-imzo.js"        onReady={eimzo.onBaseScriptLoad}   onError={eimzo.onScriptError} />
<Script src="/e-imzo-client.js" onReady={eimzo.onClientScriptLoad} onError={eimzo.onScriptError} />
```

For a manual retry, call `initialize()` again and arrange for the host page to
reload the failed script and call the relevant handler. With Next.js, a changed
script URL (such as a retry query parameter) can trigger a fresh request.

## Mock (dev / CI)

```ts
import { MockEImzoCore } from 'e-imzo-web/mock'

const core = new MockEImzoCore()                              // realistic fixtures
const core = new MockEImzoCore({ failWith: 'WRONG_PASSWORD' }) // test error paths
```

`MockEImzoCore` implements the same `IEImzoCore` interface, so it drops into
`useEImzo` unchanged. No E-IMZO app, WebSocket or `window` required.

## Errors

Vendor errors carry an `EImzoError.code`, with the original error/event and vendor
reason when supplied. Use the code for UI and leave raw diagnostics out of
user-facing messages. Signing hooks return errors in `SignOutcome`.

| code | meaning |
| --- | --- |
| `APP_NOT_RUNNING` | E-IMZO desktop app / CAPIWS not reachable |
| `WRONG_PASSWORD` | wrong key password/PIN (`BadPaddingException`) |
| `OUTDATED_VERSION` | installed version below `minVersion` |
| `USER_CANCELLED` | PIN/password dialog dismissed or the signing context changed |
| `INVALID_API_KEY` | API key registration failed |
| `INVALID_CERTIFICATE` | missing selection or unusable certificate metadata |
| `SIGNING_IN_PROGRESS` | a signing request already holds the core |
| `UNKNOWN` | anything else (see `error.reason`) |

## keyId cache

`sign()` can reuse a loaded `keyId`, a vendor handle. It keeps separate entries
by certificate serial, key type and vendor source fields. Storage keys use a
SHA-256 digest when Web Crypto is available. Other browser contexts use an
in-memory cache. The old owner-based entries are ignored and removed as the
corresponding certificates are used.

```ts
import { cookieKeyIdStorage, localStorageKeyIdStorage, memoryKeyIdStorage } from 'e-imzo-web'
createEImzoCore({ apiKeys, keyIdStorage: memoryKeyIdStorage() })
```

- Default cookies are scoped to the current host/session, with `SameSite=Lax`
  and `Secure` on HTTPS. The handle is accessible to page JavaScript; the
  browser also sends the cookie to the host.
- Prefer memory for shared workstations or apps where handles should stay out of
  persistent browser storage. At logout, discard the core and its memory
  adapter. With custom persistent storage, clear its namespace at logout.
- `localStorage` persists across browser restarts. Choose it only if your
  application's storage policy permits it.
- An unclassified vendor failure on a cached handle evicts it. The user's next
  signing action loads a fresh handle. Wrong PIN, cancellation, and known
  connectivity failures never trigger an automatic signing retry.

## Core without React

```ts
import { createEImzoCore } from 'e-imzo-web'
const core = createEImzoCore({ apiKeys })
await core.init()                       // loadScripts + install
const certs = await core.listCertificates()
const { pkcs7 } = await core.sign(certs[0], challenge)
```

## Troubleshooting and backend verification

- **`APP_NOT_RUNNING`**. Start the local E-IMZO app and retry initialization.
  Check the browser console for blocked script or loopback connections. For a
  CSP that disallows inline scripts, use manual loading with approved script
  sources. Test real signing in the browsers used by your team.
- **`OUTDATED_VERSION`**. Compare the installed app version with `minVersion`
  (defaults to 3.37). Confirm compatibility on your target OS and with your
  key type after updating.
- **`INVALID_API_KEY`**. Check that the page hostname matches its registered
  API key. The hosted demo uses mock mode without a key for that host.
- **Empty certificate list**. Insert the token or make the PFX available to
  E-IMZO, then refresh. `getCertStatus` checks the local validity window.
  The dedicated ID-card flow delegates certificate selection to E-IMZO.

Have the backend issue a short-lived, single-use challenge bound to the
session and action. Submit the PKCS#7 and verify the signature, signed bytes,
certificate trust chain, revocation status, and signer's authorization on the
server before accepting the login or document. Derive identity from the verified
certificate. Client certificate metadata, including date status, is for local UX.

## Development

```bash
npm ci
npm run check
```

CI and `npm publish` run type checks, tests, both builds and a check that installs
the generated tarball in a temporary React app. The check covers TypeScript and
runtime imports in ESM and CommonJS.

### Vendor updates and releases

The tracked copies of `vendor/e-imzo.js` and `vendor/e-imzo-client.js` date to
repository commit `6b1b7c8`. The base file includes Base64 2.1.4. The upstream
E-IMZO SDK version and redistribution terms for these copies still need
confirmation. The package's MIT license covers its own code.

`scripts/build-vendor.mjs` pins SHA-256 digests of the two scripts with LF line
endings. When updating, record the official source URL, version and permissions,
review the vendor diff, keep the bundled `API_KEYS` empty, and update the pins.
Run `npm run check` and test PFX and hardware signing with the target E-IMZO version.

Use SemVer and record user-facing changes in [CHANGELOG.md](CHANGELOG.md).
Ship incompatible changes in a major release with a migration note. When an
API can coexist with its replacement, document its deprecation before removing it.
