import { useEffect, useMemo, useState } from 'react'

import {
  EImzoProvider,
  createEImzoCore,
  useEImzo,
  useEImzoCore,
  type CertStatus,
  type EImzoErrorCode,
} from 'e-imzo-web/react'

// Public E-IMZO test API keys for localhost / 127.0.0.1 (shipped with the vendor
// scripts). Real mode works when you run this demo LOCALLY with the E-IMZO app
// installed. E-IMZO issues keys per-domain, so on a custom/hosted domain you must
// register a key for that domain in the E-IMZO developer portal and add it here —
// otherwise the demo gracefully falls back to the mock below.
const DEMO_API_KEYS = {
  localhost:
    '96D0C1491615C82B9A54D9989779DF825B690748224C2B04F500F370D51827CE2644D8D4A82C18184D73AB8530BB8ED537269603F61DB0D03D2104ABF789970B',
  '127.0.0.1':
    'A7BCFA5D490B351BE0754130DF03A068F855DB4333D43921125B9CF2670EF6A40370C646B90401955E1F7BC9CDBF59CE0B2C5467D820BE189C845D0B79CFC96F',
}

type Scenario = 'success' | 'WRONG_PASSWORD' | 'USER_CANCELLED'
// false = probing the real E-IMZO; 'auto' = fell back to mock; 'forced' = user chose the demo mock.
type Mode = false | 'auto' | 'forced'

const SCENARIOS: { id: Scenario; label: string }[] = [
  { id: 'success', label: 'Success' },
  { id: 'WRONG_PASSWORD', label: 'Wrong password' },
  { id: 'USER_CANCELLED', label: 'User cancelled' },
]

// E-IMZO validates its API key per page-origin. Only probe the real app on a domain
// we actually have a key for (localhost/127.0.0.1). On any other host (e.g. the hosted
// GitHub Pages demo) skip the pointless failing probe and start in mock mode directly.
const CAN_PROBE_REAL =
  typeof window !== 'undefined' &&
  Boolean((DEMO_API_KEYS as Record<string, string>)[window.location.hostname])

export function App() {
  const [mode, setMode] = useState<Mode>(CAN_PROBE_REAL ? false : 'auto')
  const [scenario, setScenario] = useState<Scenario>('success')
  const [latency, setLatency] = useState(500)

  const realCore = useMemo(() => createEImzoCore({ apiKeys: DEMO_API_KEYS }), [])
  const mockOpts = useMemo(
    () => ({
      latencyMs: latency,
      ...(scenario === 'success' ? {} : { failWith: scenario as EImzoErrorCode }),
    }),
    [scenario, latency]
  )

  const probingReal = mode === false

  return (
    <div className="page">
      <Hero />

      {!probingReal && (
        <MockControls
          scenario={scenario}
          setScenario={setScenario}
          latency={latency}
          setLatency={setLatency}
        />
      )}

      {probingReal ? (
        // Try the real E-IMZO first. Any init failure (app not running, no domain key,
        // outdated version) flips to the mock; so does a successful init with no certs.
        <EImzoProvider core={realCore} onError={() => setMode('auto')}>
          <RealGate onFallback={() => setMode('auto')} onSwitchToDemo={() => setMode('forced')} />
        </EImzoProvider>
      ) : (
        <>
          <ModeBanner mode={mode} canProbeReal={CAN_PROBE_REAL} onUseReal={() => setMode(false)} />
          <EImzoProvider key={`${scenario}-${latency}`} mock={mockOpts}>
            <Signer mode="mock" scenario={scenario} />
          </EImzoProvider>
        </>
      )}

      <Usage />
      <Footer />
    </div>
  )
}

