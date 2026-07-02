import { EImzoError, mapError } from './errors'
import { cookieKeyIdStorage, keyIdCacheKey } from './keyIdStorage'
import { ScriptLoader } from './scriptLoader'
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

/** Stable per-certificate id used to key the keyId cache (TIN, falling back to PINFL/serial). */
function cacheIdPart(cert: Certificate): string {
  return cert.TIN || cert.PINFL || cert.serialNumber
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
    client.API_KEYS = flattenApiKeys(this.apiKeys)

    const version = await new Promise<{ major: number; minor: number }>((resolve, reject) => {
      client.checkVersion(
        (major, minor) => resolve({ major: parseInt(major, 10), minor: parseInt(minor, 10) }),
        (e, r) => reject(mapError(e, r, 'OUTDATED_VERSION'))
      )
    })

    const installed = version.major * 100 + version.minor
    const required = this.minVersion.major * 100 + this.minVersion.minor
    if (installed < required || !client.NEW_API) {
      throw new EImzoError(
        'OUTDATED_VERSION',
        `Installed E-IMZO version ${version.major}.${version.minor} is below the required ${this.minVersion.major}.${this.minVersion.minor}.`
      )
    }

    await new Promise<void>((resolve, reject) => {
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
    const client = getEIMZOClient()
    const storeKey = keyIdCacheKey(cacheIdPart(cert))
    const cached = this.keyIdStorage.get(storeKey)

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
        this.keyIdStorage.set(storeKey, cached)
        return { pkcs7, cert }
      } catch (err) {
        // Stale/invalid cached keyId (e.g. wrong password against it): drop and re-load.
        this.keyIdStorage.remove(storeKey)
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
    this.keyIdStorage.set(storeKey, keyId)
    return { pkcs7, cert }
  }

  signWithUsbToken(data: string): Promise<SignResult> {
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
