import { describe, expect, it } from 'vitest'

import { keyIdCacheKey, memoryKeyIdStorage } from '../src/core/keyIdStorage'

describe('keyIdCacheKey', () => {
  it('prefixes the id part', () => {
    expect(keyIdCacheKey('301234567')).toBe('keyId-301234567')
  })
})

describe('memoryKeyIdStorage', () => {
  it('round-trips set/get/remove', () => {
    const s = memoryKeyIdStorage()
    expect(s.get('k')).toBeNull()
    s.set('k', 'v')
    expect(s.get('k')).toBe('v')
    s.remove('k')
    expect(s.get('k')).toBeNull()
  })
})
