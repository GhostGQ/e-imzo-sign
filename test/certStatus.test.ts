import { describe, expect, it } from 'vitest'

import type { Certificate } from '../src/core/types'
import { getCertStatus, isCertExpired } from '../src/core/types'

function cert(from: Date, to: Date): Certificate {
  return {
    type: 'pfx',
    serialNumber: 'X',
    CN: '', O: '', T: '', TIN: '', PINFL: '', UID: '',
    validFrom: from,
    validTo: to,
    raw: null,
  }
}

const now = new Date('2026-07-02T00:00:00Z')
const day = 24 * 60 * 60 * 1000

describe('getCertStatus / isCertExpired', () => {
  it('valid when now is within the window', () => {
    const c = cert(new Date(now.getTime() - day), new Date(now.getTime() + day))
    expect(getCertStatus(c, now)).toBe('valid')
    expect(isCertExpired(c, now)).toBe(false)
  })

  it('expired when validTo is past', () => {
    const c = cert(new Date(now.getTime() - 2 * day), new Date(now.getTime() - day))
    expect(getCertStatus(c, now)).toBe('expired')
    expect(isCertExpired(c, now)).toBe(true)
  })

  it('not_yet_valid when validFrom is future', () => {
    const c = cert(new Date(now.getTime() + day), new Date(now.getTime() + 2 * day))
    expect(getCertStatus(c, now)).toBe('not_yet_valid')
    expect(isCertExpired(c, now)).toBe(false)
  })
})
