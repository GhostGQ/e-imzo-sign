import { useCallback, useEffect, useRef, useState } from 'react'

import { EImzoError, mapError } from '../core/errors'
import { getCertStatus as computeCertStatus, isCertExpired as computeIsExpired } from '../core/types'
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
  onScriptError: () => void
  getCertStatus: (cert: Certificate) => CertStatus
  isCertExpired: (cert: Certificate) => boolean
}

export interface UseEImzoLifecycleOptions {
  /** Run init() (loadScripts + install + list) once the core is available. Default true. */
  autoInit?: boolean
  /** Called with a typed error on init/enumeration failure. */
  onError?: (error: EImzoError) => void
}

export function useEImzoLifecycle(
  core: IEImzoCore | null,
  { autoInit = true, onError }: UseEImzoLifecycleOptions = {}
): EImzoLifecycle {
  const [status, setStatus] = useState<EImzoStatus>('idle')
  const [certificates, setCertificates] = useState<Certificate[]>([])
  const [selectedCert, setSelectedCert] = useState<Certificate | null>(null)
  const [error, setError] = useState<EImzoError | null>(null)

  // The core this instance has already initialized; changing core triggers re-init.
  const initedCoreRef = useRef<IEImzoCore | null>(null)
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  const reportError = useCallback((e: unknown, reason?: string | null): EImzoError => {
    const err = e instanceof EImzoError ? e : mapError(e, reason)
    setError(err)
    setStatus('error')
    onErrorRef.current?.(err)
    return err
  }, [])

  const refreshCertificates = useCallback(async () => {
    if (!core) return
    try {
      const list = await core.listCertificates()
      setCertificates(list)
      setSelectedCert((prev) =>
        prev && list.some((c) => c.serialNumber === prev.serialNumber) ? prev : list[0] ?? null
      )
    } catch (e) {
      reportError(e)
      throw e
    }
  }, [core, reportError])

  const initialize = useCallback(async () => {
    if (!core || initedCoreRef.current === core) return
    initedCoreRef.current = core
    try {
      setError(null)
      setStatus('loading_scripts')
      await core.loadScripts()
      setStatus('installing')
      await core.install()
      await refreshCertificates()
      setStatus('ready')
    } catch (e) {
      // Allow a retry after a failed init (e.g. app was not running yet).
      initedCoreRef.current = null
      if (!(e instanceof EImzoError)) reportError(e)
      else {
        setError(e)
        setStatus('error')
        onErrorRef.current?.(e)
      }
    }
  }, [core, refreshCertificates, reportError])

  useEffect(() => {
    if (core && autoInit) void initialize()
  }, [core, autoInit, initialize])

  const selectCert = useCallback((cert: Certificate) => setSelectedCert(cert), [])
  const selectCertBySerial = useCallback(
    (serialNumber: string) =>
      setSelectedCert((prev) => certificates.find((c) => c.serialNumber === serialNumber) ?? prev),
    [certificates]
  )

  const onBaseScriptLoad = useCallback(() => core?.markBaseScriptLoaded(), [core])
  const onClientScriptLoad = useCallback(() => core?.markClientScriptLoaded(), [core])
  const onScriptError = useCallback(() => {
    core?.markScriptError()
    reportError(new EImzoError('APP_NOT_RUNNING', 'Failed to load E-IMZO scripts.'))
  }, [core, reportError])

  return {
    core,
    status,
    certificates,
    selectedCert,
    error,
    initialize,
    refreshCertificates,
    selectCert,
    selectCertBySerial,
    onBaseScriptLoad,
    onClientScriptLoad,
    onScriptError,
    getCertStatus: (cert) => computeCertStatus(cert),
    isCertExpired: (cert) => computeIsExpired(cert),
  }
}
