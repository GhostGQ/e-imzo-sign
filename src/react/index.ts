export { useEImzo } from './useEImzo'
export type { SignOutcome, UseEImzoOptions, UseEImzoReturn } from './useEImzo'

export { EImzoProvider } from './EImzoProvider'
export type { EImzoProviderProps } from './EImzoProvider'
export { useEImzoCore, useEImzoContext } from './context'
export type { EImzoContextValue } from './context'
export { useEImzoLifecycle } from './useEImzoLifecycle'
export type { EImzoLifecycle, EImzoStatus, UseEImzoLifecycleOptions } from './useEImzoLifecycle'

// Re-export the factory, storage factories and key types so consumers can build a
// core and drive the hook from a single import path.
export { createEImzoCore, EImzoCore } from '../core/EImzoCore'
export { EImzoError } from '../core/errors'
export type { EImzoErrorCode } from '../core/errors'
export {
  cookieKeyIdStorage,
  localStorageKeyIdStorage,
  memoryKeyIdStorage,
} from '../core/keyIdStorage'
export { getCertStatus, isCertExpired } from '../core/types'
export type {
  ApiKeys,
  Certificate,
  CertStatus,
  EImzoConfig,
  IEImzoCore,
  KeyIdStorage,
  KeyType,
  ScriptLoading,
  SignResult,
} from '../core/types'
