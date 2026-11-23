import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { EImzoError, mapError } from '../core/errors'
import {
  certificateIdentity,
  getCertStatus as computeCertStatus,
  isCertExpired as computeIsExpired,
} from '../core/types'
import type { CertStatus, Certificate, IEImzoCore } from '../core/types'

export type EImzoStatus = 'idle' | 'loading_scripts' | 'installing' | 'ready' | 'error'

/**
 * App-wide E-IMZO lifecycle: script loading, install, certificate enumeration and
 * selection. Shared by {@link EImzoProvider} (one init per app) and by `useEImzo`'s
 * standalone path. Pass `core: null` to keep it inert (no init, no-op actions).
 */
export interface EImzoLifecycle {
  core: IEImzoCore | null
  status: EImzoStatus
  certificates: Certificate[]
  selectedCert: Certificate | null
  error: EImzoError | null
  initialize: () => Promise<void>
  refreshCertificates: () => Promise<void>
  selectCert: (cert: Certificate) => void
  selectCertBySerial: (serialNumber: string) => void
  onBaseScriptLoad: () => void
  onClientScriptLoad: () => void
  onScriptError: (error?: unknown) => void
  getCertStatus: (cert: Certificate) => CertStatus
  isCertExpired: (cert: Certificate) => boolean
}

export interface UseEImzoLifecycleOptions {
  /** Run init() (loadScripts + install + list) once the core is available. Default true. */
  autoInit?: boolean
  /** Called with a typed error on init/enumeration failure. */
  onError?: (error: EImzoError) => void
}

const emptyState = {
  status: 'idle' as EImzoStatus,
  certificates: [] as Certificate[],
  selectedCert: null as Certificate | null,
  error: null as EImzoError | null,
}

export const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

export function useEImzoLifecycle(
  core: IEImzoCore | null,
  { autoInit = true, onError }: UseEImzoLifecycleOptions = {}
): EImzoLifecycle {
  const scope = useMemo(() => ({
    active: true,
    initialized: false,
    initialization: undefined as Promise<void> | undefined,
    refresh: undefined as Promise<void> | undefined,
  }), [core])
  const [state, setState] = useState({ scope, ...emptyState })
  const current = state.scope === scope ? state : emptyState
  const onErrorRef = useRef(onError)

  useBrowserLayoutEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  useBrowserLayoutEffect(() => {
    scope.active = true
    return () => { scope.active = false }
  }, [scope])

  const update = useCallback((patch: (previous: typeof emptyState) => Partial<typeof emptyState>) => {
    if (scope.active) {
      setState((previous) => {
        const oldState = previous.scope === scope ? previous : emptyState
        return { ...oldState, ...patch(oldState), scope }
      })
    }
  }, [scope])

  const reportError = useCallback((e: unknown): EImzoError => {
    const error = mapError(e)
    if (scope.active) {
      update(() => ({ error, status: 'error' }))
      onErrorRef.current?.(error)
    }
    return error
  }, [scope, update])

  const applyCertificates = useCallback((certificates: Certificate[]) => {
    update(({ selectedCert }) => ({
      certificates,
      selectedCert: selectedCert
        ? certificates.find((cert) => certificateIdentity(cert) === certificateIdentity(selectedCert)) ?? null
        : certificates[0] ?? null,
      error: null,
      status: 'ready',
    }))
  }, [update])

  const initialize = useCallback((): Promise<void> => {
    if (!core || !scope.active || scope.initialized) return Promise.resolve()
    if (scope.initialization) return scope.initialization

    update(() => ({ status: 'loading_scripts', error: null }))
    scope.initialization = Promise.resolve().then(async () => {
      if (!scope.active) return
      await core.loadScripts()
      if (!scope.active) return
      update(() => ({ status: 'installing' }))
      await core.install()
      if (!scope.active) return
      const list = await core.listCertificates()
      if (!scope.active) return
      scope.initialized = true
      applyCertificates(list)
    }).catch((error: unknown) => {
      reportError(error)
    }).finally(() => {
      scope.initialization = undefined
    })
    return scope.initialization
  }, [core, scope, update, applyCertificates, reportError])

  const refreshCertificates = useCallback(async () => {
    if (!core || !scope.active) return
    if (scope.initialization) return scope.initialization
    if (!scope.initialized) return initialize()
    scope.refresh ??= Promise.resolve().then(async () => {
      if (scope.active) applyCertificates(await core.listCertificates())
    }).catch((e: unknown) => {
      if (scope.active) throw reportError(e)
    }).finally(() => {
      scope.refresh = undefined
    })
    return scope.refresh
  }, [core, scope, initialize, applyCertificates, reportError])

  useEffect(() => {
    if (autoInit) void initialize()
  }, [autoInit, initialize])

  const selectCert = useCallback((selectedCert: Certificate) => update(() => ({ selectedCert })), [update])
  const selectCertBySerial = useCallback((serialNumber: string) => {
    update(({ certificates, selectedCert }) => ({
      selectedCert: certificates.find((cert) => cert.serialNumber === serialNumber) ?? selectedCert,
    }))
  }, [update])

  const onBaseScriptLoad = useCallback(() => {
    if (scope.active) core?.markBaseScriptLoaded()
  }, [core, scope])
  const onClientScriptLoad = useCallback(() => {
    if (scope.active) core?.markClientScriptLoaded()
  }, [core, scope])
  const onScriptError = useCallback((error?: unknown) => {
    if (scope.active) core?.markScriptError(error)
  }, [core, scope])

  return {
    core,
    status: current.status,
    certificates: current.certificates,
    selectedCert: current.selectedCert,
    error: current.error,
    initialize,
    refreshCertificates,
    selectCert,
    selectCertBySerial,
    onBaseScriptLoad,
    onClientScriptLoad,
    onScriptError,
    getCertStatus: computeCertStatus,
    isCertExpired: computeIsExpired,
  }
}
