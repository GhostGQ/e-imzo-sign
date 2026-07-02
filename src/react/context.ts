import { createContext, useContext } from 'react'

import type { IEImzoCore } from '../core/types'
import type { EImzoLifecycle } from './useEImzoLifecycle'

/** Value exposed by {@link EImzoProvider}: the shared core plus its lifecycle state. */
export interface EImzoContextValue extends Omit<EImzoLifecycle, 'core'> {
  core: IEImzoCore
}

export const EImzoContext = createContext<EImzoContextValue | null>(null)

/** Read the provider's context, or `null` when outside a provider. */
export function useEImzoContext(): EImzoContextValue | null {
  return useContext(EImzoContext)
}

/**
 * Access the shared core and its lifecycle (status, certificates, selection, errors)
 * from anywhere under {@link EImzoProvider}. Throws if no provider is present.
 */
export function useEImzoCore(): EImzoContextValue {
  const ctx = useContext(EImzoContext)
  if (!ctx) {
    throw new Error('useEImzoCore must be used within an <EImzoProvider>.')
  }
  return ctx
}
