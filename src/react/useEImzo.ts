import { useCallback, useMemo, useRef, useState } from 'react'

import { EImzoError, mapError } from '../core/errors'
import type { CertStatus, Certificate, IEImzoCore, SignResult } from '../core/types'
import { useEImzoContext } from './context'
import {
  useBrowserLayoutEffect,
  useEImzoLifecycle,
  type EImzoStatus,
  type UseEImzoLifecycleOptions,
} from './useEImzoLifecycle'

export type { EImzoStatus } from './useEImzoLifecycle'

export type SignOutcome =
  | { ok: true; result: SignResult }
  | { ok: false; error: EImzoError }

const signingCores = new WeakSet<IEImzoCore>()

export interface UseEImzoOptions {
  /** Fetches the exact text to sign. Pass the signal to the request to support cancellation. */
  getChallenge: (signal: AbortSignal) => Promise<string>
  /** Called with the signature result on success. */
  onSuccess?: (result: SignResult) => void
  /** Called with a typed error while the signing context is still active. */
  onError?: (error: EImzoError) => void
  /** Extra document payload merged with the challenge when `isOnlyChallenge` is false. */
  documentToSign?: Record<string, unknown>
  /** true (default): sign only the challenge (login). false: sign `{...documentToSign, challenge}`. */
  isOnlyChallenge?: boolean
  /**
   * Standalone core, for use WITHOUT `<EImzoProvider>`. When a provider is present it
   * is used and this is ignored. When absent, the hook manages this core's lifecycle.
   */
  core?: IEImzoCore
  /** Standalone-only: run init on mount. Default true. Ignored under a provider. */
  autoInit?: boolean
}

export interface UseEImzoReturn {
  status: EImzoStatus
  certificates: Certificate[]
  selectedCert: Certificate | null
  /** Latest error, whether from init (provider/standalone) or signing. */
  error: EImzoError | null

  isInstalling: boolean
  isLoadingChallenge: boolean
  isSigning: boolean
  isUsbTokenSigning: boolean

  initialize: () => Promise<void>
  refreshCertificates: () => Promise<void>
  selectCert: (cert: Certificate) => void
  selectCertBySerial: (serialNumber: string) => void

  /** Challenge-response with a file/token certificate (defaults to the selected cert). */
  signIn: (cert?: Certificate | null) => Promise<SignOutcome>
  /** Challenge-response via the USB-token / ID-card flow. */
  signWithUsbToken: () => Promise<SignOutcome>

  // Manual script-loading handlers for Next.js <Script> (standalone mode).
  onBaseScriptLoad: () => void
  onClientScriptLoad: () => void
  onScriptError: (error?: unknown) => void

  getCertStatus: (cert: Certificate) => CertStatus
  isCertExpired: (cert: Certificate) => boolean
}

