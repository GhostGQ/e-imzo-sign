import { EImzoError } from './errors'
import type { ScriptLoading } from './types'
import { VENDOR_BASE, VENDOR_CLIENT } from './vendor'

const BASE_ID = 'eimzo-vendor-base'
const CLIENT_ID = 'eimzo-vendor-client'

function eimzoLoaded(): boolean {
  return typeof window !== 'undefined' && typeof window.EIMZOClient !== 'undefined'
}

/** Inject a vendor script inline (self-contained; no network request). */
function injectInline(id: string, code: string): void {
  if (document.getElementById(id)) return
  const el = document.createElement('script')
  el.id = id
  el.type = 'text/javascript'
  el.textContent = code
  document.head.appendChild(el)
}

/**
 * Loads (or waits for) the vendor E-IMZO scripts.
 *
 * - `auto`: inline-injects the bundled vendor JS and resolves once `window.EIMZOClient`
 *   is available. Resolves immediately if it already exists (SPA remount).
 * - `manual`: resolves once both `markBaseScriptLoaded()` and `markClientScriptLoaded()`
 *   have fired (or if `window.EIMZOClient` already exists). `markScriptError()` rejects.
 */
export class ScriptLoader {
  private readonly mode: ScriptLoading['mode']
  private baseLoaded = false
  private clientLoaded = false
  private promise: Promise<void> | null = null
  private resolve?: () => void
  private reject?: (e: unknown) => void

  constructor(loading: ScriptLoading) {
    this.mode = loading.mode
  }

  loadScripts(): Promise<void> {
    if (this.promise) return this.promise

    if (typeof window === 'undefined') {
      return Promise.reject(
        new EImzoError('APP_NOT_RUNNING', 'E-IMZO scripts require a browser environment.')
      )
    }

    if (eimzoLoaded()) return Promise.resolve()

    this.promise = new Promise<void>((resolve, reject) => {
      this.resolve = resolve
      this.reject = reject
    })

    if (this.mode === 'auto') {
      try {
        injectInline(BASE_ID, VENDOR_BASE)
        injectInline(CLIENT_ID, VENDOR_CLIENT)
        // Inline scripts execute synchronously on append; EIMZOClient should exist now.
        if (eimzoLoaded()) {
          this.resolve?.()
        } else {
          this.reject?.(
            new EImzoError('UNKNOWN', 'Vendor scripts injected but EIMZOClient did not initialize.')
          )
        }
      } catch (e) {
        this.reject?.(new EImzoError('UNKNOWN', 'Failed to inject E-IMZO vendor scripts.', { original: e }))
      }
    }
    // manual mode: stays pending until the mark* signals arrive.

    return this.promise
  }

  markBaseScriptLoaded(): void {
    this.baseLoaded = true
    this.settleManual()
  }

  markClientScriptLoaded(): void {
    this.clientLoaded = true
    this.settleManual()
  }

  markScriptError(e?: unknown): void {
    this.reject?.(
      new EImzoError('APP_NOT_RUNNING', 'Failed to load E-IMZO vendor scripts.', { original: e })
    )
  }

  private settleManual(): void {
    if (this.mode !== 'manual') return
    if ((this.baseLoaded && this.clientLoaded) || eimzoLoaded()) {
      this.resolve?.()
    }
  }
}
