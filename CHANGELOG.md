# Changelog

## 1.0.0

### Changed

- React signing methods return a `SignOutcome` discriminated union. Callers
  that typed these methods as `Promise<void>` should update to
  `Promise<SignOutcome>`. Event handlers can continue using the optional
  callbacks and ignoring the returned outcome.
- `getChallenge` receives an `AbortSignal`. Existing zero-argument callbacks
  still work. Pass the signal to `fetch` to cancel work on navigation or
  selection changes.
- Exhaustive switches over `EImzoErrorCode` should handle
  `INVALID_CERTIFICATE` and `SIGNING_IN_PROGRESS`. Switches over
  `CertStatus` should handle `invalid`.
- The real core rejects missing or invalid certificate metadata and certificates
  outside their validity window before invoking E-IMZO. Refresh the selection
  when a certificate is replaced or removed.

### Fixed

- Isolated the key handle cache by certificate and source. Legacy owner-based
  entries are discarded on use. An unidentified cached-handle failure reloads
  the key on the next explicit signing action.
- Enabled retries after script loading fails and prevented stale initialization,
  certificate and signing results from updating the current React state.
- Blocked simultaneous certificate and USB signing flows for hooks sharing a core.
- Corrected CommonJS type exports and shared the same error class across the
  core, React, and mock entry points within each module format.

### Release checks

- CI and the publish hook verify the builds, regression tests, and imports from
  an installed npm tarball.
- Short-lived branches merge into `main` after **Package checks**. A matching
  stable version tag on `main` triggers npm publication via Trusted Publishing.
- Vendor script digests are pinned in the build. Upstream SDK licensing and
  redistribution terms still require confirmation.
