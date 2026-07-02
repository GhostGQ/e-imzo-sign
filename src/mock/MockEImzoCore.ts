import { EImzoError, type EImzoErrorCode } from '../core/errors'
import type { Certificate, IEImzoCore, SignResult } from '../core/types'

export interface MockEImzoOptions {
  /** Certificates returned by `listCertificates`. Defaults to a built-in pfx + ftjc pair. */
  certificates?: Certificate[]
  /** Simulated latency (ms) for async operations. Defaults to 300. */
  latencyMs?: number
  /** When set, sign/signWithUsbToken reject with an EImzoError of this code. */
  failWith?: EImzoErrorCode
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}

/** Two believable fixtures: a valid PFX cert and an expired FTJC token. */
export function defaultMockCertificates(): Certificate[] {
  return [
    {
      type: 'pfx',
      serialNumber: '5F1A2B3C4D5E6F70',
      CN: 'ANvarov Anvar Anvarovich',
      O: 'GARANT BANK',
      T: 'Director',
      TIN: '301234567',
      PINFL: '31234567890123',
      UID: '301234567',
      validFrom: daysFromNow(-30),
      validTo: daysFromNow(335),
      alias: 'cn=anvarov,serialnumber=5f1a2b3c4d5e6f70,inn=301234567',
      disk: 'D',
      path: '/certs',
      name: 'anvarov.pfx',
      raw: null,
    },
    {
      type: 'ftjc',
      serialNumber: 'AABBCCDDEEFF0011',
      CN: 'BEKOVA Dilnoza Bekovna',
      O: '',
      T: '',
      TIN: '412345678',
      PINFL: '42345678901234',
      UID: '412345678',
      validFrom: daysFromNow(-400),
      validTo: daysFromNow(-35), // expired — exercises status UI
      cardUID: 'CARD-0001',
      ownerName: 'BEKOVA Dilnoza Bekovna',
      statusInfo: 'active',
      raw: null,
    },
  ]
}

function b64(input: string): string {
  if (typeof btoa === 'function') return btoa(unescape(encodeURIComponent(input)))
  // Node/CI fallback without depending on @types/node.
  const B = (globalThis as { Buffer?: { from(s: string, enc: string): { toString(enc: string): string } } }).Buffer
  if (B) return B.from(input, 'utf8').toString('base64')
  return input
}

/**
 * In-memory {@link IEImzoCore} for local development, Storybook and CI. Needs no
 * E-IMZO desktop app, no WebSocket and no `window`.
 */
export class MockEImzoCore implements IEImzoCore {
  private readonly certificates: Certificate[]
  private readonly latencyMs: number
  private readonly failWith?: EImzoErrorCode

  constructor(options: MockEImzoOptions = {}) {
    this.certificates = options.certificates ?? defaultMockCertificates()
    this.latencyMs = options.latencyMs ?? 300
    this.failWith = options.failWith
  }

  private delay(): Promise<void> {
    return new Promise((r) => setTimeout(r, this.latencyMs))
  }

  async loadScripts(): Promise<void> {
    await this.delay()
  }

  async install(): Promise<{ major: number; minor: number }> {
    await this.delay()
    return { major: 4, minor: 0 }
  }

  async init(): Promise<{ major: number; minor: number }> {
    await this.loadScripts()
    return this.install()
  }

  async listCertificates(): Promise<Certificate[]> {
    await this.delay()
    return this.certificates
  }

  async sign(cert: Certificate, data: string): Promise<SignResult> {
    await this.delay()
    this.maybeFail()
    return { pkcs7: b64(`MOCK:${cert.serialNumber}:${data}:${Date.now()}`), cert }
  }

  async signWithUsbToken(data: string): Promise<SignResult> {
    await this.delay()
    this.maybeFail()
    return { pkcs7: b64(`MOCK:usb:${data}:${Date.now()}`) }
  }

  // Script signals are no-ops in the mock.
  markBaseScriptLoaded(): void {}
  markClientScriptLoaded(): void {}
  markScriptError(): void {}

  private maybeFail(): void {
    if (this.failWith) {
      throw new EImzoError(this.failWith, `Mock failure: ${this.failWith}`)
    }
  }
}
