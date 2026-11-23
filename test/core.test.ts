import { afterEach, describe, expect, it, vi } from 'vitest'

import { createEImzoCore } from '../src/core/EImzoCore'
import { keyIdCacheKey, memoryKeyIdStorage } from '../src/core/keyIdStorage'
import type { VendorEIMZOClient } from '../src/core/vendorGlobals'
import { defaultMockCertificates } from '../src/mock/MockEImzoCore'

function setup() {
  const cert = { ...defaultMockCertificates()[0]!, raw: {} }
  const keyIdStorage = memoryKeyIdStorage()
  const core = createEImzoCore({ apiKeys: {}, keyIdStorage })
  const loadKey = vi.fn<VendorEIMZOClient['loadKey']>()
    .mockImplementation((_raw, success) => success('key-' + loadKey.mock.calls.length))
  const createPkcs7 = vi.fn<VendorEIMZOClient['createPkcs7']>()
    .mockImplementation((id, _data, _timestamp, success) => success(id))
  vi.stubGlobal('EIMZOClient', { loadKey, createPkcs7 })
  return { cert, core, keyIdStorage, loadKey, createPkcs7 }
}

afterEach(() => vi.unstubAllGlobals())

describe('EImzoCore signing', () => {
  it('separates certificates with the same owner and discards the legacy key', async () => {
    const { cert, core, keyIdStorage, loadKey } = setup()
    const older = keyIdCacheKey(cert.TIN)
    keyIdStorage.set(older, 'ambiguous')
    const renewed = { ...cert, serialNumber: 'renewed', raw: {} }
    const token = { ...renewed, type: 'ftjc' as const, raw: {} }
    const otherFile = { ...cert, path: '/other', raw: {} }
    expect((await core.sign(cert, 'x')).pkcs7).toBe('key-1')
    expect((await core.sign(renewed, 'x')).pkcs7).toBe('key-2')
    expect((await core.sign(token, 'x')).pkcs7).toBe('key-3')
    expect((await core.sign(otherFile, 'x')).pkcs7).toBe('key-4')
    expect((await core.sign(cert, 'x')).pkcs7).toBe('key-1')
    expect(loadKey).toHaveBeenCalledTimes(4)
    expect(keyIdStorage.get(older)).toBeNull()
  })

  it('rejects expired, malformed and unsupported certificates before calling the vendor', async () => {
    const { cert, core, loadKey } = setup()
    for (const candidate of [
      { ...cert, validTo: new Date(0) },
      { ...cert, validFrom: new Date(NaN) },
      { ...cert, serialNumber: '' },
      { ...cert, raw: null },
      { ...cert, type: 'other' as typeof cert.type },
    ]) {
      await expect(core.sign(candidate, 'x')).rejects.toMatchObject({ code: 'INVALID_CERTIFICATE' })
    }
    expect(loadKey).not.toHaveBeenCalled()
  })

  it('evicts a failed cached id on an unidentified error and reloads on the next action', async () => {
    const { cert, core, loadKey, createPkcs7 } = setup()
    await core.sign(cert, 'x')
    createPkcs7.mockImplementationOnce((_id, _data, _ts, _ok, fail) => fail(null, 'unrecognized reason'))
    await expect(core.sign(cert, 'x')).rejects.toMatchObject({ code: 'UNKNOWN' })
    expect(loadKey).toHaveBeenCalledTimes(1)
    expect((await core.sign(cert, 'x')).pkcs7).toBe('key-2')
  })

  it.each(['BadPaddingException', 'Операция отменена'])('keeps the cached id after %s', async (reason) => {
    const { cert, core, loadKey, createPkcs7 } = setup()
    await core.sign(cert, 'x')
    createPkcs7.mockImplementationOnce((_id, _data, _ts, _ok, fail) => fail(null, reason))
    await expect(core.sign(cert, 'x')).rejects.toMatchObject({ reason })
    expect((await core.sign(cert, 'x')).pkcs7).toBe('key-1')
    expect(loadKey).toHaveBeenCalledTimes(1)
  })
})
