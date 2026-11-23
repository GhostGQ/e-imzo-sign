export type EImzoErrorCode =
  /** E-IMZO desktop app / CAPIWS WebSocket is not reachable. */
  | 'APP_NOT_RUNNING'
  /** Wrong key password/PIN (vendor reason contains `BadPaddingException`). */
  | 'WRONG_PASSWORD'
  /** Installed E-IMZO version is below the configured minimum, or NEW_API unsupported. */
  | 'OUTDATED_VERSION'
  /** User dismissed the PIN / password dialog. */
  | 'USER_CANCELLED'
  /** API key registration failed. */
  | 'INVALID_API_KEY'
  | 'INVALID_CERTIFICATE'
  | 'SIGNING_IN_PROGRESS'
  /** Anything not matched above; inspect `reason` for the raw vendor message. */
  | 'UNKNOWN'

/**
 * Typed E-IMZO error. Carries a machine-readable {@link EImzoErrorCode} plus the
 * raw vendor `reason` string and original event/error for display or debugging.
 * The library performs NO i18n or toasting — map `code` to your own UX.
 */
export class EImzoError extends Error {
  readonly code: EImzoErrorCode
  readonly reason?: string | null
  readonly original?: unknown

  constructor(
    code: EImzoErrorCode,
    message: string,
    options?: { reason?: string | null; original?: unknown }
  ) {
    super(message)
    this.name = 'EImzoError'
    this.code = code
    this.reason = options?.reason
    this.original = options?.original
    // Restore prototype chain for instanceof across transpile targets.
    Object.setPrototypeOf(this, EImzoError.prototype)
  }
}

function looksLikeDomEvent(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'isTrusted' in (e as Record<string, unknown>)
  )
}

/**
 * Map a vendor `fail(event, reason)` callback pair into an {@link EImzoError}.
 * Mirrors the ad-hoc handling in the original rtm hook, generalized.
 *
 * @param forceCode Optional code supplied by the caller (e.g. install → INVALID_API_KEY,
 *   version check → OUTDATED_VERSION). Reason-based matches still take priority when
 *   they are more specific (BadPadding / cancel), so a mistyped password during install
 *   is still reported as WRONG_PASSWORD.
 */
export function mapError(
  e: unknown,
  reason?: string | null,
  forceCode?: EImzoErrorCode
): EImzoError {
  if (e instanceof EImzoError) return e

  const r = reason ?? (e instanceof Error ? e.message : null)

  if (r && /BadPaddingException/i.test(r)) {
    return new EImzoError('WRONG_PASSWORD', 'Wrong key password or PIN.', {
      reason: r,
      original: e,
    })
  }

  // E-IMZO localizes the cancellation reason: EN "cancel(led)", RU "Операция отменена",
  // UZ "Amaliyot bekor qilindi". Match the stems of all three.
  if (r && /cancel|отмен|bekor/i.test(r)) {
    return new EImzoError('USER_CANCELLED', 'Operation cancelled by user.', {
      reason: r,
      original: e,
    })
  }

  if (!r && looksLikeDomEvent(e)) {
    return new EImzoError('APP_NOT_RUNNING', 'E-IMZO application is not running.', {
      reason: r,
      original: e,
    })
  }

  if (forceCode || r === 'Please install new version of E-IMZO') {
    const code = forceCode ?? 'OUTDATED_VERSION'
    return new EImzoError(code, r ?? codeMessage(code), {
      reason: r,
      original: e,
    })
  }

  return new EImzoError('UNKNOWN', r ?? 'Unknown E-IMZO error.', {
    reason: r,
    original: e,
  })
}

function codeMessage(code: EImzoErrorCode): string {
  switch (code) {
    case 'APP_NOT_RUNNING':
      return 'E-IMZO application is not running.'
    case 'WRONG_PASSWORD':
      return 'Wrong key password or PIN.'
    case 'OUTDATED_VERSION':
      return 'Installed E-IMZO version is outdated.'
    case 'USER_CANCELLED':
      return 'Operation cancelled by user.'
    case 'INVALID_API_KEY':
      return 'E-IMZO API key registration failed.'
    default:
      return 'Unknown E-IMZO error.'
  }
}