/** Renders the real-E-IMZO flow, or asks the parent to fall back to the mock. */
function RealGate({
  onFallback,
  onSwitchToDemo,
}: {
  onFallback: () => void
  onSwitchToDemo: () => void
}) {
  const { status, certificates } = useEImzoCore()

  // E-IMZO is present but has no usable keys → the mock is more useful for a demo.
  useEffect(() => {
    if (status === 'ready' && certificates.length === 0) onFallback()
  }, [status, certificates.length, onFallback])

  if (status === 'error') return <Detecting note="No E-IMZO detected — switching to demo…" />
  if (status !== 'ready') return <Detecting note="Looking for E-IMZO on this device…" />

  return (
    <>
      <div className="banner banner--real">
        <span>
          🟢 Connected to your E-IMZO — these are <strong>your</strong> certificates. Signing
          prompts your real PIN / password.
        </span>
        <button className="linkbtn" onClick={onSwitchToDemo}>
          Switch to demo (mock)
        </button>
      </div>
      <Signer mode="real" />
    </>
  )
}

function ModeBanner({
  mode,
  canProbeReal,
  onUseReal,
}: {
  mode: 'auto' | 'forced'
  canProbeReal: boolean
  onUseReal: () => void
}) {
  const message =
    mode === 'forced'
      ? 'Demo (mock) mode — using fake certificates.'
      : canProbeReal
        ? 'E-IMZO not detected on this device — running on the built-in mock.'
        : 'This domain has no registered E-IMZO API key, so real signing is unavailable here — running the built-in mock demo. Run it on localhost with E-IMZO to use your real keys.'
  return (
    <div className="banner banner--mock">
      <span>{message}</span>
      {canProbeReal && (
        <button className="linkbtn" onClick={onUseReal}>
          Try my E-IMZO
        </button>
      )}
    </div>
  )
}

function Detecting({ note }: { note: string }) {
  return (
    <section className="card">
      <div className="detecting">
        <span className="spinner" aria-hidden />
        {note}
      </div>
    </section>
  )
}

