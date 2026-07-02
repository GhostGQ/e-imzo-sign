import { describe, expect, it } from 'vitest'

import { EImzoError } from '../src/core/errors'
import { MockEImzoCore } from '../src/mock/MockEImzoCore'

describe('MockEImzoCore', () => {
  it('init + listCertificates + sign returns a pkcs7', async () => {
    const core = new MockEImzoCore({ latencyMs: 0 })
    await core.init()
    const certs = await core.listCertificates()
    expect(certs.length).toBeGreaterThan(0)
    const first = certs[0]!
    const res = await core.sign(first, 'challenge-123')
    expect(typeof res.pkcs7).toBe('string')
    expect(res.pkcs7.length).toBeGreaterThan(0)
    expect(res.cert).toBe(first)
  })

  it('signWithUsbToken returns a pkcs7 with no cert', async () => {
    const core = new MockEImzoCore({ latencyMs: 0 })
    const res = await core.signWithUsbToken('c')
    expect(res.cert).toBeUndefined()
    expect(res.pkcs7.length).toBeGreaterThan(0)
  })

  it('failWith makes signing reject with the given code', async () => {
    const core = new MockEImzoCore({ latencyMs: 0, failWith: 'WRONG_PASSWORD' })
    const certs = await core.listCertificates()
    await expect(core.sign(certs[0]!, 'x')).rejects.toMatchObject({ code: 'WRONG_PASSWORD' })
    await expect(core.sign(certs[0]!, 'x')).rejects.toBeInstanceOf(EImzoError)
  })

  it('ships an expired fixture for status UI', async () => {
    const core = new MockEImzoCore({ latencyMs: 0 })
    const certs = await core.listCertificates()
    expect(certs.some((c) => c.validTo.getTime() < Date.now())).toBe(true)
  })
})
