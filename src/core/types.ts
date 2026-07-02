/** The two E-IMZO key sources this library understands. */
export type KeyType = 'pfx' | 'ftjc'

/** Validity status of a certificate relative to "now". */
export type CertStatus = 'valid' | 'expired' | 'not_yet_valid'

/**
 * A normalized certificate/key entry. Superset of the fields E-IMZO returns for
 * both PFX (file) certificates and FTJC (hardware token) keys, plus parsed X.500
 * attributes. `raw` holds the original vendor value object so it can be passed
 * back to `EIMZOClient.loadKey` unchanged.
 */
export interface Certificate {
  type: KeyType
  serialNumber: string
  CN: string
  O: string
  T: string
  /** Taxpayer id (INN); falls back to UID when INN is absent. */
  TIN: string
  /** Personal identification number (PINFL), if present. */
  PINFL: string
  UID: string
  validFrom: Date
  validTo: Date

  // PFX-only
  alias?: string
  disk?: string
  path?: string
  name?: string

  // FTJC-only
  cardUID?: string
  ownerName?: string
  statusInfo?: string

  /** Original vendor value object, used to round-trip to loadKey. */
  raw: unknown
}

/** Result of a signing / challenge-response operation. */
export interface SignResult {
  /** Base64-encoded PKCS#7 signature (the vendor's `pkcs7_64`). */
  pkcs7: string
  /** The certificate used, when known (file/token signing; not USB-token flow). */
  cert?: Certificate
}

/**
 * Pluggable storage for cached E-IMZO key ids, keyed by a per-certificate string.
 * Implementations: {@link cookieKeyIdStorage} (default), {@link localStorageKeyIdStorage},
 * {@link memoryKeyIdStorage}.
 */
export interface KeyIdStorage {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
}

/**
 * API keys registered with E-IMZO. Either a `{ domain: key }` map or an array of
 * `{ domain, key }` pairs. Flattened to the vendor's flat array format internally.
 */
export type ApiKeys = Record<string, string> | Array<{ domain: string; key: string }>

/** How the vendor scripts are loaded into the page. */
export type ScriptLoading =
  | { mode: 'auto' }
  | { mode: 'manual' }

export interface EImzoConfig {
  /** API keys set onto `window.EIMZOClient.API_KEYS` before installApiKeys. */
  apiKeys: ApiKeys
  /**
   * Minimum acceptable E-IMZO version. Installed versions below this fail install
   * with an `OUTDATED_VERSION` error. Defaults to `{ major: 3, minor: 37 }`.
   */
  minVersion?: { major: number; minor: number }
  /**
   * E-IMZO id used for the USB-token / ID-card flow (no enumeration, no keyId cache).
   * Defaults to `'ckc'`.
   */
  usbTokenId?: string
  /** keyId cache. Defaults to {@link cookieKeyIdStorage}. */
  keyIdStorage?: KeyIdStorage
  /** Vendor script loading strategy. Defaults to `{ mode: 'auto' }`. */
  scriptLoading?: ScriptLoading
}

/**
 * Framework-agnostic E-IMZO surface, implemented by both `EImzoCore` (real) and
 * `MockEImzoCore`. Consumers can inject either into the React hook.
 */
export interface IEImzoCore {
  /** Ensure the vendor scripts are present (inject in auto mode; wait in manual mode). */
  loadScripts(): Promise<void>
  /** Check version + register API keys. Resolves with the installed version. */
  install(): Promise<{ major: number; minor: number }>
  /** Convenience: loadScripts() then install(). */
  init(): Promise<{ major: number; minor: number }>
  /** Enumerate available PFX certificates and FTJC token keys. */
  listCertificates(): Promise<Certificate[]>
  /** Sign `data` with a file/token certificate (uses keyId cache). */
  sign(cert: Certificate, data: string): Promise<SignResult>
  /** Sign `data` via the USB-token / ID-card flow (E-IMZO handles selection + PIN). */
  signWithUsbToken(data: string): Promise<SignResult>

  // Manual script-loading signals. No-ops in auto mode and in the mock.
  markBaseScriptLoaded(): void
  markClientScriptLoaded(): void
  markScriptError(e?: unknown): void
}

/** Compute a certificate's validity status relative to `now` (defaults to current time). */
export function getCertStatus(cert: Certificate, now: Date = new Date()): CertStatus {
  const t = now.getTime()
  if (t < cert.validFrom.getTime()) return 'not_yet_valid'
  if (t > cert.validTo.getTime()) return 'expired'
  return 'valid'
}

/** True when the certificate's `validTo` is in the past. */
export function isCertExpired(cert: Certificate, now: Date = new Date()): boolean {
  return now.getTime() > cert.validTo.getTime()
}
