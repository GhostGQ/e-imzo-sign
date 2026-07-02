import { useMemo, type ReactNode } from 'react'

import { createEImzoCore } from '../core/EImzoCore'
import { EImzoError } from '../core/errors'
import type { EImzoConfig, IEImzoCore } from '../core/types'
import { MockEImzoCore, type MockEImzoOptions } from '../mock/MockEImzoCore'
import { EImzoContext, type EImzoContextValue } from './context'
import { useEImzoLifecycle } from './useEImzoLifecycle'

export interface EImzoProviderProps {
  /** Real-core configuration (api keys, minVersion, usbTokenId, storage, script loading). */
  config?: EImzoConfig
  /**
   * Use the in-memory mock instead of the real core (dev/CI/Storybook). `true` for
   * defaults, or pass {@link MockEImzoOptions}. Takes precedence over `config`.
   */
  mock?: boolean | MockEImzoOptions
  /**
   * Explicit core instance. Highest precedence; use for custom implementations or to
   * keep the mock out of the production bundle (import it yourself only in dev).
   */
  core?: IEImzoCore
  /** Initialize once on mount (loadScripts + install + list). Default true. */
  autoInit?: boolean
  /** Called with a typed error on init/enumeration failure. */
  onError?: (error: EImzoError) => void
  children: ReactNode
}

/** Build a memo key from the serializable parts of the config/mode. */
function coreMemoKey(props: Pick<EImzoProviderProps, 'config' | 'mock'>): string {
  const { config, mock } = props
  return JSON.stringify({
    mock: mock === true ? { default: true } : mock || false,
    apiKeys: config?.apiKeys ?? null,
    minVersion: config?.minVersion ?? null,
    usbTokenId: config?.usbTokenId ?? null,
    scriptLoading: config?.scriptLoading ?? null,
  })
}

function resolveCore(props: EImzoProviderProps): IEImzoCore {
  if (props.core) return props.core
  if (props.mock) return new MockEImzoCore(props.mock === true ? undefined : props.mock)
  if (props.config) return createEImzoCore(props.config)
  throw new Error('EImzoProvider requires one of: `config`, `mock`, or `core`.')
}

/**
 * Provides a single, memoized E-IMZO core to the whole subtree and runs one shared
 * initialization. Wrap the part of your app that signs, then use `useEImzoCore()` or
 * `useEImzo()` in descendants — no need to pass a core around.
 *
 * The core is rebuilt only when `core`, `mock`, or the serializable `config` fields
 * change; `keyIdStorage` (a function) is treated as stable. Pass a stable config.
 */
export function EImzoProvider(props: EImzoProviderProps) {
  const { autoInit = true, onError, children } = props

  // Rebuild the core only when the mode/keys actually change, not on every render.
  const explicitCore = props.core
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const core = useMemo(() => resolveCore(props), [explicitCore, coreMemoKey(props)])

  const lifecycle = useEImzoLifecycle(core, { autoInit, onError })

  const value = useMemo<EImzoContextValue>(
    () => ({ ...lifecycle, core }),
    [lifecycle, core]
  )

  return <EImzoContext.Provider value={value}>{children}</EImzoContext.Provider>
}
