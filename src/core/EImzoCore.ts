import { EImzoError, mapError } from './errors'
import { cookieKeyIdStorage, keyIdCacheKey, memoryKeyIdStorage } from './keyIdStorage'
import { ScriptLoader } from './scriptLoader'
import { certificateIdentity, getCertStatus } from './types'
import type {
  ApiKeys,
  Certificate,
  EImzoConfig,
  IEImzoCore,
  KeyIdStorage,
  ScriptLoading,
  SignResult,
} from './types'
import { getEIMZOClient, type VendorVo } from './vendorGlobals'

const DEFAULT_USB_TOKEN_ID = 'ckc'
const DEFAULT_MIN_VERSION = { major: 3, minor: 37 }

/** Flatten the config ApiKeys into the vendor's flat `[domain, key, domain, key, ...]` form. */
export function flattenApiKeys(apiKeys: ApiKeys): string[] {
  const out: string[] = []
  if (Array.isArray(apiKeys)) {
    for (const { domain, key } of apiKeys) out.push(domain, key)
  } else {
    for (const domain of Object.keys(apiKeys)) out.push(domain, apiKeys[domain] as string)
  }
  return out
}

/** Normalize the vendor value object into a {@link Certificate}. */
function toCertificate(vo: VendorVo): Certificate {
  return {
    type: vo.type,
    serialNumber: vo.serialNumber,
    CN: vo.CN,
    O: vo.O,
    T: vo.T,
    TIN: vo.TIN,
    PINFL: vo.PINFL,
    UID: vo.UID,
    validFrom: vo.validFrom instanceof Date ? vo.validFrom : new Date(vo.validFrom as string),
    validTo: vo.validTo instanceof Date ? vo.validTo : new Date(vo.validTo as string),
    alias: vo.alias,
    disk: vo.disk,
    path: vo.path,
    name: vo.name,
    cardUID: vo.cardUID,
    ownerName: vo.ownerName,
    statusInfo: vo.statusInfo,
    raw: vo,
  }
}

/**
 * Framework-agnostic E-IMZO client. Wraps the vendor `EIMZOClient`/`CAPIWS` globals
 * with promises and typed errors. See {@link IEImzoCore}.
 */
export class EImzoCore implements IEImzoCore {
  private readonly apiKeys: ApiKeys
  private readonly minVersion: { major: number; minor: number }
  private readonly usbTokenId: string
  private readonly keyIdStorage: KeyIdStorage
  private readonly transientKeyIds = memoryKeyIdStorage()
  private readonly loader: ScriptLoader

  constructor(config: EImzoConfig) {
    this.apiKeys = config.apiKeys
    this.minVersion = config.minVersion ?? DEFAULT_MIN_VERSION
    this.usbTokenId = config.usbTokenId ?? DEFAULT_USB_TOKEN_ID
    this.keyIdStorage = config.keyIdStorage ?? cookieKeyIdStorage()
    const loading: ScriptLoading = config.scriptLoading ?? { mode: 'auto' }
    this.loader = new ScriptLoader(loading)
  }

  loadScripts(): Promise<void> {
    return this.loader.loadScripts()
  }

  markBaseScriptLoaded(): void {
    this.loader.markBaseScriptLoaded()
  }

  markClientScriptLoaded(): void {
    this.loader.markClientScriptLoaded()
  }

  markScriptError(e?: unknown): void {
    this.loader.markScriptError(e)
  }

