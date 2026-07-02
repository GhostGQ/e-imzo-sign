import { describe, expect, it } from 'vitest'

import { getX500Val, normalizeDn, parseX500 } from '../src/core/x500'

// Representative pfx alias (as E-IMZO emits it, before normalization), using the raw OIDs.
const PFX_DN =
  'CN=ANVAROV ANVAR,SERIALNUMBER=5F1A2B3C,O=GARANT BANK,T=DIRECTOR,' +
  'UID=301234567,1.2.860.3.16.1.1=301234567,1.2.860.3.16.1.2=31234567890123,' +
  'VALIDFROM=2024.01.15 09:00:00,VALIDTO=2026.01.15 09:00:00'

describe('normalizeDn', () => {
  it('maps INN/PINFL OIDs and uppercases', () => {
    const n = normalizeDn(PFX_DN)
    expect(n).toContain('INN=301234567')
    expect(n).toContain('PINFL=31234567890123')
    expect(n).not.toContain('1.2.860.3.16.1.1')
  })
})

describe('getX500Val', () => {
  it('extracts individual attributes', () => {
    const n = normalizeDn(PFX_DN)
    expect(getX500Val(n, 'CN')).toBe('ANVAROV ANVAR')
    expect(getX500Val(n, 'SERIALNUMBER')).toBe('5F1A2B3C')
    expect(getX500Val(n, 'O')).toBe('GARANT BANK')
    expect(getX500Val(n, 'PINFL')).toBe('31234567890123')
  })

  it('returns empty string for missing attributes', () => {
    expect(getX500Val(normalizeDn(PFX_DN), 'NOSUCH')).toBe('')
  })
})

describe('parseX500', () => {
  it('parses a pfx alias including INN as TIN and ISO dates', () => {
    const c = parseX500(PFX_DN, 'pfx')
    expect(c.TIN).toBe('301234567')
    expect(c.PINFL).toBe('31234567890123')
    expect(c.CN).toBe('ANVAROV ANVAR')
    expect(c.validFrom.getFullYear()).toBe(2024)
    expect(c.validTo.getFullYear()).toBe(2026)
    expect(Number.isNaN(c.validTo.getTime())).toBe(false)
  })

  it('falls back to UID for TIN when INN absent', () => {
    const dn = 'CN=X,UID=999888777,VALIDFROM=2024.01.01 00:00:00,VALIDTO=2025.01.01 00:00:00'
    expect(parseX500(dn, 'pfx').TIN).toBe('999888777')
  })
})
