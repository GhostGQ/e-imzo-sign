import { EImzoError } from './errors'
import type { ScriptLoading } from './types'
import { VENDOR_BASE, VENDOR_CLIENT } from './vendor'

const BASE_ID = 'eimzo-vendor-base'
const CLIENT_ID = 'eimzo-vendor-client'

function baseLoaded(): boolean {
  return typeof window !== 'undefined' && Boolean(window.CAPIWS && window.Base64)
}

/** Replace a tag whose script did not initialize, for example after a CSP failure. */
function injectInline(id: string, code: string): void {
  document.getElementById(id)?.remove()
  const el = document.createElement('script')
  el.id = id
  el.textContent = code
  document.head.appendChild(el)
}

export class ScriptLoader {
  private pending?: {
    promise: Promise<void>
    resolve: () => void
    reject: (error: EImzoError) => void
  }
  private manualError?: EImzoError

  constructor(private readonly loading: ScriptLoading) {}

  loadScripts(): Promise<void> {
    if (typeof window === 'undefined') {
      return Promise.reject(
        new EImzoError('APP_NOT_RUNNING', 'E-IMZO scripts require a browser environment.')
      )
    }

    if (this.pending) return this.pending.promise
    if (baseLoaded() && window.EIMZOClient) {
      this.manualError = undefined
      return Promise.resolve()
    }

    if (this.loading.mode === 'auto') {
      try {
        if (!baseLoaded()) injectInline(BASE_ID, VENDOR_BASE)
        if (baseLoaded() && !window.EIMZOClient) injectInline(CLIENT_ID, VENDOR_CLIENT)
        if (baseLoaded() && window.EIMZOClient) return Promise.resolve()
        throw new Error('Vendor globals are missing after script injection.')
      } catch (original) {
        return Promise.reject(
          new EImzoError('UNKNOWN', 'Failed to initialize E-IMZO vendor scripts.', { original })
        )
      }
    }

    if (this.manualError) {
      const error = this.manualError
      this.manualError = undefined
      return Promise.reject(error)
    }

    let resolve!: () => void
    let reject!: (error: EImzoError) => void
    const promise = new Promise<void>((res, rej) => {
      resolve = res
      reject = rej
    })
    this.pending = { promise, resolve, reject }
    return promise
  }

  markBaseScriptLoaded(): void {
    this.settleManual()
  }

  markClientScriptLoaded(): void {
    this.settleManual()
  }

  markScriptError(original?: unknown): void {
    if (this.loading.mode !== 'manual') return
    const error = new EImzoError('APP_NOT_RUNNING', 'Failed to load E-IMZO vendor scripts.', { original })
    const pending = this.pending
    this.pending = undefined
    if (pending) pending.reject(error)
    else this.manualError = error
  }

  private settleManual(): void {
    if (this.loading.mode !== 'manual' || !baseLoaded() || !window.EIMZOClient) return
    this.manualError = undefined
    const pending = this.pending
    this.pending = undefined
    pending?.resolve()
  }
}
