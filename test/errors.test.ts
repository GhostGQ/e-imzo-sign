import { describe, expect, it } from 'vitest'

import { EImzoError, mapError } from '../src/core/errors'

describe('mapError', () => {
  it('maps BadPaddingException reason to WRONG_PASSWORD', () => {
    const err = mapError(null, 'javax.crypto.BadPaddingException: pad block corrupted')
    expect(err.code).toBe('WRONG_PASSWORD')
    expect(err.reason).toContain('BadPaddingException')
  })

  it('maps a cancel reason to USER_CANCELLED', () => {
    expect(mapError(null, 'User cancelled the operation').code).toBe('USER_CANCELLED')
  })

  it('maps localized (ru/uz) cancellation reasons to USER_CANCELLED', () => {
    // Real reason strings E-IMZO returns depending on its UI language.
    expect(mapError(null, 'Операция отменена').code).toBe('USER_CANCELLED')
    expect(mapError(null, 'Amaliyot bekor qilindi').code).toBe('USER_CANCELLED')
  })

  it('maps a DOM Event with no reason to APP_NOT_RUNNING', () => {
    const fakeEvent = { isTrusted: true }
    expect(mapError(fakeEvent, null).code).toBe('APP_NOT_RUNNING')
  })

  it('honors a forced code when reason is generic', () => {
    expect(mapError(null, 'bad api key', 'INVALID_API_KEY').code).toBe('INVALID_API_KEY')
  })

  it('lets specific reason matches win over a forced code', () => {
    const err = mapError(null, 'BadPaddingException', 'INVALID_API_KEY')
    expect(err.code).toBe('WRONG_PASSWORD')
  })

  it('defaults to UNKNOWN and carries the raw reason', () => {
    const err = mapError(null, 'something odd happened')
    expect(err.code).toBe('UNKNOWN')
    expect(err.message).toBe('something odd happened')
  })

  it('passes through an existing EImzoError', () => {
    const original = new EImzoError('OUTDATED_VERSION', 'old')
    expect(mapError(original)).toBe(original)
  })

  it('instances survive instanceof', () => {
    expect(mapError(null, 'x') instanceof EImzoError).toBe(true)
    expect(mapError(null, 'x') instanceof Error).toBe(true)
  })
})
