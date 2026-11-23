// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { StrictMode, type ReactNode } from 'react'
import { expect, it, vi } from 'vitest'

import { EImzoError } from '../src/core/errors'
import { MockEImzoCore, defaultMockCertificates } from '../src/mock/MockEImzoCore'
import { useEImzo } from '../src/react/useEImzo'
import { useEImzoLifecycle } from '../src/react/useEImzoLifecycle'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

function strict({ children }: { children: ReactNode }) {
  return <StrictMode>{children}</StrictMode>
}

it('deduplicates StrictMode init and ignores a replaced core during install', async () => {
  const first = new MockEImzoCore({ latencyMs: 0 })
  const install = deferred<{ major: number; minor: number }>()
  const firstInstall = vi.spyOn(first, 'install').mockReturnValue(install.promise)
  const firstList = vi.spyOn(first, 'listCertificates')
  const second = new MockEImzoCore({ latencyMs: 0, certificates: [] })
  const secondInstall = vi.spyOn(second, 'install')
  const { result, rerender } = renderHook(({ core }) => useEImzoLifecycle(core), {
    initialProps: { core: first },
    wrapper: strict,
  })

  await waitFor(() => expect(firstInstall).toHaveBeenCalledTimes(1))
  rerender({ core: second })
  await waitFor(() => expect(result.current.status).toBe('ready'))
  await act(async () => install.resolve({ major: 4, minor: 0 }))
  expect(secondInstall).toHaveBeenCalledTimes(1)
  expect(firstList).not.toHaveBeenCalled()
  expect(result.current.certificates).toEqual([])
})

it('reports initialization errors once, retries and updates the selected certificate on refresh', async () => {
  const cert = defaultMockCertificates()[0]!
  const core = new MockEImzoCore({ latencyMs: 0, certificates: [cert] })
  const error = new EImzoError('UNKNOWN', 'temporary list failure')
  const onError = vi.fn()
  const list = vi.spyOn(core, 'listCertificates').mockRejectedValueOnce(error)
  const { result } = renderHook(() => useEImzoLifecycle(core, { onError }))

  await waitFor(() => expect(result.current.status).toBe('error'))
  expect(onError).toHaveBeenCalledTimes(1)
  await act(async () => { await result.current.initialize() })
  expect(result.current.selectedCert).toBe(cert)
  const updated = { ...cert, raw: { updated: true } }
  list.mockResolvedValueOnce([updated])
  await act(async () => { await result.current.refreshCertificates() })
  expect(result.current.selectedCert).toBe(updated)

  list.mockResolvedValueOnce([{ ...updated, serialNumber: 'different' }])
  await act(async () => { await result.current.refreshCertificates() })
  expect(result.current.selectedCert).toBeNull()
})

it('returns a signing result and blocks parallel certificate and USB signing across hooks', async () => {
  const core = new MockEImzoCore({ latencyMs: 0 })
  const challenge = deferred<string>()
  const getChallenge = vi.fn(() => challenge.promise)
  const sign = vi.spyOn(core, 'sign')
  const usb = vi.spyOn(core, 'signWithUsbToken')
  const cert = defaultMockCertificates()[0]!
  const { result } = renderHook(() => ({
    first: useEImzo({ core, autoInit: false, getChallenge }),
    second: useEImzo({ core, autoInit: false, getChallenge }),
  }))

  await act(async () => {
    const pending = result.current.first.signIn(cert)
    await expect(result.current.second.signWithUsbToken()).resolves.toMatchObject({
      ok: false, error: { code: 'SIGNING_IN_PROGRESS' },
    })
    challenge.resolve('  Кириллица 🚀  ')
    await expect(pending).resolves.toMatchObject({ ok: true, result: { cert } })
  })
  expect(getChallenge).toHaveBeenCalledTimes(1)
  expect(sign).toHaveBeenCalledWith(cert, '  Кириллица 🚀  ')
  expect(usb).not.toHaveBeenCalled()
  expect(result.current.first.isSigning).toBe(false)
})

it('returns a typed failure and notifies onError once', async () => {
  const core = new MockEImzoCore({ latencyMs: 0, failWith: 'WRONG_PASSWORD' })
  const onError = vi.fn()
  const { result } = renderHook(() => useEImzo({
    core, autoInit: false, getChallenge: async () => 'challenge', onError,
  }))
  await act(async () => {
    const outcome = await result.current.signWithUsbToken()
    expect(outcome).toMatchObject({ ok: false, error: { code: 'WRONG_PASSWORD' } })
    expect(onError).toHaveBeenCalledTimes(1)
  })
})

it('aborts the challenge and skips signing after selection changes', async () => {
  const core = new MockEImzoCore({ latencyMs: 0 })
  const challenge = deferred<string>()
  const getChallenge = vi.fn((_signal: AbortSignal) => challenge.promise)
  const onSuccess = vi.fn()
  const onError = vi.fn()
  const sign = vi.spyOn(core, 'sign')
  const { result } = renderHook(() => useEImzo({ core, getChallenge, onSuccess, onError }))
  await waitFor(() => expect(result.current.status).toBe('ready'))

  let pending!: ReturnType<typeof result.current.signIn>
  act(() => { pending = result.current.signIn() })
  act(() => result.current.selectCert(result.current.certificates[1]!))
  expect(getChallenge.mock.calls[0]?.[0].aborted).toBe(true)
  await act(async () => {
    challenge.resolve('challenge')
    await expect(pending).resolves.toMatchObject({ ok: false, error: { code: 'USER_CANCELLED' } })
  })
  expect(sign).not.toHaveBeenCalled()
  expect(onSuccess).not.toHaveBeenCalled()
  expect(onError).not.toHaveBeenCalled()
})

it('ignores completed vendor signatures after unmount', async () => {
  const core = new MockEImzoCore({ latencyMs: 0 })
  const signature = deferred<{ pkcs7: string }>()
  const sign = vi.spyOn(core, 'signWithUsbToken').mockReturnValue(signature.promise)
  const onSuccess = vi.fn()
  const onError = vi.fn()
  const { result, unmount } = renderHook(() => useEImzo({
    core, autoInit: false, getChallenge: async () => 'challenge', onSuccess, onError,
  }))
  let pending!: ReturnType<typeof result.current.signWithUsbToken>
  await act(async () => { pending = result.current.signWithUsbToken() })
  expect(sign).toHaveBeenCalledTimes(1)
  unmount()
  signature.resolve({ pkcs7: 'signature' })
  await expect(pending).resolves.toMatchObject({ ok: false, error: { code: 'USER_CANCELLED' } })
  expect(onSuccess).not.toHaveBeenCalled()
  expect(onError).not.toHaveBeenCalled()
})
