import { EImzoError } from './errors'

// Ambient-style typings for the vendor globals defined by e-imzo.js / e-imzo-client.js.
// Kept as a regular module (not a .d.ts) so it participates in the bundle's type graph.

/** Raw value object E-IMZO returns per certificate/token, passed back to loadKey. */
export interface VendorVo {
  type: 'pfx' | 'ftjc'
  serialNumber: string
  CN: string
  O: string
  T: string
  TIN: string
  PINFL: string
  UID: string
  validFrom: Date
  validTo: Date
  alias?: string
  disk?: string
  path?: string
  name?: string
  cardUID?: string
  ownerName?: string
  statusInfo?: string
  info?: string
  [key: string]: unknown
}

export interface VendorEIMZOClient {
  API_KEYS: string[]
  NEW_API: boolean
  checkVersion(
    success: (major: string, minor: string) => void,
    fail: (e: unknown, r: string | null) => void
  ): void
  installApiKeys(
    success: () => void,
    fail: (e: unknown, r: string | null) => void
  ): void
  listAllUserKeys(
    itemIdGen: (vo: VendorVo, index: string) => string,
    itemUiGen: (itemId: string, vo: VendorVo) => unknown,
    success: (items: unknown[], firstId: string | null) => void,
    fail: (e: unknown, r: string | null) => void
  ): void
  loadKey(
    itemObject: unknown,
    success: (id: string) => void,
    fail: (e: unknown, r: string | null) => void,
    verifyPassword?: boolean
  ): void
  createPkcs7(
    id: string,
    data: string,
    timestamper: unknown,
    success: (pkcs7: string) => void,
    fail: (e: unknown, r: string | null) => void
  ): void
}

declare global {
  // eslint-disable-next-line no-var
  var EIMZOClient: VendorEIMZOClient | undefined
  // eslint-disable-next-line no-var
  var CAPIWS: unknown
  // eslint-disable-next-line no-var
  var Base64: { encode(s: string): string; decode(s: string): string } | undefined

  interface Window {
    EIMZOClient?: VendorEIMZOClient
    CAPIWS?: unknown
    Base64?: { encode(s: string): string; decode(s: string): string }
  }
}

/** Access the EIMZOClient global, throwing a clear error if the script has not loaded. */
export function getEIMZOClient(): VendorEIMZOClient {
  const client =
    typeof window !== 'undefined' ? window.EIMZOClient : (globalThis as { EIMZOClient?: VendorEIMZOClient }).EIMZOClient
  if (!client) {
    throw new EImzoError(
      'APP_NOT_RUNNING',
      'EIMZOClient global is not available. Call loadScripts()/init() first, or load the vendor scripts.'
    )
  }
  return client
}