function Signer({ mode, scenario }: { mode: 'real' | 'mock'; scenario?: Scenario }) {
  const [result, setResult] = useState<{ pkcs7: string; who?: string } | null>(null)

  const eimzo = useEImzo({
    // In a real app this fetches a one-time challenge from your backend.
    getChallenge: async () => {
      await new Promise((r) => setTimeout(r, 150))
      return `demo-challenge-${Math.random().toString(36).slice(2, 10)}`
    },
    onSuccess: (res) =>
      setResult({
        pkcs7: res.pkcs7,
        who: res.cert?.CN ?? 'USB token',
      }),
    onError: () => setResult(null),
  })

  const busy = eimzo.isLoadingChallenge || eimzo.isSigning || eimzo.isUsbTokenSigning

  return (
    <section className="card">
      <div className="card__head">
        <h2>Sign in</h2>
        <StatusBadge status={eimzo.status} />
      </div>

      {eimzo.status !== 'ready' && eimzo.status !== 'error' && (
        <p className="muted">Initializing (loadScripts → install → list certificates)…</p>
      )}

      {eimzo.status === 'ready' && (
        <>
          <p className="muted">Choose a certificate, then sign the server challenge.</p>
          <ul className="certs">
            {eimzo.certificates.map((c, index) => {
              const status = eimzo.getCertStatus(c)
              const selected = eimzo.selectedCert === c
              return (
                <li key={`${c.type}:${c.serialNumber}:${index}`}>
                  <button
                    className={selected ? 'cert is-selected' : 'cert'}
                    onClick={() => eimzo.selectCert(c)}
                    disabled={busy}
                  >
                    <span className="cert__radio" aria-hidden />
                    <span className="cert__main">
                      <span className="cert__cn">{c.CN}</span>
                      <span className="cert__meta">
                        {c.type.toUpperCase()}
                        {c.TIN ? ` · TIN ${c.TIN}` : ''}
                        {c.PINFL ? ` · PINFL ${c.PINFL}` : ''}
                      </span>
                    </span>
                    <StatusPill status={status} />
                  </button>
                </li>
              )
            })}
          </ul>

          <div className="actions">
            <button
              className="btn btn--primary"
              onClick={() => eimzo.signIn()}
              disabled={busy || !eimzo.selectedCert || eimzo.getCertStatus(eimzo.selectedCert) !== 'valid'}
            >
              {eimzo.isLoadingChallenge
                ? 'Fetching challenge…'
                : eimzo.isSigning
                  ? 'Signing…'
                  : 'Sign in with certificate'}
            </button>
            <button className="btn" onClick={() => eimzo.signWithUsbToken()} disabled={busy}>
              {eimzo.isUsbTokenSigning ? 'Signing…' : 'Sign with USB token'}
            </button>
          </div>
        </>
      )}

      {eimzo.error && (
        <div className="alert">
          <strong>{eimzo.error.code}</strong>
          <span>{eimzo.error.message}</span>
          {mode === 'mock' && scenario && scenario !== 'success' && (
            <em>Simulated by the mock (failWith: {scenario}).</em>
          )}
        </div>
      )}

      {result && (
        <div className="result">
          <div className="result__row">
            <span className="result__k">Signed by</span>
            <span className="result__v">{result.who}</span>
          </div>
          <div className="result__row">
            <span className="result__k">PKCS#7 (base64, {result.pkcs7.length} chars)</span>
            <code className="result__pkcs7">{result.pkcs7.slice(0, 64)}…</code>
          </div>
          {mode === 'mock' && (
            <div className="result__row">
              <span className="result__k">Decoded (mock payload)</span>
              <code className="result__v">{safeAtob(result.pkcs7)}</code>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function MockControls({
  scenario,
  setScenario,
  latency,
  setLatency,
}: {
  scenario: Scenario
  setScenario: (s: Scenario) => void
  latency: number
  setLatency: (n: number) => void
}) {
  return (
    <section className="controls">
      <div className="controls__group">
        <span className="controls__label">Mock scenario</span>
        <div className="segmented">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              className={s.id === scenario ? 'segmented__btn is-active' : 'segmented__btn'}
              onClick={() => setScenario(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="controls__group">
        <span className="controls__label">Latency {latency}ms</span>
        <input
          type="range"
          min={0}
          max={1500}
          step={100}
          value={latency}
          onChange={(e) => setLatency(Number(e.target.value))}
        />
      </div>
    </section>
  )
}

function Hero() {
  return (
    <header className="hero">
      <div className="hero__badge">auto-detects E-IMZO · falls back to mock</div>
      <h1>
        e-imzo-web <span className="hero__dim">live demo</span>
      </h1>
      <p className="hero__lead">
        This page uses the library's real React hooks (<code>EImzoProvider</code> +{' '}
        <code>useEImzo</code>). It first tries your local E-IMZO app — if it's installed with keys,
        you sign with <strong>your</strong> certificates; otherwise it runs on the built-in{' '}
        <code>MockEImzoCore</code>.
      </p>
      <div className="hero__links">
        <a href="https://www.npmjs.com/package/e-imzo-web">npm</a>
        <span>·</span>
        <a href="#usage">Usage</a>
      </div>
    </header>
  )
}

function Usage() {
  return (
    <section className="usage" id="usage">
      <h2>How this page is wired</h2>
      <pre>
        <code>{`import { EImzoProvider, createEImzoCore, useEImzoCore } from 'e-imzo-web/react'

// Try the real E-IMZO; on any init error, fall back to the mock.
const [mock, setMock] = useState(false)
const real = useMemo(() => createEImzoCore({ apiKeys }), [])

mock ? (
  <EImzoProvider mock><SignUI /></EImzoProvider>
) : (
  <EImzoProvider core={real} onError={() => setMock(true)}>
    <SignUI />   {/* if status is ready with 0 certs, also setMock(true) */}
  </EImzoProvider>
)`}</code>
      </pre>
    </section>
  )
}

function Footer() {
  return (
    <footer className="footer">
      <span>e-imzo-web · MIT</span>
      <span>Real E-IMZO when available, mock otherwise</span>
    </footer>
  )
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge badge--${status}`}>{status.replace('_', ' ')}</span>
}

function StatusPill({ status }: { status: CertStatus }) {
  const label = status === 'not_yet_valid' ? 'not yet valid' : status
  return <span className={`pill pill--${status}`}>{label}</span>
}

function safeAtob(b64: string): string {
  try {
    return atob(b64)
  } catch {
    return '(binary PKCS#7)'
  }
}
