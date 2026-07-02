// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { EImzoProvider } from '../src/react/EImzoProvider'
import { useEImzoCore } from '../src/react/context'
import { useEImzo } from '../src/react/useEImzo'
import { MockEImzoCore } from '../src/mock/MockEImzoCore'
import type { IEImzoCore } from '../src/core/types'

/** MockEImzoCore that counts install() calls, to assert init happens once per app. */
function countingCore(): { core: IEImzoCore; installs: () => number } {
  const inner = new MockEImzoCore({ latencyMs: 0 })
  let installs = 0
  const core: IEImzoCore = {
    loadScripts: () => inner.loadScripts(),
    install: () => {
      installs++
      return inner.install()
    },
    init: () => inner.init(),
    listCertificates: () => inner.listCertificates(),
    sign: (c, d) => inner.sign(c, d),
    signWithUsbToken: (d) => inner.signWithUsbToken(d),
    markBaseScriptLoaded: () => inner.markBaseScriptLoaded(),
    markClientScriptLoaded: () => inner.markClientScriptLoaded(),
    markScriptError: () => inner.markScriptError(),
  }
  return { core, installs: () => installs }
}

function CertCount() {
  const { status, certificates } = useEImzoCore()
  return <div data-testid="count">{status}:{certificates.length}</div>
}

describe('EImzoProvider', () => {
  it('mock mode: initializes once and shares certificates with all consumers', async () => {
    render(
      <EImzoProvider mock>
        <CertCount />
        <CertCount />
      </EImzoProvider>
    )

    await waitFor(() => {
      const nodes = screen.getAllByTestId('count')
      expect(nodes[0]!.textContent).toBe('ready:2')
    })
    // Both consumers see the same shared state.
    const nodes = screen.getAllByTestId('count')
    expect(nodes[1]!.textContent).toBe('ready:2')
  })

  it('runs a single shared init even with multiple consumers', async () => {
    const { core, installs } = countingCore()
    render(
      <EImzoProvider core={core}>
        <CertCount />
        <CertCount />
        <CertCount />
      </EImzoProvider>
    )
    await waitFor(() => {
      expect(screen.getAllByTestId('count')[0]!.textContent).toBe('ready:2')
    })
    expect(installs()).toBe(1)
  })

  it('useEImzo under a provider signs via the shared core', async () => {
    const onSuccess = vi.fn()
    function SignConsumer() {
      const e = useEImzo({ getChallenge: async () => 'chal-1', onSuccess })
      return (
        <div>
          <span data-testid="status">{e.status}</span>
          <button onClick={() => e.signIn(e.certificates[0])}>sign</button>
        </div>
      )
    }
    render(
      <EImzoProvider mock>
        <SignConsumer />
      </EImzoProvider>
    )
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ready'))
    screen.getByText('sign').click()
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    expect(onSuccess.mock.calls[0]![0].pkcs7).toBeTypeOf('string')
  })

  it('useEImzoCore throws outside a provider', () => {
    function Bad() {
      useEImzoCore()
      return null
    }
    // Silence the expected React error boundary logging.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Bad />)).toThrow(/EImzoProvider/)
    spy.mockRestore()
  })
})
