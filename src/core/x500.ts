// Pure, prototype-free port of the X.500 DN parsing in vendor e-imzo-client.js
// (`String.prototype.splitKeep` + `_getX500Val`), plus the INN/PINFL OID mapping.
// EIMZOClient already parses most fields; this is used to normalize/validate DN
// strings (pfx `alias`, ftjc `info`) independently and in tests.

/** Split `s` on `splitter`, keeping the delimiter attached to the following chunk. */
function splitKeepAhead(s: string, splitter: RegExp): string[] {
  const result: string[] = []
  const matches: Array<{ value: string; index: number }> = []
  const re = new RegExp(splitter.source, splitter.flags.includes('g') ? splitter.flags : splitter.flags + 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(s)) !== null) {
    matches.push({ value: m[0], index: m.index })
    if (m.index === re.lastIndex) re.lastIndex++ // guard against zero-width matches
  }
  let lastIndex = 0
  for (const mm of matches) {
    const nextIndex = mm.index // "ahead": cut before the delimiter
    if (nextIndex !== lastIndex) {
      result.push(s.substring(lastIndex, nextIndex))
      lastIndex = nextIndex
    }
  }
  if (lastIndex < s.length) result.push(s.substring(lastIndex))
  return result
}

/** Extract the value of a single X.500 attribute `field` from a DN string. */
export function getX500Val(dn: string, field: string): string {
  const res = splitKeepAhead(dn, /,[A-Z]+=/g)
  for (let i = 0; i < res.length; i++) {
    const part = res[i] as string
    const prefix = (i > 0 ? ',' : '') + field + '='
    const n = part.search(prefix)
    if (n !== -1) {
      return part.slice(n + field.length + 1 + (i > 0 ? 1 : 0))
    }
  }
  return ''
}

/** Normalize the vendor OID attributes into readable names, uppercased. */
export function normalizeDn(dn: string): string {
  return dn
    .toUpperCase()
    .replace('1.2.860.3.16.1.1=', 'INN=')
    .replace('1.2.860.3.16.1.2=', 'PINFL=')
}

export interface ParsedX500 {
  serialNumber: string
  CN: string
  O: string
  T: string
  TIN: string
  PINFL: string
  UID: string
  validFrom: Date
  validTo: Date
}

/**
 * Parse an X.500 DN into certificate attributes. `dateStyle` controls how VALIDFROM/
 * VALIDTO are interpreted: pfx aliases use a `"YYYY.MM.DD HH:MM:SS"` form that the
 * vendor rewrites to ISO, while ftjc `info` uses a directly-parsable form.
 */
export function parseX500(dn: string, dateStyle: 'pfx' | 'ftjc' = 'pfx'): ParsedX500 {
  const norm = normalizeDn(dn)
  const inn = getX500Val(norm, 'INN')
  const uid = getX500Val(norm, 'UID')
  const rawFrom = getX500Val(norm, 'VALIDFROM')
  const rawTo = getX500Val(norm, 'VALIDTO')

  const toDate = (v: string): Date =>
    dateStyle === 'pfx'
      ? new Date(v.replace(/\./g, '-').replace(' ', 'T'))
      : new Date(v)

  return {
    serialNumber: getX500Val(norm, 'SERIALNUMBER'),
    CN: getX500Val(norm, 'CN'),
    O: getX500Val(norm, 'O'),
    T: getX500Val(norm, 'T'),
    TIN: inn || uid,
    PINFL: getX500Val(norm, 'PINFL'),
    UID: uid,
    validFrom: toDate(rawFrom),
    validTo: toDate(rawTo),
  }
}
