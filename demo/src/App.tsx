import { useMemo, useState } from 'react'

import { EImzoProvider, useEImzo, type EImzoErrorCode } from 'e-imzo-web/react'

type Scenario = 'success' | 'WRONG_PASSWORD' | 'USER_CANCELLED'

const SCENARIOS: { id: Scenario; label: string }[] = [
  { id: 'success', label: 'Success' },
  { id: 'WRONG_PASSWORD', label: 'Wrong password' },
  { id: 'USER_CANCELLED', label: 'User cancelled' },
]

export function App() {
  const [scenario, setScenario] = useState<Scenario>('success')
  const [latency, setLatency] = useState(500)

  // Rebuild the provider (fresh mock) when the scenario/latency changes.
  const mock = useMemo(
    () => ({
      latencyMs: latency,
      ...(scenario === 'success' ? {} : { failWith: scenario as EImzoErrorCode }),
    }),
    [scenario, latency]
  )

  return (
    <div className="page">
      <header className="hero">
        <div className="hero__badge">MOCK MODE · no E-IMZO app required</div>
        <h1>
          e-imzo-web <span className="hero__dim">live demo</span>
        </h1>
        <p className="hero__lead">
          This page uses the library's real React hooks (<code>EImzoProvider</code> +{' '}
          <code>useEImzo</code>) backed by the built-in <code>MockEImzoCore</code>. In a real app
          you swap the mock for <code>createEImzoCore(&#123; apiKeys &#125;)</code> and it talks to
          the E-IMZO desktop application.
        </p>
        <div className="hero__links">
          <a href="https://www.npmjs.com/package/e-imzo-web">npm</a>
          <span>·</span>
          <a href="#usage">Usage</a>
        </div>
      </header>

      <section className="controls">
        <div className="controls__group">
          <span className="controls__label">Scenario</span>
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

      {/* key forces a fresh provider + a fresh single init when the mock changes */}
      <EImzoProvider key={`${scenario}-${latency}`} mock={mock}>
        <Signer scenario={scenario} />
      </EImzoProvider>

      <Usage />

      <footer className="footer">
        <span>e-imzo-web · MIT</span>
        <span>Demo backend: MockEImzoCore</span>
      </footer>
    </div>
  )
}

function Signer({ scenario }: { scenario: Scenario }) {
  const [result, setResult] = useState<{ pkcs7: string; who?: string } | null>(null)

  const eimzo = useEImzo({
    // In a real app this fetches a one-time challenge from your backend.
    getChallenge: async () => {
      await new Promise((r) => setTimeout(r, 200))
      return `demo-challenge-${Math.random().toString(36).slice(2, 10)}`
    },
    onSuccess: (res) =>
      setResult({ pkcs7: res.pkcs7, who: res.cert ? `${res.cert.CN} · TIN ${res.cert.TIN}` : 'USB token' }),
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
            {eimzo.certificates.map((c) => {
              const status = eimzo.getCertStatus(c)
              const selected = eimzo.selectedCert?.serialNumber === c.serialNumber
              return (
                <li key={c.serialNumber}>
                  <button
                    className={selected ? 'cert is-selected' : 'cert'}
                    onClick={() => eimzo.selectCert(c)}
                    disabled={busy}
                  >
                    <span className="cert__radio" aria-hidden />
                    <span className="cert__main">
                      <span className="cert__cn">{c.CN}</span>
                      <span className="cert__meta">
                        {c.type.toUpperCase()} · TIN {c.TIN}
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
              disabled={busy || !eimzo.selectedCert}
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
          {scenario !== 'success' && (
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
            <span className="result__k">PKCS#7 (base64)</span>
            <code className="result__pkcs7">{result.pkcs7.slice(0, 64)}…</code>
          </div>
          <div className="result__row">
            <span className="result__k">Decoded (mock)</span>
            <code className="result__v">{safeAtob(result.pkcs7)}</code>
          </div>
        </div>
      )}
    </section>
  )
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge badge--${status}`}>{status.replace('_', ' ')}</span>
}

function StatusPill({ status }: { status: 'valid' | 'expired' | 'not_yet_valid' }) {
  const label = status === 'valid' ? 'valid' : status === 'expired' ? 'expired' : 'not yet valid'
  return <span className={`pill pill--${status}`}>{label}</span>
}

function safeAtob(b64: string): string {
  try {
    return atob(b64)
  } catch {
    return '(unavailable)'
  }
}

function Usage() {
  return (
    <section className="usage" id="usage">
      <h2>How this page is wired</h2>
      <pre>
        <code>{`import { EImzoProvider, useEImzo } from 'e-imzo-web/react'

// Demo backend — swap for config in production:
//   <EImzoProvider config={{ apiKeys: { 'yourdomain.uz': KEY } }}>
<EImzoProvider mock>
  <SignButton />
</EImzoProvider>

function SignButton() {
  const eimzo = useEImzo({
    getChallenge: async () => (await fetch('/api/challenge')).text(),
    onSuccess: ({ pkcs7, cert }) => sendToServer(pkcs7, cert),
    onError: (e) => showToast(e.code),
  })
  if (eimzo.status !== 'ready') return <Spinner />
  return <button onClick={() => eimzo.signIn()}>Sign in</button>
}`}</code>
      </pre>
    </section>
  )
}