  async install(): Promise<{ major: number; minor: number }> {
    const client = getEIMZOClient()
    const version = await new Promise<{ major: number; minor: number }>((resolve, reject) => {
      client.checkVersion(
        (major, minor) => resolve({ major: parseInt(major, 10), minor: parseInt(minor, 10) }),
        (e, r) => reject(mapError(e, r, 'OUTDATED_VERSION'))
      )
    })

    if (
      !Number.isFinite(version.major) || !Number.isFinite(version.minor) || !client.NEW_API ||
      version.major < this.minVersion.major ||
      (version.major === this.minVersion.major && version.minor < this.minVersion.minor)
    ) {
      throw new EImzoError(
        'OUTDATED_VERSION',
        `Installed E-IMZO version ${version.major}.${version.minor} is below the required ${this.minVersion.major}.${this.minVersion.minor}.`
      )
    }

    await new Promise<void>((resolve, reject) => {
      client.API_KEYS = flattenApiKeys(this.apiKeys)
      client.installApiKeys(
        () => resolve(),
        (e, r) => reject(mapError(e, r, 'INVALID_API_KEY'))
      )
    })

    return version
  }

  async init(): Promise<{ major: number; minor: number }> {
    await this.loadScripts()
    return this.install()
  }

  listCertificates(): Promise<Certificate[]> {
    const client = getEIMZOClient()
    return new Promise<Certificate[]>((resolve, reject) => {
      const certs: Certificate[] = []
      client.listAllUserKeys(
        (vo, index) => `${vo.serialNumber}-${index}`,
        (_itemId, vo) => {
          const cert = toCertificate(vo)
          certs.push(cert)
          return cert
        },
        () => resolve(certs),
        (e, r) => reject(mapError(e, r))
      )
    })
  }

  async sign(cert: Certificate, data: string): Promise<SignResult> {
    if (
      !cert?.serialNumber?.trim() ||
      (cert.type !== 'pfx' && cert.type !== 'ftjc') ||
      !cert.raw ||
      getCertStatus(cert) !== 'valid'
    ) {
      throw new EImzoError('INVALID_CERTIFICATE', 'An active PFX or FTJC certificate is required.')
    }

    const client = getEIMZOClient()
    const identity = certificateIdentity(cert)
    const subtle = globalThis.crypto?.subtle
    const storage = subtle ? this.keyIdStorage : this.transientKeyIds
    const hash = subtle && await subtle.digest('SHA-256', new TextEncoder().encode(identity))
    const idPart = hash
      ? Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')
      : identity
    const storeKey = keyIdCacheKey(`v2:${idPart}`)
    const legacyKey = keyIdCacheKey(cert.TIN || cert.PINFL || cert.serialNumber)
    if (this.keyIdStorage.get(legacyKey) !== null) this.keyIdStorage.remove(legacyKey)
    const cached = storage.get(storeKey)

    const createPkcs7 = (keyId: string): Promise<string> =>
      new Promise<string>((resolve, reject) => {
        client.createPkcs7(
          keyId,
          data,
          null,
          (pkcs7) => resolve(pkcs7),
          (e, r) => reject(mapError(e, r))
        )
      })

    if (cached) {
      try {
        const pkcs7 = await createPkcs7(cached)
        return { pkcs7, cert }
      } catch (err) {
        // shortcut: evict on unidentified signing failures, retry automatically only if the SDK exposes a stable stale-key error.
        if (err instanceof EImzoError && err.code === 'UNKNOWN') storage.remove(storeKey)
        throw err
      }
    }

    const keyId = await new Promise<string>((resolve, reject) => {
      client.loadKey(
        cert.raw,
        (id) => resolve(id),
        (e, r) => reject(mapError(e, r))
      )
    })

    const pkcs7 = await createPkcs7(keyId)
    storage.set(storeKey, keyId)
    return { pkcs7, cert }
  }

  async signWithUsbToken(data: string): Promise<SignResult> {
    const client = getEIMZOClient()
    return new Promise<SignResult>((resolve, reject) => {
      client.createPkcs7(
        this.usbTokenId,
        data,
        null,
        (pkcs7) => resolve({ pkcs7 }),
        (e, r) => reject(mapError(e, r))
      )
    })
  }
}

/** Convenience factory. Equivalent to `new EImzoCore(config)`. */
export function createEImzoCore(config: EImzoConfig): EImzoCore {
  return new EImzoCore(config)
}