export function useEImzo(options: UseEImzoOptions): UseEImzoReturn {
  const {
    getChallenge,
    onSuccess,
    onError,
    documentToSign,
    isOnlyChallenge = true,
    core: standaloneCore,
    autoInit = true,
  } = options

  const ctx = useEImzoContext()

  // Standalone lifecycle is active only when there is no provider AND a core was passed.
  // Hooks are always called (with a possibly-null core) to keep call order stable.
  const lifecycleOptions: UseEImzoLifecycleOptions = { autoInit, onError }
  const standalone = useEImzoLifecycle(ctx ? null : standaloneCore ?? null, lifecycleOptions)

  const lifecycle = ctx ?? standalone
  const core = lifecycle.core

  const selectedCert = lifecycle.selectedCert
  const scope = useMemo(() => ({
    active: true,
    operation: undefined as { controller: AbortController; selection?: Certificate | null } | undefined,
  }), [core])
  const [progress, setProgress] = useState<{
    scope: typeof scope
    kind: 'certificate' | 'usb'
    fetching: boolean
  } | null>(null)
  const [signError, setSignError] = useState<{ scope: typeof scope; error: EImzoError } | null>(null)
  const callbacks = useRef({ getChallenge, onSuccess, onError })

  useBrowserLayoutEffect(() => {
    callbacks.current = { getChallenge, onSuccess, onError }
  }, [getChallenge, onSuccess, onError])

  useBrowserLayoutEffect(() => {
    scope.active = true
    return () => {
      scope.active = false
      scope.operation?.controller.abort()
    }
  }, [scope])

  useBrowserLayoutEffect(() => {
    const operation = scope.operation
    if (operation && operation.selection !== undefined && operation.selection !== selectedCert) {
      operation.controller.abort()
    }
  }, [scope, selectedCert])

  const runChallengeFlow = useCallback(async (
    kind: 'certificate' | 'usb',
    target?: Certificate | null,
  ): Promise<SignOutcome> => {
    const cancelled = () => new EImzoError('USER_CANCELLED', 'The signing context changed.')
    const fail = (error: EImzoError): SignOutcome => {
      if (scope.active) {
        setSignError({ scope, error })
        callbacks.current.onError?.(error)
      }
      return { ok: false, error }
    }
    if (!scope.active) return { ok: false, error: cancelled() }
    if (!core) return fail(new EImzoError('UNKNOWN', 'Wrap in <EImzoProvider> or pass a core.'))
    if (signingCores.has(core)) {
      return fail(new EImzoError('SIGNING_IN_PROGRESS', 'A signing operation is already in progress.'))
    }
    if (kind === 'certificate' && !target) {
      return fail(new EImzoError('INVALID_CERTIFICATE', 'No certificate selected.'))
    }

    const controller = new AbortController()
    scope.operation = { controller, selection: kind === 'certificate' ? selectedCert : undefined }
    signingCores.add(core)
    setSignError(null)
    setProgress({ scope, kind, fetching: true })

    let result: SignResult
    try {
      const challenge = await callbacks.current.getChallenge(controller.signal)
      if (controller.signal.aborted) return { ok: false, error: cancelled() }
      if (typeof challenge !== 'string' || challenge.trim() === '') {
        throw new EImzoError('UNKNOWN', 'Challenge cannot be empty.')
      }
      const data = isOnlyChallenge ? challenge : JSON.stringify({ ...documentToSign, challenge })
      setProgress({ scope, kind, fetching: false })
      result = target ? await core.sign(target, data) : await core.signWithUsbToken(data)
    } catch (e) {
      if (controller.signal.aborted) return { ok: false, error: cancelled() }
      return fail(mapError(e))
    } finally {
      signingCores.delete(core)
      scope.operation = undefined
      if (scope.active) setProgress(null)
    }

    if (controller.signal.aborted) return { ok: false, error: cancelled() }
    setSignError(null)
    callbacks.current.onSuccess?.(result)
    return { ok: true, result }
  }, [core, scope, selectedCert, isOnlyChallenge, documentToSign])

  const signIn = useCallback(
    (cert?: Certificate | null) => runChallengeFlow('certificate', cert ?? selectedCert),
    [runChallengeFlow, selectedCert]
  )
  const signWithUsbToken = useCallback(() => runChallengeFlow('usb'), [runChallengeFlow])
  const currentProgress = progress?.scope === scope ? progress : null

  return {
    status: lifecycle.status,
    certificates: lifecycle.certificates,
    selectedCert: lifecycle.selectedCert,
    error: (signError?.scope === scope ? signError.error : null) ?? lifecycle.error,
    isInstalling: lifecycle.status === 'installing' || lifecycle.status === 'loading_scripts',
    isLoadingChallenge: currentProgress?.fetching ?? false,
    isSigning: currentProgress?.kind === 'certificate',
    isUsbTokenSigning: currentProgress?.kind === 'usb',
    initialize: lifecycle.initialize,
    refreshCertificates: lifecycle.refreshCertificates,
    selectCert: lifecycle.selectCert,
    selectCertBySerial: lifecycle.selectCertBySerial,
    signIn,
    signWithUsbToken,
    onBaseScriptLoad: lifecycle.onBaseScriptLoad,
    onClientScriptLoad: lifecycle.onClientScriptLoad,
    onScriptError: lifecycle.onScriptError,
    getCertStatus: lifecycle.getCertStatus,
    isCertExpired: lifecycle.isCertExpired,
  }
}
