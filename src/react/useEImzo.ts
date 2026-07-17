import { useCallback, useRef, useState } from 'react'

import { EImzoError, mapError } from '../core/errors'
import type { CertStatus, Certificate, IEImzoCore, SignResult } from '../core/types'
import { useEImzoContext } from './context'
import {
  useEImzoLifecycle,
  type EImzoStatus,
  type UseEImzoLifecycleOptions,
} from './useEImzoLifecycle'

export type { EImzoStatus } from './useEImzoLifecycle'

export interface UseEImzoOptions {
  /** Consumer callback that fetches the server challenge to sign. */
  getChallenge: () => Promise<string>
  /** Called with the signature result on success. */
  onSuccess: (result: SignResult) => void
  /** Called with a typed error on any failure. No toasts/i18n are built in. */
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
  signIn: (cert?: Certificate | null) => Promise<void>
  /** Challenge-response via the USB-token / ID-card flow. */
  signWithUsbToken: () => Promise<void>

  // Manual script-loading handlers for Next.js <Script> (standalone mode).
  onBaseScriptLoad: () => void
  onClientScriptLoad: () => void
  onScriptError: () => void

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

  const [isLoadingChallenge, setIsLoadingChallenge] = useState(false)
  const [isSigning, setIsSigning] = useState(false)
  const [isUsbTokenSigning, setIsUsbTokenSigning] = useState(false)
  const [signError, setSignError] = useState<EImzoError | null>(null)

  const onSuccessRef = useRef(onSuccess)
  onSuccessRef.current = onSuccess
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError
  const getChallengeRef = useRef(getChallenge)
  getChallengeRef.current = getChallenge

  const reportSignError = useCallback((e: unknown): EImzoError => {
    const err = e instanceof EImzoError ? e : mapError(e)
    setSignError(err)
    onErrorRef.current?.(err)
    return err
  }, [])

  const buildDataToSign = useCallback(
    (challenge: string): string =>
      isOnlyChallenge ? challenge : JSON.stringify({ ...documentToSign, challenge }),
    [isOnlyChallenge, documentToSign]
  )

  const runChallengeFlow = useCallback(
    async (sign: (data: string) => Promise<SignResult>) => {
      setSignError(null)
      setIsLoadingChallenge(true)
      try {
        const challenge = await getChallengeRef.current()
        if (!challenge || challenge.trim() === '') {
          throw new EImzoError('UNKNOWN', 'Challenge cannot be empty.')
        }
        setIsLoadingChallenge(false)
        const result = await sign(buildDataToSign(challenge))
        onSuccessRef.current(result)
      } catch (e) {
        reportSignError(e)
      } finally {
        setIsLoadingChallenge(false)
      }
    },
    [buildDataToSign, reportSignError]
  )

  const signIn = useCallback(
    async (cert?: Certificate | null) => {
      if (!core) {
        reportSignError(new EImzoError('UNKNOWN', 'No E-IMZO core available. Wrap in <EImzoProvider> or pass `core`.'))
        return
      }
      const target = cert ?? lifecycle.selectedCert
      if (!target) {
        reportSignError(new EImzoError('UNKNOWN', 'No certificate selected.'))
        return
      }
      setIsSigning(true)
      try {
        await runChallengeFlow((data) => core.sign(target, data))
      } finally {
        setIsSigning(false)
      }
    },
    [core, lifecycle.selectedCert, runChallengeFlow, reportSignError]
  )

  const signWithUsbToken = useCallback(async () => {
    if (!core) {
      reportSignError(new EImzoError('UNKNOWN', 'No E-IMZO core available. Wrap in <EImzoProvider> or pass `core`.'))
      return
    }
    setIsUsbTokenSigning(true)
    try {
      await runChallengeFlow((data) => core.signWithUsbToken(data))
    } finally {
      setIsUsbTokenSigning(false)
    }
  }, [core, runChallengeFlow, reportSignError])

  return {
    status: lifecycle.status,
    certificates: lifecycle.certificates,
    selectedCert: lifecycle.selectedCert,
    error: signError ?? lifecycle.error,
    isInstalling: lifecycle.status === 'installing' || lifecycle.status === 'loading_scripts',
    isLoadingChallenge,
    isSigning,
    isUsbTokenSigning,
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
